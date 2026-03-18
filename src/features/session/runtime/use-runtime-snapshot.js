import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversationKey,
  derivePendingEntryFromLocalMessages,
  extractUserPromptHistory,
  hasAuthoritativePendingAssistantReply,
  mergeConversationAttachments,
  mergeConversationIdentity,
  mergePendingConversation,
  mergeStaleLocalConversationTail,
} from "@/features/app/storage";
import { isImSessionUser } from "@/features/session/im-session";
import { normalizeStatusKey } from "@/features/session/status-display";
import { useRuntimeSocket } from "./use-runtime-socket";

export function getRuntimePollInterval({
  recoveringPendingReply = false,
  busy = false,
  activePendingChat = null,
  sessionUser = "",
} = {}) {
  if (recoveringPendingReply) {
    return 1500;
  }

  if (busy || activePendingChat || isImSessionUser(sessionUser)) {
    return 4000;
  }

  return 15000;
}

export function mergeTaskRelationships(previousRelationships, nextRelationships) {
  const previousById = new Map(
    (previousRelationships || [])
      .filter((relationship) => relationship?.id)
      .map((relationship) => [relationship.id, relationship]),
  );
  const merged = new Map();

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

function snapshotHasPendingUserMessage(snapshotMessages = [], pendingEntry = null) {
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
    const allowGeneratedBootstrapFallback =
      normalizedRequestedAgentId
      && normalizedResolvedSessionUser === "command-center"
      && isGeneratedAgentBootstrapSessionUser(normalizedRequestedSessionUser, normalizedRequestedAgentId);

    if (!allowGeneratedBootstrapFallback && normalizedCurrentSessionUser !== normalizedResolvedSessionUser) {
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
  session,
  setBusy,
  setFastMode,
  setMessagesSynced,
  setModel,
  setPendingChatTurns,
  setPromptHistoryByConversation,
  setSession,
  enableWebSocket = true,
}) {
  const INITIAL_RUNTIME_RETRY_DELAY_MS = 1200;
  const [availableModels, setAvailableModels] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [taskTimeline, setTaskTimeline] = useState([]);
  const [taskRelationships, setTaskRelationships] = useState([]);
  const [files, setFiles] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [agents, setAgents] = useState([]);
  const [peeks, setPeeks] = useState({ workspace: null, terminal: null, browser: null, environment: null });
  const runtimeRequestRef = useRef(0);
  const inflightRuntimeRequestRef = useRef(null);
  const pendingChatTurnsRef = useRef(pendingChatTurns);
  const sessionRef = useRef(session);

  pendingChatTurnsRef.current = pendingChatTurns;
  sessionRef.current = session;

  const hydrateRuntimeState = useCallback((state = null) => {
    const nextState = state || {};
    setAvailableModels(nextState.availableModels || []);
    setAvailableAgents(nextState.availableAgents || []);
    setTaskRelationships(nextState.taskRelationships || []);
    setTaskTimeline(nextState.taskTimeline || []);
    setFiles(nextState.files || []);
    setArtifacts(nextState.artifacts || []);
    setSnapshots(nextState.snapshots || []);
    setAgents(nextState.agents || []);
    setPeeks(nextState.peeks || { workspace: null, terminal: null, browser: null, environment: null });
  }, []);

  const applySnapshot = useCallback((snapshot, options = {}) => {
    if (!snapshot) return;

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
    const pendingEntry = currentPendingChatTurns[nextConversationKey] || derivePendingEntryFromLocalMessages(localMessages) || null;
    const snapshotPromptHistory = extractUserPromptHistory(snapshot.conversation);
    const shouldDeferConversationSync = Boolean(pendingEntry) && options.syncConversation === false;
    const nextFastMode =
      snapshot.session?.fastMode === i18n.sessionOverview.fastMode.on ||
      snapshot.session?.fastMode === "开启" ||
      snapshot.session?.fastMode === true ||
      snapshot.fastMode === true;

    setFastMode(nextFastMode);

    if (options.syncConversation !== false && Array.isArray(snapshot.conversation)) {
      const mergedConversation = mergeConversationIdentity(
        mergeConversationAttachments(snapshot.conversation, localMessages),
        localMessages,
      );
      const snapshotHasAssistantReply = pendingEntry
        ? hasAuthoritativePendingAssistantReply(mergedConversation, pendingEntry)
        : false;
      const snapshotIncludesPendingUserMessage = pendingEntry
        ? snapshotHasPendingUserMessage(mergedConversation, pendingEntry)
        : false;
      const shouldClearPending = shouldClearRecoveredPendingTurn({
        pendingEntry,
        recoveringPendingReply,
        snapshotHasPendingUserMessage: snapshotIncludesPendingUserMessage,
        snapshotHasAssistantReply,
        status: snapshot.session?.status || nextSession.status,
      });
      const effectiveLocalMessages = pendingEntry && !snapshotHasAssistantReply ? localMessages : [];
      const localMessagesWithoutPending = localMessages.filter((message) => !message?.pending);
      const mergedConversationWithLocalTail = pendingEntry && !shouldClearPending
        ? mergedConversation
        : mergeStaleLocalConversationTail(
            mergedConversation,
            shouldClearPending ? localMessagesWithoutPending : localMessages,
          );
      const hydratedConversation = shouldClearPending
        ? mergedConversationWithLocalTail
        : mergePendingConversation(
            mergedConversationWithLocalTail,
            pendingEntry,
            i18n.chat.thinkingPlaceholder,
            effectiveLocalMessages,
          );
      const hasActivePendingTurn = Boolean(pendingEntry) && !pendingEntry?.stopped && !snapshotHasAssistantReply && !shouldClearPending;
      setSession({ ...nextSession, status: hasActivePendingTurn ? i18n.common.running : nextSession.status });
      setMessagesSynced(hydratedConversation);
      setBusy(hasActivePendingTurn);

      if (pendingEntry && !hasActivePendingTurn) {
        setPendingChatTurns((current) => {
          if (!current[nextConversationKey]) {
            return current;
          }
          const next = { ...current };
          delete next[nextConversationKey];
          return next;
        });
      }
    } else {
      setSession({ ...nextSession, status: shouldDeferConversationSync ? i18n.common.running : nextSession.status });
      setBusy(Boolean(shouldDeferConversationSync));
    }

    setAvailableModels(snapshot.session?.availableModels || snapshot.availableModels || []);
    setAvailableAgents(snapshot.session?.availableAgents || snapshot.availableAgents || []);
    if (Object.prototype.hasOwnProperty.call(snapshot, "taskRelationships")) {
      setTaskRelationships((current) => mergeTaskRelationships(current, snapshot.taskRelationships || []));
    } else if (nextConversationKey !== currentConversationKey) {
      setTaskRelationships([]);
    }
    setTaskTimeline(snapshot.taskTimeline || []);
    setFiles(snapshot.files || []);
    setArtifacts(snapshot.artifacts || []);
    setSnapshots(snapshot.snapshots || []);
    setAgents(snapshot.agents || []);
    setPeeks(snapshot.peeks || { workspace: null, terminal: null, browser: null, environment: null });
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
    i18n.chat.thinkingPlaceholder,
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
    setFiles,
    setMessagesSynced,
    setModel,
    setPeeks,
    setPendingChatTurns,
    setPromptHistoryByConversation,
    setSession,
    setSnapshots,
    setTaskTimeline,
  ]);

  const wsEnabled = enableWebSocket && !isImSessionUser(session.sessionUser);
  const { connected: wsConnected, setOnMessage } = useRuntimeSocket({
    sessionUser: session.sessionUser,
    agentId: session.agentId,
    enabled: wsEnabled,
  });

  const applyIncrementalConversation = useCallback((nextConversation) => {
    const currentSession = sessionRef.current;
    const currentPendingChatTurns = pendingChatTurnsRef.current;
    const conversationKey = createConversationKey(currentSession.sessionUser, currentSession.agentId);
    const localMessages = messagesRef.current || [];
    const pendingEntry = currentPendingChatTurns[conversationKey] || derivePendingEntryFromLocalMessages(localMessages) || null;

    const mergedConversation = mergeConversationIdentity(
      mergeConversationAttachments(nextConversation, localMessages),
      localMessages,
    );
    const snapshotHasAssistantReply = pendingEntry
      ? hasAuthoritativePendingAssistantReply(mergedConversation, pendingEntry)
      : false;
    const snapshotIncludesPendingUserMessage = pendingEntry
      ? snapshotHasPendingUserMessage(mergedConversation, pendingEntry)
      : false;
    const shouldClearPending = shouldClearRecoveredPendingTurn({
      pendingEntry,
      recoveringPendingReply,
      snapshotHasPendingUserMessage: snapshotIncludesPendingUserMessage,
      snapshotHasAssistantReply,
      status: currentSession.status,
    });
    const effectiveLocalMessages = pendingEntry && !snapshotHasAssistantReply ? localMessages : [];
    const localMessagesWithoutPending = localMessages.filter((message) => !message?.pending);
    const mergedConversationWithLocalTail = pendingEntry && !shouldClearPending
      ? mergedConversation
      : mergeStaleLocalConversationTail(
          mergedConversation,
          shouldClearPending ? localMessagesWithoutPending : localMessages,
        );
    const hydratedConversation = shouldClearPending
      ? mergedConversationWithLocalTail
      : mergePendingConversation(
          mergedConversationWithLocalTail,
          pendingEntry,
          i18n.chat.thinkingPlaceholder,
          effectiveLocalMessages,
        );
    const hasActivePendingTurn = Boolean(pendingEntry) && !pendingEntry?.stopped && !snapshotHasAssistantReply && !shouldClearPending;

    setMessagesSynced(hydratedConversation);
    setBusy(hasActivePendingTurn);

    if (pendingEntry && !hasActivePendingTurn) {
      setPendingChatTurns((current) => {
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
  }, [i18n.chat.thinkingPlaceholder, messagesRef, recoveringPendingReply, setBusy, setMessagesSynced, setPendingChatTurns, setPromptHistoryByConversation]);

  const handleWsMessage = useCallback((payload) => {
    if (!payload || !payload.type) return;

    if (payload.type === 'runtime.snapshot') {
      applySnapshot(payload);
      return;
    }

    if (payload.type === 'session.sync' && payload.session) {
      setSession((current) => ({ ...current, ...payload.session }));
      if (payload.session.availableModels) {
        setAvailableModels(payload.session.availableModels);
      }
      if (payload.session.availableAgents) {
        setAvailableAgents(payload.session.availableAgents);
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
      if (statusKey === 'idle' || statusKey === 'completed') {
        setBusy(false);
      } else if (statusKey === 'running' || statusKey === 'busy') {
        setBusy(true);
      }
      return;
    }

    if (payload.type === 'taskRelationships.sync') {
      setTaskRelationships((current) => mergeTaskRelationships(current, payload.taskRelationships || []));
      return;
    }

    if (payload.type === 'taskTimeline.sync') {
      setTaskTimeline(payload.taskTimeline || []);
      return;
    }

    if (payload.type === 'artifacts.sync') {
      setArtifacts(payload.artifacts || []);
      return;
    }

    if (payload.type === 'files.sync') {
      setFiles(payload.files || []);
      return;
    }

    if (payload.type === 'snapshots.sync') {
      setSnapshots(payload.snapshots || []);
      return;
    }

    if (payload.type === 'agents.sync') {
      setAgents(payload.agents || []);
      return;
    }

    if (payload.type === 'peeks.sync') {
      setPeeks(payload.peeks || { workspace: null, terminal: null, browser: null, environment: null });
      return;
    }

    if (payload.type === 'conversation.sync' && Array.isArray(payload.conversation)) {
      applyIncrementalConversation(payload.conversation);
      return;
    }
  }, [applyIncrementalConversation, applySnapshot, i18n.sessionOverview.fastMode.on, setAvailableAgents, setAvailableModels, setBusy, setFastMode, setModel, setSession]);

  useEffect(() => {
    setOnMessage(handleWsMessage);
  }, [setOnMessage, handleWsMessage]);

  const loadRuntime = useCallback(async (sessionUser = sessionRef.current.sessionUser, overrides = {}) => {
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
      const response = await fetch(`/api/runtime?${requestKey}`);
      const payload = await response.json();
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

    loadRuntime(session.sessionUser, runtimeOverrides).catch(() => {
      if (cancelled) {
        return;
      }

      retryTimerId = window.setTimeout(() => {
        loadRuntime(session.sessionUser, runtimeOverrides).catch(() => {
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
      sessionUser: session.sessionUser,
    });
    const id = window.setInterval(() => {
      loadRuntime(session.sessionUser, runtimeOverrides).catch(() => {});
    }, pollInterval);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(retryTimerId);
    };
  }, [activePendingChat, busy, i18n.common.offline, loadRuntime, recoveringPendingReply, session.agentId, session.sessionUser, setSession, wsConnected]);

  const updateSessionSettings = async (payload) => {
    const targetSessionUser = String(payload?.sessionUser || session.sessionUser || "").trim();
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        sessionUser: targetSessionUser,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Session update failed");
    }
    applySnapshot(data);
    return data;
  };

  const clearSnapshotData = () => {
    setAvailableModels([]);
    setAvailableAgents([]);
    setTaskRelationships([]);
    setTaskTimeline([]);
    setFiles([]);
    setArtifacts([]);
    setSnapshots([]);
    setAgents([]);
    setPeeks({ workspace: null, terminal: null, browser: null, environment: null });
  };

  return {
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
    snapshots,
    taskRelationships,
    taskTimeline,
    updateSessionSettings,
  };
}
