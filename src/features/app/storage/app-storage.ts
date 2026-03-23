import type {
  ChatMessage,
  ChatScrollState,
  ChatTab,
  ChatTabMeta,
  ConversationPendingMap,
  MessagesByTabId,
  PendingChatTurn,
  SessionFile,
  SessionFileRewrite,
  StoredUiState,
  TabMetaById,
} from "@/types/chat";

export const legacyStorageKey = "command-center-ui-state-v2";
export const storageKey = "command-center-ui-state-v3";
export const themeStorageKey = "command-center-theme";
export const promptHistoryStorageKey = "command-center-prompt-history-v1";
export const promptDraftStorageKey = "command-center-prompt-drafts-v1";
export const pendingChatStorageKey = "command-center-pending-chat-v1";
export const chatScrollStorageKey = "command-center-chat-scroll-v1";
export const defaultTab = "timeline";
export const defaultSessionUser = "command-center";
export const defaultChatTabId = "agent:main";
export const promptHistoryLimit = 50;
export const defaultChatFontSize = "small";
export const defaultComposerSendMode = "enter-send";
export const defaultUserLabel = "";
export const minInspectorPanelWidth = 300;
export const maxInspectorPanelWidth = 720;
export const defaultInspectorPanelWidth = 380;
const maxUserLabelLength = 40;
const DUPLICATE_CONVERSATION_TURN_WINDOW_MS = 90 * 1000;
const DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS = 5 * 1000;
const DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS = 10 * 60 * 1000;
const UNTRUSTED_METADATA_SENTINELS = [
  /^Conversation info \(untrusted metadata\):/i,
  /^Sender \(untrusted metadata\):/i,
  /^Thread starter \(untrusted, for context\):/i,
  /^Replied message \(untrusted, for context\):/i,
  /^Forwarded message context \(untrusted metadata\):/i,
  /^Chat history since last reply \(untrusted, for context\):/i,
];
const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function isScrollStateEntry(value: [string, ChatScrollState] | null): value is [string, ChatScrollState] {
  return isPresent(value);
}

function isChatTab(value: ChatTab | null): value is ChatTab {
  return isPresent(value);
}

function isSessionFile(value: SessionFile | null): value is SessionFile {
  return isPresent(value);
}

function isSessionFileRewrite(value: SessionFileRewrite | null): value is SessionFileRewrite {
  return isPresent(value);
}

function normalizeAgentId(value = "main") {
  return String(value || "main").trim() || "main";
}

function resolveAgentIdFromTabId(tabId = "") {
  const normalized = String(tabId || "").trim();
  if (!normalized.startsWith("agent:")) {
    return "main";
  }
  return normalizeAgentId(normalized.slice("agent:".length).split("::")[0]);
}

function shouldPreserveSessionUser(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  return (normalized.startsWith("{") && normalized.endsWith("}"))
    || normalized.includes("dingtalk-connector");
}

export function createAgentTabId(agentId = "main") {
  return `agent:${normalizeAgentId(agentId)}`;
}

function sanitizeSessionUser(value = defaultSessionUser) {
  const rawValue = String(value || defaultSessionUser).trim();
  if (shouldPreserveSessionUser(rawValue)) {
    return rawValue;
  }

  const normalized = rawValue
    .trim()
    .replace(/[^\w:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:]+|[-:]+$/g, "");

  return normalized || defaultSessionUser;
}

export function createAgentSessionUser(agentId = "main") {
  const normalizedAgentId = normalizeAgentId(agentId).replace(/[^\w:-]+/g, "-");
  return sanitizeSessionUser(`command-center-${normalizedAgentId}-${Date.now()}`);
}

export function createResetSessionUser(agentId = "main") {
  const normalizedAgentId = normalizeAgentId(agentId).replace(/[^\w:-]+/g, "-");
  return sanitizeSessionUser(`command-center-reset-${normalizedAgentId}-${Date.now()}`);
}

function sanitizeChatFontSize(value) {
  return value === "medium" || value === "large" ? value : defaultChatFontSize;
}

function sanitizeComposerSendMode(value) {
  return value === "double-enter-send" ? "double-enter-send" : defaultComposerSendMode;
}

export function sanitizeUserLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxUserLabelLength);
}

export function sanitizeInspectorPanelWidth(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return defaultInspectorPanelWidth;
  }

  return Math.min(maxInspectorPanelWidth, Math.max(minInspectorPanelWidth, Math.round(numericValue)));
}

function sanitizeChatFontSizeMap(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, size]) => [String(key || "").trim(), sanitizeChatFontSize(size)])
      .filter(([key]) => Boolean(key)),
  );
}

function resolveStoredChatFontSize(parsed) {
  const directChatFontSize = sanitizeChatFontSize(parsed?.chatFontSize);
  if (directChatFontSize !== defaultChatFontSize || parsed?.chatFontSize === defaultChatFontSize) {
    return directChatFontSize;
  }

  const legacyChatFontSizeMap = sanitizeChatFontSizeMap(parsed?.chatFontSizeBySessionUser);
  const legacyChatFontSize = Object.values(legacyChatFontSizeMap)[0];
  return sanitizeChatFontSize(legacyChatFontSize);
}

function sanitizeDismissedTaskRelationshipsMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, ids]) => Array.isArray(ids))
      .map(([key, ids]) => [
        key,
        ids.map((id) => String(id || "").trim()).filter(Boolean),
      ])
      .filter(([, ids]) => ids.length),
  );
}

function sanitizePromptDraftsMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, draft]) => [key, typeof draft === "string" ? draft : String(draft || "")])
      .filter(([, draft]) => String(draft || "").length > 0),
  );
}

function sanitizeBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, flag]) => [String(key || "").trim(), Boolean(flag)])
      .filter(([key]) => Boolean(key)),
  );
}

