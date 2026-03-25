import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  ChatScrollState,
  ChatTab,
  ChatTabMeta,
  ConversationPendingMap,
  StoredUiState,
} from "@/types/chat";
import type { AppSession, RuntimePeeks, RuntimeSnapshot } from "@/types/runtime";
import {
  appendPromptHistory,
  createAgentTabId,
  createConversationKey,
  defaultChatFontSize,
  defaultComposerSendMode,
  defaultInspectorPanelWidth,
  defaultSessionUser,
  defaultUserLabel,
  defaultTab,
  hasAuthoritativePendingAssistantReply,
  loadStoredChatScrollTops,
  loadPendingChatTurns,
  loadStoredPromptDrafts,
  loadStoredPromptHistory,
  loadStoredState,
  persistUiStateSnapshot,
  persistChatScrollTops,
  sanitizeInspectorPanelWidth,
  sanitizeUserLabel,
} from "@/features/app/storage";
import { useAppHotkeys } from "@/features/app/controllers/use-app-hotkeys";
import { useAppPersistence } from "@/features/app/storage";
import { formatCompactK, formatTime } from "@/features/chat/utils";
import { useChatController, usePromptHistory } from "@/features/chat/controllers";
import { useRuntimeSnapshot } from "@/features/session/runtime";
import { mergeRuntimeFiles } from "@/features/session/runtime/use-runtime-snapshot";
import { useTheme } from "@/features/theme/use-theme";
import { apiFetch } from "@/lib/api-client";
import { pushCcDebugEvent } from "@/lib/cc-debug-events";
import { useI18n } from "@/lib/i18n";
import {
  buildInitialBusyByTabId,
  buildInitialHydratedMessagesByTabId,
  buildInitialSessionByTabId,
  buildInitialSettledMessageKeysByTabId,
  buildStoredPendingChatTurns,
  resolveInitialActiveChatTabId,
} from "@/features/app/controllers/use-command-center-hydration";
import { useCommandCenterBackgroundRuntimeSync } from "@/features/app/controllers/use-command-center-background-runtime-sync";
import { useCommandCenterEnvironmentActions } from "@/features/app/controllers/use-command-center-environment-actions";
import { useCommandCenterImSession } from "@/features/app/controllers/use-command-center-im-session";
import { useCommandCenterReset } from "@/features/app/controllers/use-command-center-reset";
import { useCommandCenterSessionActions } from "@/features/app/controllers/use-command-center-session-actions";
import { resolveCommandCenterSendTarget } from "@/features/app/controllers/use-command-center-send-target";
import { useCommandCenterSessionSelection } from "@/features/app/controllers/use-command-center-session-selection";
import { useCommandCenterTabNavigation } from "@/features/app/controllers/use-command-center-tab-navigation";
import { useCommandCenterTabState } from "@/features/app/controllers/use-command-center-tab-state";
import { useCommandCenterUiState } from "@/features/app/controllers/use-command-center-ui-state";
import {
  applySessionFileRewrites,
  areJsonEqual,
  buildChatTabTitle,
  buildInitialChatTabs,
  buildInitialMessagesByTabId,
  buildInitialTabMetaById,
  createSessionForTab,
  createTabMeta,
  deriveUnreadTabState,
  getLatestUserMessageKey,
  getSettledMessageKeys,
  isChatTabBusy,
  resolveAgentIdFromTabId,
  resolveImRuntimeSessionUser,
} from "@/features/app/controllers/use-command-center-helpers";

export {
  areEquivalentChatScrollState,
  buildChatScrollStateSnapshot,
  buildChatTabTitle,
  deriveUnreadTabState,
  getLatestSettledMessageKey,
  getLatestUserMessageKey,
  getSettledMessageKeys,
  hasActiveAssistantReply,
  isChatTabBusy,
  planSearchedSessionTabTarget,
  resolveImRuntimeSessionUser,
  resolveRuntimeTabAgentId,
  resolveViewportAnchorCandidate,
  shouldApplyRuntimeSnapshotToTab,
  shouldReuseTabState,
} from "@/features/app/controllers/use-command-center-helpers";

const chatScrollPersistenceDebounceMs = 180;

type PersistCurrentUiOverrides = {
  activeChatTabId?: string;
  messages?: ChatMessage[];
  chatFontSize?: StoredUiState["chatFontSize"];
  composerSendMode?: StoredUiState["composerSendMode"];
  userLabel?: string;
  workspaceFilesOpenByConversation?: StoredUiState["workspaceFilesOpenByConversation"];
};

type RuntimeCacheEntry = {
  agents: unknown[];
  artifacts: unknown[];
  availableAgents: string[];
  availableModels: string[];
  files: ChatTabMeta["sessionFiles"];
  overviewReady?: boolean;
  peeks: RuntimePeeks;
  snapshots: unknown[];
  taskRelationships: unknown[];
  taskTimeline: unknown[];
};

