import { useEffect, useRef } from "react";
import { pendingChatStorageKey, promptHistoryStorageKey, sanitizeMessagesForStorage, storageKey } from "@/features/app/app-storage";
import { hydrateAttachmentStateFromStorage, serializeAttachmentStateForStorage } from "@/lib/attachment-storage";

export function useAppPersistence({
  activeTab,
  fastMode,
  initialStoredMessagesRef,
  initialStoredPendingRef,
  messages,
  messagesRef,
  model,
  pendingChatTurns,
  promptHistoryByConversation,
  session,
  setMessagesSynced,
  setPendingChatTurns,
}) {
  const storageRequestRef = useRef(0);

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
}
