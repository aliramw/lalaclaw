import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversationKey,
  extractUserPromptHistory,
  hasAuthoritativePendingAssistantReply,
  mergeConversationAttachments,
  mergePendingConversation,
} from "@/features/app/storage";
import { normalizeStatusKey } from "@/features/session/status-display";

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

export function useRuntimeSnapshot({
  activePendingChat,
  busy,
  fastMode,
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
}) {
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

    const currentConversationKey = createConversationKey(session.sessionUser, session.agentId);
    const nextSession = {
      ...session,
      ...(snapshot.session || {}),
      mode: snapshot.session?.mode || session.mode,
    };
    const nextConversationKey = createConversationKey(
      snapshot.session?.sessionUser || nextSession.sessionUser,
      snapshot.session?.agentId || nextSession.agentId,
    );
    const pendingEntry = pendingChatTurns[nextConversationKey] || null;
    const snapshotPromptHistory = extractUserPromptHistory(snapshot.conversation);
    const shouldDeferConversationSync = Boolean(pendingEntry);
    const nextFastMode =
      snapshot.session?.fastMode === i18n.sessionOverview.fastMode.on ||
      snapshot.session?.fastMode === "开启" ||
      snapshot.session?.fastMode === true ||
      snapshot.fastMode === true;

    setFastMode(nextFastMode);

    if (!shouldDeferConversationSync && options.syncConversation !== false && Array.isArray(snapshot.conversation)) {
      const mergedConversation = mergeConversationAttachments(snapshot.conversation, messagesRef.current);
      const snapshotHasAssistantReply = pendingEntry
        ? hasAuthoritativePendingAssistantReply(mergedConversation, pendingEntry)
        : false;
      const hydratedConversation = mergePendingConversation(
        mergedConversation,
        pendingEntry,
        i18n.chat.thinkingPlaceholder,
        messagesRef.current,
      );
      const hasActivePendingTurn = Boolean(pendingEntry) && !snapshotHasAssistantReply;
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
    pendingChatTurns,
    session,
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

  const loadRuntime = useCallback(async (sessionUser = session.sessionUser, overrides = {}) => {
    const requestId = runtimeRequestRef.current + 1;
    runtimeRequestRef.current = requestId;
    const params = new URLSearchParams({
      sessionUser: String(sessionUser || session.sessionUser || "").trim(),
    });
    const resolvedAgentId = String(overrides.agentId || session.agentId || "").trim();

    if (resolvedAgentId) {
      params.set("agentId", resolvedAgentId);
    }

    const response = await fetch(`/api/runtime?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Runtime snapshot failed");
    }
    if (requestId !== runtimeRequestRef.current) {
      return payload;
    }
    applySnapshot(payload);
    return payload;
  }, [applySnapshot, session.agentId, session.sessionUser]);

  useEffect(() => {
    const runtimeOverrides = {
      agentId: session.agentId,
    };

    loadRuntime(session.sessionUser, runtimeOverrides).catch(() => {
      setSession((current) => ({ ...current, status: i18n.common.offline }));
    });

    const pollInterval = busy || activePendingChat ? 4000 : 15000;
    const id = window.setInterval(() => {
      loadRuntime(session.sessionUser, runtimeOverrides).catch(() => {});
    }, pollInterval);

    return () => window.clearInterval(id);
  }, [activePendingChat, busy, i18n.common.offline, loadRuntime, session.agentId, session.sessionUser, setSession]);

  const updateSessionSettings = async (payload) => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: session.sessionUser,
        ...payload,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Session update failed");
    }
    applySnapshot(data);
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
