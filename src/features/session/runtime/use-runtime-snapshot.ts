import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createConversationKey } from "@/features/app/state/app-session-identity";
import { extractUserPromptHistory } from "@/features/app/state/app-prompt-storage";
import {
  mergeConversationAttachments,
  mergeConversationIdentity,
} from "@/features/chat/state/chat-conversation-merge";
import {
  buildDashboardChatSessionState,
  buildDashboardSettledMessages,
} from "@/features/chat/state/chat-dashboard-session";
import {
  hasAuthoritativePendingAssistantReply,
  resolveRuntimePendingEntry,
} from "@/features/chat/state/chat-runtime-pending";
import { shouldReuseSettledLocalConversationTail } from "@/features/chat/state/chat-settled-conversation";
import { selectChatRunBusy } from "@/features/chat/state/chat-session-state";
import { isImBootstrapSessionUser, isImSessionUser } from "@/features/session/im-session";
import { normalizeStatusKey } from "@/features/session/status-display";
import { apiFetch } from "@/lib/api-client";
import { pushCcDebugEvent, summarizeCcMessages } from "@/lib/cc-debug-events";
import type { ChatMessage, PendingChatTurn } from "@/types/chat";
import type {
  RuntimeFile,
  RuntimePeeks,
  RuntimePollIntervalInput,
  RuntimeRecoveredPendingProgressMap,
  RuntimeSession,
  RuntimeSnapshot,
  RuntimeSnapshotApplyOptions,
  RuntimeSnapshotHookInput,
  RuntimeSnapshotRequestOverrides,
  RuntimeSocketPayload,
  RuntimeTaskRelationship,
} from "@/types/runtime";
import { collectAvailableRuntimeAgentIds } from "./runtime-agent-availability";
import { useRuntimeSocket } from "./use-runtime-socket";

const EMPTY_RUNTIME_PEEKS: RuntimePeeks = { workspace: null, terminal: null, browser: null, environment: null };

type InflightRuntimeRequest = {
  key: string;
  promise: Promise<RuntimeSnapshot>;
  requestId: number;
} | null;

function areJsonEqual(left: unknown, right: unknown) {
  if (left === right) {
    return true;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function areSessionSnapshotsEqual(left: RuntimeSession = {}, right: RuntimeSession = {}) {
  if (left === right) {
    return true;
  }

  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of keys) {
    if (!areJsonEqual(left?.[key], right?.[key])) {
      return false;
    }
  }
  return true;
}

export function getRuntimePollInterval({
  recoveringPendingReply = false,
  busy = false,
  activePendingChat = null,
  sessionUser = "",
}: RuntimePollIntervalInput = {}) {
  if (recoveringPendingReply) {
    return 1500;
  }

  if (busy || activePendingChat || isImSessionUser(sessionUser)) {
    return 4000;
  }

  return 15000;
}

export function mergeTaskRelationships(
  previousRelationships: RuntimeTaskRelationship[] = [],
  nextRelationships: RuntimeTaskRelationship[] = [],
) {
  const previousById = new Map(
    (previousRelationships || [])
      .filter((relationship) => relationship?.id)
      .map((relationship) => [relationship.id, relationship]),
  );
  const merged = new Map<string, RuntimeTaskRelationship>();

  for (const relationship of nextRelationships || []) {
    if (!relationship?.id) {
      continue;
    }

    const existing = merged.get(relationship.id);
    if (!existing || (relationship.timestamp || 0) >= (existing.timestamp || 0)) {
      const previous = previousById.get(relationship.id);
      let nextRelationship = relationship;

      if (normalizeStatusKey(relationship.status) === "completed") {
        if (relationship.completedAt) {
          nextRelationship = relationship;
        } else if (existing?.completedAt) {
          nextRelationship = { ...relationship, completedAt: existing.completedAt };
        } else if (previous?.completedAt) {
          nextRelationship = { ...relationship, completedAt: previous.completedAt };
        } else if (
          (existing?.status && normalizeStatusKey(existing.status) !== "completed") ||
          (previous?.status && normalizeStatusKey(previous.status) !== "completed")
        ) {
          nextRelationship = { ...relationship, completedAt: Date.now() };
        }
      }

      merged.set(relationship.id, nextRelationship);
    }
  }

  return [...merged.values()].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
}

function getTaskTimelineEntryId(entry: unknown) {
  return String(entry && typeof entry === "object" ? (entry as Record<string, unknown>).id || "" : "").trim();
}

function getTaskTimelineEntryTimestamp(entry: unknown) {
  if (!entry || typeof entry !== "object") {
    return 0;
  }

  const value = Number((entry as Record<string, unknown>).timestamp || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function mergeTaskTimeline(previousTimeline: unknown[] = [], nextTimeline: unknown[] = []) {
  const previousById = new Map(
    (previousTimeline || [])
      .filter((entry) => getTaskTimelineEntryId(entry))
      .map((entry) => [getTaskTimelineEntryId(entry), entry]),
  );

  return [...(nextTimeline || [])]
    .map((entry) => {
      const entryId = getTaskTimelineEntryId(entry);
      if (!entryId || !entry || typeof entry !== "object") {
        return entry;
      }

      const previousEntry = previousById.get(entryId);
      if (!previousEntry || typeof previousEntry !== "object") {
        return entry;
      }

      const nextRecord = entry as Record<string, unknown>;
      const previousRecord = previousEntry as Record<string, unknown>;
      const nextTools = Array.isArray(nextRecord.tools) ? nextRecord.tools : [];
      const previousTools = Array.isArray(previousRecord.tools) ? previousRecord.tools : [];
      const nextToolsSummary = String(nextRecord.toolsSummary || "").trim();
      const previousToolsSummary = String(previousRecord.toolsSummary || "").trim();

      return {
        ...previousRecord,
        ...nextRecord,
        tools: nextTools.length ? nextTools : previousTools,
        toolsSummary: nextToolsSummary || previousToolsSummary,
        timestamp: getTaskTimelineEntryTimestamp(entry) || getTaskTimelineEntryTimestamp(previousEntry),
      };
    })
    .sort((left, right) => getTaskTimelineEntryTimestamp(left) - getTaskTimelineEntryTimestamp(right));
}

function setIfChanged<T>(setter: Dispatch<SetStateAction<T>>, nextValue: T) {
  setter((current) => (areJsonEqual(current, nextValue) ? current : nextValue));
}

function fileActionPriority(action = "") {
  if (action === "created") {
    return 3;
  }
  if (action === "modified") {
    return 2;
  }
  if (action === "viewed") {
    return 1;
  }
  return 0;
}

export function mergeRuntimeFiles(previousFiles: RuntimeFile[] = [], nextFiles: RuntimeFile[] = []) {
  const merged = new Map<string, RuntimeFile>();

  for (const item of previousFiles || []) {
    const key = String(item?.fullPath || item?.path || "").trim();
    if (!key) {
      continue;
    }

    merged.set(key, { ...item });
  }

  for (const item of nextFiles || []) {
    const key = String(item?.fullPath || item?.path || "").trim();
    if (!key) {
      continue;
    }

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }

    const existingPrimaryAction = String(existing?.primaryAction || "").trim();
    const nextPrimaryAction = String(item?.primaryAction || "").trim();
    const mergedActions = Array.from(new Set([
      ...(Array.isArray(existing?.actions) ? existing.actions : []),
      ...(Array.isArray(item?.actions) ? item.actions : []),
    ].filter(Boolean)));
    const preferredPrimaryAction =
      fileActionPriority(nextPrimaryAction) >= fileActionPriority(existingPrimaryAction)
        ? (nextPrimaryAction || existingPrimaryAction)
        : (existingPrimaryAction || nextPrimaryAction);
    const existingObservedAt = Number(existing?.observedAt || 0);
    const nextObservedAt = Number(item?.observedAt || 0);
    const existingUpdatedAt = Number(existing?.updatedAt || 0);
    const nextUpdatedAt = Number(item?.updatedAt || 0);
    const preferNext = nextObservedAt >= existingObservedAt || nextUpdatedAt >= existingUpdatedAt;

    merged.set(key, {
      ...(preferNext ? existing : item),
      ...(preferNext ? item : existing),
      primaryAction: preferredPrimaryAction || "viewed",
      actions: mergedActions,
      observedAt: Math.max(existingObservedAt, nextObservedAt),
      updatedAt: Math.max(existingUpdatedAt, nextUpdatedAt),
    });
  }

  return [...merged.values()].sort((left, right) => {
    const observedDelta = Number(right?.observedAt || 0) - Number(left?.observedAt || 0);
    if (observedDelta !== 0) {
      return observedDelta;
    }

    return Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0);
  });
}

function snapshotHasPendingUserMessage(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null) {
  if (!pendingEntry?.userMessage?.content) {
    return false;
  }

  const targetContent = String(pendingEntry.userMessage.content);
  const expectedTimestamp = Number(pendingEntry.userMessage.timestamp || 0);
  const startedAt = Number(pendingEntry.startedAt || 0);
  const matchThreshold = expectedTimestamp || startedAt || 0;

  return (snapshotMessages || []).some((message) => {
    if (message?.role !== "user" || String(message.content || "") !== targetContent) {
      return false;
    }

    const timestamp = Number(message.timestamp || 0);
    return !matchThreshold || !timestamp || timestamp >= matchThreshold;
  });
}

function findSnapshotPendingUserIndex(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null) {
  if (!pendingEntry?.userMessage?.content) {
    return -1;
  }

  const targetContent = String(pendingEntry.userMessage.content);
  const expectedTimestamp = Number(pendingEntry.userMessage.timestamp || 0);
  const startedAt = Number(pendingEntry.startedAt || 0);
  const matchThreshold = expectedTimestamp || startedAt || 0;

  for (let index = snapshotMessages.length - 1; index >= 0; index -= 1) {
    const message = snapshotMessages[index];
    if (message?.role !== "user" || String(message.content || "") !== targetContent) {
      continue;
    }

    const timestamp = Number(message.timestamp || 0);
    if (!matchThreshold || !timestamp || timestamp >= matchThreshold) {
      return index;
    }
  }

  return -1;
}

function snapshotHasAdvancedPastPendingTurn(snapshotMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null) {
  const pendingUserIndex = findSnapshotPendingUserIndex(snapshotMessages, pendingEntry);
  if (pendingUserIndex < 0) {
    return false;
  }

  return snapshotMessages.some((message, index) => index > pendingUserIndex && message?.role === "user");
}

function shouldClearRecoveredPendingTurn({
  pendingEntry,
  recoveringPendingReply = false,
  snapshotHasPendingUserMessage = false,
  snapshotHasAssistantReply = false,
  snapshotHasAdvancedPastPending = false,
  status = "",
}: {
  pendingEntry?: PendingChatTurn | null;
  recoveringPendingReply?: boolean;
  snapshotHasPendingUserMessage?: boolean;
  snapshotHasAssistantReply?: boolean;
  snapshotHasAdvancedPastPending?: boolean;
  status?: string;
} = {}) {
  if (!recoveringPendingReply || !pendingEntry || pendingEntry?.stopped || snapshotHasAssistantReply) {
    return false;
  }

  if (snapshotHasAdvancedPastPending) {
    return true;
  }

  const normalizedStatus = normalizeStatusKey(status);
  if (normalizedStatus === "failed" || normalizedStatus === "offline") {
    return true;
  }

  // Runtime snapshots often lag behind an in-flight turn after a refresh. If the
  // snapshot already includes the latest user turn, keep the recovered pending
  // reply alive until an assistant answer arrives.
  return (normalizedStatus === "idle" || normalizedStatus === "completed") && !snapshotHasPendingUserMessage;
}

function hasLocalLivePendingAssistant(localMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null, busy = false) {
  if (!pendingEntry || pendingEntry?.stopped) {
    return false;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || 0);

  return (localMessages || []).some((message) => {
    if (message?.role !== "assistant") {
      return false;
    }

    const isLiveAssistant = Boolean(message?.streaming) || (Boolean(message?.pending) && busy);
    if (!isLiveAssistant) {
      return false;
    }

    const messageId = String(message?.id || "").trim();
    if (assistantMessageId && messageId === assistantMessageId) {
      return true;
    }

    const timestamp = Number(message?.timestamp || 0);
    return pendingTimestamp > 0 && timestamp === pendingTimestamp;
  });
}

function hasExplicitLocalLivePendingAssistant(localMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null) {
  if (!pendingEntry) {
    return false;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || 0);

  return (localMessages || []).some((message) => {
    if (message?.role !== "assistant" || !(message?.pending || message?.streaming)) {
      return false;
    }

    if (assistantMessageId && String(message?.id || "").trim() === assistantMessageId) {
      return true;
    }

    const timestamp = Number(message?.timestamp || 0);
    return pendingTimestamp > 0 && timestamp === pendingTimestamp;
  });
}

function findLocalSettledPendingAssistantCandidate(localMessages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null) {
  if (!pendingEntry || pendingEntry?.stopped) {
    return null;
  }

  const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || 0);
  const startedAt = Number(pendingEntry?.startedAt || 0);

  return [...localMessages].reverse().find((message) => {
    if (message?.role !== "assistant" || message?.pending) {
      return false;
    }

    const timestamp = Number(message?.timestamp || 0);
    if (!timestamp) {
      return false;
    }

    if (timestamp !== pendingTimestamp && timestamp < startedAt) {
      return false;
    }

    return Boolean(String(message?.content || "").trim());
  }) || null;
}

