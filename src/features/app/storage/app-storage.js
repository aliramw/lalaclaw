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
export const minInspectorPanelWidth = 300;
export const maxInspectorPanelWidth = 720;
export const defaultInspectorPanelWidth = 380;

function normalizeAgentId(value = "main") {
  return String(value || "main").trim() || "main";
}

function resolveAgentIdFromTabId(tabId = "") {
  const normalized = String(tabId || "").trim();
  if (!normalized.startsWith("agent:")) {
    return "main";
  }
  return normalizeAgentId(normalized.slice("agent:".length));
}

export function createAgentTabId(agentId = "main") {
  return `agent:${normalizeAgentId(agentId)}`;
}

function sanitizeSessionUser(value = defaultSessionUser) {
  const normalized = String(value || defaultSessionUser)
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

function sanitizeChatFontSize(value) {
  return value === "medium" || value === "large" ? value : defaultChatFontSize;
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

function sanitizeDismissedTaskRelationshipsMap(value) {
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

function sanitizePromptDraftsMap(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, draft]) => [key, typeof draft === "string" ? draft : String(draft || "")])
      .filter(([, draft]) => draft.length > 0),
  );
}

function sanitizeChatScrollTopMap(value) {
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

        const scrollTop = Number(scrollState.scrollTop);
        if (!Number.isFinite(scrollTop) || scrollTop < 0) {
          return null;
        }

        const anchorNodeId = String(scrollState.anchorNodeId || "").trim();
        const anchorMessageId = String(scrollState.anchorMessageId || "").trim();
        const anchorOffset = Number(scrollState.anchorOffset);
        const atBottom = Boolean(scrollState.atBottom);

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
      .filter(Boolean),
  );
}

function sanitizeMessagesByTabId(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, messages]) => Boolean(String(key || "").trim()) && Array.isArray(messages))
      .map(([key, messages]) => [String(key || "").trim(), sanitizeMessagesForStorage(messages)]),
  );
}

function sanitizeChatTabs(value, fallbackSessionUser = defaultSessionUser, fallbackAgentId = "main") {
  if (!Array.isArray(value) || !value.length) {
    return [
      {
        id: createAgentTabId(fallbackAgentId),
        agentId: normalizeAgentId(fallbackAgentId),
        sessionUser: sanitizeSessionUser(fallbackSessionUser),
      },
    ];
  }

  const seen = new Set();
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
    .filter(Boolean);
}

function sanitizeTabMetaMap(value, tabs = []) {
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
        },
      ]),
    );
  }

  return Object.fromEntries(
    tabs.map((tab) => {
      const meta = value?.[tab.id] || {};
      return [
        tab.id,
        {
          agentId: resolveAgentIdFromTabId(tab.id) || normalizeAgentId(meta.agentId || tab.agentId),
          sessionUser: sanitizeSessionUser(meta.sessionUser || tab.sessionUser),
          model: String(meta.model || "").trim(),
          fastMode: Boolean(meta.fastMode),
          thinkMode: typeof meta.thinkMode === "string" ? meta.thinkMode : "off",
        },
      ];
    }),
  );
}

function buildKnownTabs(parsed, chatTabs, fallbackAgentId, fallbackSessionUser) {
  const knownTabs = new Map(
    (chatTabs || []).map((tab) => [
      tab.id,
      {
        id: tab.id,
        agentId: normalizeAgentId(tab.agentId || fallbackAgentId),
        sessionUser: sanitizeSessionUser(tab.sessionUser || fallbackSessionUser),
      },
    ]),
  );

  const registerTab = (tabId, meta = {}) => {
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

  Object.entries(parsed?.tabMetaById || {}).forEach(([tabId, meta]) => registerTab(tabId, meta));
  Object.keys(parsed?.messagesByTabId || {}).forEach((tabId) => registerTab(tabId));

  return [...knownTabs.values()];
}

function loadParsedStorageState(raw) {
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
    };
  }

  return {
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
    chatFontSizeBySessionUser: sanitizeChatFontSizeMap(parsed?.chatFontSizeBySessionUser),
    dismissedTaskRelationshipIdsByConversation: sanitizeDismissedTaskRelationshipsMap(parsed?.dismissedTaskRelationshipIdsByConversation),
    promptDraftsByConversation: sanitizePromptDraftsMap(parsed?.promptDraftsByConversation),
  };
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

export function loadStoredTheme() {
  try {
    const raw = window.localStorage.getItem(themeStorageKey);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  } catch {
    return "system";
  }
}

export function loadStoredPromptHistory() {
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
          value
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
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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

export function persistChatScrollTops(value) {
  try {
    window.localStorage.setItem(chatScrollStorageKey, JSON.stringify(sanitizeChatScrollTopMap(value)));
  } catch {}
}

export function createConversationKey(sessionUser = defaultSessionUser, agentId = "main") {
  return `${sessionUser}:${agentId}`;
}

export function appendPromptHistory(historyMap, key, prompt) {
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

export function extractUserPromptHistory(messages = []) {
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .slice(-promptHistoryLimit);
}

export function sanitizeMessagesForStorage(messages = []) {
  return messages
    .filter((message) => !message.pending)
    .slice(-80)
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      ...(message.tokenBadge ? { tokenBadge: message.tokenBadge } : {}),
      ...(message.streaming ? { streaming: true } : {}),
    }));
}

