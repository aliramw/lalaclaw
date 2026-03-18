export function isDingTalkSessionUser(sessionUser = "") {
  const normalizedSessionUser = String(sessionUser || "").trim();
  return normalizedSessionUser.startsWith('{"channel":"dingtalk-connector"')
    || normalizedSessionUser.includes("dingtalk-connector");
}

export function isFeishuSessionUser(sessionUser = "") {
  const normalizedSessionUser = String(sessionUser || "").trim();
  return normalizedSessionUser.startsWith('{"channel":"feishu"')
    || normalizedSessionUser.includes(":feishu:")
    || normalizedSessionUser.startsWith("feishu:");
}

export function isWecomSessionUser(sessionUser = "") {
  const normalizedSessionUser = String(sessionUser || "").trim();
  return normalizedSessionUser.startsWith('{"channel":"wecom"')
    || normalizedSessionUser.includes(":wecom:")
    || normalizedSessionUser.startsWith("wecom:");
}

export function resolveImSessionType(sessionUser = "") {
  if (isDingTalkSessionUser(sessionUser)) {
    return "dingtalk";
  }

  if (isFeishuSessionUser(sessionUser)) {
    return "feishu";
  }

  if (isWecomSessionUser(sessionUser)) {
    return "wecom";
  }

  return "";
}

export function isImSessionUser(sessionUser = "") {
  return Boolean(resolveImSessionType(sessionUser));
}

export function isImBootstrapSessionUser(sessionUser = "") {
  const normalizedSessionUser = String(sessionUser || "").trim();

  if (!normalizedSessionUser) {
    return false;
  }

  return (
    normalizedSessionUser === "dingtalk-connector"
    || normalizedSessionUser === "feishu:direct:default"
    || normalizedSessionUser === "wecom:direct:default"
    || /^agent:[^:]+:feishu:[^:]+:default$/i.test(normalizedSessionUser)
    || /^agent:[^:]+:wecom:[^:]+:default$/i.test(normalizedSessionUser)
  );
}

export function getImSessionDisplayName(sessionUser = "", { locale = "zh", shortWecom = false } = {}) {
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
  return "";
}

export function createImBootstrapSessionUser(channel = "") {
  const normalizedChannel = String(channel || "").trim();

  if (normalizedChannel === "dingtalk-connector") {
    return "dingtalk-connector";
  }

  if (normalizedChannel === "feishu") {
    return "feishu:direct:default";
  }

  if (normalizedChannel === "wecom") {
    return "wecom:direct:default";
  }

  return "";
}

export function createImRuntimeAnchorSessionUser(sessionUser = "") {
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

  return "";
}

function stripImResetSuffix(value = "") {
  return String(value || "").trim().replace(/:reset:[^:]+$/i, "");
}

export function createResetImSessionUser(sessionUser = "", resetAt = Date.now()) {
  const normalizedSessionUser = String(sessionUser || "").trim();
  const suffix = `:reset:${Number(resetAt) || Date.now()}`;

  if (!normalizedSessionUser) {
    return "";
  }

  if (normalizedSessionUser.startsWith("{")) {
    try {
      const parsed = JSON.parse(normalizedSessionUser);
      if (String(parsed?.channel || "").trim() !== "dingtalk-connector") {
        return normalizedSessionUser;
      }

      const peerKey = [
        "peerid",
        "peerId",
        "groupid",
        "groupId",
        "conversationid",
        "conversationId",
      ].find((key) => String(parsed?.[key] || "").trim());

      if (!peerKey) {
        return normalizedSessionUser;
      }

      return JSON.stringify({
        ...parsed,
        [peerKey]: `${stripImResetSuffix(parsed[peerKey])}${suffix}`,
      });
    } catch {
      return normalizedSessionUser;
    }
  }

  const feishuMatch = normalizedSessionUser.match(/^agent:([^:]+):feishu:([^:]+):(.+)$/);
  if (feishuMatch) {
    const chatType = String(feishuMatch[2] || "").trim();
    const peerId = stripImResetSuffix(feishuMatch[3]);
    if (!chatType || !peerId) {
      return normalizedSessionUser;
    }

    return `feishu:${chatType}:${peerId}${suffix}`;
  }

  const wecomMatch = normalizedSessionUser.match(/^agent:([^:]+):wecom:([^:]+):(.+)$/);
  if (wecomMatch) {
    const chatType = String(wecomMatch[2] || "").trim();
    const peerId = stripImResetSuffix(wecomMatch[3]);
    if (!chatType || !peerId) {
      return normalizedSessionUser;
    }

    return `wecom:${chatType}:${peerId}${suffix}`;
  }

  return normalizedSessionUser;
}
