import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMessage, ChatTab, ChatTabMeta, ConversationPendingMap, StoredUiState } from "@/types/chat";
import type { AppSession } from "@/types/runtime";
import {
  persistUiStateSnapshot,
} from "@/features/app/storage/app-ui-state-storage";
import { createConversationKey } from "@/features/app/state/app-session-identity";
import { createBaseSession } from "@/features/app/state";
import {
  createResetImSessionUser,
  isImSessionUser,
} from "@/features/session/im-session";
import {
  createSessionForTab,
  createSessionScopedTabId,
  createTabMeta,
} from "@/features/app/controllers/use-command-center-helpers";

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
  model?: string;
  fastMode?: boolean;
  thinkMode?: string;
  mode?: string;
};

type QueuedMessageLike = {
  tabId?: string;
} & Record<string, unknown>;

function createResetSessionUser(agentId = "main") {
  const normalizedAgentId = String(agentId || "").trim().replace(/[^\w:-]+/g, "-").replace(/-+/g, "-") || "main";
  return `command-center-reset-${normalizedAgentId}-${Date.now()}`;
}

type UseCommandCenterResetOptions = {
  activeChatTabIdRef: MutableRefObject<string>;
  activeTabRef: MutableRefObject<string>;
  busyByTabIdRef: MutableRefObject<Record<string, boolean>>;
  chatFontSizeRef: MutableRefObject<StoredUiState["chatFontSize"]>;
  chatTabsRef: MutableRefObject<ChatTab[]>;
  clearSnapshotData: () => void;
  composerSendModeRef: MutableRefObject<StoredUiState["composerSendMode"]>;
  dismissedTaskRelationshipIdsByConversationRef: MutableRefObject<Record<string, string[]>>;
  dispatchSessionCommand: (content: string, options?: {
    attachments?: unknown[];
    suppressPendingPlaceholder?: boolean;
  }) => Promise<void>;
  focusPrompt: () => void;
  i18n: Parameters<typeof createSessionForTab>[0];
  initialStoredMessagesByTabIdRef: MutableRefObject<Record<string, ChatMessage[]>>;
  initialStoredPendingRef: MutableRefObject<ConversationPendingMap>;
  inspectorPanelWidthRef: MutableRefObject<number>;
  loadRuntime: (sessionUser: string, options?: { agentId?: string }) => Promise<unknown>;
  messagesByTabIdRef: MutableRefObject<Record<string, ChatMessage[]>>;
  pendingChatTurnsRef: MutableRefObject<ConversationPendingMap>;
  promptDraftsByConversationRef: MutableRefObject<Record<string, string>>;
  runtimeCacheByTabIdRef: MutableRefObject<Record<string, unknown>>;
  session: AppSession;
  sessionByTabIdRef: MutableRefObject<Record<string, AppSession>>;
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  setActiveChatTabId: Dispatch<SetStateAction<string>>;
  setActiveTarget: (value: { sessionUser?: string; agentId?: string }) => void;
  setBusyByTabId: Dispatch<SetStateAction<Record<string, boolean>>>;
  setChatTabs: Dispatch<SetStateAction<ChatTab[]>>;
  setComposerAttachments: Dispatch<SetStateAction<unknown[]>>;
  setMessagesByTabId: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  setMessagesSynced: (value: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => void;
  setPendingChatTurns: (value: ConversationPendingMap | ((current: ConversationPendingMap) => ConversationPendingMap)) => void;
  setPromptForConversation: (
    value: string | ((current: string) => string),
    conversationKey?: string,
    options?: { flushDrafts?: boolean; syncVisible?: boolean },
  ) => string;
  setPromptHistoryNavigation: Dispatch<SetStateAction<any>>;
  setQueuedMessages: Dispatch<SetStateAction<QueuedMessageLike[]>>;
  setRuntimeCacheByTabId: Dispatch<SetStateAction<Record<string, unknown>>>;
  setSession: Dispatch<SetStateAction<AppSession>>;
  setSessionByTabId: Dispatch<SetStateAction<Record<string, AppSession>>>;
  setTabMetaById: Dispatch<SetStateAction<Record<string, ChatTabMeta>>>;
  tabMetaByIdRef: MutableRefObject<Record<string, ChatTabMeta>>;
  updateTabIdentity: (tabId: string, value: { agentId?: string; sessionUser?: string }) => void;
  updateTabMeta: (tabId: string, value: Record<string, unknown>) => void;
  updateTabSession: (tabId: string, value: (current: AppSession) => AppSession) => void;
  userLabelRef: MutableRefObject<string>;
  workspaceFilesOpenByConversationRef: MutableRefObject<StoredUiState["workspaceFilesOpenByConversation"]>;
};

export function useCommandCenterReset({
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
}: UseCommandCenterResetOptions) {
  const handleReset = useCallback(async () => {
    const currentSessionUser = String(sessionStateRef.current.sessionUser || "").trim();
    const currentMode = String(sessionStateRef.current.mode || session.mode || "").trim();
    if (isImSessionUser(currentSessionUser) && currentMode === "openclaw") {
      setPromptHistoryNavigation(null);
      setComposerAttachments([]);
      await dispatchSessionCommand("/reset", {
        suppressPendingPlaceholder: true,
      });
      focusPrompt();
      return;
    }

    const nextSessionUser = isImSessionUser(currentSessionUser)
      ? createResetImSessionUser(currentSessionUser)
      : createResetSessionUser(sessionStateRef.current.agentId);
    const nextAgentId = String(sessionStateRef.current.agentId || session.agentId || "main").trim() || "main";
    const nextModel = String(sessionStateRef.current.model || session.model || "").trim();
    const previousConversationKey = createConversationKey(currentSessionUser, nextAgentId);
    const activeTabId = activeChatTabIdRef.current;
    const nextActiveTabId = activeTabId && isImSessionUser(currentSessionUser)
      ? createSessionScopedTabId(nextAgentId, nextSessionUser)
      : activeTabId;
    const nextChatTabs = activeTabId
      ? chatTabsRef.current.map((tab) => (
          tab.id === activeTabId
            ? { ...tab, id: nextActiveTabId || tab.id, sessionUser: nextSessionUser }
            : tab
        ))
      : chatTabsRef.current;
    const previousTabMeta = activeTabId
      ? (tabMetaByIdRef.current[activeTabId] || createTabMeta(chatTabsRef.current.find((tab) => tab.id === activeTabId) || {
          id: nextActiveTabId || activeTabId,
          agentId: nextAgentId,
          sessionUser: nextSessionUser,
        }))
      : null;
    const nextBaseTabMeta = {
      ...(previousTabMeta || createTabMeta({
        id: nextActiveTabId || activeTabId || createSessionScopedTabId(nextAgentId, nextSessionUser),
        agentId: nextAgentId,
        sessionUser: nextSessionUser,
      })),
      agentId: nextAgentId,
      sessionUser: nextSessionUser,
      model: nextModel,
      fastMode: previousTabMeta?.fastMode ?? Boolean(sessionStateRef.current.fastMode),
      thinkMode: previousTabMeta?.thinkMode || sessionStateRef.current.thinkMode || "off",
      sessionFiles: previousTabMeta?.sessionFiles || [],
      sessionFileRewrites: previousTabMeta?.sessionFileRewrites || [],
    };
    const nextTabMetaById = activeTabId && nextActiveTabId
      ? {
          ...Object.fromEntries(
            Object.entries(tabMetaByIdRef.current).filter(([tabId]) => tabId !== activeTabId),
          ),
          [nextActiveTabId]: nextBaseTabMeta,
        }
      : tabMetaByIdRef.current;
    const nextMessagesByTabId = activeTabId
      ? {
          ...Object.fromEntries(
            Object.entries(messagesByTabIdRef.current).filter(([tabId]) => tabId !== activeTabId),
          ),
          [(nextActiveTabId || activeTabId)]: [],
        }
      : messagesByTabIdRef.current;
    const nextInitialStoredMessagesByTabId = activeTabId
      ? Object.fromEntries(
          Object.entries(initialStoredMessagesByTabIdRef.current || {}).filter(([tabId]) => tabId !== activeTabId),
        )
      : initialStoredMessagesByTabIdRef.current;
    const nextInitialStoredPending = Object.fromEntries(
      Object.entries(initialStoredPendingRef.current || {}).filter(([key]) => key !== previousConversationKey),
    );

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
    sessionStateRef.current = {
      ...sessionStateRef.current,
      sessionUser: nextSessionUser,
      agentId: nextAgentId,
      model: nextModel,
    };
    initialStoredMessagesByTabIdRef.current = nextInitialStoredMessagesByTabId;
    initialStoredPendingRef.current = nextInitialStoredPending;
    clearSnapshotData();

    if (activeTabId && nextActiveTabId && nextActiveTabId !== activeTabId) {
      setChatTabs((current) => {
        const updated = current.map((tab) => (
          tab.id === activeTabId
            ? { ...tab, id: nextActiveTabId, sessionUser: nextSessionUser }
            : tab
        ));
        chatTabsRef.current = updated;
        return updated;
      });
      setTabMetaById((current) => {
        const next = {
          ...Object.fromEntries(Object.entries(current).filter(([tabId]) => tabId !== activeTabId)),
          [nextActiveTabId]: {
            ...nextBaseTabMeta,
            ...(current[activeTabId] || {}),
            agentId: nextAgentId,
            sessionUser: nextSessionUser,
            model: nextModel,
            fastMode: current[activeTabId]?.fastMode ?? nextBaseTabMeta.fastMode,
            thinkMode: current[activeTabId]?.thinkMode || nextBaseTabMeta.thinkMode,
            sessionFiles: current[activeTabId]?.sessionFiles || nextBaseTabMeta.sessionFiles,
            sessionFileRewrites: current[activeTabId]?.sessionFileRewrites || nextBaseTabMeta.sessionFileRewrites,
          },
        };
        tabMetaByIdRef.current = next;
        return next;
      });
      setMessagesByTabId((current) => {
        const next = {
          ...Object.fromEntries(Object.entries(current).filter(([tabId]) => tabId !== activeTabId)),
          [nextActiveTabId]: [],
        };
        messagesByTabIdRef.current = next;
        return next;
      });
      setSessionByTabId((current) => {
        const currentSession = current[activeTabId];
        const next = {
          ...Object.fromEntries(Object.entries(current).filter(([tabId]) => tabId !== activeTabId)),
          [nextActiveTabId]: currentSession
            ? {
                ...currentSession,
                agentId: nextAgentId,
                selectedAgentId: nextAgentId,
                sessionUser: nextSessionUser,
                model: nextModel || currentSession.model,
                selectedModel: nextModel || currentSession.selectedModel,
              }
            : createSessionForTab(i18n, { id: nextActiveTabId, agentId: nextAgentId, sessionUser: nextSessionUser }, {
                agentId: nextAgentId,
                sessionUser: nextSessionUser,
                model: nextModel,
                fastMode: Boolean(sessionStateRef.current.fastMode),
                thinkMode: sessionStateRef.current.thinkMode || "off",
                sessionFiles: [],
                sessionFileRewrites: [],
              }),
        };
        sessionByTabIdRef.current = next;
        return next;
      });
      setBusyByTabId((current) => {
        const next = {
          ...Object.fromEntries(Object.entries(current).filter(([tabId]) => tabId !== activeTabId)),
          [nextActiveTabId]: false,
        };
        busyByTabIdRef.current = next;
        return next;
      });
      setRuntimeCacheByTabId((current) => {
        const next = { ...current };
        delete next[activeTabId];
        delete next[nextActiveTabId];
        runtimeCacheByTabIdRef.current = next;
        return next;
      });
      activeChatTabIdRef.current = nextActiveTabId;
      setActiveChatTabId(nextActiveTabId);
    } else if (activeTabId) {
      setMessagesByTabId((current) => {
        const next = {
          ...current,
          [activeTabId]: [],
        };
        messagesByTabIdRef.current = next;
        return next;
      });
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

    if (activeTabId && nextActiveTabId === activeTabId) {
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
    persistUiStateSnapshot({
      activeChatTabId: nextActiveTabId || "",
      activeTab: activeTabRef.current,
      agentId: nextAgentId,
      chatFontSize: chatFontSizeRef.current,
      chatTabs: nextChatTabs,
      composerSendMode: composerSendModeRef.current,
      userLabel: userLabelRef.current,
      dismissedTaskRelationshipIdsByConversation: dismissedTaskRelationshipIdsByConversationRef.current,
      fastMode: Boolean(sessionStateRef.current.fastMode),
      inspectorPanelWidth: inspectorPanelWidthRef.current,
      messagesByTabId: nextMessagesByTabId,
      model: nextModel,
      pendingChatTurns: Object.fromEntries(
        Object.entries(pendingChatTurnsRef.current || {}).filter(([key]) => key !== previousConversationKey),
      ),
      promptDraftsByConversation: promptDraftsByConversationRef.current,
      workspaceFilesOpenByConversation: workspaceFilesOpenByConversationRef.current,
      sessionUser: nextSessionUser,
      tabMetaById: nextTabMetaById,
      thinkMode: sessionStateRef.current.thinkMode || "off",
    });
    await loadRuntime(nextSessionUser, {
      agentId: nextAgentId,
    }).catch(() => {});
    focusPrompt();
  }, [
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
  ]);

  return { handleReset };
}