export function mergeConversationAttachments(snapshotMessages = [], localMessages = []) {
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

    nextMessages[matchIndex] = {
      ...nextMessages[matchIndex],
      attachments: localMessage.attachments,
    };
    usedIndices.add(matchIndex);
  });

  return nextMessages;
}

function hasSnapshotAssistantReply(snapshotMessages = [], pendingEntry) {
  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);
  if (pendingUserIndex === -1) {
    return false;
  }

  const startedAt = Number(pendingEntry?.startedAt || 0);

  return snapshotMessages.slice(pendingUserIndex + 1).some((message) => {
    if (message?.role !== "assistant" || !Boolean(String(message.content || "").trim())) {
      return false;
    }

    const timestamp = Number(message.timestamp || 0);
    return !startedAt || !timestamp || timestamp >= startedAt;
  });
}

function findPendingUserIndex(snapshotMessages = [], pendingEntry) {
  const targetContent = String(pendingEntry?.userMessage?.content || "");
  if (!targetContent) {
    return -1;
  }

  const expectedTimestamp = Number(pendingEntry?.userMessage?.timestamp || 0);
  const startedAt = Number(pendingEntry?.startedAt || expectedTimestamp || 0);
  const matchThreshold = startedAt || expectedTimestamp || 0;
  const timedMatches = [];
  const untimedMatches = [];

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
      return timedMatches[0].index;
    }

    return -1;
  }

  if (!matchThreshold && untimedMatches.length === 1) {
    return untimedMatches[0];
  }

  return -1;
}

function findLocalStreamingAssistant(localMessages = [], pendingEntry) {
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

function findSnapshotPendingAssistantIndex(snapshotMessages = [], pendingEntry) {
  const startedAt = Number(pendingEntry?.startedAt || 0);
  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);

  if (pendingUserIndex >= 0) {
    for (let index = snapshotMessages.length - 1; index > pendingUserIndex; index -= 1) {
      const message = snapshotMessages[index];
      if (message?.role !== "assistant" || !Boolean(String(message.content || "").trim())) {
        continue;
      }

      const timestamp = Number(message.timestamp || 0);
      if (!startedAt || !timestamp || timestamp >= startedAt) {
        return index;
      }
    }
    return -1;
  }

  for (let index = snapshotMessages.length - 1; index >= 0; index -= 1) {
    const message = snapshotMessages[index];
    if (message?.role !== "assistant" || !Boolean(String(message.content || "").trim())) {
      continue;
    }
    const timestamp = Number(message.timestamp || 0);
    if (!startedAt || timestamp >= startedAt) {
      return index;
    }
  }

  return -1;
}

function mergeStreamingAssistant(snapshotMessages = [], pendingEntry, localStreamingAssistant) {
  if (!localStreamingAssistant) {
    return snapshotMessages;
  }

  const nextMessages = [...snapshotMessages];
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);
  if (snapshotAssistantIndex === -1) {
    return [...nextMessages, localStreamingAssistant];
  }

  const snapshotAssistant = nextMessages[snapshotAssistantIndex];
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

function insertPendingUserMessage(snapshotMessages = [], pendingEntry) {
  const nextMessages = [...snapshotMessages];
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);

  if (snapshotAssistantIndex === -1) {
    nextMessages.push(pendingEntry.userMessage);
    return nextMessages;
  }

  nextMessages.splice(snapshotAssistantIndex, 0, pendingEntry.userMessage);
  return nextMessages;
}

export function mergePendingConversation(snapshotMessages = [], pendingEntry, pendingLabel, localMessages = []) {
  if (!pendingEntry) {
    return snapshotMessages;
  }

  const localStreamingAssistant = findLocalStreamingAssistant(localMessages, pendingEntry);
  if (hasSnapshotAssistantReply(snapshotMessages, pendingEntry)) {
    return mergeStreamingAssistant(snapshotMessages, pendingEntry, localStreamingAssistant);
  }

  const hasPendingUserMessage = findPendingUserIndex(snapshotMessages, pendingEntry) >= 0;

  const merged = hasPendingUserMessage ? [...snapshotMessages] : insertPendingUserMessage(snapshotMessages, pendingEntry);
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(merged, pendingEntry);

  if (localStreamingAssistant) {
    return [...merged, localStreamingAssistant];
  }

  if (snapshotAssistantIndex >= 0) {
    return merged;
  }

  return [
    ...merged,
    {
      role: "assistant",
      content: pendingLabel,
      timestamp: pendingEntry.pendingTimestamp,
      pending: true,
    },
  ];
}

export function hasAuthoritativePendingAssistantReply(snapshotMessages = [], pendingEntry) {
  return hasSnapshotAssistantReply(snapshotMessages, pendingEntry);
}
