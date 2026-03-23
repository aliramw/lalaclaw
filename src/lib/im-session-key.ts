type ImSessionIdentity = {
  agentId: string;
  channel: string;
  chatType: string;
  peerId: string;
  sessionUser: string;
  source: "native" | "json" | "synthetic" | "bootstrap";
  isBootstrap: boolean;
  accountId?: string;
};

type ImSessionIdentityOptions = {
  agentId?: string;
};

type CanonicalImSessionUserOptions = ImSessionIdentityOptions & {
  preserveReset?: boolean;
};

function normalizeText(value: unknown = "") {
  return String(value || "").trim();
}

function normalizeImChannel(channel: unknown = "") {
  const normalizedChannel = normalizeText(channel).toLowerCase();
  if (["openclaw-weixin", "weixin", "wechat"].includes(normalizedChannel)) {
    return "openclaw-weixin";
  }
  return normalizedChannel;
}

export function stripImResetSuffix(value: unknown = "") {
  return normalizeText(value).replace(/:reset:[^:]+$/i, "");
}

function resolvePeerId(record: Record<string, unknown> = {}) {
  const keys = [
    "peerid",
    "peerId",
    "groupid",
    "groupId",
    "conversationid",
    "conversationId",
    "openid",
    "openId",
    "fromusername",
    "fromUserName",
  ];

  for (const key of keys) {
    const resolvedValue = normalizeText(record?.[key]);
    if (resolvedValue) {
      return resolvedValue;
    }
  }

  return "";
}

function resolveChatType(record: Record<string, unknown> = {}) {
  return normalizeText(record?.chattype || record?.chatType || "direct").toLowerCase() || "direct";
}

export function createImBootstrapSessionUser(channel: unknown = "") {
  const normalizedChannel = normalizeImChannel(channel);

  if (normalizedChannel === "dingtalk-connector") {
    return "dingtalk-connector";
  }

  if (normalizedChannel === "feishu") {
    return "feishu:direct:default";
  }

  if (normalizedChannel === "wecom") {
    return "wecom:direct:default";
  }

  if (normalizedChannel === "openclaw-weixin") {
    return "openclaw-weixin:direct:default";
  }

  return "";
}

