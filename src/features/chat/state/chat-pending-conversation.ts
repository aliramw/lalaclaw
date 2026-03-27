import type { ChatMessage, PendingChatTurn } from "@/types/chat";
import { collapseDuplicateConversationTurns } from "@/features/chat/state/chat-conversation-dedupe";
import {
  findPendingUserIndex,
  findSnapshotPendingAssistantIndex,
  hasSnapshotAdvancedPastPendingTurn,
} from "@/features/chat/state/chat-runtime-pending";
import { buildDurableConversationWithLocalTail } from "@/features/chat/state/chat-settled-conversation";

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

  if (snapshotAssistantIndex !== nextMessages.length - 1) {
    return nextMessages;
  }

  const snapshotAssistant = nextMessages[snapshotAssistantIndex];
  if (!snapshotAssistant) {
    return nextMessages;
  }
  nextMessages[snapshotAssistantIndex] = selectPreferredPendingAssistantMessage(
    snapshotAssistant,
    localStreamingAssistant,
  );
  return nextMessages;
}

function selectPreferredPendingAssistantMessage(
  snapshotAssistant: ChatMessage,
  localStreamingAssistant: ChatMessage,
) {
  const localContent = String(localStreamingAssistant.content || "");
  const snapshotContent = String(snapshotAssistant?.content || "");

  return localContent.length >= snapshotContent.length
    ? {
        ...snapshotAssistant,
        ...localStreamingAssistant,
      }
    : {
        ...localStreamingAssistant,
        ...snapshotAssistant,
      };
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

function shouldRestorePendingUserBeforeAssistant(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!pendingEntry) {
    return false;
  }

  return hasTailSnapshotPendingAssistantMatch(snapshotMessages, pendingEntry);
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

function mergePendingConversation(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null,
  pendingLabel: string,
  localMessages: ChatMessage[] = [],
) {
  const pendingMergeState = buildPendingConversationMergeState(snapshotMessages, pendingEntry);
  if (!pendingMergeState.hasPendingEntry) {
    return [...pendingMergeState.snapshotMessages];
  }

  if (!pendingEntry) {
    return [...pendingMergeState.snapshotMessages];
  }

  const filteredSnapshotMessages = pendingMergeState.snapshotMessages;
  const localStreamingAssistant = resolvePendingAssistantCandidate(localMessages, pendingEntry);
  if (pendingMergeState.snapshotHasAssistantReply) {
    return finalizeAuthoritativePendingConversation(
      filteredSnapshotMessages,
      pendingEntry,
      pendingMergeState.pendingUserMerge,
      localStreamingAssistant,
    );
  }

  const pendingUserMerge = pendingMergeState.pendingUserMerge;
  return finalizePendingConversationOverlay(
    pendingUserMerge.messages,
    pendingEntry,
    pendingLabel,
    localStreamingAssistant,
  );
}

export function buildPendingConversationOverlayMessages(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  pendingLabel = "Thinking...",
  localMessages: ChatMessage[] = [],
) {
  return mergePendingConversation(
    snapshotMessages,
    pendingEntry,
    pendingLabel,
    localMessages,
  );
}

function mergePendingConversationIntoTranscript(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  { stripPendingAssistantMatch = false } = {},
) {
  return buildPendingTranscriptMessages(
    snapshotMessages,
    pendingEntry,
    { stripPendingAssistantMatch },
  );
}

function mergeStoppedPendingConversationIntoTranscript(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  localMessages: ChatMessage[] = [],
) {
  return mergePendingAssistantCandidateIntoTranscript(
    snapshotMessages,
    pendingEntry,
    localMessages,
    {
      shouldAppend: () => Boolean(pendingEntry?.stopped),
    },
  );
}

function mergePendingConversationSettledReplyIntoTranscript(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  localMessages: ChatMessage[] = [],
) {
  return mergePendingAssistantCandidateIntoTranscript(
    snapshotMessages,
    pendingEntry,
    localMessages,
  );
}

function buildDurablePendingConversationMessages({
  messages = [],
  pendingEntry = null,
  localMessages = [],
  localHasLivePendingAssistant = false,
  localHasExplicitLivePendingAssistant = false,
  localSettledPendingAssistantCandidate = null,
  snapshotHasAssistantReply = false,
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  localHasLivePendingAssistant?: boolean;
  localHasExplicitLivePendingAssistant?: boolean;
  localSettledPendingAssistantCandidate?: ChatMessage | null;
  snapshotHasAssistantReply?: boolean;
} = {}) {
  if (!pendingEntry) {
    return [...messages];
  }

  if (pendingEntry?.stopped) {
    return mergeStoppedPendingConversationIntoTranscript(
      messages,
      pendingEntry,
      localMessages,
    );
  }

  if (localHasLivePendingAssistant && localHasExplicitLivePendingAssistant) {
    return mergePendingConversationIntoTranscript(
      messages,
      pendingEntry,
      { stripPendingAssistantMatch: true },
    );
  }

  if (localSettledPendingAssistantCandidate && !snapshotHasAssistantReply) {
    return mergePendingConversationSettledReplyIntoTranscript(
      messages,
      pendingEntry,
      localMessages,
    );
  }

  return mergePendingConversationIntoTranscript(
    messages,
    pendingEntry,
  );
}

function buildDurableConversationMessages({
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
  if (!pendingEntry) {
    return buildDurableConversationWithLocalTail(
      messages,
      localMessages,
      { allowEmptySnapshot: allowEmptySnapshotLocalTail },
    );
  }

  return buildDurablePendingConversationMessages({
    messages,
    pendingEntry,
    localMessages,
    localHasLivePendingAssistant,
    localHasExplicitLivePendingAssistant,
    localSettledPendingAssistantCandidate,
    snapshotHasAssistantReply,
  });
}

type PendingUserMergeState = {
  messages: ChatMessage[];
  hasPendingUserMessage: boolean;
  insertedPendingUser: boolean;
};

type PendingConversationMergeState =
  | {
    hasPendingEntry: false;
    snapshotMessages: ChatMessage[];
    snapshotHasAssistantReply: boolean;
    pendingUserMerge: null;
  }
  | {
    hasPendingEntry: true;
    snapshotMessages: ChatMessage[];
    snapshotHasAssistantReply: boolean;
    pendingUserMerge: PendingUserMergeState;
  };

type PendingTranscriptBuildOptions = {
  stripPendingAssistantMatch?: boolean;
};

type PendingAssistantCandidateAppendOptions = {
  shouldAppend?: () => boolean;
};

type PendingUserMergeBuildOptions = {
  snapshotHasAssistantReply?: boolean;
};

type PendingUserMergeStateFlags = {
  hasPendingUserMessage: boolean;
  insertedPendingUser: boolean;
};

type PendingConversationSnapshotState = {
  snapshotMessages: ChatMessage[];
  snapshotHasAssistantReply: boolean;
};

function mergePendingAssistantCandidateIntoTranscript(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  localMessages: ChatMessage[] = [],
  { shouldAppend = () => true }: PendingAssistantCandidateAppendOptions = {},
) {
  const transcriptMessages = buildPendingTranscriptMessages(snapshotMessages, pendingEntry);
  if (!pendingEntry || !shouldAppend()) {
    return transcriptMessages;
  }

  return appendPendingAssistantCandidateIntoTranscript(
    transcriptMessages,
    pendingEntry,
    resolvePendingAssistantCandidate(localMessages, pendingEntry),
  );
}

function resolvePendingAssistantCandidate(
  localMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  return findLocalStreamingAssistant(localMessages, pendingEntry);
}

function normalizePendingSnapshotMessages(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  { stripPendingAssistantMatch = false }: PendingTranscriptBuildOptions = {},
) {
  const filteredSnapshotMessages = filterStoppedTurnAssistantMessages(snapshotMessages, pendingEntry);
  if (!shouldStripPendingAssistantMatchFromSnapshot(stripPendingAssistantMatch, pendingEntry)) {
    return filteredSnapshotMessages;
  }

  return stripPendingAssistantMatchFromSnapshotMessages(filteredSnapshotMessages, pendingEntry);
}

function shouldStripPendingAssistantMatchFromSnapshot(
  stripPendingAssistantMatch: boolean,
  pendingEntry: PendingChatTurn | null = null,
) {
  return Boolean(stripPendingAssistantMatch && pendingEntry && !pendingEntry?.stopped);
}

function stripPendingAssistantMatchFromSnapshotMessages(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  return snapshotMessages.filter((_, index) =>
    index !== findSnapshotPendingAssistantIndex(snapshotMessages, pendingEntry),
  );
}

function buildPendingTranscriptMessages(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  { stripPendingAssistantMatch = false }: PendingTranscriptBuildOptions = {},
) {
  const pendingMergeState = buildPendingConversationMergeState(
    snapshotMessages,
    pendingEntry,
    { stripPendingAssistantMatch },
  );
  return collapseDuplicateConversationTurns(
    selectPendingTranscriptBaseMessages(pendingMergeState),
  );
}

function selectPendingTranscriptBaseMessages(
  pendingMergeState: PendingConversationMergeState,
) {
  if (!pendingMergeState.hasPendingEntry) {
    return pendingMergeState.snapshotMessages;
  }

  return pendingMergeState.pendingUserMerge.messages;
}

function buildPendingConversationMergeState(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  { stripPendingAssistantMatch = false }: PendingTranscriptBuildOptions = {},
): PendingConversationMergeState {
  const snapshotState = buildPendingConversationSnapshotState(
    snapshotMessages,
    pendingEntry,
    { stripPendingAssistantMatch },
  );
  if (!pendingEntry) {
    return createPendingConversationMergeState(
      snapshotState.snapshotMessages,
      snapshotState.snapshotHasAssistantReply,
      null,
    );
  }

  return createPendingConversationMergeState(
    snapshotState.snapshotMessages,
    snapshotState.snapshotHasAssistantReply,
    buildPendingUserMergeState(
      snapshotState.snapshotMessages,
      pendingEntry,
      { snapshotHasAssistantReply: snapshotState.snapshotHasAssistantReply },
    ),
  );
}

function buildPendingConversationSnapshotState(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  { stripPendingAssistantMatch = false }: PendingTranscriptBuildOptions = {},
): PendingConversationSnapshotState {
  const normalizedSnapshotMessages = normalizePendingSnapshotMessages(
    snapshotMessages,
    pendingEntry,
    { stripPendingAssistantMatch },
  );

  return {
    snapshotMessages: normalizedSnapshotMessages,
    snapshotHasAssistantReply: hasSnapshotAssistantReply(normalizedSnapshotMessages, pendingEntry),
  };
}

function createPendingConversationMergeState(
  snapshotMessages: ChatMessage[] = [],
  snapshotHasAssistantReply: boolean,
  pendingUserMerge: PendingUserMergeState | null,
): PendingConversationMergeState {
  if (!pendingUserMerge) {
    return {
      hasPendingEntry: false,
      snapshotMessages: [...snapshotMessages],
      snapshotHasAssistantReply,
      pendingUserMerge: null,
    };
  }

  return {
    hasPendingEntry: true,
    snapshotMessages: [...snapshotMessages],
    snapshotHasAssistantReply,
    pendingUserMerge,
  };
}

function finalizePendingConversationOverlay(
  mergedMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn,
  pendingLabel: string,
  localStreamingAssistant: ChatMessage | null = null,
) {
  if (localStreamingAssistant) {
    return appendDistinctPendingAssistantCandidate(
      mergedMessages,
      pendingEntry,
      localStreamingAssistant,
    );
  }

  return finalizePendingPlaceholderOverlay(
    mergedMessages,
    pendingEntry,
    pendingLabel,
  );
}

function finalizeAuthoritativePendingConversation(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn,
  pendingUserMerge: PendingUserMergeState,
  localStreamingAssistant: ChatMessage | null = null,
) {
  if (shouldKeepAuthoritativePendingSnapshot(snapshotMessages, pendingEntry, pendingUserMerge)) {
    return collapseDuplicateConversationTurns(snapshotMessages);
  }

  return collapseDuplicateConversationTurns(
    mergeStreamingAssistant(pendingUserMerge.messages, pendingEntry, localStreamingAssistant),
  );
}

function shouldKeepAuthoritativePendingSnapshot(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn,
  pendingUserMerge: PendingUserMergeState,
) {
  if (hasSnapshotAdvancedPastPendingTurn(snapshotMessages, pendingEntry)) {
    return true;
  }

  return !pendingUserMerge.hasPendingUserMessage && !pendingUserMerge.insertedPendingUser;
}

function buildPendingUserMergeState(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn,
  { snapshotHasAssistantReply = hasSnapshotAssistantReply(snapshotMessages, pendingEntry) }: PendingUserMergeBuildOptions = {},
): PendingUserMergeState {
  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);
  if (pendingUserIndex >= 0) {
    return createPendingUserMergeState(snapshotMessages, {
      hasPendingUserMessage: true,
      insertedPendingUser: false,
    });
  }

  if (snapshotHasAssistantReply && !shouldRestorePendingUserBeforeAssistant(snapshotMessages, pendingEntry)) {
    return createPendingUserMergeState(snapshotMessages, {
      hasPendingUserMessage: false,
      insertedPendingUser: false,
    });
  }

  return createPendingUserMergeState(
    insertPendingUserMessage(snapshotMessages, pendingEntry),
    {
      hasPendingUserMessage: false,
      insertedPendingUser: true,
    },
  );
}

function createPendingUserMergeState(
  messages: ChatMessage[] = [],
  {
    hasPendingUserMessage,
    insertedPendingUser,
  }: PendingUserMergeStateFlags,
): PendingUserMergeState {
  return {
    messages: [...messages],
    hasPendingUserMessage,
    insertedPendingUser,
  };
}

function appendPendingAssistantCandidateIntoTranscript(
  transcriptMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  assistantCandidate: ChatMessage | null = null,
) {
  if (!shouldAppendPendingAssistantCandidateIntoTranscript(transcriptMessages, pendingEntry)) {
    return transcriptMessages;
  }

  return appendDistinctPendingAssistantCandidate(
    transcriptMessages,
    pendingEntry,
    assistantCandidate,
  );
}

function shouldAppendPendingAssistantCandidateIntoTranscript(
  transcriptMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  return !hasSnapshotAdvancedPastPendingTurn(transcriptMessages, pendingEntry);
}

function appendDistinctPendingAssistantCandidate(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
  assistantCandidate: ChatMessage | null = null,
) {
  if (!assistantCandidate || hasEquivalentAssistantMessage(messages, assistantCandidate, pendingEntry)) {
    return collapseDuplicateConversationTurns(messages);
  }

  return collapseDuplicateConversationTurns([
    ...messages,
    assistantCandidate,
  ]);
}

function finalizePendingPlaceholderOverlay(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn,
  pendingLabel: string,
) {
  if (!shouldAppendPendingPlaceholder(messages, pendingEntry)) {
    return collapseDuplicateConversationTurns(messages);
  }

  return collapseDuplicateConversationTurns([
    ...messages,
    {
      role: "assistant",
      content: pendingLabel,
      timestamp: pendingEntry.pendingTimestamp,
      pending: true,
    },
  ]);
}

function shouldAppendPendingPlaceholder(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn,
) {
  if (hasSnapshotPendingAssistantMatch(messages, pendingEntry)) {
    return false;
  }

  return !pendingEntry?.suppressPendingPlaceholder;
}

function hasSnapshotPendingAssistantMatch(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  return findSnapshotPendingAssistantIndex(messages, pendingEntry) >= 0;
}

function hasTailSnapshotPendingAssistantMatch(
  messages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  const snapshotAssistantIndex = findSnapshotPendingAssistantIndex(messages, pendingEntry);
  return snapshotAssistantIndex >= 0 && snapshotAssistantIndex === messages.length - 1;
}
