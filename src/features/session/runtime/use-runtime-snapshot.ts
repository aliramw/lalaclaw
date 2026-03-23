import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  createConversationKey,
  extractUserPromptHistory,
  hasAuthoritativePendingAssistantReply,
  mergeConversationAttachments,
  mergeConversationIdentity,
  mergePendingConversation,
  mergeStaleLocalConversationTail,
  resolveRuntimePendingEntry,
} from "@/features/app/storage";
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

function shouldClearRecoveredPendingTurn({
  pendingEntry,
  recoveringPendingReply = false,
  snapshotHasPendingUserMessage = false,
  snapshotHasAssistantReply = false,
  status = "",
}: {
  pendingEntry?: PendingChatTurn | null;
  recoveringPendingReply?: boolean;
  snapshotHasPendingUserMessage?: boolean;
  snapshotHasAssistantReply?: boolean;
  status?: string;
} = {}) {
  if (!recoveringPendingReply || !pendingEntry || pendingEntry?.stopped || snapshotHasAssistantReply) {
    return false;
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

function normalizeAssistantProgressContent(content = "") {
  return String(content || "")
    .replace(/\[\[reply_to_current\]\]/gi, "")
    .replace(/\*\*<small>[\s\S]*?<\/small>\*\*/gi, "")
    .replace(/<small>[\s\S]*?<\/small>/gi, "")
    .trim();
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
  const snapshotAssistant = findPendingAssistantMessage(snapshotMessages, pendingEntry);
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

function stabilizeHydratedConversation(hydratedConversation: ChatMessage[] = [], localMessages: ChatMessage[] = []) {
  return mergeConversationIdentity(
    mergeStaleLocalConversationTail(hydratedConversation, localMessages),
    localMessages,
  );
}

export function useRuntimeSnapshot({
  activePendingChat,
  busy,
  recoveringPendingReply = false,
  i18n,
  messagesRef,
  pendingChatTurns,
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
  const stopOverrideUntilRef = useRef(
    (() => { try { const v = Number(sessionStorage.getItem("cc-stop-override-until") || 0); return v > Date.now() ? v : 0; } catch { return 0; } })()
  );
  const runtimeRequestRef = useRef(0);
  const inflightRuntimeRequestRef = useRef<InflightRuntimeRequest>(null);
  const pendingChatTurnsRef = useRef(pendingChatTurns);
  const recoveredPendingProgressRef = useRef<RuntimeRecoveredPendingProgressMap>({});
  const recoveredPendingSettleTimeoutRef = useRef(0);
  const sessionRef = useRef(session);

  pendingChatTurnsRef.current = pendingChatTurns;
  sessionRef.current = session;

  const updatePendingChatTurns = useCallback((value) => {
    if (typeof setPendingChatTurns !== "function") {
      return;
    }

    setPendingChatTurns((current) => {
      const next = typeof value === "function" ? value(current) : value;
      pendingChatTurnsRef.current = next;
      pushCcDebugEvent("runtime.pending.update", {
        keys: Object.keys(next || {}),
      });
      return next;
    });
  }, [setPendingChatTurns]);

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

  const scheduleRecoveredPendingSettle = useCallback((conversationKey, nextSessionStatus) => {
    const normalizedConversationKey = String(conversationKey || "").trim();
    if (!normalizedConversationKey) {
      return;
    }

    clearRecoveredPendingSettleTimeout();
    recoveredPendingSettleTimeoutRef.current = window.setTimeout(() => {
      const currentPendingEntry = pendingChatTurnsRef.current[normalizedConversationKey];
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
  }, [clearRecoveredPendingSettleTimeout, i18n.common.idle, messagesRef, setBusy, setSession, updatePendingChatTurns]);

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
    setIfChanged(setAvailableModels, nextState.availableModels || []);
    setIfChanged(setAvailableAgents, nextState.availableAgents || []);
    setIfChanged(setTaskRelationships, nextState.taskRelationships || []);
    setIfChanged(setTaskTimeline, nextState.taskTimeline || []);
    setIfChanged(setFiles, nextState.files || []);
    setIfChanged(setArtifacts, nextState.artifacts || []);
    setIfChanged(setSnapshots, nextState.snapshots || []);
    setIfChanged(setAgents, nextState.agents || []);
    setIfChanged(setPeeks, nextState.peeks || EMPTY_RUNTIME_PEEKS);
    setRuntimeOverviewReady(Boolean(state && state.overviewReady !== false));
  }, []);

  const applySnapshot = useCallback((snapshot: RuntimeSnapshot, options: RuntimeSnapshotApplyOptions = {}) => {
    if (!snapshot) return;
    setRuntimeOverviewReady(true);

    const currentSession = sessionRef.current;
    const currentPendingChatTurns = pendingChatTurnsRef.current;
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
      const mergedConversation = pendingEntry
        ? mergeConversationIdentity(
            snapshotConversationWithAttachments,
            localMessages,
            pendingEntry,
          )
        : baseMergedConversation;
      const localMessagesWithoutPending = localMessages.filter((message) => !message?.pending);
      const snapshotHasAssistantReply = pendingEntry
        ? hasAuthoritativePendingAssistantReply(mergedConversation, pendingEntry)
        : false;
      const localHasSettledAssistantReply = pendingEntry?.assistantMessageId
        ? hasAuthoritativePendingAssistantReply(localMessagesWithoutPending, pendingEntry)
        : false;
      const {
        keepRecoveredPendingAlive,
        canSettleRecoveredPending,
        contentChanged,
      } = resolveRecoveredPendingProgress({
        recoveringPendingReply,
        pendingEntry,
        localMessages,
        snapshotMessages: mergedConversation,
        status: snapshot.session?.status || nextSession.status,
        progressRef: recoveredPendingProgressRef,
      });
      const localHasLivePendingAssistant = recoveringPendingReply
        ? keepRecoveredPendingAlive
        : (hasLocalLivePendingAssistant(localMessages, pendingEntry, busy) || keepRecoveredPendingAlive);
      const snapshotIncludesPendingUserMessage = pendingEntry
        ? snapshotHasPendingUserMessage(mergedConversation, pendingEntry)
        : false;
      const snapshotCanSettlePending = (canSettleRecoveredPending || !localHasLivePendingAssistant) && snapshotHasAssistantReply && snapshotIncludesPendingUserMessage;
      const hasAssistantReply = !localHasLivePendingAssistant && (snapshotCanSettlePending || localHasSettledAssistantReply);
      const shouldClearPending = localHasLivePendingAssistant
        ? false
        : shouldClearRecoveredPendingTurn({
        pendingEntry,
        recoveringPendingReply,
        snapshotHasPendingUserMessage: snapshotIncludesPendingUserMessage,
        snapshotHasAssistantReply: hasAssistantReply,
        status: snapshot.session?.status || nextSession.status,
      });
      const effectiveLocalMessages = pendingEntry && (!snapshotHasAssistantReply || localHasLivePendingAssistant)
        ? (localHasSettledAssistantReply ? localMessagesWithoutPending : localMessages)
        : [];
      const mergedConversationWithLocalTail = pendingEntry && (localHasLivePendingAssistant || !shouldClearPending)
        ? mergedConversation
        : mergeStaleLocalConversationTail(
            mergedConversation,
            shouldClearPending ? localMessagesWithoutPending : localMessages,
          );
      const stopOverrideActive = Date.now() < stopOverrideUntilRef.current;
      const effectiveClearPending = shouldClearPending || stopOverrideActive;
      const hydratedConversation = effectiveClearPending
        ? (
            pendingEntry && (
              (localHasSettledAssistantReply && !snapshotHasAssistantReply)
              || (snapshotHasAssistantReply && !snapshotIncludesPendingUserMessage)
            )
              ? mergePendingConversation(
                  mergedConversationWithLocalTail,
                  pendingEntry,
                  i18n.chat.thinkingPlaceholder,
                  localMessagesWithoutPending,
                )
              : mergedConversationWithLocalTail
          )
        : mergePendingConversation(
            mergedConversationWithLocalTail,
            pendingEntry,
            i18n.chat.thinkingPlaceholder,
            effectiveLocalMessages,
          );
      const stabilizedConversation = stabilizeHydratedConversation(hydratedConversation, localMessages);
      const hasActivePendingTurn = Boolean(pendingEntry) && !pendingEntry?.stopped && !hasAssistantReply && !effectiveClearPending;
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
      setMessagesSynced(stabilizedConversation || []);
      setBusy(hasActivePendingTurn);

      if (recoveringPendingReply && pendingEntry) {
        const normalizedStatus = normalizeStatusKey(snapshot.session?.status || nextSession.status);
        if (
          !canSettleRecoveredPending
          && snapshotHasAssistantReply
          && snapshotIncludesPendingUserMessage
          && ["idle", "completed"].includes(normalizedStatus)
          && !contentChanged
        ) {
          scheduleRecoveredPendingSettle(nextConversationKey, nextSession.status);
        } else {
          clearRecoveredPendingSettleTimeout();
        }
      } else {
        clearRecoveredPendingSettleTimeout();
      }

      if (pendingEntry && !hasActivePendingTurn) {
        updatePendingChatTurns((current) => {
          if (!current[nextConversationKey]) {
            return current;
          }
          const next = { ...current };
          delete next[nextConversationKey];
          return next;
        });
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

    setIfChanged(setAvailableModels, snapshot.session?.availableModels || snapshot.availableModels || []);
    setIfChanged(setAvailableAgents, snapshot.session?.availableAgents || snapshot.availableAgents || []);
    if (Object.prototype.hasOwnProperty.call(snapshot, "taskRelationships")) {
      setTaskRelationships((current) => {
        const merged = mergeTaskRelationships(current, snapshot.taskRelationships || []);
        return areJsonEqual(current, merged) ? current : merged;
      });
    } else if (nextConversationKey !== currentConversationKey) {
      setIfChanged(setTaskRelationships, []);
    }
    setIfChanged(setTaskTimeline, snapshot.taskTimeline || []);
    setFilesFromSnapshot(snapshot.files || []);
    setIfChanged(setArtifacts, snapshot.artifacts || []);
    setIfChanged(setSnapshots, snapshot.snapshots || []);
    setIfChanged(setAgents, snapshot.agents || []);
    setIfChanged(setPeeks, snapshot.peeks || EMPTY_RUNTIME_PEEKS);
    setModel(snapshot.session?.selectedModel || snapshot.model || nextSession.model || "");

    if (!shouldDeferConversationSync && snapshotPromptHistory.length) {
      setPromptHistoryByConversation((current) => {
        const previous = current[nextConversationKey] || [];
        if (JSON.stringify(previous) === JSON.stringify(snapshotPromptHistory)) {
          return current;
        }
        return {
          ...current,
          [nextConversationKey]: snapshotPromptHistory,
        };
      });
    }
  }, [
    busy,
    i18n.chat.thinkingPlaceholder,
    i18n.common.idle,
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
    setMessagesSynced,
    setModel,
    setPeeks,
    setPromptHistoryByConversation,
    setSession,
    setSnapshots,
    setTaskTimeline,
    updatePendingChatTurns,
    scheduleRecoveredPendingSettle,
    clearRecoveredPendingSettleTimeout,
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
    enabled: wsEnabled,
  });
  const runtimeTransport = wsEnabled && wsConnected ? "ws" : "polling";
  const runtimeFallbackReason = !wsConnected ? String(lastDisconnectReason || "").trim() : "";

  const applyIncrementalConversation = useCallback((nextConversation: ChatMessage[]) => {
    const currentSession = sessionRef.current;
    const currentPendingChatTurns = pendingChatTurnsRef.current;
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
    pushCcDebugEvent("runtime.conversation.sync", {
      conversationLength: nextConversation.length,
      pendingKey: pendingEntry?.key || conversationKey,
      pendingAssistantId: pendingEntry?.assistantMessageId || "",
    });

    const mergedConversation = pendingEntry
      ? mergeConversationIdentity(
          nextConversationWithAttachments,
          localMessages,
          pendingEntry,
        )
      : baseMergedConversation;
    const localMessagesWithoutPending = localMessages.filter((message) => !message?.pending);
    const snapshotHasAssistantReply = pendingEntry
      ? hasAuthoritativePendingAssistantReply(mergedConversation, pendingEntry)
      : false;
    const localHasSettledAssistantReply = pendingEntry?.assistantMessageId
      ? hasAuthoritativePendingAssistantReply(localMessagesWithoutPending, pendingEntry)
      : false;
    const {
      keepRecoveredPendingAlive,
      canSettleRecoveredPending,
      contentChanged,
    } = resolveRecoveredPendingProgress({
      recoveringPendingReply,
      pendingEntry,
      localMessages,
      snapshotMessages: mergedConversation,
      status: currentSession.status,
      progressRef: recoveredPendingProgressRef,
    });
    const localHasLivePendingAssistant = recoveringPendingReply
      ? keepRecoveredPendingAlive
      : (hasLocalLivePendingAssistant(localMessages, pendingEntry, busy) || keepRecoveredPendingAlive);
    const snapshotIncludesPendingUserMessage = pendingEntry
      ? snapshotHasPendingUserMessage(mergedConversation, pendingEntry)
      : false;
    const snapshotCanSettlePending = (canSettleRecoveredPending || !localHasLivePendingAssistant) && snapshotHasAssistantReply && snapshotIncludesPendingUserMessage;
    const hasAssistantReply = !localHasLivePendingAssistant && (snapshotCanSettlePending || localHasSettledAssistantReply);
    const shouldClearPending = localHasLivePendingAssistant
      ? false
      : shouldClearRecoveredPendingTurn({
      pendingEntry,
      recoveringPendingReply,
      snapshotHasPendingUserMessage: snapshotIncludesPendingUserMessage,
      snapshotHasAssistantReply: hasAssistantReply,
      status: currentSession.status,
    });
    const effectiveLocalMessages = pendingEntry && (!snapshotHasAssistantReply || localHasLivePendingAssistant)
      ? (localHasSettledAssistantReply ? localMessagesWithoutPending : localMessages)
      : [];
    const mergedConversationWithLocalTail = pendingEntry && (localHasLivePendingAssistant || !shouldClearPending)
      ? mergedConversation
      : mergeStaleLocalConversationTail(
          mergedConversation,
          shouldClearPending ? localMessagesWithoutPending : localMessages,
        );
    const hydratedConversation = shouldClearPending
      ? (
          pendingEntry && (
            (localHasSettledAssistantReply && !snapshotHasAssistantReply)
            || (snapshotHasAssistantReply && !snapshotIncludesPendingUserMessage)
          )
            ? mergePendingConversation(
                mergedConversationWithLocalTail,
                pendingEntry,
                i18n.chat.thinkingPlaceholder,
                localMessagesWithoutPending,
              )
            : mergedConversationWithLocalTail
        )
      : mergePendingConversation(
          mergedConversationWithLocalTail,
          pendingEntry,
          i18n.chat.thinkingPlaceholder,
          effectiveLocalMessages,
        );
    const stabilizedConversation = stabilizeHydratedConversation(hydratedConversation, localMessages);
    const hasActivePendingTurn = Boolean(pendingEntry) && !pendingEntry?.stopped && !hasAssistantReply && !shouldClearPending;
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

    setMessagesSynced(stabilizedConversation || []);
    setBusy(hasActivePendingTurn);

    if (recoveringPendingReply && pendingEntry) {
      const normalizedStatus = normalizeStatusKey(currentSession.status);
      if (
        !canSettleRecoveredPending
        && snapshotHasAssistantReply
        && snapshotIncludesPendingUserMessage
        && ["idle", "completed"].includes(normalizedStatus)
        && !contentChanged
      ) {
        scheduleRecoveredPendingSettle(conversationKey, currentSession.status);
      } else {
        clearRecoveredPendingSettleTimeout();
      }
    } else {
      clearRecoveredPendingSettleTimeout();
    }

    if (pendingEntry && !hasActivePendingTurn) {
      updatePendingChatTurns((current) => {
        if (!current[conversationKey]) return current;
        const next = { ...current };
        delete next[conversationKey];
        return next;
      });
    }

    const snapshotPromptHistory = extractUserPromptHistory(nextConversation);
    if (snapshotPromptHistory.length) {
      setPromptHistoryByConversation((current) => {
        const previous = current[conversationKey] || [];
        if (JSON.stringify(previous) === JSON.stringify(snapshotPromptHistory)) return current;
        return { ...current, [conversationKey]: snapshotPromptHistory };
      });
    }
  }, [busy, i18n.chat.thinkingPlaceholder, messagesRef, recoveringPendingReply, setBusy, setMessagesSynced, setPromptHistoryByConversation, updatePendingChatTurns, scheduleRecoveredPendingSettle, clearRecoveredPendingSettleTimeout]);

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
        pendingChatTurns: pendingChatTurnsRef.current,
        sessionStatus: nextSession.status,
        sessionUser: currentSession.sessionUser,
      });
      const localRecoveredAssistant = recoveringPendingReply
        ? findPendingAssistantMessage(localMessages, localPendingEntry)
        : null;
      const hasLocalActiveAssistantReply = localMessages.some((message) => message?.role === "assistant" && (message?.pending || message?.streaming));
      const shouldHoldBusyForLocalTurn = Boolean(localPendingEntry) || hasLocalActiveAssistantReply;
      if (wsStopOverrideActive) {
        nextSession.status = i18n.common.idle;
      }
      if (!areSessionSnapshotsEqual(currentSession, nextSession)) {
        setSession(nextSession);
      }
      if (payload.session.availableModels) {
        setIfChanged(setAvailableModels, payload.session.availableModels);
      }
      if (payload.session.availableAgents) {
        setIfChanged(setAvailableAgents, payload.session.availableAgents);
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
      if (wsStopOverrideActive || statusKey === 'idle' || statusKey === 'completed') {
        setBusy(shouldHoldBusyForLocalTurn ? true : false);
      } else if (statusKey === "running") {
        setBusy(true);
      } else if (shouldHoldBusyForLocalTurn) {
        setBusy(true);
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
      setIfChanged(setTaskTimeline, payload.taskTimeline || []);
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
  }, [applyIncrementalConversation, applySnapshot, clearRecoveredPendingSettleTimeout, i18n.common.idle, i18n.sessionOverview.fastMode.on, messagesRef, recoveringPendingReply, scheduleRecoveredPendingSettle, setAvailableAgents, setAvailableModels, setBusy, setFastMode, setFilesFromSnapshot, setModel, setSession]);

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
        throw new Error(payload.error || "Runtime snapshot failed");
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
  }, [applySnapshot]);

  useEffect(() => {
    if (wsConnected) {
      return;
    }

    const runtimeOverrides = {
      agentId: session.agentId,
    };
    let retryTimerId = 0;
    let cancelled = false;

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
      throw new Error(data.error || "Session update failed");
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
