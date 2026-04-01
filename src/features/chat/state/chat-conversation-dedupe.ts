import type { ChatMessage } from "@/types/chat";
import { cleanWrappedUserMessage } from "@/features/app/state/app-prompt-storage";

const DUPLICATE_CONVERSATION_TURN_WINDOW_MS = 90 * 1000;
const DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS = 5 * 1000;
const DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS = 10 * 60 * 1000;

function normalizeConversationContent(content = "", role = "") {
  const normalizedRole = String(role || "").trim().toLowerCase();
  let text = String(content || "");

  if (normalizedRole === "assistant") {
    text = text
      .replace(/\[\[reply_to_current\]\]/gi, "")
      .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
      .replace(/<small>[\s\S]*?<\/small>/gi, "");
  } else if (normalizedRole === "user") {
    text = cleanWrappedUserMessage(text);
  }

  return text
    .replace(/\s+/g, " ")
    .trim();
}

function extractSyntheticAttachmentPrompt(content = "") {
  const normalized = String(content || "").trim();
  if (!normalized) {
    return { attachmentNames: [] as string[], baseContent: "" };
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => String(block || "").trim())
    .filter(Boolean);
  const attachmentNames: string[] = [];

  while (blocks.length) {
    const lastBlock = blocks[blocks.length - 1] || "";
    const attachmentMatch = lastBlock.match(/^附件\s+(.+?)(?:\s*\([^)]+\))?\s*已附加。$/);
    if (!attachmentMatch?.[1]) {
      break;
    }
    attachmentNames.unshift(String(attachmentMatch[1] || "").trim());
    blocks.pop();
  }

  if (blocks.length && /^用户附加了\s+\d+\s+个附件，请结合附件内容处理请求。$/i.test(blocks[blocks.length - 1] || "")) {
    blocks.pop();
  }

  return {
    attachmentNames,
    baseContent: blocks.join("\n\n").trim(),
  };
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

function hasConversationPayload(message: ChatMessage | null | undefined) {
  return Boolean(String(message?.content || "").trim()) || Boolean(message?.attachments?.length);
}

function getConversationAttachmentNames(message: ChatMessage | null | undefined): string[] {
  const attachmentNames = Array.isArray(message?.attachments)
    ? message.attachments
      .map((attachment) => String(attachment?.name || "").trim())
      .filter(Boolean)
    : [];

  if (attachmentNames.length) {
    return [...attachmentNames].sort();
  }

  return extractSyntheticAttachmentPrompt(message?.content)
    .attachmentNames
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .sort();
}

function getConversationComparableText(message: ChatMessage | null | undefined) {
  const syntheticPrompt = extractSyntheticAttachmentPrompt(message?.content);
  const content = syntheticPrompt.baseContent || String(message?.content || "");
  return normalizeConversationContent(content, String(message?.role || ""));
}

function shouldCollapseSyntheticAttachmentDuplicate(
  previous: ChatMessage | null | undefined,
  next: ChatMessage | null | undefined,
) {
  if (previous?.role !== "user" || next?.role !== "user") {
    return false;
  }

  const previousTimestamp = Number(previous.timestamp || 0);
  const nextTimestamp = Number(next.timestamp || 0);
  if (
    previousTimestamp > 0
    && nextTimestamp > 0
    && nextTimestamp - previousTimestamp > DUPLICATE_CONVERSATION_TURN_WINDOW_MS
  ) {
    return false;
  }

  const previousAttachmentNames = getConversationAttachmentNames(previous);
  const nextAttachmentNames = getConversationAttachmentNames(next);
  if (!previousAttachmentNames.length || !nextAttachmentNames.length) {
    return false;
  }

  const previousText = getConversationComparableText(previous);
  const nextText = getConversationComparableText(next);
  return previousText === nextText && previousAttachmentNames.join("|") === nextAttachmentNames.join("|");
}

function choosePreferredSyntheticAttachmentTurn(previous: ChatMessage, next: ChatMessage) {
  const previousHasAttachments = Boolean(previous.attachments?.length);
  const nextHasAttachments = Boolean(next.attachments?.length);
  if (previousHasAttachments !== nextHasAttachments) {
    return nextHasAttachments ? next : previous;
  }

  const previousText = String(previous.content || "").trim();
  const nextText = String(next.content || "").trim();
  if (previousText !== nextText) {
    return nextText.length <= previousText.length ? next : previous;
  }

  return next;
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

  return previous;
}

function isAssistantReplayTimestampMatch(previousTimestamp: number, nextTimestamp: number) {
  if (previousTimestamp > 0 && nextTimestamp > 0) {
    return Math.abs(nextTimestamp - previousTimestamp) <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS;
  }

  return true;
}

function shouldCollapseAssistantPrefixReplay(
  previous: ChatMessage | null | undefined,
  next: ChatMessage | null | undefined,
) {
  if (previous?.role !== "assistant" || next?.role !== "assistant") {
    return false;
  }

  const previousText = normalizeConversationContent(previous.content, previous.role);
  const nextText = normalizeConversationContent(next.content, next.role);
  if (!previousText || !nextText || previousText === nextText) {
    return false;
  }

  if (!isAssistantReplayTimestampMatch(Number(previous.timestamp || 0), Number(next.timestamp || 0))) {
    return false;
  }

  const shorter = previousText.length <= nextText.length ? previousText : nextText;
  const longer = previousText.length > nextText.length ? previousText : nextText;
  return longer.startsWith(shorter);
}

