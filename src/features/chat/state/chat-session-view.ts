import type { ChatMessage, PendingChatTurn } from "@/types/chat";
import { buildPendingConversationOverlayMessages } from "@/features/chat/state/chat-pending-conversation";
import {
  buildHydratedConversationWithLocalTail,
  buildStabilizedHydratedConversationWithLocalState,
} from "@/features/chat/state/chat-settled-conversation";

function cloneMessage(message: ChatMessage = { role: "assistant" }) {
  return {
    ...message,
    ...(Array.isArray(message.attachments)
      ? {
          attachments: message.attachments.map((attachment) => ({ ...attachment })),
        }
      : {}),
  };
}

function normalizeMessageId(message: ChatMessage | null | undefined) {
  return String(message?.id || "").trim();
}

function normalizeMessageTimestamp(message: ChatMessage | null | undefined) {
  const next = Number(message?.timestamp || 0);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function buildAttachmentMatchFingerprint(message: ChatMessage | null | undefined) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  return attachments
    .map((attachment) => (
      String(
        attachment?.id
        || attachment?.storageKey
        || attachment?.fullPath
        || attachment?.path
        || attachment?.name
        || attachment?.previewUrl
        || "",
      ).trim()
    ))
    .filter(Boolean)
    .join("|");
}

function matchesPendingUserMessage(message: ChatMessage | null | undefined, pendingEntry: PendingChatTurn | null | undefined) {
  if (!message || message?.role !== "user" || !pendingEntry?.userMessage) {
    return false;
  }

  const pendingUserId = normalizeMessageId(pendingEntry.userMessage);
  const messageId = normalizeMessageId(message);
  if (pendingUserId && messageId) {
    if (pendingUserId === messageId) {
      return true;
    }
  }

  if (String(message?.content || "") !== String(pendingEntry.userMessage.content || "")) {
    return false;
  }

  const pendingAttachmentFingerprint = buildAttachmentMatchFingerprint(pendingEntry.userMessage);
  if (pendingAttachmentFingerprint) {
    const messageAttachmentFingerprint = buildAttachmentMatchFingerprint(message);
    if (messageAttachmentFingerprint !== pendingAttachmentFingerprint) {
      return false;
    }
  }

  const timestamp = normalizeMessageTimestamp(message);
  const expectedTimestamp = normalizeMessageTimestamp(pendingEntry.userMessage);
  const startedAt = Number(pendingEntry?.startedAt || 0);
  const matchThreshold = expectedTimestamp || startedAt || 0;

  return !matchThreshold || !timestamp || timestamp >= matchThreshold;
}

function matchesPendingAssistantMessage(message: ChatMessage | null | undefined, pendingEntry: PendingChatTurn | null | undefined) {
  if (!message || message?.role !== "assistant" || !pendingEntry) {
    return false;
  }

  const pendingAssistantId = String(pendingEntry?.assistantMessageId || "").trim();
  const messageId = normalizeMessageId(message);
  if (pendingAssistantId && messageId) {
    return pendingAssistantId === messageId;
  }

  const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || 0);
  return pendingTimestamp > 0 && normalizeMessageTimestamp(message) === pendingTimestamp;
}

function buildSettledConversationMessages(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  { stripPendingAssistantMatch = false, stripPendingUserMatch = true } = {},
) {
  return (messages || []).reduce<ChatMessage[]>((next, message) => {
    if (!message) {
      return next;
    }

    if (message?.pending || message?.streaming) {
      return next;
    }

    if (stripPendingUserMatch && matchesPendingUserMessage(message, pendingEntry)) {
      return next;
    }

    if (stripPendingAssistantMatch && matchesPendingAssistantMessage(message, pendingEntry)) {
      return next;
    }

    const nextMessage = cloneMessage(message);
    delete nextMessage.pending;
    delete nextMessage.streaming;
    next.push(nextMessage);
    return next;
  }, []);
}

function buildPendingConversationMessages({
  messages = [],
  pendingEntry = null,
  pendingLabel = "",
  localMessages = [],
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  pendingLabel?: string;
  localMessages?: ChatMessage[];
} = {}) {
  return buildPendingConversationOverlayMessages(
    messages,
    pendingEntry,
    pendingLabel,
    localMessages,
  );
}

