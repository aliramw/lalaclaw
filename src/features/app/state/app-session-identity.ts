import { buildCanonicalImSessionUser } from "@/lib/im-session-key";

export const defaultSessionUser = "command-center";

export function normalizeAgentId(value = "main") {
  return String(value || "main").trim() || "main";
}

export function resolveAgentIdFromTabId(tabId = "") {
  const normalized = String(tabId || "").trim();
  if (!normalized.startsWith("agent:")) {
    return "main";
  }
  return normalizeAgentId(normalized.slice("agent:".length).split("::")[0]);
}

function shouldPreserveLegacySessionUser(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  return (normalized.startsWith("{") && normalized.endsWith("}"))
    || normalized.includes("dingtalk-connector");
}

export function sanitizeSessionUser(value = defaultSessionUser, agentId = "main") {
  const rawValue = String(value || defaultSessionUser).trim();
  const normalizedAgentId = normalizeAgentId(agentId);
  const canonicalImSessionUser = buildCanonicalImSessionUser(rawValue, { agentId: normalizedAgentId });
  if (canonicalImSessionUser) {
    return canonicalImSessionUser;
  }

  if (shouldPreserveLegacySessionUser(rawValue)) {
    return rawValue;
  }

  const normalized = rawValue
    .trim()
    .replace(/[^\w:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:]+|[-:]+$/g, "");

  return normalized || defaultSessionUser;
}

export function createAgentTabId(agentId = "main") {
  return `agent:${normalizeAgentId(agentId)}`;
}

export function createAgentSessionUser(agentId = "main") {
  const normalizedAgentId = normalizeAgentId(agentId).replace(/[^\w:-]+/g, "-");
  return sanitizeSessionUser(`command-center-${normalizedAgentId}-${Date.now()}`);
}

export function createConversationKey(sessionUser = defaultSessionUser, agentId = "main") {
  const normalizedAgentId = normalizeAgentId(agentId);
  return `${sanitizeSessionUser(sessionUser, normalizedAgentId)}:${normalizedAgentId}`;
}

export function parseStoredConversationKey(value = "") {
  const normalized = String(value || "").trim();
  const separatorIndex = normalized.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }

  return {
    sessionUser: normalized.slice(0, separatorIndex),
    agentId: normalizeAgentId(normalized.slice(separatorIndex + 1)),
  };
}

export function normalizeStoredConversationKey(value = "") {
  const parsed = parseStoredConversationKey(value);
  if (!parsed) {
    return String(value || "").trim();
  }

  return createConversationKey(parsed.sessionUser, parsed.agentId);
}
