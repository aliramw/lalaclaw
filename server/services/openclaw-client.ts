const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL, pathToFileURL } = require('node:url');
const { parseImSessionIdentity } = require('../../shared/im-session-key.cjs');

type LooseRecord = Record<string, any>;

type GatewaySdkModule = {
  GatewayClient: new (...args: any[]) => any;
  GATEWAY_CLIENT_NAMES: LooseRecord;
  GATEWAY_CLIENT_MODES: LooseRecord;
  VERSION: string;
};

type GatewaySdkArtifacts = {
  kind: 'stable' | 'legacy';
  cliRuntimePath?: string;
  gatewayRuntimePath?: string;
  replyModulePath?: string;
};

let gatewaySdkPromise: Promise<GatewaySdkModule> | null = null;
const GATEWAY_RETRY_DELAYS_MS = [250, 1000];
const OPENCLAW_WAIT_POLL_TIMEOUT_MS = 900;
const OPENCLAW_WAIT_POLL_COMMAND_TIMEOUT_MS = 10000;
const LEGACY_REPLY_MODULE_RE = /^reply-[A-Za-z0-9_]{6,}\.js$/;
const SYNTHETIC_EMPTY_OPENCLAW_RESPONSE = 'OpenClaw returned an empty response.';
const GATEWAY_RETRYABLE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

type Deferred<T = unknown> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type GatewayRetryOptions = {
  delays?: number[];
  attempts?: number;
};

type OpenClawDispatchOptions = {
  commandBody?: string;
  thinkMode?: string;
  operatorName?: string;
  idempotencyKey?: string;
  fastMode?: boolean;
  onDelta?: (delta: string) => void;
  initialText?: string;
  strictTurnMatch?: boolean;
};

type GatewaySubscriptionOptions = {
  onReady?: () => void;
  onEvent?: (evt: unknown) => void;
  onError?: (error: unknown) => void;
  onClose?: (reason?: unknown) => void;
};

type GatewayErrorLike = {
  code?: string;
  errno?: string;
  message?: string;
  cause?: unknown;
  errors?: unknown[];
};

type GatewayUnavailableError = Error & {
  code?: string;
  retryable?: boolean;
  cause?: unknown;
  runState?: unknown;
  latestText?: string;
};

type ExecFileResponse = {
  stdout?: string;
  stderr?: string;
};

type MessageAttachment = LooseRecord & {
  kind?: string;
  dataUrl?: string;
};

type OpenClawMessage = LooseRecord & {
  role?: string;
  content?: unknown;
  usage?: unknown;
};

type OpenClawRequestPayload = LooseRecord & {
  model: string;
  commandBody?: string;
};

type OpenClawRunState = {
  acceptedAt: number;
  runId: string;
  requestMessage: string;
  sessionKey: string;
};

type OpenClawResult = {
  outputText: string;
  usage: unknown;
  isError?: boolean;
};

type OpenClawStreamEvent = LooseRecord;

type OpenClawWaitResult = LooseRecord & {
  status?: string;
  error?: string;
};

type GatewayClientLike = {
  start: () => void;
  stop: () => void;
};

type OpenClawClientOptions = {
  config?: LooseRecord;
  execFileAsync?: (file: string, args?: string[], options?: Record<string, unknown>) => Promise<ExecFileResponse>;
  PROJECT_ROOT?: string;
  OPENCLAW_BIN?: string;
  clip?: (value?: unknown, maxLength?: number) => string;
  normalizeSessionUser?: (value?: unknown) => string;
  normalizeChatMessage?: (message?: unknown, ...args: unknown[]) => string;
  getMessageAttachments?: (message?: unknown) => MessageAttachment[];
  describeAttachmentForModel?: (attachment?: MessageAttachment) => string;
  buildOpenClawMessageContent?: (message?: unknown, mode?: string) => unknown;
  getCommandCenterSessionKey?: (...args: unknown[]) => string;
  resolveSessionAgentId?: (...args: unknown[]) => string;
  resolveSessionModel?: (...args: unknown[]) => string;
  resolveSessionRecord?: (agentId?: string, sessionKey?: string) => LooseRecord | null;
  readTextIfExists?: (filePath?: string) => string;
  tailLines?: (filePath?: string, lineCount?: number) => string[];
  loadGatewaySdk?: () => Promise<GatewaySdkModule>;
};

