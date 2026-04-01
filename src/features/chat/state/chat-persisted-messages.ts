import type { ChatMessage } from "@/types/chat";
import { cleanWrappedUserMessage } from "@/features/app/state/app-prompt-storage";

export function sanitizeMessagesForStorage(messages: ChatMessage[] = []) {
  return messages
    .filter((message) => !message.pending)
    .slice(-80)
    .map((message) => {
      const normalizedRole = String(message?.role || "").trim().toLowerCase();
      const content = normalizedRole === "user"
        ? cleanWrappedUserMessage(message.content)
        : message.content;

      return {
        ...(message.id ? { id: message.id } : {}),
        role: message.role,
        content,
        timestamp: message.timestamp,
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        ...(message.tokenBadge ? { tokenBadge: message.tokenBadge } : {}),
      };
    })
    .filter((message) => Boolean(message.attachments?.length) || Boolean(String(message.content || "").trim()));
}
