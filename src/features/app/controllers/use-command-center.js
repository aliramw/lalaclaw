import { useEffect, useMemo, useRef, useState } from "react";
import {
  appendPromptHistory,
  createConversationKey,
  defaultChatFontSize,
  defaultInspectorPanelWidth,
  defaultSessionUser,
  defaultTab,
  loadPendingChatTurns,
  loadStoredPromptDrafts,
  loadStoredPromptHistory,
  loadStoredState,
  sanitizeInspectorPanelWidth,
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
  const storedPromptDrafts = useMemo(() => stored?.promptDraftsByConversation || loadStoredPromptDrafts(), [stored]);
  const storedPendingChatTurns = useMemo(() => loadPendingChatTurns(), []);
  const initialConversationKey = createConversationKey(stored?.sessionUser || defaultSessionUser, stored?.agentId || "main");
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
  const [promptDraftsByConversation, setPromptDraftsByConversation] = useState(storedPromptDrafts);
  const [pendingChatTurns, setPendingChatTurns] = useState(storedPendingChatTurns);
  const [busy, setBusy] = useState(false);
  const [switchingAgentLabel, setSwitchingAgentLabel] = useState("");
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [fastMode, setFastMode] = useState(Boolean(stored?.fastMode));
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(stored?.inspectorPanelWidth || defaultInspectorPanelWidth);
  const [chatFontSizeBySessionUser, setChatFontSizeBySessionUser] = useState(stored?.chatFontSizeBySessionUser || {});
  const [dismissedTaskRelationshipIdsByConversation, setDismissedTaskRelationshipIdsByConversation] = useState(
    stored?.dismissedTaskRelationshipIdsByConversation || {},
  );
  const [focusMessageRequest, setFocusMessageRequest] = useState(null);
  const [model, setModel] = useState(stored?.model || "");
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [prompt, setPrompt] = useState(storedPromptDrafts[initialConversationKey] || "");
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
  const activeChatFontSize = chatFontSizeBySessionUser[session.sessionUser] || defaultChatFontSize;
  const dismissedTaskRelationshipIds = dismissedTaskRelationshipIdsByConversation[activeConversationKey] || [];

  const setPromptForConversation = (value, conversationKey = activeConversationKey) => {
    setPrompt((current) => {
      const next = typeof value === "function" ? value(current) : value;
      const normalized = typeof next === "string" ? next : String(next || "");

      setPromptDraftsByConversation((drafts) => {
        if (!normalized) {
          if (!Object.prototype.hasOwnProperty.call(drafts, conversationKey)) {
            return drafts;
          }
          const nextDrafts = { ...drafts };
          delete nextDrafts[conversationKey];
          return nextDrafts;
        }

        if (drafts[conversationKey] === normalized) {
          return drafts;
        }

        return {
          ...drafts,
          [conversationKey]: normalized,
        };
      });

      return next;
    });
  };

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
    taskRelationships,
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
    setPrompt(promptDraftsByConversation[activeConversationKey] || "");
  }, [activeConversationKey, promptDraftsByConversation]);

  useEffect(() => {
    setMessagesSynced((current) =>
      (current || []).map((message) =>
        message?.pending
          ? {
              ...message,
              content: i18n.chat.thinkingPlaceholder,
            }
          : message,
      ),
    );
  }, [i18n.chat.thinkingPlaceholder]);

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

    setPromptForConversation("");
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
    setPrompt: setPromptForConversation,
  });

  useEffect(() => {
    setPromptHistoryNavigation(null);
    setComposerAttachments([]);
  }, [activeConversationKey, setComposerAttachments, setPromptHistoryNavigation]);

  useAppPersistence({
    activeTab,
    chatFontSizeBySessionUser,
    dismissedTaskRelationshipIdsByConversation,
    fastMode,
    initialStoredMessagesRef,
    initialStoredPendingRef,
    inspectorPanelWidth,
    messages,
    messagesRef,
    model,
    pendingChatTurns,
    promptDraftsByConversation,
    promptHistoryByConversation,
    session,
    setMessagesSynced,
    setPendingChatTurns,
  });

  const handleChatFontSizeChange = (nextSize) => {
    if (!["small", "medium", "large"].includes(nextSize)) {
      return;
    }

    setChatFontSizeBySessionUser((current) => {
      if ((current[session.sessionUser] || defaultChatFontSize) === nextSize) {
        return current;
      }

      return {
        ...current,
        [session.sessionUser]: nextSize,
      };
    });
  };

  const handleInspectorPanelWidthChange = (nextWidth) => {
    const normalizedWidth = sanitizeInspectorPanelWidth(nextWidth);
    setInspectorPanelWidth((current) => (current === normalizedWidth ? current : normalizedWidth));
  };

  const dismissTaskRelationship = (relationshipId) => {
    const normalizedId = String(relationshipId || "").trim();
    if (!normalizedId) {
      return;
    }

    setDismissedTaskRelationshipIdsByConversation((current) => {
      const existing = current[activeConversationKey] || [];
      if (existing.includes(normalizedId)) {
        return current;
      }

      return {
        ...current,
        [activeConversationKey]: [...existing, normalizedId],
      };
    });
  };

  const visibleTaskRelationships = useMemo(
    () => taskRelationships.filter((relationship) => !dismissedTaskRelationshipIds.includes(relationship?.id)),
    [dismissedTaskRelationshipIds, taskRelationships],
  );

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
    setPromptForConversation("");
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

  const handleArtifactSelect = (artifact) => {
    const normalizedDetail = String(artifact?.detail || "")
      .replace(/\.\.\.$/, "")
      .replace(/…$/, "")
      .trim();
    const assistantMessages = messagesRef.current.filter((message) => message?.role === "assistant");

    if (!assistantMessages.length) {
      return;
    }

    const matchedMessage =
      (artifact?.messageTimestamp
        ? assistantMessages.find((message) => Number(message?.timestamp || 0) === Number(artifact.messageTimestamp))
        : null)
      || (artifact?.timestamp
        ? assistantMessages.find((message) => Number(message?.timestamp || 0) === Number(artifact.timestamp))
        : null)
      || (normalizedDetail
        ? assistantMessages.find((message) => String(message?.content || "").includes(normalizedDetail))
        : null)
      || assistantMessages.at(-1);

    if (!matchedMessage?.timestamp) {
      return;
    }

    setFocusMessageRequest({
      id: `${matchedMessage.timestamp}-${Date.now()}`,
      role: matchedMessage.role || artifact?.messageRole || "assistant",
      timestamp: matchedMessage.timestamp,
    });
  };

  return {
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    availableModels,
    busy,
    chatFontSize: activeChatFontSize,
    composerAttachments,
    files,
    fastMode,
    focusMessageRequest,
    formatCompactK,
    handleAddAttachments,
    handleAgentChange,
    handleArtifactSelect,
    handleChatFontSizeChange,
    handleFastModeChange,
    handleInspectorPanelWidthChange,
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
    inspectorPanelWidth,
    peeks,
    prompt,
    promptRef,
    renderPeek,
    resolvedTheme,
    session,
    setActiveTab,
    dismissTaskRelationship,
    setTheme,
    snapshots,
    switchingAgentLabel,
    taskRelationships: visibleTaskRelationships,
    taskTimeline,
    theme,
  };
}
