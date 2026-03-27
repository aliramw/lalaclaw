import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  persistUiStateSnapshot,
} from "@/features/app/storage/app-ui-state-storage";
import { mergeConversationAttachments } from "@/features/chat/state/chat-conversation-merge";
import { sanitizeMessagesForStorage } from "@/features/chat/state/chat-persisted-messages";
import {
  promptDraftStorageKey,
  promptHistoryStorageKey,
  sanitizePromptDraftsMap,
  sanitizePromptHistoryMap,
} from "@/features/app/state/app-prompt-storage";
import { pruneCompletedPendingChatTurns } from "@/features/app/state/app-pending-storage";
import type { ChatMessage, ChatTabMeta, ConversationPendingMap } from "@/types/chat";
import { hydrateAttachmentStateByKeyFromStorage, serializeAttachmentStateByKeyForStorage } from "@/lib/attachment-storage";

const chatPersistenceDebounceMs = 450;

type PersistedMessage = ChatMessage & Record<string, unknown>;

type PendingChatTurns = ConversationPendingMap;
type MessagesByTabId = Record<string, PersistedMessage[]>;
type PromptDraftsByConversation = Record<string, string>;
type PromptHistoryByConversation = Record<string, string[]>;
type DismissedTaskRelationshipIdsByConversation = Record<string, string[]>;
type TabMetaById = Record<string, ChatTabMeta>;

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

function hasInlineAttachmentPayload(attachment: Record<string, unknown> = {}) {
  return Boolean(
    String(attachment?.dataUrl || "").trim()
    || String(attachment?.previewUrl || "").trim()
    || String(attachment?.textContent || "").trim(),
  );
}

function hasInlineAttachmentPayloadInMessage(message: PersistedMessage | Record<string, unknown> = {}) {
  return Array.isArray(message?.attachments) && message.attachments.some((attachment) =>
    attachment && typeof attachment === "object" && hasInlineAttachmentPayload(attachment as Record<string, unknown>),
  );
}

function hasInlineAttachmentPayloadInState(
  messagesByTabId: MessagesByTabId = {},
  pendingChatTurns: PendingChatTurns = {},
) {
  const messagesContainInlinePayload = Object.values(messagesByTabId || {}).some((messages) =>
    Array.isArray(messages) && messages.some((message) => hasInlineAttachmentPayloadInMessage(message)),
  );
  if (messagesContainInlinePayload) {
    return true;
  }

  return Object.values(pendingChatTurns || {}).some((entry) => {
    const pendingEntry = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
    const userMessage = pendingEntry?.userMessage && typeof pendingEntry.userMessage === "object"
      ? pendingEntry.userMessage as Record<string, unknown>
      : null;
    return hasInlineAttachmentPayloadInMessage(userMessage || {});
  });
}

function hasHydratableInitialAttachmentState(
  messagesByTabId: MessagesByTabId = {},
  pendingChatTurns: PendingChatTurns = {},
) {
  const hasStoredMessages = Object.values(messagesByTabId || {}).some((messages) => Array.isArray(messages) && messages.length > 0);
  if (hasStoredMessages) {
    return true;
  }

  return Object.keys(pendingChatTurns || {}).length > 0;
}

function mergeHydratedMessagesByKey(
  currentMessagesByKey: MessagesByTabId = {},
  hydratedMessagesByKey: Record<string, ChatMessage[]> = {},
) {
  const serializeAttachments = (attachments: unknown) => JSON.stringify(attachments || []);
  let changed = false;

  const merged = Object.fromEntries(
    Object.keys(currentMessagesByKey || {}).map((key) => {
      const currentMessages = Array.isArray(currentMessagesByKey?.[key]) ? currentMessagesByKey[key] : [];
      const hydratedMessages = Array.isArray(hydratedMessagesByKey?.[key]) ? hydratedMessagesByKey[key] : [];

      if (!currentMessages.length || !hydratedMessages.length) {
        return [key, currentMessages];
      }

      const mergedMessages = mergeConversationAttachments(currentMessages, hydratedMessages);
      if (mergedMessages.some((message, index) => serializeAttachments(message?.attachments) !== serializeAttachments(currentMessages[index]?.attachments))) {
        changed = true;
      }
      return [key, mergedMessages];
    }),
  );

  return changed ? merged : currentMessagesByKey;
}

