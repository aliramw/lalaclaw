import type {
  ChatMessage,
  ChatScrollState,
  ChatTab,
  ChatTabMeta,
  ConversationPendingMap,
  SessionFile,
  SessionFileRewrite,
} from "@/types/chat";
import type { AppSession } from "@/types/runtime";
import { createBaseSession } from "@/features/app/state";
import { createAgentTabId, createConversationKey, defaultSessionUser } from "@/features/app/state/app-session-identity";
import { resolveRuntimePendingEntry } from "@/features/chat/state/chat-runtime-pending";
import { deriveLegacyChatRunState, selectChatRunBusy } from "@/features/chat/state/chat-session-state";
import {
  createImRuntimeAnchorSessionUser,
  getImSessionDisplayName,
  isImBootstrapSessionUser,
  isImSessionUser,
  resolveImSessionType,
} from "@/features/session/im-session";
import { buildCanonicalImSessionUser } from "@/lib/im-session-key";

const chatScrollBottomThresholdPx = 48;
const viewportAnchorProbeInsetPx = 24;
const viewportAnchorProbeTopOffsetPx = 8;

type BuildChatTabTitleOptions = {
  locale?: string;
};

type ImChannelConfigEntry = {
  channel?: string;
  enabled?: boolean;
  defaultAgentId?: string;
};

type ImChannelConfigMap = Record<string, ImChannelConfigEntry>;

