import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  legacyStorageKey,
  pendingChatStorageKey,
  promptDraftStorageKey,
  promptHistoryStorageKey,
  sanitizeMessagesForStorage,
  storageKey,
} from "@/features/app/storage/app-storage";
import type { ChatMessage } from "@/types/chat";
import { hydrateAttachmentStateByKeyFromStorage, serializeAttachmentStateByKeyForStorage } from "@/lib/attachment-storage";

const chatPersistenceDebounceMs = 450;

type PersistedMessage = ChatMessage & Record<string, unknown>;

type PendingChatTurns = Record<string, unknown>;
type MessagesByTabId = Record<string, PersistedMessage[]>;
type PromptDraftsByConversation = Record<string, string>;
type PromptHistoryByConversation = Record<string, string[]>;
type DismissedTaskRelationshipIdsByConversation = Record<string, string[]>;
type TabMetaById = Record<string, Record<string, unknown>>;

type SessionState = {
  agentId?: string;
  sessionUser?: string;
  thinkMode?: string;
};

type UseAppPersistenceInput = {
  activeChatTabId?: string;
  activeTab?: string;
  chatFontSize?: string;
  composerSendMode?: string;
  chatTabs?: Array<Record<string, unknown>>;
  dismissedTaskRelationshipIdsByConversation?: DismissedTaskRelationshipIdsByConversation;
  fastMode?: boolean;
  initialStoredMessagesByTabIdRef: MutableRefObject<MessagesByTabId>;
  initialStoredPendingRef: MutableRefObject<PendingChatTurns>;
  inspectorPanelWidth?: number;
  messages?: PersistedMessage[];
  messagesByTabId?: MessagesByTabId;
  messagesRef: MutableRefObject<PersistedMessage[]>;
  model?: string;
  pendingChatTurns?: PendingChatTurns;
  promptDraftsByConversation?: PromptDraftsByConversation;
  promptDraftsByConversationRef?: MutableRefObject<PromptDraftsByConversation>;
  promptHistoryByConversation?: PromptHistoryByConversation;
  session: SessionState;
  setMessagesByTabId: (updater: MessagesByTabId | ((current: MessagesByTabId) => MessagesByTabId)) => void;
  setMessagesSynced: (messages: PersistedMessage[]) => void;
  setPendingChatTurns: (updater: PendingChatTurns | ((current: PendingChatTurns) => PendingChatTurns)) => void;
  tabMetaById?: TabMetaById;
  userLabel?: string;
};

type PendingPersistencePayload = {
  activeChatTabId: string;
  messages: PersistedMessage[];
  messagesByTabId: MessagesByTabId;
  nextStorageState: Record<string, unknown>;
  pendingChatTurns: PendingChatTurns;
  persistedAt: number;
  promptDraftsByConversation: PromptDraftsByConversation;
};

type SerializedAttachmentState = {
  messagesByKey: Record<string, ChatMessage[]>;
  pendingChatTurns: PendingChatTurns;
};

