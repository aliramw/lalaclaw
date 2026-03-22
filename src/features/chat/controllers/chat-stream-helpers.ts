import { replaceAssistantPreservingTurn } from "@/features/chat/controllers/chat-turn-helpers";
import type { ChatControllerEntry, ChatMessage, ChatStreamPayload } from "@/types/chat";

type SetMessagesForTab = (
  tabId: string,
  value: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[]),
) => void;

type StreamEvent = {
  type?: string;
  delta?: string;
  error?: string;
  messageId?: string;
  payload?: ChatStreamPayload | null;
  session?: Record<string, unknown> | null;
  message?: {
    id?: string;
  } | null;
};

export function isNdjsonStreamResponse(response: Response) {
  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  return Boolean(response?.body) && contentType.includes("application/x-ndjson");
}

export function shouldSuppressPendingPlaceholder(entry: ChatControllerEntry = {}) {
  return /^\s*(\/|!)/.test(String(entry?.content || ""));
}

export function isAbortError(error: unknown) {
  const candidate = error as { name?: string; message?: string } | null;
  return candidate?.name === "AbortError" || /aborted|abort/i.test(String(candidate?.message || ""));
}

export function hasVisibleAssistantContent(content = "") {
  let normalized = String(content || "").replace(/\[\[reply_to_current\]\]/gi, " ").trimStart();

  const hasLeadingSmallBlock = /^(?:\*\*|__)?\s*<small>[\s\S]*?<\/small>\s*(?:\*\*|__)?/i.test(normalized);
  if (hasLeadingSmallBlock) {
    normalized = normalized.replace(/^(?:\*\*|__)?\s*<small>[\s\S]*?<\/small>\s*(?:\*\*|__)?/i, "").trimStart();
  } else if (/^(?:\*\*|__)?\s*<small>[\s\S]*$/i.test(normalized)) {
    return false;
  }

  normalized = normalized
    .replace(/<\/?[A-Za-z][^>\n]*>?/g, " ")
    .replace(/[`*_>#~-]+/g, " ")
    .replace(/\s+/g, "");

  return normalized.length > 0;
}

export function conversationIncludesUserTurn(conversation: ChatMessage[] = [], entry: ChatControllerEntry = {}) {
  const targetContent = String(entry?.content || "").trim();
  const targetTimestamp = Number(entry?.timestamp || 0);
  if (!targetContent || !Array.isArray(conversation)) {
    return false;
  }

  return conversation.some((message) => {
    if (message?.role !== "user") {
      return false;
    }

    if (String(message.content || "").trim() !== targetContent) {
      return false;
    }

    const timestamp = Number(message.timestamp || 0);
    return !targetTimestamp || !timestamp || timestamp >= targetTimestamp;
  });
}

export async function consumeChatStream(
  response: Response,
  {
    entry,
    pendingTimestamp,
    setMessagesForTab,
  }: {
    entry: ChatControllerEntry;
    pendingTimestamp: number;
    setMessagesForTab: SetMessagesForTab;
  },
): Promise<ChatStreamPayload | null> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return null;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let payload: ChatStreamPayload | null = null;
  let streamedText = "";
  let tokenBadge = "";
  let assistantMessageId = "";
  let sessionSync: Record<string, unknown> | null = null;

  const pushStreamUpdate = () => {
    if (!hasVisibleAssistantContent(streamedText)) {
      return;
    }
    setMessagesForTab(String(entry.tabId || ""), (current) =>
      replaceAssistantPreservingTurn(
        current,
        { ...entry, pendingTimestamp },
        "",
        streamedText,
        tokenBadge,
        true,
        assistantMessageId,
      ),
    );
  };

  const processLine = (line: string) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return;
    }

    const event = JSON.parse(trimmed) as StreamEvent;

    if (event.type === "message.start") {
      assistantMessageId = typeof event.message?.id === "string" ? event.message.id : assistantMessageId;
      return;
    }

    if (event.type === "message.patch") {
      if (typeof event.messageId === "string" && event.messageId) {
        assistantMessageId = event.messageId;
      }
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) {
        return;
      }
      streamedText += delta;
      pushStreamUpdate();
      return;
    }

    if (event.type === "message.complete") {
      if (typeof event.messageId === "string" && event.messageId) {
        assistantMessageId = event.messageId;
      }
      payload = event.payload || null;
      if (payload?.tokenBadge) {
        tokenBadge = payload.tokenBadge;
      }
      if (typeof payload?.assistantMessageId === "string" && payload.assistantMessageId) {
        assistantMessageId = payload.assistantMessageId;
      }
      if (typeof payload?.outputText === "string") {
        streamedText = payload.outputText;
        pushStreamUpdate();
      }
      return;
    }

    if (event.type === "session.sync") {
      sessionSync = event.session || null;
      return;
    }

    if (event.type === "delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) {
        return;
      }
      streamedText += delta;
      pushStreamUpdate();
      return;
    }

    if (event.type === "done") {
      payload = event.payload || null;
      if (payload?.tokenBadge) {
        tokenBadge = payload.tokenBadge;
      }
      if (typeof payload?.assistantMessageId === "string" && payload.assistantMessageId) {
        assistantMessageId = payload.assistantMessageId;
      }
      if (typeof payload?.outputText === "string") {
        streamedText = payload.outputText;
        pushStreamUpdate();
      }
      return;
    }

    if (event.type === "message.error" || event.type === "error") {
      const streamError = new Error(event.error || "Request failed") as Error & {
        partialOutputText?: string;
        tokenBadge?: string;
        assistantMessageId?: string;
        sessionSync?: Record<string, unknown> | null;
      };
      streamError.partialOutputText = streamedText;
      streamError.tokenBadge = tokenBadge;
      streamError.assistantMessageId = assistantMessageId;
      streamError.sessionSync = sessionSync;
      throw streamError;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      const abortError = error as Error & {
        partialOutputText?: string;
        tokenBadge?: string;
        assistantMessageId?: string;
      };
      abortError.partialOutputText = streamedText;
      abortError.tokenBadge = tokenBadge;
      abortError.assistantMessageId = assistantMessageId;
    }
    throw error;
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  return payload
    ? {
        ...payload,
        ...(sessionSync ? { sessionSync } : {}),
      }
    : {
        ok: true,
        outputText: streamedText,
        tokenBadge,
        metadata: {},
        ...(sessionSync ? { sessionSync } : {}),
      };
}