export function areJsonEqual(left, right) {
  if (left === right) {
    return true;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function shouldReuseTabState(previous, next) {
  return areJsonEqual(previous, next);
}

export function areEquivalentChatScrollState(previous, next) {
  if (previous === next) {
    return true;
  }
  if (!previous || !next) {
    return false;
  }

  return Number(previous.scrollTop || 0) === Number(next.scrollTop || 0)
    && Boolean(previous.atBottom) === Boolean(next.atBottom)
    && String(previous.anchorNodeId || "") === String(next.anchorNodeId || "")
    && String(previous.anchorMessageId || "") === String(next.anchorMessageId || "")
    && Number(previous.anchorOffset || 0) === Number(next.anchorOffset || 0);
}

export function resolveAgentIdFromTabId(tabId = "") {
  const normalized = String(tabId || "").trim();
  if (!normalized.startsWith("agent:")) {
    return "main";
  }
  return (normalized.slice("agent:".length).split("::")[0] || "").trim() || "main";
}

export function createTabMeta(tab, overrides = {}): ChatTabMeta {
  const canonicalAgentId = resolveAgentIdFromTabId(tab?.id) || tab?.agentId || "main";
  return {
    agentId: canonicalAgentId,
    sessionUser: tab?.sessionUser || defaultSessionUser,
    model: "",
    fastMode: false,
    thinkMode: "off",
    sessionFiles: [],
    sessionFileRewrites: [],
    ...overrides,
  };
}

function replacePathPrefix(sourcePath = "", previousPath = "", nextPath = "") {
  const normalizedSource = String(sourcePath || "");
  const normalizedPrevious = String(previousPath || "");
  const normalizedNext = String(nextPath || "");

  if (!normalizedSource || !normalizedPrevious || normalizedSource === normalizedPrevious) {
    return normalizedSource === normalizedPrevious ? normalizedNext : normalizedSource;
  }

  if (!normalizedSource.startsWith(`${normalizedPrevious}/`)) {
    return normalizedSource;
  }

  return `${normalizedNext}${normalizedSource.slice(normalizedPrevious.length)}`;
}

function renameSessionFiles(items: SessionFile[] = [], previousPath = "", nextPath = ""): SessionFile[] {
  return (items || []).map((item) => {
    const currentPath = String(item?.fullPath || item?.path || "").trim();
    if (currentPath !== previousPath && !currentPath.startsWith(`${previousPath}/`)) {
      return item;
    }

    const renamedPath = replacePathPrefix(currentPath, previousPath, nextPath);
    return {
      ...item,
      path: renamedPath || item.path,
      fullPath: renamedPath || item.fullPath,
      name: renamedPath.split("/").filter(Boolean).pop() || item.name,
    };
  });
}

export function applySessionFileRewrites(items: SessionFile[] = [], rewrites: SessionFileRewrite[] = []): SessionFile[] {
  return (rewrites || []).reduce(
    (current, rewrite) => renameSessionFiles(current, rewrite?.previousPath, rewrite?.nextPath),
    items,
  );
}

export function mergeSessionFileRewrites(
  previousRewrites: SessionFileRewrite[] = [],
  nextRewrites: SessionFileRewrite[] = [],
): SessionFileRewrite[] {
  const merged: SessionFileRewrite[] = [...(previousRewrites || [])];

  for (const rewrite of nextRewrites || []) {
    const previousPath = String(rewrite?.previousPath || "").trim();
    const nextPath = String(rewrite?.nextPath || "").trim();
    if (!previousPath || !nextPath) {
      continue;
    }

    if (merged.some((entry) => entry.previousPath === previousPath && entry.nextPath === nextPath)) {
      continue;
    }

    merged.push({ previousPath, nextPath });
  }

  return merged;
}

export function createSessionForTab(
  messages: any,
  tab: ChatTab | null | undefined,
  meta: ChatTabMeta | null | undefined,
  cachedSession: AppSession | null | undefined = null,
): AppSession {
  if (cachedSession) {
    return cachedSession;
  }

  const canonicalAgentId = resolveAgentIdFromTabId(tab?.id) || meta?.agentId || tab?.agentId || "main";

  return createBaseSession(messages, {
    agentId: canonicalAgentId,
    selectedAgentId: canonicalAgentId,
    sessionUser: meta?.sessionUser || tab?.sessionUser || defaultSessionUser,
    thinkMode: meta?.thinkMode || "off",
    model: meta?.model || "",
    selectedModel: meta?.model || "",
    fastMode: meta?.fastMode ? messages.sessionOverview.fastMode.on : messages.sessionOverview.fastMode.off,
  });
}

export function buildOptimisticSessionKey(agentId = "main", sessionUser = defaultSessionUser) {
  const normalizedAgentId = String(agentId || "main").trim() || "main";
  const normalizedSessionUser = String(sessionUser || defaultSessionUser).trim() || defaultSessionUser;

  if (normalizedSessionUser.startsWith("agent:")) {
    return normalizedSessionUser;
  }

  const canonicalImSessionUser = buildCanonicalImSessionUser(normalizedSessionUser, { agentId: normalizedAgentId });
  if (canonicalImSessionUser) {
    return canonicalImSessionUser.startsWith("agent:")
      ? canonicalImSessionUser
      : `agent:${normalizedAgentId}:${canonicalImSessionUser}`;
  }

  return `agent:${normalizedAgentId}:openai-user:${normalizedSessionUser}`;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isGeneratedAgentBootstrapSessionUser(sessionUser = "", agentId = "main") {
  const normalizedSessionUser = String(sessionUser || "").trim();
  const normalizedAgentId = String(agentId || "main")
    .trim()
    .replace(/[^\w:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:]+|[-:]+$/g, "");

  if (!normalizedSessionUser || !normalizedAgentId) {
    return false;
  }

  return new RegExp(`^command-center-${escapeRegExp(normalizedAgentId)}-\\d+$`).test(normalizedSessionUser);
}

function hashSessionUser(value = "") {
  const text = String(value || "").trim();
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36) || "session";
}

export function buildChatTabTitle(agentId = "main", sessionUser = "", options: BuildChatTabTitleOptions = {}) {
  const normalizedAgentId = String(agentId || "main").trim() || "main";
  const imLabel = getImSessionDisplayName(sessionUser, { locale: options.locale, shortWecom: true });
  if (imLabel) {
    return `${imLabel} ${normalizedAgentId}`;
  }
  return normalizedAgentId;
}

export function resolveRuntimeTabAgentId({
  requestedAgentId = "main",
  currentAgentId = "",
  snapshotAgentId = "",
  sessionUser = "",
} = {}) {
  const normalizedRequestedAgentId = String(requestedAgentId || "main").trim() || "main";
  const normalizedCurrentAgentId = String(currentAgentId || "").trim();
  const normalizedSnapshotAgentId = String(snapshotAgentId || "").trim();
  const normalizedSessionUser = String(sessionUser || "").trim();

  if (isImSessionUser(normalizedSessionUser)) {
    return normalizedCurrentAgentId || normalizedRequestedAgentId;
  }

  return normalizedSnapshotAgentId || normalizedCurrentAgentId || normalizedRequestedAgentId;
}

function resolveImChannelKey(channelOrSessionUser = "") {
  const normalizedChannel = String(channelOrSessionUser || "").trim();
  if (!normalizedChannel) {
    return "";
  }

  if (normalizedChannel === "dingtalk-connector" || normalizedChannel.includes("dingtalk-connector")) {
    return "dingtalk-connector";
  }

  const imType = resolveImSessionType(normalizedChannel);
  if (imType === "feishu") {
    return "feishu";
  }
  if (imType === "wecom") {
    return "wecom";
  }
  if (imType === "weixin") {
    return "openclaw-weixin";
  }

  return normalizedChannel;
}

export function resolveConfiguredImAgentId(imChannelConfigs: ImChannelConfigMap | null, channelOrSessionUser = "", fallbackAgentId = "main") {
  const normalizedFallbackAgentId = String(fallbackAgentId || "main").trim() || "main";
  const channelKey = resolveImChannelKey(channelOrSessionUser);
  if (!channelKey) {
    return normalizedFallbackAgentId;
  }

  return String(imChannelConfigs?.[channelKey]?.defaultAgentId || "").trim() || normalizedFallbackAgentId;
}

export function createSessionScopedTabId(agentId = "main", sessionUser = "") {
  return `${createAgentTabId(agentId)}::${hashSessionUser(sessionUser)}`;
}

export function resolveImRuntimeSessionUser({
  tabId = "",
  agentId = "main",
  sessionUser = "",
} = {}) {
  const normalizedSessionUser = String(sessionUser || "").trim();
  if (!isImSessionUser(normalizedSessionUser) || isImBootstrapSessionUser(normalizedSessionUser)) {
    return normalizedSessionUser;
  }

  const normalizedAgentId = String(agentId || "main").trim() || "main";
  const runtimeAnchorSessionUser = createImRuntimeAnchorSessionUser(normalizedSessionUser);
  if (!runtimeAnchorSessionUser) {
    return normalizedSessionUser;
  }

  return String(tabId || "").trim() === createSessionScopedTabId(normalizedAgentId, runtimeAnchorSessionUser)
    ? runtimeAnchorSessionUser
    : normalizedSessionUser;
}

export function planSearchedSessionTabTarget({
  activeTabId = "",
  agentId = "main",
  chatTabs = [] as ChatTab[],
  sessionUser = "",
  locale = "zh",
} = {}) {
  const normalizedAgentId = String(agentId || "main").trim() || "main";
  const normalizedSessionUser = String(sessionUser || "").trim();
  const normalizedActiveTabId = String(activeTabId || "").trim();

  const existingTab = (chatTabs || []).find((tab) =>
    String(resolveAgentIdFromTabId(tab?.id) || tab?.agentId || "").trim() === normalizedAgentId
    && String(tab?.sessionUser || "").trim() === normalizedSessionUser,
  );
  if (existingTab?.id) {
    return {
      create: false,
      tabId: existingTab.id,
      title: buildChatTabTitle(normalizedAgentId, normalizedSessionUser, { locale }),
    };
  }

  if (isImSessionUser(normalizedSessionUser)) {
    return {
      create: true,
      tabId: createSessionScopedTabId(normalizedAgentId, normalizedSessionUser),
      title: buildChatTabTitle(normalizedAgentId, normalizedSessionUser, { locale }),
    };
  }

  return {
    create: false,
    tabId: normalizedActiveTabId,
    title: buildChatTabTitle(normalizedAgentId, normalizedSessionUser, { locale }),
  };
}

export function isChatTabBusy({
  tabId = "",
  sessionUser = "",
  activeChatTabId = "",
  sessionStatus = "",
  busyByTabId = {},
  messagesByTabId = {},
  pendingChatTurns = {},
}: {
  tabId?: string;
  sessionUser?: string;
  activeChatTabId?: string;
  sessionStatus?: string;
  busyByTabId?: Record<string, boolean>;
  messagesByTabId?: Record<string, ChatMessage[]>;
  pendingChatTurns?: ConversationPendingMap;
} = {}) {
  const normalizedTabId = String(tabId || "").trim();
  const normalizedSessionUser = String(sessionUser || "").trim();
  const normalizedAgentId = resolveAgentIdFromTabId(normalizedTabId);
  const tabMessages = messagesByTabId?.[tabId] || [];
  const conversationKey = createConversationKey(normalizedSessionUser, normalizedAgentId);
  const trackedPendingEntry = pendingChatTurns?.[conversationKey]
    || Object.values(pendingChatTurns || {}).find((entry) => String(entry?.tabId || "").trim() === normalizedTabId)
    || null;
  const pendingEntry = resolveRuntimePendingEntry({
    agentId: normalizedAgentId,
    conversationKey,
    conversationMessages: tabMessages,
    localMessages: [],
    pendingChatTurns: trackedPendingEntry ? { [conversationKey]: trackedPendingEntry } : {},
    sessionStatus,
    sessionUser: normalizedSessionUser,
  });
  const run = deriveLegacyChatRunState({
    allowSessionStatusBusy:
      normalizedTabId === String(activeChatTabId || "").trim()
      && isImSessionUser(sessionUser),
    messages: tabMessages,
    pendingEntry,
    rawBusy: Boolean(busyByTabId?.[tabId]),
    sessionStatus,
    tabId: normalizedTabId,
  });

  return selectChatRunBusy(run);
}

function normalizeRuntimeIdentityValue(value = "") {
  return String(value || "").trim();
}

export function hasActiveAssistantReply(messages: ChatMessage[] = []) {
  return (messages || []).some((message) => message?.role === "assistant" && (message?.pending || message?.streaming));
}

export function shouldApplyRuntimeSnapshotToTab({
  currentAgentId = "",
  currentSessionUser = "",
  requestedAgentId = "",
  requestedSessionUser = "",
  resolvedSessionUser = "",
} = {}) {
  const normalizedCurrentAgentId = normalizeRuntimeIdentityValue(currentAgentId);
  const normalizedCurrentSessionUser = normalizeRuntimeIdentityValue(currentSessionUser);
  const normalizedRequestedAgentId = normalizeRuntimeIdentityValue(requestedAgentId);
  const normalizedRequestedSessionUser = normalizeRuntimeIdentityValue(requestedSessionUser);
  const normalizedResolvedSessionUser = normalizeRuntimeIdentityValue(resolvedSessionUser);

  if (
    normalizedRequestedAgentId
    && normalizedCurrentAgentId
    && normalizedRequestedAgentId !== normalizedCurrentAgentId
  ) {
    return false;
  }

  if (!normalizedCurrentSessionUser) {
    return true;
  }

  if (
    normalizedResolvedSessionUser
    && normalizedRequestedSessionUser
    && normalizedResolvedSessionUser !== normalizedRequestedSessionUser
  ) {
    const allowImBootstrapResolution =
      isImBootstrapSessionUser(normalizedRequestedSessionUser)
      && isImSessionUser(normalizedResolvedSessionUser)
      && !isImBootstrapSessionUser(normalizedResolvedSessionUser);
    const allowGeneratedBootstrapFallback =
      normalizedRequestedAgentId
      && normalizedResolvedSessionUser === "command-center"
      && isGeneratedAgentBootstrapSessionUser(normalizedRequestedSessionUser, normalizedRequestedAgentId);

    if (!allowGeneratedBootstrapFallback && !allowImBootstrapResolution && normalizedCurrentSessionUser !== normalizedResolvedSessionUser) {
      return false;
    }
  }

  if (
    normalizedCurrentSessionUser !== normalizedRequestedSessionUser
    && normalizedCurrentSessionUser !== normalizedResolvedSessionUser
  ) {
    return false;
  }

  return true;
}

export function buildInitialChatTabs(stored) {
  if (Array.isArray(stored?.chatTabs) && stored.chatTabs.length) {
    return stored.chatTabs;
  }

  return [
    {
      id: createAgentTabId(stored?.agentId || "main"),
      agentId: stored?.agentId || "main",
      sessionUser: stored?.sessionUser || defaultSessionUser,
    },
  ];
}

export function buildInitialTabMetaById(stored, chatTabs) {
  return Object.fromEntries(
    chatTabs.map((tab) => [
      tab.id,
      createTabMeta(tab, stored?.tabMetaById?.[tab.id] || {
        agentId: tab.agentId,
        sessionUser: tab.sessionUser,
        model: tab.agentId === (stored?.agentId || "main") ? stored?.model || "" : "",
        fastMode: tab.agentId === (stored?.agentId || "main") ? Boolean(stored?.fastMode) : false,
        thinkMode: tab.agentId === (stored?.agentId || "main") ? stored?.thinkMode || "off" : "off",
      }),
    ]),
  );
}

export function buildInitialMessagesByTabId(stored, activeChatTabId) {
  if (stored?.messagesByTabId && typeof stored.messagesByTabId === "object") {
    return stored.messagesByTabId;
  }

  return {
    [activeChatTabId]: [],
  };
}

function resolveViewportAnchorCandidateFromPoint(viewport, selector, viewportRect) {
  if (!viewport || !selector) {
    return null;
  }

  const ownerDocument = viewport.ownerDocument || document;
  const elementsFromPoint = ownerDocument?.elementsFromPoint?.bind(ownerDocument);
  if (typeof elementsFromPoint !== "function") {
    return null;
  }

  const viewportTop = Number(viewportRect?.top) || 0;
  const viewportLeft = Number(viewportRect?.left) || 0;
  const viewportRight = Number.isFinite(Number(viewportRect?.right))
    ? Number(viewportRect.right)
    : viewportLeft + (Number(viewportRect?.width) || 0);
  const viewportBottom = Number.isFinite(Number(viewportRect?.bottom))
    ? Number(viewportRect.bottom)
    : viewportTop + (Number(viewportRect?.height) || 0);
  const viewportWidth = Math.max(0, viewportRight - viewportLeft);
  const probeInset = Math.min(viewportAnchorProbeInsetPx, viewportWidth / 2 || 0);
  const probeY = Math.max(
    viewportTop + 1,
    Math.min(viewportBottom - 2, viewportTop + viewportAnchorProbeTopOffsetPx),
  );
  const probeXs = [...new Set(
    [
      viewportLeft + viewportWidth / 2,
      viewportLeft + probeInset,
      viewportRight - probeInset,
    ]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
  )];

  for (const probeX of probeXs) {
    const stack = elementsFromPoint(probeX, probeY) || [];
    for (const node of stack) {
      if (!(node instanceof ownerDocument.defaultView.Element) || !viewport.contains(node)) {
        continue;
      }

      const match = node.matches?.(selector) ? node : node.closest?.(selector);
      if (!match || !viewport.contains(match)) {
        continue;
      }

      const rect = match.getBoundingClientRect();
      if (rect.bottom <= viewportTop + 1 || rect.top >= viewportBottom - 1) {
        continue;
      }

      return { node: match, rect };
    }
  }

  return null;
}

export function resolveViewportAnchorCandidate(viewport, selector, viewportRect) {
  if (!viewport || !selector) {
    return null;
  }

  const probedCandidate = resolveViewportAnchorCandidateFromPoint(viewport, selector, viewportRect);
  if (probedCandidate) {
    return probedCandidate;
  }

  const viewportTop = Number(viewportRect?.top) || 0;
  const viewportBottom = Number.isFinite(Number(viewportRect?.bottom))
    ? Number(viewportRect.bottom)
    : viewportTop + (Number(viewportRect?.height) || 0);

  for (const node of viewport.querySelectorAll(selector)) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom <= viewportTop + 1) {
      continue;
    }
    if (rect.top >= viewportBottom - 1) {
      break;
    }
    return { node, rect };
  }

  return null;
}

