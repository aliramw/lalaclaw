import type { ChatMessage, PendingChatTurn } from "@/types/chat";
import {
  collapseDuplicateConversationTurns,
} from "@/features/chat/state/chat-conversation-dedupe";
import { mergeConversationIdentity } from "@/features/chat/state/chat-conversation-merge";
import { normalizeStatusKey } from "@/features/session/status-display";

const DUPLICATE_CONVERSATION_TURN_WINDOW_MS = 90 * 1000;
const DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS = 5 * 1000;
const DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS = 10 * 60 * 1000;

function normalizeAssistantConversationContent(content = "") {
  return String(content || "")
    .replace(/\[\[reply_to_current\]\]/gi, "")
    .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
    .replace(/<small>[\s\S]*?<\/small>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getConversationAttachmentFingerprint(attachments: unknown = "") {
  if (!Array.isArray(attachments)) {
    return "";
  }

  return attachments
    .map((attachment) => [
      String(attachment?.kind || "").trim(),
      String(attachment?.name || "").trim(),
      String(attachment?.fullPath || attachment?.path || "").trim(),
      String(attachment?.mimeType || "").trim(),
    ].join("::"))
    .filter(Boolean)
    .join("|");
}

function areEquivalentConversationMessages(snapshotMessage, localMessage) {
  if (!snapshotMessage || !localMessage || snapshotMessage.role !== localMessage.role) {
    return false;
  }

  const snapshotContent = snapshotMessage.role === "assistant"
    ? normalizeAssistantConversationContent(snapshotMessage.content)
    : String(snapshotMessage.content || "").trim();
  const localContent = localMessage.role === "assistant"
    ? normalizeAssistantConversationContent(localMessage.content)
    : String(localMessage.content || "").trim();
  const snapshotAttachmentFingerprint = getConversationAttachmentFingerprint(snapshotMessage.attachments);
  const localAttachmentFingerprint = getConversationAttachmentFingerprint(localMessage.attachments);
  const contentMatches = Boolean(snapshotContent) && snapshotContent === localContent;
  const attachmentMatches = Boolean(localAttachmentFingerprint) && snapshotAttachmentFingerprint === localAttachmentFingerprint;

  if (!contentMatches && !attachmentMatches) {
    return false;
  }

  if (snapshotMessage.role === "assistant") {
    const snapshotTokenBadge = String(snapshotMessage.tokenBadge || "").trim();
    const localTokenBadge = String(localMessage.tokenBadge || "").trim();
    if (snapshotTokenBadge && localTokenBadge && snapshotTokenBadge !== localTokenBadge) {
      return false;
    }
  }

  return true;
}

export function shouldReuseSettledLocalConversationTail({
  snapshotMessages = [],
  pendingEntry = null,
  status = "",
  preferAuthoritativeEmptySnapshot = false,
}: {
  snapshotMessages?: unknown[];
  pendingEntry?: PendingChatTurn | null;
  status?: string;
  preferAuthoritativeEmptySnapshot?: boolean;
} = {}) {
  if ((snapshotMessages || []).length > 0 || pendingEntry) {
    return true;
  }

  if (!preferAuthoritativeEmptySnapshot) {
    return true;
  }

  const normalizedStatus = normalizeStatusKey(status);
  return !["idle", "completed"].includes(normalizedStatus);
}

function getConversationTimestamp(message: ChatMessage | null | undefined) {
  const timestamp = Number(message?.timestamp || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function normalizeSettledLocalMessages(localMessages: ChatMessage[] = []) {
  return (localMessages || [])
    .filter((message) => !message?.pending && !message?.streaming)
    .map((message) => ({ ...message }));
}

function restoreMissingUserBeforeMatchingAssistant(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
): ChatMessage[] | null {
  if (localMessages.length < 2) {
    return null;
  }

  const localAssistant = localMessages.at(-1);
  const localUser = localMessages.at(-2);
  const matchingAssistantIndex = snapshotMessages.findIndex((message) =>
    message?.role === "assistant" && areEquivalentConversationMessages(message, localAssistant),
  );

  if (
    localUser?.role !== "user"
    || localAssistant?.role !== "assistant"
    || matchingAssistantIndex < 0
    || matchingAssistantIndex !== snapshotMessages.length - 1
  ) {
    return null;
  }

  const localUserTimestamp = getConversationTimestamp(localUser);
  const localAssistantTimestamp = getConversationTimestamp(localAssistant);
  const snapshotAssistantTimestamp = getConversationTimestamp(snapshotMessages[matchingAssistantIndex]);
  const hasTightLocalAdjacency = Boolean(
    localUserTimestamp
      && localAssistantTimestamp
      && localAssistantTimestamp >= localUserTimestamp
      && localAssistantTimestamp - localUserTimestamp <= DUPLICATE_CONVERSATION_TURN_WINDOW_MS,
  );

  if (!hasTightLocalAdjacency) {
    return null;
  }

  if (
    snapshotAssistantTimestamp
    && localAssistantTimestamp
    && Math.abs(snapshotAssistantTimestamp - localAssistantTimestamp) > DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS
  ) {
    return null;
  }

  const hasMatchingUserBeforeAssistant = snapshotMessages
    .slice(0, matchingAssistantIndex)
    .some((message) => message?.role === "user" && String(message?.content || "") === String(localUser.content || ""));

  if (hasMatchingUserBeforeAssistant) {
    return null;
  }

  const restoredTurn = [...snapshotMessages];
  restoredTurn.splice(matchingAssistantIndex, 0, localUser);
  return collapseDuplicateConversationTurns(restoredTurn);
}

function calculateLocalTailOverlap(snapshotMessages: ChatMessage[] = [], localTail: ChatMessage[] = []) {
  let overlapCount = 0;
  const maxOverlap = Math.min(snapshotMessages.length, localTail.length);

  for (let candidate = maxOverlap; candidate > 0; candidate -= 1) {
    const snapshotSlice = snapshotMessages.slice(-candidate);
    const tailSlice = localTail.slice(0, candidate);
    const hasOverlap = snapshotSlice.every((message, index) => {
      const tailMessage = tailSlice[index];
      const snapshotId = String(message?.id || "").trim();
      const tailId = String(tailMessage?.id || "").trim();
      if (snapshotId && tailId && snapshotId === tailId) {
        return true;
      }

      if (!areEquivalentConversationMessages(message, tailMessage)) {
        return false;
      }

      const snapshotTimestamp = getConversationTimestamp(message);
      const tailTimestamp = getConversationTimestamp(tailMessage);
      if (!snapshotTimestamp || !tailTimestamp) {
        return true;
      }

      const freshnessWindowMs = message?.role === "assistant"
        ? DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS
        : DUPLICATE_CONVERSATION_TURN_WINDOW_MS;

      return Math.abs(snapshotTimestamp - tailTimestamp) <= freshnessWindowMs;
    });

    if (hasOverlap) {
      overlapCount = candidate;
      break;
    }
  }

  return overlapCount;
}

function hasNonDecreasingMessageTimestamps(messages: ChatMessage[] = []) {
  let previousTimestamp = 0;

  for (const message of messages || []) {
    const timestamp = getConversationTimestamp(message);
    if (!timestamp) {
      continue;
    }

    if (previousTimestamp && timestamp < previousTimestamp) {
      return false;
    }

    previousTimestamp = timestamp;
  }

  return true;
}

function getConversationAttachmentPayloadScore(attachments: unknown = "") {
  if (!Array.isArray(attachments)) {
    return 0;
  }

  return attachments.reduce((score, attachment) => {
    let nextScore = score;
    if (String(attachment?.dataUrl || "").trim()) {
      nextScore += 4;
    }
    if (String(attachment?.previewUrl || "").trim()) {
      nextScore += 3;
    }
    if (String(attachment?.textContent || "").length) {
      nextScore += 2;
    }
    if (String(attachment?.fullPath || attachment?.path || "").trim()) {
      nextScore += 1;
    }
    return nextScore;
  }, 0);
}

function choosePreferredAssistantReplay(previous: ChatMessage, next: ChatMessage) {
  const previousAttachmentScore = getConversationAttachmentPayloadScore(previous.attachments);
  const nextAttachmentScore = getConversationAttachmentPayloadScore(next.attachments);
  if (previousAttachmentScore !== nextAttachmentScore) {
    return nextAttachmentScore > previousAttachmentScore ? next : previous;
  }

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

  return next;
}

function isAssistantReplayTimestampMatch(
  snapshotMessage: ChatMessage | null | undefined,
  localMessage: ChatMessage | null | undefined,
) {
  const snapshotTimestamp = getConversationTimestamp(snapshotMessage);
  const localTimestamp = getConversationTimestamp(localMessage);
  if (!snapshotTimestamp || !localTimestamp) {
    return true;
  }

  if (Math.abs(localTimestamp - snapshotTimestamp) <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS) {
    return true;
  }

  return localTimestamp >= snapshotTimestamp
    && Math.abs(localTimestamp - snapshotTimestamp) <= DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS;
}

function shouldCollapseAssistantPrefixReplay(
  snapshotMessage: ChatMessage | null | undefined,
  localMessage: ChatMessage | null | undefined,
) {
  if (snapshotMessage?.role !== "assistant" || localMessage?.role !== "assistant") {
    return false;
  }

  const snapshotContent = normalizeAssistantConversationContent(snapshotMessage.content);
  const localContent = normalizeAssistantConversationContent(localMessage.content);
  if (!snapshotContent || !localContent) {
    return false;
  }

  if (snapshotContent === localContent) {
    return false;
  }

  if (!isAssistantReplayTimestampMatch(snapshotMessage, localMessage)) {
    return false;
  }

  const shorter = snapshotContent.length <= localContent.length ? snapshotContent : localContent;
  const longer = snapshotContent.length > localContent.length ? snapshotContent : localContent;
  return longer.startsWith(shorter);
}

function preferSettledLocalAssistantReplay(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
) {
  const nextMessages = snapshotMessages.map((message) => ({ ...message }));
  const comparableLength = Math.min(nextMessages.length, localMessages.length);

  for (let index = 0; index < comparableLength; index += 1) {
    const snapshotMessage = nextMessages[index];
    const localMessage = localMessages[index];

    if (!snapshotMessage || !localMessage || snapshotMessage.role !== localMessage.role) {
      break;
    }

    if (snapshotMessage.role === "assistant" && shouldCollapseAssistantPrefixReplay(snapshotMessage, localMessage)) {
      const preferred = choosePreferredAssistantReplay(snapshotMessage, localMessage);
      nextMessages[index] = { ...preferred };
      continue;
    }

    if (!areEquivalentConversationMessages(snapshotMessage, localMessage)) {
      break;
    }
  }

  return nextMessages;
}

function appendLocalTailWhenSnapshotMatchesPrefix(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
): ChatMessage[] | null {
  if (localMessages.length <= snapshotMessages.length) {
    return null;
  }

  const snapshotMatchesLocalPrefix = snapshotMessages.every((message, index) =>
    areEquivalentConversationMessages(message, localMessages[index]),
  );

  if (!snapshotMatchesLocalPrefix) {
    return null;
  }

  const localTail = localMessages.slice(snapshotMessages.length);
  if (!localTail.length) {
    return null;
  }

  const localPrefixLastTimestamp = getConversationTimestamp(localMessages[snapshotMessages.length - 1]);
  const firstTailTimestamp = getConversationTimestamp(localTail[0]);
  if (
    localPrefixLastTimestamp
    && firstTailTimestamp
    && firstTailTimestamp < localPrefixLastTimestamp
  ) {
    return null;
  }

  if (!hasNonDecreasingMessageTimestamps(localTail)) {
    return null;
  }

  const overlapCount = calculateLocalTailOverlap(snapshotMessages, localTail);
  return [
    ...snapshotMessages,
    ...localTail.slice(overlapCount),
  ];
}

function mergeSettledLocalConversationTail(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
  { allowEmptySnapshot = true }: { allowEmptySnapshot?: boolean } = {},
) {
  const nextMessages: ChatMessage[] = snapshotMessages.map((message) => ({ ...message }));
  const normalizedLocalMessages = normalizeSettledLocalMessages(localMessages);

  if (!nextMessages.length) {
    if (!allowEmptySnapshot) {
      return nextMessages;
    }
    return collapseDuplicateConversationTurns(normalizedLocalMessages);
  }

  const restoredTrailingUserTurn = restoreMissingUserBeforeMatchingAssistant(nextMessages, normalizedLocalMessages);
  if (restoredTrailingUserTurn) {
    return preferSettledLocalAssistantReplay(restoredTrailingUserTurn, normalizedLocalMessages);
  }

  const nextWithLocalTail = appendLocalTailWhenSnapshotMatchesPrefix(nextMessages, normalizedLocalMessages) || nextMessages;
  return preferSettledLocalAssistantReplay(nextWithLocalTail, normalizedLocalMessages);
}

export function buildHydratedConversationWithLocalTail(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
  options: { allowEmptySnapshot?: boolean } = {},
) {
  return mergeSettledLocalConversationTail(snapshotMessages, localMessages, options);
}

export function buildDurableConversationWithLocalTail(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
  options: { allowEmptySnapshot?: boolean } = {},
) {
  return collapseDuplicateConversationTurns(
    mergeSettledLocalConversationTail(snapshotMessages, localMessages, options),
  );
}

export function buildStabilizedHydratedConversationWithLocalState(
  hydratedConversation: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
  options: { allowEmptySnapshot?: boolean } = {},
) {
  return mergeConversationIdentity(
    buildHydratedConversationWithLocalTail(hydratedConversation, localMessages, options),
    localMessages,
  );
}
