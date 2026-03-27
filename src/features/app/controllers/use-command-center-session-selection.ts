import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMessage, ChatTab, ChatTabMeta } from "@/types/chat";
import type { AppSession } from "@/types/runtime";
import { createAgentSessionUser, createAgentTabId, defaultSessionUser } from "@/features/app/state/app-session-identity";
import { createImBootstrapSessionUser, isImSessionUser, resolveImSessionType } from "@/features/session/im-session";
import { apiFetch } from "@/lib/api-client";
import {
  buildChatTabTitle,
  buildOptimisticSessionKey,
  createSessionForTab,
  createTabMeta,
  isGeneratedAgentBootstrapSessionUser,
  planSearchedSessionTabTarget,
  resolveAgentIdFromTabId,
  resolveConfiguredImAgentId,
} from "@/features/app/controllers/use-command-center-helpers";

export type SearchSessionsOptions = {
  channel?: string;
};

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
};

type UseCommandCenterSessionSelectionOptions = {
  activeChatTabIdRef: MutableRefObject<string>;
  availableAgents: string[];
  availableModels: string[];
  chatTabsRef: MutableRefObject<ChatTab[]>;
  clearSnapshotData: () => void;
  flushVisibleConversationScrollTop: () => void;
  focusPrompt: () => void;
  i18n: Parameters<typeof createSessionForTab>[0];
  imChannelConfigsRef: MutableRefObject<Record<string, { enabled?: boolean; defaultAgentId?: string; channel?: string }> | null>;
  intlLocale: string;
  loadImChannelConfigs: ({ force }?: { force?: boolean }) => Promise<Record<string, { enabled?: boolean; defaultAgentId?: string; channel?: string }> | null>;
  loadRuntime: (sessionUser: string, options?: { agentId?: string }) => Promise<unknown>;
  messagesByTabIdRef: MutableRefObject<Record<string, ChatMessage[]>>;
  session: AppSession;
  sessionByTabIdRef: MutableRefObject<Record<string, AppSession>>;
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  setActiveChatTabId: Dispatch<SetStateAction<string>>;
  setActiveTarget: (value: { sessionUser?: string; agentId?: string }) => void;
  setBusyForTab: (tabId: string, value: boolean | ((current: boolean) => boolean)) => void;
  setChatTabs: Dispatch<SetStateAction<ChatTab[]>>;
  setFocusMessageRequest: Dispatch<SetStateAction<{
    id: string;
    messageId?: string;
    role?: string;
    source?: string;
    timestamp?: number;
  } | null>>;
  setMessagesForTab: (tabId: string, value: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => void;
  setSession: Dispatch<SetStateAction<AppSession>>;
  tabMetaByIdRef: MutableRefObject<Record<string, ChatTabMeta>>;
  updateTabIdentity: (tabId: string, value: { agentId?: string; sessionUser?: string }) => void;
  updateTabMeta: (tabId: string, value: Record<string, unknown> | ((current: ChatTabMeta) => ChatTabMeta)) => void;
  updateTabSession: (tabId: string, value: AppSession | ((current: AppSession) => AppSession)) => void;
};

export function useCommandCenterSessionSelection({
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
}: UseCommandCenterSessionSelectionOptions) {
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
      sessionKey: buildOptimisticSessionKey(nextAgent, sessionUser),
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
  }, [
    activeChatTabIdRef,
    availableAgents,
    availableModels,
    chatTabsRef,
    flushVisibleConversationScrollTop,
    i18n,
    messagesByTabIdRef,
    session,
    sessionByTabIdRef,
    sessionStateRef,
    setActiveChatTabId,
    setChatTabs,
    tabMetaByIdRef,
    updateTabMeta,
    updateTabSession,
  ]);

  const handleSearchSessions = useCallback(async (searchTerm = "", options: SearchSessionsOptions = {}) => {
    const channel = String(options.channel || "dingtalk-connector").trim() || "dingtalk-connector";
    const imConfigs = await loadImChannelConfigs();
    if (imConfigs?.[channel] && imConfigs[channel].enabled === false) {
      return [];
    }

    const agentId = resolveConfiguredImAgentId(
      imConfigs,
      channel,
      String(sessionStateRef.current.agentId || session.agentId || "main").trim() || "main",
    );
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
  }, [i18n.common.requestFailed, loadImChannelConfigs, session.agentId, sessionStateRef]);

  const handleSelectSearchedSession = useCallback(async (sessionMatch) => {
    const nextSessionUser = String(sessionMatch?.sessionUser || "").trim();
    const fallbackAgentId = String(sessionStateRef.current.agentId || "main").trim() || "main";
    const imConfigs = isImSessionUser(nextSessionUser) ? await loadImChannelConfigs() : imChannelConfigsRef.current;
    const configuredImAgentId = isImSessionUser(nextSessionUser)
      ? resolveConfiguredImAgentId(imConfigs, nextSessionUser, fallbackAgentId)
      : fallbackAgentId;
    const nextAgentId = String(sessionMatch?.agentId || configuredImAgentId || fallbackAgentId).trim() || "main";
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
        sessionKey: buildOptimisticSessionKey(nextAgentId, nextSessionUser),
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
    session,
    sessionStateRef,
    setActiveChatTabId,
    setActiveTarget,
    setBusyForTab,
    setChatTabs,
    setFocusMessageRequest,
    setMessagesForTab,
    setSession,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);

  const handleOpenImSession = useCallback(async (channel) => {
    const imConfigs = await loadImChannelConfigs();
    if (imConfigs?.[channel] && imConfigs[channel].enabled === false) {
      return;
    }

    const nextAgentId = resolveConfiguredImAgentId(
      imConfigs,
      channel,
      String(sessionStateRef.current.agentId || session.agentId || "main").trim() || "main",
    );
    const bootstrapSessionUser = createImBootstrapSessionUser(channel);
    const targetImType = resolveImSessionType(bootstrapSessionUser);

    if (!bootstrapSessionUser || !targetImType) {
      return;
    }

    const existingImTab = chatTabsRef.current.find((tab) =>
      String(resolveAgentIdFromTabId(tab?.id) || tab?.agentId || "").trim() === nextAgentId
      && resolveImSessionType(tab?.sessionUser || "") === targetImType,
    );

    if (existingImTab?.id) {
      flushVisibleConversationScrollTop();
      activeChatTabIdRef.current = existingImTab.id;
      setActiveChatTabId(existingImTab.id);
      return;
    }

    await handleSelectSearchedSession({
      agentId: nextAgentId,
      sessionUser: bootstrapSessionUser,
      title: buildChatTabTitle(nextAgentId, bootstrapSessionUser, { locale: intlLocale }),
    });
  }, [
    activeChatTabIdRef,
    chatTabsRef,
    flushVisibleConversationScrollTop,
    handleSelectSearchedSession,
    intlLocale,
    loadImChannelConfigs,
    session.agentId,
    sessionStateRef,
    setActiveChatTabId,
  ]);

  return {
    handleOpenImSession,
    handleSearchSessions,
    handleSelectSearchedSession,
    openOrActivateAgentTab,
  };
}