export function buildChatScrollStateSnapshot({
  viewport = null,
  scrollTop = 0,
}: {
  viewport?: HTMLDivElement | null;
  scrollTop?: number;
} = {}): ChatScrollState {
  const normalizedTop = Math.max(0, Math.round(Number(scrollTop) || 0));
  const distanceFromBottom = viewport
    ? Math.max(0, viewport.scrollHeight - normalizedTop - viewport.clientHeight)
    : 0;
  const atBottom = distanceFromBottom <= chatScrollBottomThresholdPx;
  const nextState = {
    scrollTop: normalizedTop,
    ...(atBottom ? { atBottom: true } : {}),
  };

  if (!viewport || atBottom) {
    return nextState;
  }

  const viewportRect = viewport.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0 };
  const viewportTop = Number(viewportRect.top) || 0;
  const blockAnchorCandidate = resolveViewportAnchorCandidate(viewport, "[data-scroll-anchor-id]", viewportRect);
  const messageAnchorCandidate = resolveViewportAnchorCandidate(viewport, "[data-message-id]", viewportRect);
  const anchorNodeId = String(blockAnchorCandidate?.node?.getAttribute?.("data-scroll-anchor-id") || "").trim();
  const anchorMessageId = String(messageAnchorCandidate?.node?.getAttribute?.("data-message-id") || "").trim();
  const anchorBasisCandidate = blockAnchorCandidate || messageAnchorCandidate;
  const anchorOffset = anchorBasisCandidate
    ? Math.round((anchorBasisCandidate.rect?.top || 0) - viewportTop)
    : 0;

  return {
    ...nextState,
    ...(anchorNodeId ? { anchorNodeId } : {}),
    ...(anchorMessageId ? { anchorMessageId, anchorOffset } : {}),
    ...(anchorNodeId ? { anchorOffset } : {}),
  };
}

