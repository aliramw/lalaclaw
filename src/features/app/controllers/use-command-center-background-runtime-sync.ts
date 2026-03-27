import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMessage, ChatTab, ChatTabMeta, ConversationPendingMap } from "@/types/chat";
import type { AppSession, RuntimePeeks } from "@/types/runtime";
import { createConversationKey } from "@/features/app/state/app-session-identity";
import {
  mergeConversationAttachments,
  mergeConversationIdentity,
} from "@/features/chat/state/chat-conversation-merge";
import { buildDurableConversationMessages } from "@/features/chat/state/chat-pending-conversation";
import {
  hasAuthoritativePendingAssistantReply,
  resolveRuntimePendingEntry,
} from "@/features/chat/state/chat-runtime-pending";
import { shouldReuseSettledLocalConversationTail } from "@/features/chat/state/chat-settled-conversation";
import { apiFetch } from "@/lib/api-client";
import { normalizeStatusKey } from "@/features/session/status-display";
import { mergeRuntimeFiles } from "@/features/session/runtime/use-runtime-snapshot";
import { isImSessionUser } from "@/features/session/im-session";
import { buildSettledConversationMessages, buildSettledPendingConversationMessages } from "@/features/chat/state/chat-session-view";
import {
  buildChatTabTitle,
  createTabMeta,
  resolveAgentIdFromTabId,
  resolveImRuntimeSessionUser,
  resolveRuntimeTabAgentId,
  shouldApplyRuntimeSnapshotToTab,
  shouldReuseTabState,
} from "@/features/app/controllers/use-command-center-helpers";

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

