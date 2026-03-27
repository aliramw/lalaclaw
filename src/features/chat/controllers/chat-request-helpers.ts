import type { ChatControllerEntry, ChatMessage, ChatRequestBody, ChatRequestMessage } from "@/types/chat";

function areEquivalentRequestMessages(
  left: Partial<ChatRequestMessage> = {},
  right: Partial<ChatRequestMessage> = {},
) {
  return String(left?.role || "") === String(right?.role || "")
    && String(left?.content || "") === String(right?.content || "")
    && JSON.stringify(left?.attachments || []) === JSON.stringify(right?.attachments || []);
}

export function buildChatRequestBody({
  entry,
  assistantMessageId,
  messages,
  userLabel = "",
}: {
  entry: ChatControllerEntry;
  assistantMessageId: string;
  messages: ChatMessage[];
  userLabel?: string;
}): ChatRequestBody {
  const settledMessages = messages
    .filter((message) => !message.pending && !message.streaming)
    .map(({ role, content, attachments }) => ({
      role,
      content,
      ...(attachments?.length ? { attachments } : {}),
    }));
  const nextUserMessage = {
    role: "user",
    content: entry.content || (entry.attachments?.length ? `已发送 ${entry.attachments.length} 个附件` : ""),
    ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
  };
  const requestMessages = settledMessages.length && areEquivalentRequestMessages(settledMessages[settledMessages.length - 1], nextUserMessage)
    ? settledMessages
    : [...settledMessages, nextUserMessage];

  return {
    model: typeof entry.model === "string" ? entry.model : undefined,
    agentId: typeof entry.agentId === "string" ? entry.agentId : undefined,
    sessionUser: typeof entry.sessionUser === "string" ? entry.sessionUser : undefined,
    assistantMessageId,
    ...(userLabel ? { userLabel } : {}),
    fastMode: Boolean(entry.fastMode),
    messages: requestMessages,
    stream: true,
  };
}

export function getQueueState({
  targetTabId,
  queuedMessages = [],
  busy = false,
  busyByTabId = {},
  dispatchingTurnByTabId = {},
  inFlightTurnByTabId = {},
}: {
  targetTabId: string;
  queuedMessages?: ChatControllerEntry[];
  busy?: boolean;
  busyByTabId?: Record<string, boolean>;
  dispatchingTurnByTabId?: Record<string, unknown>;
  inFlightTurnByTabId?: Record<string, unknown>;
}) {
  const hasQueuedForTab = queuedMessages.some((item) => (item.tabId || targetTabId) === targetTabId);
  const isBusyForTarget = Object.prototype.hasOwnProperty.call(busyByTabId, targetTabId) ? busyByTabId[targetTabId] : busy;
  const hasDispatchingTurnForTarget = Boolean(dispatchingTurnByTabId[targetTabId]);
  const hasInFlightTurnForTarget = Boolean(inFlightTurnByTabId[targetTabId]);

  return {
    hasQueuedForTab,
    isBusyForTarget,
    hasDispatchingTurnForTarget,
    hasInFlightTurnForTarget,
  };
}

export function hasEquivalentQueuedEntry({
  queuedMessages = [],
  targetTabId,
  fingerprint,
  createEntryFingerprint,
}: {
  queuedMessages?: ChatControllerEntry[];
  targetTabId: string;
  fingerprint: string;
  createEntryFingerprint: (entry: ChatControllerEntry) => string;
}) {
  return queuedMessages.some(
    (item) =>
      (item.tabId || targetTabId) === targetTabId
      && createEntryFingerprint(item) === fingerprint,
  );
}
