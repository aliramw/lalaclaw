import type { ChatMessage, PendingChatTurn, PendingUserMessage } from "@/types/chat";
import { normalizeAgentId } from "@/features/app/state/app-session-identity";
import { isImSessionUser } from "@/features/session/im-session";
import { normalizeStatusKey } from "@/features/session/status-display";

export function findPendingUserIndex(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null): number {
  const targetContent = String(pendingEntry?.userMessage?.content || "");
  if (!targetContent) {
    return -1;
  }

  const expectedTimestamp = Number(pendingEntry?.userMessage?.timestamp || 0);
  const startedAt = Number(pendingEntry?.startedAt || 0);
  const matchThreshold = expectedTimestamp || startedAt || 0;
  const timedMatches: Array<{ index: number; timestamp: number }> = [];
  const untimedMatches: number[] = [];

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
      return timedMatches[0]?.index ?? -1;
    }

    return -1;
  }

  if (!matchThreshold && untimedMatches.length === 1) {
    return untimedMatches[0] ?? -1;
  }

  return -1;
}

export function findSnapshotPendingAssistantIndex(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
): number {
  if (pendingEntry?.stopped) {
    return -1;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  if (assistantMessageId) {
    const directIndex = snapshotMessages.findIndex(
      (message) => message?.role === "assistant" && String(message?.id || "").trim() === assistantMessageId,
    );
    if (directIndex >= 0) {
      return directIndex;
    }
  }

  const startedAt = Number(pendingEntry?.startedAt || 0);
  const expectedTimestamp = Number(pendingEntry?.userMessage?.timestamp || 0);
  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);

  if (pendingUserIndex >= 0) {
    const pendingUserMessage = snapshotMessages[pendingUserIndex];
    if (!pendingUserMessage) {
      return -1;
    }
    for (let index = snapshotMessages.length - 1; index > pendingUserIndex; index -= 1) {
      const message = snapshotMessages[index];
      if (message?.role !== "assistant" || String(message.content || "").trim() === "") {
        continue;
      }
      return index;
    }
    return -1;
  }

  const matchThreshold = expectedTimestamp || startedAt || 0;
  const eligibleAssistantIndices: number[] = [];
  for (let index = snapshotMessages.length - 1; index >= 0; index -= 1) {
    const message = snapshotMessages[index];
    if (message?.role !== "assistant" || String(message.content || "").trim() === "") {
      continue;
    }
    const timestamp = Number(message.timestamp || 0);
    if (!matchThreshold || !timestamp || timestamp >= matchThreshold) {
      eligibleAssistantIndices.unshift(index);
    }
  }

  return eligibleAssistantIndices.length === 1 ? (eligibleAssistantIndices[0] ?? -1) : -1;
}

export function hasSnapshotAdvancedPastPendingTurn(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  const pendingUserIndex = findPendingUserIndex(snapshotMessages, pendingEntry);
  if (pendingUserIndex < 0) {
    return false;
  }

  return snapshotMessages.some((message, index) => index > pendingUserIndex && message?.role === "user");
}

export function hasAuthoritativePendingAssistantReply(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  if (!shouldEvaluateAuthoritativePendingAssistantReply(snapshotMessages, pendingEntry)) {
    return false;
  }

  const evaluationState = buildAuthoritativePendingAssistantEvaluationState(snapshotMessages, pendingEntry);
  return hasAuthoritativePendingAssistantReplyForEvaluationState(
    snapshotMessages,
    evaluationState,
  );
}

function shouldEvaluateAuthoritativePendingAssistantReply(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  if (pendingEntry?.stopped) {
    return false;
  }

  return !hasSnapshotAdvancedPastPendingTurn(snapshotMessages, pendingEntry);
}

type AuthoritativePendingAssistantEvaluationState = {
  assistantMessageId: string;
  pendingUserIndex: number;
  startedAt: number;
};

type AuthoritativePendingAssistantReplySource = "none" | "direct" | "fallback";

type AuthoritativePendingAssistantReplyEvaluation = {
  source: AuthoritativePendingAssistantReplySource;
};

type AuthoritativePendingAssistantCandidateEvaluationState = {
  pendingUserIndex: number;
  startedAt: number;
};

function createAuthoritativePendingAssistantEvaluationState(
  assistantMessageId: string,
  pendingUserIndex: number,
  startedAt: number,
): AuthoritativePendingAssistantEvaluationState {
  return {
    assistantMessageId,
    pendingUserIndex,
    startedAt,
  };
}

function createAuthoritativePendingAssistantReplyEvaluation(
  source: AuthoritativePendingAssistantReplySource,
): AuthoritativePendingAssistantReplyEvaluation {
  return { source };
}

