import type { ChatAttachment, ChatControllerEntry, ChatMessage, PendingChatTurn } from "@/types/chat";
import { normalizeStatusKey } from "@/features/session/status-display";
import { collapseDuplicateConversationTurns } from "@/features/chat/state/chat-conversation-dedupe";
import {
  findSnapshotPendingAssistantIndex,
  hasSnapshotAdvancedPastPendingTurn,
} from "@/features/chat/state/chat-runtime-pending";
import { buildDurableConversationWithLocalTail } from "@/features/chat/state/chat-settled-conversation";
import { coerceAgentProgressStage } from "@/features/chat/state/chat-progress";
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

const DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS = 5 * 1000;
const DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS = 10 * 60 * 1000;

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

function normalizeAssistantConversationContent(content = "") {
  return String(content || "")
    .replace(/\[\[reply_to_current\]\]/gi, "")
    .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
    .replace(/<small>[\s\S]*?<\/small>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function choosePreferredAssistantReplay(previous: ChatMessage, next: ChatMessage) {
  const previousTokenBadge = String(previous.tokenBadge || "").trim();
  const nextTokenBadge = String(next.tokenBadge || "").trim();
  if (previousTokenBadge !== nextTokenBadge) {
    return nextTokenBadge.length > previousTokenBadge.length ? next : previous;
  }

  const previousContent = String(previous.content || "").trim();
  const nextContent = String(next.content || "").trim();
  if (previousContent !== nextContent) {
    return nextContent.length >= previousContent.length ? next : previous;
  }

  return previous;
}

function isAssistantReplayTimestampMatch(
  previous: ChatMessage | null | undefined,
  next: ChatMessage | null | undefined,
  pendingEntry: PendingChatTurn | null = null,
) {
  const previousTimestamp = normalizeMessageTimestamp(previous);
  const nextTimestamp = normalizeMessageTimestamp(next);
  if (!previousTimestamp || !nextTimestamp) {
    return true;
  }

  if (Math.abs(nextTimestamp - previousTimestamp) <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS) {
    return true;
  }

  const startedAt = Number(pendingEntry?.startedAt || pendingEntry?.userMessage?.timestamp || 0);
  return Boolean(
    startedAt
    && previousTimestamp >= startedAt
    && nextTimestamp >= startedAt
    && Math.abs(nextTimestamp - previousTimestamp) <= DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS
  );
}

function shouldCollapseAssistantPrefixReplay(
  previous: ChatMessage | null | undefined,
  next: ChatMessage | null | undefined,
  pendingEntry: PendingChatTurn | null = null,
) {
  if (previous?.role !== "assistant" || next?.role !== "assistant") {
    return false;
  }

  const previousId = normalizeMessageId(previous);
  const nextId = normalizeMessageId(next);
  if (previousId && nextId && previousId === nextId) {
    return true;
  }

  const previousContent = normalizeAssistantConversationContent(previous.content);
  const nextContent = normalizeAssistantConversationContent(next.content);
  if (!previousContent || !nextContent) {
    return false;
  }

  if (!isAssistantReplayTimestampMatch(previous, next, pendingEntry)) {
    return false;
  }

  if (previousContent === nextContent) {
    return true;
  }

  const shorter = previousContent.length <= nextContent.length ? previousContent : nextContent;
  const longer = previousContent.length > nextContent.length ? previousContent : nextContent;
  return longer.startsWith(shorter);
}

function mergePendingAssistantReplayCandidate(
  conversationMessages: ChatMessage[] = [],
  localAssistantCandidate: ChatMessage | null = null,
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!localAssistantCandidate || localAssistantCandidate.role !== "assistant") {
    return conversationMessages;
  }

  const pendingAssistantIndex = findPendingAssistantTranscriptIndex(conversationMessages, pendingEntry);
  if (pendingAssistantIndex < 0) {
    return conversationMessages;
  }

  const snapshotAssistantCandidate = conversationMessages[pendingAssistantIndex];
  if (!shouldCollapseAssistantPrefixReplay(snapshotAssistantCandidate, localAssistantCandidate, pendingEntry)) {
    return conversationMessages;
  }

  const preferred = choosePreferredAssistantReplay(snapshotAssistantCandidate, localAssistantCandidate);
  if (preferred === snapshotAssistantCandidate) {
    return conversationMessages;
  }

  const nextMessages = [...conversationMessages];
  nextMessages[pendingAssistantIndex] = cloneMessage({
    ...preferred,
    pending: undefined,
    streaming: undefined,
  });
  return nextMessages;
}

function findPendingAssistantCandidate(
  localMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!pendingEntry) {
    return null;
  }

  const assistantMessageId = String(pendingEntry.assistantMessageId || "").trim();
  const pendingTimestamp = Number(pendingEntry.pendingTimestamp || 0);

  return [...localMessages].reverse().find((message) => {
    if (message?.role !== "assistant") {
      return false;
    }

    const messageId = normalizeMessageId(message);
    if (assistantMessageId && messageId === assistantMessageId) {
      return true;
    }

    const timestamp = normalizeMessageTimestamp(message);
    return pendingTimestamp > 0 && timestamp === pendingTimestamp;
  }) || null;
}