function buildSettledPendingConversationMessages({
  messages = [],
  pendingEntry = null,
  pendingLabel = "",
  localMessages = [],
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  pendingLabel?: string;
  localMessages?: ChatMessage[];
} = {}) {
  return buildSettledConversationMessages(
    buildPendingConversationMessages({
      messages,
      pendingEntry,
      pendingLabel,
      localMessages,
    }),
    pendingEntry,
  );
}

export function buildHydratedPendingConversationMessages({
  messages = [],
  pendingEntry = null,
  pendingLabel = "",
  localMessages = [],
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  pendingLabel?: string;
  localMessages?: ChatMessage[];
} = {}) {
  return buildPendingConversationMessages({
    messages,
    pendingEntry,
    pendingLabel,
    localMessages,
  });
}

function buildHydratedConversationBaseMessages({
  messages = [],
  pendingEntry = null,
  localMessages = [],
  localMessagesWithoutPending = [],
  localHasLivePendingAssistant = false,
  clearPending = false,
  allowEmptySnapshotLocalTail = true,
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  localMessagesWithoutPending?: ChatMessage[];
  localHasLivePendingAssistant?: boolean;
  clearPending?: boolean;
  allowEmptySnapshotLocalTail?: boolean;
} = {}) {
  if (pendingEntry && (localHasLivePendingAssistant || !clearPending)) {
    return messages;
  }

  return buildHydratedConversationWithLocalTail(
    messages,
    clearPending ? localMessagesWithoutPending : localMessages,
    { allowEmptySnapshot: allowEmptySnapshotLocalTail },
  );
}

function buildStabilizedConversationMessages({
  hydratedConversation = [],
  localMessages = [],
  allowEmptySnapshotLocalTail = true,
}: {
  hydratedConversation?: ChatMessage[];
  localMessages?: ChatMessage[];
  allowEmptySnapshotLocalTail?: boolean;
} = {}) {
  return buildStabilizedHydratedConversationWithLocalState(hydratedConversation, localMessages, {
    allowEmptySnapshot: allowEmptySnapshotLocalTail,
  });
}

function buildStabilizedHydratedConversationMessages({
  messages = [],
  pendingEntry = null,
  snapshotHasAssistantReply = false,
  localHasLivePendingAssistant = false,
  clearPending = false,
  localHasSettledAssistantReply = false,
  snapshotIncludesPendingUserMessage = false,
  localMessages = [],
  localMessagesWithoutPending = [],
  pendingLabel = "",
  allowEmptySnapshotLocalTail = true,
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  snapshotHasAssistantReply?: boolean;
  localHasLivePendingAssistant?: boolean;
  clearPending?: boolean;
  localHasSettledAssistantReply?: boolean;
  snapshotIncludesPendingUserMessage?: boolean;
  localMessages?: ChatMessage[];
  localMessagesWithoutPending?: ChatMessage[];
  pendingLabel?: string;
  allowEmptySnapshotLocalTail?: boolean;
} = {}) {
  const effectiveLocalMessages = pendingEntry && (!snapshotHasAssistantReply || localHasLivePendingAssistant)
    ? (localHasSettledAssistantReply ? localMessagesWithoutPending : localMessages)
    : [];
  const mergedConversationWithLocalTail = buildHydratedConversationBaseMessages({
    messages,
    pendingEntry,
    localMessages,
    localMessagesWithoutPending,
    localHasLivePendingAssistant,
    clearPending,
    allowEmptySnapshotLocalTail,
  });
  const hydratedConversation = clearPending
    ? (
        pendingEntry && (
          (localHasSettledAssistantReply && !snapshotHasAssistantReply)
          || (snapshotHasAssistantReply && !snapshotIncludesPendingUserMessage)
        )
          ? buildHydratedPendingConversationMessages({
              messages: mergedConversationWithLocalTail,
              pendingEntry,
              pendingLabel,
              localMessages: localMessagesWithoutPending,
            })
          : mergedConversationWithLocalTail
      )
    : buildHydratedPendingConversationMessages({
        messages: mergedConversationWithLocalTail,
        pendingEntry,
        pendingLabel,
        localMessages: effectiveLocalMessages,
      });

  return {
    hydratedConversation,
    stabilizedConversation: buildStabilizedConversationMessages({
      hydratedConversation,
      localMessages,
      allowEmptySnapshotLocalTail,
    }),
  };
}
