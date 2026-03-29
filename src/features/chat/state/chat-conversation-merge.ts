import type { ChatMessage, PendingChatTurn } from "@/types/chat";

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

function getConversationAttachmentMergeSignatures(attachment: Record<string, unknown> = {}, index = 0) {
  const signatures: string[] = [];
  const filePath = String(attachment?.fullPath || attachment?.path || "").trim();
  if (filePath) {
    signatures.push(["path", filePath].join("|"));
  }

  const name = String(attachment?.name || "").trim();
  const mimeType = String(attachment?.mimeType || "").trim();
  const kind = String(attachment?.kind || "").trim();
  if (name || mimeType || kind) {
    signatures.push(["named", name, mimeType, kind].join("|"));
  }

  const explicitId = String(attachment?.id || attachment?.storageKey || "").trim();
  if (explicitId) {
    signatures.push(`id::${explicitId}`);
  }

  if (!signatures.length) {
    signatures.push(`index::${index}`);
  }

  return signatures;
}

function getConversationAttachmentPayloadScore(attachment: Record<string, unknown> = {}) {
  let score = 0;

  if (String(attachment?.previewUrl || "").trim()) {
    score += 64;
  }
  if (String(attachment?.dataUrl || "").trim()) {
    score += 32;
  }
  if (String(attachment?.fullPath || "").trim()) {
    score += 16;
  }
  if (String(attachment?.path || "").trim()) {
    score += 8;
  }
  if (String(attachment?.textContent || "").trim()) {
    score += 4;
  }
  if (String(attachment?.mimeType || "").trim()) {
    score += 2;
  }
  if (String(attachment?.name || "").trim()) {
    score += 1;
  }

  return score;
}

function normalizeConversationMessageId(message: ChatMessage | null | undefined) {
  return String(message?.id || "").trim();
}

function mergeConversationAttachmentPayloads(snapshotAttachments: unknown = [], localAttachments: unknown = []) {
  if (!Array.isArray(snapshotAttachments) || !snapshotAttachments.length) {
    return Array.isArray(localAttachments) ? localAttachments : [];
  }

  if (!Array.isArray(localAttachments) || !localAttachments.length) {
    return snapshotAttachments;
  }

  const remainingLocalAttachments = localAttachments.map((attachment) =>
    attachment && typeof attachment === "object" ? attachment as Record<string, unknown> : {},
  );
  const claimedLocalAttachmentIndices = new Set<number>();

  const mergedAttachments = snapshotAttachments.map((attachment, index) => {
    const normalizedAttachment = attachment && typeof attachment === "object" ? attachment as Record<string, unknown> : {};
    const snapshotSignatures = new Set(getConversationAttachmentMergeSignatures(normalizedAttachment, index));
    const localAttachmentIndex = remainingLocalAttachments.findIndex((candidate, candidateIndex) => {
      if (claimedLocalAttachmentIndices.has(candidateIndex)) {
        return false;
      }
      const candidateSignatures = getConversationAttachmentMergeSignatures(candidate, candidateIndex);
      return candidateSignatures.some((signature) => snapshotSignatures.has(signature));
    });
    const localAttachment = localAttachmentIndex >= 0 ? remainingLocalAttachments[localAttachmentIndex] : null;
    if (localAttachmentIndex >= 0) {
      claimedLocalAttachmentIndices.add(localAttachmentIndex);
    }

    if (!localAttachment) {
      return normalizedAttachment;
    }

    const snapshotScore = getConversationAttachmentPayloadScore(normalizedAttachment);
    const localScore = getConversationAttachmentPayloadScore(localAttachment);
    const preferredAttachment = snapshotScore >= localScore ? normalizedAttachment : localAttachment;
    const fallbackAttachment = preferredAttachment === normalizedAttachment ? localAttachment : normalizedAttachment;

    return {
      ...fallbackAttachment,
      ...preferredAttachment,
    };
  });

  remainingLocalAttachments.forEach((attachment, index) => {
    if (!claimedLocalAttachmentIndices.has(index)) {
      mergedAttachments.push(attachment);
    }
  });

  return mergedAttachments;
}