function findPendingAssistantTranscriptIndex(
  conversationMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  if (assistantMessageId) {
    const directIndex = conversationMessages.findIndex(
      (message) => message?.role === "assistant" && normalizeMessageId(message) === assistantMessageId,
    );
    if (directIndex >= 0) {
      return directIndex;
    }
  }

  const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || pendingEntry?.startedAt || 0);
  if (!pendingTimestamp) {
    return -1;
  }

  return conversationMessages.findIndex(
    (message) => message?.role === "assistant" && normalizeMessageTimestamp(message) >= pendingTimestamp,
  );
}

function hasEquivalentAssistantMessage(
  conversationMessages: ChatMessage[] = [],
  candidate: ChatMessage | null = null,
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!candidate || candidate.role !== "assistant") {
    return false;
  }

  const candidateId = normalizeMessageId(candidate);
  const candidateContent = normalizeAssistantConversationContent(candidate.content);
  const pendingUserIndex = conversationMessages.findIndex((message) => matchesPendingUserMessage(message, pendingEntry));
  const candidateMessages =
    pendingUserIndex >= 0
      ? conversationMessages.slice(pendingUserIndex + 1)
      : conversationMessages;

  return candidateMessages.some((message) => {
    if (message?.role !== "assistant") {
      return false;
    }

    const messageId = normalizeMessageId(message);
    if (candidateId && messageId && candidateId === messageId) {
      return true;
    }

    return Boolean(candidateContent) && normalizeAssistantConversationContent(message.content) === candidateContent;
  });
}

