const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL, pathToFileURL } = require('node:url');

let gatewaySdkPromise = null;

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
          env: process.env,
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
    const request = buildOpenClawRequest(messages, fastMode, sessionUser, options, false);
    const response = await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
    });

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

  function requiresDirectOpenClawRequest(messages = [], options = {}) {
    if (options.fastMode) {
      return true;
    }

    return messages.some((message) =>
      getMessageAttachments(message).some((attachment) => attachment.kind === 'image' && attachment.dataUrl),
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
        deliver: false,
        channel: 'webchat',
        lane: 'nested',
      },
      10000,
    );

    const resolvedRunId = typeof startResult?.runId === 'string' && startResult.runId.trim() ? startResult.runId.trim() : runId;
    const acceptedAt = Number(startResult?.acceptedAt) || Date.now();

    return {
      acceptedAt,
      runId: resolvedRunId,
      sessionKey,
    };
  }

  function findLatestAssistantSince(messages = [], acceptedAt = 0) {
    return [...messages]
      .reverse()
      .find((entry) => entry?.role === 'assistant' && Number(entry?.timestamp) >= acceptedAt && normalizeChatMessage(entry)) ||
      [...messages].reverse().find((entry) => entry?.role === 'assistant' && normalizeChatMessage(entry)) ||
      null;
  }

  async function readOpenClawSessionAssistant(runState) {
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
    return findLatestAssistantSince(historyMessages, runState.acceptedAt);
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

    if (waitResult?.status === 'timeout') {
      throw new Error(waitResult?.error || 'OpenClaw session timed out');
    }

    if (waitResult?.status === 'error') {
      throw new Error(waitResult?.error || 'OpenClaw session failed');
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
    const response = await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
    });

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

    const { promise: readyPromise, resolve: resolveReady, reject: rejectReady } = Promise.withResolvers();
    const { promise: finalPromise, resolve: resolveFinal, reject: rejectFinal } = Promise.withResolvers();
    let settled = false;
    let latestText = '';
    let activeRunState = null;

    const client = new GatewayClient({
      url: gatewayUrl,
      token: config.apiKey || undefined,
      clientName: GATEWAY_CLIENT_NAMES?.GATEWAY_CLIENT || 'gateway-client',
      clientDisplayName: 'command-center-backend',
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
        if (!payload || payload.sessionKey !== sessionKey || payload.runId !== runId) {
          return;
        }

        if (payload.state === 'delta') {
          const nextText = normalizeChatMessage(payload.message) || '';
          if (!nextText) {
            return;
          }
          if (nextText.startsWith(latestText)) {
            const delta = nextText.slice(latestText.length);
            latestText = nextText;
            if (delta) {
              onDelta(delta);
            }
            return;
          }
          latestText = nextText;
          onDelta(nextText);
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
        {
          sessionKey,
          message,
          thinking: options.thinkMode,
          timeoutMs,
          idempotencyKey: runId,
        },
        { timeoutMs: 10000 },
      );
      activeRunState = {
        acceptedAt: Number(requestResult?.acceptedAt) || Date.now(),
        runId: typeof requestResult?.runId === 'string' && requestResult.runId.trim() ? requestResult.runId.trim() : runId,
        sessionKey,
      };

      const finalPayload = await Promise.race([
        finalPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('OpenClaw session timed out')), timeoutMs + 2000)),
      ]);

      let finalAssistant = null;
      try {
        finalAssistant = await readOpenClawSessionAssistant({
          sessionKey,
          acceptedAt: Date.now() - timeoutMs,
        });
      } catch {}
      const finalText = normalizeChatMessage(finalPayload?.message) || (finalAssistant ? normalizeChatMessage(finalAssistant) : '') || latestText;

      if (finalText && finalText.startsWith(latestText) && finalText.length > latestText.length) {
        onDelta(finalText.slice(latestText.length));
        latestText = finalText;
      }

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
          timeoutMs: 900,
        },
        2500,
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

      if (waitResult?.status === 'timeout') {
        continue;
      }

      if (waitResult?.status === 'error') {
        throw new Error(waitResult?.error || 'OpenClaw session failed');
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
    if (requiresDirectOpenClawRequest(messages, { ...options, fastMode })) {
      return await callOpenClaw(messages, fastMode, sessionUser, options);
    }
    return await callOpenClawSession(messages, sessionUser);
  }

  async function dispatchOpenClawStream(messages, fastMode, sessionUser = 'command-center', options = {}) {
    if (requiresDirectOpenClawRequest(messages, { ...options, fastMode })) {
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

  return {
    callOpenClawGateway,
    dispatchOpenClaw,
    dispatchOpenClawStream,
    fetchBrowserPeek,
    invokeOpenClawTool,
    parseOpenClawResponse,
  };
}

module.exports = {
  createOpenClawClient,
};