function shouldMergeHydratedPendingUserMessage(currentUserMessage: Record<string, unknown> = {}, hydratedUserMessage: Record<string, unknown> = {}) {
  const currentUserId = String(currentUserMessage?.id || "").trim();
  const hydratedUserId = String(hydratedUserMessage?.id || "").trim();
  if (currentUserId && hydratedUserId) {
    return currentUserId === hydratedUserId;
  }

  return String(currentUserMessage?.content || "") === String(hydratedUserMessage?.content || "")
    && Number(currentUserMessage?.timestamp || 0) === Number(hydratedUserMessage?.timestamp || 0);
}

function mergeHydratedPendingChatTurns(
  currentPendingChatTurns: PendingChatTurns = {},
  hydratedPendingChatTurns: PendingChatTurns = {},
) {
  const serializeAttachments = (attachments: unknown) => JSON.stringify(attachments || []);
  let changed = false;

  const merged = Object.fromEntries(
    Object.keys(currentPendingChatTurns || {}).map((key) => {
      const currentEntry = currentPendingChatTurns?.[key];
      const hydratedEntry = hydratedPendingChatTurns?.[key];

      if (!currentEntry || typeof currentEntry !== "object") {
        return [key, currentEntry];
      }

      if (!hydratedEntry || typeof hydratedEntry !== "object") {
        return [key, currentEntry];
      }

      const currentUserMessage =
        currentEntry.userMessage && typeof currentEntry.userMessage === "object"
          ? currentEntry.userMessage as Record<string, unknown>
          : null;
      const hydratedUserMessage =
        hydratedEntry.userMessage && typeof hydratedEntry.userMessage === "object"
          ? hydratedEntry.userMessage as Record<string, unknown>
          : null;
      const hydratedAttachments = Array.isArray(hydratedUserMessage?.attachments) ? hydratedUserMessage.attachments : [];

      if (!hydratedAttachments.length) {
        return [key, currentEntry];
      }

      if (!currentUserMessage) {
        changed = Boolean(hydratedAttachments.length) || changed;
        return [
          key,
          {
            ...currentEntry,
            userMessage: hydratedUserMessage,
          },
        ];
      }

      if (!shouldMergeHydratedPendingUserMessage(currentUserMessage, hydratedUserMessage || undefined)) {
        return [key, currentEntry];
      }

      const mergedAttachments = hydratedAttachments;
      if (serializeAttachments(currentUserMessage.attachments) === serializeAttachments(mergedAttachments)) {
        return [key, currentEntry];
      }

      changed = true;
      return [
        key,
        {
          ...currentEntry,
          userMessage: {
            ...currentUserMessage,
            attachments: mergedAttachments,
          },
        },
      ];
    }),
  );

  return changed ? merged : currentPendingChatTurns;
}