function normalizeAssistantProgressContent(content = "") {
  return String(content || "")
    .replace(/\[\[reply_to_current\]\]/gi, "")
    .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
    .replace(/<small>[\s\S]*?<\/small>/gi, "")
    .trim();
}

function hasLocallySettledCommandCenterReply(messages: ChatMessage[] = []) {
  if (!Array.isArray(messages) || !messages.length) {
    return false;
  }

  let sawUserTurn = false;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      sawUserTurn = true;
      return false;
    }

    if (message?.role !== "assistant") {
      continue;
    }

    if (message?.pending || message?.streaming) {
      return false;
    }

    if (!normalizeAssistantProgressContent(message?.content).length) {
      continue;
    }

    return sawUserTurn || index > 0;
  }

  return false;
}

function findPendingAssistantMessage(messages: ChatMessage[] = [], pendingEntry: PendingChatTurn | null = null) {
  if (!Array.isArray(messages) || !pendingEntry) {
    return null;
  }

  const assistantMessageId = String(pendingEntry?.assistantMessageId || "").trim();
  const pendingTimestamp = Number(pendingEntry?.pendingTimestamp || 0);

  return [...messages].reverse().find((message) => {
    if (message?.role !== "assistant") {
      return false;
    }

    const messageId = String(message?.id || "").trim();
    if (assistantMessageId && messageId === assistantMessageId) {
      return true;
    }

    const timestamp = Number(message?.timestamp || 0);
    return pendingTimestamp > 0 && timestamp === pendingTimestamp;
  }) || null;
}

function buildPendingMergeDecision({
  snapshotConversation = [],
  pendingEntry = null,
  localMessages = [],
  localMessagesWithoutPending = [],
  busy = false,
  recoveringPendingReply = false,
  keepRecoveredPendingAlive = false,
  canSettleRecoveredPending = false,
  status = "",
}: {
  snapshotConversation?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  localMessagesWithoutPending?: ChatMessage[];
  busy?: boolean;
  recoveringPendingReply?: boolean;
  keepRecoveredPendingAlive?: boolean;
  canSettleRecoveredPending?: boolean;
  status?: string;
} = {}) {
  const localSettledPendingAssistantCandidate = findLocalSettledPendingAssistantCandidate(localMessagesWithoutPending, pendingEntry);
  const localLivePendingAssistant = hasLocalLivePendingAssistant(localMessages, pendingEntry, busy);
  const snapshotHasAssistantReply = pendingEntry
    ? hasAuthoritativePendingAssistantReply(snapshotConversation, pendingEntry)
    : false;
  const snapshotHasAdvancedPastPending = pendingEntry
    ? snapshotHasAdvancedPastPendingTurn(snapshotConversation, pendingEntry)
    : false;
  const localHasSettledAssistantReply = pendingEntry?.assistantMessageId
    ? (!snapshotHasAdvancedPastPending && hasAuthoritativePendingAssistantReply(localMessagesWithoutPending, pendingEntry))
    : false;
  const localHasLivePendingAssistant = recoveringPendingReply
    ? (keepRecoveredPendingAlive || (snapshotHasAssistantReply && localLivePendingAssistant))
    : (localLivePendingAssistant || keepRecoveredPendingAlive);
  const snapshotIncludesPendingUserMessage = pendingEntry
    ? snapshotHasPendingUserMessage(snapshotConversation, pendingEntry)
    : false;
  const snapshotCanSettlePending =
    (canSettleRecoveredPending || !localHasLivePendingAssistant)
    && snapshotHasAssistantReply
    && snapshotIncludesPendingUserMessage;
  const localCanSettlePending =
    localHasSettledAssistantReply
    && snapshotIncludesPendingUserMessage;
  const hasAssistantReply =
    !localHasLivePendingAssistant
    && (snapshotCanSettlePending || localCanSettlePending);
  const shouldClearPending = localHasLivePendingAssistant
    ? false
    : shouldClearRecoveredPendingTurn({
        pendingEntry,
        recoveringPendingReply,
        snapshotHasPendingUserMessage: snapshotIncludesPendingUserMessage,
        snapshotHasAssistantReply: hasAssistantReply,
        snapshotHasAdvancedPastPending,
        status,
      });

  return {
    hasAssistantReply,
    localHasLivePendingAssistant,
    localHasSettledAssistantReply,
    localSettledPendingAssistantCandidate,
    shouldClearPending,
    snapshotCanSettlePending,
    snapshotHasAdvancedPastPending,
    snapshotHasAssistantReply,
    snapshotIncludesPendingUserMessage,
  };
}