export function createOpenClawClient({
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
  resolveSessionRecord,
  readTextIfExists,
  tailLines,
  loadGatewaySdk,
}: OpenClawClientOptions) {
  const runtimeConfig = config ?? {};
  const openClawBin = String(OPENCLAW_BIN || runtimeConfig.openclawBin || 'openclaw').trim() || 'openclaw';
  const projectRoot = String(PROJECT_ROOT || process.cwd()).trim() || process.cwd();
  const clipText = typeof clip === 'function'
    ? clip
    : (value: unknown, maxLength = 10_000) => {
      const normalized = String(value || '');
      return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
    };
  const normalizeSessionUserValue = typeof normalizeSessionUser === 'function'
    ? normalizeSessionUser
    : (value: unknown) => String(value || '').trim();
  const normalizeChatMessageValue = typeof normalizeChatMessage === 'function'
    ? normalizeChatMessage
    : (message: unknown) => {
      if (typeof message === 'string') {
        return message;
      }
      if (message && typeof message === 'object' && typeof (message as LooseRecord).content === 'string') {
        return String((message as LooseRecord).content);
      }
      return '';
    };
  const getMessageAttachmentsList = typeof getMessageAttachments === 'function'
    ? getMessageAttachments
    : (): MessageAttachment[] => [];
  const describeAttachment = typeof describeAttachmentForModel === 'function'
    ? describeAttachmentForModel
    : () => '';
  const buildMessageContent = typeof buildOpenClawMessageContent === 'function'
    ? buildOpenClawMessageContent
    : (message: unknown, _mode?: string) => {
      if (message && typeof message === 'object' && 'content' in (message as LooseRecord)) {
        return (message as LooseRecord).content;
      }
      return typeof message === 'string' ? message : '';
    };
  const getSessionKey = typeof getCommandCenterSessionKey === 'function'
    ? getCommandCenterSessionKey
    : (...args: unknown[]) => String(args.find(Boolean) || 'main').trim() || 'main';
  const resolveAgentId = typeof resolveSessionAgentId === 'function'
    ? resolveSessionAgentId
    : () => 'main';
  const resolveModel = typeof resolveSessionModel === 'function'
    ? resolveSessionModel
    : () => 'main';
  const getSessionRecord = typeof resolveSessionRecord === 'function'
    ? resolveSessionRecord
    : () => null;
  const readText = typeof readTextIfExists === 'function'
    ? readTextIfExists
    : () => '';
  const readTailLines = typeof tailLines === 'function'
    ? tailLines
    : (): string[] => [];

  function getExecFileAsync() {
    if (typeof execFileAsync !== 'function') {
      throw new Error('execFileAsync is required');
    }
    return execFileAsync;
  }

  function buildOpenClawExecEnv(baseEnv = process.env) {
    const values = [
      path.dirname(process.execPath),
      path.isAbsolute(openClawBin) ? path.dirname(openClawBin) : '',
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

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createDeferred<T = unknown>(): Deferred<T> {
    let resolve: Deferred<T>['resolve'] = () => {};
    let reject: Deferred<T>['reject'] = () => {};
    const promise = new Promise<T>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    promise.catch(() => {});
    return { promise, resolve, reject };
  }

  function collectGatewayErrorSignals(error: unknown, signals = new Set<unknown>()) {
    if (!error || typeof error !== 'object' || signals.has(error)) {
      return signals;
    }

    const gatewayError = error as GatewayErrorLike;
    signals.add(error);

    if (gatewayError.cause && typeof gatewayError.cause === 'object') {
      collectGatewayErrorSignals(gatewayError.cause, signals);
    }

    if (gatewayError.errors && Array.isArray(gatewayError.errors)) {
      gatewayError.errors.forEach((entry) => collectGatewayErrorSignals(entry, signals));
    }

    return signals;
  }

  function isRetryableGatewayError(error: unknown) {
    const signals = [...collectGatewayErrorSignals(error)];

    return signals.some((entry) => {
      const gatewayError = entry as GatewayErrorLike;
      const code = String(gatewayError?.code || gatewayError?.errno || '').trim().toUpperCase();
      const message = String(gatewayError?.message || '').trim().toUpperCase();
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

  function wrapGatewayUnavailableError(error: unknown, operation: string, attempts: number) {
    const attemptLabel = attempts > 1 ? ` after ${attempts} attempts` : '';
    const gatewayError = error as GatewayErrorLike | null;
    const wrapped = new Error(
      `OpenClaw gateway unavailable during ${operation}${attemptLabel}: ${gatewayError?.message || 'Unknown gateway error'}`,
    ) as GatewayUnavailableError;
    wrapped.name = 'GatewayUnavailableError';
    wrapped.code = 'GATEWAY_UNAVAILABLE';
    wrapped.retryable = true;
    wrapped.cause = error;
    return wrapped;
  }

  async function withGatewayRetry<T>(operation: string, task: () => Promise<T>, options: GatewayRetryOptions = {}): Promise<T> {
    const delays = Array.isArray(options.delays) && options.delays.length
      ? options.delays
      : GATEWAY_RETRY_DELAYS_MS;
    const attempts = Math.max(1, Number(options.attempts) || (delays.length + 1));
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < attempts) {
      attempt += 1;
      try {
        return await task();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error || 'Unknown gateway error'));
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

  async function loadOpenClawGatewaySdk(): Promise<GatewaySdkModule> {
    if (typeof loadGatewaySdk === 'function') {
      return await loadGatewaySdk();
    }

    if (!gatewaySdkPromise) {
      gatewaySdkPromise = (async () => {
        const artifacts = await resolveOpenClawGatewaySdkArtifacts();
        if (artifacts.kind === 'stable' && artifacts.gatewayRuntimePath) {
          const gatewayRuntimeModule = await importOpenClawFileModule(artifacts.gatewayRuntimePath);
          const cliRuntimeModule = artifacts.cliRuntimePath
            ? await importOpenClawFileModule(artifacts.cliRuntimePath)
            : {};
          return {
            GatewayClient: gatewayRuntimeModule.GatewayClient,
            GATEWAY_CLIENT_NAMES: {
              GATEWAY_CLIENT: 'gateway-client',
            },
            GATEWAY_CLIENT_MODES: {
              BACKEND: 'backend',
            },
            VERSION: String((cliRuntimeModule as LooseRecord)?.VERSION || '').trim() || 'unknown',
          };
        }

        const replyModulePath = artifacts.replyModulePath || '';
        const module = await importOpenClawFileModule(replyModulePath);
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

  async function resolveOpenClawGatewaySdkArtifacts(): Promise<GatewaySdkArtifacts> {
    const candidateBins: string[] = [];
    if (path.isAbsolute(openClawBin)) {
      candidateBins.push(openClawBin);
    } else {
      try {
        const { stdout } = await getExecFileAsync()('which', [openClawBin], {
          cwd: projectRoot,
          env: buildOpenClawExecEnv(process.env),
          maxBuffer: 1024 * 32,
        });
        const resolvedBin = String(stdout || '').trim();
        if (resolvedBin) {
          candidateBins.push(resolvedBin);
        }
      } catch {}
    }

    const candidatePackageRoots: string[] = [];
    const pushPackageRoot = (packageRoot: string) => {
      const normalized = String(packageRoot || '').trim();
      if (!normalized || candidatePackageRoots.includes(normalized)) {
        return;
      }
      candidatePackageRoots.push(normalized);
    };

    for (const binPath of candidateBins) {
      pushPackageRoot(path.resolve(path.dirname(binPath), '..', 'lib', 'node_modules', 'openclaw'));
    }

    const prefixedRoots = [
      process.env.OPENCLAW_NPM_GLOBAL_ROOT,
      process.env.npm_config_prefix ? path.join(process.env.npm_config_prefix, 'lib', 'node_modules') : '',
      process.env.NPM_CONFIG_PREFIX ? path.join(process.env.NPM_CONFIG_PREFIX, 'lib', 'node_modules') : '',
      path.join(process.env.HOME || '', '.npm-global', 'lib', 'node_modules'),
    ].filter(Boolean);

    for (const root of prefixedRoots) {
      pushPackageRoot(path.join(root, 'openclaw'));
    }

    for (const packageRoot of candidatePackageRoots) {
      const artifacts = resolveOpenClawGatewaySdkArtifactsForPackageRoot(packageRoot);
      if (artifacts) {
        return artifacts;
      }
    }

    throw new Error('Unable to locate the OpenClaw gateway SDK');
  }

  async function invokeOpenClawTool(tool: string, args: LooseRecord = {}, sessionKey = 'main', action = '') {
    const endpoint = new URL('/tools/invoke', String(runtimeConfig.baseUrl || '')).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (runtimeConfig.apiKey) {
      headers.Authorization = `Bearer ${runtimeConfig.apiKey}`;
    }

    if (tool === 'message' && args && typeof args === 'object') {
      const channel = typeof args.channel === 'string' ? args.channel.trim() : '';
      const target = typeof args.target === 'string'
        ? args.target.trim()
        : typeof args.to === 'string'
          ? args.to.trim()
          : '';
      const accountId = typeof args.accountId === 'string' ? args.accountId.trim() : '';
      const threadId =
        typeof args.threadId === 'string'
          ? args.threadId.trim()
          : typeof args.threadId === 'number' && Number.isFinite(args.threadId)
            ? String(args.threadId)
            : '';

      if (channel) {
        headers['x-openclaw-message-channel'] = channel;
      }
      if (target) {
        headers['x-openclaw-message-to'] = target;
      }
      if (accountId) {
        headers['x-openclaw-account-id'] = accountId;
      }
      if (threadId) {
        headers['x-openclaw-thread-id'] = threadId;
      }
    }

    const payload: Record<string, unknown> = {
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

    const data = (await response.json()) as LooseRecord;
    if (!data?.ok) {
      throw new Error(data?.error?.message || 'Tool invoke failed');
    }

    return data.result || null;
  }

  function getGatewayWebSocketUrl() {
    if (!runtimeConfig.baseUrl) {
      return '';
    }

    const url = new URL(String(runtimeConfig.baseUrl));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async function callOpenClawGateway(method: string, params: LooseRecord = {}, timeoutMs = 10000) {
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

    if (runtimeConfig.apiKey) {
      args.push('--token', runtimeConfig.apiKey);
    }

    const { stdout } = await withGatewayRetry(`gateway RPC ${method}`, async () => await getExecFileAsync()(openClawBin, args, {
      cwd: projectRoot,
      env: buildOpenClawExecEnv(process.env),
      maxBuffer: 1024 * 1024,
    }));

    try {
      return parseGatewayJsonOutput(stdout);
    } catch (error) {
      const nextError = error as Error;
      throw new Error(`Gateway RPC returned invalid JSON: ${nextError.message}`);
    }
  }

  function parseGatewayJsonOutput(stdout = '') {
    const raw = String(stdout || '');
    const text = raw.trim();
    if (!text) {
      return {};
    }

    const candidates: string[] = [];
    const seen = new Set();
    const pushCandidate = (value: unknown) => {
      const normalized = String(value || '').trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      candidates.push(normalized);
    };

    pushCandidate(text);

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line) => pushCandidate(line));
    for (let index = 0; index < lines.length; index += 1) {
      pushCandidate(lines.slice(index).join('\n'));
    }

    for (let index = 0; index < text.length; index += 1) {
      const marker = text[index];
      if (marker === '{' || marker === '[') {
        pushCandidate(text.slice(index));
      }
    }

    for (let index = text.length - 1; index >= 0; index -= 1) {
      const marker = text[index];
      if (marker === '}' || marker === ']') {
        pushCandidate(text.slice(0, index + 1));
      }
    }

    let lastError: Error | null = null;
    let scalarFallback: unknown;
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
        if (scalarFallback === undefined) {
          scalarFallback = parsed;
        }
      } catch (error) {
        lastError = error as Error;
      }
    }

    if (scalarFallback !== undefined) {
      return scalarFallback;
    }

    const preview = clipText(text.replace(/\s+/g, ' '), 200);
    throw new Error(`${lastError?.message || 'Unknown JSON parse error'}; stdout preview: ${preview}`);
  }

  async function fetchBrowserPeek() {
    if (runtimeConfig.mode !== 'openclaw') {
      return {
        summary: '未连接 OpenClaw。',
        items: [{ label: '控制台', value: '当前处于 mock 模式' }],
      };
    }

    const controlUiUrl = `${String(runtimeConfig.baseUrl || '')}/`;
    const healthUrl = `${String(runtimeConfig.baseUrl || '')}/healthz`;
    const browserServerLog = readTailLines(readText(path.join(String(runtimeConfig.logsDir || ''), 'gateway.log')), 80)
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
        { label: 'Browser Control', value: browserServerLog ? browserServerLog.split('[browser/server] ')[1] : `127.0.0.1:${runtimeConfig.browserControlPort}` },
      ],
    };
  }

  async function callOpenClaw(messages: OpenClawMessage[], fastMode: boolean, sessionUser = 'command-center', options: OpenClawDispatchOptions = {}) {
    const request = buildOpenClawRequest(messages, fastMode, sessionUser, options, false);
    const response = await withGatewayRetry('chat request', async () => await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw request failed: ${response.status} ${clipText(errorText, 200)}`);
    }

    const data = await response.json();
    return parseOpenClawResponse(data as LooseRecord);
  }

  function buildOpenClawRequest(
    messages: OpenClawMessage[],
    fastMode: boolean,
    sessionUser = 'command-center',
    options: OpenClawDispatchOptions = {},
    stream = false,
  ) {
    const agentId = resolveAgentId(sessionUser);
    const model = resolveModel(sessionUser, agentId);
    const commandBody = typeof options.commandBody === 'string' ? options.commandBody.trim() : '';
    const normalizedMessages =
      commandBody && !messages.some((message: OpenClawMessage) => message?.role === 'user')
        ? [{ role: 'user', content: '\u200b' }, ...messages]
        : messages;
    const endpoint = new URL(String(runtimeConfig.apiPath || ''), String(runtimeConfig.baseUrl || '')).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (runtimeConfig.apiKey) {
      headers.Authorization = `Bearer ${runtimeConfig.apiKey}`;
    }

    if (agentId) {
      headers['x-openclaw-agent-id'] = agentId;
    }

    const systemPrompt =
      'You are OpenClaw, acting as the command center agent for a software workspace. ' +
      'Respond concisely and include operational clarity for the human operator. ' +
      'When image attachments are provided as multimodal inputs, treat them as real visual inputs available in the conversation. ' +
      'Do not claim they are merely thumbnails, previews, display images, or unavailable source files unless a tool explicitly reports that limitation.';

    let payload: OpenClawRequestPayload;
    if (runtimeConfig.apiStyle === 'responses') {
      payload = {
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          ...normalizedMessages.map((message: OpenClawMessage) => ({
            role: message.role,
            content: buildMessageContent(message, 'responses'),
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
          ...normalizedMessages.map((message: OpenClawMessage) => ({
            role: message.role,
            content: buildMessageContent(message, 'chat'),
          })),
        ],
        temperature: fastMode ? 0.3 : 0.7,
        stream,
        user: normalizeSessionUserValue(sessionUser),
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

  function buildOpenClawSessionMessage(message: unknown) {
    const text = normalizeChatMessageValue(message).trim();
    const attachments = getMessageAttachmentsList(message);
    const attachmentPrompts = attachments.map((attachment) => describeAttachment(attachment)).filter(Boolean);
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
    if (trimmedSessionUser.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmedSessionUser);
        if (String(parsed?.channel || '').trim() === 'dingtalk-connector') {
          return parsed;
        }
      } catch {}
    }

    const parsedIdentity = parseImSessionIdentity(trimmedSessionUser, {
      agentId: resolveAgentId(trimmedSessionUser) || 'main',
    });
    if (String(parsedIdentity?.channel || '').trim() !== 'dingtalk-connector') {
      return null;
    }

    return {
      accountid: parsedIdentity?.accountId || '',
      chattype: parsedIdentity?.chatType || 'direct',
      peerid: parsedIdentity?.peerId || '',
    };
  }

  function isResetDingTalkSessionUser(sessionUser = '') {
    const parsed = parseDingTalkSessionUser(sessionUser);
    if (!parsed) {
      return false;
    }

    const peerId = parsed?.peerid || parsed?.peerId || parsed?.groupid || parsed?.groupId || parsed?.conversationid || parsed?.conversationId || '';
    return /:reset:[^:]+$/i.test(String(peerId || '').trim());
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

  function stripWeixinResetSuffix(value = '') {
    return String(value || '').trim().replace(/:reset:[^:]+$/i, '');
  }

  function normalizeWeixinAccountId(value = '') {
    return String(value || '').trim() || 'default';
  }

  function createWeixinDeliveryRoute({ accountId = '', peerId = '' } = {}) {
    const normalizedPeerId = stripWeixinResetSuffix(peerId);
    if (!normalizedPeerId) {
      return null;
    }

    const normalizedAccountId = normalizeWeixinAccountId(accountId);
    return {
      channel: 'openclaw-weixin',
      to: normalizedPeerId,
      ...(normalizedAccountId ? { accountId: normalizedAccountId } : {}),
    };
  }

  function parseWeixinSessionUser(sessionUser = '') {
    const parsedIdentity = parseImSessionIdentity(String(sessionUser || '').trim(), { agentId: 'main' });
    if (String(parsedIdentity?.channel || '').trim() !== 'openclaw-weixin') {
      return null;
    }

    return {
      agentId: String(parsedIdentity?.agentId || '').trim(),
      channel: 'openclaw-weixin',
      chattype: String(parsedIdentity?.chatType || '').trim() || 'direct',
      peerid: String(parsedIdentity?.peerId || '').trim(),
      accountid: String(parsedIdentity?.accountId || '').trim(),
    };
  }

  function normalizeWeixinPeerCandidate(value = '') {
    return String(value || '').trim().replace(/^(?:user|group|channel):/i, '').trim();
  }

  function resolveWeixinSessionDeliveryMetadata(sessionUser = '', parsedSessionUser: LooseRecord | null = null) {
    if (!parsedSessionUser) {
      return null;
    }

    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
    const sessionRecord = getSessionRecord(agentId, sessionKey);
    if (!sessionRecord || typeof sessionRecord !== 'object') {
      return null;
    }

    const fallbackPeerId = String(parsedSessionUser?.peerid || parsedSessionUser?.peerId || '').trim();
    const normalizedFallbackPeerId = fallbackPeerId.toLowerCase();
    const peerCandidates = [
      sessionRecord?.deliveryContext?.to,
      sessionRecord?.lastTo,
      sessionRecord?.origin?.to,
      sessionRecord?.origin?.from,
      sessionRecord?.origin?.label,
    ];

    let resolvedPeerId = fallbackPeerId;
    for (const candidate of peerCandidates) {
      const normalizedCandidate = normalizeWeixinPeerCandidate(candidate);
      if (!normalizedCandidate) {
        continue;
      }

      if (!normalizedFallbackPeerId || normalizedCandidate.toLowerCase() === normalizedFallbackPeerId) {
        resolvedPeerId = normalizedCandidate;
        break;
      }
    }

    const resolvedAccountId = String(
      sessionRecord?.deliveryContext?.accountId
      || sessionRecord?.lastAccountId
      || sessionRecord?.origin?.accountId
      || parsedSessionUser?.accountid
      || parsedSessionUser?.accountId
      || '',
    ).trim();

    return {
      accountId: resolvedAccountId,
      peerId: resolvedPeerId,
    };
  }

  function resolveSessionDeliveryRoute(sessionUser = 'command-center') {
    const trimmedSessionUser = String(sessionUser || '').trim();
    if (!trimmedSessionUser) {
      return null;
    }

    const parsedSessionUser = parseDingTalkSessionUser(trimmedSessionUser);
    if (parsedSessionUser) {
      if (isResetDingTalkSessionUser(trimmedSessionUser)) {
        return null;
      }
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

    const parsedWeixinSessionUser = parseWeixinSessionUser(trimmedSessionUser);
    if (parsedWeixinSessionUser) {
      const resolvedWeixinMetadata = resolveWeixinSessionDeliveryMetadata(trimmedSessionUser, parsedWeixinSessionUser);
      return createWeixinDeliveryRoute({
        accountId: resolvedWeixinMetadata?.accountId || parsedWeixinSessionUser.accountid,
        peerId: resolvedWeixinMetadata?.peerId || parsedWeixinSessionUser.peerid,
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

    const secondPart = parts[1];
    if (secondPart && ['direct', 'group', 'channel'].includes(secondPart)) {
      chatType = secondPart;
      peerId = parts.slice(2).join(':');
    } else if (parts.length >= 3) {
      accountId = secondPart || accountId;
      peerId = parts.slice(2).join(':');
    } else {
      peerId = secondPart || '';
    }

    return createDingTalkDeliveryRoute({
      accountId,
      chatType,
      peerId,
    });
  }

  function requiresDirectOpenClawRequest(messages: unknown[] = [], options: OpenClawDispatchOptions = {}) {
    if (options.fastMode) {
      return true;
    }

    return requiresDirectMultimodalRequest(messages);
  }

  function requiresDirectMultimodalRequest(messages: unknown[] = []) {
    return messages.some((message: unknown) =>
      getMessageAttachmentsList(message).some((attachment: MessageAttachment) => attachment.kind === 'image' && attachment.dataUrl),
    );
  }

  function isSyntheticEmptyOpenClawResponse(messageText = '') {
    return String(messageText || '').trim() === SYNTHETIC_EMPTY_OPENCLAW_RESPONSE;
  }

  function normalizeOpenClawErrorText(value: unknown) {
    return String(value || '').replace(/\r\n?/g, '\n').trim();
  }

  function extractOpenClawMessageError(message: OpenClawMessage | null) {
    if (!message || typeof message !== 'object') {
      return '';
    }

    const explicitError = [
      message.errorMessage,
      message.error,
      message.lastError,
    ]
      .map((value) => normalizeOpenClawErrorText(value))
      .find(Boolean);

    if (explicitError) {
      return explicitError;
    }

    const stopReason = normalizeOpenClawErrorText(
      message.stopReason
      || message.finishReason
      || message.finish_reason
      || message.status,
    ).toLowerCase();
    if (isFailedOpenClawWaitStatus(stopReason)) {
      return `OpenClaw session ${stopReason}`;
    }

    return '';
  }

  function extractOpenClawEventError(event: OpenClawStreamEvent | null) {
    if (!event || typeof event !== 'object') {
      return '';
    }

    const explicitError = [
      event.errorMessage,
      event.error,
      event?.message?.errorMessage,
      event?.message?.error,
      event?.payload?.errorMessage,
      event?.payload?.error,
    ]
      .map((value) => normalizeOpenClawErrorText(value))
      .find(Boolean);

    if (explicitError) {
      return explicitError;
    }

    const state = normalizeOpenClawErrorText(event.state || event.status).toLowerCase();
    if (isFailedOpenClawWaitStatus(state)) {
      return `OpenClaw session ${state}`;
    }

    return '';
  }

  function buildMirroredUserMessageText(sessionUser = 'command-center', messageText = '', options: OpenClawDispatchOptions = {}) {
    const trimmedMessage = String(messageText || '').trim();
    if (!trimmedMessage) {
      return '';
    }

    const operatorName = String(options?.operatorName || '').trim();
    if (parseFeishuSessionUser(sessionUser) || parseWecomSessionUser(sessionUser) || parseWeixinSessionUser(sessionUser)) {
      return operatorName ? `${operatorName}：${trimmedMessage}` : trimmedMessage;
    }

    const parsedSessionUser = parseDingTalkSessionUser(sessionUser);
    const senderName = String(parsedSessionUser?.sendername || parsedSessionUser?.senderName || '').trim();
    if (!senderName) {
      return trimmedMessage;
    }

    return `${senderName}：${trimmedMessage}`;
  }

  async function mirrorOpenClawUserMessage(sessionUser = 'command-center', messageText = '', options: OpenClawDispatchOptions = {}) {
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);
    const trimmedMessage = buildMirroredUserMessageText(sessionUser, messageText, options);
    if (!deliveryRoute || !trimmedMessage) {
      return null;
    }

    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
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

  async function mirrorOpenClawAssistantMessage(sessionUser = 'command-center', messageText = '') {
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);
    const trimmedMessage = String(messageText || '').trim();
    if (!deliveryRoute || !trimmedMessage) {
      return null;
    }

    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
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

  function shouldMirrorAssistantReply(
    deliveryRoute: ReturnType<typeof resolveSessionDeliveryRoute>,
    requiresDirectMultimodal = false,
  ) {
    if (!deliveryRoute) {
      return false;
    }

    return requiresDirectMultimodal || Boolean(deliveryRoute.channel);
  }

  async function maybeMirrorAssistantReply(
    sessionUser = 'command-center',
    messageText = '',
    deliveryRoute: ReturnType<typeof resolveSessionDeliveryRoute> = null,
    requiresDirectMultimodal = false,
    options: { isError?: boolean } = {},
  ) {
    if (!shouldMirrorAssistantReply(deliveryRoute, requiresDirectMultimodal)) {
      return null;
    }

    if (options?.isError || isSyntheticEmptyOpenClawResponse(messageText)) {
      return null;
    }

    return await mirrorOpenClawAssistantMessage(sessionUser, messageText);
  }

  async function callOpenClawSession(messages: OpenClawMessage[], sessionUser = 'command-center', timeoutMs = 30000): Promise<OpenClawResult> {
    const result = await startOpenClawSessionRun(messages, sessionUser);
    const finalSession = await waitForOpenClawSessionCompletion(result, timeoutMs);
    const finalAssistant = finalSession?.assistant || null;
    const finalText =
      (finalAssistant ? normalizeChatMessageValue(finalAssistant) : '')
      || finalSession?.errorText
      || SYNTHETIC_EMPTY_OPENCLAW_RESPONSE;
    return {
      outputText: finalText,
      usage: finalAssistant?.usage || null,
      ...(finalSession?.errorText && !normalizeChatMessageValue(finalAssistant) ? { isError: true } : {}),
    };
  }

  async function startOpenClawSessionRun(messages: OpenClawMessage[], sessionUser = 'command-center'): Promise<OpenClawRunState | null> {
    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
    const message = messages.map((entry: OpenClawMessage) => buildOpenClawSessionMessage(entry)).filter(Boolean).join('\n\n').trim();

    if (!message) {
      return null;
    }

    const runId = crypto.randomUUID();
    const startResult = await callOpenClawGateway(
      'agent',
      buildGatewayAgentStartParams(sessionUser, message, runId),
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

  function buildGatewayChatSendParams(sessionUser = 'command-center', message = '', timeoutMs = 30000, options: OpenClawDispatchOptions = {}) {
    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
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

  function buildGatewayAgentStartParams(sessionUser = 'command-center', message = '', idempotencyKey = '') {
    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);

    return {
      message,
      sessionKey,
      idempotencyKey,
      deliver: Boolean(deliveryRoute),
      channel: deliveryRoute?.channel || 'webchat',
      ...(deliveryRoute?.to ? { to: deliveryRoute.to } : {}),
      ...(deliveryRoute?.to ? { replyTo: deliveryRoute.to } : {}),
      ...(deliveryRoute?.accountId ? { accountId: deliveryRoute.accountId } : {}),
      ...(deliveryRoute?.accountId ? { replyAccountId: deliveryRoute.accountId } : {}),
      ...(deliveryRoute?.channel ? { replyChannel: deliveryRoute.channel } : {}),
      lane: 'nested',
    };
  }

  function normalizeMessageTimestamp(value: unknown): number {
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

  function normalizeComparableMessageText(message: unknown) {
    return normalizeChatMessageValue(message).replace(/\r\n/g, '\n').trim();
  }

  function isTerminalOpenClawWaitStatus(status = '') {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return Boolean(normalizedStatus) && !['timeout', 'started', 'running'].includes(normalizedStatus);
  }

  function isFailedOpenClawWaitStatus(status = '') {
    return ['error', 'aborted', 'failed', 'cancelled', 'canceled'].includes(String(status || '').trim().toLowerCase());
  }

  function isCurrentTurnUserMessage(entry: OpenClawMessage, requestMessage = '') {
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

  function findLatestAssistantSince(
    messages: OpenClawMessage[] = [],
    acceptedAt = 0,
    requestMessage = '',
    options: OpenClawDispatchOptions = {},
  ): OpenClawMessage | null {
    return findLatestAssistantEntrySince(
      messages,
      acceptedAt,
      requestMessage,
      options,
      (entry: OpenClawMessage) => Boolean(normalizeChatMessageValue(entry)),
    );
  }

  function findLatestAssistantErrorSince(
    messages: OpenClawMessage[] = [],
    acceptedAt = 0,
    requestMessage = '',
    options: OpenClawDispatchOptions = {},
  ): OpenClawMessage | null {
    return findLatestAssistantEntrySince(
      messages,
      acceptedAt,
      requestMessage,
      options,
      (entry: OpenClawMessage) => Boolean(extractOpenClawMessageError(entry)),
    );
  }

  function findLatestAssistantEntrySince(
    messages: OpenClawMessage[] = [],
    acceptedAt = 0,
    requestMessage = '',
    options: OpenClawDispatchOptions = {},
    predicate: (entry: OpenClawMessage) => boolean = () => false,
  ): OpenClawMessage | null {
    const normalizedAcceptedAt = Number.isFinite(Number(acceptedAt)) ? Number(acceptedAt) : 0;
    const normalizedRequestMessage = String(requestMessage || '').trim();
    const strictTurnMatch = Boolean(options?.strictTurnMatch);
    const turnUserIndex = [...messages]
      .map((entry: OpenClawMessage, index) => {
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

    if (typeof turnUserIndex === 'number' && Number.isInteger(turnUserIndex) && turnUserIndex >= 0) {
      const turnAssistants = messages
        .slice(turnUserIndex + 1)
        .filter((entry: OpenClawMessage) => entry?.role === 'assistant' && predicate(entry));

      if (turnAssistants.length) {
        return turnAssistants[turnAssistants.length - 1] || null;
      }

      return null;
    }

    if (normalizedRequestMessage && strictTurnMatch) {
      return null;
    }

    const assistants = [...messages].reverse().filter((entry: OpenClawMessage) => entry?.role === 'assistant' && predicate(entry));

    if (normalizedAcceptedAt > 0) {
      return assistants.find((entry) => normalizeMessageTimestamp(entry?.timestamp) >= normalizedAcceptedAt) || null;
    }

    return assistants[0] || null;
  }

  async function readOpenClawSessionSnapshot(
    runState: OpenClawRunState | null,
    options: OpenClawDispatchOptions = {},
  ): Promise<{ assistant: OpenClawMessage | null; errorText: string }> {
    if (!runState?.sessionKey) {
      return {
        assistant: null,
        errorText: '',
      };
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
    const assistant = findLatestAssistantSince(historyMessages, runState.acceptedAt, runState.requestMessage, options);
    const assistantWithError = findLatestAssistantErrorSince(historyMessages, runState.acceptedAt, runState.requestMessage, options);
    return {
      assistant,
      errorText: extractOpenClawMessageError(assistantWithError),
    };
  }

  async function readOpenClawSessionAssistant(runState: OpenClawRunState | null, options: OpenClawDispatchOptions = {}): Promise<OpenClawMessage | null> {
    const snapshot = await readOpenClawSessionSnapshot(runState, options);
    return snapshot.assistant;
  }

  async function waitForOpenClawSessionCompletion(
    runState: OpenClawRunState | null,
    timeoutMs = 30000,
  ): Promise<{ assistant: OpenClawMessage | null; errorText: string }> {
    if (!runState?.runId) {
      return {
        assistant: null,
        errorText: '',
      };
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

    return await readOpenClawSessionSnapshot(runState);
  }

  function extractStreamText(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item: unknown) => extractStreamText(item)).join('');
    }

    const record = value as LooseRecord;

    if (typeof record.text === 'string') {
      return record.text;
    }

    if (typeof record.delta === 'string') {
      return record.delta;
    }

    if (typeof record.output_text === 'string') {
      return record.output_text;
    }

    if (record.content) {
      return extractStreamText(record.content);
    }

    return '';
  }

  function extractOpenClawStreamDelta(event: OpenClawStreamEvent | null): string {
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

  function extractOpenClawStreamUsage(event: OpenClawStreamEvent | null) {
    return event?.usage || event?.response?.usage || null;
  }

  function extractOpenClawStreamOutput(event: OpenClawStreamEvent | null): string {
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
    return normalizeChatMessageValue(choiceMessage) || '';
  }

  async function consumeSseEvents(response: Response, onEvent: (event: OpenClawStreamEvent) => void): Promise<void> {
    const reader = response.body?.getReader?.();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const flushEventBlock = (block: string) => {
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

  async function callOpenClawStream(
    messages: OpenClawMessage[],
    fastMode: boolean,
    sessionUser = 'command-center',
    options: OpenClawDispatchOptions = {},
  ): Promise<OpenClawResult> {
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {};
    const request = buildOpenClawRequest(messages, fastMode, sessionUser, options, true);
    const response = await withGatewayRetry('streaming chat request', async () => await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
    }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw request failed: ${response.status} ${clipText(errorText, 200)}`);
    }

    if (!response.body) {
      const data = await response.json();
      const parsed = parseOpenClawResponse(data as LooseRecord);
      if (parsed.outputText) {
        onDelta(parsed.outputText);
      }
      return parsed;
    }

    let outputText = '';
    let usage: unknown = null;

    await consumeSseEvents(response, (event: OpenClawStreamEvent) => {
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
      outputText: outputText || SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
      usage,
    };
  }

  async function callOpenClawSessionStream(
    messages: OpenClawMessage[],
    sessionUser = 'command-center',
    timeoutMs = 30000,
    options: OpenClawDispatchOptions = {},
  ): Promise<OpenClawResult> {
    try {
      return await callOpenClawSessionEventStream(messages, sessionUser, timeoutMs, options);
    } catch (error) {
      const gatewayError = error as GatewayUnavailableError;
      if (gatewayError?.runState) {
        return await pollOpenClawSessionRun(gatewayError.runState as OpenClawRunState, timeoutMs, {
          ...options,
          initialText: gatewayError.latestText || '',
        });
      }
      return await callOpenClawSessionStreamPolling(messages, sessionUser, timeoutMs, options);
    }
  }

  async function callOpenClawSessionEventStream(
    messages: OpenClawMessage[],
    sessionUser = 'command-center',
    timeoutMs = 30000,
    options: OpenClawDispatchOptions = {},
  ): Promise<OpenClawResult> {
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {};
    const silentDeltaPollMs = 1500;
    const { GatewayClient, GATEWAY_CLIENT_NAMES, GATEWAY_CLIENT_MODES, VERSION } = await loadOpenClawGatewaySdk();
    if (typeof GatewayClient !== 'function') {
      throw new Error('OpenClaw Gateway client is unavailable');
    }

    const agentId = resolveAgentId(sessionUser);
    const sessionKey = getSessionKey(agentId, sessionUser);
    const message = messages.map((entry) => buildOpenClawSessionMessage(entry)).filter(Boolean).join('\n\n').trim();
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);
    if (!message) {
      return {
        outputText: SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
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
    let activeRunState: OpenClawRunState | null = null;
    const acceptedRunIds = new Set([runId]);
    let silentDeltaPollTimer: ReturnType<typeof setTimeout> | null = null;
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
        silentDeltaPollTimer = null;
      }
    };

    const settleFromSilentWaitResult = (waitResult: OpenClawWaitResult | null) => {
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
          const nextText = latestAssistant ? normalizeChatMessageValue(latestAssistant) || '' : '';
          const previousLatestText = latestText;
          emitDeltaFromFullText(nextText);
          const historyReplyMatchesActivePrefix =
            !previousLatestText
            || nextText === previousLatestText
            || nextText.startsWith(previousLatestText);
          if (!settled && latestAssistant && nextText && historyReplyMatchesActivePrefix) {
            settled = true;
            resolveFinal({
              event: 'chat',
              payload: {
                sessionKey: activeRunState.sessionKey,
                runId: activeRunState.runId,
                state: 'final',
                message: latestAssistant,
                source: 'history',
              },
            });
            return;
          }
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
      token: runtimeConfig.apiKey || undefined,
      clientName: GATEWAY_CLIENT_NAMES?.GATEWAY_CLIENT || 'gateway-client',
      clientDisplayName: 'LalaClaw',
      clientVersion: VERSION || 'unknown',
      platform: process.platform,
      mode: GATEWAY_CLIENT_MODES?.BACKEND || 'backend',
      onHelloOk: () => resolveReady(undefined),
      onConnectError: (error: unknown) => {
        rejectReady(error);
        rejectFinal(error);
      },
      onClose: (_code: unknown, reason: unknown) => {
        if (!settled) {
          const error = new Error(String(reason || 'Gateway chat stream closed'));
          rejectReady(error);
          rejectFinal(error);
        }
      },
      onEvent: (evt: OpenClawStreamEvent) => {
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
          const nextText = normalizeChatMessageValue(payload.message) || '';
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
        deliveryRoute ? 'agent' : 'chat.send',
        deliveryRoute
          ? buildGatewayAgentStartParams(sessionUser, message, runId)
          : buildGatewayChatSendParams(sessionUser, message, timeoutMs, {
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

      let finalSession = {
        assistant: null as OpenClawMessage | null,
        errorText: '',
      };
      try {
        finalSession = await readOpenClawSessionSnapshot(activeRunState);
      } catch {}
      const finalAssistant = finalSession.assistant;
      const finalErrorText =
        extractOpenClawEventError(finalPayload as OpenClawStreamEvent | null)
        || finalSession.errorText;
      const finalText =
        normalizeChatMessageValue((finalPayload as { message?: unknown } | null)?.message)
        || (finalAssistant ? normalizeChatMessageValue(finalAssistant) : '')
        || latestText
        || finalErrorText;
      const isErrorResponse = Boolean(
        finalErrorText
        && !normalizeChatMessageValue((finalPayload as { message?: unknown } | null)?.message)
        && !normalizeChatMessageValue(finalAssistant)
        && !latestText,
      );

      emitDeltaFromFullText(finalText);

      return {
        outputText: finalText || SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
        usage: finalAssistant?.usage || null,
        ...(isErrorResponse ? { isError: true } : {}),
      };
    } catch (error) {
      if (activeRunState) {
        const gatewayError = error as GatewayUnavailableError;
        gatewayError.runState = activeRunState;
        gatewayError.latestText = latestText;
      }
      throw error;
    } finally {
      settled = true;
      stopSilentDeltaPolling();
      closeClient();
    }
  }

  async function pollOpenClawSessionRun(runState: OpenClawRunState, timeoutMs = 30000, options: OpenClawDispatchOptions = {}): Promise<OpenClawResult> {
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

      const latestSession = await readOpenClawSessionSnapshot(runState);
      const latestAssistant = latestSession.assistant;
      const nextText = latestAssistant ? normalizeChatMessageValue(latestAssistant) || '' : '';
      if (nextText && nextText.startsWith(latestText) && nextText.length > latestText.length) {
        const delta = nextText.slice(latestText.length);
        latestText = nextText;
        onDelta(delta);
      } else if (!latestText && nextText) {
        latestText = nextText;
        onDelta(nextText);
      }

      if (String(waitResult?.status || '').trim().toLowerCase() === 'timeout') {
        if (latestAssistant || latestSession.errorText) {
          const finalAssistant = latestAssistant;
          const finalText =
            (finalAssistant ? normalizeChatMessageValue(finalAssistant) : '')
            || latestText
            || latestSession.errorText;
          const isErrorResponse = Boolean(
            latestSession.errorText
            && !normalizeChatMessageValue(finalAssistant)
            && !latestText,
          );
          return {
            outputText: finalText || SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
            usage: finalAssistant?.usage || null,
            ...(isErrorResponse ? { isError: true } : {}),
          };
        }
        continue;
      }

      if (isFailedOpenClawWaitStatus(waitResult?.status)) {
        throw new Error(waitResult?.error || `OpenClaw session ${String(waitResult?.status || '').trim().toLowerCase()}`);
      }

      const finalSession =
        latestAssistant || latestSession.errorText
          ? latestSession
          : await waitForOpenClawSessionCompletion(runState, timeoutMs);
      const finalAssistant = finalSession.assistant;
      const finalText =
        (finalAssistant ? normalizeChatMessageValue(finalAssistant) : '')
        || latestText
        || finalSession.errorText;
      const isErrorResponse = Boolean(
        finalSession.errorText
        && !normalizeChatMessageValue(finalAssistant)
        && !latestText,
      );
      if (finalText && finalText.startsWith(latestText) && finalText.length > latestText.length) {
        onDelta(finalText.slice(latestText.length));
        latestText = finalText;
      }

      return {
        outputText: finalText || SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
        usage: finalAssistant?.usage || null,
        ...(isErrorResponse ? { isError: true } : {}),
      };
    }
  }

  async function callOpenClawSessionStreamPolling(
    messages: OpenClawMessage[],
    sessionUser = 'command-center',
    timeoutMs = 30000,
    options: OpenClawDispatchOptions = {},
  ): Promise<OpenClawResult> {
    const runState = await startOpenClawSessionRun(messages, sessionUser);
    if (!runState) {
      return {
        outputText: SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
        usage: null,
      };
    }

    return await pollOpenClawSessionRun(runState, timeoutMs, options);
  }

  async function dispatchOpenClaw(
    messages: OpenClawMessage[],
    fastMode: boolean,
    sessionUser = 'command-center',
    options: OpenClawDispatchOptions = {},
  ): Promise<OpenClawResult> {
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);
    const requiresDirectMultimodal = requiresDirectMultimodalRequest(messages);
    if (isResetDingTalkSessionUser(sessionUser)) {
      return await callOpenClawSession(messages, sessionUser);
    }
    if (deliveryRoute && requiresDirectMultimodal) {
      const result = await callOpenClaw(messages, fastMode, sessionUser, options);
      try {
        await maybeMirrorAssistantReply(sessionUser, result.outputText, deliveryRoute, requiresDirectMultimodal, {
          isError: result.isError,
        });
      } catch (error) {
        console.warn('[openclaw-client] mirrorOpenClawAssistantMessage failed', {
          error: error instanceof Error ? error.message : String(error || ''),
          sessionUser,
        });
      }
      return result;
    }
    if (!deliveryRoute && requiresDirectOpenClawRequest(messages, { ...options, fastMode })) {
      return await callOpenClaw(messages, fastMode, sessionUser, options);
    }
    const result = await callOpenClawSession(messages, sessionUser);
    try {
      await maybeMirrorAssistantReply(sessionUser, result.outputText, deliveryRoute, false, {
        isError: result.isError,
      });
    } catch (error) {
      console.warn('[openclaw-client] mirrorOpenClawAssistantMessage failed', {
        error: error instanceof Error ? error.message : String(error || ''),
        sessionUser,
      });
    }
    return result;
  }

  async function dispatchOpenClawStream(
    messages: OpenClawMessage[],
    fastMode: boolean,
    sessionUser = 'command-center',
    options: OpenClawDispatchOptions = {},
  ): Promise<OpenClawResult> {
    const deliveryRoute = resolveSessionDeliveryRoute(sessionUser);
    const requiresDirectMultimodal = requiresDirectMultimodalRequest(messages);
    if (isResetDingTalkSessionUser(sessionUser)) {
      return await callOpenClawSessionStream(messages, sessionUser, 30000, options);
    }
    if (deliveryRoute && requiresDirectMultimodal) {
      const result = await callOpenClawStream(messages, fastMode, sessionUser, options);
      try {
        await maybeMirrorAssistantReply(sessionUser, result.outputText, deliveryRoute, requiresDirectMultimodal, {
          isError: result.isError,
        });
      } catch (error) {
        console.warn('[openclaw-client] mirrorOpenClawAssistantMessage failed', {
          error: error instanceof Error ? error.message : String(error || ''),
          sessionUser,
        });
      }
      return result;
    }
    if (!deliveryRoute && requiresDirectOpenClawRequest(messages, { ...options, fastMode })) {
      return await callOpenClawStream(messages, fastMode, sessionUser, options);
    }
    const result = await callOpenClawSessionStream(messages, sessionUser, 30000, options);
    try {
      await maybeMirrorAssistantReply(sessionUser, result.outputText, deliveryRoute, false, {
        isError: result.isError,
      });
    } catch (error) {
      console.warn('[openclaw-client] mirrorOpenClawAssistantMessage failed', {
        error: error instanceof Error ? error.message : String(error || ''),
        sessionUser,
      });
    }
    return result;
  }

  function parseOpenClawResponse(data: LooseRecord): OpenClawResult {
    if (typeof data.output_text === 'string') {
      return {
        outputText: data.output_text,
        usage: data.usage || null,
      };
    }

    const choice = data.choices?.[0]?.message;
    return {
      outputText: normalizeChatMessageValue(choice) || SYNTHETIC_EMPTY_OPENCLAW_RESPONSE,
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
  function subscribeGatewayEvents({ onReady, onEvent, onError, onClose }: GatewaySubscriptionOptions = {}) {
    let client: GatewayClientLike | null = null;
    let stopped = false;
    let readyNotified = false;

    function markReady() {
      if (readyNotified || stopped) {
        return;
      }
      readyNotified = true;
      if (typeof onReady === 'function') {
        onReady();
      }
    }

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

        const nextClient = new sdk.GatewayClient({
          url: gatewayUrl,
          token: runtimeConfig.apiKey || undefined,
          clientName: sdk.GATEWAY_CLIENT_NAMES?.GATEWAY_CLIENT || 'gateway-client',
          clientDisplayName: 'LalaClaw-RuntimeHub',
          clientVersion: sdk.VERSION || 'unknown',
          platform: process.platform,
          mode: sdk.GATEWAY_CLIENT_MODES?.BACKEND || 'backend',
          onHelloOk: () => {
            markReady();
          },
          onConnectError: (error: unknown) => {
            if (typeof onError === 'function') onError(error);
          },
          onClose: (_code: unknown, reason: unknown) => {
            if (typeof onClose === 'function') onClose(reason);
          },
          onEvent: (evt: OpenClawStreamEvent) => {
            markReady();
            if (typeof onEvent === 'function') onEvent(evt);
          },
        });

        client = nextClient;
        nextClient.start();
      } catch (error: unknown) {
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
    mirrorOpenClawAssistantMessage,
    mirrorOpenClawUserMessage,
    parseOpenClawResponse,
    subscribeGatewayEvents,
  };
}

export async function importOpenClawFileModule(modulePath = ''): Promise<LooseRecord> {
  const normalizedModulePath = String(modulePath || '').trim();
  if (!normalizedModulePath) {
    throw new Error('Module path is required');
  }
  const specifier = normalizedModulePath.startsWith('file:')
    ? normalizedModulePath
    : pathToFileURL(normalizedModulePath).href;
  return await (0, eval)(`import(${JSON.stringify(specifier)})`);
}

export function resolveOpenClawGatewaySdkArtifactsForPackageRoot(packageRoot = ''): GatewaySdkArtifacts | null {
  const normalizedPackageRoot = String(packageRoot || '').trim();
  if (!normalizedPackageRoot) {
    return null;
  }

  const gatewayRuntimePath = path.join(normalizedPackageRoot, 'dist', 'plugin-sdk', 'gateway-runtime.js');
  if (fs.existsSync(gatewayRuntimePath)) {
    const cliRuntimePath = path.join(normalizedPackageRoot, 'dist', 'plugin-sdk', 'cli-runtime.js');
    return {
      kind: 'stable',
      gatewayRuntimePath,
      cliRuntimePath: fs.existsSync(cliRuntimePath) ? cliRuntimePath : '',
    };
  }

  const distDir = path.join(normalizedPackageRoot, 'dist');
  if (!fs.existsSync(distDir)) {
    return null;
  }

  const legacyReplyEntry = fs.readdirSync(distDir).find((entry: string) => LEGACY_REPLY_MODULE_RE.test(entry));
  if (!legacyReplyEntry) {
    return null;
  }

  return {
    kind: 'legacy',
    replyModulePath: path.join(distDir, legacyReplyEntry),
  };
}
