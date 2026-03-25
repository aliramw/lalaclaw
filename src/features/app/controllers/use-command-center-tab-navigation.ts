import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatTab } from "@/types/chat";

type UseCommandCenterTabNavigationOptions = {
  activeChatTabIdRef: MutableRefObject<string>;
  chatTabsRef: MutableRefObject<ChatTab[]>;
  flushVisibleConversationScrollTop: () => void;
  setActiveChatTabId: Dispatch<SetStateAction<string>>;
  setChatTabs: Dispatch<SetStateAction<ChatTab[]>>;
  setUnreadCountByTabId: Dispatch<SetStateAction<Record<string, number>>>;
  settledMessageKeysByTabIdRef: MutableRefObject<Record<string, unknown>>;
  unreadCountByTabIdRef: MutableRefObject<Record<string, number>>;
};

export function useCommandCenterTabNavigation({
  activeChatTabIdRef,
  chatTabsRef,
  flushVisibleConversationScrollTop,
  setActiveChatTabId,
  setChatTabs,
  setUnreadCountByTabId,
  settledMessageKeysByTabIdRef,
  unreadCountByTabIdRef,
}: UseCommandCenterTabNavigationOptions) {
  const handleActivateChatTab = useCallback((tabId) => {
    if (!tabId || tabId === activeChatTabIdRef.current) {
      return;
    }
    flushVisibleConversationScrollTop();
    if (unreadCountByTabIdRef.current[tabId]) {
      const nextUnreadCountByTabId = { ...unreadCountByTabIdRef.current };
      delete nextUnreadCountByTabId[tabId];
      unreadCountByTabIdRef.current = nextUnreadCountByTabId;
      setUnreadCountByTabId(nextUnreadCountByTabId);
    }
    activeChatTabIdRef.current = tabId;
    setActiveChatTabId(tabId);
  }, [activeChatTabIdRef, flushVisibleConversationScrollTop, setActiveChatTabId, setUnreadCountByTabId, unreadCountByTabIdRef]);

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
  }, [chatTabsRef, handleActivateChatTab]);

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
  }, [activeChatTabIdRef, chatTabsRef, handleActivateChatTab]);

  const handleCloseChatTab = useCallback((tabId) => {
    if (unreadCountByTabIdRef.current[tabId]) {
      const nextUnreadCountByTabId = { ...unreadCountByTabIdRef.current };
      delete nextUnreadCountByTabId[tabId];
      unreadCountByTabIdRef.current = nextUnreadCountByTabId;
      setUnreadCountByTabId(nextUnreadCountByTabId);
    }
    if (settledMessageKeysByTabIdRef.current[tabId]) {
      const nextSettledMessageKeysByTabId = { ...settledMessageKeysByTabIdRef.current };
      delete nextSettledMessageKeysByTabId[tabId];
      settledMessageKeysByTabIdRef.current = nextSettledMessageKeysByTabId;
    }
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
  }, [
    activeChatTabIdRef,
    chatTabsRef,
    flushVisibleConversationScrollTop,
    setActiveChatTabId,
    setChatTabs,
    setUnreadCountByTabId,
    settledMessageKeysByTabIdRef,
    unreadCountByTabIdRef,
  ]);

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
      if (!movedTab) {
        return current;
      }
      updated.splice(insertionIndex, 0, movedTab);
      chatTabsRef.current = updated;
      return updated;
    });
  }, [chatTabsRef, setChatTabs]);

  return {
    handleActivateAdjacentChatTab,
    handleActivateChatTab,
    handleActivateChatTabByIndex,
    handleCloseChatTab,
    handleReorderChatTabs,
  };
}
