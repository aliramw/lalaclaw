import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { hydrateAttachmentStateFromStorage, serializeAttachmentStateForStorage } from "@/lib/attachment-storage";
import { I18nProvider, useI18n } from "@/lib/i18n";

const storageKey = "command-center-ui-state-v2";
const themeStorageKey = "command-center-theme";
const promptHistoryStorageKey = "command-center-prompt-history-v1";
const pendingChatStorageKey = "command-center-pending-chat-v1";
const defaultTab = "timeline";
const defaultSessionUser = "command-center";
const maxPromptRows = 8;
const promptHistoryLimit = 50;
const rapidEnterSendThresholdMs = 420;
const textAttachmentExtensions = /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|scss|less|html|htm|xml|yml|yaml|py|rb|go|rs|java|kt|swift|sh|bash|zsh|sql|csv|log)$/i;
const textAttachmentMimePattern = /^(text\/|application\/(json|xml|javascript|x-javascript)|image\/svg\+xml)/i;

function formatTime(timestamp, locale) {
  return new Intl.DateTimeFormat(locale, {
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
      thinkMode: typeof parsed?.thinkMode === "string" ? parsed.thinkMode : "off",
      model: parsed?.model || "",
      agentId: parsed?.agentId || "main",
      sessionUser: parsed?.sessionUser || defaultSessionUser,
    };
  } catch {
    return null;
  }
}

function loadStoredTheme() {
  try {
    const raw = window.localStorage.getItem(themeStorageKey);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  } catch {
    return "system";
  }
}

function loadStoredPromptHistory() {
  try {
    const raw = window.localStorage.getItem(promptHistoryStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [
          key,
          value
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .slice(-promptHistoryLimit),
        ]),
    );
  } catch {
    return {};
  }
}

function loadPendingChatTurns() {
  try {
    const raw = window.localStorage.getItem(pendingChatStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function createConversationKey(sessionUser = defaultSessionUser, agentId = "main") {
  return `${sessionUser}:${agentId}`;
}

function appendPromptHistory(historyMap, key, prompt) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) {
    return historyMap;
  }

  const currentHistory = Array.isArray(historyMap[key]) ? historyMap[key] : [];
  return {
    ...historyMap,
    [key]: [...currentHistory, normalizedPrompt].slice(-promptHistoryLimit),
  };
}

function extractUserPromptHistory(messages = []) {
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .slice(-promptHistoryLimit);
}

function isImageAttachment(file) {
  return /^image\//i.test(file?.type || "");
}

function isTextAttachment(file) {
  return textAttachmentMimePattern.test(file?.type || "") || textAttachmentExtensions.test(file?.name || "");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file as data URL"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file as text"));
    reader.readAsText(file);
  });
}

function sanitizeMessagesForStorage(messages = []) {
  return messages
    .filter((message) => !message.pending)
    .slice(-80)
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      ...(message.tokenBadge ? { tokenBadge: message.tokenBadge } : {}),
    }));
}

function mergeConversationAttachments(snapshotMessages = [], localMessages = []) {
  const nextMessages = snapshotMessages.map((message) => ({ ...message }));
  const usedIndices = new Set();

  localMessages.forEach((localMessage) => {
    if (!localMessage?.attachments?.length) {
      return;
    }

    const matchIndex = nextMessages.findIndex(
      (message, index) =>
        !usedIndices.has(index) &&
        message.role === localMessage.role &&
        String(message.content || "") === String(localMessage.content || ""),
    );

    if (matchIndex === -1) {
      return;
    }

    nextMessages[matchIndex] = {
      ...nextMessages[matchIndex],
      attachments: localMessage.attachments,
    };
    usedIndices.add(matchIndex);
  });

  return nextMessages;
}

function mergePendingConversation(snapshotMessages = [], pendingEntry, pendingLabel) {
  if (!pendingEntry) {
    return snapshotMessages;
  }

  const hasAssistantReply = snapshotMessages.some(
    (message) => message.role === "assistant" && Number(message.timestamp || 0) >= Number(pendingEntry.startedAt || 0),
  );

  if (hasAssistantReply) {
    return snapshotMessages;
  }

  const latestUserMessage = [...snapshotMessages].reverse().find((message) => message.role === "user");
  const hasPendingUserMessage =
    String(latestUserMessage?.content || "") === String(pendingEntry.userMessage?.content || "");

  const merged = hasPendingUserMessage ? [...snapshotMessages] : [...snapshotMessages, pendingEntry.userMessage];
  return [
    ...merged,
    {
      role: "assistant",
      content: pendingLabel,
      timestamp: pendingEntry.pendingTimestamp,
      pending: true,
    },
  ];
}