function buildRuntimeConversationMergeState({
  baseMergedConversation = [],
  conversationWithAttachments = [],
  pendingEntry = null,
  localMessages = [],
  status = "",
  busy = false,
  recoveringPendingReply = false,
  progressRef,
}: {
  baseMergedConversation?: ChatMessage[];
  conversationWithAttachments?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  status?: string;
  busy?: boolean;
  recoveringPendingReply?: boolean;
  progressRef?: MutableRefObject<RuntimeRecoveredPendingProgressMap>;
} = {}) {
  const mergedConversation = pendingEntry
    ? mergeConversationIdentity(
        conversationWithAttachments,
        localMessages,
        pendingEntry,
      )
    : baseMergedConversation;
  const localMessagesWithoutPending = localMessages.filter((message) => !message?.pending);
  const recoveredPendingProgress = resolveRecoveredPendingProgress({
    recoveringPendingReply,
    pendingEntry,
    localMessages,
    snapshotMessages: mergedConversation,
    status,
    progressRef,
  });
  const pendingMergeDecision = buildPendingMergeDecision({
    snapshotConversation: conversationWithAttachments,
    pendingEntry,
    localMessages,
    localMessagesWithoutPending,
    busy,
    recoveringPendingReply,
    keepRecoveredPendingAlive: recoveredPendingProgress.keepRecoveredPendingAlive,
    canSettleRecoveredPending: recoveredPendingProgress.canSettleRecoveredPending,
    status,
  });

  return {
    localHasExplicitLivePendingAssistant: hasExplicitLocalLivePendingAssistant(localMessages, pendingEntry),
    localMessagesWithoutPending,
    mergedConversation,
    pendingMergeDecision,
    recoveredPendingProgress,
  };
}

function buildRuntimeConversationOutputs({
  agentId = "main",
  conversationKey = "",
  mergedConversation = [],
  pendingEntry = null,
  localMessages = [],
  localMessagesWithoutPending = [],
  busy = false,
  pendingLabel = "",
  status = "",
  clearPending = false,
  snapshotHasAssistantReply = false,
  snapshotIncludesPendingUserMessage = false,
  localHasLivePendingAssistant = false,
  localHasSettledAssistantReply = false,
  localHasExplicitLivePendingAssistant = false,
  localSettledPendingAssistantCandidate = null,
  hasAssistantReply = false,
  allowEmptySnapshotLocalTail = true,
  recoveringPendingReply = false,
  canSettleRecoveredPending = false,
}: {
  agentId?: string;
  conversationKey?: string;
  mergedConversation?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  localMessagesWithoutPending?: ChatMessage[];
  busy?: boolean;
  pendingLabel?: string;
  status?: string;
  clearPending?: boolean;
  snapshotHasAssistantReply?: boolean;
  snapshotIncludesPendingUserMessage?: boolean;
  localHasLivePendingAssistant?: boolean;
  localHasSettledAssistantReply?: boolean;
  localHasExplicitLivePendingAssistant?: boolean;
  localSettledPendingAssistantCandidate?: ChatMessage | null;
  hasAssistantReply?: boolean;
  allowEmptySnapshotLocalTail?: boolean;
  recoveringPendingReply?: boolean;
  canSettleRecoveredPending?: boolean;
} = {}) {
  const localLivePendingAssistantCandidate = localHasExplicitLivePendingAssistant
    ? findPendingAssistantMessage(localMessages, pendingEntry)
    : null;
  const snapshotSettledPendingAssistantCandidate = snapshotHasAssistantReply
    ? findLocalSettledPendingAssistantCandidate(mergedConversation, pendingEntry)
    : null;
  const snapshotAssistantCompletesLocalLiveTurn = Boolean(
    localLivePendingAssistantCandidate
    && snapshotSettledPendingAssistantCandidate
    && normalizeAssistantProgressContent(snapshotSettledPendingAssistantCandidate.content).length
      >= normalizeAssistantProgressContent(localLivePendingAssistantCandidate.content).length,
  );
  const dashboardSettledConversation = buildDashboardSettledMessages({
    messages: mergedConversation,
    pendingEntry,
    localMessages: localMessagesWithoutPending,
    localHasLivePendingAssistant,
    localHasExplicitLivePendingAssistant:
      localHasExplicitLivePendingAssistant && !snapshotAssistantCompletesLocalLiveTurn,
    localSettledPendingAssistantCandidate,
    snapshotHasAssistantReply,
    allowEmptySnapshotLocalTail,
  });
  const normalizedStatus = normalizeStatusKey(status);
  const controllerStillBusy = pendingEntry
    ? Boolean(busy && !pendingEntry?.stopped)
    : Boolean(busy && ["running", "dispatching"].includes(normalizedStatus));
  const recoveredPendingSettled = Boolean(
    recoveringPendingReply
    && canSettleRecoveredPending
    && (hasAssistantReply || localHasSettledAssistantReply),
  );
  const pendingSettledForDashboard = Boolean(
    clearPending
    || recoveredPendingSettled
    || (pendingEntry?.stopped && !controllerStillBusy)
    || (
      !controllerStillBusy
      && !recoveringPendingReply
      && snapshotIncludesPendingUserMessage
      && (hasAssistantReply || localHasSettledAssistantReply)
    ),
  );
  const dashboardPendingEntry = pendingSettledForDashboard
    ? null
    : (
      localLivePendingAssistantCandidate
      && normalizeAssistantProgressContent(localLivePendingAssistantCandidate.content)
        ? {
            ...pendingEntry,
            streamText: String(localLivePendingAssistantCandidate.content || ""),
          }
        : pendingEntry
    );

  const dashboardState = buildDashboardChatSessionState({
    agentId,
    conversationKey,
    messages: dashboardSettledConversation,
    pendingEntry: dashboardPendingEntry,
    rawBusy: pendingSettledForDashboard ? false : controllerStillBusy,
    sessionStatus: status,
    source: "runtime",
    thinkingPlaceholder: pendingLabel,
    transport: "ws",
  });

  return {
    durableConversation: dashboardState.settledMessages,
    hasActivePendingTurn: selectChatRunBusy(dashboardState.run),
    stabilizedConversation: dashboardState.visibleMessages,
  };
}

function shouldScheduleRecoveredPendingSettle({
  recoveringPendingReply = false,
  pendingEntry = null,
  canSettleRecoveredPending = false,
  snapshotHasAssistantReply = false,
  snapshotIncludesPendingUserMessage = false,
  contentChanged = false,
  status = "",
}: {
  recoveringPendingReply?: boolean;
  pendingEntry?: PendingChatTurn | null;
  canSettleRecoveredPending?: boolean;
  snapshotHasAssistantReply?: boolean;
  snapshotIncludesPendingUserMessage?: boolean;
  contentChanged?: boolean;
  status?: string;
} = {}) {
  if (!recoveringPendingReply || !pendingEntry) {
    return false;
  }

  const normalizedStatus = normalizeStatusKey(status);
  return (
    !canSettleRecoveredPending
    && snapshotHasAssistantReply
    && snapshotIncludesPendingUserMessage
    && ["idle", "completed"].includes(normalizedStatus)
    && !contentChanged
  );
}

function shouldPreferAuthoritativeEmptySnapshot({
  sessionUser = "",
  updatedLabel = "",
  justResetLabel = "",
}: {
  sessionUser?: string;
  updatedLabel?: string;
  justResetLabel?: string;
} = {}) {
  const normalizedSessionUser = String(sessionUser || "").trim();
  if (normalizedSessionUser.startsWith("command-center-reset-")) {
    return true;
  }

  return Boolean(justResetLabel) && String(updatedLabel || "").trim() === String(justResetLabel || "").trim();
}

function clearPendingTurnByKey(current: Record<string, PendingChatTurn>, conversationKey = "") {
  if (!current[conversationKey]) {
    return current;
  }

  const next = { ...current };
  delete next[conversationKey];
  return next;
}

