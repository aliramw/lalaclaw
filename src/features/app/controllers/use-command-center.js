import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  appendPromptHistory,
  createAgentSessionUser,
  createAgentTabId,
  createResetSessionUser,
  createConversationKey,
  defaultChatFontSize,
  defaultInspectorPanelWidth,
  defaultSessionUser,
  defaultTab,
  derivePendingEntryFromLocalMessages,
  hasAuthoritativePendingAssistantReply,
  loadStoredChatScrollTops,
  loadPendingChatTurns,
  loadStoredPromptDrafts,
  loadStoredPromptHistory,
  loadStoredState,
  mergeConversationAttachments,
  mergeConversationIdentity,
  mergePendingConversation,
  pruneCompletedPendingChatTurns,
  mergeStaleLocalConversationTail,
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
import { normalizeStatusKey } from "@/features/session/status-display";
import { useTheme } from "@/features/theme/use-theme";
import { useI18n } from "@/lib/i18n";

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
  return normalized.slice("agent:".length).trim() || "main";
}

function normalizeRuntimeIdentityValue(value = "") {
  return String(value || "").trim();
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
  recovered = false,
  snapshotHasPendingUserMessage = false,
  snapshotHasAssistantReply = false,
  status = "",
} = {}) {
  if (!recovered || !pendingEntry || pendingEntry?.stopped || snapshotHasAssistantReply) {
    return false;
  }

  const normalizedStatus = normalizeStatusKey(status);
  if (normalizedStatus === "failed" || normalizedStatus === "offline") {
    return true;
  }

  // Runtime status can still briefly look settled right after a refresh while the
  // assistant turn is actively continuing on the backend. If the latest user turn
  // is already present in the snapshot, keep the recovered pending reply alive.
  return (normalizedStatus === "idle" || normalizedStatus === "completed") && !snapshotHasPendingUserMessage;
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

export function useCommandCenter() {
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
  const promptRef = useRef(null);
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
  const pendingChatTurnsRef = useRef(pendingChatTurns);
  const promptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const activeTabRef = useRef(activeTab);
  const inspectorPanelWidthRef = useRef(inspectorPanelWidth);
  const chatFontSizeRef = useRef(chatFontSize);
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

  const setMessagesForTab = useCallback((tabId, value) => {
    setMessagesByTabId((current) => {
      const previous = current[tabId] || [];
      const next = typeof value === "function" ? value(previous) : value;

      if (current[tabId] === next) {
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

      if (current[tabId] === next) {
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

  const applySnapshotToTab = useCallback((tabId, snapshot, fallbackTab = null) => {
    if (!tabId || !snapshot) {
      return;
    }

    const fallbackMeta = tabMetaByIdRef.current[tabId];
    const currentTab =
      fallbackTab
      || chatTabsRef.current.find((entry) => entry.id === tabId)
      || {
        id: tabId,
        agentId: fallbackMeta?.agentId || snapshot.session?.agentId || snapshot.agentId || "main",
        sessionUser: fallbackMeta?.sessionUser || snapshot.session?.sessionUser || defaultSessionUser,
      };
    const nextAgentId = resolveAgentIdFromTabId(tabId) || currentTab.agentId || snapshot.session?.agentId || snapshot.agentId || "main";
    const nextSessionUser = snapshot.session?.sessionUser || currentTab.sessionUser;
    const nextModel = snapshot.session?.selectedModel || snapshot.session?.model || snapshot.model || "";
    const nextFastMode =
      snapshot.session?.fastMode === i18n.sessionOverview.fastMode.on
      || snapshot.session?.fastMode === "开启"
      || snapshot.session?.fastMode === true
      || snapshot.fastMode === true;
    const nextThinkMode = snapshot.session?.thinkMode || fallbackMeta?.thinkMode || "off";
    const nextConversationKey = createConversationKey(nextSessionUser, nextAgentId);
    const localMessages = messagesByTabIdRef.current[tabId] || [];
    const pendingEntry = pendingChatTurns[nextConversationKey] || derivePendingEntryFromLocalMessages(localMessages) || null;
    const recoveredPending = restoredPendingConversationKeysRef.current.has(nextConversationKey);

    updateTabIdentity(tabId, {
      sessionUser: nextSessionUser,
    });
    updateTabMeta(tabId, {
      agentId: nextAgentId,
      sessionUser: nextSessionUser,
      model: nextModel,
      fastMode: nextFastMode,
      thinkMode: nextThinkMode,
    });
    updateTabSession(tabId, (current) => ({
      ...current,
      ...(snapshot.session || {}),
      agentId: nextAgentId,
      selectedAgentId: snapshot.session?.selectedAgentId || nextAgentId,
      sessionUser: nextSessionUser,
      model: nextModel || current.model,
      selectedModel: nextModel || current.selectedModel,
      mode: snapshot.session?.mode || snapshot.mode || current.mode,
      availableAgents: snapshot.session?.availableAgents || snapshot.availableAgents || current.availableAgents,
      availableModels: snapshot.session?.availableModels || snapshot.availableModels || current.availableModels,
      thinkMode: snapshot.session?.thinkMode || current.thinkMode,
    }));

    if (Array.isArray(snapshot.conversation)) {
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
        recovered: recoveredPending,
        snapshotHasPendingUserMessage: snapshotIncludesPendingUserMessage,
        snapshotHasAssistantReply,
        status: snapshot.session?.status || "",
      });
      const localMessagesWithoutPending = localMessages.filter((message) => !message?.pending);
      const effectiveLocalMessages = pendingEntry && !snapshotHasAssistantReply ? localMessages : [];
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
      setMessagesForTab(tabId, hydratedConversation);
      const hasActivePendingTurn = Boolean(pendingEntry) && !pendingEntry?.stopped && !snapshotHasAssistantReply && !shouldClearPending;
      setBusyForTab(tabId, hasActivePendingTurn);

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
    }

    setRuntimeCacheByTabId((current) => ({
      ...current,
      [tabId]: {
        agents: snapshot.agents || [],
        artifacts: snapshot.artifacts || [],
        availableAgents: snapshot.session?.availableAgents || snapshot.availableAgents || [],
        availableModels: snapshot.session?.availableModels || snapshot.availableModels || [],
        files: snapshot.files || [],
        peeks: snapshot.peeks || { workspace: null, terminal: null, browser: null, environment: null },
        snapshots: snapshot.snapshots || [],
        taskRelationships: snapshot.taskRelationships || [],
        taskTimeline: snapshot.taskTimeline || [],
      },
    }));
  }, [
    i18n.chat.thinkingPlaceholder,
    i18n.sessionOverview.fastMode.on,
    pendingChatTurns,
    setBusyForTab,
    setMessagesForTab,
    setPendingChatTurns,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);

  const fetchRuntimeForTab = useCallback(async (tabId, runtimeTarget, fallbackTab = null) => {
    const target =
      runtimeTarget && typeof runtimeTarget === "object"
        ? runtimeTarget
        : { sessionUser: runtimeTarget };
    const requestId = (runtimeRequestByTabIdRef.current[tabId] || 0) + 1;
    runtimeRequestByTabIdRef.current = {
      ...runtimeRequestByTabIdRef.current,
      [tabId]: requestId,
    };
    const normalizedSessionUser = String(target?.sessionUser || "").trim();
    const normalizedAgentId = String(target?.agentId || fallbackTab?.agentId || "").trim();
    const localMessages = messagesByTabIdRef.current[tabId] || [];

    if (!tabId || !normalizedSessionUser) {
      return null;
    }

    const loadSnapshot = async (nextSessionUser) => {
      const params = new URLSearchParams({
        sessionUser: nextSessionUser,
      });
      if (normalizedAgentId) {
        params.set("agentId", normalizedAgentId);
      }

      const response = await fetch(`/api/runtime?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Runtime snapshot failed");
      }
      if (runtimeRequestByTabIdRef.current[tabId] !== requestId) {
        return null;
      }
      return {
        payload,
        sessionUser: nextSessionUser,
      };
    };

    let { payload, sessionUser: resolvedSessionUser } = await loadSnapshot(normalizedSessionUser);
    if (!payload) {
      return null;
    }

    if (
      normalizedAgentId &&
      normalizedAgentId !== "main" &&
      !localMessages.length &&
      normalizedSessionUser !== defaultSessionUser &&
      isGeneratedAgentBootstrapSessionUser(normalizedSessionUser, normalizedAgentId) &&
      (!Array.isArray(payload.conversation) || payload.conversation.length === 0)
    ) {
      ({ payload, sessionUser: resolvedSessionUser } = await loadSnapshot(defaultSessionUser));
      if (!payload) {
        return null;
      }
    }

    if (runtimeRequestByTabIdRef.current[tabId] !== requestId) {
      return null;
    }

    const latestTab = chatTabsRef.current.find((entry) => entry.id === tabId) || fallbackTab;
    const latestMeta = tabMetaByIdRef.current[tabId] || null;
    const latestSession = sessionByTabIdRef.current[tabId] || null;
    const latestAgentId =
      latestMeta?.agentId
      || latestSession?.agentId
      || latestTab?.agentId
      || normalizedAgentId
      || resolveAgentIdFromTabId(tabId)
      || "main";
    const latestSessionUser =
      latestMeta?.sessionUser
      || latestSession?.sessionUser
      || latestTab?.sessionUser
      || "";

    if (
      !shouldApplyRuntimeSnapshotToTab({
        currentAgentId: latestAgentId,
        currentSessionUser: latestSessionUser,
        requestedAgentId: normalizedAgentId,
        requestedSessionUser: normalizedSessionUser,
        resolvedSessionUser,
      })
    ) {
      return null;
    }

    applySnapshotToTab(
      tabId,
      payload,
      fallbackTab
        ? {
            ...fallbackTab,
            agentId: normalizedAgentId || fallbackTab.agentId,
            sessionUser: resolvedSessionUser,
          }
        : null,
    );
    return payload;
  }, [applySnapshotToTab]);

  const getMessagesForTab = useCallback((tabId) => messagesByTabIdRef.current[tabId] || [], []);
  const isTabActive = useCallback((tabId) => activeChatTabIdRef.current === tabId, []);

  const {
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
    composerAttachments,
    enqueueOrRunEntry,
    handleAddAttachments,
    handleRemoveAttachment,
    handleStop,
    setComposerAttachments,
    setQueuedMessages,
  } = useChatController({
    activeChatTabId,
    activeConversationKey,
    applySnapshot,
    busyByTabId,
    getMessagesForTab,
    i18n,
    isTabActive,
    persistOptimisticChatState,
    setBusyForTab,
    setMessagesForTab,
    setPendingChatTurns,
    invalidateRuntimeRequestForTab,
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
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, []);

  const adjustPromptHeight = useCallback(() => {
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
  }, []);

  const setPromptForConversation = useCallback((value, conversationKey = activeConversationKey) => {
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
  }, [activeConversationKey]);

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
    promptDraftsByConversationRef.current = promptDraftsByConversation;
  }, [promptDraftsByConversation]);

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
    dismissedTaskRelationshipIdsByConversationRef.current = dismissedTaskRelationshipIdsByConversation;
  }, [dismissedTaskRelationshipIdsByConversation]);

  useEffect(() => {
    adjustPromptHeight();
  }, [adjustPromptHeight, prompt]);

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
    hydrateRuntimeState(runtimeCacheByTabId[activeChatTab.id] || null);
    if (nextMeta.sessionUser || nextSession.sessionUser) {
      void fetchRuntimeForTab(
        activeChatTab.id,
        {
          agentId: nextMeta.agentId || nextSession.agentId || activeChatTab.agentId,
          sessionUser: nextMeta.sessionUser || nextSession.sessionUser,
        },
        activeChatTab,
      ).catch(() => {});
    }
  }, [activeChatTab, activeChatTabId, fetchRuntimeForTab, hydrateRuntimeState, i18n, setActiveTarget]);

  useEffect(() => {
    setPrompt(promptDraftsByConversation[activeConversationKey] || "");
  }, [activeConversationKey, promptDraftsByConversation]);

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

  const sendCurrentPrompt = async () => {
    const content = prompt.trim();
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
    activeChatTabId,
    activeTab,
    chatFontSize,
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

    const syncAutoScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom <= 48;
    };

    const updateAutoScroll = () => {
      syncAutoScroll();
      persistConversationScrollTop(activeConversationKey, viewport.scrollTop);
    };

    syncAutoScroll();
    viewport.addEventListener("scroll", updateAutoScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", updateAutoScroll);
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

  const handleReset = async () => {
    const nextSessionUser = createResetSessionUser(sessionStateRef.current.agentId);
    const nextAgentId = sessionStateRef.current.agentId;
    const nextModel = sessionStateRef.current.model;
    const previousConversationKey = createConversationKey(sessionStateRef.current.sessionUser, nextAgentId);

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
    sessionStateRef.current = {
      ...sessionStateRef.current,
      sessionUser: nextSessionUser,
      agentId: nextAgentId,
      model: nextModel,
    };
    if (activeChatTabIdRef.current) {
      updateTabIdentity(activeChatTabIdRef.current, { sessionUser: nextSessionUser });
      updateTabMeta(activeChatTabIdRef.current, {
        agentId: nextAgentId,
        sessionUser: nextSessionUser,
        model: nextModel,
      });
      updateTabSession(activeChatTabIdRef.current, (current) => ({
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
      await updateSessionSettings(payload);
    } catch {
      await loadRuntime(sessionStateRef.current.sessionUser, {
        agentId: sessionStateRef.current.agentId,
      }).catch(() => {
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      });
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
    const nextSession = createSessionForTab(i18n, nextTab, nextMeta, sessionByTabIdRef.current[tabId]);

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
  }, [flushVisibleConversationScrollTop, i18n, updateTabMeta, updateTabSession]);

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

      await applySessionUpdate({
        agentId: nextAgent,
        sessionUser: targetSessionUser,
      });
    } finally {
      if (shouldShowOverlay) {
        setSwitchingAgentOverlay(null);
      }
    }
  };

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
    handlePromptChange,
    handleReset,
    prompt,
    promptRef,
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
        active: tab.id === activeChatTabId,
        busy: Boolean(busyByTabId[tab.id]) || hasActiveAssistantReply(messagesByTabId[tab.id] || []),
      })),
    [activeChatTabId, busyByTabId, chatTabs, messagesByTabId],
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
    handleCloseChatTab,
    handleReorderChatTabs,
    handleFastModeChange,
    handleInspectorPanelWidthChange,
    handleModelChange,
    handlePromptChange,
    handlePromptKeyDown,
    handleRemoveAttachment,
    handleReset,
    handleSend,
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
