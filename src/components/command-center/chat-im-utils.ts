// IM-related utility functions
import { getImSessionDisplayName, isDingTalkSessionUser, resolveImSessionType } from "@/features/session/im-session";

export function unwrapAssistantEnvelope(content = "", role = "") {
  const text = String(content || "");
  if (role !== "assistant") {
    return text;
  }

  const match = text.trim().match(/^<final>([\s\S]*?)<\/final>$/i);
  if (!match) {
    return text;
  }

  const unwrapped = String(match[1] || "").trim();
  return unwrapped || text;
}

export function stripDingTalkImagePlaceholderForDisplay(content = "", sessionUser = "") {
  const text = String(content || "");
  if (!isDingTalkSessionUser(sessionUser)) {
    return text;
  }

  return text.replace(/^\[(?:图片|image)\]\s*\n+(?=!\[[^\]]*\]\([^)]+\))/iu, "");
}

export function splitImTabTitleForDisplay(title = "", agentId = "", sessionUser = "") {
  const normalizedTitle = String(title || "").trim();
  const normalizedAgentId = String(agentId || "").trim();
  const imType = resolveImSessionType(sessionUser);

  if (!normalizedTitle || !normalizedAgentId || !imType) {
    return null;
  }

  const agentSuffix = ` ${normalizedAgentId}`;
  if (!normalizedTitle.endsWith(agentSuffix) || normalizedTitle.length <= agentSuffix.length) {
    return null;
  }

  const platformLabel = normalizedTitle.slice(0, -agentSuffix.length).trim();
  if (!platformLabel) {
    return null;
  }

  return {
    channel:
      imType === "dingtalk"
        ? "dingtalk-connector"
        : imType === "weixin"
          ? "openclaw-weixin"
          : imType,
    platformLabel,
  };
}

export function buildCurrentConversationTitle(agentId = "", sessionUser = "", currentConversationLabel = "", locale = "zh") {
  const normalizedAgentId = String(agentId || "").trim();
  const normalizedCurrentConversationLabel = String(currentConversationLabel || "").trim();
  const imLabel = getImSessionDisplayName(sessionUser, { locale, shortWecom: true });

  if (imLabel && normalizedAgentId && normalizedCurrentConversationLabel) {
    return `${imLabel} - ${normalizedAgentId} - ${normalizedCurrentConversationLabel}`;
  }

  if (normalizedAgentId && normalizedCurrentConversationLabel) {
    return `${normalizedAgentId} - ${normalizedCurrentConversationLabel}`;
  }

  return normalizedAgentId || normalizedCurrentConversationLabel;
}
