import { useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import {
  appendPromptHistory,
  createConversationKey,
  defaultSessionUser,
  defaultTab,
  loadPendingChatTurns,
  loadStoredPromptHistory,
  loadStoredState,
} from "@/features/app/app-storage";
import { useAppHotkeys } from "@/features/app/use-app-hotkeys";
import { useAppPersistence } from "@/features/app/use-app-persistence";
import {
  formatCompactK,
  formatTime,
  maxPromptRows,
} from "@/features/chat/chat-utils";
import { useChatController } from "@/features/chat/use-chat-controller";
import { usePromptHistory } from "@/features/chat/use-prompt-history";
import { useRuntimeSnapshot } from "@/features/session/use-runtime-snapshot";
import { useTheme } from "@/features/theme/use-theme";
import { I18nProvider, useI18n } from "@/lib/i18n";

function baseSession(messages, overrides = {}) {
  return {
    mode: "mock",
    model: "",
    selectedModel: "",
    agentId: "main",
    agentLabel: "main",
    selectedAgentId: "main",
    sessionUser: defaultSessionUser,
    sessionKey: "",
    status: messages.common.idle,
    fastMode: messages.sessionOverview.fastMode.off,
    thinkMode: "off",
    contextUsed: 0,
    contextMax: 16000,
    contextDisplay: "0 / 16000",
    runtime: "mock",
    queue: messages.common.none,
    updatedLabel: messages.common.noUpdates,
    updatedAt: null,
    tokens: "0 in / 0 out",
    auth: "",
    version: "",
    time: "",
    availableModels: [],
    availableAgents: [],
    ...overrides,
  };
}

function AppContent() {
  const { intlLocale, messages: i18n } = useI18n();
  const stored = useMemo(() => loadStoredState(), []);
  const storedPromptHistory = useMemo(() => loadStoredPromptHistory(), []);
  const storedPendingChatTurns = useMemo(() => loadPendingChatTurns(), []);
  const [session, setSession] = useState(
    baseSession(i18n, {
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

  useEffect(() => {
    setPromptHistoryNavigation(null);
    setComposerAttachments([]);
  }, [activeConversationKey]);

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

  const handleSend = async () => {
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
    handleSend,
    prompt,
    promptHistoryByConversation,
    promptRef,
    setPrompt,
  });

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
      baseSession(i18n, {
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

  const handleModelChange = async (nextModel) => {
    if (!nextModel || nextModel === model) return;
    sessionStateRef.current = {
      ...sessionStateRef.current,
      model: nextModel,
    };
    setModel(nextModel);
    await updateSessionSettings({ model: nextModel }).catch(() => {});
  };

  const handleAgentChange = async (nextAgent) => {
    if (!nextAgent || nextAgent === session.agentId) return;
    sessionStateRef.current = {
      ...sessionStateRef.current,
      agentId: nextAgent,
    };
    setActiveTarget({
      sessionUser: sessionStateRef.current.sessionUser,
      agentId: nextAgent,
    });
    setSession((current) => ({ ...current, agentId: nextAgent, selectedAgentId: nextAgent }));
    await updateSessionSettings({ agentId: nextAgent }).catch(() => {});
  };

  const handleFastModeChange = async (nextFastMode) => {
    const resolvedFastMode = Boolean(nextFastMode);
    sessionStateRef.current = {
      ...sessionStateRef.current,
      fastMode: resolvedFastMode,
    };
    setFastMode(resolvedFastMode);
    setSession((current) => ({
      ...current,
      fastMode: resolvedFastMode ? i18n.sessionOverview.fastMode.on : i18n.sessionOverview.fastMode.off,
      status: i18n.common.idle,
    }));
    await updateSessionSettings({ fastMode: resolvedFastMode }).catch(() => {});
  };

  const handleThinkModeChange = async (nextThinkMode) => {
    if (!nextThinkMode || nextThinkMode === session.thinkMode) return;
    sessionStateRef.current = {
      ...sessionStateRef.current,
      thinkMode: nextThinkMode,
    };
    setSession((current) => ({
      ...current,
      thinkMode: nextThinkMode,
    }));
    await updateSessionSettings({ thinkMode: nextThinkMode }).catch(() => {});
  };

  const renderPeek = (section, fallback) => {
    if (!section) return fallback;
    return [section.summary, ...(section.items || []).map((item) => `${item.label}: ${item.value}`)].filter(Boolean).join("\n");
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <div className="mx-auto flex h-full w-full max-w-[1760px] flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8">
          <SessionOverview
            availableAgents={availableAgents}
            availableModels={availableModels}
            fastMode={fastMode}
            formatCompactK={formatCompactK}
            model={model}
            onAgentChange={handleAgentChange}
            onFastModeChange={handleFastModeChange}
            onModelChange={handleModelChange}
            onThinkModeChange={handleThinkModeChange}
            onThemeChange={setTheme}
            resolvedTheme={resolvedTheme}
            session={session}
            theme={theme}
          />

          <main className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
            <ChatPanel
              agentLabel={session.agentLabel || session.agentId || "main"}
              busy={busy}
              composerAttachments={composerAttachments}
              files={files}
              formatTime={localizedFormatTime}
              messageViewportRef={messageViewportRef}
              messages={messages}
              onAddAttachments={handleAddAttachments}
              queuedMessages={activeQueuedMessages}
              onRemoveAttachment={handleRemoveAttachment}
              onPromptChange={handlePromptChange}
              onPromptKeyDown={handlePromptKeyDown}
              onReset={() => handleReset().catch(() => {})}
              onSend={handleSend}
              prompt={prompt}
              promptRef={promptRef}
              session={session}
              userLabel="marila"
            />

            <InspectorPanel
              activeTab={activeTab}
              agents={agents}
              artifacts={artifacts}
              files={files}
              peeks={peeks}
              renderPeek={renderPeek}
              setActiveTab={setActiveTab}
              snapshots={snapshots}
              taskTimeline={taskTimeline}
            />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
