const crypto = require('node:crypto');
const path = require('node:path');
const { URL } = require('node:url');

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
}) {
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

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

    const { stdout } = await execFileAsync(OPENCLAW_BIN, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });

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
        stream: false,
        user: normalizeSessionUser(sessionUser),
      };
      if (commandBody) {
        payload.commandBody = commandBody;
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenClaw request failed: ${response.status} ${clip(errorText, 200)}`);
    }

    const data = await response.json();
    return parseOpenClawResponse(data);
  }

  function buildOpenClawSessionMessage(message) {
    const text = normalizeChatMessage(message).trim();
    const attachments = getMessageAttachments(message);
    const attachmentPrompts = attachments.map((attachment) => describeAttachmentForModel(attachment)).filter(Boolean);
    const textPrompt = text || (attachmentPrompts.length ? `用户附加了 ${attachmentPrompts.length} 个附件，请结合附件内容处理请求。` : '');
    return [textPrompt, ...attachmentPrompts].filter(Boolean).join('\n\n').trim();
  }

  function requiresDirectOpenClawRequest(messages = []) {
    return messages.some((message) =>
      getMessageAttachments(message).some((attachment) => attachment.kind === 'image' && attachment.dataUrl),
    );
  }

  async function callOpenClawSession(messages, sessionUser = 'command-center', timeoutMs = 30000) {
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
    const startResult = await callOpenClawGateway(
      'agent',
      {
        message,
        sessionKey,
        idempotencyKey: runId,
        deliver: false,
        channel: 'webchat',
        lane: 'nested',
      },
      10000,
    );

    const resolvedRunId = typeof startResult?.runId === 'string' && startResult.runId.trim() ? startResult.runId.trim() : runId;
    const acceptedAt = Number(startResult?.acceptedAt) || Date.now();
    const waitResult = await callOpenClawGateway(
      'agent.wait',
      {
        runId: resolvedRunId,
        timeoutMs,
      },
      timeoutMs + 2000,
    );

    if (waitResult?.status === 'timeout') {
      throw new Error(waitResult?.error || 'OpenClaw session timed out');
    }

    if (waitResult?.status === 'error') {
      throw new Error(waitResult?.error || 'OpenClaw session failed');
    }

    const history = await callOpenClawGateway(
      'chat.history',
      {
        sessionKey,
        limit: 50,
      },
      10000,
    );

    const historyMessages = Array.isArray(history?.messages) ? history.messages : [];
    const latestAssistant =
      [...historyMessages]
        .reverse()
        .find((entry) => entry?.role === 'assistant' && Number(entry?.timestamp) >= acceptedAt && normalizeChatMessage(entry)) ||
      [...historyMessages].reverse().find((entry) => entry?.role === 'assistant' && normalizeChatMessage(entry));

    return {
      outputText: latestAssistant ? normalizeChatMessage(latestAssistant) || 'OpenClaw returned an empty response.' : 'OpenClaw returned an empty response.',
      usage: latestAssistant?.usage || null,
    };
  }

  async function dispatchOpenClaw(messages, fastMode, sessionUser = 'command-center', options = {}) {
    if (requiresDirectOpenClawRequest(messages)) {
      return await callOpenClaw(messages, fastMode, sessionUser, options);
    }
    return await callOpenClawSession(messages, sessionUser);
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

  return {
    callOpenClawGateway,
    dispatchOpenClaw,
    fetchBrowserPeek,
    invokeOpenClawTool,
    parseOpenClawResponse,
  };
}

module.exports = {
  createOpenClawClient,
};