export function useAppPersistence({
  activeChatTabId = "",
  activeTab = "",
  chatFontSize = "",
  composerSendMode = "enter-send",
  chatTabs = [],
  dismissedTaskRelationshipIdsByConversation = {},
  fastMode = false,
  initialStoredMessagesByTabIdRef,
  initialStoredPendingRef,
  inspectorPanelWidth = 0,
  messages = [],
  messagesByTabId = {},
  messagesRef,
  model = "",
  pendingChatTurns = {},
  promptDraftsByConversation = {},
  promptDraftsByConversationRef,
  promptHistoryByConversation = {},
  session,
  setMessagesByTabId,
  setMessagesSynced,
  setPendingChatTurns,
  tabMetaById = {},
  userLabel = "",
}: UseAppPersistenceInput) {
  const storageRequestRef = useRef(0);
  const persistenceTimerRef = useRef<number | null>(null);
  const promptDraftPersistenceTimerRef = useRef<number | null>(null);
  const hasPersistedPromptDraftsRef = useRef(false);
  const pendingPersistenceRef = useRef<PendingPersistencePayload | null>(null);
  const previousMessagesByTabIdRef = useRef(messagesByTabId);
  const previousPendingChatTurnsRef = useRef(pendingChatTurns);
  const previousPromptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const latestPromptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const writeUiState = useCallback((payload: Record<string, unknown>) => {
    try {
      const persistedAt = Number(payload?._persistedAt || 0) || Date.now();
      const readStoredPersistedAt = (raw: string | null) => {
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

  const writePendingChatTurns = useCallback((nextPendingChatTurns: PendingChatTurns, persistedAt: number) => {
    try {
      const readStoredPersistedAt = (raw: string | null) => {
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

  const flushPromptDraftPersistence = useCallback(() => {
    if (promptDraftPersistenceTimerRef.current != null) {
      window.clearTimeout(promptDraftPersistenceTimerRef.current);
    }
    promptDraftPersistenceTimerRef.current = 0;
    try {
      latestPromptDraftsByConversationRef.current = promptDraftsByConversationRef
        ? promptDraftsByConversationRef.current
        : latestPromptDraftsByConversationRef.current;
      window.localStorage.setItem(
        promptDraftStorageKey,
        JSON.stringify(latestPromptDraftsByConversationRef.current),
      );
    } catch {}
  }, [promptDraftsByConversationRef]);

  const flushPendingPersistence = useCallback(({ skipAttachmentSerialization = false }: { skipAttachmentSerialization?: boolean } = {}) => {
    const payload = pendingPersistenceRef.current;
    if (!payload) {
      return;
    }

    if (persistenceTimerRef.current != null) {
      window.clearTimeout(persistenceTimerRef.current);
    }
    persistenceTimerRef.current = 0;

    const requestId = storageRequestRef.current + 1;
    storageRequestRef.current = requestId;

    const fallbackSerializedMessagesByTabId = Object.fromEntries(
      Object.entries(payload.messagesByTabId || {}).map(([key, items]) => [key, sanitizeMessagesForStorage(items)]),
    );
    const fallbackStoragePayload = {
      ...payload.nextStorageState,
      promptDraftsByConversation: payload.promptDraftsByConversation,
      messages: sanitizeMessagesForStorage(payload.messages),
      messagesByTabId: fallbackSerializedMessagesByTabId,
    };

    writeUiState(fallbackStoragePayload);
    writePendingChatTurns(payload.pendingChatTurns, payload.persistedAt);

    if (skipAttachmentSerialization) {
      return;
    }

    void serializeAttachmentStateByKeyForStorage(payload.messagesByTabId, payload.pendingChatTurns)
      .then((serializedState: SerializedAttachmentState) => {
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

        writeUiState(fallbackStoragePayload);
        writePendingChatTurns(payload.pendingChatTurns, payload.persistedAt);
      });
  }, [writePendingChatTurns, writeUiState]);

  useEffect(() => {
    latestPromptDraftsByConversationRef.current = promptDraftsByConversationRef
      ? promptDraftsByConversationRef.current
      : promptDraftsByConversation;
  }, [promptDraftsByConversation, promptDraftsByConversationRef]);

  useEffect(() => {
    const persistedAt = Date.now();

    const nextStorageState: Record<string, unknown> = {
      _persistedAt: persistedAt,
      activeChatTabId,
      activeTab,
      chatTabs,
      chatFontSize,
      composerSendMode,
      userLabel,
      dismissedTaskRelationshipIdsByConversation,
      fastMode,
      inspectorPanelWidth,
      thinkMode: session.thinkMode,
      model,
      agentId: session.agentId,
      sessionUser: session.sessionUser,
      tabMetaById,
    };

    pendingPersistenceRef.current = {
      activeChatTabId,
      messages,
      messagesByTabId,
      nextStorageState,
      pendingChatTurns,
      persistedAt,
      promptDraftsByConversation,
    };

    const shouldDebouncePersistence =
      previousMessagesByTabIdRef.current !== messagesByTabId
      || previousPendingChatTurnsRef.current !== pendingChatTurns
      || previousPromptDraftsByConversationRef.current !== promptDraftsByConversation;

    previousMessagesByTabIdRef.current = messagesByTabId;
    previousPendingChatTurnsRef.current = pendingChatTurns;
    previousPromptDraftsByConversationRef.current = promptDraftsByConversation;

    if (!shouldDebouncePersistence) {
      flushPendingPersistence();
      return undefined;
    }

    if (persistenceTimerRef.current != null) {
      window.clearTimeout(persistenceTimerRef.current);
    }
    persistenceTimerRef.current = window.setTimeout(() => {
      flushPendingPersistence();
    }, chatPersistenceDebounceMs);

    return () => {
      if (persistenceTimerRef.current != null) {
        window.clearTimeout(persistenceTimerRef.current);
      }
    };
  }, [
    activeChatTabId,
    activeTab,
    chatFontSize,
    composerSendMode,
    userLabel,
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
        flushPromptDraftPersistence();
      }
    };

    const handlePageHide = () => {
      flushPendingPersistence({ skipAttachmentSerialization: true });
      flushPromptDraftPersistence();
    };

    window.addEventListener("beforeunload", handlePageHide);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handlePageHide);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushPendingPersistence({ skipAttachmentSerialization: true });
      flushPromptDraftPersistence();
    };
  }, [flushPendingPersistence, flushPromptDraftPersistence]);

  useEffect(() => {
    try {
      window.localStorage.setItem(promptHistoryStorageKey, JSON.stringify(promptHistoryByConversation));
    } catch {}
  }, [promptHistoryByConversation]);

  useEffect(() => {
    if (!hasPersistedPromptDraftsRef.current) {
      hasPersistedPromptDraftsRef.current = true;
      flushPromptDraftPersistence();
      return undefined;
    }

    if (promptDraftPersistenceTimerRef.current != null) {
      window.clearTimeout(promptDraftPersistenceTimerRef.current);
    }
    promptDraftPersistenceTimerRef.current = window.setTimeout(() => {
      flushPromptDraftPersistence();
    }, chatPersistenceDebounceMs);

    return () => {
      if (promptDraftPersistenceTimerRef.current != null) {
        window.clearTimeout(promptDraftPersistenceTimerRef.current);
      }
    };
  }, [flushPromptDraftPersistence, promptDraftsByConversation]);

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