function sanitizeChatScrollTopMap(value: unknown): Record<string, ChatScrollState> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, scrollState]) => {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) {
          return null;
        }

        if (typeof scrollState === "number" || typeof scrollState === "string") {
          const scrollTop = Number(scrollState);
          if (!Number.isFinite(scrollTop) || scrollTop < 0) {
            return null;
          }
          return [normalizedKey, { scrollTop: Math.round(scrollTop) }];
        }

        if (!scrollState || typeof scrollState !== "object") {
          return null;
        }

        const normalizedScrollState = scrollState as Partial<ChatScrollState>;
        const scrollTop = Number(normalizedScrollState.scrollTop);
        if (!Number.isFinite(scrollTop) || scrollTop < 0) {
          return null;
        }

        const anchorNodeId = String(normalizedScrollState.anchorNodeId || "").trim();
        const anchorMessageId = String(normalizedScrollState.anchorMessageId || "").trim();
        const anchorOffset = Number(normalizedScrollState.anchorOffset);
        const atBottom = Boolean(normalizedScrollState.atBottom);

        return [
          normalizedKey,
          {
            scrollTop: Math.round(scrollTop),
            ...(atBottom ? { atBottom: true } : {}),
            ...(anchorNodeId ? { anchorNodeId } : {}),
            ...(anchorMessageId ? { anchorMessageId } : {}),
            ...((anchorNodeId || anchorMessageId) && Number.isFinite(anchorOffset) ? { anchorOffset: Math.round(anchorOffset) } : {}),
          },
        ];
      })
      .filter(isScrollStateEntry),
  );
}

