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

const chatPersistenceDebounceMs = 450;

export function useAppPersistence({
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
}) {
  const storageRequestRef = useRef(0);
  const persistenceTimerRef = useRef(0);
  const pendingPersistenceRef = useRef(null);
  const previousMessagesByTabIdRef = useRef(messagesByTabId);
  const previousPendingChatTurnsRef = useRef(pendingChatTurns);
  const writeUiState = useCallback((payload) => {
    try {
      const persistedAt = Number(payload?._persistedAt || 0) || Date.now();
      const readStoredPersistedAt = (raw) => {
        if (!raw) {
          return 0;
        }
        try {
          return Number(JSON.parse(raw)?._persistedAt || 0) || 0;
        } catch {
          return 0;
        }
      };
      const currentPersistedAt = Math.max(
        readStoredPersistedAt(window.localStorage.getItem(storageKey)),
        readStoredPersistedAt(window.localStorage.getItem(legacyStorageKey)),
      );
      if (currentPersistedAt > persistedAt) {
        return;
      }
      const serialized = JSON.stringify({
        ...payload,
        _persistedAt: persistedAt,
      });
      window.localStorage.setItem(storageKey, serialized);
      window.localStorage.setItem(legacyStorageKey, serialized);
    } catch {}
  }, []);

  const writePendingChatTurns = useCallback((nextPendingChatTurns, persistedAt) => {
    try {
      const readStoredPersistedAt = (raw) => {
        if (!raw) {
          return 0;
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && parsed.pendingChatTurns) {
            return Number(parsed._persistedAt || 0) || 0;
          }
          return 0;
        } catch {
          return 0;
        }
      };
      const currentPersistedAt = readStoredPersistedAt(window.localStorage.getItem(pendingChatStorageKey));
      if (currentPersistedAt > persistedAt) {
        return;
      }
      window.localStorage.setItem(
        pendingChatStorageKey,
        JSON.stringify({
          _persistedAt: persistedAt,
          pendingChatTurns: nextPendingChatTurns,
        }),
      );
    } catch {}
  }, []);

  const flushPendingPersistence = useCallback(({ skipAttachmentSerialization = false } = {}) => {
    const payload = pendingPersistenceRef.current;
    if (!payload) {
      return;
    }

    window.clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = 0;

    const requestId = storageRequestRef.current + 1;
    storageRequestRef.current = requestId;

    writeUiState(payload.fallbackStoragePayload);
    writePendingChatTurns(payload.pendingChatTurns, payload.persistedAt);

    if (skipAttachmentSerialization) {
      return;
    }

    void serializeAttachmentStateByKeyForStorage(payload.messagesByTabId, payload.pendingChatTurns)
      .then((serializedState) => {
        if (requestId !== storageRequestRef.current) {
          return;
        }

        writeUiState({
          ...payload.nextStorageState,
          promptDraftsByConversation: payload.promptDraftsByConversation,
          messages: sanitizeMessagesForStorage(serializedState.messagesByKey[payload.activeChatTabId] || payload.messages),
          messagesByTabId: Object.fromEntries(
            Object.entries(serializedState.messagesByKey || {}).map(([key, items]) => [key, sanitizeMessagesForStorage(items)]),
          ),
        });
        writePendingChatTurns(serializedState.pendingChatTurns, payload.persistedAt);
      })
      .catch(() => {
        if (requestId !== storageRequestRef.current) {
          return;
        }

        writeUiState(payload.fallbackStoragePayload);
        writePendingChatTurns(payload.pendingChatTurns, payload.persistedAt);
      });
  }, [writePendingChatTurns, writeUiState]);

  useEffect(() => {
    const persistedAt = Date.now();

    const nextStorageState = {
      _persistedAt: persistedAt,
      activeChatTabId,
      activeTab,
      chatTabs,
      chatFontSize,
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

    pendingPersistenceRef.current = {
      activeChatTabId,
      fallbackStoragePayload,
      messages,
      messagesByTabId,
      nextStorageState,
      pendingChatTurns,
      persistedAt,
      promptDraftsByConversation,
    };

    const shouldDebouncePersistence =
      previousMessagesByTabIdRef.current !== messagesByTabId
      || previousPendingChatTurnsRef.current !== pendingChatTurns;

    previousMessagesByTabIdRef.current = messagesByTabId;
    previousPendingChatTurnsRef.current = pendingChatTurns;

    if (!shouldDebouncePersistence) {
      flushPendingPersistence();
      return undefined;
    }

    window.clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = window.setTimeout(() => {
      flushPendingPersistence();
    }, chatPersistenceDebounceMs);

    return () => {
      window.clearTimeout(persistenceTimerRef.current);
    };
  }, [
    activeChatTabId,
    activeTab,
    chatFontSize,
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
    flushPendingPersistence,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingPersistence({ skipAttachmentSerialization: true });
      }
    };

    const handlePageHide = () => {
      flushPendingPersistence({ skipAttachmentSerialization: true });
    };

    window.addEventListener("beforeunload", handlePageHide);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handlePageHide);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushPendingPersistence({ skipAttachmentSerialization: true });
    };
  }, [flushPendingPersistence]);

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
