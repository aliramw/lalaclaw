import { useCallback, useEffect, useRef } from "react";
import {
  legacyStorageKey,
  pendingChatStorageKey,
  promptDraftStorageKey,
  promptHistoryStorageKey,
  sanitizeMessagesForStorage,
  storageKey,
} from "@/features/app/storage/app-storage";
import { hydrateAttachmentStateByKeyFromStorage, serializeAttachmentStateByKeyForStorage } from "@/lib/attachment-storage";

export function useAppPersistence({
  activeChatTabId,
  activeTab,
  chatFontSizeBySessionUser,
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
}) {
  const storageRequestRef = useRef(0);
  const writeUiState = useCallback((payload) => {
    const serialized = JSON.stringify(payload);
    try {
      window.localStorage.setItem(storageKey, serialized);
      window.localStorage.setItem(legacyStorageKey, serialized);
    } catch {}
  }, []);

  useEffect(() => {
    const requestId = storageRequestRef.current + 1;
    storageRequestRef.current = requestId;

    const nextStorageState = {
      activeChatTabId,
      activeTab,
      chatTabs,
      chatFontSizeBySessionUser,
      dismissedTaskRelationshipIdsByConversation,
      fastMode,
      inspectorPanelWidth,
      thinkMode: session.thinkMode,
      model,
      agentId: session.agentId,
      sessionUser: session.sessionUser,
      tabMetaById,
    };
    const fallbackSerializedMessagesByTabId = Object.fromEntries(
      Object.entries(messagesByTabId || {}).map(([key, items]) => [key, sanitizeMessagesForStorage(items)]),
    );
    const fallbackStoragePayload = {
      ...nextStorageState,
      promptDraftsByConversation,
      messages: sanitizeMessagesForStorage(messages),
      messagesByTabId: fallbackSerializedMessagesByTabId,
    };

    writeUiState(fallbackStoragePayload);

    void serializeAttachmentStateByKeyForStorage(messagesByTabId, pendingChatTurns)
      .then((serializedState) => {
        if (requestId !== storageRequestRef.current) {
          return;
        }

        writeUiState({
          ...nextStorageState,
          promptDraftsByConversation,
          messages: sanitizeMessagesForStorage(serializedState.messagesByKey[activeChatTabId] || messages),
          messagesByTabId: Object.fromEntries(
            Object.entries(serializedState.messagesByKey || {}).map(([key, items]) => [key, sanitizeMessagesForStorage(items)]),
          ),
        });
        window.localStorage.setItem(pendingChatStorageKey, JSON.stringify(serializedState.pendingChatTurns));
      })
      .catch(() => {
        writeUiState(fallbackStoragePayload);
        try {
          window.localStorage.setItem(pendingChatStorageKey, JSON.stringify(pendingChatTurns));
        } catch {}
      });
  }, [
    activeChatTabId,
    activeTab,
    chatFontSizeBySessionUser,
    chatTabs,
    dismissedTaskRelationshipIdsByConversation,
    fastMode,
    inspectorPanelWidth,
    messages,
    messagesByTabId,
    model,
    pendingChatTurns,
    promptDraftsByConversation,
    session.agentId,
    session.sessionUser,
    session.thinkMode,
    tabMetaById,
    writeUiState,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(promptHistoryStorageKey, JSON.stringify(promptHistoryByConversation));
    } catch {}
  }, [promptHistoryByConversation]);

  useEffect(() => {
    try {
      window.localStorage.setItem(promptDraftStorageKey, JSON.stringify(promptDraftsByConversation));
    } catch {}
  }, [promptDraftsByConversation]);

  useEffect(() => {
    const initialMessagesByTabId = initialStoredMessagesByTabIdRef.current;
    const initialPendingChatTurns = initialStoredPendingRef.current;
    const initialActiveMessages = initialMessagesByTabId?.[activeChatTabId] || [];

    if (!Object.keys(initialMessagesByTabId || {}).length && !Object.keys(initialPendingChatTurns || {}).length) {
      return;
    }

    void hydrateAttachmentStateByKeyFromStorage(initialMessagesByTabId, initialPendingChatTurns).then((hydratedState) => {
      const nextMessagesByTabId = hydratedState.messagesByKey || {};
      setMessagesByTabId((current) => (current === initialMessagesByTabId ? nextMessagesByTabId : current));

      if (messagesRef.current === initialActiveMessages) {
        setMessagesSynced(nextMessagesByTabId[activeChatTabId] || []);
      }

      setPendingChatTurns((current) => (current === initialPendingChatTurns ? hydratedState.pendingChatTurns : current));
    });
  }, [activeChatTabId, initialStoredMessagesByTabIdRef, initialStoredPendingRef, messagesRef, setMessagesByTabId, setMessagesSynced, setPendingChatTurns]);
}