export function buildDashboardSettledMessages({
  messages = [],
  pendingEntry = null,
  localMessages = [],
  localHasLivePendingAssistant = false,
  localHasExplicitLivePendingAssistant = false,
  localSettledPendingAssistantCandidate = null,
  snapshotHasAssistantReply = false,
  allowEmptySnapshotLocalTail = true,
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  localHasLivePendingAssistant?: boolean;
  localHasExplicitLivePendingAssistant?: boolean;
  localSettledPendingAssistantCandidate?: ChatMessage | null;
  snapshotHasAssistantReply?: boolean;
  allowEmptySnapshotLocalTail?: boolean;
} = {}) {
  const snapshotMessages = (messages || []).map((message) =>
    cloneMessage({
      ...message,
      pending: undefined,
      streaming: undefined,
    }),
  );
  const settledLocalMessages = (localMessages || [])
    .filter((message) => !message?.pending && !message?.streaming)
    .map((message) => cloneMessage({
      ...message,
      pending: undefined,
      streaming: undefined,
    }));

  if (!pendingEntry) {
    return buildDurableConversationWithLocalTail(
      snapshotMessages,
      settledLocalMessages,
      { allowEmptySnapshot: allowEmptySnapshotLocalTail },
    );
  }

  let nextMessages = [...snapshotMessages];
  const localAssistantCandidate = localSettledPendingAssistantCandidate || findPendingAssistantCandidate(settledLocalMessages, pendingEntry);
  nextMessages = mergePendingAssistantReplayCandidate(nextMessages, localAssistantCandidate, pendingEntry);

  if (pendingEntry.stopped) {
    if (!hasSnapshotAdvancedPastPendingTurn(nextMessages, pendingEntry) && localAssistantCandidate) {
      const pendingAssistantIndex = findPendingAssistantTranscriptIndex(nextMessages, pendingEntry);
      if (pendingAssistantIndex >= 0) {
        nextMessages[pendingAssistantIndex] = cloneMessage({
          ...localAssistantCandidate,
          pending: undefined,
          streaming: undefined,
        });
      } else if (!hasEquivalentAssistantMessage(nextMessages, localAssistantCandidate, pendingEntry)) {
        nextMessages.push(cloneMessage({
          ...localAssistantCandidate,
          pending: undefined,
          streaming: undefined,
        }));
      }
    }

    return buildConversationMessages(nextMessages, pendingEntry);
  }

  if (localHasLivePendingAssistant && localHasExplicitLivePendingAssistant) {
    const pendingAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);
    if (pendingAssistantIndex >= 0) {
      nextMessages = nextMessages.filter((_, index) => index !== pendingAssistantIndex);
    }
  }

  if (
    localAssistantCandidate
    && !snapshotHasAssistantReply
    && !(localHasLivePendingAssistant && localHasExplicitLivePendingAssistant)
    && !hasEquivalentAssistantMessage(nextMessages, localAssistantCandidate, pendingEntry)
  ) {
    nextMessages.push(cloneMessage({
      ...localAssistantCandidate,
      pending: undefined,
      streaming: undefined,
    }));
  }

  const hasPendingUserMessage = nextMessages.some((message) => matchesPendingUserMessage(message, pendingEntry));

  if (!hasPendingUserMessage && snapshotHasAssistantReply && findPendingAssistantTranscriptIndex(nextMessages, pendingEntry) < 0) {
    return nextMessages;
  }

  if (!hasPendingUserMessage) {
    const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || pendingEntry?.startedAt || 0);
    const pendingAssistantId = String(pendingEntry?.assistantMessageId || "").trim();

    const hasNewerAssistant = nextMessages.some((message) => {
      if (message?.role !== "assistant") return false;
      const messageTimestamp = normalizeMessageTimestamp(message);
      const messageId = normalizeMessageId(message);

      if (pendingAssistantId && messageId === pendingAssistantId) {
        return false;
      }

      return messageTimestamp > pendingTimestamp;
    });

    if (hasNewerAssistant) {
      return nextMessages;
    }
  }

  return buildConversationMessages(nextMessages, pendingEntry);
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

  const progressStage = coerceAgentProgressStage(pendingEntry.progressStage);
  const progressLabel = typeof pendingEntry.progressLabel === "string" ? pendingEntry.progressLabel.trim() : "";
  const progressUpdatedAt = Number(pendingEntry.progressUpdatedAt || pendingEntry.lastDeltaAt || pendingEntry.pendingTimestamp || pendingEntry.startedAt || 0) || 0;
  const progressContent = progressLabel || thinkingPlaceholder;
  const streamText = String(run?.streamText || "").trim();
  if (streamText) {
    return {
      id: String(pendingEntry.assistantMessageId || run?.runId || `msg-assistant-overlay-${pendingEntry.pendingTimestamp || Date.now()}`),
      role: "assistant" as const,
      content: streamText,
      timestamp: Number(run?.lastDeltaAt || pendingEntry.pendingTimestamp || pendingEntry.startedAt || Date.now()),
      streaming: true,
      ...(progressStage ? { progressStage } : {}),
      ...(progressLabel ? { progressLabel } : {}),
      ...(progressUpdatedAt ? { progressUpdatedAt } : {}),
    };
  }

  return {
    id: String(pendingEntry.assistantMessageId || `msg-assistant-pending-${pendingEntry.pendingTimestamp || Date.now()}`),
    role: "assistant" as const,
    content: progressContent,
    timestamp: Number(pendingEntry.pendingTimestamp || pendingEntry.startedAt || Date.now()),
    pending: true,
    ...(progressStage ? { progressStage } : {}),
    ...(progressLabel ? { progressLabel } : {}),
    ...(progressUpdatedAt ? { progressUpdatedAt } : {}),
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
  const conversationMessages = collapseDuplicateConversationTurns(
    buildConversationMessages(messages, pendingEntry),
  );
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
