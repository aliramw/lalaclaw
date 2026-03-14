import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";

const storageKey = "command-center-ui-state-v2";
const defaultTab = "timeline";
const defaultSessionUser = "command-center";
const maxPromptRows = 8;

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatCompactK(value) {
  const numeric = Number(value) || 0;
  if (numeric < 1000) return String(numeric);
  if (numeric >= 1_000_000) {
    const scaledMillion = numeric / 1_000_000;
    if (scaledMillion >= 10) return `${Math.round(scaledMillion)}m`;
    return `${scaledMillion.toFixed(1).replace(/\.0$/, "")}m`;
  }
  const scaled = numeric / 1000;
  if (scaled >= 10) return `${Math.round(scaled)}k`;
  return `${scaled.toFixed(1).replace(/\.0$/, "")}k`;
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      activeTab: parsed?.activeTab || defaultTab,
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      fastMode: Boolean(parsed?.fastMode),
      model: parsed?.model || "",
      agentId: parsed?.agentId || "main",
      sessionUser: parsed?.sessionUser || defaultSessionUser,
    };
  } catch {
    return null;
  }
}

function baseSession(overrides = {}) {
  return {
    mode: "mock",
    model: "",
    selectedModel: "",
    agentId: "main",
    selectedAgentId: "main",
    sessionUser: defaultSessionUser,
    sessionKey: "",
    status: "空闲",
    fastMode: "关闭",
    contextUsed: 0,
    contextMax: 16000,
    contextDisplay: "0 / 16000",
    runtime: "mock",
    queue: "无",
    updatedLabel: "暂无更新",
    tokens: "0 in / 0 out",
    auth: "",
    time: "",
    availableModels: [],
    availableAgents: [],
    ...overrides,
  };
}

