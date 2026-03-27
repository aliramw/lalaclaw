import type { ChatAttachment, ChatControllerEntry, ChatMessage, PendingChatTurn } from "@/types/chat";
import { normalizeStatusKey } from "@/features/session/status-display";
import {
  createEmptyChatSessionState,
  getConversationRevision,
  normalizeChatSyncTransport,
  selectChatRunBusy,
  type ChatRunState,
  type ChatSessionState,
} from "@/features/chat/state/chat-session-state";

export type DashboardChatSessionState = ChatSessionState & {
  settledMessages: ChatMessage[];
  visibleMessages: ChatMessage[];
};

function cloneMessage(message: ChatMessage = { role: "assistant" }): ChatMessage {
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

function buildAttachmentFingerprint(attachments: ChatAttachment[] = []) {
  return attachments
    .map((attachment) => (
      String(
        attachment?.id
        || attachment?.storageKey
        || attachment?.fullPath
        || attachment?.path
        || attachment?.previewUrl
        || attachment?.name
        || "",
      ).trim()
    ))
    .filter(Boolean)
    .join("|");
}

function mergeEquivalentAttachments(
  currentAttachments: ChatAttachment[] = [],
  nextAttachments: ChatAttachment[] = [],
) {
  const mergedAttachments: ChatAttachment[] = [];

  [...currentAttachments, ...nextAttachments].forEach((attachment, index) => {
    const fingerprint = String(
      attachment?.id
      || attachment?.storageKey
      || attachment?.fullPath
      || attachment?.path
      || attachment?.previewUrl
      || attachment?.name
      || `index:${index}`,
    ).trim();
    const existingIndex = mergedAttachments.findIndex((candidate, candidateIndex) => {
      const candidateFingerprint = String(
        candidate?.id
        || candidate?.storageKey
        || candidate?.fullPath
        || candidate?.path
        || candidate?.previewUrl
        || candidate?.name
        || `index:${candidateIndex}`,
      ).trim();
      return candidateFingerprint === fingerprint;
    });

    if (existingIndex < 0) {
      mergedAttachments.push({ ...(attachment || {}) });
      return;
    }

    mergedAttachments[existingIndex] = {
      ...mergedAttachments[existingIndex],
      ...(attachment || {}),
    };
  });

  return mergedAttachments;
}

function mergeEquivalentPendingUserMessages(
  existingMessage: ChatMessage | null | undefined,
  nextMessage: ChatMessage | null | undefined,
) {
  const existing = existingMessage || { role: "user", content: "" };
  const next = nextMessage || { role: "user", content: "" };
  const mergedAttachments = mergeEquivalentAttachments(existing.attachments || [], next.attachments || []);

  return {
    ...next,
    ...existing,
    id: normalizeMessageId(existing) || normalizeMessageId(next) || undefined,
    timestamp: normalizeMessageTimestamp(existing) || normalizeMessageTimestamp(next) || undefined,
    ...(mergedAttachments.length ? { attachments: mergedAttachments } : {}),
  };
}

function matchesPendingUserMessage(
  message: ChatMessage | null | undefined,
  pendingEntry: PendingChatTurn | null | undefined,
) {
  if (!message || message.role !== "user" || !pendingEntry?.userMessage) {
    return false;
  }

  const pendingId = normalizeMessageId(pendingEntry.userMessage);
  const messageId = normalizeMessageId(message);
  if (pendingId && messageId && pendingId === messageId) {
    return true;
  }

  if (String(message.content || "") !== String(pendingEntry.userMessage.content || "")) {
    return false;
  }

  const pendingFingerprint = buildAttachmentFingerprint(pendingEntry.userMessage.attachments || []);
  const messageFingerprint = buildAttachmentFingerprint(message.attachments || []);
  if (pendingFingerprint && pendingFingerprint !== messageFingerprint) {
    return false;
  }

  const pendingTimestamp = normalizeMessageTimestamp(pendingEntry.userMessage) || Number(pendingEntry.startedAt || 0);
  const messageTimestamp = normalizeMessageTimestamp(message);
  if (!pendingTimestamp || !messageTimestamp) {
    return true;
  }

  return Math.abs(messageTimestamp - pendingTimestamp) <= 5000;
}

function buildConversationMessages(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  const nextMessages = (messages || []).reduce<ChatMessage[]>((items, message) => {
    if (!message) {
      return items;
    }

    const isPendingAssistantProjection =
      message.role === "assistant"
      && (message.pending || message.streaming);

    if (!isPendingAssistantProjection) {
      const normalizedMessage = cloneMessage({
        ...message,
        pending: undefined,
        streaming: undefined,
      });
      const explicitId = normalizeMessageId(normalizedMessage);
      if (explicitId) {
        const existingIndex = items.findIndex(
          (candidate) => candidate?.role === normalizedMessage.role && normalizeMessageId(candidate) === explicitId,
        );
        if (existingIndex >= 0) {
          items[existingIndex] = normalizedMessage;
          return items;
        }
      }

      if (normalizedMessage.role === "user" && pendingEntry && matchesPendingUserMessage(normalizedMessage, pendingEntry)) {
        const existingPendingUserIndex = items.findIndex(
          (candidate) => candidate?.role === "user" && matchesPendingUserMessage(candidate, pendingEntry),
        );
        if (existingPendingUserIndex >= 0) {
          items[existingPendingUserIndex] = mergeEquivalentPendingUserMessages(
            items[existingPendingUserIndex],
            normalizedMessage,
          );
          return items;
        }
      }

      items.push(normalizedMessage);
    }

    return items;
  }, []);

  if (pendingEntry?.userMessage && !nextMessages.some((message) => matchesPendingUserMessage(message, pendingEntry))) {
    const pendingAssistantId = String(pendingEntry.assistantMessageId || "").trim();
    const pendingTimestamp = Number(pendingEntry.pendingTimestamp || pendingEntry.startedAt || 0);
    const pendingUserMessage = cloneMessage({
      ...pendingEntry.userMessage,
      role: "user",
    });
    const insertionIndex = nextMessages.findIndex((message) => {
      if (message?.role !== "assistant") {
        return false;
      }

      const messageId = normalizeMessageId(message);
      const messageTimestamp = normalizeMessageTimestamp(message);
      return Boolean(
        (pendingAssistantId && messageId && messageId === pendingAssistantId)
          || (pendingTimestamp && messageTimestamp >= pendingTimestamp),
      );
    });

    if (insertionIndex >= 0) {
      nextMessages.splice(insertionIndex, 0, pendingUserMessage);
    } else {
      nextMessages.push(pendingUserMessage);
    }
  }

  return nextMessages;
}

function hasAuthoritativeAssistantReply(
  conversationMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!pendingEntry) {
    return false;
  }

  const pendingUserIndex = conversationMessages.findIndex((message) => matchesPendingUserMessage(message, pendingEntry));
  const pendingAssistantId = String(pendingEntry.assistantMessageId || "").trim();
  const pendingTimestamp = Number(pendingEntry.pendingTimestamp || pendingEntry.startedAt || 0);
  if (pendingUserIndex >= 0) {
    const assistantReplies = conversationMessages
      .slice(pendingUserIndex + 1)
      .filter((message) => message?.role === "assistant" && Boolean(String(message?.content || "").trim()));
    if (assistantReplies.length >= 2) {
      return true;
    }

    return assistantReplies.some((message) => {
      const messageId = normalizeMessageId(message);
      const messageTimestamp = normalizeMessageTimestamp(message);
      if (pendingAssistantId && messageId && messageId !== pendingAssistantId) {
        return true;
      }
      if (pendingTimestamp && messageTimestamp > pendingTimestamp) {
        return true;
      }

      return false;
    });
  }

  const startedAt = Number(pendingEntry.startedAt || pendingEntry.pendingTimestamp || 0);
  if (!startedAt) {
    return false;
  }

  return conversationMessages.some((message) => (
    message?.role === "assistant"
    && Boolean(String(message?.content || "").trim())
    && normalizeMessageTimestamp(message) >= startedAt
  ));
}