function findAdvancedTrackedPendingConversationKey(
  pendingChatTurns: Record<string, PendingChatTurn> = {},
  conversationKeys: string[] = [],
  conversationMessages: ChatMessage[] = [],
) {
  for (const conversationKey of conversationKeys) {
    const normalizedKey = String(conversationKey || "").trim();
    if (!normalizedKey) {
      continue;
    }

    const pendingEntry = pendingChatTurns?.[normalizedKey];
    if (pendingEntry && snapshotHasAdvancedPastPendingTurn(conversationMessages, pendingEntry)) {
      return normalizedKey;
    }
  }

  return "";
}

function resolveRecoveredPendingProgress({
  recoveringPendingReply = false,
  pendingEntry = null,
  localMessages = [],
  snapshotMessages = [],
  status = "",
  progressRef,
}: {
  recoveringPendingReply?: boolean;
  pendingEntry?: PendingChatTurn | null;
  localMessages?: ChatMessage[];
  snapshotMessages?: ChatMessage[];
  status?: string;
  progressRef?: MutableRefObject<RuntimeRecoveredPendingProgressMap>;
} = {}) {
  if (!recoveringPendingReply || !pendingEntry || !progressRef) {
    return {
      keepRecoveredPendingAlive: false,
      canSettleRecoveredPending: false,
      contentChanged: false,
    };
  }

  const localAssistant = findPendingAssistantMessage(localMessages, pendingEntry);
  const localAssistantContent = normalizeAssistantProgressContent(localAssistant?.content);
  if (!localAssistant || localAssistant?.pending || !localAssistantContent) {
    const progressKey = String(pendingEntry?.key || "").trim();
    if (progressKey && progressRef.current[progressKey]) {
      const nextProgress = { ...progressRef.current };
      delete nextProgress[progressKey];
      progressRef.current = nextProgress;
    }
    return {
      keepRecoveredPendingAlive: false,
      canSettleRecoveredPending: false,
      contentChanged: false,
    };
  }

  const progressKey = String(pendingEntry?.key || pendingEntry?.assistantMessageId || pendingEntry?.pendingTimestamp || "").trim();
  const snapshotAdvancedPastPending = snapshotHasAdvancedPastPendingTurn(snapshotMessages, pendingEntry);
  if (snapshotAdvancedPastPending) {
    if (progressKey && progressRef.current[progressKey]) {
      const nextProgress = { ...progressRef.current };
      delete nextProgress[progressKey];
      progressRef.current = nextProgress;
    }
    return {
      keepRecoveredPendingAlive: false,
      canSettleRecoveredPending: false,
      contentChanged: false,
    };
  }

  const snapshotAssistant = snapshotHasAdvancedPastPendingTurn(snapshotMessages, pendingEntry)
    ? null
    : findPendingAssistantMessage(snapshotMessages, pendingEntry);
  const initialContent = localAssistantContent;
  const nextContent = normalizeAssistantProgressContent(snapshotAssistant?.content);
  const previous = progressRef.current[progressKey] || {
    initialContent,
    lastContent: "",
    sawAdvance: false,
    stableCount: 0,
  };
  const sawAdvance = previous.sawAdvance || Boolean(nextContent && nextContent !== previous.initialContent);
  const contentChanged = Boolean(nextContent && nextContent !== previous.lastContent);
  const stableCount = nextContent && nextContent === previous.lastContent ? previous.stableCount + 1 : 0;

  progressRef.current = {
    ...progressRef.current,
    [progressKey]: {
      initialContent: previous.initialContent || initialContent,
      lastContent: nextContent || previous.lastContent || "",
      sawAdvance,
      stableCount,
    },
  };

  const normalizedStatus = normalizeStatusKey(status);
  const canSettleRecoveredPending = Boolean(
    sawAdvance
      && ["idle", "completed"].includes(normalizedStatus)
      && stableCount >= 1,
  );

  return {
    keepRecoveredPendingAlive: !canSettleRecoveredPending,
    canSettleRecoveredPending,
    contentChanged,
  };
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGeneratedAgentBootstrapSessionUser(sessionUser = "", agentId = "main") {
  const normalizedSessionUser = String(sessionUser || "").trim();
  const normalizedAgentId = String(agentId || "main")
    .trim()
    .replace(/[^\w:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:]+|[-:]+$/g, "");

  if (!normalizedSessionUser || !normalizedAgentId) {
    return false;
  }

  return new RegExp(`^command-center-${escapeRegExp(normalizedAgentId)}-\\d+$`).test(normalizedSessionUser);
}

function shouldApplyRuntimeSnapshot({
  currentAgentId = "",
  currentSessionUser = "",
  requestedAgentId = "",
  requestedSessionUser = "",
  resolvedSessionUser = "",
} = {}) {
  const normalizedCurrentAgentId = String(currentAgentId || "").trim();
  const normalizedCurrentSessionUser = String(currentSessionUser || "").trim();
  const normalizedRequestedAgentId = String(requestedAgentId || "").trim();
  const normalizedRequestedSessionUser = String(requestedSessionUser || "").trim();
  const normalizedResolvedSessionUser = String(resolvedSessionUser || "").trim();

  if (
    normalizedRequestedAgentId
    && normalizedCurrentAgentId
    && normalizedRequestedAgentId !== normalizedCurrentAgentId
  ) {
    return false;
  }

  if (!normalizedCurrentSessionUser) {
    return true;
  }

  if (
    normalizedResolvedSessionUser
    && normalizedRequestedSessionUser
    && normalizedResolvedSessionUser !== normalizedRequestedSessionUser
  ) {
    const allowImBootstrapResolution =
      isImBootstrapSessionUser(normalizedRequestedSessionUser)
      && isImSessionUser(normalizedResolvedSessionUser)
      && !isImBootstrapSessionUser(normalizedResolvedSessionUser);
    const allowGeneratedBootstrapFallback =
      normalizedRequestedAgentId
      && normalizedResolvedSessionUser === "command-center"
      && isGeneratedAgentBootstrapSessionUser(normalizedRequestedSessionUser, normalizedRequestedAgentId);

    if (!allowGeneratedBootstrapFallback && !allowImBootstrapResolution && normalizedCurrentSessionUser !== normalizedResolvedSessionUser) {
      return false;
    }
  }

  if (
    normalizedCurrentSessionUser !== normalizedRequestedSessionUser
    && normalizedCurrentSessionUser !== normalizedResolvedSessionUser
  ) {
    return false;
  }

  return true;
}

export function useRuntimeSnapshot({
  activePendingChat,
  busy,
  recoveringPendingReply = false,
  i18n,
  messagesRef,
  pendingChatTurns,
  pendingChatTurnsRef: externalPendingChatTurnsRef,
  runtimeSessionUser = "",
  session,
  setBusy,
  setFastMode,
  setMessagesSynced,
  setModel,
  setPendingChatTurns,
  setPromptHistoryByConversation,
  setSession,
  enableWebSocket = true,
}: RuntimeSnapshotHookInput) {
  const INITIAL_RUNTIME_RETRY_DELAY_MS = 1200;
  const STOP_OVERRIDE_DURATION_MS = 10_000;
  const RECOVERED_PENDING_SETTLE_DELAY_MS = 900;
  const [runtimeOverviewReady, setRuntimeOverviewReady] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [taskTimeline, setTaskTimeline] = useState<unknown[]>([]);
  const [taskRelationships, setTaskRelationships] = useState<RuntimeTaskRelationship[]>([]);
  const [files, setFiles] = useState<RuntimeFile[]>([]);
  const [artifacts, setArtifacts] = useState<unknown[]>([]);
  const [snapshots, setSnapshots] = useState<unknown[]>([]);
  const [agents, setAgents] = useState<unknown[]>([]);
  const [peeks, setPeeks] = useState<RuntimePeeks>(EMPTY_RUNTIME_PEEKS);
  const agentsRef = useRef<unknown[]>([]);
  const availableAgentsRef = useRef<unknown[] | null>(null);
  const availableAgentsClearedRef = useRef(false);
  const stopOverrideUntilRef = useRef(
    (() => { try { const v = Number(sessionStorage.getItem("cc-stop-override-until") || 0); return v > Date.now() ? v : 0; } catch { return 0; } })()
  );
  const runtimeRequestRef = useRef(0);
  const inflightRuntimeRequestRef = useRef<InflightRuntimeRequest>(null);
  const localPendingChatTurnsRef = useRef(pendingChatTurns);
  const trackedPendingChatTurnsRef = externalPendingChatTurnsRef || localPendingChatTurnsRef;
  const recoveredPendingProgressRef = useRef<RuntimeRecoveredPendingProgressMap>({});
  const recoveredPendingSettleTimeoutRef = useRef(0);
  const sessionRef = useRef(session);
  const lastAutoLoadKeyRef = useRef("");

  trackedPendingChatTurnsRef.current = externalPendingChatTurnsRef?.current || pendingChatTurns;
  sessionRef.current = session;
  agentsRef.current = agents;

  const updatePendingChatTurns = useCallback((value) => {
    if (typeof setPendingChatTurns !== "function") {
      return;
    }

    setPendingChatTurns((current) => {
      const next = typeof value === "function" ? value(current) : value;
      trackedPendingChatTurnsRef.current = next;
      pushCcDebugEvent("runtime.pending.update", {
        keys: Object.keys(next || {}),
      });
      return next;
    });
  }, [setPendingChatTurns, trackedPendingChatTurnsRef]);

  useEffect(() => {
    const trackedKeys = new Set(Object.keys(pendingChatTurns || {}));
    recoveredPendingProgressRef.current = Object.fromEntries(
      Object.entries(recoveredPendingProgressRef.current || {}).filter(([key]) => trackedKeys.has(key)),
    );
  }, [pendingChatTurns]);

  const clearRecoveredPendingSettleTimeout = useCallback(() => {
    window.clearTimeout(recoveredPendingSettleTimeoutRef.current);
    recoveredPendingSettleTimeoutRef.current = 0;
  }, []);

  const syncPromptHistoryForConversation = useCallback((conversationKey = "", promptHistory: string[] = []) => {
    if (!conversationKey || !promptHistory.length) {
      return;
    }

    setPromptHistoryByConversation((current) => {
      const previous = current[conversationKey] || [];
      if (JSON.stringify(previous) === JSON.stringify(promptHistory)) {
        return current;
      }

      return {
        ...current,
        [conversationKey]: promptHistory,
      };
    });
  }, [setPromptHistoryByConversation]);

  const scheduleRecoveredPendingSettle = useCallback((conversationKey, nextSessionStatus) => {
    const normalizedConversationKey = String(conversationKey || "").trim();
    if (!normalizedConversationKey) {
      return;
    }

    clearRecoveredPendingSettleTimeout();
    recoveredPendingSettleTimeoutRef.current = window.setTimeout(() => {
      const currentPendingEntry = trackedPendingChatTurnsRef.current[normalizedConversationKey];
      if (!currentPendingEntry || currentPendingEntry?.stopped) {
        recoveredPendingSettleTimeoutRef.current = 0;
        return;
      }

      const currentMessages = messagesRef.current || [];
      const currentAssistant = findPendingAssistantMessage(currentMessages, currentPendingEntry);
      if (!currentAssistant || currentAssistant?.pending || !normalizeAssistantProgressContent(currentAssistant?.content)) {
        recoveredPendingSettleTimeoutRef.current = 0;
        return;
      }

      updatePendingChatTurns((current) => {
        if (!current[normalizedConversationKey]) {
          return current;
        }
        const next = { ...current };
        delete next[normalizedConversationKey];
        return next;
      });
      setBusy(false);
      setSession((current) => ({
        ...current,
        status: nextSessionStatus || i18n.common.idle,
      }));
      recoveredPendingSettleTimeoutRef.current = 0;
    }, RECOVERED_PENDING_SETTLE_DELAY_MS);
  }, [clearRecoveredPendingSettleTimeout, i18n.common.idle, messagesRef, setBusy, setSession, trackedPendingChatTurnsRef, updatePendingChatTurns]);

  const commitRuntimeConversationEffects = useCallback(({
    conversationKey = "",
    pendingEntry = null,
    durableConversation = [],
    hasActivePendingTurn = false,
    recoveringPendingReply: nextRecoveringPendingReply = false,
    canSettleRecoveredPending = false,
    snapshotHasAssistantReply = false,
    snapshotIncludesPendingUserMessage = false,
    contentChanged = false,
    status = "",
  }: {
    conversationKey?: string;
    pendingEntry?: PendingChatTurn | null;
    durableConversation?: ChatMessage[];
    hasActivePendingTurn?: boolean;
    recoveringPendingReply?: boolean;
    canSettleRecoveredPending?: boolean;
    snapshotHasAssistantReply?: boolean;
    snapshotIncludesPendingUserMessage?: boolean;
    contentChanged?: boolean;
    status?: string;
  } = {}) => {
    setMessagesSynced(durableConversation);
    setBusy(hasActivePendingTurn);

    if (shouldScheduleRecoveredPendingSettle({
      recoveringPendingReply: nextRecoveringPendingReply,
      pendingEntry,
      canSettleRecoveredPending,
      snapshotHasAssistantReply,
      snapshotIncludesPendingUserMessage,
      contentChanged,
      status,
    })) {
      scheduleRecoveredPendingSettle(conversationKey, status);
    } else {
      clearRecoveredPendingSettleTimeout();
    }

    if (pendingEntry && !hasActivePendingTurn) {
      updatePendingChatTurns((current) => clearPendingTurnByKey(current, conversationKey));
    }
  }, [
    clearRecoveredPendingSettleTimeout,
    scheduleRecoveredPendingSettle,
    setBusy,
    setMessagesSynced,
    updatePendingChatTurns,
  ]);

  useEffect(() => () => {
    clearRecoveredPendingSettleTimeout();
  }, [clearRecoveredPendingSettleTimeout]);

  const setFilesFromSnapshot = useCallback((nextFiles: RuntimeFile[] = []) => {
    const normalizedNextFiles = Array.isArray(nextFiles) ? nextFiles : [];
    setFiles((current) => {
      const mergedFiles = mergeRuntimeFiles(current, normalizedNextFiles);
      return areJsonEqual(current, mergedFiles) ? current : mergedFiles;
    });
  }, []);

  const hydrateRuntimeState = useCallback((state: RuntimeSnapshot | null = null) => {
    const nextState = state || {};
    const nextStateAvailableAgents = Object.prototype.hasOwnProperty.call(nextState, "availableAgents")
      ? (Array.isArray(nextState.availableAgents) ? nextState.availableAgents : [])
      : null;
    setIfChanged(setAvailableModels, nextState.availableModels || []);
    availableAgentsRef.current = nextStateAvailableAgents;
    availableAgentsClearedRef.current = false;
    setIfChanged(setAvailableAgents, collectAvailableRuntimeAgentIds({
      availableAgents: nextStateAvailableAgents || [],
      agents: nextState.agents || [],
    }));
    setIfChanged(setTaskRelationships, nextState.taskRelationships || []);
    setTaskTimeline((current) => {
      const merged = mergeTaskTimeline(current, nextState.taskTimeline || []);
      return areJsonEqual(current, merged) ? current : merged;
    });
    setIfChanged(setFiles, nextState.files || []);
    setIfChanged(setArtifacts, nextState.artifacts || []);
    setIfChanged(setSnapshots, nextState.snapshots || []);
    agentsRef.current = nextState.agents || [];
    setIfChanged(setAgents, nextState.agents || []);
    setIfChanged(setPeeks, nextState.peeks || EMPTY_RUNTIME_PEEKS);
    setRuntimeOverviewReady(Boolean(state && state.overviewReady !== false));
  }, []);

  const applySnapshot = useCallback((snapshot: RuntimeSnapshot, options: RuntimeSnapshotApplyOptions = {}) => {
    if (!snapshot) return;
    setRuntimeOverviewReady(true);

    const currentSession = sessionRef.current;
    const currentPendingChatTurns = trackedPendingChatTurnsRef.current;
    const currentConversationKey = createConversationKey(currentSession.sessionUser, currentSession.agentId);
    const nextSession = {
      ...currentSession,
      ...(snapshot.session || {}),
      mode: snapshot.session?.mode || currentSession.mode,
    };
    const nextConversationKey = createConversationKey(
      snapshot.session?.sessionUser || nextSession.sessionUser,
      snapshot.session?.agentId || nextSession.agentId,
    );
    const localMessages = messagesRef.current || [];
    const snapshotConversationWithAttachments = mergeConversationAttachments(snapshot.conversation, localMessages);
    const baseMergedConversation = mergeConversationIdentity(
      snapshotConversationWithAttachments,
      localMessages,
    );
    const pendingEntry = resolveRuntimePendingEntry({
      agentId: snapshot.session?.agentId || nextSession.agentId,
      conversationKey: nextConversationKey,
      conversationMessages: baseMergedConversation,
      localMessages,
      pendingChatTurns: currentPendingChatTurns,
      sessionStatus: snapshot.session?.status || nextSession.status,
      sessionUser: snapshot.session?.sessionUser || nextSession.sessionUser,
    });
    const advancedTrackedPendingKey = findAdvancedTrackedPendingConversationKey(
      currentPendingChatTurns,
      [nextConversationKey, currentConversationKey],
      baseMergedConversation,
    );
    const snapshotPromptHistory = extractUserPromptHistory(snapshot.conversation);
    const shouldDeferConversationSync = Boolean(pendingEntry) && options.syncConversation === false;
    pushCcDebugEvent("runtime.snapshot.apply", {
      syncConversation: options.syncConversation !== false,
      shouldDeferConversationSync,
      conversationLength: Array.isArray(snapshot.conversation) ? snapshot.conversation.length : -1,
      pendingKey: pendingEntry?.key || currentConversationKey,
      pendingAssistantId: pendingEntry?.assistantMessageId || "",
    });
    const nextFastMode =
      snapshot.session?.fastMode === i18n.sessionOverview.fastMode.on ||
      snapshot.session?.fastMode === "开启" ||
      snapshot.session?.fastMode === true ||
      snapshot.fastMode === true;

    setFastMode(nextFastMode);

    if (options.syncConversation !== false && Array.isArray(snapshot.conversation)) {
      const {
        localHasExplicitLivePendingAssistant,
        localMessagesWithoutPending,
        mergedConversation,
        pendingMergeDecision: {
          hasAssistantReply,
          localHasLivePendingAssistant,
          localHasSettledAssistantReply,
          localSettledPendingAssistantCandidate,
          shouldClearPending,
          snapshotCanSettlePending,
          snapshotHasAssistantReply,
          snapshotIncludesPendingUserMessage,
        },
        recoveredPendingProgress: {
          canSettleRecoveredPending,
          contentChanged,
        },
      } = buildRuntimeConversationMergeState({
        baseMergedConversation,
        conversationWithAttachments: snapshotConversationWithAttachments,
        pendingEntry,
        localMessages,
        status: snapshot.session?.status || nextSession.status,
        busy,
        recoveringPendingReply,
        progressRef: recoveredPendingProgressRef,
      });
      const preferAuthoritativeEmptySnapshot = shouldPreferAuthoritativeEmptySnapshot({
        sessionUser: snapshot.session?.sessionUser || nextSession.sessionUser || currentSession.sessionUser,
        updatedLabel: currentSession.updatedLabel || nextSession.updatedLabel,
        justResetLabel: i18n.common.justReset,
      });
      const allowEmptySnapshotLocalTail = shouldReuseSettledLocalConversationTail({
        snapshotMessages: mergedConversation,
        pendingEntry,
        status: snapshot.session?.status || nextSession.status,
        preferAuthoritativeEmptySnapshot,
      });
      const stopOverrideActive = Date.now() < stopOverrideUntilRef.current;
      const effectiveClearPending = shouldClearPending || stopOverrideActive;
      const {
        durableConversation,
        hasActivePendingTurn,
        stabilizedConversation,
      } = buildRuntimeConversationOutputs({
        agentId: snapshot.session?.agentId || nextSession.agentId,
        conversationKey: nextConversationKey,
        mergedConversation,
        pendingEntry,
        localMessages,
        localMessagesWithoutPending,
        busy,
        pendingLabel: i18n.chat.thinkingPlaceholder,
        status: snapshot.session?.status || nextSession.status,
        clearPending: effectiveClearPending,
        snapshotHasAssistantReply,
        snapshotIncludesPendingUserMessage,
        localHasLivePendingAssistant,
        localHasSettledAssistantReply,
        localHasExplicitLivePendingAssistant,
        localSettledPendingAssistantCandidate,
        hasAssistantReply,
        allowEmptySnapshotLocalTail,
        recoveringPendingReply,
        canSettleRecoveredPending,
      });
      pushCcDebugEvent("runtime.snapshot.merge", {
        conversationKey: nextConversationKey,
        snapshotHasAssistantReply,
        snapshotIncludesPendingUserMessage,
        snapshotCanSettlePending,
        localHasLivePendingAssistant,
        canSettleRecoveredPending,
        localHasSettledAssistantReply,
        shouldClearPending,
        effectiveClearPending,
        hasActivePendingTurn,
        localMessagesLength: localMessages.length,
        snapshotMessagesLength: snapshot.conversation.length,
        localSummary: summarizeCcMessages(localMessages),
        snapshotSummary: summarizeCcMessages(snapshot.conversation),
        hydratedSummary: summarizeCcMessages(stabilizedConversation),
      });
      const nextSessionState = { ...nextSession, status: hasActivePendingTurn ? i18n.common.running : (stopOverrideActive ? i18n.common.idle : nextSession.status) };
      if (!areSessionSnapshotsEqual(currentSession, nextSessionState)) {
        setSession(nextSessionState);
      }
      commitRuntimeConversationEffects({
        conversationKey: nextConversationKey,
        pendingEntry,
        durableConversation,
        hasActivePendingTurn,
        recoveringPendingReply,
        canSettleRecoveredPending,
        snapshotHasAssistantReply,
        snapshotIncludesPendingUserMessage,
        contentChanged,
        status: snapshot.session?.status || nextSession.status,
      });
      if (!pendingEntry && advancedTrackedPendingKey) {
        updatePendingChatTurns((current) => clearPendingTurnByKey(current, advancedTrackedPendingKey));
      }
    } else {
      const stopOverrideActive2 = Date.now() < stopOverrideUntilRef.current;
      const effectiveDeferBusy = shouldDeferConversationSync && !stopOverrideActive2;
      const nextSessionState = { ...nextSession, status: effectiveDeferBusy ? i18n.common.running : (stopOverrideActive2 ? i18n.common.idle : nextSession.status) };
      if (!areSessionSnapshotsEqual(currentSession, nextSessionState)) {
        setSession(nextSessionState);
      }
      setBusy(effectiveDeferBusy);
    }

    const snapshotAvailableAgents = snapshot.session && Object.prototype.hasOwnProperty.call(snapshot.session, "availableAgents")
      ? (Array.isArray(snapshot.session.availableAgents) ? snapshot.session.availableAgents : [])
      : Object.prototype.hasOwnProperty.call(snapshot, "availableAgents")
        ? (Array.isArray(snapshot.availableAgents) ? snapshot.availableAgents : [])
        : null;

    setIfChanged(setAvailableModels, snapshot.session?.availableModels || snapshot.availableModels || []);
    availableAgentsRef.current = snapshotAvailableAgents;
    availableAgentsClearedRef.current = false;
    setIfChanged(setAvailableAgents, collectAvailableRuntimeAgentIds({
      availableAgents: snapshotAvailableAgents || [],
      agents: snapshot.agents || [],
    }));
    if (Object.prototype.hasOwnProperty.call(snapshot, "taskRelationships")) {
      setTaskRelationships((current) => {
        const merged = mergeTaskRelationships(current, snapshot.taskRelationships || []);
        return areJsonEqual(current, merged) ? current : merged;
      });
    } else if (nextConversationKey !== currentConversationKey) {
      setIfChanged(setTaskRelationships, []);
    }
    setTaskTimeline((current) => {
      const merged = mergeTaskTimeline(current, snapshot.taskTimeline || []);
      return areJsonEqual(current, merged) ? current : merged;
    });
    setFilesFromSnapshot(snapshot.files || []);
    setIfChanged(setArtifacts, snapshot.artifacts || []);
    setIfChanged(setSnapshots, snapshot.snapshots || []);
    agentsRef.current = snapshot.agents || [];
    setIfChanged(setAgents, snapshot.agents || []);
    setIfChanged(setPeeks, snapshot.peeks || EMPTY_RUNTIME_PEEKS);
    setModel(snapshot.session?.selectedModel || snapshot.model || nextSession.model || "");

    if (!shouldDeferConversationSync) {
      syncPromptHistoryForConversation(nextConversationKey, snapshotPromptHistory);
    }
  }, [
    busy,
    commitRuntimeConversationEffects,
    i18n.chat.thinkingPlaceholder,
    i18n.common.idle,
    i18n.common.justReset,
    i18n.common.running,
    i18n.sessionOverview.fastMode.on,
    messagesRef,
    recoveringPendingReply,
    setArtifacts,
    setAvailableAgents,
    setAvailableModels,
    setAgents,
    setBusy,
    setFastMode,
    setFilesFromSnapshot,
    setModel,
    setPeeks,
    setSession,
    setSnapshots,
    setTaskTimeline,
    syncPromptHistoryForConversation,
    trackedPendingChatTurnsRef,
    updatePendingChatTurns,
  ]);

  const requestedRuntimeSessionUser = String(runtimeSessionUser || session.sessionUser || "").trim() || session.sessionUser;
  const wsEnabled = enableWebSocket;
  const {
    connected: wsConnected,
    lastDisconnectReason,
    reconnectAttempts,
    status: runtimeSocketStatus,
    setOnMessage,
  } = useRuntimeSocket({
    sessionUser: requestedRuntimeSessionUser,
    agentId: session.agentId,
    disconnectErrorLabel: i18n.common.runtimeSocketError || i18n.common.requestFailed,
    enabled: wsEnabled,
  });
  const runtimeTransport = wsEnabled && wsConnected ? "ws" : "polling";
  const runtimeFallbackReason = !wsConnected ? String(lastDisconnectReason || "").trim() : "";

  const applyIncrementalConversation = useCallback((nextConversation: ChatMessage[]) => {
    const currentSession = sessionRef.current;
    const currentPendingChatTurns = trackedPendingChatTurnsRef.current;
    const conversationKey = createConversationKey(currentSession.sessionUser, currentSession.agentId);
    const localMessages = messagesRef.current || [];
    const nextConversationWithAttachments = mergeConversationAttachments(nextConversation, localMessages);
    const baseMergedConversation = mergeConversationIdentity(
      nextConversationWithAttachments,
      localMessages,
    );
    const pendingEntry = resolveRuntimePendingEntry({
      agentId: currentSession.agentId,
      conversationKey,
      conversationMessages: baseMergedConversation,
      localMessages,
      pendingChatTurns: currentPendingChatTurns,
      sessionStatus: currentSession.status,
      sessionUser: currentSession.sessionUser,
    });
    const advancedTrackedPendingKey = findAdvancedTrackedPendingConversationKey(
      currentPendingChatTurns,
      [conversationKey],
      baseMergedConversation,
    );
    pushCcDebugEvent("runtime.conversation.sync", {
      conversationLength: nextConversation.length,
      pendingKey: pendingEntry?.key || conversationKey,
      pendingAssistantId: pendingEntry?.assistantMessageId || "",
    });

    const {
      localHasExplicitLivePendingAssistant,
      localMessagesWithoutPending,
      mergedConversation,
      pendingMergeDecision: {
        hasAssistantReply,
        localHasLivePendingAssistant,
        localHasSettledAssistantReply,
        localSettledPendingAssistantCandidate,
        shouldClearPending,
        snapshotCanSettlePending,
        snapshotHasAssistantReply,
        snapshotIncludesPendingUserMessage,
      },
      recoveredPendingProgress: {
        canSettleRecoveredPending,
        contentChanged,
      },
      } = buildRuntimeConversationMergeState({
      baseMergedConversation,
      conversationWithAttachments: nextConversationWithAttachments,
      pendingEntry,
      localMessages,
      status: currentSession.status,
      busy,
      recoveringPendingReply,
      progressRef: recoveredPendingProgressRef,
    });
    const preferAuthoritativeEmptySnapshot = shouldPreferAuthoritativeEmptySnapshot({
      sessionUser: currentSession.sessionUser,
      updatedLabel: currentSession.updatedLabel,
      justResetLabel: i18n.common.justReset,
    });
    const allowEmptySnapshotLocalTail = shouldReuseSettledLocalConversationTail({
      snapshotMessages: mergedConversation,
      pendingEntry,
      status: currentSession.status,
      preferAuthoritativeEmptySnapshot,
    });
    const {
      durableConversation,
      hasActivePendingTurn,
      stabilizedConversation,
    } = buildRuntimeConversationOutputs({
      agentId: currentSession.agentId,
      conversationKey,
      mergedConversation,
      pendingEntry,
      localMessages,
      localMessagesWithoutPending,
      busy,
      pendingLabel: i18n.chat.thinkingPlaceholder,
      status: currentSession.status,
      clearPending: shouldClearPending,
      snapshotHasAssistantReply,
      snapshotIncludesPendingUserMessage,
      localHasLivePendingAssistant,
      localHasSettledAssistantReply,
      localHasExplicitLivePendingAssistant,
      localSettledPendingAssistantCandidate,
      hasAssistantReply,
      allowEmptySnapshotLocalTail,
      recoveringPendingReply,
      canSettleRecoveredPending,
    });
    pushCcDebugEvent("runtime.conversation.merge", {
      conversationKey,
      snapshotHasAssistantReply,
      snapshotIncludesPendingUserMessage,
      snapshotCanSettlePending,
      localHasLivePendingAssistant,
      canSettleRecoveredPending,
      contentChanged,
      localHasSettledAssistantReply,
      shouldClearPending,
      hasActivePendingTurn,
      localMessagesLength: localMessages.length,
      snapshotMessagesLength: nextConversation.length,
      localSummary: summarizeCcMessages(localMessages),
      snapshotSummary: summarizeCcMessages(nextConversation),
      hydratedSummary: summarizeCcMessages(stabilizedConversation),
    });
    commitRuntimeConversationEffects({
      conversationKey,
      pendingEntry,
      durableConversation,
      hasActivePendingTurn,
      recoveringPendingReply,
      canSettleRecoveredPending,
      snapshotHasAssistantReply,
      snapshotIncludesPendingUserMessage,
      contentChanged,
      status: currentSession.status,
    });
    if (!pendingEntry && advancedTrackedPendingKey) {
      updatePendingChatTurns((current) => clearPendingTurnByKey(current, advancedTrackedPendingKey));
    }

    const snapshotPromptHistory = extractUserPromptHistory(nextConversation);
    syncPromptHistoryForConversation(conversationKey, snapshotPromptHistory);
  }, [busy, commitRuntimeConversationEffects, i18n.chat.thinkingPlaceholder, i18n.common.justReset, messagesRef, recoveringPendingReply, syncPromptHistoryForConversation, trackedPendingChatTurnsRef, updatePendingChatTurns]);

  const handleWsMessage = useCallback((payload: RuntimeSocketPayload) => {
    if (!payload || !payload.type) return;

    if (payload.type === 'runtime.snapshot') {
      applySnapshot(payload);
      return;
    }

    if (payload.type === 'session.sync' && payload.session) {
      const currentSession = sessionRef.current;
      const wsStopOverrideActive = Date.now() < stopOverrideUntilRef.current;
      const nextSession = { ...currentSession, ...payload.session };
      const localMessages = messagesRef.current || [];
      const conversationKey = createConversationKey(currentSession.sessionUser, currentSession.agentId);
      const localPendingEntry = resolveRuntimePendingEntry({
        agentId: currentSession.agentId,
        conversationKey,
        localMessages,
        pendingChatTurns: trackedPendingChatTurnsRef.current,
        sessionStatus: nextSession.status,
        sessionUser: currentSession.sessionUser,
      });
      const localRecoveredAssistant = recoveringPendingReply
        ? findPendingAssistantMessage(localMessages, localPendingEntry)
        : null;
      const shouldHoldBusyForLocalTurn = Boolean(localPendingEntry);
      if (wsStopOverrideActive) {
        nextSession.status = i18n.common.idle;
      }
      if (!areSessionSnapshotsEqual(currentSession, nextSession)) {
        setSession(nextSession);
      }
      if (payload.session.availableModels) {
        setIfChanged(setAvailableModels, payload.session.availableModels);
      }
      if (Object.prototype.hasOwnProperty.call(payload.session, "availableAgents")) {
        const explicitAvailableAgents = Array.isArray(payload.session.availableAgents)
          ? payload.session.availableAgents
          : availableAgentsRef.current;
        const didExplicitlyClearAvailableAgents = Array.isArray(payload.session.availableAgents)
          && payload.session.availableAgents.length === 0;
        availableAgentsRef.current = explicitAvailableAgents;
        availableAgentsClearedRef.current = didExplicitlyClearAvailableAgents;
        const nextAvailableAgents = didExplicitlyClearAvailableAgents
          ? []
          : collectAvailableRuntimeAgentIds({
            availableAgents: explicitAvailableAgents || [],
            agents: agentsRef.current,
          });
        setIfChanged(setAvailableAgents, nextAvailableAgents);
      }
      if (payload.session.selectedModel) {
        setModel(payload.session.selectedModel);
      }
      const nextFastMode =
        payload.session.fastMode === i18n.sessionOverview.fastMode.on ||
        payload.session.fastMode === '开启' ||
        payload.session.fastMode === true;
      setFastMode(nextFastMode);
      const statusKey = normalizeStatusKey(payload.session.status);
      const shouldSuppressLateRunningBusy =
        statusKey === "running"
        && !localPendingEntry
        && !isImSessionUser(currentSession.sessionUser)
        && hasLocallySettledCommandCenterReply(localMessages);
      if (wsStopOverrideActive || statusKey === 'idle' || statusKey === 'completed') {
        setBusy(shouldHoldBusyForLocalTurn ? true : false);
      } else if (statusKey === "running" && !shouldSuppressLateRunningBusy) {
        setBusy(true);
      } else if (shouldHoldBusyForLocalTurn) {
        setBusy(true);
      } else if (shouldSuppressLateRunningBusy) {
        setBusy(false);
      }

      if (
        recoveringPendingReply
        && localPendingEntry
        && ['idle', 'completed'].includes(statusKey)
        && localRecoveredAssistant
        && !localRecoveredAssistant?.pending
        && normalizeAssistantProgressContent(localRecoveredAssistant?.content)
      ) {
        scheduleRecoveredPendingSettle(conversationKey, nextSession.status);
      } else {
        clearRecoveredPendingSettleTimeout();
      }
      return;
    }

    if (payload.type === 'taskRelationships.sync') {
      setTaskRelationships((current) => {
        const merged = mergeTaskRelationships(current, payload.taskRelationships || []);
        return areJsonEqual(current, merged) ? current : merged;
      });
      return;
    }

    if (payload.type === 'taskTimeline.sync') {
      setTaskTimeline((current) => {
        const merged = mergeTaskTimeline(current, payload.taskTimeline || []);
        return areJsonEqual(current, merged) ? current : merged;
      });
      return;
    }

    if (payload.type === 'artifacts.sync') {
      setIfChanged(setArtifacts, payload.artifacts || []);
      return;
    }

    if (payload.type === 'files.sync') {
      setFilesFromSnapshot(payload.files || []);
      return;
    }

    if (payload.type === 'snapshots.sync') {
      setIfChanged(setSnapshots, payload.snapshots || []);
      return;
    }

    if (payload.type === 'agents.sync') {
      const nextAvailableAgents = availableAgentsClearedRef.current
        ? []
        : collectAvailableRuntimeAgentIds({
          availableAgents: availableAgentsRef.current || [],
          agents: payload.agents || [],
        });
      agentsRef.current = payload.agents || [];
      setIfChanged(setAvailableAgents, nextAvailableAgents);
      setIfChanged(setAgents, payload.agents || []);
      return;
    }

    if (payload.type === 'peeks.sync') {
      setIfChanged(setPeeks, payload.peeks || EMPTY_RUNTIME_PEEKS);
      return;
    }

    if (payload.type === 'conversation.sync' && Array.isArray(payload.conversation)) {
      applyIncrementalConversation(payload.conversation);
      return;
    }
  }, [applyIncrementalConversation, applySnapshot, clearRecoveredPendingSettleTimeout, i18n.common.idle, i18n.sessionOverview.fastMode.on, messagesRef, recoveringPendingReply, scheduleRecoveredPendingSettle, setAvailableAgents, setAvailableModels, setBusy, setFastMode, setFilesFromSnapshot, setModel, setSession, trackedPendingChatTurnsRef]);

  useEffect(() => {
    setOnMessage(handleWsMessage);
  }, [setOnMessage, handleWsMessage]);

  const loadRuntime = useCallback(async (
    sessionUser = sessionRef.current.sessionUser,
    overrides: RuntimeSnapshotRequestOverrides = {},
  ) => {
    const currentSession = sessionRef.current;
    const requestedSessionUser = String(sessionUser || currentSession.sessionUser || "").trim();
    const params = new URLSearchParams({
      sessionUser: requestedSessionUser,
    });
    const resolvedAgentId = String(overrides.agentId || currentSession.agentId || "").trim();

    if (resolvedAgentId) {
      params.set("agentId", resolvedAgentId);
    }

    const requestKey = params.toString();
    if (inflightRuntimeRequestRef.current?.key === requestKey) {
      return inflightRuntimeRequestRef.current.promise;
    }

    const requestId = runtimeRequestRef.current + 1;
    runtimeRequestRef.current = requestId;

    const requestPromise = (async () => {
      const response = await apiFetch(`/api/runtime?${requestKey}`);
      const payload = await response.json() as RuntimeSnapshot;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || i18n.common.runtimeSnapshotFailed || i18n.common.requestFailed);
      }
      if (requestId !== runtimeRequestRef.current) {
        return payload;
      }
      const latestSession = sessionRef.current;
      if (!shouldApplyRuntimeSnapshot({
        currentAgentId: latestSession.agentId,
        currentSessionUser: latestSession.sessionUser,
        requestedAgentId: resolvedAgentId || currentSession.agentId,
        requestedSessionUser,
        resolvedSessionUser: payload.session?.sessionUser || "",
      })) {
        return payload;
      }
      applySnapshot(payload);
      return payload;
    })();

    inflightRuntimeRequestRef.current = {
      key: requestKey,
      promise: requestPromise,
      requestId,
    };

    try {
      return await requestPromise;
    } finally {
      if (inflightRuntimeRequestRef.current?.requestId === requestId) {
        inflightRuntimeRequestRef.current = null;
      }
    }
  }, [applySnapshot, i18n.common.requestFailed, i18n.common.runtimeSnapshotFailed]);

  useEffect(() => {
    if (wsConnected) {
      lastAutoLoadKeyRef.current = "";
      return;
    }

    const runtimeOverrides = {
      agentId: session.agentId,
    };
    const bootstrapAutoLoadKey = isImBootstrapSessionUser(requestedRuntimeSessionUser)
      ? `::${busy ? "busy" : "idle"}::${activePendingChat ? "pending" : "clear"}::${recoveringPendingReply ? "recovering" : "steady"}`
      : "";
    const autoLoadKey = `${requestedRuntimeSessionUser}::${runtimeOverrides.agentId || ""}${bootstrapAutoLoadKey}`;
    let retryTimerId = 0;
    let cancelled = false;

    if (lastAutoLoadKeyRef.current !== autoLoadKey) {
      lastAutoLoadKeyRef.current = autoLoadKey;
      loadRuntime(requestedRuntimeSessionUser, runtimeOverrides).catch(() => {
        if (cancelled) {
          return;
        }

        retryTimerId = window.setTimeout(() => {
          loadRuntime(requestedRuntimeSessionUser, runtimeOverrides).catch(() => {
            if (cancelled) {
              return;
            }
            setSession((current) => ({ ...current, status: i18n.common.offline }));
          });
        }, INITIAL_RUNTIME_RETRY_DELAY_MS);
      });
    }

    const pollInterval = getRuntimePollInterval({
      recoveringPendingReply,
      busy,
      activePendingChat,
      sessionUser: requestedRuntimeSessionUser || session.sessionUser,
    });
    const id = window.setInterval(() => {
      loadRuntime(requestedRuntimeSessionUser, runtimeOverrides).catch(() => {});
    }, pollInterval);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(retryTimerId);
    };
  }, [activePendingChat, busy, i18n.common.offline, loadRuntime, recoveringPendingReply, requestedRuntimeSessionUser, runtimeSessionUser, session.agentId, session.sessionUser, setSession, wsConnected]);

  const updateSessionSettings = async (payload: Partial<RuntimeSession>) => {
    const targetSessionUser = String(payload?.sessionUser || session.sessionUser || "").trim();
    const response = await apiFetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        sessionUser: targetSessionUser,
      }),
    });
    const data = await response.json() as RuntimeSnapshot;
    if (!response.ok || !data.ok) {
      throw new Error(data.error || i18n.common.sessionUpdateFailed || i18n.common.requestFailed);
    }
    applySnapshot(data);
    return data;
  };

  const clearSnapshotData = () => {
    setRuntimeOverviewReady(false);
    setAvailableModels([]);
    setAvailableAgents([]);
    setTaskRelationships([]);
    setTaskTimeline([]);
    setFiles([]);
    setArtifacts([]);
    setSnapshots([]);
    availableAgentsRef.current = null;
    availableAgentsClearedRef.current = false;
    agentsRef.current = [];
    setAgents([]);
    setPeeks(EMPTY_RUNTIME_PEEKS);
  };

  const activateStopOverride = useCallback(() => {
    const until = Date.now() + STOP_OVERRIDE_DURATION_MS;
    stopOverrideUntilRef.current = until;
    try { sessionStorage.setItem("cc-stop-override-until", String(until)); } catch {}
  }, []);

  return {
    activateStopOverride,
    agents,
    applySnapshot,
    artifacts,
    availableAgents,
    availableModels,
    clearSnapshotData,
    files,
    hydrateRuntimeState,
    loadRuntime,
    peeks,
    runtimeOverviewReady,
    runtimeFallbackReason,
    runtimeReconnectAttempts: reconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    snapshots,
    taskRelationships,
    taskTimeline,
    updateSessionSettings,
  };
}