export default function App() {
  const stored = useMemo(() => loadStoredState(), []);
  const [messages, setMessages] = useState(stored?.messages || []);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [fastMode, setFastMode] = useState(Boolean(stored?.fastMode));
  const [model, setModel] = useState(stored?.model || "");
  const [availableModels, setAvailableModels] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [taskTimeline, setTaskTimeline] = useState([]);
  const [files, setFiles] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [agents, setAgents] = useState([]);
  const [peeks, setPeeks] = useState({ workspace: null, terminal: null, browser: null });
  const [session, setSession] = useState(
    baseSession({
      agentId: stored?.agentId || "main",
      selectedAgentId: stored?.agentId || "main",
      sessionUser: stored?.sessionUser || defaultSessionUser,
    }),
  );
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef(null);
  const messageViewportRef = useRef(null);
  const busyRef = useRef(busy);
  const messagesRef = useRef(messages);
  const sessionStateRef = useRef({
    sessionUser: stored?.sessionUser || defaultSessionUser,
    agentId: stored?.agentId || "main",
    model: stored?.model || "",
    fastMode: Boolean(stored?.fastMode),
  });
  const activeTargetRef = useRef({
    sessionUser: stored?.sessionUser || defaultSessionUser,
    agentId: stored?.agentId || "main",
  });
  const runtimeRequestRef = useRef(0);

  const activeConversationKey = `${session.sessionUser}:${session.agentId}`;
  const activeQueuedMessages = useMemo(
    () => queuedMessages.filter((item) => item.key === activeConversationKey),
    [activeConversationKey, queuedMessages],
  );

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

  const persist = (next = {}) => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          activeTab,
          messages: (next.messages || messages).filter((message) => !message.pending).slice(-80),
          fastMode,
          model,
          agentId: session.agentId,
          sessionUser: session.sessionUser,
          ...next,
        }),
      );
    } catch {}
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
    persist();
  }, [messages, fastMode, activeTab, model, session.agentId, session.sessionUser]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    sessionStateRef.current = {
      sessionUser: session.sessionUser,
      agentId: session.agentId,
      model,
      fastMode,
    };
  }, [fastMode, model, session.agentId, session.sessionUser]);

  useEffect(() => {
    setActiveTarget({
      sessionUser: session.sessionUser,
      agentId: session.agentId,
    });
  }, [session.agentId, session.sessionUser]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, activeQueuedMessages]);

  const applySnapshot = (snapshot, options = {}) => {
    if (!snapshot) return;
    const nextSession = baseSession({
      ...session,
      ...(snapshot.session || {}),
      mode: snapshot.session?.mode || session.mode,
    });
    const nextFastMode =
      snapshot.session?.fastMode === "开启" ||
      snapshot.session?.fastMode === true ||
      snapshot.fastMode === true;
    setSession(nextSession);
    setFastMode(nextFastMode);
    if (options.syncConversation !== false && Array.isArray(snapshot.conversation)) {
      setMessagesSynced(snapshot.conversation);
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
  };

  const loadRuntime = async (sessionUser = session.sessionUser, options = {}) => {
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
    if (!options.force && busyRef.current) {
      return payload;
    }
    applySnapshot(payload);
    return payload;
  };

  useEffect(() => {
    loadRuntime(session.sessionUser).catch(() => {
      setSession((current) => ({ ...current, status: "离线" }));
    });

    const id = window.setInterval(() => {
      if (!busy) {
        loadRuntime(session.sessionUser).catch(() => {});
      }
    }, 15000);

    return () => window.clearInterval(id);
  }, [busy, session.sessionUser]);

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

  const runChatTurn = async (entry) => {
    const userMessage = { role: "user", content: entry.content, timestamp: entry.timestamp };
    const pendingMessage = { role: "assistant", content: "正在思考…", timestamp: Date.now(), pending: true };
    const nextMessages = [...messagesRef.current, userMessage, pendingMessage];
    const isStillActive =
      activeTargetRef.current.sessionUser === entry.sessionUser &&
      activeTargetRef.current.agentId === entry.agentId;

    if (isStillActive) {
      setMessagesSynced(nextMessages);
      setSession((current) => ({ ...current, status: "执行中" }));
    }

    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: entry.model,
          agentId: entry.agentId,
          sessionUser: entry.sessionUser,
          fastMode: entry.fastMode,
          messages: nextMessages
            .filter((message) => !message.pending)
            .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Request failed");
      }

      const shouldApply =
        activeTargetRef.current.sessionUser === entry.sessionUser &&
        activeTargetRef.current.agentId === entry.agentId;

      if (shouldApply) {
        setMessagesSynced((current) => {
          const withoutPending = current.filter((item) => !item.pending);
          return [
            ...withoutPending,
            {
              role: "assistant",
              content: payload.outputText,
              timestamp: Date.now(),
            },
          ];
        });
        applySnapshot(payload, { syncConversation: false });
      }
      if (shouldApply) {
        setSession((current) => ({ ...current, status: payload.metadata?.status || "已完成" }));
      }
    } catch (error) {
      const shouldApply =
        activeTargetRef.current.sessionUser === entry.sessionUser &&
        activeTargetRef.current.agentId === entry.agentId;

      if (shouldApply) {
        setMessagesSynced((current) => {
          const withoutPending = current.filter((item) => !item.pending);
          return [
            ...withoutPending,
            {
              role: "assistant",
              content: `请求失败。\n${error.message}`,
              timestamp: Date.now(),
            },
          ];
        });
        setSession((current) => ({ ...current, status: "失败" }));
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (busy || !activeQueuedMessages.length) {
      return;
    }

    const [nextEntry] = activeQueuedMessages;
    setQueuedMessages((current) => current.filter((item) => item.id !== nextEntry.id));
    runChatTurn(nextEntry).catch(() => {});
  }, [activeQueuedMessages, busy]);

  const handleSend = async () => {
    const content = prompt.trim();
    if (!content) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key: `${sessionStateRef.current.sessionUser}:${sessionStateRef.current.agentId}`,
      content,
      timestamp: Date.now(),
      agentId: sessionStateRef.current.agentId,
      sessionUser: sessionStateRef.current.sessionUser,
      model: sessionStateRef.current.model,
      fastMode: sessionStateRef.current.fastMode,
    };

    setPrompt("");

    if (busy || activeQueuedMessages.length) {
      setQueuedMessages((current) => [...current, entry]);
      return;
    }

    await runChatTurn(entry);
  };

  const handleReset = async () => {
    const nextSessionUser = `command-center-${Date.now()}`;
    const nextAgentId = sessionStateRef.current.agentId;
    const nextModel = sessionStateRef.current.model;
    setMessagesSynced([]);
    setQueuedMessages([]);
    setTaskTimeline([]);
    setFiles([]);
    setArtifacts([]);
    setSnapshots([]);
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
      baseSession({
        ...current,
        model: nextModel || current.model,
        selectedModel: nextModel || current.selectedModel,
        agentId: nextAgentId || current.agentId,
        selectedAgentId: nextAgentId || current.selectedAgentId,
        sessionUser: nextSessionUser,
        contextMax: current.contextMax || 16000,
        updatedLabel: "刚刚重置",
      }),
    );
    setPrompt("");
    await loadRuntime(nextSessionUser, { force: true }).catch(() => {});
  };

  const onResetHotkey = useEffectEvent((event) => {
    const isResetCombo = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.code === "KeyN" || event.key?.toLowerCase() === "n");
    if (!isResetCombo || event.repeat || event.isComposing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleReset().catch(() => {});
  });

  useEffect(() => {
    const listener = (event) => {
      onResetHotkey(event);
    };

    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  }, [onResetHotkey]);

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

  const handlePromptKeyDown = (event) => {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const renderPeek = (section, fallback) => {
    if (!section) return fallback;
    return [section.summary, ...(section.items || []).map((item) => `${item.label}：${item.value}`)].filter(Boolean).join("\n");
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
            onFastModeChange={setFastMode}
            onModelChange={handleModelChange}
            session={session}
          />

          <main className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
            <ChatPanel
              busy={busy}
              formatTime={formatTime}
              messageViewportRef={messageViewportRef}
              messages={messages}
              queuedMessages={activeQueuedMessages}
              onPromptChange={setPrompt}
              onPromptKeyDown={handlePromptKeyDown}
              onReset={() => handleReset().catch(() => {})}
              onSend={handleSend}
              prompt={prompt}
              promptRef={promptRef}
              session={session}
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
