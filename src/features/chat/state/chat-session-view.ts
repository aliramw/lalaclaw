import type { ChatMessage, PendingChatTurn } from "@/types/chat";
import { buildPendingConversationOverlayMessages } from "@/features/chat/state/chat-pending-conversation";

function buildPendingConversationMessages({
  messages = [],
  pendingEntry = null,
  pendingLabel = "",
  localMessages = [],
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  pendingLabel?: string;
  localMessages?: ChatMessage[];
} = {}) {
  return buildPendingConversationOverlayMessages(
    messages,
    pendingEntry,
    pendingLabel,
    localMessages,
  );
}

export function buildHydratedPendingConversationMessages({
  messages = [],
  pendingEntry = null,
  pendingLabel = "",
  localMessages = [],
}: {
  messages?: ChatMessage[];
  pendingEntry?: PendingChatTurn | null;
  pendingLabel?: string;
  localMessages?: ChatMessage[];
} = {}) {
  return buildPendingConversationMessages({
    messages,
    pendingEntry,
    pendingLabel,
    localMessages,
  });
}
