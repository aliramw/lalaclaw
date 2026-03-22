import type { ChatControllerEntry, ChatMessage, ChatRequestBody } from "@/types/chat";

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
  return {
    model: typeof entry.model === "string" ? entry.model : undefined,
    agentId: typeof entry.agentId === "string" ? entry.agentId : undefined,
    sessionUser: typeof entry.sessionUser === "string" ? entry.sessionUser : undefined,
    assistantMessageId,
    ...(userLabel ? { userLabel } : {}),
    fastMode: Boolean(entry.fastMode),
    messages: messages
      .filter((message) => !message.pending)
      .map(({ role, content, attachments }) => ({
        role,
        content,
        ...(attachments?.length ? { attachments } : {}),
      })),
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
