const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL, pathToFileURL } = require('node:url');

let gatewaySdkPromise = null;
const GATEWAY_RETRY_DELAYS_MS = [250, 1000];
const OPENCLAW_WAIT_POLL_TIMEOUT_MS = 900;
const OPENCLAW_WAIT_POLL_COMMAND_TIMEOUT_MS = 10000;
const GATEWAY_RETRYABLE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function createOpenClawClient({
  config,
  execFileAsync,
  PROJECT_ROOT,
  OPENCLAW_BIN,
  clip,
  normalizeSessionUser,
  normalizeChatMessage,
  getMessageAttachments,
  describeAttachmentForModel,
  buildOpenClawMessageContent,
  getCommandCenterSessionKey,
  resolveSessionAgentId,
  resolveSessionModel,
  readTextIfExists,
  tailLines,
  loadGatewaySdk,
}) {
  function buildOpenClawExecEnv(baseEnv = process.env) {
    const values = [
      path.dirname(process.execPath),
      path.isAbsolute(OPENCLAW_BIN) ? path.dirname(OPENCLAW_BIN) : '',
      ...String(baseEnv?.PATH || '').split(path.delimiter),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const dedupedPath = values.filter((value, index) => values.indexOf(value) === index).join(path.delimiter);
    return {
      ...baseEnv,
      PATH: dedupedPath,
    };
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createDeferred() {
    if (typeof Promise.withResolvers === 'function') {
      return Promise.withResolvers();
    }

    let resolve;
    let reject;
    const promise = new Promise((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { promise, resolve, reject };
  }

  function collectGatewayErrorSignals(error, signals = new Set()) {
    if (!error || typeof error !== 'object' || signals.has(error)) {
      return signals;
    }

    signals.add(error);

    if (error.cause && typeof error.cause === 'object') {
      collectGatewayErrorSignals(error.cause, signals);
    }

    if (error.errors && Array.isArray(error.errors)) {
      error.errors.forEach((entry) => collectGatewayErrorSignals(entry, signals));
    }

    return signals;
  }

  function isRetryableGatewayError(error) {
    const signals = [...collectGatewayErrorSignals(error)];

    return signals.some((entry) => {
      const code = String(entry?.code || entry?.errno || '').trim().toUpperCase();
      const message = String(entry?.message || '').trim().toUpperCase();
      if (code && GATEWAY_RETRYABLE_ERROR_CODES.has(code)) {
        return true;
      }

      return (
        message.includes('ECONNREFUSED')
        || message.includes('ECONNRESET')
        || message.includes('EHOSTUNREACH')
        || message.includes('ENETUNREACH')
        || message.includes('ETIMEDOUT')
        || message.includes('CONNECT TIMEOUT')
        || message.includes('FETCH FAILED')
      );
    });
  }

  function wrapGatewayUnavailableError(error, operation, attempts) {
    const attemptLabel = attempts > 1 ? ` after ${attempts} attempts` : '';
    const wrapped = new Error(`OpenClaw gateway unavailable during ${operation}${attemptLabel}: ${error?.message || 'Unknown gateway error'}`);
    wrapped.name = 'GatewayUnavailableError';
    wrapped.code = 'GATEWAY_UNAVAILABLE';
    wrapped.retryable = true;
    wrapped.cause = error;
    return wrapped;
  }

  async function withGatewayRetry(operation, task, options = {}) {
    const delays = Array.isArray(options.delays) && options.delays.length
      ? options.delays
      : GATEWAY_RETRY_DELAYS_MS;
    const attempts = Math.max(1, Number(options.attempts) || (delays.length + 1));
    let attempt = 0;
    let lastError = null;

    while (attempt < attempts) {
      attempt += 1;
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (!isRetryableGatewayError(error)) {
          throw error;
        }

        if (attempt >= attempts) {
          throw wrapGatewayUnavailableError(error, operation, attempt);
        }

        const retryDelayMs = Number(delays[Math.min(attempt - 1, delays.length - 1)]) || 0;
        if (retryDelayMs > 0) {
          await wait(retryDelayMs);
        }
      }
    }

    throw wrapGatewayUnavailableError(lastError, operation, attempts);
  }

  async function loadOpenClawGatewaySdk() {
    if (typeof loadGatewaySdk === 'function') {
      return await loadGatewaySdk();
    }

    if (!gatewaySdkPromise) {
      gatewaySdkPromise = (async () => {
        const replyModulePath = await resolveOpenClawReplyModulePath();
        const replyModuleUrl = pathToFileURL(replyModulePath);
        const module = await import(replyModuleUrl.href);
        return {
          GatewayClient: module.zs,
          GATEWAY_CLIENT_NAMES: module.wm,
          GATEWAY_CLIENT_MODES: module.Cm,
          VERSION: module.uv,
        };
      })();
    }

    return await gatewaySdkPromise;
  }

  async function resolveOpenClawReplyModulePath() {
    const candidateBins = [];
    if (path.isAbsolute(OPENCLAW_BIN)) {
      candidateBins.push(OPENCLAW_BIN);
    } else {
      try {
        const { stdout } = await execFileAsync('which', [OPENCLAW_BIN], {
          cwd: PROJECT_ROOT,
          env: buildOpenClawExecEnv(process.env),
          maxBuffer: 1024 * 32,
        });
        const resolvedBin = String(stdout || '').trim();
        if (resolvedBin) {
          candidateBins.push(resolvedBin);
        }
      } catch {}
    }

    for (const binPath of candidateBins) {
      const replyModulePath = path.resolve(path.dirname(binPath), '..', 'lib', 'node_modules', 'openclaw', 'dist', 'reply-Bm8VrLQh.js');
      if (fs.existsSync(replyModulePath)) {
        return replyModulePath;
      }
    }

    const prefixedRoots = [
      process.env.OPENCLAW_NPM_GLOBAL_ROOT,
      process.env.npm_config_prefix ? path.join(process.env.npm_config_prefix, 'lib', 'node_modules') : '',
      process.env.NPM_CONFIG_PREFIX ? path.join(process.env.NPM_CONFIG_PREFIX, 'lib', 'node_modules') : '',
      path.join(process.env.HOME || '', '.npm-global', 'lib', 'node_modules'),
    ].filter(Boolean);

    for (const root of prefixedRoots) {
      const replyModulePath = path.join(root, 'openclaw', 'dist', 'reply-Bm8VrLQh.js');
      if (fs.existsSync(replyModulePath)) {
        return replyModulePath;
      }
    }

    throw new Error('Unable to locate the OpenClaw gateway SDK');
  }

  async function invokeOpenClawTool(tool, args = {}, sessionKey = 'main', action) {
    const endpoint = new URL('/tools/invoke', config.baseUrl).toString();
    const headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const payload = {
      tool,
      args,
      sessionKey,
    };

    if (action) {
      payload.action = action;
    }

    const response = await withGatewayRetry('tool invocation', async () => await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }));

    if (!response.ok) {
      throw new Error(`Tool invoke failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.ok) {
      throw new Error(data?.error?.message || 'Tool invoke failed');
    }

    return data.result || null;
  }

  function getGatewayWebSocketUrl() {
    if (!config.baseUrl) {
      return '';
    }

    const url = new URL(config.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async function callOpenClawGateway(method, params = {}, timeoutMs = 10000) {
    const gatewayUrl = getGatewayWebSocketUrl();
    if (!gatewayUrl) {
      throw new Error('Gateway WebSocket URL is not configured');
    }

    const args = [
      '--no-color',
      '--log-level',
      'silent',
      'gateway',
      'call',
      method,
      '--json',
      '--url',
      gatewayUrl,
      '--params',
      JSON.stringify(params),
      '--timeout',
      String(timeoutMs),
    ];

    if (config.apiKey) {
      args.push('--token', config.apiKey);
    }

    const { stdout } = await withGatewayRetry(`gateway RPC ${method}`, async () => await execFileAsync(OPENCLAW_BIN, args, {
      cwd: PROJECT_ROOT,
      env: buildOpenClawExecEnv(process.env),
      maxBuffer: 1024 * 1024,
    }));

    try {
      return JSON.parse(String(stdout || '').trim() || '{}');
    } catch (error) {
      throw new Error(`Gateway RPC returned invalid JSON: ${error.message}`);
    }
  }

  async function fetchBrowserPeek() {
    if (config.mode !== 'openclaw') {
      return {
        summary: '未连接 OpenClaw。',
        items: [{ label: '控制台', value: '当前处于 mock 模式' }],
      };
    }

    const controlUiUrl = `${config.baseUrl}/`;
    const healthUrl = `${config.baseUrl}/healthz`;
    const browserServerLog = tailLines(readTextIfExists(path.join(config.logsDir, 'gateway.log')), 80)
      .reverse()
      .find((line) => line.includes('[browser/server]'));

    let controlTitle = '未知';
    try {
      const response = await fetch(controlUiUrl);
      const html = await response.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      controlTitle = titleMatch?.[1] || 'OpenClaw';
    } catch {
      controlTitle = '不可达';
    }

    let healthStatus = '不可达';
    try {
      const response = await fetch(healthUrl);
      healthStatus = response.ok ? '正常' : `HTTP ${response.status}`;
    } catch {
      healthStatus = '不可达';
    }

    return {
      summary: '读取本地 Control UI 与浏览器控制服务状态。',
      items: [
        { label: '控制台页面', value: `${controlTitle} · ${controlUiUrl}` },
        { label: 'Gateway 健康', value: healthStatus },
        { label: 'Browser Control', value: browserServerLog ? browserServerLog.split('[browser/server] ')[1] : `127.0.0.1:${config.browserControlPort}` },
      ],
    };
  }

  async function callOpenClaw(messages, fastMode, sessionUser = 'command-center', options = {}) {
    const request = buildOpenClawRequest(messages, fastMode, sessionUser, options, false);
    const response = await withGatewayRetry('chat request', async () => await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw request failed: ${response.status} ${clip(errorText, 200)}`);
    }

    const data = await response.json();
    return parseOpenClawResponse(data);
  }

  function buildOpenClawRequest(messages, fastMode, sessionUser = 'command-center', options = {}, stream = false) {
    const agentId = resolveSessionAgentId(sessionUser);
    const model = resolveSessionModel(sessionUser, agentId);
    const commandBody = typeof options.commandBody === 'string' ? options.commandBody.trim() : '';
    const normalizedMessages =
      commandBody && !messages.some((message) => message?.role === 'user')
        ? [{ role: 'user', content: '\u200b' }, ...messages]
        : messages;
    const endpoint = new URL(config.apiPath, config.baseUrl).toString();
    const headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    if (agentId) {
      headers['x-openclaw-agent-id'] = agentId;
    }

    const systemPrompt =
      'You are OpenClaw, acting as the command center agent for a software workspace. ' +
      'Respond concisely and include operational clarity for the human operator.';

    let payload;
    if (config.apiStyle === 'responses') {
      payload = {
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          ...normalizedMessages.map((message) => ({
            role: message.role,
            content: buildOpenClawMessageContent(message, 'responses'),
          })),
        ],
        reasoning: { effort: fastMode ? 'low' : 'medium' },
        ...(stream ? { stream: true } : {}),
      };
      if (commandBody) {
        payload.commandBody = commandBody;
      }
    } else {
      payload = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...normalizedMessages.map((message) => ({
            role: message.role,
            content: buildOpenClawMessageContent(message, 'chat'),
          })),
        ],
        temperature: fastMode ? 0.3 : 0.7,
        stream,
        user: normalizeSessionUser(sessionUser),
      };
      if (commandBody) {
        payload.commandBody = commandBody;
      }
    }

    return {
      endpoint,
      headers,
      payload,
    };
  }

  function buildOpenClawSessionMessage(message) {
    const text = normalizeChatMessage(message).trim();
    const attachments = getMessageAttachments(message);
    const attachmentPrompts = attachments.map((attachment) => describeAttachmentForModel(attachment)).filter(Boolean);
    const textPrompt = text || (attachmentPrompts.length ? `用户附加了 ${attachmentPrompts.length} 个附件，请结合附件内容处理请求。` : '');
    return [textPrompt, ...attachmentPrompts].filter(Boolean).join('\n\n').trim();
  }

  function stripDingTalkResetSuffix(value = '') {
    return String(value || '').trim().replace(/:reset:[^:]+$/i, '');
  }

  function normalizeDingTalkAccountId(value = '') {
    return String(value || '').trim() || '__default__';
  }

  function createDingTalkDeliveryRoute({ accountId = '', chatType = '', peerId = '' } = {}) {
    const normalizedPeerId = stripDingTalkResetSuffix(peerId);
    if (!normalizedPeerId) {
      return null;
    }

    const normalizedChatType = String(chatType || '').trim().toLowerCase();
    const targetPrefix = ['group', 'channel'].includes(normalizedChatType) ? 'channel' : 'user';

    return {
      accountId: normalizeDingTalkAccountId(accountId),
      channel: 'dingtalk-connector',
      to: `${targetPrefix}:${normalizedPeerId}`,
    };
  }

  function parseDingTalkSessionUser(sessionUser = '') {
    const trimmedSessionUser = String(sessionUser || '').trim();
    if (!trimmedSessionUser.startsWith('{')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmedSessionUser);
      return String(parsed?.channel || '').trim() === 'dingtalk-connector' ? parsed : null;
    } catch {
      return null;
    }
  }

  function normalizeFeishuAccountId(value = '') {
    return String(value || '').trim() || 'default';
  }

  function stripFeishuResetSuffix(value = '') {
    return String(value || '').trim().replace(/:reset:[^:]+$/i, '');
  }

  function createFeishuDeliveryRoute({ accountId = '', chatType = '', peerId = '' } = {}) {
    const normalizedPeerId = stripFeishuResetSuffix(peerId);
    if (!normalizedPeerId) {
      return null;
    }

    const normalizedChatType = String(chatType || '').trim().toLowerCase();
    const targetPrefix = ['group', 'channel'].includes(normalizedChatType) ? 'chat' : 'user';

    return {
      accountId: normalizeFeishuAccountId(accountId),
      channel: 'feishu',
      to: `${targetPrefix}:${normalizedPeerId}`,
    };
  }

  function parseFeishuSessionUser(sessionUser = '') {
    const normalizedSessionUser = String(sessionUser || '').trim();
    const nativeMatch = normalizedSessionUser.match(/^agent:([^:]+):feishu:([^:]+):(.+)$/);
    if (nativeMatch) {
      return {
        agentId: String(nativeMatch[1] || '').trim(),
        channel: 'feishu',
        chattype: String(nativeMatch[2] || '').trim(),
        peerid: String(nativeMatch[3] || '').trim(),
      };
    }

    const syntheticMatch = normalizedSessionUser.match(/^feishu:([^:]+):(.+)$/);
    if (!syntheticMatch) {
      return null;
    }

    return {
      channel: 'feishu',
      chattype: String(syntheticMatch[1] || '').trim(),
      peerid: String(syntheticMatch[2] || '').trim(),
    };
  }

  function normalizeWecomAccountId(value = '') {
    return String(value || '').trim() || 'default';
  }

  function stripWecomResetSuffix(value = '') {
    return String(value || '').trim().replace(/:reset:[^:]+$/i, '');
  }

  function createWecomDeliveryRoute({ peerId = '' } = {}) {
    const normalizedPeerId = stripWecomResetSuffix(peerId);
    if (!normalizedPeerId) {
      return null;
    }

    return {
      accountId: normalizeWecomAccountId(),
      channel: 'wecom',
      to: `wecom:${normalizedPeerId}`,
    };
  }

  function parseWecomSessionUser(sessionUser = '') {
    const normalizedSessionUser = String(sessionUser || '').trim();
    const nativeMatch = normalizedSessionUser.match(/^agent:([^:]+):wecom:([^:]+):(.+)$/);
    if (nativeMatch) {
      return {
        agentId: String(nativeMatch[1] || '').trim(),
        channel: 'wecom',
        chattype: String(nativeMatch[2] || '').trim(),
        peerid: String(nativeMatch[3] || '').trim(),
      };
    }

    const syntheticMatch = normalizedSessionUser.match(/^wecom:([^:]+):(.+)$/);
    if (!syntheticMatch) {
      return null;
    }

    return {
      channel: 'wecom',
      chattype: String(syntheticMatch[1] || '').trim(),
      peerid: String(syntheticMatch[2] || '').trim(),
    };
  }

  function resolveSessionDeliveryRoute(sessionUser = 'command-center') {
    const trimmedSessionUser = String(sessionUser || '').trim();
    if (!trimmedSessionUser) {
      return null;
    }

    const parsedSessionUser = parseDingTalkSessionUser(trimmedSessionUser);
    if (parsedSessionUser) {
      const chatType = parsedSessionUser?.chattype || parsedSessionUser?.chatType || '';
      const peerId = parsedSessionUser?.peerid || parsedSessionUser?.peerId || parsedSessionUser?.groupid || parsedSessionUser?.groupId || parsedSessionUser?.conversationid || parsedSessionUser?.conversationId || '';
      return createDingTalkDeliveryRoute({
        accountId: parsedSessionUser?.accountid || parsedSessionUser?.accountId || '',
        chatType,
        peerId,
      });
    }

    const parsedFeishuSessionUser = parseFeishuSessionUser(trimmedSessionUser);
    if (parsedFeishuSessionUser) {
      return createFeishuDeliveryRoute({
        accountId: 'default',
        chatType: parsedFeishuSessionUser.chattype,
        peerId: parsedFeishuSessionUser.peerid,
      });
    }

    const parsedWecomSessionUser = parseWecomSessionUser(trimmedSessionUser);
    if (parsedWecomSessionUser) {
      return createWecomDeliveryRoute({
        peerId: parsedWecomSessionUser.peerid,
      });
    }

    if (!trimmedSessionUser.startsWith('dingtalk-connector:')) {
      return null;
    }

    const parts = trimmedSessionUser.split(':');
    if (parts.length < 2) {
      return null;
    }

    let accountId = '__default__';
    let chatType = 'direct';
    let peerId = '';

    if (['direct', 'group', 'channel'].includes(parts[1])) {
      chatType = parts[1];
      peerId = parts.slice(2).join(':');
    } else if (parts.length >= 3) {
      accountId = parts[1];
      peerId = parts.slice(2).join(':');
    } else {
      peerId = parts[1];
    }

    return createDingTalkDeliveryRoute({
      accountId,
      chatType,
      peerId,
    });
  }

  function requiresDirectOpenClawRequest(messages = [], options = {}) {
    if (options.fastMode) {
      return true;
    }

    return messages.some((message) =>
      getMessageAttachments(message).some((attachment) => attachment.kind === 'image' && attachment.dataUrl),
    );
  }

  function buildMirroredUserMessageText(sessionUser = 'command-center', messageText = '', options = {}) {
    const trimmedMessage = String(messageText || '').trim();
    if (!trimmedMessage) {
      return '';
    }

    const operatorName = String(options?.operatorName || '').trim();
    if (parseFeishuSessionUser(sessionUser) || parseWecomSessionUser(sessionUser)) {
      return operatorName ? `${operatorName}：${trimmedMessage}` : trimmedMessage;
    }

    const parsedSessionUser = parseDingTalkSessionUser(sessionUser);
    const senderName = String(parsedSessionUser?.sendername || parsedSessionUser?.senderName || '').trim();
    if (!senderName) {
      return trimmedMessage;
    }

    return `${senderName}：${trimmedMessage}`;
  }

  async function mirrorOpenClawUserMessage(sessionUser = 'command-center', messageText = '', options = {}) {
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);
    const trimmedMessage = buildMirroredUserMessageText(sessionUser, messageText, options);
    if (!deliveryRoute || !trimmedMessage) {
      return null;
    }

    const agentId = resolveSessionAgentId(sessionUser);
    const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
    return await invokeOpenClawTool(
      'message',
      {
        channel: deliveryRoute.channel,
        target: deliveryRoute.to,
        accountId: deliveryRoute.accountId,
        message: trimmedMessage,
      },
      sessionKey,
      'send',
    );
  }

  async function callOpenClawSession(messages, sessionUser = 'command-center', timeoutMs = 30000) {
    const result = await startOpenClawSessionRun(messages, sessionUser);
    const finalAssistant = await waitForOpenClawSessionCompletion(result, timeoutMs);
    return {
      outputText: finalAssistant ? normalizeChatMessage(finalAssistant) || 'OpenClaw returned an empty response.' : 'OpenClaw returned an empty response.',
      usage: finalAssistant?.usage || null,
    };
  }

  async function startOpenClawSessionRun(messages, sessionUser = 'command-center') {
    const agentId = resolveSessionAgentId(sessionUser);
    const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
    const message = messages.map((entry) => buildOpenClawSessionMessage(entry)).filter(Boolean).join('\n\n').trim();
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);

    if (!message) {
      return null;
    }

    const runId = crypto.randomUUID();
    const startResult = await callOpenClawGateway(
      'agent',
      {
        message,
        sessionKey,
        idempotencyKey: runId,
        deliver: Boolean(deliveryRoute),
        channel: deliveryRoute?.channel || 'webchat',
        ...(deliveryRoute?.to ? { to: deliveryRoute.to } : {}),
        ...(deliveryRoute?.accountId ? { accountId: deliveryRoute.accountId } : {}),
        lane: 'nested',
      },
      10000,
    );

    const resolvedRunId = typeof startResult?.runId === 'string' && startResult.runId.trim() ? startResult.runId.trim() : runId;
    const acceptedAt = Number(startResult?.acceptedAt) || Date.now();

    return {
      acceptedAt,
      runId: resolvedRunId,
      requestMessage: message,
      sessionKey,
    };
  }

  function buildGatewayChatSendParams(sessionUser = 'command-center', message = '', timeoutMs = 30000, options = {}) {
    const agentId = resolveSessionAgentId(sessionUser);
    const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);

    return {
      sessionKey,
      message,
      thinking: options.thinkMode,
      timeoutMs,
      idempotencyKey: options.idempotencyKey,
      ...(deliveryRoute ? {
        deliver: true,
        channel: deliveryRoute.channel,
        ...(deliveryRoute.to ? { to: deliveryRoute.to } : {}),
        ...(deliveryRoute.accountId ? { accountId: deliveryRoute.accountId } : {}),
      } : {}),
    };
  }

  function normalizeMessageTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeComparableMessageText(message) {
    return normalizeChatMessage(message).replace(/\r\n/g, '\n').trim();
  }

  function isTerminalOpenClawWaitStatus(status = '') {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return Boolean(normalizedStatus) && !['timeout', 'started', 'running'].includes(normalizedStatus);
  }

  function isFailedOpenClawWaitStatus(status = '') {
    return ['error', 'aborted', 'failed', 'cancelled', 'canceled'].includes(String(status || '').trim().toLowerCase());
  }

  function isCurrentTurnUserMessage(entry, requestMessage = '') {
    const normalizedRequestMessage = String(requestMessage || '').trim();
    if (!normalizedRequestMessage || entry?.role !== 'user') {
      return false;
    }

    const entryText = normalizeComparableMessageText(entry);
    return (
      entryText === normalizedRequestMessage
      || entryText.endsWith(normalizedRequestMessage)
      || entryText.includes(`\n${normalizedRequestMessage}`)
    );
  }

  function findLatestAssistantSince(messages = [], acceptedAt = 0, requestMessage = '', options = {}) {
    const normalizedAcceptedAt = Number.isFinite(Number(acceptedAt)) ? Number(acceptedAt) : 0;
    const normalizedRequestMessage = String(requestMessage || '').trim();
    const strictTurnMatch = Boolean(options?.strictTurnMatch);
    const turnUserIndex = [...messages]
      .map((entry, index) => {
        if (!isCurrentTurnUserMessage(entry, normalizedRequestMessage)) {
          return -1;
        }

        if (normalizedAcceptedAt <= 0) {
          return index;
        }

        const entryTimestamp = normalizeMessageTimestamp(entry?.timestamp);
        return entryTimestamp === 0 || entryTimestamp >= normalizedAcceptedAt ? index : -1;
      })
      .filter((index) => index >= 0)
      .pop();

    if (Number.isInteger(turnUserIndex) && turnUserIndex >= 0) {
      const turnAssistants = messages
        .slice(turnUserIndex + 1)
        .filter((entry) => entry?.role === 'assistant' && normalizeChatMessage(entry));

      if (turnAssistants.length) {
        return turnAssistants[turnAssistants.length - 1];
      }

      return null;
    }

    if (normalizedRequestMessage && strictTurnMatch) {
      return null;
    }

    const assistants = [...messages].reverse().filter((entry) => entry?.role === 'assistant' && normalizeChatMessage(entry));

    if (normalizedAcceptedAt > 0) {
      return assistants.find((entry) => normalizeMessageTimestamp(entry?.timestamp) >= normalizedAcceptedAt) || null;
    }

    return assistants[0] || null;
  }

  async function readOpenClawSessionAssistant(runState, options = {}) {
    if (!runState?.sessionKey) {
      return null;
    }

    const history = await callOpenClawGateway(
      'chat.history',
      {
        sessionKey: runState.sessionKey,
        limit: 50,
      },
      10000,
    );

    const historyMessages = Array.isArray(history?.messages) ? history.messages : [];
    return findLatestAssistantSince(historyMessages, runState.acceptedAt, runState.requestMessage, options);
  }

  async function waitForOpenClawSessionCompletion(runState, timeoutMs = 30000) {
    if (!runState?.runId) {
      return null;
    }

    const waitResult = await callOpenClawGateway(
      'agent.wait',
      {
        runId: runState.runId,
        timeoutMs,
      },
      timeoutMs + 2000,
    );

    if (String(waitResult?.status || '').trim().toLowerCase() === 'timeout') {
      throw new Error(waitResult?.error || 'OpenClaw session timed out');
    }

    if (isFailedOpenClawWaitStatus(waitResult?.status)) {
      throw new Error(waitResult?.error || `OpenClaw session ${String(waitResult?.status || '').trim().toLowerCase()}`);
    }

    return await readOpenClawSessionAssistant(runState);
  }

  function extractStreamText(value) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => extractStreamText(item)).join('');
    }

    if (typeof value.text === 'string') {
      return value.text;
    }

    if (typeof value.delta === 'string') {
      return value.delta;
    }

    if (typeof value.output_text === 'string') {
      return value.output_text;
    }

    if (value.content) {
      return extractStreamText(value.content);
    }

    return '';
  }

  function extractOpenClawStreamDelta(event) {
    if (!event || typeof event !== 'object') {
      return '';
    }

    if (typeof event.delta === 'string' && String(event.type || '').includes('output_text')) {
      return event.delta;
    }

    if (typeof event.output_text_delta === 'string') {
      return event.output_text_delta;
    }

    const choiceDelta = event?.choices?.[0]?.delta;
    if (typeof choiceDelta?.content === 'string') {
      return choiceDelta.content;
    }

    if (Array.isArray(choiceDelta?.content)) {
      return extractStreamText(choiceDelta.content);
    }

    return '';
  }

  function extractOpenClawStreamUsage(event) {
    return event?.usage || event?.response?.usage || null;
  }

  function extractOpenClawStreamOutput(event) {
    if (!event || typeof event !== 'object') {
      return '';
    }

    if (typeof event.output_text === 'string') {
      return event.output_text;
    }

    if (Array.isArray(event.output)) {
      return extractStreamText(event.output);
    }

    if (event.response) {
      if (typeof event.response.output_text === 'string') {
        return event.response.output_text;
      }
      if (Array.isArray(event.response.output)) {
        return extractStreamText(event.response.output);
      }
    }

    const choiceMessage = event?.choices?.[0]?.message;
    return normalizeChatMessage(choiceMessage) || '';
  }

  async function consumeSseEvents(response, onEvent) {
    const reader = response.body?.getReader?.();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const flushEventBlock = (block) => {
      const data = String(block || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

      if (!data || data === '[DONE]') {
        return;
      }

      try {
        onEvent(JSON.parse(data));
      } catch {}
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        flushEventBlock(block);
        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      flushEventBlock(buffer);
    }
  }

  async function callOpenClawStream(messages, fastMode, sessionUser = 'command-center', options = {}) {
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {};
    const request = buildOpenClawRequest(messages, fastMode, sessionUser, options, true);
    const response = await withGatewayRetry('streaming chat request', async () => await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw request failed: ${response.status} ${clip(errorText, 200)}`);
    }

    if (!response.body) {
      const data = await response.json();
      const parsed = parseOpenClawResponse(data);
      if (parsed.outputText) {
        onDelta(parsed.outputText);
      }
      return parsed;
    }

    let outputText = '';
    let usage = null;

    await consumeSseEvents(response, (event) => {
      const delta = extractOpenClawStreamDelta(event);
      if (delta) {
        outputText += delta;
        onDelta(delta);
      }

      const finalOutput = extractOpenClawStreamOutput(event);
      if (!outputText && finalOutput) {
        outputText = finalOutput;
      }

      const nextUsage = extractOpenClawStreamUsage(event);
      if (nextUsage) {
        usage = nextUsage;
      }
    });

    return {
      outputText: outputText || 'OpenClaw returned an empty response.',
      usage,
    };
  }

  async function callOpenClawSessionStream(messages, sessionUser = 'command-center', timeoutMs = 30000, options = {}) {
    try {
      return await callOpenClawSessionEventStream(messages, sessionUser, timeoutMs, options);
    } catch (error) {
      if (error?.runState) {
        return await pollOpenClawSessionRun(error.runState, timeoutMs, {
          ...options,
          initialText: error.latestText || '',
        });
      }
      return await callOpenClawSessionStreamPolling(messages, sessionUser, timeoutMs, options);
    }
  }

  async function callOpenClawSessionEventStream(messages, sessionUser = 'command-center', timeoutMs = 30000, options = {}) {
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {};
    const silentDeltaPollMs = 1500;
    const { GatewayClient, GATEWAY_CLIENT_NAMES, GATEWAY_CLIENT_MODES, VERSION } = await loadOpenClawGatewaySdk();
    if (typeof GatewayClient !== 'function') {
      throw new Error('OpenClaw Gateway client is unavailable');
    }

    const agentId = resolveSessionAgentId(sessionUser);
    const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
    const message = messages.map((entry) => buildOpenClawSessionMessage(entry)).filter(Boolean).join('\n\n').trim();
    if (!message) {
      return {
        outputText: 'OpenClaw returned an empty response.',
        usage: null,
      };
    }

    const runId = crypto.randomUUID();
    const gatewayUrl = getGatewayWebSocketUrl();
    if (!gatewayUrl) {
      throw new Error('Gateway WebSocket URL is not configured');
    }

    const { promise: readyPromise, resolve: resolveReady, reject: rejectReady } = createDeferred();
    const { promise: finalPromise, resolve: resolveFinal, reject: rejectFinal } = createDeferred();
    let settled = false;
    let latestText = '';
    let activeRunState = null;
    const acceptedRunIds = new Set([runId]);
    let silentDeltaPollTimer = 0;
    let silentDeltaPollInFlight = false;
    let lastDeltaAt = Date.now();

    const emitDeltaFromFullText = (nextText = '') => {
      if (!nextText) {
        return;
      }

      if (!latestText) {
        latestText = nextText;
        onDelta(nextText);
        lastDeltaAt = Date.now();
        return;
      }

      if (!nextText.startsWith(latestText)) {
        return;
      }

      const delta = nextText.slice(latestText.length);
      latestText = nextText;
      if (delta) {
        onDelta(delta);
        lastDeltaAt = Date.now();
      }
    };

    const stopSilentDeltaPolling = () => {
      if (silentDeltaPollTimer) {
        clearTimeout(silentDeltaPollTimer);
        silentDeltaPollTimer = 0;
      }
    };

    const settleFromSilentWaitResult = (waitResult) => {
      if (settled || !waitResult || typeof waitResult !== 'object') {
        return false;
      }

      const status = String(waitResult.status || '').trim().toLowerCase();
      if (!isTerminalOpenClawWaitStatus(status)) {
        return false;
      }

      if (isFailedOpenClawWaitStatus(status)) {
        settled = true;
        rejectFinal(new Error(waitResult?.error || `OpenClaw session ${status}`));
        return true;
      }

      settled = true;
      resolveFinal(waitResult);
      return true;
    };

    const scheduleSilentDeltaPolling = () => {
      stopSilentDeltaPolling();
      if (settled || !activeRunState) {
        return;
      }

      silentDeltaPollTimer = setTimeout(async () => {
        if (settled || !activeRunState || silentDeltaPollInFlight) {
          scheduleSilentDeltaPolling();
          return;
        }

        if (Date.now() - lastDeltaAt < silentDeltaPollMs) {
          scheduleSilentDeltaPolling();
          return;
        }

        silentDeltaPollInFlight = true;
        try {
          const [waitResultState, latestAssistantState] = await Promise.allSettled([
            callOpenClawGateway(
              'agent.wait',
              {
                runId: activeRunState.runId,
                timeoutMs: 1,
              },
              OPENCLAW_WAIT_POLL_COMMAND_TIMEOUT_MS,
            ),
            readOpenClawSessionAssistant(activeRunState, { strictTurnMatch: true }),
          ]);
          const latestAssistant = latestAssistantState.status === 'fulfilled'
            ? latestAssistantState.value
            : null;
          const nextText = latestAssistant ? normalizeChatMessage(latestAssistant) || '' : '';
          emitDeltaFromFullText(nextText);
          const waitResult = waitResultState.status === 'fulfilled' ? waitResultState.value : null;
          if (settleFromSilentWaitResult(waitResult)) {
            return;
          }
        } catch {}
        finally {
          silentDeltaPollInFlight = false;
          scheduleSilentDeltaPolling();
        }
      }, silentDeltaPollMs);
    };

    const client = new GatewayClient({
      url: gatewayUrl,
      token: config.apiKey || undefined,
      clientName: GATEWAY_CLIENT_NAMES?.GATEWAY_CLIENT || 'gateway-client',
      clientDisplayName: 'LalaClaw',
      clientVersion: VERSION || 'unknown',
      platform: process.platform,
      mode: GATEWAY_CLIENT_MODES?.BACKEND || 'backend',
      onHelloOk: () => resolveReady(),
      onConnectError: (error) => {
        rejectReady(error);
        rejectFinal(error);
      },
      onClose: (_code, reason) => {
        if (!settled) {
          const error = new Error(reason || 'Gateway chat stream closed');
          rejectReady(error);
          rejectFinal(error);
        }
      },
      onEvent: (evt) => {
        if (evt?.event !== 'chat') {
          return;
        }

        const payload = evt.payload;
        if (!payload || payload.sessionKey !== sessionKey) {
          return;
        }

        const payloadRunId = typeof payload.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : '';
        if (payloadRunId) {
          if (!acceptedRunIds.has(payloadRunId)) {
            return;
          }
        } else if (payload.runId !== runId) {
          return;
        }

        if (payload.state === 'delta') {
          const nextText = normalizeChatMessage(payload.message) || '';
          if (!nextText) {
            return;
          }
          emitDeltaFromFullText(nextText);
          return;
        }

        if (payload.state === 'final') {
          settled = true;
          resolveFinal(payload);
          return;
        }

        if (payload.state === 'error' || payload.state === 'aborted') {
          settled = true;
          rejectFinal(new Error(payload.errorMessage || `OpenClaw session ${payload.state}`));
        }
      },
    });

    client.start();

    const closeClient = () => {
      try {
        client.stop();
      } catch {}
    };

    try {
      await Promise.race([
        readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gateway chat stream connect timeout')), 5000)),
      ]);

      const requestResult = await client.request(
        'chat.send',
        buildGatewayChatSendParams(sessionUser, message, timeoutMs, {
          thinkMode: options.thinkMode,
          idempotencyKey: runId,
        }),
        { timeoutMs: 10000 },
      );
      activeRunState = {
        acceptedAt: Number(requestResult?.acceptedAt) || Date.now(),
        runId: typeof requestResult?.runId === 'string' && requestResult.runId.trim() ? requestResult.runId.trim() : runId,
        requestMessage: message,
        sessionKey,
      };
      acceptedRunIds.add(activeRunState.runId);
      scheduleSilentDeltaPolling();

      const finalPayload = await Promise.race([
        finalPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('OpenClaw session timed out')), timeoutMs + 2000)),
      ]);

      let finalAssistant = null;
      try {
        finalAssistant = await readOpenClawSessionAssistant(activeRunState);
      } catch {}
      const finalText = normalizeChatMessage(finalPayload?.message) || (finalAssistant ? normalizeChatMessage(finalAssistant) : '') || latestText;

      emitDeltaFromFullText(finalText);

      return {
        outputText: finalText || 'OpenClaw returned an empty response.',
        usage: finalAssistant?.usage || null,
      };
    } catch (error) {
      if (activeRunState) {
        error.runState = activeRunState;
        error.latestText = latestText;
      }
      throw error;
    } finally {
      settled = true;
      stopSilentDeltaPolling();
      closeClient();
    }
  }

  async function pollOpenClawSessionRun(runState, timeoutMs = 30000, options = {}) {
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {};
    let latestText = typeof options.initialText === 'string' ? options.initialText : '';

    while (true) {
      const waitResult = await callOpenClawGateway(
        'agent.wait',
        {
          runId: runState.runId,
          timeoutMs: OPENCLAW_WAIT_POLL_TIMEOUT_MS,
        },
        OPENCLAW_WAIT_POLL_COMMAND_TIMEOUT_MS,
      );

      const latestAssistant = await readOpenClawSessionAssistant(runState);
      const nextText = latestAssistant ? normalizeChatMessage(latestAssistant) || '' : '';
      if (nextText && nextText.startsWith(latestText) && nextText.length > latestText.length) {
        const delta = nextText.slice(latestText.length);
        latestText = nextText;
        onDelta(delta);
      } else if (!latestText && nextText) {
        latestText = nextText;
        onDelta(nextText);
      }

      if (String(waitResult?.status || '').trim().toLowerCase() === 'timeout') {
        continue;
      }

      if (isFailedOpenClawWaitStatus(waitResult?.status)) {
        throw new Error(waitResult?.error || `OpenClaw session ${String(waitResult?.status || '').trim().toLowerCase()}`);
      }

      const finalAssistant = latestAssistant || await waitForOpenClawSessionCompletion(runState, timeoutMs);
      const finalText = finalAssistant ? normalizeChatMessage(finalAssistant) || latestText : latestText;
      if (finalText && finalText.startsWith(latestText) && finalText.length > latestText.length) {
        onDelta(finalText.slice(latestText.length));
        latestText = finalText;
      }

      return {
        outputText: finalText || 'OpenClaw returned an empty response.',
        usage: finalAssistant?.usage || null,
      };
    }
  }

  async function callOpenClawSessionStreamPolling(messages, sessionUser = 'command-center', timeoutMs = 30000, options = {}) {
    const runState = await startOpenClawSessionRun(messages, sessionUser);
    if (!runState) {
      return {
        outputText: 'OpenClaw returned an empty response.',
        usage: null,
      };
    }

    return await pollOpenClawSessionRun(runState, timeoutMs, options);
  }

  async function dispatchOpenClaw(messages, fastMode, sessionUser = 'command-center', options = {}) {
    if (!resolveSessionDeliveryRoute(sessionUser) && requiresDirectOpenClawRequest(messages, { ...options, fastMode })) {
      return await callOpenClaw(messages, fastMode, sessionUser, options);
    }
    return await callOpenClawSession(messages, sessionUser);
  }

  async function dispatchOpenClawStream(messages, fastMode, sessionUser = 'command-center', options = {}) {
    if (!resolveSessionDeliveryRoute(sessionUser) && requiresDirectOpenClawRequest(messages, { ...options, fastMode })) {
      return await callOpenClawStream(messages, fastMode, sessionUser, options);
    }
    return await callOpenClawSessionStream(messages, sessionUser, 30000, options);
  }

  function parseOpenClawResponse(data) {
    if (typeof data.output_text === 'string') {
      return {
        outputText: data.output_text,
        usage: data.usage || null,
      };
    }

    const choice = data.choices?.[0]?.message;
    return {
      outputText: normalizeChatMessage(choice) || 'OpenClaw returned an empty response.',
      usage: data.usage || null,
    };
  }

  /**
   * Subscribe to gateway real-time events via a persistent WebSocket.
   *
   * Returns { stop } to tear down the connection. The onEvent callback
   * receives raw gateway event payloads (e.g. chat deltas, session changes).
   * If the gateway SDK is unavailable or the connection fails, the subscriber
   * silently stops — callers should treat it as a best-effort enhancement.
   */
  function subscribeGatewayEvents({ onEvent, onError, onClose } = {}) {
    let client = null;
    let stopped = false;

    (async () => {
      try {
        const sdk = await loadOpenClawGatewaySdk();
        if (!sdk?.GatewayClient || typeof sdk.GatewayClient !== 'function' || stopped) {
          return;
        }

        const gatewayUrl = getGatewayWebSocketUrl();
        if (!gatewayUrl || stopped) {
          return;
        }

        client = new sdk.GatewayClient({
          url: gatewayUrl,
          token: config.apiKey || undefined,
          clientName: sdk.GATEWAY_CLIENT_NAMES?.GATEWAY_CLIENT || 'gateway-client',
          clientDisplayName: 'LalaClaw-RuntimeHub',
          clientVersion: sdk.VERSION || 'unknown',
          platform: process.platform,
          mode: sdk.GATEWAY_CLIENT_MODES?.BACKEND || 'backend',
          onHelloOk: () => {},
          onConnectError: (error) => {
            if (typeof onError === 'function') onError(error);
          },
          onClose: (_code, reason) => {
            if (typeof onClose === 'function') onClose(reason);
          },
          onEvent: (evt) => {
            if (typeof onEvent === 'function') onEvent(evt);
          },
        });

        client.start();
      } catch (error) {
        if (typeof onError === 'function') onError(error);
      }
    })();

    return {
      stop() {
        stopped = true;
        try { client?.stop(); } catch {}
        client = null;
      },
    };
  }

  return {
    callOpenClawGateway,
    dispatchOpenClaw,
    dispatchOpenClawStream,
    fetchBrowserPeek,
    invokeOpenClawTool,
    mirrorOpenClawUserMessage,
    parseOpenClawResponse,
    subscribeGatewayEvents,
  };
}

module.exports = {
  createOpenClawClient,
};
