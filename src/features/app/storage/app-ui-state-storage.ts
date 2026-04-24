import type {
  ChatMessage,
  ChatTab,
  ChatTabMeta,
  ConversationPendingMap,
  MessagesByTabId,
  SessionFile,
  SessionFileRewrite,
  StoredUiState,
  TabMetaById,
} from "@/types/chat";
import {
  defaultChatFontSize,
  defaultComposerSendMode,
  defaultTab,
  sanitizeInspectorPanelWidth,
  sanitizeUserLabel,
} from "@/features/app/state/app-preferences";
import { sanitizePromptDraftsMap } from "@/features/app/state/app-prompt-storage";
import {
  pendingChatStorageKey,
  pruneCompletedPendingChatTurns,
  sanitizePendingChatTurnsMap,
} from "@/features/app/state/app-pending-storage";
import { sanitizeMessagesForStorage } from "@/features/chat/state/chat-persisted-messages";
import {
  createAgentTabId,
  defaultSessionUser,
  normalizeAgentId,
  normalizeStoredConversationKey,
  resolveAgentIdFromTabId,
  sanitizeSessionUser,
} from "@/features/app/state/app-session-identity";

const legacyStorageKey = "command-center-ui-state-v2";
const storageKey = "command-center-ui-state-v3";

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
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

function sanitizeConversationArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string[]>>((accumulator, [key, ids]) => {
    const normalizedKey = normalizeStoredConversationKey(key);
    if (!normalizedKey || !Array.isArray(ids)) {
      return accumulator;
    }

    const normalizedIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
    if (!normalizedIds.length) {
      return accumulator;
    }

    accumulator[normalizedKey] = [...new Set([...(accumulator[normalizedKey] || []), ...normalizedIds])];
    return accumulator;
  }, {});
}

function sanitizeConversationBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, boolean>>((accumulator, [key, flag]) => {
    const normalizedKey = normalizeStoredConversationKey(key);
    if (!normalizedKey) {
      return accumulator;
    }

    accumulator[normalizedKey] = Boolean(flag);
    return accumulator;
  }, {});
}

function sanitizeChatFontSize(value) {
  return value === "medium" || value === "large" ? value : defaultChatFontSize;
}

function sanitizeComposerSendMode(value) {
  return value === "double-enter-send" ? "double-enter-send" : defaultComposerSendMode;
}

function normalizeSettledMessage(message: ChatMessage) {
  const nextMessage = { ...message };
  delete nextMessage.pending;
  delete nextMessage.streaming;
  return nextMessage;
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
  return sanitizeConversationArrayMap(value);
}

function sanitizeBooleanMap(value: unknown): Record<string, boolean> {
  return sanitizeConversationBooleanMap(value);
}

function sanitizeMessagesByTabId(value: unknown): MessagesByTabId {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, messages]) => Boolean(String(key || "").trim()) && Array.isArray(messages))
      .map(([key, messages]) => [String(key || "").trim(), sanitizeMessagesForStorage(messages).map(normalizeSettledMessage)]),
  );
}

function selectPersistedActiveMessages(
  activeChatTabId = "",
  messages: ChatMessage[] = [],
  messagesByTabId: MessagesByTabId = {},
) {
  const normalizedActiveChatTabId = String(activeChatTabId || "").trim();
  if (normalizedActiveChatTabId && Object.prototype.hasOwnProperty.call(messagesByTabId, normalizedActiveChatTabId)) {
    return sanitizeMessagesForStorage(messagesByTabId[normalizedActiveChatTabId] || []).map(normalizeSettledMessage);
  }

  return sanitizeMessagesForStorage(messages || []).map(normalizeSettledMessage);
}

function sanitizeChatTabs(value: unknown, fallbackSessionUser = defaultSessionUser, fallbackAgentId = "main"): ChatTab[] {
  if (!Array.isArray(value) || !value.length) {
    return [
      {
        id: createAgentTabId(fallbackAgentId),
        agentId: normalizeAgentId(fallbackAgentId),
        sessionUser: sanitizeSessionUser(fallbackSessionUser, fallbackAgentId),
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
        sessionUser: sanitizeSessionUser(tab?.sessionUser || fallbackSessionUser, agentId),
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
          hermesSessionId: "",
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
          sessionUser: sanitizeSessionUser(meta.sessionUser || tab.sessionUser, meta.agentId || tab.agentId),
          hermesSessionId: String(meta.hermesSessionId || "").trim(),
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
        sessionUser: sanitizeSessionUser(tab.sessionUser || fallbackSessionUser, tab.agentId || fallbackAgentId),
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
      sessionUser: sanitizeSessionUser(sessionUser, agentId),
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
  const hasStructuredMessagesByTabId = parsed?.messagesByTabId && typeof parsed.messagesByTabId === "object";
  const messagesByTabId = sanitizeMessagesByTabId(
    parsed?.messagesByTabId || (Array.isArray(parsed?.messages) ? { [activeChatTabId]: parsed.messages } : {}),
  );
  const nextMessagesByTabId = {
    ...messagesByTabId,
    ...(activeTab && !hasStructuredMessagesByTabId && !messagesByTabId[activeTab.id] && Array.isArray(parsed?.messages)
      ? { [activeTab.id]: sanitizeMessagesForStorage(parsed.messages) }
      : {}),
  };
  const knownTabs = buildKnownTabs(parsed, chatTabs, fallbackAgentId, fallbackSessionUser);
  const tabMetaById = sanitizeTabMetaMap(parsed?.tabMetaById, knownTabs);

  if (activeTab && !tabMetaById[activeTab.id]) {
      tabMetaById[activeTab.id] = {
        agentId: activeTab.agentId,
        sessionUser: activeTab.sessionUser,
        hermesSessionId: "",
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
    sessionUser: sanitizeSessionUser(activeTab?.sessionUser || fallbackSessionUser || defaultSessionUser, activeTab?.agentId || fallbackAgentId || "main"),
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
    const sanitizedMessagesByTabId = sanitizeMessagesByTabId(state.messagesByTabId || {});
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
      sessionUser: sanitizeSessionUser(state.sessionUser || defaultSessionUser, state.agentId || "main"),
      tabMetaById: sanitizeTabMetaMap(state.tabMetaById, sanitizeChatTabs(state.chatTabs, state.sessionUser, state.agentId)),
      promptDraftsByConversation: sanitizePromptDraftsMap(state.promptDraftsByConversation),
      workspaceFilesOpenByConversation: sanitizeBooleanMap(state.workspaceFilesOpenByConversation),
      messages: selectPersistedActiveMessages(activeChatTabId, state.messages || [], sanitizedMessagesByTabId),
      messagesByTabId: sanitizedMessagesByTabId,
    };
    const sanitizedPendingChatTurns = pruneCompletedPendingChatTurns(
      sanitizePendingChatTurnsMap(state.pendingChatTurns || {}),
      payload.messagesByTabId,
      payload.tabMetaById,
    );
    const serialized = JSON.stringify(payload);
    window.localStorage.setItem(storageKey, serialized);
    window.localStorage.setItem(legacyStorageKey, serialized);
    if (Object.keys(sanitizedPendingChatTurns).length > 0) {
      window.localStorage.setItem(
        pendingChatStorageKey,
        JSON.stringify({
          _persistedAt: persistedAt,
          pendingChatTurns: sanitizedPendingChatTurns,
        }),
      );
    } else {
      window.localStorage.removeItem(pendingChatStorageKey);
    }
  } catch {}
}