export function collapseDuplicateConversationTurns(entries: ChatMessage[] = []) {
  const collapsed: ChatMessage[] = [];
  let lastUserFingerprint = "";
  let lastUserTimestamp = 0;
  let lastUserIndex = -1;
  let lastAssistantTimestamp = 0;
  let lastAssistantFingerprint = "";
  let assistantSeenForCurrentTurn = false;
  let pendingReplayUser: ChatMessage | null = null;
  let pendingReplayAssistantFingerprint = "";

  const flushPendingReplayUser = () => {
    if (!pendingReplayUser) {
      return;
    }
    collapsed.push(pendingReplayUser);
    pendingReplayUser = null;
    pendingReplayAssistantFingerprint = "";
  };

  for (const entry of entries) {
    if (!entry?.role || !hasConversationPayload(entry)) {
      continue;
    }

    if (entry.role === "user") {
      const previousEntry = collapsed[collapsed.length - 1];
      if (!assistantSeenForCurrentTurn && shouldCollapseSyntheticAttachmentDuplicate(previousEntry, entry)) {
        collapsed[collapsed.length - 1] = choosePreferredSyntheticAttachmentTurn(previousEntry as ChatMessage, entry);
        const preferred = collapsed[collapsed.length - 1];
        lastUserFingerprint =
          getConversationComparableText(preferred)
          || getConversationAttachmentNames(preferred).join("|");
        lastUserTimestamp = Number(preferred?.timestamp || entry.timestamp || 0);
        lastUserIndex = collapsed.length - 1;
        pendingReplayAssistantFingerprint = "";
        continue;
      }

      const previousUserEntry = lastUserIndex >= 0 ? collapsed[lastUserIndex] : null;
      if (
        assistantSeenForCurrentTurn
        && previousUserEntry
        && shouldCollapseSyntheticAttachmentDuplicate(previousUserEntry, entry)
      ) {
        const preferred = choosePreferredSyntheticAttachmentTurn(previousUserEntry, entry);
        collapsed[lastUserIndex] = preferred;
        lastUserFingerprint =
          getConversationComparableText(preferred)
          || getConversationAttachmentNames(preferred).join("|");
        lastUserTimestamp = Number(preferred?.timestamp || entry.timestamp || 0);
        pendingReplayAssistantFingerprint = "";
        continue;
      }

      flushPendingReplayUser();
      const fingerprint =
        getConversationComparableText(entry)
        || getConversationAttachmentFingerprint(entry.attachments)
        || getConversationAttachmentNames(entry).join("|");
      const timestamp = Number(entry.timestamp || 0);
      const withinShortReplayWindow =
        timestamp > 0
        && lastUserTimestamp > 0
        && timestamp - lastUserTimestamp <= DUPLICATE_CONVERSATION_TURN_WINDOW_MS;
      const immediateAssistantReplay =
        timestamp > 0
        && lastAssistantTimestamp > 0
        && lastUserTimestamp > 0
        && timestamp - lastAssistantTimestamp <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS
        && timestamp - lastUserTimestamp <= DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS;
      const isReplay =
        Boolean(fingerprint)
        && fingerprint === lastUserFingerprint
        && assistantSeenForCurrentTurn
        && (withinShortReplayWindow || immediateAssistantReplay);

      if (isReplay) {
        pendingReplayUser = entry;
        pendingReplayAssistantFingerprint = lastAssistantFingerprint;
        continue;
      }

      collapsed.push(entry);
      lastUserFingerprint = fingerprint;
      lastUserTimestamp = timestamp;
      lastUserIndex = collapsed.length - 1;
      assistantSeenForCurrentTurn = false;
      pendingReplayAssistantFingerprint = "";
      continue;
    }

    if (entry.role === "assistant") {
      const fingerprint =
        normalizeConversationContent(entry.content, entry.role)
        || getConversationAttachmentFingerprint(entry.attachments);
      const currentAssistantTimestamp = Number(entry.timestamp || 0);
      if (pendingReplayUser) {
        const shouldCollapseReplay =
          pendingReplayAssistantFingerprint
          && fingerprint
          && fingerprint === pendingReplayAssistantFingerprint;

        if (!shouldCollapseReplay) {
          collapsed.push(pendingReplayUser);
        }

        pendingReplayUser = null;
        pendingReplayAssistantFingerprint = "";

        if (shouldCollapseReplay) {
          continue;
        }
      }

      const previousAssistantEntry = collapsed[collapsed.length - 1];
      const isDuplicateAssistantReplay =
        assistantSeenForCurrentTurn
        && previousAssistantEntry?.role === "assistant"
        && (
          (Boolean(fingerprint) && fingerprint === lastAssistantFingerprint)
          || shouldCollapseAssistantPrefixReplay(previousAssistantEntry, entry)
        )
        && (
          !currentAssistantTimestamp
          || !lastAssistantTimestamp
          || currentAssistantTimestamp >= lastAssistantTimestamp
        );
      if (isDuplicateAssistantReplay) {
        const preferred = choosePreferredAssistantReplay(previousAssistantEntry, entry);
        collapsed[collapsed.length - 1] = preferred;
        lastAssistantTimestamp = Number(preferred.timestamp || currentAssistantTimestamp || 0);
        lastAssistantFingerprint =
          normalizeConversationContent(preferred.content, preferred.role)
          || getConversationAttachmentFingerprint(preferred.attachments);
        continue;
      }

      collapsed.push(entry);
      assistantSeenForCurrentTurn = true;
      lastAssistantTimestamp = currentAssistantTimestamp;
      lastAssistantFingerprint = fingerprint;
      continue;
    }

    flushPendingReplayUser();
    collapsed.push(entry);
  }

  flushPendingReplayUser();
  return collapsed;
}
