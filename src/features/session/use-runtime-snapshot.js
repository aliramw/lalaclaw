import { useEffect, useRef, useState } from "react";
import {
  createConversationKey,
  extractUserPromptHistory,
  mergeConversationAttachments,
  mergePendingConversation,
} from "@/features/app/app-storage";

export function useRuntimeSnapshot({
  activePendingChat,
  busy,
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
  const [files, setFiles] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [agents, setAgents] = useState([]);
  const [peeks, setPeeks] = useState({ workspace: null, terminal: null, browser: null });
  const runtimeRequestRef = useRef(0);

  const applySnapshot = (snapshot, options = {}) => {
    if (!snapshot) return;

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
    const nextFastMode =
      snapshot.session?.fastMode === i18n.sessionOverview.fastMode.on ||
      snapshot.session?.fastMode === "开启" ||
      snapshot.session?.fastMode === true ||
      snapshot.fastMode === true;

    setFastMode(nextFastMode);

    if (options.syncConversation !== false && Array.isArray(snapshot.conversation)) {
      const mergedConversation = mergeConversationAttachments(snapshot.conversation, messagesRef.current);
      const hydratedConversation = mergePendingConversation(mergedConversation, pendingEntry, i18n.chat.thinkingPlaceholder);
      const hasPendingBubble = hydratedConversation.some((message) => message.pending);
      setSession({ ...nextSession, status: hasPendingBubble ? i18n.common.running : nextSession.status });
      setMessagesSynced(hydratedConversation);
      setBusy(hasPendingBubble);

      if (pendingEntry && !hasPendingBubble) {
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
      setSession(nextSession);
    }

    setAvailableModels(snapshot.session?.availableModels || snapshot.availableModels || []);
    setAvailableAgents(snapshot.session?.availableAgents || snapshot.availableAgents || []);
    setTaskTimeline(snapshot.taskTimeline || []);
    setFiles(snapshot.files || []);
    setArtifacts(snapshot.artifacts || []);
    setSnapshots(snapshot.snapshots || []);
    setAgents(snapshot.agents || []);
    setPeeks(snapshot.peeks || { workspace: null, terminal: null, browser: null });
    setModel(snapshot.session?.selectedModel || snapshot.model || nextSession.model || "");

    if (snapshotPromptHistory.length) {
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
  };

  const loadRuntime = async (sessionUser = session.sessionUser) => {
    const requestId = runtimeRequestRef.current + 1;
    runtimeRequestRef.current = requestId;
    const response = await fetch(`/api/runtime?sessionUser=${encodeURIComponent(sessionUser)}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Runtime snapshot failed");
    }
    if (requestId !== runtimeRequestRef.current) {
      return payload;
    }
    applySnapshot(payload);
    return payload;
  };

  useEffect(() => {
    loadRuntime(session.sessionUser).catch(() => {
      setSession((current) => ({ ...current, status: i18n.common.offline }));
    });

    const pollInterval = busy || activePendingChat ? 4000 : 15000;
    const id = window.setInterval(() => {
      loadRuntime(session.sessionUser).catch(() => {});
    }, pollInterval);

    return () => window.clearInterval(id);
  }, [activePendingChat, busy, i18n.common.offline, session.sessionUser]);

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
    setTaskTimeline([]);
    setFiles([]);
    setArtifacts([]);
    setSnapshots([]);
    setAgents([]);
    setPeeks({ workspace: null, terminal: null, browser: null });
  };

  return {
    agents,
    applySnapshot,
    artifacts,
    availableAgents,
    availableModels,
    clearSnapshotData,
    files,
    loadRuntime,
    peeks,
    snapshots,
    taskTimeline,
    updateSessionSettings,
  };
}
