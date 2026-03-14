import { useEffect, useMemo, useRef, useState } from "react";
import {
  appendPromptHistory,
  createConversationKey,
  defaultSessionUser,
  defaultTab,
  loadPendingChatTurns,
  loadStoredPromptHistory,
  loadStoredState,
} from "@/features/app/storage";
import { createBaseSession } from "@/features/app/state";
import { useAppHotkeys } from "@/features/app/controllers/use-app-hotkeys";
import { useAppPersistence } from "@/features/app/storage";
import { formatCompactK, formatTime, maxPromptRows } from "@/features/chat/utils";
import { useChatController, usePromptHistory } from "@/features/chat/controllers";
import { useRuntimeSnapshot } from "@/features/session/runtime";
import { useTheme } from "@/features/theme/use-theme";
import { useI18n } from "@/lib/i18n";

export function useCommandCenter() {
  const { intlLocale, messages: i18n } = useI18n();
  const stored = useMemo(() => loadStoredState(), []);
  const storedPromptHistory = useMemo(() => loadStoredPromptHistory(), []);
  const storedPendingChatTurns = useMemo(() => loadPendingChatTurns(), []);
  const [session, setSession] = useState(
    createBaseSession(i18n, {
      agentId: stored?.agentId || "main",
      selectedAgentId: stored?.agentId || "main",
      sessionUser: stored?.sessionUser || defaultSessionUser,
      thinkMode: stored?.thinkMode || "off",
    }),
  );
  const [messages, setMessages] = useState(stored?.messages || []);
  const [promptHistoryByConversation, setPromptHistoryByConversation] = useState(storedPromptHistory);
  const [pendingChatTurns, setPendingChatTurns] = useState(storedPendingChatTurns);
  const [busy, setBusy] = useState(false);
  const [switchingAgentLabel, setSwitchingAgentLabel] = useState("");
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [fastMode, setFastMode] = useState(Boolean(stored?.fastMode));
  const [model, setModel] = useState(stored?.model || "");
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef(null);
  const messageViewportRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const messagesRef = useRef(messages);
  const sessionStateRef = useRef({
    sessionUser: stored?.sessionUser || defaultSessionUser,
    agentId: stored?.agentId || "main",
    model: stored?.model || "",
    fastMode: Boolean(stored?.fastMode),
    thinkMode: stored?.thinkMode || "off",
  });
  const activeTargetRef = useRef({
    sessionUser: stored?.sessionUser || defaultSessionUser,
    agentId: stored?.agentId || "main",
  });
  const localizedFormatTime = useMemo(() => (timestamp) => formatTime(timestamp, intlLocale), [intlLocale]);
  const initialStoredMessagesRef = useRef(stored?.messages || []);
  const initialStoredPendingRef = useRef(storedPendingChatTurns);

  const activeConversationKey = createConversationKey(session.sessionUser, session.agentId);
  const activePendingChat = pendingChatTurns[activeConversationKey] || null;

  const setMessagesSynced = (value) => {
    setMessages((current) => {
      const next = typeof value === "function" ? value(current) : value;
      messagesRef.current = next;
      return next;
    });
  };

  const setActiveTarget = (value) => {
    activeTargetRef.current = value;
  };

  const {
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
  } = useRuntimeSnapshot({
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
  });

  const {
    activeQueuedMessages,
    composerAttachments,
    enqueueOrRunEntry,
    handleAddAttachments,
    handleRemoveAttachment,
    setComposerAttachments,
    setQueuedMessages,
  } = useChatController({
    activeConversationKey,
    activeTargetRef,
    applySnapshot,
    busy,
    i18n,
    messagesRef,
    setBusy,
    setMessagesSynced,
    setPendingChatTurns,
    setSession,
  });

  const focusPrompt = () => {
    window.requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  };

  const adjustPromptHeight = () => {
    const textarea = promptRef.current;
    if (!textarea) return;
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const maxHeight = lineHeight * maxPromptRows + paddingTop + paddingBottom + borderTop + borderBottom;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    adjustPromptHeight();
  }, [prompt]);

  useEffect(() => {
    focusPrompt();
  }, []);

  useEffect(() => {
    sessionStateRef.current = {
      sessionUser: session.sessionUser,
      agentId: session.agentId,
      model,
      fastMode,
      thinkMode: session.thinkMode || "off",
    };
  }, [fastMode, model, session.agentId, session.sessionUser, session.thinkMode]);

  useEffect(() => {
    setActiveTarget({
      sessionUser: session.sessionUser,
      agentId: session.agentId,
    });
  }, [session.agentId, session.sessionUser]);

  const sendCurrentPrompt = async () => {
    const content = prompt.trim();
    const attachments = composerAttachments;
    if (!content && !attachments.length) return;
    shouldAutoScrollRef.current = true;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key: `${sessionStateRef.current.sessionUser}:${sessionStateRef.current.agentId}`,
      content,
      attachments,
      timestamp: Date.now(),
      agentId: sessionStateRef.current.agentId,
      sessionUser: sessionStateRef.current.sessionUser,
      model: sessionStateRef.current.model,
      fastMode: sessionStateRef.current.fastMode,
      onSessionStateChange: (nextSessionState) => {
        sessionStateRef.current = nextSessionState;
        setActiveTarget({
          sessionUser: nextSessionState.sessionUser,
          agentId: nextSessionState.agentId,
        });
      },
    };

    setPrompt("");
    setComposerAttachments([]);
    setPromptHistoryNavigation(null);
    resetRapidEnterState();
    setPromptHistoryByConversation((current) => appendPromptHistory(current, entry.key, content));

    await enqueueOrRunEntry(entry);
  };

  const {
    handlePromptChange,
    handlePromptKeyDown,
    resetRapidEnterState,
    setPromptHistoryNavigation,
  } = usePromptHistory({
    activeConversationKey,
    composerAttachments,
    handleSend: sendCurrentPrompt,
    prompt,
    promptHistoryByConversation,
    promptRef,
    setPrompt,
  });

  useEffect(() => {
    setPromptHistoryNavigation(null);
    setComposerAttachments([]);
  }, [activeConversationKey, setComposerAttachments, setPromptHistoryNavigation]);

  useAppPersistence({
    activeTab,
    fastMode,
    initialStoredMessagesRef,
    initialStoredPendingRef,
    messages,
    messagesRef,
    model,
    pendingChatTurns,
    promptHistoryByConversation,
    session,
    setMessagesSynced,
    setPendingChatTurns,
  });

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (viewport && shouldAutoScrollRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, activeQueuedMessages]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;

    const updateAutoScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom <= 48;
    };

    updateAutoScroll();
    viewport.addEventListener("scroll", updateAutoScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", updateAutoScroll);
  }, []);

  const handleSend = sendCurrentPrompt;

  const handleReset = async () => {
    const nextSessionUser = `command-center-${Date.now()}`;
    const nextAgentId = sessionStateRef.current.agentId;
    const nextModel = sessionStateRef.current.model;
    const previousConversationKey = createConversationKey(sessionStateRef.current.sessionUser, nextAgentId);
    setMessagesSynced([]);
    setQueuedMessages([]);
    setComposerAttachments([]);
    setPendingChatTurns((current) => {
      if (!current[previousConversationKey]) {
        return current;
      }
      const next = { ...current };
      delete next[previousConversationKey];
      return next;
    });
    clearSnapshotData();
    sessionStateRef.current = {
      ...sessionStateRef.current,
      sessionUser: nextSessionUser,
      agentId: nextAgentId,
      model: nextModel,
    };
    setActiveTarget({
      sessionUser: nextSessionUser,
      agentId: nextAgentId,
    });
    setSession((current) =>
      createBaseSession(i18n, {
        ...current,
        model: nextModel || current.model,
        selectedModel: nextModel || current.selectedModel,
        agentId: nextAgentId || current.agentId,
        selectedAgentId: nextAgentId || current.selectedAgentId,
        sessionUser: nextSessionUser,
        contextMax: current.contextMax || 16000,
        updatedLabel: i18n.common.justReset,
      }),
    );
    setPrompt("");
    focusPrompt();
    await loadRuntime(nextSessionUser).catch(() => {});
    focusPrompt();
  };

  useAppHotkeys({
    handlePromptChange,
    handleReset,
    prompt,
    promptRef,
    setTheme,
  });

  const applySessionUpdate = async (payload) => {
    try {
      await updateSessionSettings(payload);
    } catch {
      await loadRuntime(sessionStateRef.current.sessionUser).catch(() => {
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      });
    }
  };

  const handleModelChange = async (nextModel) => {
    if (!nextModel || nextModel === model) return;
    await applySessionUpdate({ model: nextModel });
  };

  const handleAgentChange = async (nextAgent) => {
    if (!nextAgent || nextAgent === session.agentId) return;
    setSwitchingAgentLabel(nextAgent);
    try {
      await applySessionUpdate({ agentId: nextAgent });
    } finally {
      setSwitchingAgentLabel("");
    }
  };

  const handleFastModeChange = async (nextFastMode) => {
    const resolvedFastMode = Boolean(nextFastMode);
    await applySessionUpdate({ fastMode: resolvedFastMode });
  };

  const handleThinkModeChange = async (nextThinkMode) => {
    if (!nextThinkMode || nextThinkMode === session.thinkMode) return;
    await applySessionUpdate({ thinkMode: nextThinkMode });
  };

  const renderPeek = (section, fallback) => {
    if (!section) return fallback;
    return [section.summary, ...(section.items || []).map((item) => `${item.label}: ${item.value}`)].filter(Boolean).join("\n");
  };

  return {
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    availableModels,
    busy,
    composerAttachments,
    files,
    fastMode,
    formatCompactK,
    handleAddAttachments,
    handleAgentChange,
    handleFastModeChange,
    handleModelChange,
    handlePromptChange,
    handlePromptKeyDown,
    handleRemoveAttachment,
    handleReset,
    handleSend,
    handleThinkModeChange,
    localizedFormatTime,
    messageViewportRef,
    messages,
    model,
    peeks,
    prompt,
    promptRef,
    renderPeek,
    resolvedTheme,
    session,
    setActiveTab,
    setTheme,
    snapshots,
    switchingAgentLabel,
    taskTimeline,
    theme,
  };
}
