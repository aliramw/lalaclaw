import {
  buildCanonicalImSessionUser,
  createImBootstrapSessionUser as createSharedImBootstrapSessionUser,
  getImSessionType as getSharedImSessionType,
  isImBootstrapSessionUser as isSharedImBootstrapSessionUser,
  isImSessionUser as isSharedImSessionUser,
} from "@/lib/im-session-key";

type ImDisplayNameOptions = {
  locale?: string;
  shortWecom?: boolean;
};

export function isDingTalkSessionUser(sessionUser: unknown = "") {
  return resolveImSessionType(sessionUser) === "dingtalk";
}

export function isFeishuSessionUser(sessionUser: unknown = "") {
  return resolveImSessionType(sessionUser) === "feishu";
}

export function isWecomSessionUser(sessionUser: unknown = "") {
  return resolveImSessionType(sessionUser) === "wecom";
}

export function isWeixinSessionUser(sessionUser: unknown = "") {
  return resolveImSessionType(sessionUser) === "weixin";
}

export function resolveImSessionType(sessionUser: unknown = "") {
  const normalizedType = String(getSharedImSessionType(String(sessionUser || ""), { agentId: "main" }) || "").trim().toLowerCase();
  if (normalizedType === "dingtalk") {
    return "dingtalk";
  }
  if (normalizedType === "feishu") {
    return "feishu";
  }
  if (normalizedType === "wecom") {
    return "wecom";
  }
  if (normalizedType === "weixin") {
    return "weixin";
  }
  return "";
}

export function isImSessionUser(sessionUser: unknown = "") {
  return isSharedImSessionUser(String(sessionUser || ""), { agentId: "main" });
}

export function isImBootstrapSessionUser(sessionUser: unknown = "") {
  return isSharedImBootstrapSessionUser(String(sessionUser || ""), { agentId: "main" });
}

export function getImSessionDisplayName(sessionUser: unknown = "", { locale = "zh", shortWecom = false }: ImDisplayNameOptions = {}) {
  const type = resolveImSessionType(sessionUser);
  const normalizedLocale = String(locale || "").trim().toLowerCase();
  const useChineseLabels = normalizedLocale.startsWith("zh");

  if (type === "dingtalk") {
    return useChineseLabels ? "钉钉" : "Dingtalk";
  }
  if (type === "feishu") {
    return useChineseLabels ? "飞书" : "Feishu";
  }
  if (type === "wecom") {
    if (!useChineseLabels) {
      return "WeCom";
    }
    return shortWecom ? "企微" : "企业微信";
  }
  if (type === "weixin") {
    return useChineseLabels ? "微信" : "Weixin";
  }
  return "";
}

export function createImBootstrapSessionUser(channel: unknown = "") {
  return createSharedImBootstrapSessionUser(String(channel || ""));
}

export function createImRuntimeAnchorSessionUser(sessionUser: unknown = "") {
  const type = resolveImSessionType(sessionUser);

  if (type === "dingtalk") {
    return createImBootstrapSessionUser("dingtalk-connector");
  }

  if (type === "feishu") {
    return createImBootstrapSessionUser("feishu");
  }

  if (type === "wecom") {
    return createImBootstrapSessionUser("wecom");
  }

  if (type === "weixin") {
    return createImBootstrapSessionUser("openclaw-weixin");
  }

  return "";
}

export function createResetImSessionUser(sessionUser: unknown = "", resetAt = Date.now()) {
  void resetAt;
  const normalizedSessionUser = String(sessionUser || "").trim();
  if (!normalizedSessionUser) {
    return "";
  }

  return buildCanonicalImSessionUser(normalizedSessionUser, { agentId: "main" }) || normalizedSessionUser;
}
