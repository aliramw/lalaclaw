import type { ConversationPendingMap, MessagesByTabId, PendingChatTurn, TabMetaById } from "@/types/chat";
import {
  createConversationKey,
  defaultSessionUser,
  normalizeStoredConversationKey,
  parseStoredConversationKey,
  sanitizeSessionUser,
} from "@/features/app/state/app-session-identity";
import { coerceAgentProgressStage } from "@/features/chat/state/chat-progress";
import {
  hasAuthoritativePendingAssistantReply,
  hasSnapshotAdvancedPastPendingTurn,
} from "@/features/chat/state/chat-runtime-pending";

export const pendingChatStorageKey = "command-center-pending-chat-v1";

export function sanitizePendingChatTurnsMap(value: unknown): ConversationPendingMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<ConversationPendingMap>((accumulator, [key, entry]) => {
    const normalizedKey = normalizeStoredConversationKey(key);
    if (!normalizedKey || !entry || typeof entry !== "object") {
      return accumulator;
    }

    const normalizedEntry = entry as PendingChatTurn;
    const {
      progressStage: rawProgressStage,
      progressLabel: rawProgressLabel,
      progressUpdatedAt: rawProgressUpdatedAt,
      ...restEntry
    } = normalizedEntry as PendingChatTurn & Record<string, unknown>;
    const parsedConversationKey = parseStoredConversationKey(normalizedKey);
    const progressStage = coerceAgentProgressStage(rawProgressStage);
    const progressLabel = typeof rawProgressLabel === "string" ? rawProgressLabel.trim() : "";
    const progressUpdatedAt = Number(rawProgressUpdatedAt || 0) || 0;
    accumulator[normalizedKey] = {
      ...restEntry,
      key: normalizedKey,
      ...(progressStage ? { progressStage } : {}),
      ...(progressLabel ? { progressLabel } : {}),
      ...(progressUpdatedAt ? { progressUpdatedAt } : {}),
      ...(parsedConversationKey
        ? {
            agentId: normalizedEntry.agentId || parsedConversationKey.agentId,
            sessionUser: sanitizeSessionUser(
              normalizedEntry.sessionUser || parsedConversationKey.sessionUser,
              normalizedEntry.agentId || parsedConversationKey.agentId,
            ),
          }
        : {}),
    };
    return accumulator;
  }, {});
}

export function loadPendingChatTurns() {
  try {
    const raw = window.localStorage.getItem(pendingChatStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    if (parsed.pendingChatTurns && typeof parsed.pendingChatTurns === "object") {
      return sanitizePendingChatTurnsMap(parsed.pendingChatTurns);
    }
    return sanitizePendingChatTurnsMap(parsed);
  } catch {
    return {};
  }
}

export function pruneCompletedPendingChatTurns(
  pendingChatTurns: ConversationPendingMap = {},
  messagesByTabId: MessagesByTabId = {},
  tabMetaById: TabMetaById = {},
) {
  if (!pendingChatTurns || typeof pendingChatTurns !== "object") {
    return {};
  }

  const messagesByConversationKey = new Map(
    Object.entries(tabMetaById || {}).map(([tabId, meta]) => [
      createConversationKey(meta?.sessionUser || defaultSessionUser, meta?.agentId || "main"),
      Array.isArray(messagesByTabId?.[tabId]) ? messagesByTabId[tabId] : [],
    ]),
  );

  return Object.fromEntries(
    Object.entries(pendingChatTurns).filter(([conversationKey, pendingEntry]) => {
      if (!pendingEntry || typeof pendingEntry !== "object") {
        return false;
      }

      const localMessages = messagesByConversationKey.get(conversationKey) || [];
      if (!localMessages.length) {
        return true;
      }

      if (hasSnapshotAdvancedPastPendingTurn(localMessages, pendingEntry)) {
        return false;
      }

      const pendingAssistantId = String(pendingEntry?.assistantMessageId || "").trim();
      if (
        pendingAssistantId
        && localMessages.some((message) =>
          message?.role === "assistant"
          && String(message?.id || "").trim() === pendingAssistantId,
        )
      ) {
        return true;
      }

      return !hasAuthoritativePendingAssistantReply(localMessages, pendingEntry);
    }),
  );
}
