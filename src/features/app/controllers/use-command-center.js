import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  appendPromptHistory,
  createAgentSessionUser,
  createAgentTabId,
  createResetSessionUser,
  createConversationKey,
  defaultChatFontSize,
  defaultComposerSendMode,
  defaultInspectorPanelWidth,
  defaultSessionUser,
  defaultTab,
  hasAuthoritativePendingAssistantReply,
  loadStoredChatScrollTops,
  loadPendingChatTurns,
  loadStoredPromptDrafts,
  loadStoredPromptHistory,
  loadStoredState,
  mergePendingConversation,
  pruneCompletedPendingChatTurns,
  persistUiStateSnapshot,
  persistChatScrollTops,
  sanitizeInspectorPanelWidth,
} from "@/features/app/storage";
import { createBaseSession } from "@/features/app/state";
import { useAppHotkeys } from "@/features/app/controllers/use-app-hotkeys";
import { useAppPersistence } from "@/features/app/storage";
import { formatCompactK, formatTime, maxPromptRows } from "@/features/chat/utils";
import { useChatController, usePromptHistory } from "@/features/chat/controllers";
import { useRuntimeSnapshot } from "@/features/session/runtime";
import { createResetImSessionUser, getImSessionDisplayName, isImSessionUser } from "@/features/session/im-session";
import { normalizeStatusKey } from "@/features/session/status-display";
import { useTheme } from "@/features/theme/use-theme";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