type ImChannelConfigEntry = {
  channel?: string;
  enabled?: boolean;
  defaultAgentId?: string;
};

type ImChannelConfigMap = Record<string, ImChannelConfigEntry>;

type SwitchingAgentOverlay = {
  agentLabel: string;
  mode: string;
} | null;

type SwitchingModelOverlay = {
  modelLabel: string;
} | null;

type ModelSwitchNotice = {
  type: "success" | "error";
  message: string;
} | null;

type FocusMessageRequest = {
  id: string;
  messageId?: string;
  role?: string;
  source?: string;
  timestamp?: number;
} | null;


export function useCommandCenter({ userLabel: initialUserLabel = defaultUserLabel }: { userLabel?: string } = {}) {
  const { intlLocale, messages: i18n } = useI18n();
  const stored = useMemo(() => loadStoredState(), []);
  const storedChatScrollTops = useMemo(() => loadStoredChatScrollTops(), []);
  const storedPromptHistory = useMemo(() => loadStoredPromptHistory(), []);
  const rawStoredPendingChatTurns = useMemo(() => loadPendingChatTurns(), []);
  const initialChatTabs = useMemo(() => buildInitialChatTabs(stored), [stored]);
  const initialActiveChatTabId = useMemo(
    () => resolveInitialActiveChatTabId(stored, initialChatTabs) || createAgentTabId("main"),
    [initialChatTabs, stored],
  );
  const initialTabMetaById = useMemo(() => buildInitialTabMetaById(stored, initialChatTabs), [initialChatTabs, stored]);
  const initialMessagesByTabId = useMemo(
    () => buildInitialMessagesByTabId(stored, initialActiveChatTabId),
    [initialActiveChatTabId, stored],
  );
  const storedPendingChatTurns = useMemo(
    () => buildStoredPendingChatTurns(rawStoredPendingChatTurns, initialMessagesByTabId, initialTabMetaById),
    [initialMessagesByTabId, initialTabMetaById, rawStoredPendingChatTurns],
  );
  const initialHydratedMessagesByTabId = useMemo(
    () => buildInitialHydratedMessagesByTabId(
      initialChatTabs,
      initialTabMetaById,
      initialMessagesByTabId,
      storedPendingChatTurns,
      i18n.chat.thinkingPlaceholder,
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
    () => buildInitialSessionByTabId(i18n, initialChatTabs, initialTabMetaById),
    [i18n, initialChatTabs, initialTabMetaById],
  );
  const initialBusyByTabId = useMemo(
    () => buildInitialBusyByTabId(initialChatTabs, initialTabMetaById, storedPendingChatTurns),
    [initialChatTabs, initialTabMetaById, storedPendingChatTurns],
  );
  const initialSettledMessageKeysByTabId = useMemo(
    () => buildInitialSettledMessageKeysByTabId(initialChatTabs, initialHydratedMessagesByTabId),
    [initialChatTabs, initialHydratedMessagesByTabId],
  );

  const [chatTabs, setChatTabs] = useState<ChatTab[]>(initialChatTabs);
  const [activeChatTabId, setActiveChatTabId] = useState(initialActiveChatTabId);
  const [tabMetaById, setTabMetaById] = useState<Record<string, ChatTabMeta>>(initialTabMetaById);
  const [messagesByTabId, setMessagesByTabId] = useState<Record<string, ChatMessage[]>>(initialHydratedMessagesByTabId);
  const [sessionByTabId, setSessionByTabId] = useState<Record<string, AppSession>>(initialSessionByTabId);
  const [busyByTabId, setBusyByTabId] = useState(initialBusyByTabId);
  const [unreadCountByTabId, setUnreadCountByTabId] = useState<Record<string, number>>({});
  const [runtimeCacheByTabId, setRuntimeCacheByTabId] = useState<Record<string, RuntimeCacheEntry>>({});
  const [imChannelConfigs, setImChannelConfigs] = useState<ImChannelConfigMap | null>(null);
  const [promptHistoryByConversation, setPromptHistoryByConversation] = useState(storedPromptHistory);
  const [promptDraftsByConversation, setPromptDraftsByConversation] = useState(storedPromptDrafts);
  const [pendingChatTurns, setPendingChatTurnsState] = useState<ConversationPendingMap>(storedPendingChatTurns);
  const [switchingAgentOverlay, setSwitchingAgentOverlay] = useState<SwitchingAgentOverlay>(null);
  const [switchingModelOverlay, setSwitchingModelOverlay] = useState<SwitchingModelOverlay>(null);
  const [modelSwitchNotice, setModelSwitchNotice] = useState<ModelSwitchNotice>(null);
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [inspectorPanelWidth, setInspectorPanelWidth] = useState(stored?.inspectorPanelWidth || defaultInspectorPanelWidth);
  const [chatFontSize, setChatFontSize] = useState(stored?.chatFontSize || defaultChatFontSize);
  const [composerSendMode, setComposerSendMode] = useState(stored?.composerSendMode || defaultComposerSendMode);
  const [userLabel, setUserLabel] = useState(sanitizeUserLabel(stored?.userLabel || initialUserLabel));
  const [dismissedTaskRelationshipIdsByConversation, setDismissedTaskRelationshipIdsByConversation] = useState(
    stored?.dismissedTaskRelationshipIdsByConversation || {},
  );
  const [workspaceFilesOpenByConversation, setWorkspaceFilesOpenByConversation] = useState(
    stored?.workspaceFilesOpenByConversation || {},
  );
  const [focusMessageRequest, setFocusMessageRequest] = useState<FocusMessageRequest>(null);
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [session, setSession] = useState(createSessionForTab(i18n, initialActiveTab, initialActiveMeta, initialSessionByTabId[initialActiveChatTabId]));
  const [messages, setMessages] = useState<ChatMessage[]>(initialHydratedMessagesByTabId[initialActiveChatTabId] || []);
  const [busy, setBusy] = useState(Boolean(initialBusyByTabId[initialActiveChatTabId]));
  const [model, setModel] = useState(initialActiveMeta.model || "");
  const [fastMode, setFastMode] = useState(Boolean(initialActiveMeta.fastMode));
  const [prompt, setPrompt] = useState(storedPromptDrafts[initialConversationKey] || "");
  const [promptSyncVersion, setPromptSyncVersion] = useState(0);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptValueRef = useRef(storedPromptDrafts[initialConversationKey] || "");
  const promptDraftFlushTimeoutRef = useRef(0);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const messagesRef = useRef(messages);
  const activeChatTabIdRef = useRef(activeChatTabId);
  const hydratingActiveTabRef = useRef(false);
  const latestUserMessageKeyRef = useRef(getLatestUserMessageKey(initialHydratedMessagesByTabId[initialActiveChatTabId] || []));
  const settledMessageKeysByTabIdRef = useRef(initialSettledMessageKeysByTabId);
  const chatTabsRef = useRef(chatTabs);
  const tabMetaByIdRef = useRef(tabMetaById);
  const messagesByTabIdRef = useRef(messagesByTabId);
  const sessionByTabIdRef = useRef(sessionByTabId);
  const busyByTabIdRef = useRef(busyByTabId);
  const unreadCountByTabIdRef = useRef(unreadCountByTabId);
  const runtimeCacheByTabIdRef = useRef<Record<string, RuntimeCacheEntry>>(runtimeCacheByTabId);
  const imChannelConfigsRef = useRef<ImChannelConfigMap | null>(imChannelConfigs);
  const pendingChatTurnsRef = useRef(pendingChatTurns);
  const promptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const activeTabRef = useRef(activeTab);
  const inspectorPanelWidthRef = useRef(inspectorPanelWidth);
  const chatFontSizeRef = useRef(chatFontSize);
  const composerSendModeRef = useRef(composerSendMode);
  const userLabelRef = useRef(userLabel);
  const promptHeightMetricsRef = useRef<{ node: HTMLTextAreaElement | null; maxHeight: number }>({ node: null, maxHeight: 0 });
  const promptHeightFrameRef = useRef(0);
  const dismissedTaskRelationshipIdsByConversationRef = useRef(dismissedTaskRelationshipIdsByConversation);
  const workspaceFilesOpenByConversationRef = useRef(workspaceFilesOpenByConversation);
  const restoredPendingConversationKeysRef = useRef(new Set(Object.keys(storedPendingChatTurns || {})));
  const runtimeRequestByTabIdRef = useRef<Record<string, number>>({});
  const backgroundRuntimeAbortByTabIdRef = useRef<Record<string, AbortController>>({});
  const pendingSendPreparationByTabRef = useRef({});
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
  const chatScrollTopByConversationRef = useRef<Record<string, ChatScrollState>>(storedChatScrollTops);
  const chatScrollPersistenceTimerRef = useRef(0);
  const [restoredChatScrollRevision, setRestoredChatScrollRevision] = useState(0);
  const localizedFormatTime = useMemo(() => (timestamp) => formatTime(timestamp, intlLocale), [intlLocale]);
  const setPendingChatTurns = useCallback((value) => {
    setPendingChatTurnsState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      pendingChatTurnsRef.current = next;
      pushCcDebugEvent("command-center.pending", {
        keys: Object.keys(next || {}),
      });
      return current === next ? current : next;
    });
  }, []);

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
      userLabel: userLabelRef.current,
      dismissedTaskRelationshipIdsByConversation: dismissedTaskRelationshipIdsByConversationRef.current,
      fastMode: Boolean(activeMeta?.fastMode),
      inspectorPanelWidth: inspectorPanelWidthRef.current,
      thinkMode: activeMeta?.thinkMode || "off",
      model: activeMeta?.model || "",
      agentId: activeMeta?.agentId || "main",
      sessionUser: activeMeta?.sessionUser || defaultSessionUser,
      tabMetaById: tabMetaByIdRef.current,
      promptDraftsByConversation: promptDraftsByConversationRef.current,
      workspaceFilesOpenByConversation: workspaceFilesOpenByConversationRef.current,
      messages: activeMessages,
      messagesByTabId: nextMessagesByTabId,
      pendingChatTurns: nextPendingChatTurns,
    });
  }, []);

  const persistCurrentUiStateSnapshot = useCallback((overrides: PersistCurrentUiOverrides = {}) => {
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
      userLabel: Object.prototype.hasOwnProperty.call(overrides, "userLabel") ? sanitizeUserLabel(overrides.userLabel) : userLabelRef.current,
      dismissedTaskRelationshipIdsByConversation: dismissedTaskRelationshipIdsByConversationRef.current,
      fastMode: Boolean(activeMeta?.fastMode),
      inspectorPanelWidth: inspectorPanelWidthRef.current,
      thinkMode: activeMeta?.thinkMode || "off",
      model: activeMeta?.model || "",
      agentId: activeMeta?.agentId || "main",
      sessionUser: activeMeta?.sessionUser || defaultSessionUser,
      tabMetaById: tabMetaByIdRef.current,
      promptDraftsByConversation: promptDraftsByConversationRef.current,
      workspaceFilesOpenByConversation: overrides.workspaceFilesOpenByConversation || workspaceFilesOpenByConversationRef.current,
      messages: activeMessages,
      messagesByTabId: messagesByTabIdRef.current,
      pendingChatTurns: pendingChatTurnsRef.current,
      persistedAt: Date.now(),
    });
  }, []);

  const flushPersistedChatScrollTops = useCallback(() => {
    window.clearTimeout(chatScrollPersistenceTimerRef.current);
    chatScrollPersistenceTimerRef.current = 0;
    persistChatScrollTops(chatScrollTopByConversationRef.current);
  }, []);

  const schedulePersistedChatScrollTops = useCallback(() => {
    window.clearTimeout(chatScrollPersistenceTimerRef.current);
    chatScrollPersistenceTimerRef.current = window.setTimeout(() => {
      flushPersistedChatScrollTops();
    }, chatScrollPersistenceDebounceMs);
  }, [flushPersistedChatScrollTops]);

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
  const activeRuntimeSessionUser = useMemo(
    () =>
      resolveImRuntimeSessionUser({
        tabId: activeChatTab?.id,
        agentId: activeAgentId,
        sessionUser: activeSessionUser,
      }),
    [activeAgentId, activeChatTab?.id, activeSessionUser],
  );
  const activeIdentityRef = useRef({ agentId: activeAgentId, sessionUser: activeSessionUser });
  activeIdentityRef.current = { agentId: activeAgentId, sessionUser: activeSessionUser };
  const getActiveIdentity = useCallback(() => activeIdentityRef.current, []);
  const activeConversationKey = createConversationKey(activeSessionUser, activeAgentId);
  const activePendingChat = pendingChatTurns[activeConversationKey] || null;
  const activePendingWasRestored = Boolean(
    activePendingChat && restoredPendingConversationKeysRef.current.has(activeConversationKey),
  );
  const activeChatFontSize = chatFontSize;
  const dismissedTaskRelationshipIds = useMemo(
    () => dismissedTaskRelationshipIdsByConversation[activeConversationKey] || [],
    [activeConversationKey, dismissedTaskRelationshipIdsByConversation],
  );
  const workspaceFilesOpen = useMemo(
    () => workspaceFilesOpenByConversation[activeConversationKey] ?? true,
    [activeConversationKey, workspaceFilesOpenByConversation],
  );
  const sessionOverviewPending = useMemo(
    () => !runtimeCacheByTabId[activeChatTabId]?.overviewReady,
    [activeChatTabId, runtimeCacheByTabId],
  );
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

  useEffect(() => {
    imChannelConfigsRef.current = imChannelConfigs;
  }, [imChannelConfigs]);

  const loadImChannelConfigs = useCallback(async ({ force = false } = {}) => {
    if (!force && imChannelConfigsRef.current) {
      return imChannelConfigsRef.current;
    }

    try {
      const response = await apiFetch("/api/openclaw/config", { method: "GET" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        return imChannelConfigsRef.current;
      }

      const nextConfigs = payload?.imChannels && typeof payload.imChannels === "object"
        ? payload.imChannels
        : {};
      imChannelConfigsRef.current = nextConfigs;
      setImChannelConfigs((current) => (areJsonEqual(current, nextConfigs) ? current : nextConfigs));
      return nextConfigs;
    } catch {
      return imChannelConfigsRef.current;
    }
  }, []);

  useEffect(() => {
    void loadImChannelConfigs();
  }, [loadImChannelConfigs]);

  const {
    getMessagesForTab,
    isTabActive,
    setBusyForTab,
    setMessagesForTab,
    setMessagesSynced,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  } = useCommandCenterTabState({
    i18n,
    activeChatTabIdRef,
    chatTabsRef,
    tabMetaByIdRef,
    messagesByTabIdRef,
    sessionByTabIdRef,
    busyByTabIdRef,
    messagesRef,
    setBusy,
    setBusyByTabId,
    setChatTabs,
    setFastMode,
    setMessages,
    setMessagesByTabId,
    setModel,
    setSession,
    setSessionByTabId,
    setTabMetaById,
  });

  const {
    activateStopOverride,
    agents,
    applySnapshot,
    artifacts,
    availableAgents,
    availableModels,
    clearSnapshotData,
    files: runtimeFiles,
    hydrateRuntimeState,
    loadRuntime,
    peeks,
    runtimeFallbackReason,
    runtimeOverviewReady,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
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
    recoveringPendingReply: activePendingWasRestored,
    runtimeSessionUser: activeRuntimeSessionUser,
    session,
    setBusy,
    setFastMode,
    setMessagesSynced,
    setModel,
    setPendingChatTurns,
    setPromptHistoryByConversation,
    setSession,
  });
  const files = useMemo(() => {
    const rewrittenRuntimeFiles = applySessionFileRewrites(runtimeFiles, activeTabMeta?.sessionFileRewrites || []);
    return mergeRuntimeFiles(rewrittenRuntimeFiles, activeTabMeta?.sessionFiles || []);
  }, [activeTabMeta?.sessionFileRewrites, activeTabMeta?.sessionFiles, runtimeFiles]);

  const {
    activeQueuedMessages,
    clearQueuedEntries,
    composerAttachments,
    editQueuedEntry,
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

  const {
    focusPrompt,
    flushVisibleConversationScrollTop,
    persistConversationScrollTop,
    schedulePromptHeightAdjustment,
    setPromptForConversation,
  } = useCommandCenterUiState({
    activeConversationKey,
    prompt,
    promptRef,
    promptValueRef,
    promptDraftFlushTimeoutRef,
    promptDraftsByConversationRef,
    promptHeightMetricsRef,
    promptHeightFrameRef,
    messageViewportRef,
    chatScrollTopByConversationRef,
    sessionStateRef,
    setPrompt,
    setPromptDraftsByConversation,
    setPromptSyncVersion,
    schedulePersistedChatScrollTops,
  });

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
    unreadCountByTabIdRef.current = unreadCountByTabId;
  }, [unreadCountByTabId]);

  useEffect(() => {
    const nextSettledMessageKeysByTabId = Object.fromEntries(
      chatTabs.map((tab) => [
        tab.id,
        getSettledMessageKeys(messagesByTabId[tab.id] || []),
      ]),
    );
    const nextUnreadCountByTabId = deriveUnreadTabState({
      activeChatTabId,
      chatTabs,
      settledMessageKeysByTabId: nextSettledMessageKeysByTabId,
      previousSettledMessageKeysByTabId: settledMessageKeysByTabIdRef.current,
      previousUnreadCountByTabId: unreadCountByTabIdRef.current,
    });

    settledMessageKeysByTabIdRef.current = nextSettledMessageKeysByTabId;
    if (!areJsonEqual(unreadCountByTabIdRef.current, nextUnreadCountByTabId)) {
      unreadCountByTabIdRef.current = nextUnreadCountByTabId;
      setUnreadCountByTabId(nextUnreadCountByTabId);
    }
  }, [activeChatTabId, chatTabs, messagesByTabId]);

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
    userLabelRef.current = userLabel;
  }, [userLabel]);

  useEffect(() => {
    dismissedTaskRelationshipIdsByConversationRef.current = dismissedTaskRelationshipIdsByConversation;
  }, [dismissedTaskRelationshipIdsByConversation]);
  useEffect(() => {
    workspaceFilesOpenByConversationRef.current = workspaceFilesOpenByConversation;
  }, [workspaceFilesOpenByConversation]);

  useEffect(() => {
    schedulePromptHeightAdjustment();
    const scheduledFrame = promptHeightFrameRef.current;
    return () => window.cancelAnimationFrame(scheduledFrame);
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
    hydrateRuntimeState((runtimeCacheByTabIdRef.current[activeChatTab.id] || null) as RuntimeSnapshot | null);
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

    if (!activePendingWasRestored && activePendingChat && hasAuthoritativePendingAssistantReply(messages, activePendingChat)) {
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
  }, [activeChatTab, activeConversationKey, activePendingChat, activePendingWasRestored, messages, setBusyForTab, setPendingChatTurns]);

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
        && previous.overviewReady === runtimeOverviewReady
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
          overviewReady: runtimeOverviewReady,
          peeks,
          snapshots,
          taskRelationships,
          taskTimeline,
        },
      };
    });
  }, [activeChatTabId, agents, artifacts, availableAgents, availableModels, files, peeks, runtimeOverviewReady, snapshots, taskRelationships, taskTimeline]);

  useCommandCenterBackgroundRuntimeSync({
    activeChatTabId,
    backgroundRuntimeAbortByTabIdRef,
    chatTabs,
    i18nFastModeOn: i18n.sessionOverview.fastMode.on,
    i18nThinkingPlaceholder: i18n.chat.thinkingPlaceholder,
    intlLocale,
    messagesByTabIdRef,
    pendingChatTurnsRef,
    runtimeRequestByTabIdRef,
    setBusyForTab,
    setMessagesForTab,
    setRuntimeCacheByTabId,
    tabMetaByIdRef,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  });

  const {
    resolveImSessionUserForSend,
  } = useCommandCenterImSession({
    activeChatTabIdRef,
    intlLocale,
    loadRuntime,
    sessionStateRef,
    setActiveTarget,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  });

  const dispatchSessionCommand = async (content, {
    attachments = [],
    suppressPendingPlaceholder = false,
  } = {}) => {
    const normalizedContent = String(content || "").trim();
    if (!normalizedContent && !(attachments || []).length) {
      return;
    }

    shouldAutoScrollRef.current = true;
    const {
      targetAgentId,
      targetFastMode,
      targetModel,
      targetSessionUser,
      targetTabId,
      targetThinkMode,
    } = resolveCommandCenterSendTarget({
      activeChatTab,
      activeChatTabId,
      activeChatTabIdRef,
      chatTabsRef,
      fastMode,
      model,
      session,
      sessionByTabIdRef,
      sessionStateRef,
      tabMetaByIdRef,
    });
    const resolvedTargetSessionUser = await resolveImSessionUserForSend({
      agentId: targetAgentId,
      sessionUser: targetSessionUser,
      tabId: targetTabId,
    });

    const entryTimestamp = Date.now();
    const entryId = `${entryTimestamp}-${Math.random().toString(36).slice(2, 8)}`;
    await enqueueOrRunEntry({
      id: entryId,
      tabId: targetTabId,
      key: `${resolvedTargetSessionUser}:${targetAgentId}`,
      content: normalizedContent,
      attachments,
      timestamp: entryTimestamp,
      userMessageId: `msg-user-${entryId}`,
      agentId: targetAgentId,
      sessionUser: resolvedTargetSessionUser,
      model: targetModel,
      fastMode: targetFastMode,
      thinkMode: targetThinkMode,
      ...(suppressPendingPlaceholder ? { suppressPendingPlaceholder: true } : {}),
    });
  };

  const sendCurrentPrompt = async () => {
    const content = String(promptRef.current?.value || promptValueRef.current || "").trim();
    const attachments = composerAttachments;
    if (!content && !attachments.length) return;
    shouldAutoScrollRef.current = true;
    const {
      targetAgentId,
      targetFastMode,
      targetModel,
      targetSessionUser,
      targetTabId,
      targetThinkMode,
    } = resolveCommandCenterSendTarget({
      activeChatTab,
      activeChatTabId,
      activeChatTabIdRef,
      chatTabsRef,
      fastMode,
      model,
      session,
      sessionByTabIdRef,
      sessionStateRef,
      tabMetaByIdRef,
    });
    const normalizedTargetTabId = String(targetTabId || "").trim();
    if (normalizedTargetTabId && pendingSendPreparationByTabRef.current[normalizedTargetTabId]) {
      return;
    }
    if (normalizedTargetTabId) {
      pendingSendPreparationByTabRef.current = {
        ...pendingSendPreparationByTabRef.current,
        [normalizedTargetTabId]: true,
      };
    }
    setPromptForConversation("", activeConversationKey, { flushDrafts: true, syncVisible: true });
    if (promptRef.current) {
      promptRef.current.value = "";
    }
    setComposerAttachments([]);
    setPromptHistoryNavigation(null);
    resetRapidEnterState();

    let resolvedTargetSessionUser = targetSessionUser;
    try {
      resolvedTargetSessionUser = await resolveImSessionUserForSend({
        agentId: targetAgentId,
        sessionUser: targetSessionUser,
        tabId: targetTabId,
      });
    } finally {
      if (normalizedTargetTabId && pendingSendPreparationByTabRef.current[normalizedTargetTabId]) {
        const nextPendingPreparation = { ...pendingSendPreparationByTabRef.current };
        delete nextPendingPreparation[normalizedTargetTabId];
        pendingSendPreparationByTabRef.current = nextPendingPreparation;
      }
    }

    const entryTimestamp = Date.now();
    const entryId = `${entryTimestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id: entryId,
      tabId: targetTabId,
      key: `${resolvedTargetSessionUser}:${targetAgentId}`,
      content,
      attachments,
      timestamp: entryTimestamp,
      userMessageId: `msg-user-${entryId}`,
      agentId: targetAgentId,
      sessionUser: resolvedTargetSessionUser,
      model: targetModel,
      fastMode: targetFastMode,
      thinkMode: targetThinkMode,
    };

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
    userLabel,
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

  const handleUserLabelChange = useCallback((nextValue) => {
    const normalizedValue = sanitizeUserLabel(nextValue);
    if (userLabelRef.current === normalizedValue) {
      return;
    }

    userLabelRef.current = normalizedValue;
    setUserLabel(normalizedValue);
    persistCurrentUiStateSnapshot({ userLabel: normalizedValue });
  }, [persistCurrentUiStateSnapshot]);

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
    () => taskRelationships.filter((relationship: { id?: string } | null | undefined) => {
      const relationshipId = String(relationship?.id || "").trim();
      return !relationshipId || !dismissedTaskRelationshipIds.includes(relationshipId);
    }),
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

    let removeAutoScrollSync: (() => void) | null = null;
    let bottomObserver: IntersectionObserver | null = null;

    syncAutoScroll();
    if (IntersectionObserverCtor && bottomSentinel) {
      bottomObserver = new IntersectionObserverCtor(
        (entries) => {
          const entry = entries.find((candidate) => candidate.target === bottomSentinel) || entries[0] || null;
          shouldAutoScrollRef.current = Boolean(entry?.isIntersecting || (entry?.intersectionRatio || 0) > 0);
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
        flushPersistedChatScrollTops();
        return;
      }

      persistConversationScrollTop(activeConversationKey, viewport.scrollTop);
      flushPersistedChatScrollTops();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushConversationScrollTop();
      }
    };

    window.addEventListener("pagehide", flushConversationScrollTop);
    window.addEventListener("beforeunload", flushConversationScrollTop);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      flushConversationScrollTop();
      window.removeEventListener("pagehide", flushConversationScrollTop);
      window.removeEventListener("beforeunload", flushConversationScrollTop);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeConversationKey, flushPersistedChatScrollTops, persistConversationScrollTop]);

  const handleSend = sendCurrentPrompt;
  const handleRemoveQueuedMessage = removeQueuedEntry;
  const handleClearQueuedMessages = clearQueuedEntries;
  const handleEditQueuedMessage = useCallback((entryId) => {
    const restoredEntry = editQueuedEntry(entryId);
    if (!restoredEntry) {
      return false;
    }

    setPromptHistoryNavigation(null);
    setComposerAttachments(Array.isArray(restoredEntry.attachments) ? restoredEntry.attachments : []);
    setPromptForConversation(String(restoredEntry.content || ""), activeConversationKey, {
      flushDrafts: true,
      syncVisible: true,
    });
    return true;
  }, [activeConversationKey, editQueuedEntry, setComposerAttachments, setPromptForConversation, setPromptHistoryNavigation]);

  const {
    handleOpenImSession,
    handleSearchSessions,
    handleSelectSearchedSession,
    openOrActivateAgentTab,
  } = useCommandCenterSessionSelection({
    activeChatTabIdRef,
    availableAgents,
    availableModels,
    chatTabsRef,
    clearSnapshotData,
    flushVisibleConversationScrollTop,
    focusPrompt,
    i18n,
    imChannelConfigsRef,
    intlLocale,
    loadImChannelConfigs,
    loadRuntime,
    messagesByTabIdRef,
    session,
    sessionByTabIdRef,
    sessionStateRef,
    setActiveChatTabId,
    setActiveTarget,
    setBusyForTab,
    setChatTabs,
    setFocusMessageRequest,
    setMessagesForTab,
    setSession,
    tabMetaByIdRef,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  });

  const {
    handleAgentChange,
    handleFastModeChange,
    handleModelChange,
    handleSyncCurrentSessionModel,
    handleThinkModeChange,
  } = useCommandCenterSessionActions({
    activeChatTab,
    i18n,
    loadRuntime,
    model,
    openOrActivateAgentTab,
    session,
    sessionByTabIdRef,
    sessionStateRef,
    setModelSwitchNotice,
    setSession,
    setSwitchingAgentOverlay,
    setSwitchingModelOverlay,
    tabMetaByIdRef,
    updateSessionSettings,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  });

  const {
    handleActivateAdjacentChatTab,
    handleActivateChatTab,
    handleActivateChatTabByIndex,
    handleCloseChatTab,
    handleReorderChatTabs,
  } = useCommandCenterTabNavigation({
    activeChatTabIdRef,
    chatTabsRef,
    flushVisibleConversationScrollTop,
    setActiveChatTabId,
    setChatTabs,
    setUnreadCountByTabId,
    settledMessageKeysByTabIdRef,
    unreadCountByTabIdRef,
  });

  const { handleReset } = useCommandCenterReset({
    activeChatTabIdRef,
    activeTabRef,
    busyByTabIdRef,
    chatFontSizeRef,
    chatTabsRef,
    clearSnapshotData,
    composerSendModeRef,
    dismissedTaskRelationshipIdsByConversationRef,
    dispatchSessionCommand,
    focusPrompt,
    i18n,
    initialStoredMessagesByTabIdRef,
    initialStoredPendingRef,
    inspectorPanelWidthRef,
    loadRuntime,
    messagesByTabIdRef,
    messagesRef,
    pendingChatTurnsRef,
    promptDraftsByConversationRef,
    runtimeCacheByTabIdRef,
    session,
    sessionByTabIdRef,
    sessionStateRef,
    setActiveChatTabId,
    setActiveTarget,
    setBusyByTabId,
    setChatTabs,
    setComposerAttachments,
    setMessagesByTabId,
    setMessagesSynced,
    setPendingChatTurns,
    setPromptForConversation,
    setPromptHistoryNavigation,
    setQueuedMessages,
    setRuntimeCacheByTabId,
    setSession,
    setSessionByTabId,
    setTabMetaById,
    tabMetaByIdRef,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
    userLabelRef,
    workspaceFilesOpenByConversationRef,
  });

  useAppHotkeys({
    handleActivateAdjacentChatTab,
    handleActivateChatTabByIndex,
    handleReset,
    promptRef,
    setPromptVisible: (value) => setPromptForConversation(value, activeConversationKey, { flushDrafts: true, syncVisible: true }),
    setTheme,
  });

  const {
    handleArtifactSelect,
    handleRefreshEnvironment,
    handleTrackSessionFiles,
    handleWorkspaceFilesOpenChange,
    renderPeek,
  } = useCommandCenterEnvironmentActions({
    activeConversationKey,
    activeChatTabIdRef,
    loadImChannelConfigs,
    loadRuntime,
    messagesRef,
    persistCurrentUiStateSnapshot,
    session,
    sessionStateRef,
    setFocusMessageRequest,
    setWorkspaceFilesOpenByConversation,
    updateTabMeta,
    workspaceFilesOpenByConversationRef,
  });

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
          pendingChatTurns,
        }),
        unreadCount: Number(unreadCountByTabId[tab.id] || 0),
      })),
    [activeChatTabId, busyByTabId, chatTabs, intlLocale, messagesByTabId, pendingChatTurns, session.status, unreadCountByTabId],
  );
  const activeUiBusy = useMemo(
    () => isChatTabBusy({
      tabId: activeChatTabId,
      sessionUser: activeChatTab?.sessionUser,
      activeChatTabId,
      sessionStatus: session.status,
      busyByTabId,
      messagesByTabId,
      pendingChatTurns,
    }),
    [activeChatTab?.sessionUser, activeChatTabId, busyByTabId, messagesByTabId, pendingChatTurns, session.status],
  );
  return {
    activeChatTabId,
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    availableModels,
    busy: activeUiBusy,
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
    handleOpenImSession,
    imChannelConfigs,
    loadImChannelConfigs,
    handleReorderChatTabs,
    handleRefreshEnvironment,
    handleSearchSessions,
    handleFastModeChange,
    handleInspectorPanelWidthChange,
    handleModelChange,
    handleSyncCurrentSessionModel,
    handlePromptChange,
    handlePromptKeyDown,
    handleClearQueuedMessages,
    handleEditQueuedMessage,
    handleRemoveAttachment,
    handleRemoveQueuedMessage,
    handleReset,
    handleSend,
    handleSelectSearchedSession,
    handleStop,
    handleTrackSessionFiles,
    handleThinkModeChange,
    handleUserLabelChange,
    handleWorkspaceFilesOpenChange,
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
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    session,
    setActiveTab,
    dismissTaskRelationship,
    runtimeSocketStatus,
    runtimeTransport,
    setTheme,
    sessionOverviewPending,
    snapshots,
    switchingAgentOverlay,
    switchingModelOverlay,
    taskRelationships: visibleTaskRelationships,
    taskTimeline,
    theme,
    userLabel,
    workspaceFilesOpen,
  };
}
