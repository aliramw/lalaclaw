import type { ChatControllerEntry, ChatMessage } from "@/types/chat";

const OPTIMISTIC_USER_MATCH_WINDOW_MS = 5000;

function buildAttachmentFingerprint(attachments: unknown = []) {
  if (!Array.isArray(attachments)) {
    return "";
  }

  return attachments
    .map((attachment) => [
      String(attachment?.id || "").trim(),
      String(attachment?.path || attachment?.fullPath || "").trim(),
      String(attachment?.name || "").trim(),
      String(attachment?.mimeType || "").trim(),
      String(attachment?.kind || "").trim(),
    ].join("::"))
    .filter(Boolean)
    .join("|");
}

function hasEquivalentUserMessage(messages: ChatMessage[] = [], userMessage: ChatMessage | null | undefined) {
  if (!userMessage || userMessage.role !== "user") {
    return false;
  }

  const expectedContent = String(userMessage.content || "");
  const expectedTimestamp = Number(userMessage.timestamp || 0);
  const expectedAttachmentFingerprint = buildAttachmentFingerprint(userMessage.attachments);

  return messages.some((message) => {
    if (message?.role !== "user") {
      return false;
    }

    if (String(message.content || "") !== expectedContent) {
      return false;
    }

    const messageAttachmentFingerprint = buildAttachmentFingerprint(message.attachments);
    if (expectedAttachmentFingerprint && messageAttachmentFingerprint !== expectedAttachmentFingerprint) {
      return false;
    }

    const messageTimestamp = Number(message.timestamp || 0);
    if (!expectedTimestamp || !messageTimestamp) {
      return true;
    }

    return Math.abs(messageTimestamp - expectedTimestamp) <= OPTIMISTIC_USER_MATCH_WINDOW_MS;
  });
}

export function createEntryFingerprint(entry: ChatControllerEntry = {}) {
  const attachmentSignature = (entry.attachments || [])
    .map((attachment) => [
      attachment?.path || attachment?.fullPath || attachment?.name || "",
      attachment?.size || 0,
      attachment?.mimeType || "",
      attachment?.kind || "",
    ].join(":"))
    .sort()
    .join("|");

  return JSON.stringify({
    key: String(entry.key || "").trim(),
    content: String(entry.content || "").replace(/\r\n/g, "\n").trim(),
    attachments: attachmentSignature,
  });
}

export function withOptimisticTurnIds(entry: ChatControllerEntry = {}) {
  const pendingTimestamp = Number(entry.pendingTimestamp || 0) || Date.now();
  const entryIdentity = String(entry.id || entry.timestamp || pendingTimestamp).trim();
  const fallbackIdentity = entryIdentity || String(pendingTimestamp);
  const userMessageId =
    typeof entry.userMessageId === "string" && entry.userMessageId.trim()
      ? entry.userMessageId.trim()
      : `msg-user-${fallbackIdentity}`;
  const assistantMessageId =
    typeof entry.assistantMessageId === "string" && entry.assistantMessageId.trim()
      ? entry.assistantMessageId.trim()
      : `msg-assistant-pending-${pendingTimestamp}`;

  return {
    ...entry,
    assistantMessageId,
    pendingTimestamp,
    userMessageId,
  };
}

export function createUserMessage(entry: ChatControllerEntry = {}): ChatMessage {
  return {
    id: String(entry.userMessageId || `msg-user-${entry.timestamp || Date.now()}`),
    role: "user",
    content: entry.content || (entry.attachments?.length ? `已发送 ${entry.attachments.length} 个附件` : ""),
    timestamp: entry.timestamp,
    ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
  };
}

export function createPendingAssistantMessage(entry: ChatControllerEntry = {}, thinkingPlaceholder = ""): ChatMessage {
  const pendingTimestamp = Number(entry.pendingTimestamp || 0) || Date.now();
  return {
    id: String(entry.assistantMessageId || `msg-assistant-pending-${pendingTimestamp}`),
    role: "assistant",
    content: thinkingPlaceholder,
    timestamp: pendingTimestamp,
    pending: true,
  };
}

export function hasMessageId(messages: ChatMessage[] = [], messageId = "") {
  const normalizedId = String(messageId || "").trim();
  if (!normalizedId) {
    return false;
  }

  return messages.some((item) => String(item?.id || "").trim() === normalizedId);
}

