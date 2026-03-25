import type {
  ChatMessage,
  ChatTab,
  ChatTabMeta,
  ConversationPendingMap,
} from "@/types/chat";
import type { AppSession } from "@/types/runtime";
import {
  createConversationKey,
  defaultSessionUser,
  mergePendingConversation,
  pruneCompletedPendingChatTurns,
} from "@/features/app/storage";
import {
  createSessionForTab,
  createTabMeta,
  getSettledMessageKeys,
} from "@/features/app/controllers/use-command-center-helpers";

export function resolveInitialActiveChatTabId(stored, initialChatTabs: ChatTab[] = []) {
  const requested = String(stored?.activeChatTabId || "").trim();
  return initialChatTabs.some((tab) => tab.id === requested) ? requested : initialChatTabs[0]?.id || "";
}

export function buildStoredPendingChatTurns(
  rawStoredPendingChatTurns,
  initialMessagesByTabId,
  initialTabMetaById,
): ConversationPendingMap {
  const pruned = pruneCompletedPendingChatTurns(rawStoredPendingChatTurns, initialMessagesByTabId, initialTabMetaById);
  const tabIdByConversationKey = Object.fromEntries(
    Object.entries(initialTabMetaById || {}).map(([tabId, meta]) => [
      createConversationKey(meta?.sessionUser || defaultSessionUser, meta?.agentId || "main"),
      {
        tabId,
        agentId: meta?.agentId || "main",
        sessionUser: meta?.sessionUser || defaultSessionUser,
      },
    ]),
  );

  return Object.fromEntries(
    Object.entries(pruned || {}).map(([conversationKey, entry]) => {
      const fallbackIdentity = tabIdByConversationKey[conversationKey] || null;
      return [
        conversationKey,
        {
          ...entry,
          ...(fallbackIdentity?.tabId && !String(entry?.tabId || "").trim() ? { tabId: fallbackIdentity.tabId } : {}),
          ...(fallbackIdentity?.agentId && !String(entry?.agentId || "").trim() ? { agentId: fallbackIdentity.agentId } : {}),
          ...(fallbackIdentity?.sessionUser && !String(entry?.sessionUser || "").trim() ? { sessionUser: fallbackIdentity.sessionUser } : {}),
        },
      ];
    }),
  );
}

export function buildInitialHydratedMessagesByTabId(
  initialChatTabs: ChatTab[] = [],
  initialTabMetaById: Record<string, ChatTabMeta> = {},
  initialMessagesByTabId: Record<string, ChatMessage[]> = {},
  storedPendingChatTurns: ConversationPendingMap = {},
  thinkingPlaceholder = "",
) {
  return Object.fromEntries(
    initialChatTabs.map((tab) => {
      const meta = initialTabMetaById[tab.id] || createTabMeta(tab);
      const conversationKey = createConversationKey(meta.sessionUser, meta.agentId);
      const pendingEntry = storedPendingChatTurns[conversationKey] || null;
      const baseMessages = initialMessagesByTabId[tab.id] || [];

      return [
        tab.id,
        mergePendingConversation(
          baseMessages,
          pendingEntry,
          thinkingPlaceholder,
          baseMessages,
        ),
      ];
    }),
  );
}

export function buildInitialSessionByTabId(
  i18n,
  initialChatTabs: ChatTab[] = [],
  initialTabMetaById: Record<string, ChatTabMeta> = {},
): Record<string, AppSession> {
  return Object.fromEntries(
    initialChatTabs.map((tab) => [
      tab.id,
      createSessionForTab(i18n, tab, initialTabMetaById[tab.id]),
    ]),
  );
}

export function buildInitialBusyByTabId(
  initialChatTabs: ChatTab[] = [],
  initialTabMetaById: Record<string, ChatTabMeta> = {},
  storedPendingChatTurns: ConversationPendingMap = {},
) {
  return Object.fromEntries(
    initialChatTabs.map((tab) => {
      const meta = initialTabMetaById[tab.id] || createTabMeta(tab);
      const conversationKey = createConversationKey(meta.sessionUser, meta.agentId);
      const pendingEntry = storedPendingChatTurns[conversationKey];
      return [tab.id, Boolean(pendingEntry)];
    }),
  );
}

export function buildInitialSettledMessageKeysByTabId(
  initialChatTabs: ChatTab[] = [],
  initialHydratedMessagesByTabId: Record<string, ChatMessage[]> = {},
) {
  return Object.fromEntries(
    initialChatTabs.map((tab) => [
      tab.id,
      getSettledMessageKeys(initialHydratedMessagesByTabId[tab.id] || []),
    ]),
  );
}