function createAuthoritativePendingAssistantCandidateEvaluationState(
  pendingUserIndex: number,
  startedAt: number,
): AuthoritativePendingAssistantCandidateEvaluationState {
  return {
    pendingUserIndex,
    startedAt,
  };
}

function buildAuthoritativePendingAssistantCandidateEvaluationState(
  evaluationState: AuthoritativePendingAssistantEvaluationState,
): AuthoritativePendingAssistantCandidateEvaluationState {
  return createAuthoritativePendingAssistantCandidateEvaluationState(
    evaluationState.pendingUserIndex,
    evaluationState.startedAt,
  );
}

function buildAuthoritativePendingAssistantEvaluationState(
  snapshotMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
): AuthoritativePendingAssistantEvaluationState {
  return createAuthoritativePendingAssistantEvaluationState(
    String(pendingEntry?.assistantMessageId || "").trim(),
    findPendingUserIndex(snapshotMessages, pendingEntry),
    Number(pendingEntry?.startedAt || 0),
  );
}

function hasDirectAuthoritativePendingAssistantReply(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantEvaluationState,
) {
  return Boolean(
    evaluationState.assistantMessageId
    && hasDirectAuthoritativePendingAssistantMatchForEvaluationState(snapshotMessages, evaluationState),
  );
}

function hasAuthoritativePendingAssistantReplyForEvaluationState(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantEvaluationState,
) {
  const replyEvaluation = evaluateAuthoritativePendingAssistantReplyForEvaluationState(
    snapshotMessages,
    evaluationState,
  );
  return hasAuthoritativePendingAssistantReplySource(replyEvaluation.source);
}

function evaluateAuthoritativePendingAssistantReplyForEvaluationState(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantEvaluationState,
): AuthoritativePendingAssistantReplyEvaluation {
  return createAuthoritativePendingAssistantReplyEvaluation(
    selectAuthoritativePendingAssistantReplySource(snapshotMessages, evaluationState),
  );
}

function selectAuthoritativePendingAssistantReplySource(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantEvaluationState,
): AuthoritativePendingAssistantReplySource {
  if (hasDirectAuthoritativePendingAssistantReply(snapshotMessages, evaluationState)) {
    return "direct";
  }

  if (hasFallbackAuthoritativePendingAssistantReply(snapshotMessages, evaluationState)) {
    return "fallback";
  }

  return "none";
}

function hasAuthoritativePendingAssistantReplySource(
  source: AuthoritativePendingAssistantReplySource,
) {
  return source !== "none";
}

function hasFallbackAuthoritativePendingAssistantReply(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantEvaluationState,
) {
  return hasExactlyOneAuthoritativePendingAssistantCandidate(
    snapshotMessages,
    buildAuthoritativePendingAssistantCandidateEvaluationState(evaluationState),
  );
}

function hasDirectAuthoritativePendingAssistantMatchForEvaluationState(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantEvaluationState,
) {
  return snapshotMessages.some(
    (message) =>
      matchesAuthoritativePendingAssistantIdForEvaluationState(message, evaluationState)
  );
}

function hasExactlyOneAuthoritativePendingAssistantCandidate(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantCandidateEvaluationState,
) {
  return countAuthoritativePendingAssistantCandidates(
    snapshotMessages,
    evaluationState,
  ) === 1;
}

function filterAuthoritativePendingAssistantCandidates(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantCandidateEvaluationState,
) {
  const sourceMessages = selectAuthoritativePendingAssistantCandidateSourceMessagesForEvaluationState(
    snapshotMessages,
    evaluationState,
  );

  return sourceMessages.filter((message) => {
    return matchesAuthoritativePendingAssistantCandidateForEvaluationState(message, evaluationState);
  });
}

function countAuthoritativePendingAssistantCandidates(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantCandidateEvaluationState,
) {
  return filterAuthoritativePendingAssistantCandidates(
    snapshotMessages,
    evaluationState,
  ).length;
}

function isAuthoritativePendingAssistantCandidateMessage(message: ChatMessage | null | undefined) {
  return (
    message?.role === "assistant"
    && !message?.pending
    && !message?.streaming
    && Boolean(String(message?.content || "").trim())
  );
}

function isAuthoritativePendingAssistantCandidateWithinStartedAtWindow(
  message: ChatMessage | null | undefined,
  startedAt: number,
) {
  const timestamp = Number(message?.timestamp || 0);
  return !startedAt || !timestamp || timestamp >= startedAt;
}

function matchesAuthoritativePendingAssistantCandidateForEvaluationState(
  message: ChatMessage | null | undefined,
  evaluationState: AuthoritativePendingAssistantCandidateEvaluationState,
) {
  return (
    isAuthoritativePendingAssistantCandidateMessage(message)
    && isAuthoritativePendingAssistantCandidateWithinStartedAtWindow(message, evaluationState.startedAt)
  );
}

