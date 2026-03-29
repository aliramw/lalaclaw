import type { ChatMessage } from "@/types/chat";
import { normalizeStoredConversationKey } from "@/features/app/state/app-session-identity";

export const promptHistoryStorageKey = "command-center-prompt-history-v1";
export const promptDraftStorageKey = "command-center-prompt-drafts-v1";
export const promptHistoryLimit = 50;
const UNTRUSTED_METADATA_SENTINELS = [
  /^Conversation info \(untrusted metadata\):/i,
  /^Sender \(untrusted metadata\):/i,
  /^Thread starter \(untrusted, for context\):/i,
  /^Replied message \(untrusted, for context\):/i,
  /^Forwarded message context \(untrusted metadata\):/i,
  /^Chat history since last reply \(untrusted, for context\):/i,
];
const MESSAGE_ID_LINE = /^\s*\[message_id:\s*[^\]]+\]\s*$/i;
const INTERNAL_MEMORY_FLUSH_SENTINELS = [
  /^Pre-compaction memory flush\./i,
  /Store durable memories only in memory\/\d{4}-\d{2}-\d{2}\.md/i,
  /If nothing to store,\s*reply with NO_REPLY\./i,
];
const INTERNAL_SESSION_STARTUP_SENTINELS = [
  /^A new session was started via \/new or \/reset\./i,
  /Run your Session Startup sequence - read the required files before responding to the user\./i,
  /Do not mention internal steps, files, tools, or reasoning\./i,
];

export function sanitizePromptHistoryMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string[]>>((accumulator, [key, prompts]) => {
    const normalizedKey = normalizeStoredConversationKey(key);
    if (!normalizedKey || !Array.isArray(prompts)) {
      return accumulator;
    }

    const normalizedPrompts = prompts
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (!normalizedPrompts.length) {
      return accumulator;
    }

    accumulator[normalizedKey] = [...(accumulator[normalizedKey] || []), ...normalizedPrompts].slice(-promptHistoryLimit);
    return accumulator;
  }, {});
}

export function sanitizePromptDraftsMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((accumulator, [key, draft]) => {
    const normalizedKey = normalizeStoredConversationKey(key);
    const normalizedDraft = typeof draft === "string" ? draft : String(draft || "");
    if (!normalizedKey || !normalizedDraft.length) {
      return accumulator;
    }

    accumulator[normalizedKey] = normalizedDraft;
    return accumulator;
  }, {});
}

export function cleanWrappedUserMessage(text = "") {
  let lines = String(text || "").trim().split("\n");
  const stripLeadingBlankLines = () => {
    while (lines.length && !String(lines[0] || "").trim()) {
      lines.shift();
    }
  };
  const isMetadataSentinelLine = (value = "") => {
    const trimmed = String(value || "").trim();
    return UNTRUSTED_METADATA_SENTINELS.some((pattern) => pattern.test(trimmed));
  };
  const stripLeadingSystemWrapperBlock = () => {
    if (!/^System:/i.test(String(lines[0] || "").trim())) {
      return false;
    }

    let index = 0;
    while (index < lines.length) {
      const trimmed = String(lines[index] || "").trim();
      if (!trimmed || /^System:/i.test(trimmed)) {
        index += 1;
        continue;
      }
      break;
    }

    let nextIndex = index;
    while (nextIndex < lines.length && !String(lines[nextIndex] || "").trim()) {
      nextIndex += 1;
    }

    if (!isMetadataSentinelLine(lines[nextIndex])) {
      return false;
    }

    lines.splice(0, nextIndex);
    return true;
  };
  const stripLeadingMetadataBlock = () => {
    const firstLine = String(lines[0] || "").trim();
    if (!isMetadataSentinelLine(firstLine)) {
      return false;
    }

    lines.shift();
    stripLeadingBlankLines();

    if (/^```(?:json)?\s*$/i.test(String(lines[0] || "").trim())) {
      lines.shift();
      while (lines.length && !/^```\s*$/.test(String(lines[0] || "").trim())) {
        lines.shift();
      }
      if (lines.length && /^```\s*$/.test(String(lines[0] || "").trim())) {
        lines.shift();
      }
    }

    stripLeadingBlankLines();
    return true;
  };

  stripLeadingBlankLines();

  while (
    lines.length
    && /^System:\s*\[[^\]]+\]\s*Exec (?:completed|failed)\s*\([^)]+\)\s*::/i.test(String(lines[0] || "").trim())
  ) {
    lines.shift();
    stripLeadingBlankLines();
  }

  while (stripLeadingSystemWrapperBlock()) {
    stripLeadingBlankLines();
  }

  while (stripLeadingMetadataBlock()) {
    // Strip stacked metadata blocks at the head of inbound IM messages.
  }

  while (lines.length && MESSAGE_ID_LINE.test(String(lines[0] || "").trim())) {
    lines.shift();
    stripLeadingBlankLines();
  }

  let cleaned = lines.join("\n").trim();

  cleaned = cleaned.replace(
    /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+[^\]]*?GMT[+-]\d+\]\s*/i,
    "",
  );
  cleaned = cleaned.replace(/^(?:ou_[a-z0-9_-]+|on_[a-z0-9_-]+|oc_[a-z0-9_-]+)\s*:\s*/i, "");

  if (INTERNAL_MEMORY_FLUSH_SENTINELS.every((pattern) => pattern.test(cleaned))) {
    return "";
  }

  if (INTERNAL_SESSION_STARTUP_SENTINELS.every((pattern) => pattern.test(cleaned))) {
    return "";
  }

  if (
    /^OpenClaw runtime context \(internal\):/i.test(cleaned)
    && /runtime-generated,\s*not user-authored/i.test(cleaned)
  ) {
    return "";
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractUserPromptHistory(messages: ChatMessage[] = []) {
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => cleanWrappedUserMessage(message.content))
    .filter(Boolean)
    .slice(-promptHistoryLimit);
}

export function loadStoredPromptHistory(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(promptHistoryStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return sanitizePromptHistoryMap(parsed);
  } catch {
    return {};
  }
}

export function loadStoredPromptDrafts() {
  try {
    const raw = window.localStorage.getItem(promptDraftStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return sanitizePromptDraftsMap(parsed);
  } catch {
    return {};
  }
}
