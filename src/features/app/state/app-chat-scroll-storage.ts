import type { ChatScrollState } from "@/types/chat";
import { normalizeStoredConversationKey } from "@/features/app/state/app-session-identity";

export const chatScrollStorageKey = "command-center-chat-scroll-v1";

function sanitizeChatScrollTopMap(value: unknown): Record<string, ChatScrollState> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, scrollState]) => {
        const normalizedKey = normalizeStoredConversationKey(key);
        if (!normalizedKey) {
          return null;
        }

        if (typeof scrollState === "number" || typeof scrollState === "string") {
          const scrollTop = Number(scrollState);
          if (!Number.isFinite(scrollTop) || scrollTop < 0) {
            return null;
          }
          return [normalizedKey, { scrollTop: Math.round(scrollTop) }];
        }

        if (!scrollState || typeof scrollState !== "object") {
          return null;
        }

        const normalizedScrollState = scrollState as Partial<ChatScrollState>;
        const scrollTop = Number(normalizedScrollState.scrollTop);
        if (!Number.isFinite(scrollTop) || scrollTop < 0) {
          return null;
        }

        const anchorNodeId = String(normalizedScrollState.anchorNodeId || "").trim();
        const anchorMessageId = String(normalizedScrollState.anchorMessageId || "").trim();
        const anchorOffset = Number(normalizedScrollState.anchorOffset);
        const atBottom = Boolean(normalizedScrollState.atBottom);

        return [
          normalizedKey,
          {
            scrollTop: Math.round(scrollTop),
            ...(atBottom ? { atBottom: true } : {}),
            ...(anchorNodeId ? { anchorNodeId } : {}),
            ...(anchorMessageId ? { anchorMessageId } : {}),
            ...((anchorNodeId || anchorMessageId) && Number.isFinite(anchorOffset) ? { anchorOffset: Math.round(anchorOffset) } : {}),
          },
        ];
      })
      .filter((entry): entry is [string, ChatScrollState] => entry != null),
  );
}

export function loadStoredChatScrollTops() {
  try {
    const raw = window.localStorage.getItem(chatScrollStorageKey);
    if (!raw) {
      return {};
    }
    return sanitizeChatScrollTopMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function persistChatScrollTops(value: Record<string, ChatScrollState | number | string>) {
  try {
    window.localStorage.setItem(chatScrollStorageKey, JSON.stringify(sanitizeChatScrollTopMap(value)));
  } catch {}
}