function matchesAuthoritativePendingAssistantIdForEvaluationState(
  message: ChatMessage | null | undefined,
  evaluationState: AuthoritativePendingAssistantEvaluationState,
) {
  return (
    isAuthoritativePendingAssistantCandidateMessage(message)
    && String(message?.id || "").trim() === evaluationState.assistantMessageId
  );
}

function selectAuthoritativePendingAssistantCandidateSourceMessagesForEvaluationState(
  snapshotMessages: ChatMessage[] = [],
  evaluationState: AuthoritativePendingAssistantCandidateEvaluationState,
) {
  return evaluationState.pendingUserIndex >= 0
    ? snapshotMessages.slice(evaluationState.pendingUserIndex + 1)
    : snapshotMessages;
}

function derivePendingEntryFromLocalMessages(localMessages: ChatMessage[] = []): PendingChatTurn | null {
  if (!Array.isArray(localMessages) || !localMessages.length) {
    return null;
  }

  const pendingAssistantIndex = [...localMessages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message?.role === "assistant" && Boolean(message?.pending))?.index;

  if (typeof pendingAssistantIndex !== "number" || pendingAssistantIndex < 0) {
    return null;
  }

  const pendingAssistant = localMessages[pendingAssistantIndex];
  if (!pendingAssistant) {
    return null;
  }
  const pendingUser = [...localMessages.slice(0, pendingAssistantIndex)]
    .reverse()
    .find((message) => message?.role === "user");

  if (!pendingUser) {
    return null;
  }

  return {
    startedAt: Number(pendingUser.timestamp || pendingAssistant.timestamp || Date.now()),
    pendingTimestamp: Number(pendingAssistant.timestamp || Date.now()),
    assistantMessageId: String(pendingAssistant.id || "").trim() || undefined,
    suppressPendingPlaceholder: Boolean(pendingAssistant?.suppressPendingPlaceholder),
    userMessage: {
      ...(pendingUser.id ? { id: pendingUser.id } : {}),
      role: "user" as const,
      content: String(pendingUser.content || ""),
      timestamp: pendingUser.timestamp,
      ...(pendingUser.attachments?.length ? { attachments: pendingUser.attachments } : {}),
    },
  };
}

function toPendingUserMessage(message: ChatMessage | null = null): PendingUserMessage | null {
  if (!message || message?.role !== "user") {
    return null;
  }

  const content = String(message.content || "");
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => ({ ...attachment }))
    : [];
  if (!content && !attachments.length) {
    return null;
  }

  const nextMessage: PendingUserMessage = {
    role: "user" as const,
    content,
    ...(message.id ? { id: message.id } : {}),
    ...(Number.isFinite(Number(message.timestamp)) ? { timestamp: Number(message.timestamp) } : {}),
    ...(attachments.length ? { attachments } : {}),
  };

  return nextMessage;
}

export function resolveRuntimePendingEntry({
  agentId = "main",
  conversationKey = "",
  conversationMessages = [],
  localMessages = [],
  pendingChatTurns = {},
  sessionStatus = "",
  sessionUser = "",
}: {
  agentId?: string;
  conversationKey?: string;
  conversationMessages?: ChatMessage[];
  localMessages?: ChatMessage[];
  pendingChatTurns?: Record<string, PendingChatTurn>;
  sessionStatus?: unknown;
  sessionUser?: string;
} = {}) {
  const trackedPendingEntry = (
    pendingChatTurns?.[conversationKey]
    || derivePendingEntryFromLocalMessages(localMessages)
    || null
  );
  if (trackedPendingEntry) {
    const sourceMessages = Array.isArray(conversationMessages) && conversationMessages.length
      ? conversationMessages
      : localMessages;
    if (hasSnapshotAdvancedPastPendingTurn(sourceMessages, trackedPendingEntry)) {
      return null;
    }
    return trackedPendingEntry;
  }

  if (!isImSessionUser(sessionUser) || !["running", "dispatching"].includes(normalizeStatusKey(sessionStatus))) {
    return null;
  }

  const sourceMessages = Array.isArray(conversationMessages) && conversationMessages.length
    ? conversationMessages
    : localMessages;
  const latestMessage = sourceMessages[sourceMessages.length - 1] || null;
  const pendingUserMessage = toPendingUserMessage(latestMessage);
  if (!pendingUserMessage) {
    return null;
  }

  const startedAt = Number(pendingUserMessage.timestamp || Date.now());
  return {
    ...(conversationKey ? { key: conversationKey } : {}),
    ...(agentId ? { agentId: normalizeAgentId(agentId) } : {}),
    ...(sessionUser ? { sessionUser: String(sessionUser).trim() } : {}),
    startedAt,
    pendingTimestamp: startedAt,
    userMessage: pendingUserMessage,
  } satisfies PendingChatTurn;
}