function moveCaretToEnd(textarea) {
  if (!textarea) return;
  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
}

function applyTextareaEnter(value = "", selectionStart = 0, selectionEnd = selectionStart) {
  return `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
}

function isEditableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

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
  const storedTheme = useMemo(() => loadStoredTheme(), []);
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
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [promptHistoryByConversation, setPromptHistoryByConversation] = useState(storedPromptHistory);
  const [pendingChatTurns, setPendingChatTurns] = useState(storedPendingChatTurns);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [fastMode, setFastMode] = useState(Boolean(stored?.fastMode));
  const [model, setModel] = useState(stored?.model || "");
  const [theme, setTheme] = useState(storedTheme);
  const [resolvedTheme, setResolvedTheme] = useState("light");
  const [availableModels, setAvailableModels] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [taskTimeline, setTaskTimeline] = useState([]);
  const [files, setFiles] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [agents, setAgents] = useState([]);
  const [peeks, setPeeks] = useState({ workspace: null, terminal: null, browser: null });
  const [prompt, setPrompt] = useState("");
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [promptHistoryNavigation, setPromptHistoryNavigation] = useState(null);
  const promptRef = useRef(null);
  const lastPlainEnterRef = useRef({ timestamp: 0, expectedValue: "" });
  const messageViewportRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const busyRef = useRef(busy);
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
  const runtimeRequestRef = useRef(0);
  const storageRequestRef = useRef(0);
  const localizedFormatTime = useMemo(() => (timestamp) => formatTime(timestamp, intlLocale), [intlLocale]);
  const initialStoredMessagesRef = useRef(stored?.messages || []);
  const initialStoredPendingRef = useRef(storedPendingChatTurns);

  const activeConversationKey = createConversationKey(session.sessionUser, session.agentId);
  const activePendingChat = pendingChatTurns[activeConversationKey] || null;
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
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", resolved === "dark");
      document.documentElement.dataset.theme = resolved;
      setResolvedTheme(resolved);
    };

    applyTheme();
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {}

    const handleChange = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  useEffect(() => {
    const requestId = storageRequestRef.current + 1;
    storageRequestRef.current = requestId;

    const nextStorageState = {
      activeTab,
      fastMode,
      thinkMode: session.thinkMode,
      model,
      agentId: session.agentId,
      sessionUser: session.sessionUser,
    };

    void serializeAttachmentStateForStorage(messages, pendingChatTurns)
      .then((serializedState) => {
        if (requestId !== storageRequestRef.current) {
          return;
        }

        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            ...nextStorageState,
            messages: sanitizeMessagesForStorage(serializedState.messages),
          }),
        );
        window.localStorage.setItem(pendingChatStorageKey, JSON.stringify(serializedState.pendingChatTurns));
      })
      .catch(() => {
        try {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({
              ...nextStorageState,
              messages: sanitizeMessagesForStorage(messages),
            }),
          );
          window.localStorage.setItem(pendingChatStorageKey, JSON.stringify(pendingChatTurns));
        } catch {}
      });
  }, [activeTab, fastMode, messages, model, pendingChatTurns, session.agentId, session.sessionUser, session.thinkMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(promptHistoryStorageKey, JSON.stringify(promptHistoryByConversation));
    } catch {}
  }, [promptHistoryByConversation]);

  useEffect(() => {
    const initialMessages = initialStoredMessagesRef.current;
    const initialPendingChatTurns = initialStoredPendingRef.current;

    if (!initialMessages.length && !Object.keys(initialPendingChatTurns || {}).length) {
      return;
    }

    void hydrateAttachmentStateFromStorage(initialMessages, initialPendingChatTurns).then((hydratedState) => {
      if (messagesRef.current === initialMessages) {
        setMessagesSynced(hydratedState.messages);
      }

      setPendingChatTurns((current) => (current === initialPendingChatTurns ? hydratedState.pendingChatTurns : current));
    });
  }, []);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

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

  useEffect(() => {
    if (activePendingChat) {
      setBusy(true);
      setSession((current) => ({ ...current, status: i18n.common.running }));
    }
  }, [activePendingChat, i18n.common.running]);

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

  const applySnapshot = (snapshot, options = {}) => {
    if (!snapshot) return;
    const nextSession = baseSession(i18n, {
      ...session,
      ...(snapshot.session || {}),
      mode: snapshot.session?.mode || session.mode,
    });
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

  const runChatTurn = async (entry) => {
    const userMessage = {
      role: "user",
      content: entry.content || (entry.attachments?.length ? `已发送 ${entry.attachments.length} 个附件` : ""),
      timestamp: entry.timestamp,
      ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
    };
    const pendingMessage = { role: "assistant", content: i18n.chat.thinkingPlaceholder, timestamp: Date.now(), pending: true };
    const nextMessages = [...messagesRef.current, userMessage, pendingMessage];
    const isStillActive =
      activeTargetRef.current.sessionUser === entry.sessionUser &&
      activeTargetRef.current.agentId === entry.agentId;

    if (isStillActive) {
      setMessagesSynced(nextMessages);
      setSession((current) => ({ ...current, status: i18n.common.running }));
    }

    setBusy(true);
    setPendingChatTurns((current) => ({
      ...current,
      [entry.key]: {
        key: entry.key,
        startedAt: Date.now(),
        pendingTimestamp: pendingMessage.timestamp,
        userMessage: {
          role: "user",
          content: userMessage.content,
          timestamp: userMessage.timestamp,
          ...(userMessage.attachments?.length ? { attachments: userMessage.attachments } : {}),
        },
      },
    }));

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
            .map(({ role, content: messageContent, attachments }) => ({
              role,
              content: messageContent,
              ...(attachments?.length ? { attachments } : {}),
            })),
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
        if (payload.resetSessionUser) {
          const nextSessionUser = payload.resetSessionUser;
          const nextAgentId = payload.session?.agentId || entry.agentId;
          const nextModel = payload.session?.selectedModel || payload.session?.model || entry.model;
          const nextFastMode =
            payload.session?.fastMode === i18n.sessionOverview.fastMode.on ||
            payload.session?.fastMode === "开启" ||
            payload.session?.fastMode === true ||
            payload.fastMode === true;

          sessionStateRef.current = {
            sessionUser: nextSessionUser,
            agentId: nextAgentId,
            model: nextModel,
            fastMode: nextFastMode,
          };
          setActiveTarget({
            sessionUser: nextSessionUser,
            agentId: nextAgentId,
          });
          setQueuedMessages((current) =>
            current.filter((item) => item.key !== `${entry.sessionUser}:${entry.agentId}`),
          );

          const displayConversation =
            Array.isArray(payload.conversation) && payload.conversation.length
              ? payload.conversation
              : [
                  {
                    role: "assistant",
                    content: payload.outputText,
                    timestamp: Date.now(),
                    ...(payload.tokenBadge ? { tokenBadge: payload.tokenBadge } : {}),
                  },
                ];

          setMessagesSynced(displayConversation);
          applySnapshot(payload, { syncConversation: false });
          setSession((current) => ({
            ...current,
            status: payload.metadata?.status || i18n.common.idle,
          }));
          return;
        }

        setMessagesSynced((current) => {
          const withoutPending = current.filter((item) => !item.pending);
          return [
            ...withoutPending,
            {
              role: "assistant",
              content: payload.outputText,
              timestamp: Date.now(),
              ...(payload.tokenBadge ? { tokenBadge: payload.tokenBadge } : {}),
            },
          ];
        });
        applySnapshot(payload, { syncConversation: false });
      }
      if (shouldApply) {
        setSession((current) => ({ ...current, status: payload.metadata?.status || i18n.common.idle }));
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
              content: `${i18n.common.requestFailed}\n${error.message}`,
              timestamp: Date.now(),
            },
          ];
        });
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      }
    } finally {
      setPendingChatTurns((current) => {
        if (!current[entry.key]) {
          return current;
        }
        const next = { ...current };
        delete next[entry.key];
        return next;
      });
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

  const handleAddAttachments = async (fileList) => {
    const selectedFiles = Array.from(fileList || []).filter(Boolean);
    if (!selectedFiles.length) {
      return;
    }

    const nextAttachments = await Promise.all(
      selectedFiles.map(async (file) => {
        const baseAttachment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
        };

        if (isImageAttachment(file)) {
          const dataUrl = await readFileAsDataUrl(file);
          return {
            ...baseAttachment,
            kind: "image",
            dataUrl,
            previewUrl: dataUrl,
          };
        }

        if (isTextAttachment(file)) {
          const textContent = await readFileAsText(file);
          return {
            ...baseAttachment,
            kind: "text",
            textContent: textContent.slice(0, 120_000),
            truncated: textContent.length > 120_000,
          };
        }

        return {
          ...baseAttachment,
          kind: "file",
        };
      }),
    );

    setComposerAttachments((current) => [...current, ...nextAttachments]);
  };

  const handleRemoveAttachment = (attachmentId) => {
    setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

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
    };

    setPrompt("");
    setComposerAttachments([]);
    setPromptHistoryNavigation(null);
    setPromptHistoryByConversation((current) => appendPromptHistory(current, entry.key, content));

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
    await loadRuntime(nextSessionUser, { force: true }).catch(() => {});
    focusPrompt();
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

  const onThemeHotkey = useEffectEvent((event) => {
    const normalizedKey = event.key?.toLowerCase();
    const isThemeCombo = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey;
    if (!isThemeCombo || event.repeat || event.isComposing) {
      return;
    }

    const nextTheme =
      normalizedKey === "f" ? "system" : normalizedKey === "l" ? "light" : normalizedKey === "d" ? "dark" : null;
    if (!nextTheme) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setTheme(nextTheme);
  });

  const onPromptCharacterHotkey = useEffectEvent((event) => {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key !== " " && event.key.length !== 1) {
      return;
    }

    const textarea = promptRef.current;
    if (!textarea) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement === textarea || isEditableElement(activeElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextPrompt = `${prompt}${event.key}`;
    handlePromptChange(nextPrompt);
    window.requestAnimationFrame(() => {
      const nextTextarea = promptRef.current;
      if (!nextTextarea) {
        return;
      }
      nextTextarea.focus();
      const end = nextPrompt.length;
      nextTextarea.setSelectionRange(end, end);
    });
  });

  useEffect(() => {
    const listener = (event) => {
      onResetHotkey(event);
      onThemeHotkey(event);
      onPromptCharacterHotkey(event);
    };

    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  }, [onPromptCharacterHotkey, onResetHotkey, onThemeHotkey]);

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

  const handlePromptKeyDown = (event) => {
    const textarea = event.currentTarget;
    const history = promptHistoryByConversation[activeConversationKey] || [];
    const hasComposerAttachments = composerAttachments.length > 0;
    const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
    const caretAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
    const caretAtEnd =
      textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length;
    const canBrowseUp =
      event.key === "ArrowUp" &&
      history.length &&
      !hasSelection &&
      !hasComposerAttachments &&
      (!prompt || caretAtStart || promptHistoryNavigation);
    const canBrowseDown =
      event.key === "ArrowDown" &&
      history.length &&
      !hasSelection &&
      !hasComposerAttachments &&
      promptHistoryNavigation &&
      (caretAtEnd || !prompt);

    if (canBrowseUp || canBrowseDown) {
      event.preventDefault();

      if (!promptHistoryNavigation || promptHistoryNavigation.key !== activeConversationKey) {
        if (event.key === "ArrowUp") {
          const nextIndex = history.length - 1;
          setPromptHistoryNavigation({
            key: activeConversationKey,
            index: nextIndex,
            draft: prompt,
          });
          setPrompt(history[nextIndex] || "");
          window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
        }
        return;
      }

      if (event.key === "ArrowUp") {
        const nextIndex = Math.max(0, promptHistoryNavigation.index - 1);
        setPromptHistoryNavigation((current) => ({ ...current, index: nextIndex }));
        setPrompt(history[nextIndex] || "");
        window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
        return;
      }

      const nextIndex = promptHistoryNavigation.index + 1;
      if (nextIndex >= history.length) {
        setPrompt(promptHistoryNavigation.draft || "");
        setPromptHistoryNavigation(null);
        window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
        return;
      }

      setPromptHistoryNavigation((current) => ({ ...current, index: nextIndex }));
      setPrompt(history[nextIndex] || "");
      window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
      return;
    }

    const isPlainEnter = event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (isPlainEnter && !event.isComposing) {
      const normalizedPrompt = prompt.replace(/\r\n/g, "\n");
      const expectedValue = applyTextareaEnter(normalizedPrompt, textarea.selectionStart, textarea.selectionEnd);
      const now = Date.now();
      const isRapidRepeat =
        normalizedPrompt.includes("\n") &&
        lastPlainEnterRef.current.expectedValue === normalizedPrompt &&
        now - lastPlainEnterRef.current.timestamp <= rapidEnterSendThresholdMs;

      if (isRapidRepeat) {
        event.preventDefault();
        lastPlainEnterRef.current = { timestamp: 0, expectedValue: "" };
        handleSend();
        return;
      }

      lastPlainEnterRef.current = {
        timestamp: now,
        expectedValue,
      };
    }

    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handlePromptChange = (nextPrompt) => {
    setPrompt(nextPrompt);
    if (!promptHistoryNavigation) {
      if (nextPrompt.replace(/\r\n/g, "\n") !== lastPlainEnterRef.current.expectedValue) {
        lastPlainEnterRef.current = { timestamp: 0, expectedValue: "" };
      }
      return;
    }

    const history = promptHistoryByConversation[activeConversationKey] || [];
    const activeHistoryEntry = history[promptHistoryNavigation.index] || "";
    if (nextPrompt !== activeHistoryEntry) {
      setPromptHistoryNavigation(null);
    }
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