function hasPendingAssistantProjection(
  conversationMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!pendingEntry) {
    return false;
  }

  const pendingUserIndex = conversationMessages.findIndex((message) => matchesPendingUserMessage(message, pendingEntry));
  const candidateMessages =
    pendingUserIndex >= 0
      ? conversationMessages.slice(pendingUserIndex + 1)
      : conversationMessages;
  const pendingAssistantId = String(pendingEntry.assistantMessageId || "").trim();
  const pendingTimestamp = Number(pendingEntry.pendingTimestamp || pendingEntry.startedAt || 0);

  return candidateMessages.some((message) => {
    if (message?.role !== "assistant" || !String(message?.content || "").trim()) {
      return false;
    }

    const messageId = normalizeMessageId(message);
    const messageTimestamp = normalizeMessageTimestamp(message);
    if (pendingAssistantId && messageId && messageId === pendingAssistantId) {
      return true;
    }
    if (pendingTimestamp && messageTimestamp >= pendingTimestamp) {
      return true;
    }

    return false;
  });
}

function hasLocallySettledPendingAssistantProjection(
  conversationMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  return Boolean(
    pendingEntry?.suppressPendingPlaceholder
    && hasPendingAssistantProjection(conversationMessages, pendingEntry)
  );
}

function deriveDashboardRunState({
  conversationKey = "",
  conversationMessages = [],
  pendingEntry = null,
  rawBusy = false,
  sessionStatus = "",
}: {
  conversationKey?: string;
  conversationMessages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  rawBusy?: boolean;
  sessionStatus?: string;
} = {}): ChatRunState {
  const normalizedStatus = normalizeStatusKey(sessionStatus);
  const hasAuthoritativeReply = hasAuthoritativeAssistantReply(conversationMessages, pendingEntry);
  const hasTrackedPendingTurn = Boolean(pendingEntry && !pendingEntry?.stopped);
  const hasPendingTurn = Boolean(pendingEntry && !pendingEntry?.stopped && !hasAuthoritativeReply);
  const hasLocallySettledPendingAssistant = hasLocallySettledPendingAssistantProjection(
    conversationMessages,
    pendingEntry,
  );
  const streamText = String(pendingEntry?.streamText || "").trim();

  let status: ChatRunState["status"] = "idle";
  if (normalizedStatus === "failed") {
    status = "failed";
  } else if (pendingEntry?.stopped && rawBusy) {
    status = "aborting";
  } else if (hasLocallySettledPendingAssistant && !rawBusy) {
    status = "idle";
  } else if (hasPendingTurn) {
    status = streamText ? "streaming" : "starting";
  } else if (rawBusy && hasTrackedPendingTurn) {
    status = streamText ? "streaming" : "starting";
  } else if (rawBusy && (normalizedStatus === "running" || normalizedStatus === "dispatching")) {
    status = streamText ? "streaming" : "starting";
  }

  const runIsBusy = selectChatRunBusy({ status });

  return {
    status,
    runId: runIsBusy
      ? String(conversationKey || pendingEntry?.assistantMessageId || pendingEntry?.key || "").trim() || null
      : null,
    userTurnId: String(pendingEntry?.userMessage?.id || "").trim() || null,
    streamText: runIsBusy ? streamText : "",
    toolStream: { active: false },
    startedAt: runIsBusy ? Number(pendingEntry?.startedAt || pendingEntry?.userMessage?.timestamp || 0) || null : null,
    lastDeltaAt: runIsBusy ? Number(pendingEntry?.lastDeltaAt || pendingEntry?.pendingTimestamp || 0) || null : null,
    error: status === "failed" ? String(sessionStatus || "").trim() || null : null,
  };
}

