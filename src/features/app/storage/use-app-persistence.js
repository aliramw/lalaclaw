import { useEffect, useRef } from "react";
import { pendingChatStorageKey, promptDraftStorageKey, promptHistoryStorageKey, sanitizeMessagesForStorage, storageKey } from "@/features/app/storage/app-storage";
import { hydrateAttachmentStateFromStorage, serializeAttachmentStateForStorage } from "@/lib/attachment-storage";

export function useAppPersistence({
  activeTab,
  chatFontSizeBySessionUser,
  dismissedTaskRelationshipIdsByConversation,
  fastMode,
  initialStoredMessagesRef,
  initialStoredPendingRef,
  inspectorPanelWidth,
  messages,
  messagesRef,
  model,
  pendingChatTurns,
  promptDraftsByConversation,
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
      chatFontSizeBySessionUser,
      dismissedTaskRelationshipIdsByConversation,
      fastMode,
      inspectorPanelWidth,
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
            promptDraftsByConversation,
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
              promptDraftsByConversation,
              messages: sanitizeMessagesForStorage(messages),
            }),
          );
          window.localStorage.setItem(pendingChatStorageKey, JSON.stringify(pendingChatTurns));
        } catch {}
      });
  }, [activeTab, chatFontSizeBySessionUser, dismissedTaskRelationshipIdsByConversation, fastMode, inspectorPanelWidth, messages, model, pendingChatTurns, promptDraftsByConversation, session.agentId, session.sessionUser, session.thinkMode]);

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
  }, [initialStoredMessagesRef, initialStoredPendingRef, messagesRef, setMessagesSynced, setPendingChatTurns]);
}