export function ensureOptimisticTurnMessages(
  current: ChatMessage[] = [],
  entry: ChatControllerEntry = {},
  thinkingPlaceholder = "",
  { includePendingPlaceholder = true, includeUserMessage = true } = {},
) {
  const next = Array.isArray(current) ? [...current] : [];
  const userMessage = createUserMessage(entry);
  const pendingMessage = createPendingAssistantMessage(entry, thinkingPlaceholder);

  if (includeUserMessage && !hasMessageId(next, userMessage.id) && !hasEquivalentUserMessage(next, userMessage)) {
    next.push(userMessage);
  }

  if (includePendingPlaceholder && !hasMessageId(next, pendingMessage.id)) {
    next.push(pendingMessage);
  }

  return next;
}

export function removeOptimisticTurnMessages(current: ChatMessage[] = [], entry: ChatControllerEntry = {}) {
  const next = Array.isArray(current) ? [...current] : [];
  const userMessageId = String(entry.userMessageId || "").trim();
  const assistantMessageId = String(entry.assistantMessageId || "").trim();
  const pendingTimestamp = Number(entry.pendingTimestamp || 0);

  return next.filter((message) => {
    const messageId = String(message?.id || "").trim();
    if (userMessageId && messageId === userMessageId) {
      return false;
    }
    if (assistantMessageId && messageId === assistantMessageId) {
      return false;
    }
    if (pendingTimestamp && Number(message?.timestamp || 0) === pendingTimestamp && message?.pending) {
      return false;
    }
    return true;
  });
}

export function replacePendingAssistantMessage(
  current: ChatMessage[] = [],
  pendingTimestamp: number | undefined,
  content: string,
  tokenBadge = "",
  streaming = false,
  messageId = "",
) {
  const next = Array.isArray(current) ? [...current] : [];
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content,
    timestamp: pendingTimestamp,
    ...(messageId ? { id: messageId } : {}),
    ...(tokenBadge ? { tokenBadge } : {}),
    ...(streaming ? { streaming: true } : {}),
  };

  const messageIdIndex = messageId
    ? next.findIndex((item) => item?.role === "assistant" && String(item?.id || "") === messageId)
    : -1;
  if (messageIdIndex >= 0) {
    next[messageIdIndex] = assistantMessage;
    return next;
  }

  const pendingIndex = next.findIndex((item) => item?.pending && item.timestamp === pendingTimestamp);
  if (pendingIndex >= 0) {
    next[pendingIndex] = assistantMessage;
    return next;
  }

  const existingIndex = next.findIndex((item) => item?.role === "assistant" && !item?.pending && item.timestamp === pendingTimestamp);
  if (existingIndex >= 0) {
    next[existingIndex] = assistantMessage;
    return next;
  }

  const trailingAssistantIndex = [...next]
    .map((item, index) => ({ item, index }))
    .reverse()
    .find(({ item }) => item?.role === "assistant")?.index ?? -1;
  if (trailingAssistantIndex >= 0 && trailingAssistantIndex === next.length - 1) {
    const previousAssistantMessage = { ...(next[trailingAssistantIndex] || {}) };
    delete previousAssistantMessage.pending;
    delete previousAssistantMessage.streaming;
    next[trailingAssistantIndex] = {
      ...previousAssistantMessage,
      ...assistantMessage,
    };
    return next;
  }

  next.push(assistantMessage);
  return next;
}

export function replaceAssistantPreservingTurn(
  current: ChatMessage[] = [],
  entry: ChatControllerEntry = {},
  thinkingPlaceholder = "",
  content: string,
  tokenBadge = "",
  streaming = false,
  messageId = "",
) {
  const userMessage = createUserMessage(entry);
  const currentMessages = Array.isArray(current) ? [...current] : [];
  const hasUserMessage = hasMessageId(currentMessages, userMessage.id) || hasEquivalentUserMessage(currentMessages, userMessage);
  let withUserTurn = currentMessages;

  if (!hasUserMessage) {
    const assistantIndex = currentMessages.findIndex((message) => message?.role === "assistant");
    if (assistantIndex >= 0) {
      withUserTurn = [...currentMessages];
      withUserTurn.splice(assistantIndex, 0, userMessage);
    } else {
      withUserTurn = ensureOptimisticTurnMessages(
        currentMessages,
        entry,
        thinkingPlaceholder,
        { includePendingPlaceholder: false, includeUserMessage: true },
      );
    }
  }

  return replacePendingAssistantMessage(
    withUserTurn,
    Number(entry.pendingTimestamp || 0) || Date.now(),
    content,
    tokenBadge,
    streaming,
    messageId,
  );
}