function areEquivalentConversationMessages(snapshotMessage, localMessage) {
  if (!snapshotMessage || !localMessage || snapshotMessage.role !== localMessage.role) {
    return false;
  }

  const normalizeAssistantConversationContent = (content = "") =>
    String(content || "")
      .replace(/\[\[reply_to_current\]\]/gi, "")
      .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
      .replace(/<small>[\s\S]*?<\/small>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const snapshotContent = snapshotMessage.role === "assistant"
    ? normalizeAssistantConversationContent(snapshotMessage.content)
    : String(snapshotMessage.content || "").trim();
  const localContent = localMessage.role === "assistant"
    ? normalizeAssistantConversationContent(localMessage.content)
    : String(localMessage.content || "").trim();
  const snapshotAttachmentFingerprint = getConversationAttachmentFingerprint(snapshotMessage.attachments);
  const localAttachmentFingerprint = getConversationAttachmentFingerprint(localMessage.attachments);
  const contentMatches = Boolean(snapshotContent) && snapshotContent === localContent;
  const attachmentMatches = Boolean(snapshotAttachmentFingerprint) && snapshotAttachmentFingerprint === localAttachmentFingerprint;

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

function shouldMergeConversationAttachmentsForMessage(
  snapshotMessage: ChatMessage | null | undefined,
  localMessage: ChatMessage | null | undefined,
) {
  if (!snapshotMessage || !localMessage || snapshotMessage.role !== localMessage.role) {
    return false;
  }

  const snapshotId = normalizeConversationMessageId(snapshotMessage);
  const localId = normalizeConversationMessageId(localMessage);
  if (snapshotId && localId) {
    return snapshotId === localId;
  }

  const snapshotContent = String(snapshotMessage.content || "");
  const localContent = String(localMessage.content || "");
  if (snapshotContent !== localContent) {
    return false;
  }

  const snapshotTimestamp = Number(snapshotMessage.timestamp || 0);
  const localTimestamp = Number(localMessage.timestamp || 0);
  if (snapshotTimestamp > 0 && localTimestamp > 0) {
    return snapshotTimestamp === localTimestamp;
  }

  const snapshotAttachmentFingerprint = getConversationAttachmentFingerprint(snapshotMessage.attachments);
  const localAttachmentFingerprint = getConversationAttachmentFingerprint(localMessage.attachments);
  if (snapshotAttachmentFingerprint && localAttachmentFingerprint) {
    return snapshotAttachmentFingerprint === localAttachmentFingerprint;
  }

  return false;
}

export function mergeConversationAttachments(snapshotMessages: ChatMessage[] = [], localMessages: ChatMessage[] = []) {
  const nextMessages = snapshotMessages.map((message) => ({ ...message }));
  const usedIndices = new Set<number>();

  localMessages.forEach((localMessage) => {
    if (!localMessage?.attachments?.length) {
      return;
    }

    const matchIndex = nextMessages.findIndex(
      (message, index) =>
        !usedIndices.has(index) &&
        shouldMergeConversationAttachmentsForMessage(message, localMessage),
    );

    if (matchIndex === -1) {
      return;
    }

    const snapshotMessage = nextMessages[matchIndex];
    if (snapshotMessage) {
      nextMessages[matchIndex] = {
        ...snapshotMessage,
        attachments: mergeConversationAttachmentPayloads(snapshotMessage.attachments, localMessage.attachments),
      };
    }
    usedIndices.add(matchIndex);
  });

  return nextMessages;
}

function getConversationTimestamp(message: ChatMessage | null | undefined) {
  const timestamp = Number(message?.timestamp || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function findPendingUserIndex(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null): number {
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

function findSnapshotPendingAssistantIndex(
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

function findBestMatchingLocalMessageIndex(
  snapshotMessage: ChatMessage | null | undefined,
  localMessages: ChatMessage[] = [],
  usedLocalIndices = new Set<number>(),
  minimumLocalIndex = -1,
) {
  if (!snapshotMessage) {
    return -1;
  }

  const snapshotId = String(snapshotMessage?.id || "").trim();
  const snapshotTimestamp = getConversationTimestamp(snapshotMessage);
  let bestIndex = -1;
  let bestTimestampDelta = Number.POSITIVE_INFINITY;
  let bestHasComparableTimestamp = false;

  for (let index = 0; index < localMessages.length; index += 1) {
    if (usedLocalIndices.has(index) || index <= minimumLocalIndex) {
      continue;
    }

    const localMessage = localMessages[index];
    if (!areEquivalentConversationMessages(snapshotMessage, localMessage)) {
      continue;
    }

    const localId = String(localMessage?.id || "").trim();
    if (snapshotId && localId && snapshotId === localId) {
      return index;
    }

    const localTimestamp = getConversationTimestamp(localMessage);
    const hasComparableTimestamp = Boolean(snapshotTimestamp && localTimestamp);
    const timestampDelta = hasComparableTimestamp
      ? Math.abs(snapshotTimestamp - localTimestamp)
      : Number.POSITIVE_INFINITY;

    if (
      bestIndex === -1
      || (hasComparableTimestamp && !bestHasComparableTimestamp)
      || (hasComparableTimestamp === bestHasComparableTimestamp && timestampDelta < bestTimestampDelta)
    ) {
      bestIndex = index;
      bestTimestampDelta = timestampDelta;
      bestHasComparableTimestamp = hasComparableTimestamp;
    }
  }

  return bestIndex;
}

export function mergeConversationIdentity(
  snapshotMessages: ChatMessage[] = [],
  localMessages: ChatMessage[] = [],
  pendingEntry: PendingChatTurn | null = null,
) {
  const nextMessages: ChatMessage[] = snapshotMessages.map((message) => ({ ...message }));
  const usedLocalIndices = new Set<number>();
  let minimumLocalIndex = -1;

  nextMessages.forEach((message, index) => {
    const localIndex = findBestMatchingLocalMessageIndex(
      message,
      localMessages,
      usedLocalIndices,
      minimumLocalIndex,
    );

    if (localIndex === -1) {
      return;
    }

    const localMessage = localMessages[localIndex];
    if (!localMessage) {
      return;
    }
    nextMessages[index] = {
      ...message,
      ...(localMessage.id ? { id: localMessage.id } : {}),
      ...(Number.isFinite(Number(localMessage.timestamp)) ? { timestamp: localMessage.timestamp } : {}),
    };
    usedLocalIndices.add(localIndex);
    minimumLocalIndex = localIndex;
  });

  if (pendingEntry) {
    const localPendingUser = localMessages.find((message) => {
      if (message?.role !== "user") {
        return false;
      }

      const pendingUserId = String(pendingEntry?.userMessage?.id || "").trim();
      if (pendingUserId && String(message?.id || "").trim() === pendingUserId) {
        return true;
      }

      return String(message?.content || "") === String(pendingEntry?.userMessage?.content || "")
        && Number(message?.timestamp || 0) === Number(pendingEntry?.userMessage?.timestamp || 0);
    });
    const snapshotPendingUserIndex = findPendingUserIndex(nextMessages, pendingEntry);
    if (localPendingUser && snapshotPendingUserIndex >= 0) {
      const snapshotPendingUser = nextMessages[snapshotPendingUserIndex];
      if (snapshotPendingUser) {
        nextMessages[snapshotPendingUserIndex] = {
          ...snapshotPendingUser,
          ...(localPendingUser.id ? { id: localPendingUser.id } : {}),
          ...(Number.isFinite(Number(localPendingUser.timestamp)) ? { timestamp: localPendingUser.timestamp } : {}),
        };
      }
    }

    const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
    const localPendingAssistant = assistantMessageId
      ? localMessages.find((message) => message?.role === "assistant" && String(message?.id || "").trim() === assistantMessageId)
      : null;
    const snapshotPendingAssistantIndex = findSnapshotPendingAssistantIndex(nextMessages, pendingEntry);
    if (localPendingAssistant && snapshotPendingAssistantIndex >= 0) {
      const snapshotPendingAssistant = nextMessages[snapshotPendingAssistantIndex];
      if (snapshotPendingAssistant) {
        nextMessages[snapshotPendingAssistantIndex] = {
          ...snapshotPendingAssistant,
          ...(localPendingAssistant.id ? { id: localPendingAssistant.id } : {}),
          ...(Number.isFinite(Number(localPendingAssistant.timestamp)) ? { timestamp: localPendingAssistant.timestamp } : {}),
        };
      }
    }
  }

  return nextMessages;
}
