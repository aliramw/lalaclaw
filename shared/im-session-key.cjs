function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeImChannel(channel = '') {
  const normalizedChannel = normalizeText(channel).toLowerCase();
  if (['openclaw-weixin', 'weixin', 'wechat'].includes(normalizedChannel)) {
    return 'openclaw-weixin';
  }
  return normalizedChannel;
}

function stripImResetSuffix(value = '') {
  return normalizeText(value).replace(/:reset:[^:]+$/i, '');
}

function resolvePeerId(record = {}) {
  const keys = [
    'peerid',
    'peerId',
    'groupid',
    'groupId',
    'conversationid',
    'conversationId',
    'openid',
    'openId',
    'fromusername',
    'fromUserName',
  ];

  for (const key of keys) {
    const value = normalizeText(record?.[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

function resolveChatType(record = {}) {
  return normalizeText(record?.chattype || record?.chatType || 'direct').toLowerCase() || 'direct';
}

function createImBootstrapSessionUser(channel = '') {
  const normalizedChannel = normalizeImChannel(channel);

  if (normalizedChannel === 'dingtalk-connector') {
    return 'dingtalk-connector';
  }

  if (normalizedChannel === 'feishu') {
    return 'feishu:direct:default';
  }

  if (normalizedChannel === 'wecom') {
    return 'wecom:direct:default';
  }

  if (normalizedChannel === 'openclaw-weixin') {
    return 'openclaw-weixin:direct:default';
  }

  return '';
}

function parseSerializedSessionUser(sessionUser = '') {
  const normalizedSessionUser = normalizeText(sessionUser);
  if (!normalizedSessionUser.startsWith('{') || !normalizedSessionUser.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalizedSessionUser);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function parseNativeImSessionUser(sessionUser = '') {
  const normalizedSessionUser = normalizeText(sessionUser);
  const match = normalizedSessionUser.match(/^agent:([^:]+):(dingtalk-connector|feishu|wecom|openclaw-weixin|weixin|wechat):([^:]+):(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    agentId: normalizeText(match[1]) || 'main',
    channel: normalizeImChannel(match[2]),
    chatType: normalizeText(match[3]).toLowerCase() || 'direct',
    peerId: normalizeText(match[4]),
    sessionUser: normalizedSessionUser,
    source: 'native',
  };
}

function parseSyntheticImSessionUser(sessionUser = '') {
  const normalizedSessionUser = normalizeText(sessionUser);
  if (!normalizedSessionUser) {
    return null;
  }

  if (normalizedSessionUser === 'dingtalk-connector') {
    return {
      agentId: '',
      channel: 'dingtalk-connector',
      chatType: 'direct',
      peerId: '',
      sessionUser: normalizedSessionUser,
      source: 'bootstrap',
    };
  }

  let match = normalizedSessionUser.match(/^(feishu|wecom|openclaw-weixin|weixin|wechat):([^:]+):(.+)$/i);
  if (match) {
    return {
      agentId: '',
      channel: normalizeImChannel(match[1]),
      chatType: normalizeText(match[2]).toLowerCase() || 'direct',
      peerId: normalizeText(match[3]),
      sessionUser: normalizedSessionUser,
      source: 'synthetic',
    };
  }

  match = normalizedSessionUser.match(/^dingtalk-connector:([^:]+):(.+)$/i);
  if (match) {
    return {
      agentId: '',
      channel: 'dingtalk-connector',
      chatType: normalizeText(match[1]).toLowerCase() || 'direct',
      peerId: normalizeText(match[2]),
      sessionUser: normalizedSessionUser,
      source: 'synthetic',
    };
  }

  return null;
}

function parseImSessionIdentity(sessionUser = '', { agentId = 'main' } = {}) {
  const normalizedSessionUser = normalizeText(sessionUser);
  if (!normalizedSessionUser) {
    return null;
  }

  const nativeIdentity = parseNativeImSessionUser(normalizedSessionUser);
  if (nativeIdentity) {
    return {
      ...nativeIdentity,
      isBootstrap: nativeIdentity.channel === 'dingtalk-connector'
        ? false
        : nativeIdentity.peerId === 'default',
    };
  }

  const serializedIdentity = parseSerializedSessionUser(normalizedSessionUser);
  if (serializedIdentity) {
    const channel = normalizeImChannel(serializedIdentity?.channel);
    if (!['dingtalk-connector', 'feishu', 'wecom', 'openclaw-weixin'].includes(channel)) {
      return null;
    }

    const peerId = resolvePeerId(serializedIdentity);
    return {
      agentId: normalizeText(agentId) || 'main',
      channel,
      chatType: resolveChatType(serializedIdentity),
      peerId,
      accountId: normalizeText(serializedIdentity?.accountid || serializedIdentity?.accountId),
      sessionUser: normalizedSessionUser,
      source: 'json',
      isBootstrap: channel === 'dingtalk-connector' ? !peerId : peerId === 'default',
    };
  }

  const syntheticIdentity = parseSyntheticImSessionUser(normalizedSessionUser);
  if (!syntheticIdentity) {
    return null;
  }

  return {
    ...syntheticIdentity,
    agentId: normalizeText(agentId) || 'main',
    isBootstrap: syntheticIdentity.channel === 'dingtalk-connector'
      ? !syntheticIdentity.peerId
      : syntheticIdentity.peerId === 'default',
  };
}

function buildCanonicalImSessionUser(sessionUser = '', { agentId = 'main', preserveReset = false } = {}) {
  const parsed = parseImSessionIdentity(sessionUser, { agentId });
  if (!parsed?.channel) {
    return '';
  }

  if (parsed.isBootstrap) {
    return createImBootstrapSessionUser(parsed.channel);
  }

  const canonicalAgentId = normalizeText(parsed.agentId || agentId) || 'main';
  const peerId = preserveReset ? normalizeText(parsed.peerId) : stripImResetSuffix(parsed.peerId);
  if (!peerId) {
    return createImBootstrapSessionUser(parsed.channel);
  }

  return `agent:${canonicalAgentId}:${parsed.channel}:${parsed.chatType || 'direct'}:${peerId}`;
}

function getImSessionType(sessionUser = '', options = {}) {
  const normalizedChannel = normalizeText(parseImSessionIdentity(sessionUser, options)?.channel);
  if (normalizedChannel === 'openclaw-weixin') {
    return 'weixin';
  }
  return normalizedChannel.replace('-connector', '');
}

function isImSessionUser(sessionUser = '', options = {}) {
  return Boolean(parseImSessionIdentity(sessionUser, options)?.channel);
}

function isImBootstrapSessionUser(sessionUser = '', options = {}) {
  return Boolean(parseImSessionIdentity(sessionUser, options)?.isBootstrap);
}

exports.buildCanonicalImSessionUser = buildCanonicalImSessionUser;
exports.createImBootstrapSessionUser = createImBootstrapSessionUser;
exports.getImSessionType = getImSessionType;
exports.isImBootstrapSessionUser = isImBootstrapSessionUser;
exports.isImSessionUser = isImSessionUser;
exports.parseImSessionIdentity = parseImSessionIdentity;
exports.stripImResetSuffix = stripImResetSuffix;