function mergeHydratedActiveMessages(
  currentMessages: PersistedMessage[] = [],
  hydratedMessages: ChatMessage[] = [],
) {
  if (!currentMessages.length || !hydratedMessages.length) {
    return currentMessages;
  }

  const serializeAttachments = (attachments: unknown) => JSON.stringify(attachments || []);
  const mergedMessages = mergeConversationAttachments(currentMessages, hydratedMessages);
  const changed = mergedMessages.some(
    (message, index) => serializeAttachments(message?.attachments) !== serializeAttachments(currentMessages[index]?.attachments),
  );
  return changed ? mergedMessages : currentMessages;
}

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
  const activeChatTabIdRef = useRef(activeChatTabId);
  const hasStartedInitialAttachmentHydrationRef = useRef(false);
  const pendingPersistenceRef = useRef<PendingPersistencePayload | null>(null);
  const latestMessagesByTabIdRef = useRef(messagesByTabId);
  const previousMessagesByTabIdRef = useRef(messagesByTabId);
  const previousPendingChatTurnsRef = useRef(pendingChatTurns);
  const previousPromptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const latestPromptDraftsByConversationRef = useRef(promptDraftsByConversation);
  const writePersistedUiSnapshot = useCallback((
    snapshotState: Record<string, unknown>,
    nextPendingChatTurns: PendingChatTurns,
    persistedAt: number,
    messagesByTabId: MessagesByTabId = {},
    tabMetaById: TabMetaById = {},
  ) => {
    const sanitizedPendingChatTurns = pruneCompletedPendingChatTurns(
      nextPendingChatTurns,
      messagesByTabId,
      tabMetaById,
    );

    persistUiStateSnapshot({
      ...snapshotState,
      messagesByTabId,
      pendingChatTurns: sanitizedPendingChatTurns,
      persistedAt,
      tabMetaById,
    });
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
        JSON.stringify(sanitizePromptDraftsMap(latestPromptDraftsByConversationRef.current)),
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
      messagesByTabId: fallbackSerializedMessagesByTabId,
    };
    const fallbackTabMetaById = (payload.nextStorageState.tabMetaById || {}) as TabMetaById;

    writePersistedUiSnapshot(
      fallbackStoragePayload,
      payload.pendingChatTurns,
      payload.persistedAt,
      fallbackSerializedMessagesByTabId,
      fallbackTabMetaById,
    );

    if (skipAttachmentSerialization) {
      return;
    }

    void serializeAttachmentStateByKeyForStorage(payload.messagesByTabId, payload.pendingChatTurns)
      .then((serializedState: SerializedAttachmentState) => {
        if (requestId !== storageRequestRef.current) {
          return;
        }

        const serializedMessagesByTabId = Object.fromEntries(
          Object.entries(serializedState.messagesByKey || {}).map(([key, items]) => [key, sanitizeMessagesForStorage(items)]),
        );

        writePersistedUiSnapshot(
          {
            ...payload.nextStorageState,
            promptDraftsByConversation: payload.promptDraftsByConversation,
            messagesByTabId: serializedMessagesByTabId,
          },
          serializedState.pendingChatTurns,
          payload.persistedAt,
          serializedMessagesByTabId,
          fallbackTabMetaById,
        );
      })
      .catch(() => {
        if (requestId !== storageRequestRef.current) {
          return;
        }

        writePersistedUiSnapshot(
          fallbackStoragePayload,
          payload.pendingChatTurns,
          payload.persistedAt,
          fallbackSerializedMessagesByTabId,
          fallbackTabMetaById,
        );
      });
  }, [writePersistedUiSnapshot]);

  useEffect(() => {
    latestPromptDraftsByConversationRef.current = promptDraftsByConversationRef
      ? promptDraftsByConversationRef.current
      : promptDraftsByConversation;
  }, [promptDraftsByConversation, promptDraftsByConversationRef]);

  useEffect(() => {
    activeChatTabIdRef.current = activeChatTabId;
  }, [activeChatTabId]);

  useEffect(() => {
    latestMessagesByTabIdRef.current = messagesByTabId;
  }, [messagesByTabId]);

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
    const shouldPersistInlineAttachmentsImmediately = hasInlineAttachmentPayloadInState(messagesByTabId, pendingChatTurns);

    previousMessagesByTabIdRef.current = messagesByTabId;
    previousPendingChatTurnsRef.current = pendingChatTurns;
    previousPromptDraftsByConversationRef.current = promptDraftsByConversation;

    if (!shouldDebouncePersistence || shouldPersistInlineAttachmentsImmediately) {
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
      window.localStorage.setItem(promptHistoryStorageKey, JSON.stringify(sanitizePromptHistoryMap(promptHistoryByConversation)));
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

    if (hasStartedInitialAttachmentHydrationRef.current) {
      return;
    }

    if (!hasHydratableInitialAttachmentState(initialMessagesByTabId, initialPendingChatTurns)) {
      initialStoredMessagesByTabIdRef.current = {};
      initialStoredPendingRef.current = {};
      return;
    }

    hasStartedInitialAttachmentHydrationRef.current = true;

    void hydrateAttachmentStateByKeyFromStorage(initialMessagesByTabId, initialPendingChatTurns)
      .then((hydratedState) => {
        const nextMessagesByTabId = hydratedState.messagesByKey || {};
        const hydratedActiveMessages = nextMessagesByTabId[activeChatTabIdRef.current] || [];

        setMessagesByTabId((current) => mergeHydratedMessagesByKey(current, nextMessagesByTabId));

        const currentVisibleActiveMessages = messagesRef.current || [];
        const currentSettledActiveMessages = latestMessagesByTabIdRef.current?.[activeChatTabIdRef.current] || [];
        const hydrationBaseMessages =
          currentVisibleActiveMessages.length > 0 && currentSettledActiveMessages.length > 0
            ? currentSettledActiveMessages
            : currentVisibleActiveMessages;
        const nextActiveMessages = mergeHydratedActiveMessages(hydrationBaseMessages, hydratedActiveMessages);
        if (nextActiveMessages !== messagesRef.current) {
          setMessagesSynced(nextActiveMessages);
        }

        setPendingChatTurns((current) => mergeHydratedPendingChatTurns(current, hydratedState.pendingChatTurns));
      })
      .catch(() => {})
      .finally(() => {
        initialStoredMessagesByTabIdRef.current = {};
        initialStoredPendingRef.current = {};
      });
  }, [initialStoredMessagesByTabIdRef, initialStoredPendingRef, messagesRef, setMessagesByTabId, setMessagesSynced, setPendingChatTurns]);
}