export function getLatestUserMessageKey(messages: ChatMessage[] = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    return String(message?.id || `${message?.timestamp || "user"}-${index}`);
  }

  return "";
}

export function getLatestSettledMessageKey(messages: ChatMessage[] = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.pending || message.streaming) {
      continue;
    }

    const role = String(message.role || "").trim();
    if (!role) {
      continue;
    }

    return String(message.id || `${role}-${message.timestamp || "message"}-${index}`);
  }

  return "";
}

export function getSettledMessageKeys(messages: ChatMessage[] = []): string[] {
  return (messages || []).reduce<string[]>((keys, message, index) => {
    if (!message || message.pending || message.streaming) {
      return keys;
    }

    const role = String(message.role || "").trim();
    if (!role) {
      return keys;
    }

    keys.push(String(message.id || `${role}-${message.timestamp || "message"}-${index}`));
    return keys;
  }, []);
}

export function deriveUnreadTabState({
  activeChatTabId = "",
  chatTabs = [] as ChatTab[],
  settledMessageKeysByTabId = {},
  previousSettledMessageKeysByTabId = {},
  previousUnreadCountByTabId = {},
} = {}) {
  const trackedTabIds = new Set(
    (Array.isArray(chatTabs) ? chatTabs : [])
      .map((tab) => String(tab?.id || "").trim())
      .filter(Boolean),
  );
  const nextUnreadCountByTabId: Record<string, number> = {};

  for (const tabId of trackedTabIds) {
    if (tabId === activeChatTabId) {
      continue;
    }

    const settledMessageKeys = Array.isArray(settledMessageKeysByTabId?.[tabId]) ? settledMessageKeysByTabId[tabId] : [];
    const previousSettledMessageKeys = Array.isArray(previousSettledMessageKeysByTabId?.[tabId]) ? previousSettledMessageKeysByTabId[tabId] : [];
    const previousSettledMessageKeySet = new Set(previousSettledMessageKeys);
    const previousUnreadCount = Number(previousUnreadCountByTabId?.[tabId] || 0);
    const nextUnreadDelta = settledMessageKeys.reduce(
      (count, key) => (previousSettledMessageKeySet.has(key) ? count : count + 1),
      0,
    );
    const nextUnreadCount = previousUnreadCount + nextUnreadDelta;

    if (nextUnreadCount > 0) {
      nextUnreadCountByTabId[tabId] = nextUnreadCount;
    }
  }

  return nextUnreadCountByTabId;
}
