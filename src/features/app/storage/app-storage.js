export const storageKey = "command-center-ui-state-v2";
export const themeStorageKey = "command-center-theme";
export const promptHistoryStorageKey = "command-center-prompt-history-v1";
export const promptDraftStorageKey = "command-center-prompt-drafts-v1";
export const pendingChatStorageKey = "command-center-pending-chat-v1";
export const defaultTab = "timeline";
export const defaultSessionUser = "command-center";
export const promptHistoryLimit = 50;
export const defaultChatFontSize = "small";
export const minInspectorPanelWidth = 300;
export const maxInspectorPanelWidth = 720;
export const defaultInspectorPanelWidth = 380;

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

export function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      activeTab: parsed?.activeTab || defaultTab,
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      fastMode: Boolean(parsed?.fastMode),
      thinkMode: typeof parsed?.thinkMode === "string" ? parsed.thinkMode : "off",
      model: parsed?.model || "",
      agentId: parsed?.agentId || "main",
      sessionUser: parsed?.sessionUser || defaultSessionUser,
      inspectorPanelWidth: sanitizeInspectorPanelWidth(parsed?.inspectorPanelWidth),
      chatFontSizeBySessionUser: sanitizeChatFontSizeMap(parsed?.chatFontSizeBySessionUser),
      dismissedTaskRelationshipIdsByConversation: sanitizeDismissedTaskRelationshipsMap(parsed?.dismissedTaskRelationshipIdsByConversation),
      promptDraftsByConversation: sanitizePromptDraftsMap(parsed?.promptDraftsByConversation),
    };
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

export function mergePendingConversation(snapshotMessages = [], pendingEntry, pendingLabel) {
  if (!pendingEntry) {
    return snapshotMessages;
  }

  const hasAssistantReply = snapshotMessages.some(
    (message) => message.role === "assistant" && Number(message.timestamp || 0) >= Number(pendingEntry.startedAt || 0),
  );

  if (hasAssistantReply) {
    return snapshotMessages;
  }

  const latestUserMessage = [...snapshotMessages].reverse().find((message) => message.role === "user");
  const hasPendingUserMessage =
    String(latestUserMessage?.content || "") === String(pendingEntry.userMessage?.content || "");

  const merged = hasPendingUserMessage ? [...snapshotMessages] : [...snapshotMessages, pendingEntry.userMessage];
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