function buildAssistantOverlayMessage({
  pendingEntry = null,
  run = null,
  thinkingPlaceholder = "",
}: {
  pendingEntry?: PendingChatTurn | null;
  run?: Partial<ChatRunState> | null;
  thinkingPlaceholder?: string;
}) {
  if (!pendingEntry || !selectChatRunBusy(run)) {
    return null;
  }

  const streamText = String(run?.streamText || "").trim();
  if (streamText) {
    return {
      id: String(pendingEntry.assistantMessageId || run?.runId || `msg-assistant-overlay-${pendingEntry.pendingTimestamp || Date.now()}`),
      role: "assistant" as const,
      content: streamText,
      timestamp: Number(run?.lastDeltaAt || pendingEntry.pendingTimestamp || pendingEntry.startedAt || Date.now()),
      streaming: true,
    };
  }

  if (pendingEntry.suppressPendingPlaceholder) {
    return null;
  }

  return {
    id: String(pendingEntry.assistantMessageId || `msg-assistant-pending-${pendingEntry.pendingTimestamp || Date.now()}`),
    role: "assistant" as const,
    content: thinkingPlaceholder,
    timestamp: Number(pendingEntry.pendingTimestamp || pendingEntry.startedAt || Date.now()),
    pending: true,
  };
}

export function buildDashboardChatSessionState({
  agentId = "main",
  attachments = [],
  conversationKey = "",
  draft = "",
  messages = [],
  pendingEntry = null,
  queue = [],
  rawBusy = false,
  recovering = false,
  sessionStatus = "",
  source = "history",
  thinkingPlaceholder = "",
  transport = "idle",
}: {
  agentId?: string;
  attachments?: ChatAttachment[];
  conversationKey?: string;
  draft?: string;
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  queue?: ChatControllerEntry[];
  rawBusy?: boolean;
  recovering?: boolean;
  sessionStatus?: string;
  source?: ChatSessionState["conversation"]["source"];
  thinkingPlaceholder?: string;
  transport?: unknown;
} = {}): DashboardChatSessionState {
  const initialState = createEmptyChatSessionState();
  const conversationMessages = buildConversationMessages(messages, pendingEntry);
  const run = deriveDashboardRunState({
    conversationKey: conversationKey || `${agentId}::conversation`,
    conversationMessages,
    pendingEntry,
    rawBusy,
    sessionStatus,
  });
  const visibleMessages = [...conversationMessages];
  const hasPendingProjection = hasPendingAssistantProjection(conversationMessages, pendingEntry);

  if (pendingEntry && !hasAuthoritativeAssistantReply(conversationMessages, pendingEntry) && !hasPendingProjection) {
    const assistantOverlay = buildAssistantOverlayMessage({
      pendingEntry,
      run,
      thinkingPlaceholder,
    });
    if (assistantOverlay) {
      visibleMessages.push(assistantOverlay);
    }
  }

  return {
    ...initialState,
    settledMessages: conversationMessages,
    conversation: {
      messages: conversationMessages,
      revision: getConversationRevision(conversationMessages),
      source,
    },
    run,
    composer: {
      draft,
      attachments,
      queue,
    },
    sync: {
      transport: normalizeChatSyncTransport(transport),
      recovering,
      hydrated: conversationMessages.length > 0,
      lastSnapshotAt: null,
      lastHistoryAt: getConversationRevision(conversationMessages),
    },
    visibleMessages,
  };
}