type UseCommandCenterBackgroundRuntimeSyncOptions = {
  activeChatTabId: string;
  backgroundRuntimeAbortByTabIdRef: MutableRefObject<Record<string, AbortController>>;
  chatTabs: ChatTab[];
  i18nFastModeOn: string;
  i18nJustReset: string;
  i18nThinkingPlaceholder: string;
  intlLocale: string;
  messagesByTabIdRef: MutableRefObject<Record<string, ChatMessage[]>>;
  pendingChatTurnsRef: MutableRefObject<ConversationPendingMap>;
  runtimeRequestByTabIdRef: MutableRefObject<Record<string, number>>;
  setBusyForTab: (tabId: string, value: boolean | ((current: boolean) => boolean)) => void;
  setMessagesForTab: (tabId: string, value: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => void;
  setRuntimeCacheByTabId: Dispatch<SetStateAction<Record<string, RuntimeCacheEntry>>>;
  tabMetaByIdRef: MutableRefObject<Record<string, ChatTabMeta>>;
  updateTabIdentity: (tabId: string, value: { agentId?: string; sessionUser?: string }) => void;
  updateTabMeta: (tabId: string, value: Record<string, unknown> | ((current: ChatTabMeta) => ChatTabMeta)) => void;
  updateTabSession: (tabId: string, value: AppSession | ((current: AppSession) => AppSession)) => void;
};

export function useCommandCenterBackgroundRuntimeSync({
  activeChatTabId,
  backgroundRuntimeAbortByTabIdRef,
  chatTabs,
  i18nFastModeOn,
  i18nJustReset,
  i18nThinkingPlaceholder,
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
}: UseCommandCenterBackgroundRuntimeSyncOptions) {
  const shouldPreferAuthoritativeEmptySnapshot = useCallback(({
    sessionUser = "",
    updatedLabel = "",
  }: {
    sessionUser?: string;
    updatedLabel?: string;
  } = {}) => {
    const normalizedSessionUser = String(sessionUser || "").trim();
    if (normalizedSessionUser.startsWith("command-center-reset-")) {
      return true;
    }

    return Boolean(i18nJustReset) && String(updatedLabel || "").trim() === String(i18nJustReset || "").trim();
  }, [i18nJustReset]);

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
      const runtimeSessionUser = resolveImRuntimeSessionUser({
        tabId,
        agentId,
        sessionUser,
      });

      if (!tabId || !sessionUser) {
        return;
      }

      if (backgroundRuntimeAbortByTabIdRef.current[tabId]) {
        return;
      }

      const requestVersion = (runtimeRequestByTabIdRef.current[tabId] || 0) + 1;
      runtimeRequestByTabIdRef.current = {
        ...runtimeRequestByTabIdRef.current,
        [tabId]: requestVersion,
      };
      const controller = new AbortController();
      backgroundRuntimeAbortByTabIdRef.current = {
        ...backgroundRuntimeAbortByTabIdRef.current,
        [tabId]: controller,
      };

      try {
        const params = new URLSearchParams({
          sessionUser: runtimeSessionUser || sessionUser,
          agentId,
        });
        const response = await apiFetch(`/api/runtime?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (
          !response.ok
          || !payload.ok
          || cancelled
          || controller.signal.aborted
          || runtimeRequestByTabIdRef.current[tabId] !== requestVersion
        ) {
          return;
        }

        const snapshotSession = payload.session || {};
        const resolvedSessionUser = String(snapshotSession.sessionUser || "").trim();
        const normalizedStatus = normalizeStatusKey(snapshotSession.status);
        const nextFastMode =
          snapshotSession.fastMode === i18nFastModeOn
          || snapshotSession.fastMode === "开启"
          || snapshotSession.fastMode === true
          || payload.fastMode === true;
        const shouldApplySnapshot = shouldApplyRuntimeSnapshotToTab({
          currentAgentId: resolveAgentIdFromTabId(tabId) || tab?.agentId || agentId,
          currentSessionUser: tab?.sessionUser || sessionUser,
          requestedAgentId: agentId,
          requestedSessionUser: sessionUser,
          resolvedSessionUser,
        });

        if (!shouldApplySnapshot) {
          return;
        }

        setRuntimeCacheByTabId((current) => {
          const previous: Partial<RuntimeCacheEntry> = current[tabId] || {};
          const nextCache = {
            agents: payload.agents || [],
            artifacts: payload.artifacts || [],
            availableAgents: snapshotSession.availableAgents || payload.availableAgents || [],
            availableModels: snapshotSession.availableModels || payload.availableModels || [],
            files: mergeRuntimeFiles(previous.files || [], payload.files || []),
            overviewReady: true,
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

        const currentTabMeta = tabMetaByIdRef.current[tabId] || createTabMeta({ id: tabId, agentId, sessionUser });

        if (Array.isArray(payload.conversation)) {
          const currentMessages = messagesByTabIdRef.current[tabId] || [];
          const nextTabSessionUser = resolvedSessionUser || sessionUser;
          const nextTabAgentId = resolveRuntimeTabAgentId({
            requestedAgentId: agentId,
            currentAgentId: currentTabMeta.agentId,
            snapshotAgentId: snapshotSession.agentId,
            sessionUser: nextTabSessionUser,
          });
          const nextConversationKey = createConversationKey(nextTabSessionUser, nextTabAgentId);
          const nextConversationWithAttachments = mergeConversationAttachments(payload.conversation, currentMessages);
          const baseMergedConversation = mergeConversationIdentity(nextConversationWithAttachments, currentMessages);
          const pendingEntry = resolveRuntimePendingEntry({
            agentId: nextTabAgentId,
            conversationKey: nextConversationKey,
            conversationMessages: baseMergedConversation,
            localMessages: currentMessages,
            pendingChatTurns: pendingChatTurnsRef.current,
            sessionStatus: snapshotSession.status,
            sessionUser: nextTabSessionUser,
          });
          const mergedConversation = pendingEntry
            ? mergeConversationIdentity(nextConversationWithAttachments, currentMessages, pendingEntry)
            : baseMergedConversation;
          const snapshotHasAssistantReply = pendingEntry
            ? hasAuthoritativePendingAssistantReply(mergedConversation, pendingEntry)
            : false;
          const allowEmptySnapshotLocalTail = shouldReuseSettledLocalConversationTail({
            snapshotMessages: mergedConversation,
            pendingEntry,
            status: snapshotSession.status,
            preferAuthoritativeEmptySnapshot: shouldPreferAuthoritativeEmptySnapshot({
              sessionUser: snapshotSession.sessionUser || nextTabSessionUser,
              updatedLabel: String(snapshotSession.updatedLabel || ""),
            }),
          });
          const durableBackgroundConversation = buildDurableConversationMessages({
            messages: mergedConversation,
            pendingEntry,
            localMessages: currentMessages.filter((message) => !message?.pending),
            snapshotHasAssistantReply,
            allowEmptySnapshotLocalTail,
          });
          const settledBackgroundConversation = pendingEntry && !snapshotHasAssistantReply
            ? buildSettledPendingConversationMessages({
                messages: mergedConversation,
                pendingEntry,
                pendingLabel: i18nThinkingPlaceholder,
                localMessages: currentMessages,
              })
            : buildSettledConversationMessages(
                durableBackgroundConversation,
                pendingEntry,
              );

          setMessagesForTab(tabId, settledBackgroundConversation);
        }

        const nextTabSessionUser = resolvedSessionUser || currentTabMeta.sessionUser || sessionUser;
        const nextTabAgentId = resolveRuntimeTabAgentId({
          requestedAgentId: agentId,
          currentAgentId: currentTabMeta.agentId,
          snapshotAgentId: snapshotSession.agentId,
          sessionUser: nextTabSessionUser,
        });

        updateTabMeta(tabId, (current) => ({
          ...current,
          agentId: nextTabAgentId,
          sessionUser: nextTabSessionUser,
          model: snapshotSession.selectedModel || payload.model || current.model || "",
          fastMode: nextFastMode,
          thinkMode: snapshotSession.thinkMode || current.thinkMode || "off",
          title: buildChatTabTitle(nextTabAgentId, nextTabSessionUser, { locale: intlLocale }),
        }));

        updateTabSession(tabId, (current) => ({
          ...current,
          ...snapshotSession,
          agentId: nextTabAgentId,
          selectedAgentId: nextTabAgentId,
          sessionUser: nextTabSessionUser,
          mode: snapshotSession.mode || current.mode,
        }));

        if (resolvedSessionUser && resolvedSessionUser !== sessionUser) {
          updateTabIdentity(tabId, {
            agentId: nextTabAgentId,
            sessionUser: resolvedSessionUser,
          });
        }

        const currentMessages = messagesByTabIdRef.current[tabId] || [];
        const nextConversationKey = createConversationKey(nextTabSessionUser, nextTabAgentId);
        const hasTrackedPendingTurn = Boolean(
          resolveRuntimePendingEntry({
            agentId: nextTabAgentId,
            conversationKey: nextConversationKey,
            localMessages: currentMessages,
            pendingChatTurns: pendingChatTurnsRef.current,
            sessionStatus: snapshotSession.status,
            sessionUser: nextTabSessionUser,
          }),
        );
        setBusyForTab(tabId, normalizedStatus === "running" || normalizedStatus === "dispatching" || hasTrackedPendingTurn);
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") {
          return;
        }
      } finally {
        if (backgroundRuntimeAbortByTabIdRef.current[tabId] === controller) {
          const nextAbortControllers = { ...backgroundRuntimeAbortByTabIdRef.current };
          delete nextAbortControllers[tabId];
          backgroundRuntimeAbortByTabIdRef.current = nextAbortControllers;
        }
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
      for (const controller of Object.values(backgroundRuntimeAbortByTabIdRef.current)) {
        controller?.abort?.();
      }
      backgroundRuntimeAbortByTabIdRef.current = {};
    };
  }, [
    activeChatTabId,
    backgroundRuntimeAbortByTabIdRef,
    chatTabs,
    i18nFastModeOn,
    i18nJustReset,
    i18nThinkingPlaceholder,
    intlLocale,
    messagesByTabIdRef,
    pendingChatTurnsRef,
    runtimeRequestByTabIdRef,
    setBusyForTab,
    setMessagesForTab,
    setRuntimeCacheByTabId,
    shouldPreferAuthoritativeEmptySnapshot,
    tabMetaByIdRef,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);
}