function areJsonEqual(left, right) {
  if (left === right) {
    return true;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function shouldReuseTabState(previous, next) {
  return areJsonEqual(previous, next);
}

function createTabMeta(tab, overrides = {}) {
  const canonicalAgentId = resolveAgentIdFromTabId(tab?.id) || tab?.agentId || "main";
  return {
    agentId: canonicalAgentId,
    sessionUser: tab?.sessionUser || defaultSessionUser,
    model: "",
    fastMode: false,
    thinkMode: "off",
    ...overrides,
  };
}

function createSessionForTab(messages, tab, meta, cachedSession = null) {
  if (cachedSession) {
    return cachedSession;
  }

  const canonicalAgentId = resolveAgentIdFromTabId(tab?.id) || meta?.agentId || tab?.agentId || "main";

  return createBaseSession(messages, {
    agentId: canonicalAgentId,
    selectedAgentId: canonicalAgentId,
    sessionUser: meta?.sessionUser || tab?.sessionUser || defaultSessionUser,
    thinkMode: meta?.thinkMode || "off",
    model: meta?.model || "",
    selectedModel: meta?.model || "",
    fastMode: meta?.fastMode ? messages.sessionOverview.fastMode.on : messages.sessionOverview.fastMode.off,
  });
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

function resolveAgentIdFromTabId(tabId = "") {
  const normalized = String(tabId || "").trim();
  if (!normalized.startsWith("agent:")) {
    return "main";
  }
  return normalized.slice("agent:".length).split("::")[0].trim() || "main";
}

function hashSessionUser(value = "") {
  const text = String(value || "").trim();
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36) || "session";
}

export function buildChatTabTitle(agentId = "main", sessionUser = "", options = {}) {
  const normalizedAgentId = String(agentId || "main").trim() || "main";
  const imLabel = getImSessionDisplayName(sessionUser, { locale: options.locale, shortWecom: true });
  if (imLabel) {
    return `${imLabel} ${normalizedAgentId}`;
  }
  return normalizedAgentId;
}

function createSessionScopedTabId(agentId = "main", sessionUser = "") {
  return `${createAgentTabId(agentId)}::${hashSessionUser(sessionUser)}`;
}

export function planSearchedSessionTabTarget({
  activeTabId = "",
  agentId = "main",
  chatTabs = [],
  sessionUser = "",
  locale = "zh",
} = {}) {
  const normalizedAgentId = String(agentId || "main").trim() || "main";
  const normalizedSessionUser = String(sessionUser || "").trim();
  const normalizedActiveTabId = String(activeTabId || "").trim();

  const existingTab = (chatTabs || []).find((tab) =>
    String(resolveAgentIdFromTabId(tab?.id) || tab?.agentId || "").trim() === normalizedAgentId
    && String(tab?.sessionUser || "").trim() === normalizedSessionUser,
  );
  if (existingTab?.id) {
    return {
      create: false,
      tabId: existingTab.id,
      title: buildChatTabTitle(normalizedAgentId, normalizedSessionUser, { locale }),
    };
  }

  if (isImSessionUser(normalizedSessionUser)) {
    return {
      create: true,
      tabId: createSessionScopedTabId(normalizedAgentId, normalizedSessionUser),
      title: buildChatTabTitle(normalizedAgentId, normalizedSessionUser, { locale }),
    };
  }

  return {
    create: false,
    tabId: normalizedActiveTabId,
    title: buildChatTabTitle(normalizedAgentId, normalizedSessionUser, { locale }),
  };
}

export function isChatTabBusy({
  tabId = "",
  sessionUser = "",
  activeChatTabId = "",
  sessionStatus = "",
  busyByTabId = {},
  messagesByTabId = {},
} = {}) {
  if (Boolean(busyByTabId?.[tabId]) || hasActiveAssistantReply(messagesByTabId?.[tabId] || [])) {
    return true;
  }

  return tabId === activeChatTabId
    && isImSessionUser(sessionUser)
    && ["running", "dispatching"].includes(normalizeStatusKey(sessionStatus));
}

function normalizeRuntimeIdentityValue(value = "") {
  return String(value || "").trim();
}

export function hasActiveAssistantReply(messages = []) {
  return (messages || []).some((message) => message?.role === "assistant" && (message?.pending || message?.streaming));
}

export function shouldApplyRuntimeSnapshotToTab({
  currentAgentId = "",
  currentSessionUser = "",
  requestedAgentId = "",
  requestedSessionUser = "",
  resolvedSessionUser = "",
} = {}) {
  const normalizedCurrentAgentId = normalizeRuntimeIdentityValue(currentAgentId);
  const normalizedCurrentSessionUser = normalizeRuntimeIdentityValue(currentSessionUser);
  const normalizedRequestedAgentId = normalizeRuntimeIdentityValue(requestedAgentId);
  const normalizedRequestedSessionUser = normalizeRuntimeIdentityValue(requestedSessionUser);
  const normalizedResolvedSessionUser = normalizeRuntimeIdentityValue(resolvedSessionUser);

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

function buildInitialChatTabs(stored) {
  if (Array.isArray(stored?.chatTabs) && stored.chatTabs.length) {
    return stored.chatTabs;
  }

  return [
    {
      id: createAgentTabId(stored?.agentId || "main"),
      agentId: stored?.agentId || "main",
      sessionUser: stored?.sessionUser || defaultSessionUser,
    },
  ];
}

function buildInitialTabMetaById(stored, chatTabs) {
  return Object.fromEntries(
    chatTabs.map((tab) => [
      tab.id,
      createTabMeta(tab, stored?.tabMetaById?.[tab.id] || {
        agentId: tab.agentId,
        sessionUser: tab.sessionUser,
        model: tab.agentId === (stored?.agentId || "main") ? stored?.model || "" : "",
        fastMode: tab.agentId === (stored?.agentId || "main") ? Boolean(stored?.fastMode) : false,
        thinkMode: tab.agentId === (stored?.agentId || "main") ? stored?.thinkMode || "off" : "off",
      }),
    ]),
  );
}

function buildInitialMessagesByTabId(stored, activeChatTabId) {
  if (stored?.messagesByTabId && typeof stored.messagesByTabId === "object") {
    return stored.messagesByTabId;
  }

  return {
    [activeChatTabId]: stored?.messages || [],
  };
}

function resolveViewportAnchorNode(viewport, selector, viewportRect) {
  if (!viewport || !selector) {
    return null;
  }

  const candidates = [...viewport.querySelectorAll(selector)];
  const visibleCandidates = candidates
    .map((node) => ({ node, rect: node.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1)
    .sort((left, right) => {
      const topDelta = Math.abs(left.rect.top - viewportRect.top) - Math.abs(right.rect.top - viewportRect.top);
      if (topDelta !== 0) {
        return topDelta;
      }
      return left.rect.top - right.rect.top;
    });

  return visibleCandidates[0]?.node || null;
}

export function getLatestUserMessageKey(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    return String(message?.id || `${message?.timestamp || "user"}-${index}`);
  }

  return "";
}

export function useCommandCenter({ userLabel = "marila" } = {}) {
  const { intlLocale, messages: i18n } = useI18n();
  const stored = useMemo(() => loadStoredState(), []);
  const storedChatScrollTops = useMemo(() => loadStoredChatScrollTops(), []);
  const storedPromptHistory = useMemo(() => loadStoredPromptHistory(), []);
  const rawStoredPendingChatTurns = useMemo(() => loadPendingChatTurns(), []);
  const initialChatTabs = useMemo(() => buildInitialChatTabs(stored), [stored]);
  const initialActiveChatTabId = useMemo(() => {
    const requested = String(stored?.activeChatTabId || "").trim();
    return initialChatTabs.some((tab) => tab.id === requested) ? requested : initialChatTabs[0]?.id || createAgentTabId("main");
  }, [initialChatTabs, stored]);
  const initialTabMetaById = useMemo(() => buildInitialTabMetaById(stored, initialChatTabs), [initialChatTabs, stored]);
  const initialMessagesByTabId = useMemo(
    () => buildInitialMessagesByTabId(stored, initialActiveChatTabId),
    [initialActiveChatTabId, stored],
  );
  const storedPendingChatTurns = useMemo(
    () => pruneCompletedPendingChatTurns(rawStoredPendingChatTurns, initialMessagesByTabId, initialTabMetaById),
    [initialMessagesByTabId, initialTabMetaById, rawStoredPendingChatTurns],
  );
  const initialHydratedMessagesByTabId = useMemo(
    () =>
      Object.fromEntries(
        initialChatTabs.map((tab) => {
          const meta = initialTabMetaById[tab.id] || createTabMeta(tab);
          const conversationKey = createConversationKey(meta.sessionUser, meta.agentId);
          const pendingEntry = storedPendingChatTurns[conversationKey] || null;
          const baseMessages = initialMessagesByTabId[tab.id] || [];

          return [
            tab.id,
            mergePendingConversation(
              baseMessages,
              pendingEntry,
              i18n.chat.thinkingPlaceholder,
              [],
            ),
          ];
        }),
      ),
    [i18n.chat.thinkingPlaceholder, initialChatTabs, initialMessagesByTabId, initialTabMetaById, storedPendingChatTurns],
  );
  const initialStoredMessagesByTabIdRef = useRef(initialHydratedMessagesByTabId);
  const initialStoredPendingRef = useRef(storedPendingChatTurns);
  const initialActiveTab = initialChatTabs.find((tab) => tab.id === initialActiveChatTabId) || initialChatTabs[0];
  const initialActiveMeta = initialTabMetaById[initialActiveChatTabId] || createTabMeta(initialActiveTab);
  const initialConversationKey = createConversationKey(initialActiveMeta.sessionUser, initialActiveMeta.agentId);
  const storedPromptDrafts = useMemo(() => stored?.promptDraftsByConversation || loadStoredPromptDrafts(), [stored]);
  const initialSessionByTabId = useMemo(
    () =>
      Object.fromEntries(
        initialChatTabs.map((tab) => [
          tab.id,
          createSessionForTab(i18n, tab, initialTabMetaById[tab.id]),
        ]),
      ),
    [i18n, initialChatTabs, initialTabMetaById],
  );
  const initialBusyByTabId = useMemo(
    () =>
      Object.fromEntries(
        initialChatTabs.map((tab) => {
          const meta = initialTabMetaById[tab.id] || createTabMeta(tab);
          const conversationKey = createConversationKey(meta.sessionUser, meta.agentId);
          const pendingEntry = storedPendingChatTurns[conversationKey];
          const localMessages = initialHydratedMessagesByTabId[tab.id] || [];
          return [tab.id, Boolean(pendingEntry) && !hasAuthoritativePendingAssistantReply(localMessages, pendingEntry)];
        }),
      ),
    [initialChatTabs, initialHydratedMessagesByTabId, initialTabMetaById, storedPendingChatTurns],
  );

  const [chatTabs, setChatTabs] = useState(initialChatTabs);
  const [activeChatTabId, setActiveChatTabId] = useState(initialActiveChatTabId);
  const [tabMetaById, setTabMetaById] = useState(initialTabMetaById);
  const [messagesByTabId, setMessagesByTabId] = useState(initialHydratedMessagesByTabId);
  const [sessionByTabId, setSessionByTabId] = useState(initialSessionByTabId);
  const [busyByTabId, setBusyByTabId] = useState(initialBusyByTabId);
  const [runtimeCacheByTabId, setRuntimeCacheByTabId] = useState({});
  const [promptHistoryByConversation, setPromptHistoryByConversation] = useState(storedPromptHistory);
  const [promptDraftsByConversation, setPromptDraftsByConversation] = useState(storedPromptDrafts);
  const [pendingChatTurns, setPendingChatTurns] = useState(storedPendingChatTurns);
  const [switchingAgentOverlay, setSwitchingAgentOverlay] = useState(null);
  const [switchingModelOverlay, setSwitchingModelOverlay] = useState(null);
  const [modelSwitchNotice, setModelSwitchNotice] = useState(null);
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(stored?.inspectorPanelWidth || defaultInspectorPanelWidth);
  const [chatFontSize, setChatFontSize] = useState(stored?.chatFontSize || defaultChatFontSize);
  const [composerSendMode, setComposerSendMode] = useState(stored?.composerSendMode || defaultComposerSendMode);
  const [dismissedTaskRelationshipIdsByConversation, setDismissedTaskRelationshipIdsByConversation] = useState(
    stored?.dismissedTaskRelationshipIdsByConversation || {},
  );
  const [focusMessageRequest, setFocusMessageRequest] = useState(null);
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [session, setSession] = useState(createSessionForTab(i18n, initialActiveTab, initialActiveMeta, initialSessionByTabId[initialActiveChatTabId]));
  const [messages, setMessages] = useState(initialHydratedMessagesByTabId[initialActiveChatTabId] || []);
  const [busy, setBusy] = useState(Boolean(initialBusyByTabId[initialActiveChatTabId]));
  const [model, setModel] = useState(initialActiveMeta.model || "");
  const [fastMode, setFastMode] = useState(Boolean(initialActiveMeta.fastMode));
  const [prompt, setPrompt] = useState(storedPromptDrafts[initialConversationKey] || "");
  const [promptSyncVersion, setPromptSyncVersion] = useState(0);
  const promptRef = useRef(null);
  const promptValueRef = useRef(storedPromptDrafts[initialConversationKey] || "");
  const promptDraftFlushTimeoutRef = useRef(0);
  const messageViewportRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const messagesRef = useRef(messages);
  const activeChatTabIdRef = useRef(activeChatTabId);
  const hydratingActiveTabRef = useRef(false);
  const latestUserMessageKeyRef = useRef(getLatestUserMessageKey(initialHydratedMessagesByTabId[initialActiveChatTabId] || []));
  const chatTabsRef = useRef(chatTabs);
  const tabMetaByIdRef = useRef(tabMetaById);
  const messagesByTabIdRef = useRef(messagesByTabId);
  const sessionByTabIdRef = useRef(sessionByTabId);
  const busyByTabIdRef = useRef(busyByTabId);
  const runtimeCacheByTabIdRef = useRef(runtimeCacheByTabId);
  const pendingChatTurnsRef = useRef(pendingChatTurns);
  const promptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const activeTabRef = useRef(activeTab);
  const inspectorPanelWidthRef = useRef(inspectorPanelWidth);
  const chatFontSizeRef = useRef(chatFontSize);
  const composerSendModeRef = useRef(composerSendMode);
  const promptHeightMetricsRef = useRef({ node: null, maxHeight: 0 });
  const promptHeightFrameRef = useRef(0);
  const dismissedTaskRelationshipIdsByConversationRef = useRef(dismissedTaskRelationshipIdsByConversation);
  const restoredPendingConversationKeysRef = useRef(new Set(Object.keys(storedPendingChatTurns || {})));
  const runtimeRequestByTabIdRef = useRef({});
  const sessionStateRef = useRef({
    sessionUser: initialActiveMeta.sessionUser,
    agentId: initialActiveMeta.agentId,
    model: initialActiveMeta.model || "",
    fastMode: Boolean(initialActiveMeta.fastMode),
    thinkMode: initialActiveMeta.thinkMode || "off",
  });
  const activeTargetRef = useRef({
    sessionUser: initialActiveMeta.sessionUser,
    agentId: initialActiveMeta.agentId,
  });
  const chatScrollTopByConversationRef = useRef(storedChatScrollTops);
  const [restoredChatScrollRevision, setRestoredChatScrollRevision] = useState(0);
  const localizedFormatTime = useMemo(() => (timestamp) => formatTime(timestamp, intlLocale), [intlLocale]);

  const persistOptimisticChatState = useCallback(({
    clearPendingKey = "",
    pendingEntry,
    tabId,
    nextMessages,
  }) => {
    const normalizedTabId = String(tabId || activeChatTabIdRef.current || "").trim();
    if (!normalizedTabId) {
      return;
    }

    const currentTabMeta = tabMetaByIdRef.current[normalizedTabId]
      || createTabMeta(chatTabsRef.current.find((tab) => tab.id === normalizedTabId));
    const nextMessagesByTabId = {
      ...messagesByTabIdRef.current,
      [normalizedTabId]: Array.isArray(nextMessages) ? nextMessages : (messagesByTabIdRef.current[normalizedTabId] || []),
    };
    const normalizedClearPendingKey = String(clearPendingKey || "").trim();
    let nextPendingChatTurns = pendingChatTurnsRef.current;

    if (normalizedClearPendingKey && nextPendingChatTurns[normalizedClearPendingKey]) {
      nextPendingChatTurns = { ...nextPendingChatTurns };
      delete nextPendingChatTurns[normalizedClearPendingKey];
    }

    if (pendingEntry) {
      nextPendingChatTurns = {
        ...nextPendingChatTurns,
        [pendingEntry.key]: pendingEntry,
      };
    }
    const activeTabId = activeChatTabIdRef.current || normalizedTabId;
    const activeMessages = nextMessagesByTabId[activeTabId] || [];
    const activeMeta = tabMetaByIdRef.current[activeTabId] || currentTabMeta;

    persistUiStateSnapshot({
      activeChatTabId: activeTabId,
      activeTab: activeTabRef.current,
      chatTabs: chatTabsRef.current,
      chatFontSize: chatFontSizeRef.current,
      composerSendMode: composerSendModeRef.current,
      dismissedTaskRelationshipIdsByConversation: dismissedTaskRelationshipIdsByConversationRef.current,
      fastMode: Boolean(activeMeta?.fastMode),
      inspectorPanelWidth: inspectorPanelWidthRef.current,
      thinkMode: activeMeta?.thinkMode || "off",
      model: activeMeta?.model || "",
      agentId: activeMeta?.agentId || "main",
      sessionUser: activeMeta?.sessionUser || defaultSessionUser,
      tabMetaById: tabMetaByIdRef.current,
      promptDraftsByConversation: promptDraftsByConversationRef.current,
      messages: activeMessages,
      messagesByTabId: nextMessagesByTabId,
      pendingChatTurns: nextPendingChatTurns,
    });
  }, []);

  const persistCurrentUiStateSnapshot = useCallback((overrides = {}) => {
    const activeTabId = activeChatTabIdRef.current || overrides.activeChatTabId || "";
    const activeMessages = overrides.messages || messagesByTabIdRef.current[activeTabId] || [];
    const activeMeta = tabMetaByIdRef.current[activeTabId]
      || createTabMeta(chatTabsRef.current.find((tab) => tab.id === activeTabId));

    persistUiStateSnapshot({
      activeChatTabId: activeTabId,
      activeTab: activeTabRef.current,
      chatTabs: chatTabsRef.current,
      chatFontSize: overrides.chatFontSize || chatFontSizeRef.current,
      composerSendMode: overrides.composerSendMode || composerSendModeRef.current,
      dismissedTaskRelationshipIdsByConversation: dismissedTaskRelationshipIdsByConversationRef.current,
      fastMode: Boolean(activeMeta?.fastMode),
      inspectorPanelWidth: inspectorPanelWidthRef.current,
      thinkMode: activeMeta?.thinkMode || "off",
      model: activeMeta?.model || "",
      agentId: activeMeta?.agentId || "main",
      sessionUser: activeMeta?.sessionUser || defaultSessionUser,
      tabMetaById: tabMetaByIdRef.current,
      promptDraftsByConversation: promptDraftsByConversationRef.current,
      messages: activeMessages,
      messagesByTabId: messagesByTabIdRef.current,
      pendingChatTurns: pendingChatTurnsRef.current,
      persistedAt: Date.now(),
    });
  }, []);

  const activeChatTab = useMemo(() => {
    if (activeChatTabId) {
      return chatTabs.find((tab) => tab.id === activeChatTabId) || null;
    }

    return chatTabs[0] || null;
  }, [activeChatTabId, chatTabs]);
  const activeTabMeta = useMemo(() => {
    if (!activeChatTab?.id) {
      return null;
    }
    return tabMetaById[activeChatTab.id] || null;
  }, [activeChatTab, tabMetaById]);
  const activeSessionUser = activeTabMeta?.sessionUser || session.sessionUser;
  const activeAgentId = activeTabMeta?.agentId || session.agentId;
  const activeIdentityRef = useRef({ agentId: activeAgentId, sessionUser: activeSessionUser });
  activeIdentityRef.current = { agentId: activeAgentId, sessionUser: activeSessionUser };
  const getActiveIdentity = useCallback(() => activeIdentityRef.current, []);
  const activeConversationKey = createConversationKey(activeSessionUser, activeAgentId);
  const activePendingChat = pendingChatTurns[activeConversationKey] || null;
  const activePendingWasRestored = Boolean(
    activePendingChat && restoredPendingConversationKeysRef.current.has(activeConversationKey),
  );
  const activeChatFontSize = chatFontSize;
  const dismissedTaskRelationshipIds = dismissedTaskRelationshipIdsByConversation[activeConversationKey] || [];
  const setActiveTarget = useCallback((value) => {
    activeTargetRef.current = value;
  }, []);

  const invalidateRuntimeRequestForTab = useCallback((tabId) => {
    const normalizedTabId = String(tabId || "").trim();
    if (!normalizedTabId) {
      return;
    }

    runtimeRequestByTabIdRef.current = {
      ...runtimeRequestByTabIdRef.current,
      [normalizedTabId]: (runtimeRequestByTabIdRef.current[normalizedTabId] || 0) + 1,
    };
  }, []);

  useEffect(() => {
    runtimeCacheByTabIdRef.current = runtimeCacheByTabId;
  }, [runtimeCacheByTabId]);

  const setMessagesForTab = useCallback((tabId, value) => {
    setMessagesByTabId((current) => {
      const previous = current[tabId] || [];
      const next = typeof value === "function" ? value(previous) : value;

      if (current[tabId] === next || shouldReuseTabState(previous, next)) {
        return current;
      }

      const updated = {
        ...current,
        [tabId]: next,
      };
      messagesByTabIdRef.current = updated;

      if (activeChatTabIdRef.current === tabId) {
        messagesRef.current = next;
        setMessages(next);
      }

      return updated;
    });
  }, []);

  const setMessagesSynced = useCallback((value) => {
    if (!activeChatTabIdRef.current) {
      return;
    }
    setMessagesForTab(activeChatTabIdRef.current, value);
  }, [setMessagesForTab]);

  const setBusyForTab = useCallback((tabId, value) => {
    setBusyByTabId((current) => {
      const previous = Boolean(current[tabId]);
      const next = typeof value === "function" ? Boolean(value(previous)) : Boolean(value);
      if (previous === next) {
        return current;
      }

      const updated = {
        ...current,
        [tabId]: next,
      };
      busyByTabIdRef.current = updated;

      if (activeChatTabIdRef.current === tabId) {
        setBusy(next);
      }

      return updated;
    });
  }, []);

  const updateTabSession = useCallback((tabId, value) => {
    setSessionByTabId((current) => {
      const tab = chatTabsRef.current.find((entry) => entry.id === tabId) || {
        id: tabId,
        agentId: tabMetaByIdRef.current[tabId]?.agentId || "main",
        sessionUser: tabMetaByIdRef.current[tabId]?.sessionUser || defaultSessionUser,
      };
      const meta = tabMetaByIdRef.current[tabId] || createTabMeta(tab);
      const previous = current[tabId] || createSessionForTab(i18n, tab, meta);
      const next = typeof value === "function" ? value(previous) : value;

      if (current[tabId] === next || shouldReuseTabState(previous, next)) {
        return current;
      }

      const updated = {
        ...current,
        [tabId]: next,
      };
      sessionByTabIdRef.current = updated;

      if (activeChatTabIdRef.current === tabId) {
        setSession(next);
      }

      return updated;
    });
  }, [i18n]);

  const updateTabMeta = useCallback((tabId, value) => {
    setTabMetaById((current) => {
      const tab = chatTabsRef.current.find((entry) => entry.id === tabId) || {
        id: tabId,
        agentId: "main",
        sessionUser: defaultSessionUser,
      };
      const previous = current[tabId] || createTabMeta(tab);
      const next = typeof value === "function" ? value(previous) : { ...previous, ...value };

      if (
        previous.agentId === next.agentId
        && previous.sessionUser === next.sessionUser
        && previous.model === next.model
        && previous.fastMode === next.fastMode
        && previous.thinkMode === next.thinkMode
        && previous.title === next.title
      ) {
        return current;
      }

      const updated = {
        ...current,
        [tabId]: next,
      };
      tabMetaByIdRef.current = updated;

      if (activeChatTabIdRef.current === tabId) {
        setModel(next.model || "");
        setFastMode(Boolean(next.fastMode));
      }

      return updated;
    });
  }, []);

  const updateTabIdentity = useCallback((tabId, nextIdentity = {}) => {
    setChatTabs((current) => {
      const updated = current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              ...(nextIdentity.agentId ? { agentId: nextIdentity.agentId } : {}),
              ...(nextIdentity.sessionUser ? { sessionUser: nextIdentity.sessionUser } : {}),
            }
          : tab,
      );
      chatTabsRef.current = updated;
      return updated;
    });
  }, []);

  const getMessagesForTab = useCallback((tabId) => messagesByTabIdRef.current[tabId] || [], []);
  const isTabActive = useCallback((tabId) => activeChatTabIdRef.current === tabId, []);

  const {
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
    snapshots,
    taskRelationships,
    taskTimeline,
    updateSessionSettings,
  } = useRuntimeSnapshot({
    activePendingChat,
    busy,
    fastMode,
    i18n,
    messagesRef,
    pendingChatTurns,
    recoveringPendingReply: activePendingWasRestored,
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
    clearQueuedEntries,
    composerAttachments,
    enqueueOrRunEntry,
    handleAddAttachments,
    handleRemoveAttachment,
    handleStop,
    removeQueuedEntry,
    setComposerAttachments,
    setQueuedMessages,
  } = useChatController({
    activateStopOverride,
    activeChatTabId,
    activeConversationKey,
    applySnapshot,
    busyByTabId,
    getActiveIdentity,
    getMessagesForTab,
    i18n,
    isTabActive,
    persistOptimisticChatState,
    setBusyForTab,
    setMessagesForTab,
    setPendingChatTurns,
    invalidateRuntimeRequestForTab,
    userLabel,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  });

  useEffect(() => {
    if (!busy || session.status === i18n.common.running) {
      return;
    }
    setSession((current) => ({ ...current, status: i18n.common.running }));
  }, [busy, i18n.common.running, session.status]);

  const focusPrompt = useCallback(() => {
    window.requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;
      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      const end = textarea.value.length;
      if (
        end > 0 &&
        (textarea.selectionStart !== end || textarea.selectionEnd !== end)
      ) {
        textarea.setSelectionRange(end, end);
      }
    });
  }, []);

  const resolvePromptMaxHeight = useCallback((textarea) => {
    const cached = promptHeightMetricsRef.current;
    if (cached.node === textarea && cached.maxHeight > 0) {
      return cached.maxHeight;
    }

    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const maxHeight = lineHeight * maxPromptRows + paddingTop + paddingBottom + borderTop + borderBottom;

    promptHeightMetricsRef.current = { node: textarea, maxHeight };
    return maxHeight;
  }, []);

  const adjustPromptHeight = useCallback(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    if (!String(textarea.value || "")) {
      textarea.style.height = "";
      textarea.style.overflowY = "hidden";
      return;
    }
    const maxHeight = resolvePromptMaxHeight(textarea);

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }, [resolvePromptMaxHeight]);

  const schedulePromptHeightAdjustment = useCallback(() => {
    window.cancelAnimationFrame(promptHeightFrameRef.current);
    promptHeightFrameRef.current = window.requestAnimationFrame(() => {
      promptHeightFrameRef.current = 0;
      adjustPromptHeight();
    });
  }, [adjustPromptHeight]);

  const flushPromptDraftsState = useCallback(() => {
    window.clearTimeout(promptDraftFlushTimeoutRef.current);
    promptDraftFlushTimeoutRef.current = 0;
    setPromptDraftsByConversation((current) => (
      current === promptDraftsByConversationRef.current ? current : promptDraftsByConversationRef.current
    ));
  }, []);

  const schedulePromptDraftsStateFlush = useCallback((delayMs = 180) => {
    window.clearTimeout(promptDraftFlushTimeoutRef.current);
    promptDraftFlushTimeoutRef.current = window.setTimeout(() => {
      flushPromptDraftsState();
    }, delayMs);
  }, [flushPromptDraftsState]);

  const setPromptForConversation = useCallback((value, conversationKey = activeConversationKey, options = {}) => {
    const { flushDrafts = false, syncVisible = true } = options;
    const normalizedConversationKey = String(conversationKey || activeConversationKey || "").trim();
    const currentPromptValue =
      normalizedConversationKey === activeConversationKey
        ? promptValueRef.current
        : (promptDraftsByConversationRef.current[normalizedConversationKey] || "");
    const next = typeof value === "function" ? value(currentPromptValue) : value;
    const normalized = typeof next === "string" ? next : String(next || "");

    if (normalizedConversationKey === activeConversationKey) {
      promptValueRef.current = normalized;
      if (syncVisible) {
        setPrompt((current) => (current === normalized ? current : normalized));
        if (prompt === normalized) {
          setPromptSyncVersion((current) => current + 1);
        }
      }
    }

    const drafts = promptDraftsByConversationRef.current;
    let nextDrafts = drafts;

    if (!normalized) {
      if (Object.prototype.hasOwnProperty.call(drafts, normalizedConversationKey)) {
        nextDrafts = { ...drafts };
        delete nextDrafts[normalizedConversationKey];
      }
    } else if (drafts[normalizedConversationKey] !== normalized) {
      nextDrafts = {
        ...drafts,
        [normalizedConversationKey]: normalized,
      };
    }

    if (nextDrafts !== drafts) {
      promptDraftsByConversationRef.current = nextDrafts;
      if (flushDrafts) {
        flushPromptDraftsState();
      } else {
        schedulePromptDraftsStateFlush();
      }
    }

    return normalized;
  }, [activeConversationKey, flushPromptDraftsState, prompt, schedulePromptDraftsStateFlush]);

  const persistConversationScrollTop = useCallback((conversationKey, scrollTop) => {
    const normalizedKey = String(conversationKey || "").trim();
    const normalizedTop = Math.max(0, Math.round(Number(scrollTop) || 0));
    if (!normalizedKey) {
      return;
    }

    const viewport = messageViewportRef.current;
    const viewportRect = viewport?.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0 };
    const viewportTop = viewportRect.top || 0;
    const blockAnchorNode = viewport
      ? resolveViewportAnchorNode(viewport, "[data-scroll-anchor-id]", viewportRect)
      : null;
    const messageAnchorNode = viewport
      ? resolveViewportAnchorNode(viewport, "[data-message-id]", viewportRect)
      : null;
    const anchorNodeId = String(blockAnchorNode?.getAttribute?.("data-scroll-anchor-id") || "").trim();
    const anchorMessageId = String(messageAnchorNode?.getAttribute?.("data-message-id") || "").trim();
    const anchorBasisNode = blockAnchorNode || messageAnchorNode;
    const anchorOffset = anchorBasisNode ? Math.round(anchorBasisNode.getBoundingClientRect().top - viewportTop) : 0;
    const distanceFromBottom = viewport
      ? Math.max(0, viewport.scrollHeight - normalizedTop - viewport.clientHeight)
      : 0;
    const atBottom = distanceFromBottom <= 48;
    const nextState = {
      scrollTop: normalizedTop,
      ...(atBottom ? { atBottom: true } : {}),
      ...(anchorNodeId ? { anchorNodeId } : {}),
      ...(anchorMessageId ? { anchorMessageId, anchorOffset } : {}),
      ...(anchorNodeId ? { anchorOffset } : {}),
    };

    const current = chatScrollTopByConversationRef.current;
    if (JSON.stringify(current[normalizedKey] || null) === JSON.stringify(nextState)) {
      return;
    }

    const next = {
      ...current,
      [normalizedKey]: nextState,
    };
    chatScrollTopByConversationRef.current = next;
    persistChatScrollTops(next);
  }, []);

  const flushVisibleConversationScrollTop = useCallback(() => {
    const viewport = messageViewportRef.current;
    const currentSessionUser = String(sessionStateRef.current.sessionUser || "").trim();
    const currentAgentId = String(sessionStateRef.current.agentId || "main").trim() || "main";

    if (!viewport || !currentSessionUser) {
      return;
    }

    persistConversationScrollTop(
      createConversationKey(currentSessionUser, currentAgentId),
      viewport.scrollTop,
    );
  }, [persistConversationScrollTop]);

  useEffect(() => {
    activeChatTabIdRef.current = activeChatTabId;
  }, [activeChatTabId]);

  useEffect(() => {
    chatTabsRef.current = chatTabs;
  }, [chatTabs]);

  useEffect(() => {
    tabMetaByIdRef.current = tabMetaById;
  }, [tabMetaById]);

  useEffect(() => {
    messagesByTabIdRef.current = messagesByTabId;
  }, [messagesByTabId]);

  useEffect(() => {
    sessionByTabIdRef.current = sessionByTabId;
  }, [sessionByTabId]);

  useEffect(() => {
    busyByTabIdRef.current = busyByTabId;
  }, [busyByTabId]);

  useEffect(() => {
    pendingChatTurnsRef.current = pendingChatTurns;
  }, [pendingChatTurns]);

  useEffect(() => {
    const restoredKeys = restoredPendingConversationKeysRef.current;
    if (!restoredKeys.size) {
      return;
    }

    for (const key of [...restoredKeys]) {
      if (!pendingChatTurns[key]) {
        restoredKeys.delete(key);
      }
    }
  }, [pendingChatTurns]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    inspectorPanelWidthRef.current = inspectorPanelWidth;
  }, [inspectorPanelWidth]);

  useEffect(() => {
    chatFontSizeRef.current = chatFontSize;
  }, [chatFontSize]);

  useEffect(() => {
    composerSendModeRef.current = composerSendMode;
  }, [composerSendMode]);

  useEffect(() => {
    dismissedTaskRelationshipIdsByConversationRef.current = dismissedTaskRelationshipIdsByConversation;
  }, [dismissedTaskRelationshipIdsByConversation]);

  useEffect(() => {
    schedulePromptHeightAdjustment();
    return () => window.cancelAnimationFrame(promptHeightFrameRef.current);
  }, [prompt, schedulePromptHeightAdjustment]);

  useEffect(() => () => {
    window.clearTimeout(promptDraftFlushTimeoutRef.current);
  }, []);

  useEffect(() => {
    const resetPromptHeightMetrics = () => {
      promptHeightMetricsRef.current = { node: promptRef.current, maxHeight: 0 };
      schedulePromptHeightAdjustment();
    };

    window.addEventListener("resize", resetPromptHeightMetrics);
    return () => window.removeEventListener("resize", resetPromptHeightMetrics);
  }, [schedulePromptHeightAdjustment]);

  useEffect(() => {
    focusPrompt();
  }, [focusPrompt]);

  useEffect(() => {
    if (!activeChatTab) {
      return;
    }

    hydratingActiveTabRef.current = true;

    const nextMeta = tabMetaByIdRef.current[activeChatTab.id] || createTabMeta(activeChatTab);
    const nextSession =
      sessionByTabIdRef.current[activeChatTab.id]
      || createSessionForTab(i18n, activeChatTab, nextMeta);
    const nextMessages = messagesByTabIdRef.current[activeChatTab.id] || [];
    const nextBusy = Boolean(busyByTabIdRef.current[activeChatTab.id]);

    messagesRef.current = nextMessages;
    setSession(nextSession);
    setMessages(nextMessages);
    setBusy(nextBusy);
    setModel(nextMeta.model || nextSession.selectedModel || "");
    setFastMode(Boolean(nextMeta.fastMode));
    setFocusMessageRequest(null);
    sessionStateRef.current = {
      sessionUser: nextMeta.sessionUser || nextSession.sessionUser,
      agentId: nextMeta.agentId || nextSession.agentId,
      model: nextMeta.model || nextSession.selectedModel || "",
      fastMode: Boolean(nextMeta.fastMode),
      thinkMode: nextMeta.thinkMode || nextSession.thinkMode || "off",
    };
    setActiveTarget({
      sessionUser: nextMeta.sessionUser || nextSession.sessionUser,
      agentId: nextMeta.agentId || nextSession.agentId,
    });
    hydrateRuntimeState(runtimeCacheByTabIdRef.current[activeChatTab.id] || null);
  }, [activeChatTab, activeChatTabId, hydrateRuntimeState, i18n, setActiveTarget]);

  useEffect(() => {
    const nextPrompt = promptDraftsByConversationRef.current[activeConversationKey] || "";
    promptValueRef.current = nextPrompt;
    setPrompt(nextPrompt);
  }, [activeConversationKey]);

  useEffect(() => {
    setMessagesByTabId((current) => {
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(current).map(([tabId, items]) => {
          const updatedItems = (items || []).map((message) =>
            message?.pending
              ? {
                  ...message,
                  content: i18n.chat.thinkingPlaceholder,
                }
              : message,
          );
          if (!changed && updatedItems.some((message, index) => message !== items[index])) {
            changed = true;
          }
          return [tabId, updatedItems];
        }),
      );

      if (!changed) {
        return current;
      }

      messagesByTabIdRef.current = next;
      const activeMessages = next[activeChatTabIdRef.current] || [];
      messagesRef.current = activeMessages;
      setMessages(activeMessages);
      return next;
    });
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
  }, [session.agentId, session.sessionUser, setActiveTarget]);

  useEffect(() => {
    if (!activeChatTab?.id) {
      return;
    }

    if (activePendingChat && hasAuthoritativePendingAssistantReply(messages, activePendingChat)) {
      setPendingChatTurns((current) => {
        if (!current[activeConversationKey]) {
          return current;
        }
        const next = { ...current };
        delete next[activeConversationKey];
        return next;
      });
      setBusyForTab(activeChatTab.id, false);
      return;
    }

    if (!activePendingChat && !messages.some((message) => message?.pending || message?.streaming) && busyByTabIdRef.current[activeChatTab.id]) {
      setBusyForTab(activeChatTab.id, false);
    }
  }, [activeChatTab, activeConversationKey, activePendingChat, messages, setBusyForTab, setPendingChatTurns]);

  useEffect(() => {
    if (!activeChatTab) {
      return;
    }
    if (hydratingActiveTabRef.current) {
      return;
    }

    const activeTabAgentId = resolveAgentIdFromTabId(activeChatTab.id) || activeChatTab.agentId;
    if (activeTabAgentId !== session.agentId) {
      return;
    }

    setChatTabs((current) => {
      let changed = false;
      const updated = current.map((tab) => {
        if (tab.id !== activeChatTab.id) {
          return tab;
        }

        const nextAgentId = resolveAgentIdFromTabId(tab.id) || tab.agentId;
        const nextSessionUser = session.sessionUser || tab.sessionUser;
        if (tab.agentId === nextAgentId && tab.sessionUser === nextSessionUser) {
          return tab;
        }

        changed = true;
        return {
          ...tab,
          agentId: nextAgentId,
          sessionUser: nextSessionUser,
        };
      });

      if (!changed) {
        return current;
      }

      chatTabsRef.current = updated;
      return updated;
    });
    updateTabMeta(activeChatTab.id, {
      agentId: resolveAgentIdFromTabId(activeChatTab.id) || session.agentId,
      fastMode,
      model,
      sessionUser: session.sessionUser,
      thinkMode: session.thinkMode || "off",
    });
    updateTabSession(activeChatTab.id, session);
  }, [activeChatTab, fastMode, model, session, updateTabMeta, updateTabSession]);

  useEffect(() => {
    hydratingActiveTabRef.current = false;
  }, [activeChatTabId, messages, model, session.agentId, session.sessionUser]);

  useEffect(() => {
    if (!modelSwitchNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setModelSwitchNotice(null);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [modelSwitchNotice]);

  useEffect(() => {
    if (!activeChatTabId) {
      return;
    }

    setRuntimeCacheByTabId((current) => {
      const previous = current[activeChatTabId];
      if (
        previous
        && previous.agents === agents
        && previous.artifacts === artifacts
        && previous.availableAgents === availableAgents
        && previous.availableModels === availableModels
        && previous.files === files
        && previous.peeks === peeks
        && previous.snapshots === snapshots
        && previous.taskRelationships === taskRelationships
        && previous.taskTimeline === taskTimeline
      ) {
        return current;
      }

      return {
        ...current,
        [activeChatTabId]: {
          agents,
          artifacts,
          availableAgents,
          availableModels,
          files,
          peeks,
          snapshots,
          taskRelationships,
          taskTimeline,
        },
      };
    });
  }, [activeChatTabId, agents, artifacts, availableAgents, availableModels, files, peeks, snapshots, taskRelationships, taskTimeline]);

  useEffect(() => {
    const backgroundTabs = chatTabs.filter((tab) => tab.id !== activeChatTabId && isImSessionUser(tab.sessionUser));
    if (!backgroundTabs.length) {
      return undefined;
    }

    let cancelled = false;

    const syncTabRuntime = async (tab) => {
      const tabId = String(tab?.id || "").trim();
      const sessionUser = String(tab?.sessionUser || "").trim();
      const agentId = String(resolveAgentIdFromTabId(tabId) || tab?.agentId || "main").trim() || "main";

      if (!tabId || !sessionUser) {
        return;
      }

      try {
        const params = new URLSearchParams({
          sessionUser,
          agentId,
        });
        const response = await apiFetch(`/api/runtime?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok || !payload.ok || cancelled) {
          return;
        }

        const snapshotSession = payload.session || {};
        const normalizedStatus = normalizeStatusKey(snapshotSession.status);
        const nextFastMode =
          snapshotSession.fastMode === i18n.sessionOverview.fastMode.on
          || snapshotSession.fastMode === "开启"
          || snapshotSession.fastMode === true
          || payload.fastMode === true;

        setRuntimeCacheByTabId((current) => {
          const previous = current[tabId] || {};
          const nextCache = {
            agents: payload.agents || [],
            artifacts: payload.artifacts || [],
            availableAgents: snapshotSession.availableAgents || payload.availableAgents || [],
            availableModels: snapshotSession.availableModels || payload.availableModels || [],
            files: payload.files || [],
            peeks: payload.peeks || { workspace: null, terminal: null, browser: null, environment: null },
            snapshots: payload.snapshots || [],
            taskRelationships: payload.taskRelationships || [],
            taskTimeline: payload.taskTimeline || [],
          };

          if (shouldReuseTabState(previous, nextCache)) {
            return current;
          }

          return {
            ...current,
            [tabId]: nextCache,
          };
        });

        updateTabMeta(tabId, (current) => ({
          ...current,
          agentId: snapshotSession.agentId || current.agentId || agentId,
          sessionUser: snapshotSession.sessionUser || current.sessionUser || sessionUser,
          model: snapshotSession.selectedModel || payload.model || current.model || "",
          fastMode: nextFastMode,
          thinkMode: snapshotSession.thinkMode || current.thinkMode || "off",
        }));

        updateTabSession(tabId, (current) => ({
          ...current,
          ...snapshotSession,
          agentId: snapshotSession.agentId || current.agentId || agentId,
          selectedAgentId: snapshotSession.agentId || current.selectedAgentId || agentId,
          sessionUser: snapshotSession.sessionUser || current.sessionUser || sessionUser,
          mode: snapshotSession.mode || current.mode,
        }));

        setBusyForTab(tabId, normalizedStatus === "running" || normalizedStatus === "dispatching");
      } catch {
        // Keep background sync best-effort so a stale DingTalk tab never interrupts the active session.
      }
    };

    const syncAllBackgroundTabs = () => {
      backgroundTabs.forEach((tab) => {
        syncTabRuntime(tab);
      });
    };

    syncAllBackgroundTabs();
    const intervalId = window.setInterval(syncAllBackgroundTabs, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeChatTabId,
    chatTabs,
    i18n.sessionOverview.fastMode.on,
    setBusyForTab,
    updateTabMeta,
    updateTabSession,
  ]);

  const sendCurrentPrompt = async () => {
    const content = String(promptRef.current?.value || promptValueRef.current || "").trim();
    const attachments = composerAttachments;
    if (!content && !attachments.length) return;
    shouldAutoScrollRef.current = true;
    const targetTabId = activeChatTab?.id || activeChatTabId || activeChatTabIdRef.current;
    const targetTab = chatTabsRef.current.find((tab) => tab.id === targetTabId) || activeChatTab;
    const targetMeta = (targetTabId && tabMetaByIdRef.current[targetTabId]) || null;
    const targetSession = (targetTabId && sessionByTabIdRef.current[targetTabId]) || null;
    const isActiveTargetTab = targetTabId === activeChatTabIdRef.current;
    const targetAgentId =
      targetMeta?.agentId
      || targetSession?.agentId
      || targetTab?.agentId
      || (isActiveTargetTab ? session.agentId : "")
      || sessionStateRef.current.agentId;
    const rawTargetSessionUser =
      targetMeta?.sessionUser
      || targetSession?.sessionUser
      || targetTab?.sessionUser
      || (isActiveTargetTab ? session.sessionUser : "")
      || sessionStateRef.current.sessionUser;
    const targetSessionUser =
      targetAgentId && targetAgentId !== "main" && rawTargetSessionUser === defaultSessionUser
        ? createAgentSessionUser(targetAgentId)
        : rawTargetSessionUser;
    const targetModel =
      targetMeta?.model
      || targetSession?.selectedModel
      || targetSession?.model
      || (isActiveTargetTab ? model : "")
      || sessionStateRef.current.model;
    const targetFastMode =
      typeof targetMeta?.fastMode === "boolean"
        ? targetMeta.fastMode
        : isActiveTargetTab
          ? fastMode
          : sessionStateRef.current.fastMode;
    const targetThinkMode =
      targetMeta?.thinkMode
      || targetSession?.thinkMode
      || (isActiveTargetTab ? session.thinkMode || "off" : "")
      || sessionStateRef.current.thinkMode;

    const entryTimestamp = Date.now();
    const entryId = `${entryTimestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id: entryId,
      tabId: targetTabId,
      key: `${targetSessionUser}:${targetAgentId}`,
      content,
      attachments,
      timestamp: entryTimestamp,
      userMessageId: `msg-user-${entryId}`,
      agentId: targetAgentId,
      sessionUser: targetSessionUser,
      model: targetModel,
      fastMode: targetFastMode,
      thinkMode: targetThinkMode,
    };

    setPromptForConversation("", activeConversationKey, { flushDrafts: true, syncVisible: true });
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
    composerSendMode,
    composerAttachments,
    handleSend: sendCurrentPrompt,
    promptHistoryByConversation,
    promptRef,
    setPrompt: (value) => setPromptForConversation(value, activeConversationKey, { flushDrafts: true, syncVisible: true }),
    syncPromptInput: (value) => setPromptForConversation(value, activeConversationKey, { syncVisible: true }),
  });

  useEffect(() => {
    setPromptHistoryNavigation(null);
    setComposerAttachments([]);
  }, [activeConversationKey, setComposerAttachments, setPromptHistoryNavigation]);

  useAppPersistence({
    activeChatTabId,
    activeTab,
    chatFontSize,
    composerSendMode,
    chatTabs,
    dismissedTaskRelationshipIdsByConversation,
    fastMode,
    initialStoredMessagesByTabIdRef,
    initialStoredPendingRef,
    inspectorPanelWidth,
    messages,
    messagesByTabId,
    messagesRef,
    model,
    pendingChatTurns,
    promptDraftsByConversation,
    promptDraftsByConversationRef,
    promptHistoryByConversation,
    session,
    setMessagesByTabId,
    setMessagesSynced,
    setPendingChatTurns,
    tabMetaById,
  });

  const handleChatFontSizeChange = (nextSize) => {
    if (!["small", "medium", "large"].includes(nextSize)) {
      return;
    }

    if (chatFontSizeRef.current === nextSize) {
      return;
    }

    const viewport = messageViewportRef.current;
    if (viewport) {
      persistConversationScrollTop(activeConversationKey, viewport.scrollTop);
    }

    chatFontSizeRef.current = nextSize;
    persistCurrentUiStateSnapshot({ chatFontSize: nextSize });
    setChatFontSize(nextSize);
    setRestoredChatScrollRevision((current) => current + 1);
  };

  const handleComposerSendModeToggle = useCallback(() => {
    const nextMode = composerSendModeRef.current === "enter-send" ? "double-enter-send" : "enter-send";
    composerSendModeRef.current = nextMode;
    resetRapidEnterState();
    persistCurrentUiStateSnapshot({ composerSendMode: nextMode });
    setComposerSendMode(nextMode);
  }, [persistCurrentUiStateSnapshot, resetRapidEnterState]);

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

  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    const latestUserMessageKey = getLatestUserMessageKey(messages);
    const hasNewUserTurn = Boolean(latestUserMessageKey) && latestUserMessageKey !== latestUserMessageKeyRef.current;
    latestUserMessageKeyRef.current = latestUserMessageKey;

    if (viewport && shouldAutoScrollRef.current && hasNewUserTurn) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, activeQueuedMessages]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;

    const bottomSentinel = viewport.querySelector("[data-message-bottom-sentinel]");
    const IntersectionObserverCtor = window.IntersectionObserver || globalThis.IntersectionObserver;
    const syncAutoScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom <= 48;
    };

    const persistScrollPosition = () => {
      persistConversationScrollTop(activeConversationKey, viewport.scrollTop);
    };

    let removeAutoScrollSync = null;
    let bottomObserver = null;

    syncAutoScroll();
    if (IntersectionObserverCtor && bottomSentinel) {
      bottomObserver = new IntersectionObserverCtor(
        (entries) => {
          const entry = entries.find((candidate) => candidate.target === bottomSentinel) || entries[0];
          shouldAutoScrollRef.current = Boolean(entry?.isIntersecting || entry?.intersectionRatio > 0);
        },
        {
          root: viewport,
          rootMargin: "0px 0px 48px 0px",
          threshold: 0,
        },
      );
      bottomObserver.observe(bottomSentinel);
    } else {
      viewport.addEventListener("scroll", syncAutoScroll, { passive: true });
      removeAutoScrollSync = () => viewport.removeEventListener("scroll", syncAutoScroll);
    }

    viewport.addEventListener("scroll", persistScrollPosition, { passive: true });
    return () => {
      bottomObserver?.disconnect?.();
      removeAutoScrollSync?.();
      viewport.removeEventListener("scroll", persistScrollPosition);
    };
  }, [activeConversationKey, persistConversationScrollTop]);

  useEffect(() => {
    const flushConversationScrollTop = () => {
      const viewport = messageViewportRef.current;
      if (!viewport) {
        return;
      }

      persistConversationScrollTop(activeConversationKey, viewport.scrollTop);
    };

    window.addEventListener("pagehide", flushConversationScrollTop);
    return () => {
      flushConversationScrollTop();
      window.removeEventListener("pagehide", flushConversationScrollTop);
    };
  }, [activeConversationKey, persistConversationScrollTop]);

  const handleSend = sendCurrentPrompt;
  const handleRemoveQueuedMessage = removeQueuedEntry;
  const handleClearQueuedMessages = clearQueuedEntries;

  const handleReset = async () => {
    const currentSessionUser = String(sessionStateRef.current.sessionUser || "").trim();
    const nextSessionUser = isImSessionUser(currentSessionUser)
      ? createResetImSessionUser(currentSessionUser)
      : createResetSessionUser(sessionStateRef.current.agentId);
    const nextAgentId = sessionStateRef.current.agentId;
    const nextModel = sessionStateRef.current.model;
    const previousConversationKey = createConversationKey(currentSessionUser, nextAgentId);
    const activeTabId = activeChatTabIdRef.current;

    setMessagesSynced([]);
    setQueuedMessages((current) => current.filter((item) => item.tabId !== activeChatTabIdRef.current));
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
    if (activeTabId) {
      setRuntimeCacheByTabId((current) => {
        if (!current[activeTabId]) {
          return current;
        }
        const next = { ...current };
        delete next[activeTabId];
        runtimeCacheByTabIdRef.current = next;
        return next;
      });
    }
    sessionStateRef.current = {
      ...sessionStateRef.current,
      sessionUser: nextSessionUser,
      agentId: nextAgentId,
      model: nextModel,
    };
    if (activeTabId) {
      updateTabIdentity(activeTabId, { sessionUser: nextSessionUser });
      updateTabMeta(activeTabId, {
        agentId: nextAgentId,
        sessionUser: nextSessionUser,
        model: nextModel,
      });
      updateTabSession(activeTabId, (current) => ({
        ...current,
        agentId: nextAgentId,
        selectedAgentId: nextAgentId,
        sessionUser: nextSessionUser,
        model: nextModel || current.model,
        selectedModel: nextModel || current.selectedModel,
      }));
    }
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
    await loadRuntime(nextSessionUser, {
      agentId: nextAgentId,
    }).catch(() => {});
    focusPrompt();
  };

  const applySessionUpdate = async (payload) => {
    try {
      return await updateSessionSettings(payload);
    } catch {
      await loadRuntime(sessionStateRef.current.sessionUser, {
        agentId: sessionStateRef.current.agentId,
      }).catch(() => {
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      });
      return null;
    }
  };

  const handleModelChange = async (nextModel) => {
    if (!nextModel || nextModel === model) return;

    setSwitchingModelOverlay({ modelLabel: nextModel });
    try {
      await updateSessionSettings({ model: nextModel });
      setModelSwitchNotice({
        type: "success",
        message: i18n.common.modelSwitchSucceeded(nextModel),
      });
    } catch {
      await loadRuntime(sessionStateRef.current.sessionUser, {
        agentId: sessionStateRef.current.agentId,
      }).catch(() => {
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      });
      setModelSwitchNotice({
        type: "error",
        message: i18n.common.modelSwitchFailed(nextModel),
      });
    } finally {
      setSwitchingModelOverlay(null);
    }
  };

  const openOrActivateAgentTab = useCallback(async (nextAgent) => {
    if (!nextAgent) {
      return { created: false, tabId: null };
    }

    const nextTabId = createAgentTabId(nextAgent);
    const existingTab = chatTabsRef.current.find((tab) => tab.id === nextTabId);
    if (existingTab) {
      flushVisibleConversationScrollTop();
      activeChatTabIdRef.current = existingTab.id;
      setActiveChatTabId(existingTab.id);
      return { created: false, tabId: existingTab.id };
    }

    const tabId = nextTabId;
    const existingMeta = tabMetaByIdRef.current[tabId];
    const existingMessages = messagesByTabIdRef.current[tabId] || [];
    const existingSessionUser =
      existingMeta?.sessionUser
      || sessionByTabIdRef.current[tabId]?.sessionUser
      || "";
    const sessionUser =
      existingSessionUser &&
      !(
        nextAgent !== "main" &&
        !existingMessages.length &&
        isGeneratedAgentBootstrapSessionUser(existingSessionUser, nextAgent)
      )
        ? existingSessionUser
        : nextAgent === "main"
          ? defaultSessionUser
          : createAgentSessionUser(nextAgent);
    const nextTab = {
      id: tabId,
      agentId: nextAgent,
      sessionUser,
    };
    const nextMeta = createTabMeta(nextTab, existingMeta || {
      agentId: nextAgent,
      sessionUser,
    });
    const nextSession = sessionByTabIdRef.current[tabId] || {
      ...createSessionForTab(i18n, nextTab, nextMeta),
      ...sessionStateRef.current,
      ...session,
      agentId: nextAgent,
      agentLabel: nextAgent,
      selectedAgentId: nextAgent,
      sessionUser,
      sessionKey: `agent:${nextAgent}:openai-user:${sessionUser}`,
      model: nextMeta.model || session.model || "",
      selectedModel: nextMeta.model || session.selectedModel || session.model || "",
      fastMode: session.fastMode,
      thinkMode: nextMeta.thinkMode || session.thinkMode || "off",
      availableAgents: availableAgents.length ? availableAgents : session.availableAgents || [],
      availableModels: availableModels.length ? availableModels : session.availableModels || [],
      availableMentionAgents: session.availableMentionAgents || [],
      availableSkills: session.availableSkills || [],
    };

    setChatTabs((current) => {
      const updated = [...current, nextTab];
      chatTabsRef.current = updated;
      return updated;
    });
    updateTabMeta(tabId, nextMeta);
    updateTabSession(tabId, nextSession);
    flushVisibleConversationScrollTop();
    activeChatTabIdRef.current = tabId;
    setActiveChatTabId(tabId);

    return { created: true, tabId };
  }, [availableAgents, availableModels, flushVisibleConversationScrollTop, i18n, session, updateTabMeta, updateTabSession]);

  const handleAgentChange = async (nextAgent) => {
    if (!nextAgent) return;
    if (nextAgent === session.agentId && resolveAgentIdFromTabId(activeChatTab?.id) === nextAgent) return;

    let shouldShowOverlay = false;
    try {
      const { created, tabId: targetTabId } = await openOrActivateAgentTab(nextAgent);
      shouldShowOverlay = created;
      if (created) {
        setSwitchingAgentOverlay({
          agentLabel: nextAgent,
          mode: "opening-session",
        });
      }

      const targetTab = chatTabsRef.current.find((tab) => tab.id === targetTabId);
      const targetMeta = (targetTabId && tabMetaByIdRef.current[targetTabId]) || null;
      const targetSession = (targetTabId && sessionByTabIdRef.current[targetTabId]) || null;
      const existingTargetSessionUser =
        targetMeta?.sessionUser
        || targetSession?.sessionUser
        || targetTab?.sessionUser
        || "";
      const targetSessionUser =
        nextAgent !== "main" && (!existingTargetSessionUser || existingTargetSessionUser === defaultSessionUser)
          ? createAgentSessionUser(nextAgent)
          : existingTargetSessionUser || createAgentSessionUser(nextAgent);

      if (targetTabId) {
        updateTabIdentity(targetTabId, { sessionUser: targetSessionUser });
        updateTabMeta(targetTabId, {
          agentId: nextAgent,
          sessionUser: targetSessionUser,
        });
        updateTabSession(targetTabId, (current) => ({
          ...current,
          agentId: nextAgent,
          selectedAgentId: nextAgent,
          sessionUser: targetSessionUser,
        }));
      }

      const sessionUpdate = await applySessionUpdate({
        agentId: nextAgent,
        sessionUser: targetSessionUser,
      });
      const resolvedSession = sessionUpdate?.session || null;

      if (targetTabId && resolvedSession) {
        updateTabMeta(targetTabId, {
          agentId: resolvedSession.agentId || nextAgent,
          sessionUser: resolvedSession.sessionUser || targetSessionUser,
          model: resolvedSession.selectedModel || resolvedSession.model || "",
        });
        updateTabSession(targetTabId, (current) => ({
          ...current,
          ...(resolvedSession || {}),
          agentId: resolvedSession.agentId || nextAgent,
          selectedAgentId: resolvedSession.selectedAgentId || resolvedSession.agentId || nextAgent,
          sessionUser: resolvedSession.sessionUser || targetSessionUser,
          model: resolvedSession.model || current.model,
          selectedModel: resolvedSession.selectedModel || resolvedSession.model || current.selectedModel,
        }));
      }
    } finally {
      if (shouldShowOverlay) {
        setSwitchingAgentOverlay(null);
      }
    }
  };

  const handleSearchSessions = useCallback(async (searchTerm = "", options = {}) => {
    const agentId = String(sessionStateRef.current.agentId || session.agentId || "main").trim() || "main";
    const channel = String(options.channel || "dingtalk-connector").trim() || "dingtalk-connector";
    const params = new URLSearchParams({
      agentId,
      channel,
      limit: "12",
    });
    const normalizedSearchTerm = String(searchTerm || "").trim();
    if (normalizedSearchTerm) {
      params.set("q", normalizedSearchTerm);
    }

    const response = await apiFetch(`/api/session/search?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || i18n.common.requestFailed);
    }

    return Array.isArray(data.sessions) ? data.sessions : [];
  }, [i18n.common.requestFailed, session.agentId]);

  const handleSelectSearchedSession = useCallback(async (sessionMatch) => {
    const nextSessionUser = String(sessionMatch?.sessionUser || "").trim();
    const nextAgentId = String(sessionMatch?.agentId || sessionStateRef.current.agentId || "main").trim() || "main";
    const { create, tabId: plannedTabId, title: plannedTitle } = planSearchedSessionTabTarget({
      activeTabId: activeChatTabIdRef.current,
      agentId: nextAgentId,
      chatTabs: chatTabsRef.current,
      locale: intlLocale,
      sessionUser: nextSessionUser,
    });
    const activeTabId = String(plannedTabId || "").trim();

    if (!nextSessionUser || !activeTabId) {
      return;
    }

    if (
      nextSessionUser === String(sessionStateRef.current.sessionUser || "").trim()
      && nextAgentId === String(sessionStateRef.current.agentId || "").trim()
    ) {
      return;
    }

    if (create) {
      const nextTab = {
        id: activeTabId,
        agentId: nextAgentId,
        sessionUser: nextSessionUser,
      };
      const nextMeta = createTabMeta(nextTab, {
        agentId: nextAgentId,
        sessionUser: nextSessionUser,
        title: plannedTitle,
      });
      const nextSession = {
        ...createSessionForTab(i18n, nextTab, nextMeta),
        ...session,
        agentId: nextAgentId,
        agentLabel: nextAgentId,
        selectedAgentId: nextAgentId,
        sessionUser: nextSessionUser,
        sessionKey: `agent:${nextAgentId}:openai-user:${nextSessionUser}`,
        model: nextMeta.model || session.model || "",
        selectedModel: nextMeta.model || session.selectedModel || session.model || "",
        fastMode: session.fastMode,
        thinkMode: nextMeta.thinkMode || session.thinkMode || "off",
        availableAgents: availableAgents.length ? availableAgents : session.availableAgents || [],
        availableModels: availableModels.length ? availableModels : session.availableModels || [],
        availableMentionAgents: session.availableMentionAgents || [],
        availableSkills: session.availableSkills || [],
      };

      setChatTabs((current) => {
        const updated = [...current, nextTab];
        chatTabsRef.current = updated;
        return updated;
      });
      updateTabMeta(activeTabId, nextMeta);
      updateTabSession(activeTabId, nextSession);
    } else if (plannedTitle) {
      updateTabMeta(activeTabId, { title: plannedTitle });
    }

    if (activeTabId !== activeChatTabIdRef.current) {
      activeChatTabIdRef.current = activeTabId;
      setActiveChatTabId(activeTabId);
    }

    flushVisibleConversationScrollTop();
    if (!create) {
      updateTabIdentity(activeTabId, { agentId: nextAgentId, sessionUser: nextSessionUser });
      updateTabMeta(activeTabId, {
        agentId: nextAgentId,
        sessionUser: nextSessionUser,
        title: plannedTitle,
      });
    }
    updateTabSession(activeTabId, (current) => ({
      ...current,
      agentId: nextAgentId,
      selectedAgentId: nextAgentId,
      sessionUser: nextSessionUser,
      status: i18n.common.running,
    }));
    setMessagesForTab(activeTabId, []);
    setBusyForTab(activeTabId, true);
    clearSnapshotData();
    setFocusMessageRequest(null);
    sessionStateRef.current = {
      ...sessionStateRef.current,
      agentId: nextAgentId,
      sessionUser: nextSessionUser,
    };
    setActiveTarget({
      sessionUser: nextSessionUser,
      agentId: nextAgentId,
    });

    try {
      await loadRuntime(nextSessionUser, {
        agentId: nextAgentId,
      });
      focusPrompt();
    } catch (error) {
      setBusyForTab(activeTabId, false);
      setSession((current) => ({ ...current, status: i18n.common.failed }));
      throw error;
    }
  }, [
    availableAgents,
    availableModels,
    clearSnapshotData,
    flushVisibleConversationScrollTop,
    focusPrompt,
    i18n,
    loadRuntime,
    session,
    setBusyForTab,
    setActiveChatTabId,
    setMessagesForTab,
    setActiveTarget,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);

  const handleActivateChatTab = (tabId) => {
    if (!tabId || tabId === activeChatTabIdRef.current) {
      return;
    }
    flushVisibleConversationScrollTop();
    activeChatTabIdRef.current = tabId;
    setActiveChatTabId(tabId);
  };

  const handleActivateChatTabByIndex = useCallback((index) => {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 1) {
      return;
    }

    const targetTab = chatTabsRef.current[numericIndex - 1];
    if (!targetTab?.id) {
      return;
    }

    handleActivateChatTab(targetTab.id);
  }, []);

  const handleActivateAdjacentChatTab = useCallback((direction) => {
    const normalizedDirection = Number(direction);
    if (!normalizedDirection) {
      return;
    }

    const currentIndex = chatTabsRef.current.findIndex((tab) => tab.id === activeChatTabIdRef.current);
    if (currentIndex === -1) {
      return;
    }

    const targetTab = chatTabsRef.current[currentIndex + (normalizedDirection < 0 ? -1 : 1)];
    if (!targetTab?.id) {
      return;
    }

    handleActivateChatTab(targetTab.id);
  }, []);

  const handleCloseChatTab = (tabId) => {
    setChatTabs((current) => {
      if (current.length <= 1) {
        return current;
      }

      const index = current.findIndex((tab) => tab.id === tabId);
      if (index === -1) {
        return current;
      }

      const nextTabs = current.filter((tab) => tab.id !== tabId);
      chatTabsRef.current = nextTabs;

      if (activeChatTabIdRef.current === tabId) {
        const fallbackTab = nextTabs[Math.max(0, index - 1)] || nextTabs[0];
        if (fallbackTab) {
          flushVisibleConversationScrollTop();
          activeChatTabIdRef.current = fallbackTab.id;
          setActiveChatTabId(fallbackTab.id);
        }
      }

      return nextTabs;
    });
  };

  const handleReorderChatTabs = useCallback((sourceTabId, targetTabId, placement = "before") => {
    const normalizedSourceTabId = String(sourceTabId || "").trim();
    const normalizedTargetTabId = String(targetTabId || "").trim();
    if (!normalizedSourceTabId || !normalizedTargetTabId || normalizedSourceTabId === normalizedTargetTabId) {
      return;
    }

    setChatTabs((current) => {
      const sourceIndex = current.findIndex((tab) => tab.id === normalizedSourceTabId);
      const targetIndex = current.findIndex((tab) => tab.id === normalizedTargetTabId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return current;
      }

      const updated = [...current];
      const [movedTab] = updated.splice(sourceIndex, 1);
      const nextTargetIndex = updated.findIndex((tab) => tab.id === normalizedTargetTabId);
      if (nextTargetIndex === -1) {
        return current;
      }
      const insertionIndex = placement === "after" ? nextTargetIndex + 1 : nextTargetIndex;
      updated.splice(insertionIndex, 0, movedTab);
      chatTabsRef.current = updated;
      return updated;
    });
  }, []);

  const handleFastModeChange = async (nextFastMode) => {
    const resolvedFastMode = Boolean(nextFastMode);
    await applySessionUpdate({ fastMode: resolvedFastMode });
  };

  const handleThinkModeChange = async (nextThinkMode) => {
    if (!nextThinkMode || nextThinkMode === session.thinkMode) return;
    await applySessionUpdate({ thinkMode: nextThinkMode });
  };

  useAppHotkeys({
    handleActivateAdjacentChatTab,
    handleActivateChatTabByIndex,
    handleReset,
    promptRef,
    setPromptVisible: (value) => setPromptForConversation(value, activeConversationKey, { flushDrafts: true, syncVisible: true }),
    setTheme,
  });

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
      messageId: matchedMessage.id || "",
      role: matchedMessage.role || artifact?.messageRole || "assistant",
      source: "artifact",
      timestamp: matchedMessage.timestamp,
    });
  };

  const visibleChatTabs = useMemo(
    () =>
      chatTabs.map((tab) => ({
        id: tab.id,
        agentId: resolveAgentIdFromTabId(tab.id),
        sessionUser: tab.sessionUser,
        title: buildChatTabTitle(resolveAgentIdFromTabId(tab.id), tab.sessionUser, { locale: intlLocale }),
        active: tab.id === activeChatTabId,
        busy: isChatTabBusy({
          tabId: tab.id,
          sessionUser: tab.sessionUser,
          activeChatTabId,
          sessionStatus: session.status,
          busyByTabId,
          messagesByTabId,
        }),
      })),
    [activeChatTabId, busyByTabId, chatTabs, messagesByTabId, session.status],
  );
  return {
    activeChatTabId,
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    availableModels,
    busy,
    chatFontSize: activeChatFontSize,
    chatTabs: visibleChatTabs,
    composerSendMode,
    composerAttachments,
    files,
    fastMode,
    focusMessageRequest,
    formatCompactK,
    handleActivateChatTab,
    handleAddAttachments,
    handleAgentChange,
    handleArtifactSelect,
    handleChatFontSizeChange,
    handleComposerSendModeToggle,
    handleCloseChatTab,
    handleReorderChatTabs,
    handleSearchSessions,
    handleFastModeChange,
    handleInspectorPanelWidthChange,
    handleModelChange,
    handlePromptChange,
    handlePromptKeyDown,
    handleClearQueuedMessages,
    handleRemoveAttachment,
    handleRemoveQueuedMessage,
    handleReset,
    handleSend,
    handleSelectSearchedSession,
    handleStop,
    handleThinkModeChange,
    localizedFormatTime,
    messageViewportRef,
    messages,
    model,
    modelSwitchNotice,
    inspectorPanelWidth,
    peeks,
    prompt,
    promptSyncVersion,
    promptRef,
    renderPeek,
    resolvedTheme,
    restoredChatScrollKey: activeConversationKey,
    restoredChatScrollRevision,
    restoredChatScrollState: chatScrollTopByConversationRef.current[activeConversationKey] || null,
    session,
    setActiveTab,
    dismissTaskRelationship,
    setTheme,
    snapshots,
    switchingAgentOverlay,
    switchingModelOverlay,
    taskRelationships: visibleTaskRelationships,
    taskTimeline,
    theme,
  };
}
