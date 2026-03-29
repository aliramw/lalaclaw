import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMessage, ChatTab, ChatTabMeta } from "@/types/chat";
import type { AppSession } from "@/types/runtime";
import { defaultSessionUser } from "@/features/app/state/app-session-identity";
import {
  createSessionForTab,
  createTabMeta,
  shouldReuseTabState,
} from "@/features/app/controllers/use-command-center-helpers";
import { pushCcDebugEvent } from "@/lib/cc-debug-events";

type TabIdentity = {
  agentId?: string;
  sessionUser?: string;
};

type TabMutation<T> = T | ((current: T) => T);

type UseCommandCenterTabStateOptions = {
  i18n: Parameters<typeof createSessionForTab>[0];
  activeChatTabIdRef: MutableRefObject<string>;
  chatTabsRef: MutableRefObject<ChatTab[]>;
  tabMetaByIdRef: MutableRefObject<Record<string, ChatTabMeta>>;
  messagesByTabIdRef: MutableRefObject<Record<string, ChatMessage[]>>;
  sessionByTabIdRef: MutableRefObject<Record<string, AppSession>>;
  busyByTabIdRef: MutableRefObject<Record<string, boolean>>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setBusyByTabId: Dispatch<SetStateAction<Record<string, boolean>>>;
  setChatTabs: Dispatch<SetStateAction<ChatTab[]>>;
  setFastMode: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesByTabId: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  setModel: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<AppSession>>;
  setSessionByTabId: Dispatch<SetStateAction<Record<string, AppSession>>>;
  setTabMetaById: Dispatch<SetStateAction<Record<string, ChatTabMeta>>>;
};

export function useCommandCenterTabState({
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
}: UseCommandCenterTabStateOptions) {
  const setMessagesForTab = useCallback((tabId, value) => {
    const previous = messagesByTabIdRef.current[tabId] || [];
    const next = typeof value === "function" ? value(previous) : value;

    if (messagesByTabIdRef.current[tabId] === next || shouldReuseTabState(previous, next)) {
      return;
    }

    const updated = {
      ...messagesByTabIdRef.current,
      [tabId]: next,
    };
    messagesByTabIdRef.current = updated;

    if (activeChatTabIdRef.current === tabId) {
      messagesRef.current = next;
      setMessages(next);
    }

    setMessagesByTabId((current) => {
      const currentPrevious = current[tabId] || [];
      if (current[tabId] === next || shouldReuseTabState(currentPrevious, next)) {
        return current;
      }

      return {
        ...current,
        [tabId]: next,
      };
    });
  }, [activeChatTabIdRef, messagesByTabIdRef, messagesRef, setMessages, setMessagesByTabId]);

  const setMessagesSynced = useCallback((value) => {
    if (!activeChatTabIdRef.current) {
      return;
    }
    setMessagesForTab(activeChatTabIdRef.current, value);
  }, [activeChatTabIdRef, setMessagesForTab]);

  const setBusyForTab = useCallback((tabId, value) => {
    setBusyByTabId((current) => {
      const previous = Boolean(current[tabId]);
      const next = typeof value === "function" ? Boolean(value(previous)) : Boolean(value);
      if (previous === next) {
        return current;
      }

      pushCcDebugEvent("command-center.busy", {
        tabId,
        previous,
        next,
      });

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
  }, [activeChatTabIdRef, busyByTabIdRef, setBusy, setBusyByTabId]);

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
  }, [activeChatTabIdRef, chatTabsRef, i18n, sessionByTabIdRef, setSession, setSessionByTabId, tabMetaByIdRef]);

  const updateTabMeta = useCallback((tabId, value) => {
    setTabMetaById((current) => {
      const tab = chatTabsRef.current.find((entry) => entry.id === tabId) || {
        id: tabId,
        agentId: "main",
        sessionUser: defaultSessionUser,
      };
      const previous = current[tabId] || createTabMeta(tab);
      const nextBase = typeof value === "function" ? value(previous) : { ...previous, ...value };
      const identityChanged =
        previous.agentId !== nextBase.agentId
        || previous.sessionUser !== nextBase.sessionUser;
      const next = identityChanged
        ? {
            ...nextBase,
            sessionFiles: [],
            sessionFileRewrites: [],
          }
        : nextBase;

      if (
        previous.agentId === next.agentId
        && previous.sessionUser === next.sessionUser
        && previous.model === next.model
        && previous.fastMode === next.fastMode
        && previous.thinkMode === next.thinkMode
        && previous.title === next.title
        && JSON.stringify(previous.sessionFiles || []) === JSON.stringify(next.sessionFiles || [])
        && JSON.stringify(previous.sessionFileRewrites || []) === JSON.stringify(next.sessionFileRewrites || [])
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
  }, [activeChatTabIdRef, chatTabsRef, setFastMode, setModel, setTabMetaById, tabMetaByIdRef]);

  const updateTabIdentity = useCallback((tabId: string, value: TabMutation<TabIdentity> = {}) => {
    setChatTabs((current) => {
      const currentIdentity = current.find((tab) => tab.id === tabId) || null;
      const nextIdentity = typeof value === "function"
        ? value({
            agentId: currentIdentity?.agentId,
            sessionUser: currentIdentity?.sessionUser,
          })
        : value;
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
  }, [chatTabsRef, setChatTabs]);

  const getMessagesForTab = useCallback((tabId) => messagesByTabIdRef.current[tabId] || [], [messagesByTabIdRef]);
  const isTabActive = useCallback((tabId) => activeChatTabIdRef.current === tabId, [activeChatTabIdRef]);

  return {
    getMessagesForTab,
    isTabActive,
    setBusyForTab,
    setMessagesForTab,
    setMessagesSynced,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  };
}