function parseSerializedSessionUser(sessionUser: unknown = "") {
  const normalizedSessionUser = normalizeText(sessionUser);
  if (!normalizedSessionUser.startsWith("{") || !normalizedSessionUser.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalizedSessionUser);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseNativeImSessionUser(sessionUser: unknown = "") {
  const normalizedSessionUser = normalizeText(sessionUser);
  const match = normalizedSessionUser.match(
    /^agent:([^:]+):(dingtalk-connector|feishu|wecom|openclaw-weixin|weixin|wechat):([^:]+):(.+)$/i,
  );

  if (!match) {
    return null;
  }

  return {
    agentId: normalizeText(match[1]) || "main",
    channel: normalizeImChannel(match[2]),
    chatType: normalizeText(match[3]).toLowerCase() || "direct",
    peerId: normalizeText(match[4]),
    sessionUser: normalizedSessionUser,
    source: "native",
  };
}

function parseSyntheticImSessionUser(sessionUser: unknown = "") {
  const normalizedSessionUser = normalizeText(sessionUser);
  if (!normalizedSessionUser) {
    return null;
  }

  if (normalizedSessionUser === "dingtalk-connector") {
    return {
      agentId: "",
      channel: "dingtalk-connector",
      chatType: "direct",
      peerId: "",
      sessionUser: normalizedSessionUser,
      source: "bootstrap",
    };
  }

  let match = normalizedSessionUser.match(/^(feishu|wecom|openclaw-weixin|weixin|wechat):([^:]+):(.+)$/i);
  if (match) {
    return {
      agentId: "",
      channel: normalizeImChannel(match[1]),
      chatType: normalizeText(match[2]).toLowerCase() || "direct",
      peerId: normalizeText(match[3]),
      sessionUser: normalizedSessionUser,
      source: "synthetic",
    };
  }

  match = normalizedSessionUser.match(/^dingtalk-connector:([^:]+):(.+)$/i);
  if (match) {
    return {
      agentId: "",
      channel: "dingtalk-connector",
      chatType: normalizeText(match[1]).toLowerCase() || "direct",
      peerId: normalizeText(match[2]),
      sessionUser: normalizedSessionUser,
      source: "synthetic",
    };
  }

  return null;
}

export function parseImSessionIdentity(
  sessionUser: unknown = "",
  { agentId = "main" }: ImSessionIdentityOptions = {},
): ImSessionIdentity | null {
  const normalizedSessionUser = normalizeText(sessionUser);
  if (!normalizedSessionUser) {
    return null;
  }

  const nativeIdentity = parseNativeImSessionUser(normalizedSessionUser);
  if (nativeIdentity) {
    return {
      ...nativeIdentity,
      isBootstrap: nativeIdentity.channel === "dingtalk-connector"
        ? false
        : nativeIdentity.peerId === "default",
    };
  }

  const serializedIdentity = parseSerializedSessionUser(normalizedSessionUser);
  if (serializedIdentity) {
    const channel = normalizeImChannel(serializedIdentity?.channel);
    if (!["dingtalk-connector", "feishu", "wecom", "openclaw-weixin"].includes(channel)) {
      return null;
    }

    const peerId = resolvePeerId(serializedIdentity);
    return {
      agentId: normalizeText(agentId) || "main",
      channel,
      chatType: resolveChatType(serializedIdentity),
      peerId,
      accountId: normalizeText(serializedIdentity?.accountid || serializedIdentity?.accountId),
      sessionUser: normalizedSessionUser,
      source: "json",
      isBootstrap: channel === "dingtalk-connector" ? !peerId : peerId === "default",
    };
  }

  const syntheticIdentity = parseSyntheticImSessionUser(normalizedSessionUser);
  if (!syntheticIdentity) {
    return null;
  }

  return {
    ...syntheticIdentity,
    agentId: normalizeText(agentId) || "main",
    isBootstrap: syntheticIdentity.channel === "dingtalk-connector"
      ? !syntheticIdentity.peerId
      : syntheticIdentity.peerId === "default",
  };
}

export function buildCanonicalImSessionUser(
  sessionUser: unknown = "",
  { agentId = "main", preserveReset = false }: CanonicalImSessionUserOptions = {},
) {
  const parsed = parseImSessionIdentity(sessionUser, { agentId });
  if (!parsed?.channel) {
    return "";
  }

  if (parsed.isBootstrap) {
    return createImBootstrapSessionUser(parsed.channel);
  }

  const canonicalAgentId = normalizeText(parsed.agentId || agentId) || "main";
  const peerId = preserveReset ? normalizeText(parsed.peerId) : stripImResetSuffix(parsed.peerId);
  if (!peerId) {
    return createImBootstrapSessionUser(parsed.channel);
  }

  return `agent:${canonicalAgentId}:${parsed.channel}:${parsed.chatType || "direct"}:${peerId}`;
}

export function getImSessionType(sessionUser: unknown = "", options: ImSessionIdentityOptions = {}) {
  const normalizedChannel = normalizeText(parseImSessionIdentity(sessionUser, options)?.channel);
  if (normalizedChannel === "openclaw-weixin") {
    return "weixin";
  }
  return normalizedChannel.replace("-connector", "");
}

export function isImSessionUser(sessionUser: unknown = "", options: ImSessionIdentityOptions = {}) {
  return Boolean(parseImSessionIdentity(sessionUser, options)?.channel);
}

export function isImBootstrapSessionUser(sessionUser: unknown = "", options: ImSessionIdentityOptions = {}) {
  return Boolean(parseImSessionIdentity(sessionUser, options)?.isBootstrap);
}