function normalizeConversationContent(content = "", role = "") {
  const normalizedRole = String(role || "").trim().toLowerCase();
  let text = String(content || "");

  if (normalizedRole === "assistant") {
    text = text
      .replace(/\[\[reply_to_current\]\]/gi, "")
      .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
      .replace(/<small>[\s\S]*?<\/small>/gi, "");
  } else if (normalizedRole === "user") {
    text = cleanWrappedUserMessage(text);
  }

  return text
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWrappedUserMessage(text = "") {
  let lines = String(text || "").trim().split("\n");
  const stripLeadingBlankLines = () => {
    while (lines.length && !String(lines[0] || "").trim()) {
      lines.shift();
    }
  };
  const isMetadataSentinelLine = (value = "") => {
    const trimmed = String(value || "").trim();
    return UNTRUSTED_METADATA_SENTINELS.some((pattern) => pattern.test(trimmed));
  };
  const stripLeadingSystemWrapperBlock = () => {
    if (!/^System:/i.test(String(lines[0] || "").trim())) {
      return false;
    }

    let index = 0;
    while (index < lines.length) {
      const trimmed = String(lines[index] || "").trim();
      if (!trimmed || /^System:/i.test(trimmed)) {
        index += 1;
        continue;
      }
      break;
    }

    let nextIndex = index;
    while (nextIndex < lines.length && !String(lines[nextIndex] || "").trim()) {
      nextIndex += 1;
    }

    if (!isMetadataSentinelLine(lines[nextIndex])) {
      return false;
    }

    lines.splice(0, nextIndex);
    return true;
  };
  const stripLeadingMetadataBlock = () => {
    const firstLine = String(lines[0] || "").trim();
    if (!isMetadataSentinelLine(firstLine)) {
      return false;
    }

    lines.shift();
    stripLeadingBlankLines();

    if (/^```(?:json)?\s*$/i.test(String(lines[0] || "").trim())) {
      lines.shift();
      while (lines.length && !/^```\s*$/.test(String(lines[0] || "").trim())) {
        lines.shift();
      }
      if (lines.length && /^```\s*$/.test(String(lines[0] || "").trim())) {
        lines.shift();
      }
    }

    stripLeadingBlankLines();
    return true;
  };

  stripLeadingBlankLines();

  while (
    lines.length
    && /^System:\s*\[[^\]]+\]\s*Exec (?:completed|failed)\s*\([^)]+\)\s*::/i.test(String(lines[0] || "").trim())
  ) {
    lines.shift();
    stripLeadingBlankLines();
  }

  while (stripLeadingSystemWrapperBlock()) {
    stripLeadingBlankLines();
  }

  while (stripLeadingMetadataBlock()) {
    // Strip stacked metadata blocks at the head of inbound IM messages.
  }

  while (lines.length && MESSAGE_ID_LINE.test(String(lines[0] || "").trim())) {
    lines.shift();
    stripLeadingBlankLines();
  }

  let cleaned = lines.join("\n").trim();

  cleaned = cleaned.replace(
    /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+[^\]]*?GMT[+-]\d+\]\s*/i,
    "",
  );
  cleaned = cleaned.replace(/^(?:ou_[a-z0-9_-]+|on_[a-z0-9_-]+|oc_[a-z0-9_-]+)\s*:\s*/i, "");

  if (
    /^OpenClaw runtime context \(internal\):/i.test(cleaned)
    && /runtime-generated,\s*not user-authored/i.test(cleaned)
  ) {
    return "";
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export function collapseDuplicateConversationTurns(entries: ChatMessage[] = []) {
  const collapsed: ChatMessage[] = [];
  let lastUserFingerprint = "";
  let lastUserTimestamp = 0;
  let lastAssistantTimestamp = 0;
  let lastAssistantFingerprint = "";
  let assistantSeenForCurrentTurn = false;
  let pendingReplayUser: ChatMessage | null = null;
  let pendingReplayAssistantFingerprint = "";

  const flushPendingReplayUser = () => {
    if (!pendingReplayUser) {
      return;
    }
    collapsed.push(pendingReplayUser);
    pendingReplayUser = null;
    pendingReplayAssistantFingerprint = "";
  };

  for (const entry of entries) {
    if (!entry?.role || !entry?.content) {
      continue;
    }

    if (entry.role === "user") {
      flushPendingReplayUser();
      const fingerprint = normalizeConversationContent(entry.content, entry.role);
      const timestamp = Number(entry.timestamp || 0);
      const withinShortReplayWindow =
        timestamp > 0
        && lastUserTimestamp > 0
        && timestamp - lastUserTimestamp <= DUPLICATE_CONVERSATION_TURN_WINDOW_MS;
      const immediateAssistantReplay =
        timestamp > 0
        && lastAssistantTimestamp > 0
        && lastUserTimestamp > 0
        && timestamp - lastAssistantTimestamp <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS
        && timestamp - lastUserTimestamp <= DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS;
      const isReplay =
        Boolean(fingerprint)
        && fingerprint === lastUserFingerprint
        && assistantSeenForCurrentTurn
        && (withinShortReplayWindow || immediateAssistantReplay);

      if (isReplay) {
        pendingReplayUser = entry;
        pendingReplayAssistantFingerprint = lastAssistantFingerprint;
        continue;
      }

      collapsed.push(entry);
      lastUserFingerprint = fingerprint;
      lastUserTimestamp = timestamp;
      assistantSeenForCurrentTurn = false;
      pendingReplayAssistantFingerprint = "";
      continue;
    }

    if (entry.role === "assistant") {
      const fingerprint = normalizeConversationContent(entry.content, entry.role);
      if (pendingReplayUser) {
        const shouldCollapseReplay =
          pendingReplayAssistantFingerprint
          && fingerprint
          && fingerprint === pendingReplayAssistantFingerprint;

        if (!shouldCollapseReplay) {
          collapsed.push(pendingReplayUser);
        }

        pendingReplayUser = null;
        pendingReplayAssistantFingerprint = "";

        if (shouldCollapseReplay) {
          continue;
        }
      }

      collapsed.push(entry);
      assistantSeenForCurrentTurn = true;
      lastAssistantTimestamp = Number(entry.timestamp || 0);
      lastAssistantFingerprint = fingerprint;
      continue;
    }

    flushPendingReplayUser();
    collapsed.push(entry);
  }

  flushPendingReplayUser();
  return collapsed;
}

function sanitizeMessagesByTabId(value: unknown): MessagesByTabId {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, messages]) => Boolean(String(key || "").trim()) && Array.isArray(messages))
      .map(([key, messages]) => [String(key || "").trim(), sanitizeMessagesForStorage(messages)]),
  );
}

function sanitizeChatTabs(value: unknown, fallbackSessionUser = defaultSessionUser, fallbackAgentId = "main"): ChatTab[] {
  if (!Array.isArray(value) || !value.length) {
    return [
      {
        id: createAgentTabId(fallbackAgentId),
        agentId: normalizeAgentId(fallbackAgentId),
        sessionUser: sanitizeSessionUser(fallbackSessionUser),
      },
    ];
  }

  const seen = new Set<string>();
  return value
    .map((tab) => {
      const fallbackTabAgentId = normalizeAgentId(tab?.agentId || fallbackAgentId);
      const id = String(tab?.id || createAgentTabId(fallbackTabAgentId)).trim() || createAgentTabId(fallbackTabAgentId);
      const agentId = resolveAgentIdFromTabId(id) || fallbackTabAgentId;
      if (seen.has(id)) {
        return null;
      }
      seen.add(id);
      return {
        id,
        agentId,
        sessionUser: sanitizeSessionUser(tab?.sessionUser || fallbackSessionUser),
      };
    })
    .filter(isChatTab);
}

function sanitizeSessionFiles(value: unknown): SessionFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): SessionFile | null => {
      const source = (item || {}) as Partial<SessionFile> & Record<string, unknown>;
      const fullPath = String(source.fullPath || source.path || "").trim();
      if (!fullPath) {
        return null;
      }

      const path = String(source.path || fullPath).trim() || fullPath;
      const name = String(source.name || fullPath.split("/").filter(Boolean).pop() || "").trim();
      const primaryAction = String(source.primaryAction || "").trim();
      const observedAt = Number(source.observedAt || 0);
      const updatedAt = Number(source.updatedAt || 0);

      return {
        path,
        fullPath,
        ...(name ? { name } : {}),
        kind: source.kind === "目录" ? "目录" : "文件",
        ...(primaryAction ? { primaryAction } : {}),
        ...(Number.isFinite(observedAt) && observedAt > 0 ? { observedAt } : {}),
        ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt } : {}),
      };
    })
    .filter(isSessionFile);
}

function sanitizeSessionFileRewrites(value: unknown): SessionFileRewrite[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const previousPath = String(entry?.previousPath || "").trim();
      const nextPath = String(entry?.nextPath || "").trim();
      if (!previousPath || !nextPath) {
        return null;
      }
      return { previousPath, nextPath };
    })
    .filter(isSessionFileRewrite);
}

function sanitizeTabMetaMap(value: unknown, tabs: ChatTab[] = []): TabMetaById {
  if (!value || typeof value !== "object") {
    return Object.fromEntries(
      tabs.map((tab) => [
        tab.id,
        {
          agentId: tab.agentId,
          sessionUser: tab.sessionUser,
          model: "",
          fastMode: false,
          thinkMode: "off",
          sessionFiles: [],
          sessionFileRewrites: [],
        },
      ]),
    );
  }

  return Object.fromEntries(
    tabs.map((tab) => {
      const source = value as Record<string, Partial<ChatTabMeta>> | undefined;
      const meta = source?.[tab.id] || {};
      return [
        tab.id,
        {
          agentId: resolveAgentIdFromTabId(tab.id) || normalizeAgentId(meta.agentId || tab.agentId),
          sessionUser: sanitizeSessionUser(meta.sessionUser || tab.sessionUser),
          model: String(meta.model || "").trim(),
          fastMode: Boolean(meta.fastMode),
          thinkMode: typeof meta.thinkMode === "string" ? meta.thinkMode : "off",
          sessionFiles: sanitizeSessionFiles(meta.sessionFiles),
          sessionFileRewrites: sanitizeSessionFileRewrites(meta.sessionFileRewrites),
        },
      ];
    }),
  );
}

function buildKnownTabs(parsed: any, chatTabs: ChatTab[], fallbackAgentId: string, fallbackSessionUser: string): ChatTab[] {
  const knownTabs = new Map<string, ChatTab>(
    (chatTabs || []).map((tab) => [
      tab.id,
      {
        id: tab.id,
        agentId: normalizeAgentId(tab.agentId || fallbackAgentId),
        sessionUser: sanitizeSessionUser(tab.sessionUser || fallbackSessionUser),
      },
    ]),
  );

  const registerTab = (tabId: string, meta: Partial<ChatTabMeta> = {}) => {
    const id = String(tabId || "").trim();
    if (!id || knownTabs.has(id)) {
      return;
    }

    const agentId = normalizeAgentId(meta.agentId || resolveAgentIdFromTabId(id) || fallbackAgentId);
    const sessionUser =
      meta.sessionUser
      || (agentId === "main" ? defaultSessionUser : "")
      || (agentId === fallbackAgentId ? fallbackSessionUser : "")
      || defaultSessionUser;

    knownTabs.set(id, {
      id,
      agentId,
      sessionUser: sanitizeSessionUser(sessionUser),
    });
  };

  Object.entries(parsed?.tabMetaById || {}).forEach(([tabId, meta]) => registerTab(tabId, (meta || {}) as Partial<ChatTabMeta>));
  Object.keys(parsed?.messagesByTabId || {}).forEach((tabId) => registerTab(tabId));

  return [...knownTabs.values()];
}

function loadParsedStorageState(raw: string | null): StoredUiState | null {
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw);
  const fallbackAgentId = parsed?.agentId || "main";
  const fallbackSessionUser = parsed?.sessionUser || defaultSessionUser;
  const chatTabs = sanitizeChatTabs(parsed?.chatTabs, fallbackSessionUser, fallbackAgentId);
  const firstTabId = chatTabs[0]?.id || createAgentTabId(fallbackAgentId);
  const activeChatTabId =
    String(parsed?.activeChatTabId || "").trim() && chatTabs.some((tab) => tab.id === parsed.activeChatTabId)
      ? parsed.activeChatTabId
      : firstTabId;
  const activeTab = chatTabs.find((tab) => tab.id === activeChatTabId) || chatTabs[0];
  const messagesByTabId = sanitizeMessagesByTabId(
    parsed?.messagesByTabId || (Array.isArray(parsed?.messages) ? { [activeChatTabId]: parsed.messages } : {}),
  );
  const nextMessagesByTabId = {
    ...messagesByTabId,
    ...(activeTab && !messagesByTabId[activeTab.id] && Array.isArray(parsed?.messages)
      ? { [activeTab.id]: sanitizeMessagesForStorage(parsed.messages) }
      : {}),
  };
  const knownTabs = buildKnownTabs(parsed, chatTabs, fallbackAgentId, fallbackSessionUser);
  const tabMetaById = sanitizeTabMetaMap(parsed?.tabMetaById, knownTabs);

  if (activeTab && !tabMetaById[activeTab.id]) {
    tabMetaById[activeTab.id] = {
      agentId: activeTab.agentId,
      sessionUser: activeTab.sessionUser,
      model: parsed?.model || "",
      fastMode: Boolean(parsed?.fastMode),
      thinkMode: typeof parsed?.thinkMode === "string" ? parsed.thinkMode : "off",
      sessionFiles: [],
      sessionFileRewrites: [],
    };
  }

  return {
    _persistedAt: Number(parsed?._persistedAt || 0) || 0,
    activeTab: parsed?.activeTab || defaultTab,
    activeChatTabId,
    chatTabs,
    messages: nextMessagesByTabId[activeChatTabId] || [],
    messagesByTabId: nextMessagesByTabId,
    tabMetaById,
    fastMode: Boolean(parsed?.fastMode),
    thinkMode: typeof parsed?.thinkMode === "string" ? parsed.thinkMode : "off",
    model: parsed?.model || "",
    agentId: activeTab?.agentId || fallbackAgentId || "main",
    sessionUser: activeTab?.sessionUser || fallbackSessionUser || defaultSessionUser,
    inspectorPanelWidth: sanitizeInspectorPanelWidth(parsed?.inspectorPanelWidth),
    chatFontSize: resolveStoredChatFontSize(parsed),
    composerSendMode: sanitizeComposerSendMode(parsed?.composerSendMode),
    userLabel: sanitizeUserLabel(parsed?.userLabel),
    dismissedTaskRelationshipIdsByConversation: sanitizeDismissedTaskRelationshipsMap(parsed?.dismissedTaskRelationshipIdsByConversation),
    promptDraftsByConversation: sanitizePromptDraftsMap(parsed?.promptDraftsByConversation),
    workspaceFilesOpenByConversation: sanitizeBooleanMap(parsed?.workspaceFilesOpenByConversation),
  };
}

function readStoredPersistedAt(raw) {
  if (!raw) {
    return 0;
  }

  try {
    return Number(JSON.parse(raw)?._persistedAt || 0) || 0;
  } catch {
    return 0;
  }
}

export function loadStoredState() {
  try {
    const current = loadParsedStorageState(window.localStorage.getItem(storageKey));
    if (current) {
      return current;
    }

    return loadParsedStorageState(window.localStorage.getItem(legacyStorageKey));
  } catch {
    return null;
  }
}

export function persistUiStateSnapshot(
  state: Partial<StoredUiState> & { persistedAt?: number; pendingChatTurns?: ConversationPendingMap } = {},
) {
  try {
    const activeChatTabId = String(state.activeChatTabId || "").trim();
    const persistedAt = Number(state.persistedAt || 0) || Date.now();
    const currentPersistedAt = Math.max(
      readStoredPersistedAt(window.localStorage.getItem(storageKey)),
      readStoredPersistedAt(window.localStorage.getItem(legacyStorageKey)),
    );
    if (currentPersistedAt > persistedAt) {
      return;
    }
    const payload = {
      _persistedAt: persistedAt,
      activeChatTabId,
      activeTab: state.activeTab || defaultTab,
      chatTabs: Array.isArray(state.chatTabs) ? state.chatTabs : [],
      chatFontSize: sanitizeChatFontSize(state.chatFontSize),
      composerSendMode: sanitizeComposerSendMode(state.composerSendMode),
      userLabel: sanitizeUserLabel(state.userLabel),
      dismissedTaskRelationshipIdsByConversation: sanitizeDismissedTaskRelationshipsMap(state.dismissedTaskRelationshipIdsByConversation),
      fastMode: Boolean(state.fastMode),
      inspectorPanelWidth: sanitizeInspectorPanelWidth(state.inspectorPanelWidth),
      thinkMode: typeof state.thinkMode === "string" ? state.thinkMode : "off",
      model: String(state.model || "").trim(),
      agentId: String(state.agentId || "main").trim() || "main",
      sessionUser: sanitizeSessionUser(state.sessionUser || defaultSessionUser),
      tabMetaById: sanitizeTabMetaMap(state.tabMetaById, sanitizeChatTabs(state.chatTabs, state.sessionUser, state.agentId)),
      promptDraftsByConversation: sanitizePromptDraftsMap(state.promptDraftsByConversation),
      workspaceFilesOpenByConversation: sanitizeBooleanMap(state.workspaceFilesOpenByConversation),
      messages: sanitizeMessagesForStorage(state.messages || []),
      messagesByTabId: sanitizeMessagesByTabId(state.messagesByTabId || {}),
    };
    const serialized = JSON.stringify(payload);
    window.localStorage.setItem(storageKey, serialized);
    window.localStorage.setItem(legacyStorageKey, serialized);
    if (state.pendingChatTurns && typeof state.pendingChatTurns === "object") {
      window.localStorage.setItem(
        pendingChatStorageKey,
        JSON.stringify({
          _persistedAt: persistedAt,
          pendingChatTurns: state.pendingChatTurns,
        }),
      );
    }
  } catch {}
}

export function loadStoredTheme() {
  try {
    const raw = window.localStorage.getItem(themeStorageKey);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  } catch {
    return "system";
  }
}

export function loadStoredPromptHistory(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(promptHistoryStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [
          key,
          (value as unknown[])
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .slice(-promptHistoryLimit),
        ]),
    );
  } catch {
    return {};
  }
}

export function loadStoredPromptDrafts() {
  try {
    const raw = window.localStorage.getItem(promptDraftStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return sanitizePromptDraftsMap(parsed);
  } catch {
    return {};
  }
}

export function loadPendingChatTurns() {
  try {
    const raw = window.localStorage.getItem(pendingChatStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    if (parsed.pendingChatTurns && typeof parsed.pendingChatTurns === "object") {
      return parsed.pendingChatTurns;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function pruneCompletedPendingChatTurns(
  pendingChatTurns: ConversationPendingMap = {},
  messagesByTabId: MessagesByTabId = {},
  tabMetaById: TabMetaById = {},
) {
  if (!pendingChatTurns || typeof pendingChatTurns !== "object") {
    return {};
  }

  const messagesByConversationKey = new Map(
    Object.entries(tabMetaById || {}).map(([tabId, meta]) => [
      createConversationKey(meta?.sessionUser || defaultSessionUser, meta?.agentId || "main"),
      Array.isArray(messagesByTabId?.[tabId]) ? messagesByTabId[tabId] : [],
    ]),
  );

  return Object.fromEntries(
    Object.entries(pendingChatTurns).filter(([conversationKey, pendingEntry]) => {
      if (!pendingEntry || typeof pendingEntry !== "object") {
        return false;
      }

      const localMessages = messagesByConversationKey.get(conversationKey) || [];
      if (!localMessages.length) {
        return true;
      }

      const pendingAssistantId = String(pendingEntry?.assistantMessageId || "").trim();
      if (
        pendingAssistantId
        && localMessages.some((message) =>
          message?.role === "assistant"
          && String(message?.id || "").trim() === pendingAssistantId,
        )
      ) {
        return true;
      }

      return !hasAuthoritativePendingAssistantReply(localMessages, pendingEntry);
    }),
  );
}

export function loadStoredChatScrollTops() {
  try {
    const raw = window.localStorage.getItem(chatScrollStorageKey);
    if (!raw) {
      return {};
    }
    return sanitizeChatScrollTopMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function persistChatScrollTops(value: Record<string, ChatScrollState | number | string>) {
  try {
    window.localStorage.setItem(chatScrollStorageKey, JSON.stringify(sanitizeChatScrollTopMap(value)));
  } catch {}
}

export function createConversationKey(sessionUser = defaultSessionUser, agentId = "main") {
  return `${sessionUser}:${agentId}`;
}

export function appendPromptHistory(historyMap: Record<string, string[]>, key: string, prompt: string) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) {
    return historyMap;
  }

  const currentHistory = Array.isArray(historyMap[key]) ? historyMap[key] : [];
  return {
    ...historyMap,
    [key]: [...currentHistory, normalizedPrompt].slice(-promptHistoryLimit),
  };
}

export function extractUserPromptHistory(messages: ChatMessage[] = []) {
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => cleanWrappedUserMessage(message.content))
    .filter(Boolean)
    .slice(-promptHistoryLimit);
}

export function sanitizeMessagesForStorage(messages: ChatMessage[] = []) {
  return messages
    .filter((message) => !message.pending)
    .slice(-80)
    .map((message) => {
      const normalizedRole = String(message?.role || "").trim().toLowerCase();
      const content = normalizedRole === "user"
        ? cleanWrappedUserMessage(message.content)
        : message.content;

      return {
        ...(message.id ? { id: message.id } : {}),
        role: message.role,
        content,
        timestamp: message.timestamp,
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        ...(message.tokenBadge ? { tokenBadge: message.tokenBadge } : {}),
      };
    })
    .filter((message) => Boolean(message.attachments?.length) || Boolean(String(message.content || "").trim()));
}

function areEquivalentConversationMessages(snapshotMessage, localMessage) {
  if (!snapshotMessage || !localMessage || snapshotMessage.role !== localMessage.role) {
    return false;
  }

  const normalizeAssistantConversationContent = (content = "") =>
    String(content || "")
      .replace(/\[\[reply_to_current\]\]/gi, "")
      .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
      .replace(/<small>[\s\S]*?<\/small>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const snapshotContent = snapshotMessage.role === "assistant"
    ? normalizeAssistantConversationContent(snapshotMessage.content)
    : String(snapshotMessage.content || "").trim();
  const localContent = localMessage.role === "assistant"
    ? normalizeAssistantConversationContent(localMessage.content)
    : String(localMessage.content || "").trim();
  if (!snapshotContent || snapshotContent !== localContent) {
    return false;
  }

  if (snapshotMessage.role === "assistant") {
    const snapshotTokenBadge = String(snapshotMessage.tokenBadge || "").trim();
    const localTokenBadge = String(localMessage.tokenBadge || "").trim();
    if (snapshotTokenBadge && localTokenBadge && snapshotTokenBadge !== localTokenBadge) {
      return false;
    }
  }

  return true;
}

export function mergeConversationIdentity(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  const nextMessages: ChatMessage[] = snapshotMessages.map((message) => ({ ...message }));
  const usedLocalIndices = new Set<number>();

  nextMessages.forEach((message, index) => {
    const localIndex = localMessages.findIndex(
      (localMessage, candidateIndex) =>
        !usedLocalIndices.has(candidateIndex)
        && areEquivalentConversationMessages(message, localMessage),
    );

    if (localIndex === -1) {
      return;
    }

    const localMessage = localMessages[localIndex];
    if (!localMessage) {
      return;
    }
    nextMessages[index] = {
      ...message,
      ...(localMessage.id ? { id: localMessage.id } : {}),
      ...(Number.isFinite(Number(localMessage.timestamp)) ? { timestamp: localMessage.timestamp } : {}),
    };
    usedLocalIndices.add(localIndex);
  });

  if (pendingEntry) {
    const localPendingUser = localMessages.find((message) => {
      if (message?.role !== "user") {
        return false;
      }

      const pendingUserId = String(pendingEntry?.userMessage?.id || "").trim();
      if (pendingUserId && String(message?.id || "").trim() === pendingUserId) {
        return true;
      }

      return String(message?.content || "") === String(pendingEntry?.userMessage?.content || "")
        && Number(message?.timestamp || 0) === Number(pendingEntry?.userMessage?.timestamp || 0);
    });
    const snapshotPendingUserIndex = findPendingUserIndex(nextMessages, pendingEntry);
    if (localPendingUser && snapshotPendingUserIndex >= 0) {
      const snapshotPendingUser = nextMessages[snapshotPendingUserIndex];
      if (!snapshotPendingUser) {
        return;
      }
      nextMessages[snapshotPendingUserIndex] = {
        ...snapshotPendingUser,
        ...(localPendingUser.id ? { id: localPendingUser.id } : {}),
        ...(Number.isFinite(Number(localPendingUser.timestamp)) ? { timestamp: localPendingUser.timestamp } : {}),
      };
    }

    const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
    const localPendingAssistant = assistantMessageId
      ? localMessages.find((message) => message?.role === "assistant" && String(message?.id || "").trim() === assistantMessageId)
      : null;
    const snapshotPendingAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);
    if (localPendingAssistant && snapshotPendingAssistantIndex >= 0) {
      const snapshotPendingAssistant = nextMessages[snapshotPendingAssistantIndex];
      if (!snapshotPendingAssistant) {
        return;
      }
      nextMessages[snapshotPendingAssistantIndex] = {
        ...snapshotPendingAssistant,
        ...(localPendingAssistant.id ? { id: localPendingAssistant.id } : {}),
        ...(Number.isFinite(Number(localPendingAssistant.timestamp)) ? { timestamp: localPendingAssistant.timestamp } : {}),
      };
    }
  }

  return nextMessages;
}

export function mergeStaleLocalConversationTail(snapshotMessages: ChatMessage[] = [], localMessages: ChatMessage[] = []) {
  const nextMessages: ChatMessage[] = snapshotMessages.map((message) => ({ ...message }));
  const normalizedLocalMessages: ChatMessage[] = (localMessages || [])
    .filter((message) => !message?.pending)
    .map((message) => ({ ...message }));

  if (!nextMessages.length) {
    return collapseDuplicateConversationTurns(normalizedLocalMessages);
  }

  if (normalizedLocalMessages.length >= 2) {
    const localAssistant = normalizedLocalMessages.at(-1);
    const localUser = normalizedLocalMessages.at(-2);
    const matchingAssistantIndex = nextMessages.findIndex((message) =>
      message?.role === "assistant" && areEquivalentConversationMessages(message, localAssistant),
    );

    if (
      localUser?.role === "user"
      && localAssistant?.role === "assistant"
      && matchingAssistantIndex >= 0
    ) {
      const hasMatchingUserBeforeAssistant = nextMessages
        .slice(0, matchingAssistantIndex)
        .some((message) => message?.role === "user" && String(message?.content || "") === String(localUser.content || ""));

      if (!hasMatchingUserBeforeAssistant) {
        const restoredTurn = [...nextMessages];
        restoredTurn.splice(matchingAssistantIndex, 0, localUser);
        return collapseDuplicateConversationTurns(restoredTurn);
      }
    }
  }

  if (normalizedLocalMessages.length <= nextMessages.length) {
    return nextMessages;
  }

  const snapshotMatchesLocalPrefix = nextMessages.every((message, index) =>
    areEquivalentConversationMessages(message, normalizedLocalMessages[index]),
  );

  if (!snapshotMatchesLocalPrefix) {
    return nextMessages;
  }

  const localTail = normalizedLocalMessages.slice(nextMessages.length);
  if (!localTail.length) {
    return nextMessages;
  }

  let overlapCount = 0;
  const maxOverlap = Math.min(nextMessages.length, localTail.length);
  for (let candidate = maxOverlap; candidate > 0; candidate -= 1) {
    const snapshotSlice = nextMessages.slice(-candidate);
    const tailSlice = localTail.slice(0, candidate);
    const hasOverlap = snapshotSlice.every((message, index) => {
      const tailMessage = tailSlice[index];
      const snapshotId = String(message?.id || "").trim();
      const tailId = String(tailMessage?.id || "").trim();
      if (snapshotId && tailId && snapshotId === tailId) {
        return true;
      }

      return message?.role === "assistant"
        && tailMessage?.role === "assistant"
        && areEquivalentConversationMessages(message, tailMessage);
    });

    if (hasOverlap) {
      overlapCount = candidate;
      break;
    }
  }

  return [
    ...nextMessages,
    ...localTail.slice(overlapCount),
  ];
}

export function mergeConversationAttachments(snapshotMessages: ChatMessage[] = [], localMessages: ChatMessage[] = []) {
  const nextMessages = snapshotMessages.map((message) => ({ ...message }));
  const usedIndices = new Set();

  localMessages.forEach((localMessage) => {
    if (!localMessage?.attachments?.length) {
      return;
    }

    const matchIndex = nextMessages.findIndex(
      (message, index) =>
        !usedIndices.has(index) &&
        message.role === localMessage.role &&
        String(message.content || "") === String(localMessage.content || ""),
    );

    if (matchIndex === -1) {
      return;
    }

    const snapshotMessage = nextMessages[matchIndex];
    if (snapshotMessage) {
      nextMessages[matchIndex] = {
        ...snapshotMessage,
        attachments: localMessage.attachments,
      };
    }
    usedIndices.add(matchIndex);
  });

  return nextMessages;
}

function hasSnapshotAssistantReply(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null): boolean {
  if (pendingEntry?.stopped) {
    return false;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  if (assistantMessageId) {
    const hasDirectMatch = snapshotMessages.some(
      (message) =>
        message?.role === "assistant"
        && !message?.pending
        && !message?.streaming
        && String(message?.id || "").trim() === assistantMessageId
        && Boolean(String(message.content || "").trim()),
    );
    if (hasDirectMatch) {
      return true;
    }
  }

  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);
  const startedAt = Number(pendingEntry?.startedAt || 0);

  const matchesAssistant = (message: ChatMessage) => {
    if (
      message?.role !== "assistant"
      || message?.pending
      || message?.streaming
      || String(message.content || "").trim() === ""
    ) {
      return false;
    }

    const timestamp = Number(message.timestamp || 0);
    return !startedAt || !timestamp || timestamp >= startedAt;
  };

  if (pendingUserIndex >= 0) {
    return snapshotMessages.slice(pendingUserIndex + 1).some(matchesAssistant);
  }

  return snapshotMessages.some(matchesAssistant);
}

function findPendingUserIndex(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null): number {
  const targetContent = String(pendingEntry?.userMessage?.content || "");
  if (!targetContent) {
    return -1;
  }

  const expectedTimestamp = Number(pendingEntry?.userMessage?.timestamp || 0);
  const startedAt = Number(pendingEntry?.startedAt || 0);
  const matchThreshold = expectedTimestamp || startedAt || 0;
  const timedMatches: Array<{ index: number; timestamp: number }> = [];
  const untimedMatches: number[] = [];

  snapshotMessages.forEach((message, index) => {
    if (message?.role !== "user" || String(message.content || "") !== targetContent) {
      return;
    }

    const timestamp = Number(message.timestamp || 0);
    if (timestamp) {
      timedMatches.push({ index, timestamp });
      return;
    }

    untimedMatches.push(index);
  });

  if (timedMatches.length) {
    const eligibleTimedMatches = matchThreshold
      ? timedMatches.filter((item) => item.timestamp >= matchThreshold)
      : timedMatches;

    if (eligibleTimedMatches.length) {
      return eligibleTimedMatches.at(-1)?.index ?? -1;
    }

    if (!matchThreshold && timedMatches.length === 1) {
      return timedMatches[0]?.index ?? -1;
    }

    return -1;
  }

  if (!matchThreshold && untimedMatches.length === 1) {
    return untimedMatches[0] ?? -1;
  }

  return -1;
}

function findLocalStreamingAssistant(
  localMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
): ChatMessage | null {
  if (!pendingEntry) {
    return null;
  }

  const pendingTimestamp = Number(pendingEntry.pendingTimestamp || 0);
  const startedAt = Number(pendingEntry.startedAt || 0);

  const candidate = [...localMessages].reverse().find((message) => {
    if (message?.role !== "assistant" || message?.pending) {
      return false;
    }

    const timestamp = Number(message.timestamp || 0);
    if (!timestamp) {
      return false;
    }

    if (timestamp !== pendingTimestamp && timestamp < startedAt) {
      return false;
    }

    return Boolean(String(message.content || "").trim());
  });

  return candidate ? { ...candidate } : null;
}

function findSnapshotPendingAssistantIndex(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
): number {
  if (pendingEntry?.stopped) {
    return -1;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  if (assistantMessageId) {
    const directIndex = snapshotMessages.findIndex(
      (message) => message?.role === "assistant" && String(message?.id || "").trim() === assistantMessageId,
    );
    if (directIndex >= 0) {
      return directIndex;
    }
  }

  const startedAt = Number(pendingEntry?.startedAt || 0);
  const expectedTimestamp = Number(pendingEntry?.userMessage?.timestamp || 0);
  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);

  if (pendingUserIndex >= 0) {
    const pendingUserMessage = snapshotMessages[pendingUserIndex];
    if (!pendingUserMessage) {
      return -1;
    }
    for (let index = snapshotMessages.length - 1; index > pendingUserIndex; index -= 1) {
      const message = snapshotMessages[index];
      if (message?.role !== "assistant" || String(message.content || "").trim() === "") {
        continue;
      }
      return index;
    }
    return -1;
  }

  const matchThreshold = expectedTimestamp || startedAt || 0;
  for (let index = snapshotMessages.length - 1; index >= 0; index -= 1) {
    const message = snapshotMessages[index];
    if (message?.role !== "assistant" || String(message.content || "").trim() === "") {
      continue;
    }
    const timestamp = Number(message.timestamp || 0);
    if (!matchThreshold || !timestamp || timestamp >= matchThreshold) {
      return index;
    }
  }

  return -1;
}

function hasEquivalentAssistantMessage(
  messages: ChatMessage[] = [],
  candidate: ChatMessage | null = null,
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!candidate || candidate?.role !== "assistant") {
    return false;
  }

  const normalizeAssistantConversationContent = (content = "") =>
    String(content || "")
      .replace(/\[\[reply_to_current\]\]/gi, "")
      .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
      .replace(/<small>[\s\S]*?<\/small>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const candidateContent = normalizeAssistantConversationContent(candidate.content);
  if (!candidateContent) {
    return false;
  }

  const candidateTokenBadge = String(candidate.tokenBadge || "").trim();
  const pendingUserIndex = findPendingUserIndex(messages, pendingEntry);
  const candidates =
    pendingUserIndex >= 0
      ? messages.slice(pendingUserIndex + 1)
      : messages;

  return candidates.some((message) => {
    if (message?.role !== "assistant") {
      return false;
    }

    const content = normalizeAssistantConversationContent(message.content);
    if (!content || content !== candidateContent) {
      return false;
    }

    const tokenBadge = String(message.tokenBadge || "").trim();
    return !candidateTokenBadge || !tokenBadge || tokenBadge === candidateTokenBadge;
  });
}

function mergeStreamingAssistant(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  localStreamingAssistant: ChatMessage | null = null,
): ChatMessage[] {
  if (!localStreamingAssistant) {
    return snapshotMessages;
  }

  const nextMessages: ChatMessage[] = [...snapshotMessages];
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);
  if (snapshotAssistantIndex === -1) {
    if (hasEquivalentAssistantMessage(nextMessages, localStreamingAssistant, pendingEntry)) {
      return nextMessages;
    }
    return [...nextMessages, localStreamingAssistant];
  }

  const snapshotAssistant = nextMessages[snapshotAssistantIndex];
  if (!snapshotAssistant) {
    return nextMessages;
  }
  const localContent = String(localStreamingAssistant.content || "");
  const snapshotContent = String(snapshotAssistant?.content || "");
  const preferredAssistant =
    localContent.length >= snapshotContent.length
      ? {
          ...snapshotAssistant,
          ...localStreamingAssistant,
        }
      : {
          ...localStreamingAssistant,
          ...snapshotAssistant,
        };

  nextMessages[snapshotAssistantIndex] = preferredAssistant;
  return nextMessages;
}

function insertPendingUserMessage(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn): ChatMessage[] {
  const nextMessages: ChatMessage[] = [...snapshotMessages];
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);
  const pendingUserMessage = pendingEntry.userMessage;

  if (!pendingUserMessage) {
    return nextMessages;
  }

  if (snapshotAssistantIndex === -1) {
    nextMessages.push(pendingUserMessage);
    return nextMessages;
  }

  if (snapshotAssistantIndex >= 0) {
    nextMessages.splice(snapshotAssistantIndex, 0, pendingUserMessage);
  }
  return nextMessages;
}

function filterStoppedTurnAssistantMessages(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
): ChatMessage[] {
  if (!pendingEntry?.stopped) {
    return [...snapshotMessages];
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  const nextMessages = snapshotMessages.filter((message) => {
    if (message?.role !== "assistant") {
      return true;
    }

    if (!assistantMessageId) {
      return true;
    }

    return String(message?.id || "").trim() !== assistantMessageId;
  });

  const pendingUserIndex = findPendingUserIndex(nextMessages, pendingEntry);
  if (pendingUserIndex < 0) {
    return nextMessages;
  }

  const nextUserIndex = nextMessages.findIndex((message, index) => index > pendingUserIndex && message?.role === "user");
  const assistantUpperBound = nextUserIndex >= 0 ? nextUserIndex : nextMessages.length;

  return nextMessages.filter((message, index) => {
    if (index <= pendingUserIndex || index >= assistantUpperBound) {
      return true;
    }

    return message?.role !== "assistant";
  });
}

export function derivePendingEntryFromLocalMessages(localMessages: ChatMessage[] = []) {
  if (!Array.isArray(localMessages) || !localMessages.length) {
    return null;
  }

  const pendingAssistantIndex = [...localMessages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message?.role === "assistant" && Boolean(message?.pending))?.index;

  if (typeof pendingAssistantIndex !== "number" || pendingAssistantIndex < 0) {
    return null;
  }

  const pendingAssistant = localMessages[pendingAssistantIndex];
  if (!pendingAssistant) {
    return null;
  }
  const pendingUser = [...localMessages.slice(0, pendingAssistantIndex)]
    .reverse()
    .find((message) => message?.role === "user");

  if (!pendingUser) {
    return null;
  }

  return {
    startedAt: Number(pendingUser.timestamp || pendingAssistant.timestamp || Date.now()),
    pendingTimestamp: Number(pendingAssistant.timestamp || Date.now()),
    assistantMessageId: String(pendingAssistant.id || "").trim() || undefined,
    suppressPendingPlaceholder: Boolean(pendingAssistant?.suppressPendingPlaceholder),
    userMessage: {
      ...(pendingUser.id ? { id: pendingUser.id } : {}),
      role: "user",
      content: pendingUser.content,
      timestamp: pendingUser.timestamp,
      ...(pendingUser.attachments?.length ? { attachments: pendingUser.attachments } : {}),
    },
  };
}

export function mergePendingConversation(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null,
  pendingLabel: string,
  localMessages: ChatMessage[] = [],
) {
  if (!pendingEntry) {
    return [...snapshotMessages];
  }

  const filteredSnapshotMessages = filterStoppedTurnAssistantMessages(snapshotMessages, pendingEntry);
  const localStreamingAssistant = findLocalStreamingAssistant(localMessages, pendingEntry);
  if (hasSnapshotAssistantReply(filteredSnapshotMessages, pendingEntry)) {
    const pendingUserIndex = findPendingUserIndex(filteredSnapshotMessages, pendingEntry);
    const snapshotWithPendingUser =
      pendingUserIndex >= 0
        ? filteredSnapshotMessages
        : insertPendingUserMessage(filteredSnapshotMessages, pendingEntry);
    return collapseDuplicateConversationTurns(
      mergeStreamingAssistant(snapshotWithPendingUser, pendingEntry, localStreamingAssistant),
    );
  }

  const pendingUserIndex = findPendingUserIndex(filteredSnapshotMessages, pendingEntry);
  const hasPendingUserMessage = pendingUserIndex >= 0;

  const merged = hasPendingUserMessage ? [...filteredSnapshotMessages] : insertPendingUserMessage(filteredSnapshotMessages, pendingEntry);
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(merged, pendingEntry);

  if (localStreamingAssistant) {
    if (hasEquivalentAssistantMessage(merged, localStreamingAssistant, pendingEntry)) {
      return collapseDuplicateConversationTurns(merged);
    }
    return collapseDuplicateConversationTurns([...merged, localStreamingAssistant]);
  }

  if (snapshotAssistantIndex >= 0) {
    return merged;
  }

  if (pendingEntry?.suppressPendingPlaceholder) {
    return collapseDuplicateConversationTurns(merged);
  }

  return collapseDuplicateConversationTurns([
    ...merged,
    {
      role: "assistant",
      content: pendingLabel,
      timestamp: pendingEntry.pendingTimestamp,
      pending: true,
    },
  ]);
}

export function hasAuthoritativePendingAssistantReply(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null,
) {
  if (pendingEntry?.stopped) {
    return false;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  if (assistantMessageId) {
    const hasDirectMatch = snapshotMessages.some(
      (message) =>
        message?.role === "assistant"
        && !message?.pending
        && !message?.streaming
        && String(message?.id || "").trim() === assistantMessageId
        && Boolean(String(message?.content || "").trim()),
    );
    if (hasDirectMatch) {
      return true;
    }
  }

  return hasSnapshotAssistantReply(snapshotMessages, pendingEntry);
}
