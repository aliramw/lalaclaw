const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { URL } = require('node:url');
const {
  HOST,
  PORT,
  PROJECT_ROOT,
  PUBLIC_DIR,
  DIST_DIR,
  LOCAL_OPENCLAW_DIR,
  OPENCLAW_BIN,
  buildRuntimeConfig,
  collectAvailableAgents,
  collectAvailableModels,
  fileExists,
  readJsonIfExists,
  readTextIfExists,
  resolveAgentModel,
  resolveCanonicalModelId,
} = require('./server/config');
const { createOpenClawClient } = require('./server/openclaw-client');
const { createSessionStore, normalizeSessionUser, normalizeThinkMode } = require('./server/session-store');
const { createTranscriptProjector } = require('./server/transcript');

const execFileAsync = promisify(execFile);

function getAgentWorkspace(agentId) {
  const agentConfig = getAgentConfig(agentId);
  return agentConfig?.workspace || config.localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');
}

function parseIdentityName(identityText = '', fallback = '') {
  const text = String(identityText || '');
  if (!text) {
    return fallback;
  }

  const inlineMatch = text.match(/^-+\s*\*\*Name:\*\*\s*(.+)$/im);
  if (inlineMatch?.[1]) {
    return inlineMatch[1].trim();
  }

  const blockMatch = text.match(/^-+\s*\*\*Name:\*\*\s*\n([\s\S]*?)(?:\n-+\s*\*\*[A-Za-z]+:\*\*|\n---|\n$)/im);
  if (!blockMatch?.[1]) {
    return fallback;
  }

  const normalized = blockMatch[1]
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
    .join(' ');

  return normalized || fallback;
}

function resolveAgentDisplayName(agentId) {
  const normalizedAgentId = String(agentId || '').trim() || getDefaultAgentId();
  const workspace = getAgentWorkspace(normalizedAgentId);
  const identityPath = path.join(workspace, 'IDENTITY.md');
  const identityText = readTextIfExists(identityPath);
  return parseIdentityName(identityText, normalizedAgentId);
}

const config = buildRuntimeConfig();

function getAgentConfig(agentId) {
  return config.localConfig?.agents?.list?.find((agent) => agent?.id === agentId) || null;
}

function getDefaultModelForAgent(agentId = config.agentId) {
  const trimmedAgentId = String(agentId || config.agentId).trim() || config.agentId;
  const agentConfig = getAgentConfig(trimmedAgentId);
  return resolveCanonicalModelId(resolveAgentModel(agentConfig) || config.localConfig?.agents?.defaults?.model?.primary || config.model);
}

function getDefaultAgentId() {
  return String(config.agentId || '').trim() || 'main';
}

const {
  appendLocalSessionConversation,
  clearSessionPreferences,
  getLocalSessionConversation,
  getSessionPreferences,
  resolveSessionAgentId,
  resolveSessionFastMode,
  resolveSessionModel,
  resolveSessionThinkMode,
  setSessionPreferences,
} = createSessionStore({
  getDefaultAgentId,
  getDefaultModelForAgent,
  resolveCanonicalModelId,
});

function mergeConversationMessages(primary = [], secondary = []) {
  return [...primary, ...secondary]
    .filter((entry) => entry?.role && entry?.content)
    .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0))
    .slice(-80);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStaticDir() {
  return DIST_DIR;
}

function isWebAppBuilt() {
  return fileExists(path.join(DIST_DIR, 'index.html'));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
    };

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 25_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function clip(text, maxLength = 140) {
  if (!text) {
    return '';
  }

  const normalized =
    typeof text === 'string'
      ? text
      : (() => {
          try {
            return JSON.stringify(text, null, 2);
          } catch {
            return String(text);
          }
        })();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function summarizeMessages(messages) {
  const recent = messages.filter((item) => item.role !== 'system').slice(-6);
  if (!recent.length) {
    return '暂无对话。';
  }

  return recent
    .map((item) => {
      const attachments = getMessageAttachments(item);
      const attachmentSummary = attachments.length ? ` [${attachments.map((attachment) => attachment.name).join(', ')}]` : '';
      return `${item.role}: ${clip(normalizeChatMessage(item).replace(/\s+/g, ' ').trim() || '附件消息', 72)}${attachmentSummary}`;
    })
    .join(' | ');
}

function normalizeChatMessage(message) {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item?.type === 'text') {
          return item.text || '';
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function getMessageAttachments(message) {
  if (!Array.isArray(message?.attachments)) {
    return [];
  }

  return message.attachments
    .map((attachment) => ({
      id: attachment?.id || '',
      kind: attachment?.kind || '',
      name: String(attachment?.name || '').trim(),
      mimeType: String(attachment?.mimeType || '').trim(),
      size: Number(attachment?.size) || 0,
      dataUrl: typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : '',
      textContent: typeof attachment?.textContent === 'string' ? attachment.textContent : '',
      truncated: Boolean(attachment?.truncated),
    }))
    .filter((attachment) => attachment.name);
}

function describeAttachmentForModel(attachment) {
  if (attachment.textContent) {
    return `附件 ${attachment.name}:\n${attachment.textContent}${attachment.truncated ? '\n[内容已截断]' : ''}`;
  }

  const attachmentDetails = [attachment.mimeType, attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : '']
    .filter(Boolean)
    .join(', ');
  return `附件 ${attachment.name}${attachmentDetails ? ` (${attachmentDetails})` : ''} 已附加。`;
}

function buildOpenClawMessageContent(message, apiStyle = 'chat') {
  const text = normalizeChatMessage(message).trim();
  const attachments = getMessageAttachments(message);
  const textPrompt = text || (attachments.length ? `用户附加了 ${attachments.length} 个附件，请结合附件内容处理请求。` : '');

  if (apiStyle === 'responses') {
    const content = [];

    if (textPrompt) {
      content.push({ type: 'input_text', text: textPrompt });
    }

    attachments.forEach((attachment) => {
      if (attachment.kind === 'image' && attachment.dataUrl) {
        content.push({ type: 'input_image', image_url: attachment.dataUrl });
        return;
      }

      content.push({ type: 'input_text', text: describeAttachmentForModel(attachment) });
    });

    return content.length ? content : [{ type: 'input_text', text: '继续。' }];
  }

  if (!attachments.length) {
    return textPrompt;
  }

  const content = [];
  if (textPrompt) {
    content.push({ type: 'text', text: textPrompt });
  }

  attachments.forEach((attachment) => {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      content.push({ type: 'image_url', image_url: { url: attachment.dataUrl } });
      return;
    }

    content.push({ type: 'text', text: describeAttachmentForModel(attachment) });
  });

  return content;
}

function parseCompactNumber(raw) {
  if (!raw) {
    return null;
  }

  const value = String(raw).trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value.endsWith('k')) {
    return Math.round(Number.parseFloat(value.slice(0, -1)) * 1000);
  }
  if (value.endsWith('m')) {
    return Math.round(Number.parseFloat(value.slice(0, -1)) * 1_000_000);
  }
  const numeric = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCompactTokenCount(value) {
  const numeric = Number(value) || 0;
  if (numeric <= 0) {
    return '';
  }
  if (numeric >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }
  if (numeric >= 1_000) {
    return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(Math.round(numeric));
}

function parseTokenDisplay(tokenDisplay = '') {
  const match = String(tokenDisplay || '').match(/([0-9.]+[km]?)\s+in\s*\/\s*([0-9.]+[km]?)\s+out/i);
  if (!match) {
    return null;
  }

  return {
    input: parseCompactNumber(match[1]) || 0,
    output: parseCompactNumber(match[2]) || 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

function formatTokenBadge(usage) {
  if (!usage) {
    return '';
  }

  const parts = [];
  if (usage.input) {
    parts.push(`↑${formatCompactTokenCount(usage.input)}`);
  }
  if (usage.output) {
    parts.push(`↓${formatCompactTokenCount(usage.output)}`);
  }
  if (usage.cacheRead) {
    parts.push(`R${formatCompactTokenCount(usage.cacheRead)}`);
  }
  if (usage.cacheWrite) {
    parts.push(`W${formatCompactTokenCount(usage.cacheWrite)}`);
  }

  return parts.join(' ');
}

function collectLatestRunUsage(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }

  let latestUserIndex = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.message?.role === 'user') {
      latestUserIndex = index;
      break;
    }
  }

  const scope = latestUserIndex >= 0 ? entries.slice(latestUserIndex + 1) : entries;
  const totals = scope.reduce(
    (acc, entry) => {
      const message = entry?.message || {};
      const usage = message.usage;
      if (message.role !== 'assistant' || !usage) {
        return acc;
      }

      acc.input += Number(usage.input || 0);
      acc.output += Number(usage.output || 0);
      acc.cacheRead += Number(usage.cacheRead || 0);
      acc.cacheWrite += Number(usage.cacheWrite || 0);
      acc.count += 1;
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, count: 0 },
  );

  if (!totals.count) {
    return null;
  }

  return totals;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function tailLines(text, maxLines = 6) {
  if (!text) {
    return [];
  }

  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-maxLines);
}

function parseSlashCommandState(message = '') {
  const normalized = String(message || '').trim().toLowerCase();
  if (/^\/fast\s+(on|yes|true|1)\s*$/i.test(normalized)) {
    return { kind: 'fastMode', value: true };
  }
  if (/^\/fast\s+(off|no|false|0)\s*$/i.test(normalized)) {
    return { kind: 'fastMode', value: false };
  }
  const thinkMatch = normalized.match(/^\/think(?:\s+([^\s]+))?\s*$/i);
  const thinkMode = normalizeThinkMode(thinkMatch?.[1] || '');
  if (thinkMode) {
    return { kind: 'thinkMode', value: thinkMode };
  }
  return null;
}

function parseFastCommand(message = '') {
  const normalized = String(message || '').trim().toLowerCase();
  const match = normalized.match(/^\/fast(?:\s+([^\s]+))?\s*$/);
  if (!match) {
    return null;
  }

  const mode = match[1] || 'status';
  if (['status'].includes(mode)) {
    return { kind: 'fast', action: 'status' };
  }
  if (['on', 'yes', 'true', '1'].includes(mode)) {
    return { kind: 'fast', action: 'on' };
  }
  if (['off', 'no', 'false', '0'].includes(mode)) {
    return { kind: 'fast', action: 'off' };
  }

  return { kind: 'fast', action: 'invalid' };
}

function parseSessionResetCommand(message = '') {
  const match = String(message || '').trim().match(/^\/(new|reset)(?:\s+([\s\S]+))?$/i);
  if (!match) {
    return null;
  }

  return {
    kind: match[1].toLowerCase() === 'reset' ? 'reset' : 'new',
    tail: (match[2] || '').trim(),
  };
}

function getCommandCenterSessionKey(agentId = getDefaultAgentId(), sessionUser = 'command-center') {
  return `agent:${agentId}:openai-user:${normalizeSessionUser(sessionUser)}`;
}

const {
  buildAgentGraph,
  cleanAssistantReply,
  cleanUserMessage,
  collectArtifacts,
  collectConversationMessages,
  collectFiles,
  collectSnapshots,
  collectTaskTimeline,
  collectToolHistory,
  extractTextSegments,
  getTranscriptPath,
  listDirectoryPreview,
  parseSessionStatusText,
  readJsonLines,
  resolveSessionRecord,
} = createTranscriptProjector({
  PROJECT_ROOT,
  LOCAL_OPENCLAW_DIR,
  config,
  fileExists,
  readJsonIfExists,
  readTextIfExists,
  normalizeThinkMode,
  parseCompactNumber,
  parseTokenDisplay,
  formatTokenBadge,
  clip,
  formatTimestamp,
});

const {
  callOpenClawGateway,
  dispatchOpenClaw,
  fetchBrowserPeek,
  invokeOpenClawTool,
  parseOpenClawResponse,
} = createOpenClawClient({
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
});

function buildWorkspacePeek() {
  const projectEntries = listDirectoryPreview(PROJECT_ROOT);
  const agentEntries = listDirectoryPreview(config.workspaceRoot);

  return {
    summary: '当前项目目录与 OpenClaw 主工作区的只读预览。',
    items: [
      { label: '当前项目', value: PROJECT_ROOT },
      { label: 'Agent 工作区', value: config.workspaceRoot },
      { label: '项目内容', value: projectEntries.map((item) => `${item.kind === 'dir' ? '目录' : '文件'} ${item.name}`).join(' · ') || '暂无内容' },
      { label: '工作区内容', value: agentEntries.map((item) => `${item.kind === 'dir' ? '目录' : '文件'} ${item.name}`).join(' · ') || '暂无内容' },
    ],
  };
}

function buildTerminalPeek() {
  const gatewayLogLines = tailLines(readTextIfExists(path.join(config.logsDir, 'gateway.log')), 5);

  return {
    summary: '本地服务端口与最近日志。',
    items: [
      { label: 'CommandCenter', value: `http://${HOST}:${PORT}` },
      { label: 'OpenClaw Gateway', value: config.mode === 'openclaw' ? config.baseUrl : '未连接' },
      { label: '最近日志', value: gatewayLogLines.length ? gatewayLogLines.join(' | ') : '暂无日志' },
    ],
  };
}

function buildMockSnapshot(sessionUser = 'command-center') {
  const now = Date.now();
  const agentId = resolveSessionAgentId(sessionUser);
  const agentLabel = resolveAgentDisplayName(agentId);
  const model = resolveSessionModel(sessionUser, agentId);
  const fastMode = resolveSessionFastMode(sessionUser);
  const thinkMode = resolveSessionThinkMode(sessionUser);
  const localConversation = getLocalSessionConversation(sessionUser);
  return {
    session: {
      mode: 'mock',
      model,
      selectedModel: model,
      agentId,
      agentLabel,
      selectedAgentId: agentId,
      sessionUser: normalizeSessionUser(sessionUser),
      sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
      status: '已完成',
      fastMode: fastMode ? '开启' : '关闭',
      thinkMode,
      contextUsed: 0,
      contextMax: 16000,
      contextDisplay: '0 / 16000',
      runtime: 'mock',
      queue: 'none',
      updatedLabel: '',
      updatedAt: now,
      availableModels: collectAvailableModels(config.localConfig, [model]),
      availableAgents: collectAvailableAgents(config.localConfig, [agentId]),
    },
    taskTimeline: [
      {
        id: `run-${now}`,
        title: `执行 ${formatTimestamp(now)}`,
        timestamp: now,
        prompt: '搭建最小 Command Center 原型',
        status: '已完成',
        toolsSummary: fastMode ? 'workspace.scan(完成) · planner.fast-path(完成)' : 'workspace.scan(完成) · planner.standard-path(完成)',
        tools: [
          { name: 'workspace.scan', status: '完成', input: '{}', output: '已扫描当前项目目录。', detail: '已扫描当前项目目录。' },
          {
            name: fastMode ? 'planner.fast-path' : 'planner.standard-path',
            status: '完成',
            input: '{"target":"command-center"}',
            output: '已生成最小可运行原型。',
            detail: '已生成最小可运行原型。',
          },
        ],
        files: [
          { path: 'server.js', kind: '文件', updatedLabel: formatTimestamp(now) },
          { path: 'public/index.html', kind: '文件', updatedLabel: formatTimestamp(now) },
        ],
        snapshots: [{ id: `snapshot-${now}`, title: `快照 ${formatTimestamp(now)}`, detail: 'mock 会话快照', timestamp: now }],
        outcome: 'mock 模式下的演示执行。',
      },
    ],
    toolHistory: [
      { name: 'workspace.scan', status: '完成', detail: '已扫描当前项目目录。', timestamp: now },
      { name: fastMode ? 'planner.fast-path' : 'planner.standard-path', status: '完成', detail: '已生成最小可运行原型。', timestamp: now },
    ],
    conversation: localConversation,
    files: [
      { path: 'server.js', kind: '文件' },
      { path: 'public/index.html', kind: '文件' },
    ],
    artifacts: [
      { title: '当前回复', type: 'assistant_output', detail: 'mock 模式下的演示输出。', timestamp: now },
    ],
    snapshots: [
      { id: `snapshot-${now}`, title: `快照 ${formatTimestamp(now)}`, detail: 'mock 会话快照', timestamp: now },
    ],
    agents: [
      { id: agentId, label: agentId, state: 'active', detail: `主 Agent · ${clip(model, 42)}`, updatedAt: now, sessionCount: 1 },
    ],
    peeks: {
      workspace: buildWorkspacePeek(),
      terminal: buildTerminalPeek(),
      browser: { summary: 'mock 模式未接入浏览器控制。', items: [{ label: '状态', value: '未连接 OpenClaw' }] },
    },
  };
}

async function buildOpenClawSnapshot(sessionUser = 'command-center') {
  const agentId = resolveSessionAgentId(sessionUser);
  const agentLabel = resolveAgentDisplayName(agentId);
  const selectedModel = resolveSessionModel(sessionUser, agentId);
  const fastMode = resolveSessionFastMode(sessionUser);
  const preferredThinkMode = resolveSessionThinkMode(sessionUser);
  const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
  const sessionRecord = resolveSessionRecord(agentId, sessionKey);
  const transcriptPath = sessionRecord ? getTranscriptPath(agentId, sessionRecord.sessionId) : '';
  const entries = transcriptPath ? readJsonLines(transcriptPath).slice(-240) : [];
  const [statusResult, browserPeek] = await Promise.all([
    invokeOpenClawTool('session_status', {}, sessionKey).catch(() => null),
    fetchBrowserPeek().catch(() => ({
      summary: '浏览器状态暂时不可用。',
      items: [{ label: '状态', value: '读取失败' }],
    })),
  ]);

  const statusText = statusResult?.details?.statusText || extractTextSegments(statusResult?.content).join('\n');
  const parsedStatus = parseSessionStatusText(statusText);
  const latestAssistant = [...entries]
    .reverse()
    .find((entry) => entry.type === 'message' && entry.message?.role === 'assistant');
  const latestModel =
    parsedStatus?.modelDisplay ||
    latestAssistant?.message?.model ||
    getDefaultModelForAgent(agentId) ||
    config.model;
  const availableModels = collectAvailableModels(config.localConfig, [selectedModel, latestModel]);
  const availableAgents = collectAvailableAgents(config.localConfig, [agentId]);
  const gatewayConversation = collectConversationMessages(entries);
  const localConversation = getLocalSessionConversation(sessionUser);
  const latestRunUsage = collectLatestRunUsage(entries);
  const tokenBadge = formatTokenBadge(
    latestRunUsage || {
      input: parsedStatus?.tokensInput || 0,
      output: parsedStatus?.tokensOutput || 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  );

  return {
    session: {
      mode: 'openclaw',
      model: latestModel,
      selectedModel,
      agentId,
      agentLabel,
      selectedAgentId: agentId,
      sessionUser: normalizeSessionUser(sessionUser),
      sessionKey: parsedStatus?.sessionKey || sessionKey,
      status: '就绪',
      fastMode: fastMode ? '开启' : '关闭',
      thinkMode: parsedStatus?.thinkMode || preferredThinkMode,
      contextUsed: parsedStatus?.contextUsed || null,
      contextMax: parsedStatus?.contextMax || 272000,
      contextDisplay:
        parsedStatus?.contextUsed && parsedStatus?.contextMax
          ? `${parsedStatus.contextUsed} / ${parsedStatus.contextMax}`
          : parsedStatus?.contextDisplay || '未知',
      runtime: parsedStatus?.runtimeDisplay || '未知',
      queue: parsedStatus?.queueDisplay || '未知',
      updatedLabel:
        parsedStatus?.updatedLabel || '',
      updatedAt: sessionRecord?.updatedAt || null,
      tokens: tokenBadge || parsedStatus?.tokensDisplay || '',
      auth: parsedStatus?.authDisplay || '',
      version: parsedStatus?.versionDisplay || '',
      time: parsedStatus?.time || '',
      availableModels,
      availableAgents,
    },
    conversation: mergeConversationMessages(gatewayConversation, localConversation),
    taskTimeline: collectTaskTimeline(entries, [PROJECT_ROOT, config.workspaceRoot]),
    toolHistory: collectToolHistory(entries),
    files: collectFiles(entries, [PROJECT_ROOT, config.workspaceRoot]),
    artifacts: collectArtifacts(entries),
    snapshots: collectSnapshots(entries, sessionRecord),
    agents: buildAgentGraph(),
    peeks: {
      workspace: buildWorkspacePeek(),
      terminal: buildTerminalPeek(),
      browser: browserPeek,
    },
  };
}

async function buildDashboardSnapshot(sessionUser = 'command-center') {
  if (config.mode !== 'openclaw') {
    return buildMockSnapshot(sessionUser);
  }
  return await buildOpenClawSnapshot(sessionUser);
}

async function handleChat(req, res) {
  try {
    const body = await parseRequestBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const fastMode = Boolean(body.fastMode);
    const sessionUser = normalizeSessionUser(body.sessionUser || 'command-center');
    const latestUserMessage = [...messages].reverse().find((message) => message?.role === 'user');
    const latestUserContent = normalizeChatMessage(latestUserMessage);
    const latestUserAttachments = getMessageAttachments(latestUserMessage);
    const resetCommand = parseSessionResetCommand(latestUserContent);
    const fastCommand = parseFastCommand(latestUserContent);
    const commandBody = latestUserContent.startsWith('/') ? latestUserContent : '';
    const slashCommandState = parseSlashCommandState(latestUserMessage?.content);
    const outboundMessages = latestUserMessage
      ? [{ role: 'user', content: latestUserContent, ...(latestUserAttachments.length ? { attachments: latestUserAttachments } : {}) }]
      : [];

    if (body.agentId || body.model) {
      const nextAgentId = String(body.agentId || resolveSessionAgentId(sessionUser)).trim() || getDefaultAgentId();
      const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);
      const requestedModel = typeof body.model === 'string' ? resolveCanonicalModelId(body.model) : '';
      const nextModel = requestedModel || resolveSessionModel(sessionUser, nextAgentId) || defaultModelForNextAgent;
      setSessionPreferences(sessionUser, {
        agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
        model: requestedModel && requestedModel !== defaultModelForNextAgent ? nextModel : undefined,
      });

      if (config.mode === 'openclaw') {
        const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);
        await callOpenClawGateway('sessions.patch', {
          key: sessionKey,
          model: nextModel,
        });
        await delay(150);
      }
    }

    if (fastCommand) {
      const responseTimestamp = Date.now();
      if (fastCommand.action === 'on' || fastCommand.action === 'off') {
        setSessionPreferences(sessionUser, { fastMode: fastCommand.action === 'on' });
      }

      const fastEnabled = resolveSessionFastMode(sessionUser);
      const outputText =
        fastCommand.action === 'status'
          ? `Fast 当前${fastEnabled ? '已开启' : '已关闭'}。`
          : fastCommand.action === 'on'
            ? '已开启 fast。'
            : fastCommand.action === 'off'
              ? '已关闭 fast。'
              : '用法：/fast status|on|off';

      appendLocalSessionConversation(sessionUser, [
        {
          role: 'user',
          content: latestUserContent,
          timestamp: responseTimestamp - 1,
        },
        {
          role: 'assistant',
          content: outputText,
          timestamp: responseTimestamp,
        },
      ]);

      const snapshot = await buildDashboardSnapshot(sessionUser);
      snapshot.session.status = '已完成 / 标准';

      sendJson(res, 200, {
        ok: true,
        mode: config.mode,
        model: snapshot.session?.model || config.model,
        outputText,
        usage: null,
        tokenBadge: '',
        commandHandled: 'fast',
        metadata: {
          status: snapshot.session.status,
          summary: `fast: ${fastCommand.action}`,
        },
        ...snapshot,
      });
      return;
    }

    if (resetCommand) {
      const nextSessionUser = normalizeSessionUser(`${sessionUser}-${Date.now()}`);
      const currentPreferences = getSessionPreferences(sessionUser);
      setSessionPreferences(nextSessionUser, { ...currentPreferences });

      let outputText = '新会话已开始。直接说你要我干什么。';
      let usage = null;

      if (resetCommand.tail) {
        const resetReply =
          config.mode === 'openclaw'
            ? await dispatchOpenClaw([{ role: 'user', content: resetCommand.tail }], fastMode, nextSessionUser)
            : {
                outputText: [
                  'OpenClaw command channel is online in mock mode.',
                  `Current intent: ${clip(resetCommand.tail, 160)}`,
                ].join('\n'),
                usage: null,
              };

        outputText = resetReply.outputText;
        usage = resetReply.usage;
      }

      appendLocalSessionConversation(
        nextSessionUser,
        resetCommand.tail
          ? [
              {
                role: 'user',
                content: resetCommand.tail,
                timestamp: Date.now() - 1,
              },
              {
                role: 'assistant',
                content: outputText,
                timestamp: Date.now(),
                ...(usage ? { tokenBadge: formatTokenBadge(usage) } : {}),
              },
            ]
          : [
              {
                role: 'assistant',
                content: outputText,
                timestamp: Date.now(),
              },
            ],
      );

      const snapshot = await buildDashboardSnapshot(nextSessionUser);
      snapshot.session.status = fastMode ? '已完成 / 快速' : '已完成 / 标准';

      sendJson(res, 200, {
        ok: true,
        mode: config.mode,
        model: snapshot.session?.model || config.model,
        outputText,
        usage,
        tokenBadge: formatTokenBadge(usage),
        resetSessionUser: nextSessionUser,
        commandHandled: resetCommand.kind,
        metadata: {
          status: snapshot.session.status,
          summary: resetCommand.tail ? `user: ${clip(resetCommand.tail, 72)}` : `${resetCommand.kind}: session reset`,
        },
        ...snapshot,
      });
      return;
    }

    const reply =
      config.mode === 'openclaw'
        ? await dispatchOpenClaw(outboundMessages, fastMode, sessionUser, { commandBody })
        : {
            outputText: [
              'OpenClaw command channel is online in mock mode.',
              `Current intent: ${clip(latestUserContent || 'No prompt supplied.', 160)}`,
            ].join('\n'),
            usage: null,
          };

    const nextFastMode = slashCommandState?.kind === 'fastMode' ? slashCommandState.value : fastMode;
    const nextThinkMode = slashCommandState?.kind === 'thinkMode' ? slashCommandState.value : resolveSessionThinkMode(sessionUser);
    setSessionPreferences(sessionUser, { fastMode: nextFastMode, thinkMode: nextThinkMode });

    const snapshot = await buildDashboardSnapshot(sessionUser);
    snapshot.session.status = nextFastMode ? '已完成 / 快速' : '已完成 / 标准';
    const resolvedModel = snapshot.session?.model || config.model;

    sendJson(res, 200, {
      ok: true,
      mode: config.mode,
      model: resolvedModel,
      outputText: reply.outputText,
      usage: reply.usage,
      tokenBadge: formatTokenBadge(reply.usage),
      metadata: {
        status: snapshot.session.status,
        summary: summarizeMessages(messages),
      },
      ...snapshot,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Unknown server error',
    });
  }
}

async function handleRuntime(req, res) {
  try {
    const sessionUser = normalizeSessionUser(new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionUser') || 'command-center');
    const snapshot = await buildDashboardSnapshot(sessionUser);
    const resolvedModel = snapshot.session?.model || config.model;
    sendJson(res, 200, {
      ok: true,
      mode: config.mode,
      model: resolvedModel,
      ...snapshot,
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Runtime snapshot failed' });
  }
}

function handleSession(req, res) {
  const sessionUser = normalizeSessionUser(new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionUser') || 'command-center');
  const agentId = resolveSessionAgentId(sessionUser);
  const agentLabel = resolveAgentDisplayName(agentId);
  const model = resolveSessionModel(sessionUser, agentId);
  const thinkMode = resolveSessionThinkMode(sessionUser);
  sendJson(res, 200, {
    mode: config.mode,
    model,
    agentId,
    agentLabel,
    thinkMode,
    sessionUser,
    sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
    availableModels: collectAvailableModels(config.localConfig, [model]),
    availableAgents: collectAvailableAgents(config.localConfig, [agentId]),
    apiStyle: config.apiStyle,
    hasBaseUrl: Boolean(config.baseUrl),
    hasApiKey: Boolean(config.apiKey),
    localDetected: config.localDetected,
  });
}

async function handleSessionUpdate(req, res) {
  try {
    const body = await parseRequestBody(req);
    const sessionUser = normalizeSessionUser(body.sessionUser || 'command-center');
    const nextFastMode = typeof body.fastMode === 'boolean' ? body.fastMode : resolveSessionFastMode(sessionUser);
    const requestedThinkMode = typeof body.thinkMode === 'string' ? normalizeThinkMode(body.thinkMode) : '';
    if (typeof body.thinkMode === 'string' && !requestedThinkMode) {
      sendJson(res, 400, { ok: false, error: 'Invalid think mode' });
      return;
    }
    const nextThinkMode = requestedThinkMode || resolveSessionThinkMode(sessionUser);
    const previousAgentId = resolveSessionAgentId(sessionUser);
    const nextAgentId = body.agentId ? String(body.agentId).trim() || previousAgentId : previousAgentId;
    const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);

    let nextModel = resolveSessionModel(sessionUser, previousAgentId);
    let shouldPersistModel = Boolean(getSessionPreferences(sessionUser).model);

    if (body.agentId && !body.model) {
      nextModel = defaultModelForNextAgent;
      shouldPersistModel = false;
    }

    if (body.model) {
      const requestedModel = resolveCanonicalModelId(body.model);
      nextModel = requestedModel || defaultModelForNextAgent;
      shouldPersistModel = Boolean(requestedModel) && requestedModel !== defaultModelForNextAgent;
    }

    setSessionPreferences(sessionUser, {
      agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
      model: shouldPersistModel ? nextModel : undefined,
      fastMode: nextFastMode,
      thinkMode: nextThinkMode,
    });

    if (config.mode === 'openclaw' && (body.model || body.agentId)) {
      const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);
      await callOpenClawGateway('sessions.patch', {
        key: sessionKey,
        model: nextModel,
      });
      await delay(150);
    }

    if (config.mode === 'openclaw' && requestedThinkMode) {
      const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);
      await callOpenClawGateway('sessions.patch', {
        key: sessionKey,
        thinkingLevel: requestedThinkMode,
      });
      await delay(150);
    }

    const snapshot = await buildDashboardSnapshot(sessionUser);
    sendJson(res, 200, {
      ok: true,
      mode: config.mode,
      model: snapshot.session?.selectedModel || resolveSessionModel(sessionUser, nextAgentId),
      agentId: snapshot.session?.agentId || nextAgentId,
      sessionUser,
      ...snapshot,
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Session update failed' });
  }
}

function createRequestHandler() {
  return (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/session') {
      handleSession(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/session') {
      handleSessionUpdate(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/runtime') {
      handleRuntime(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      handleChat(req, res);
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (!isWebAppBuilt()) {
      sendJson(res, 503, {
        error: 'Web app build is missing',
        detail: 'Run `npm run build` to generate the dist bundle before starting the server.',
      });
      return;
    }

    const staticDir = getStaticDir();
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const filePath = path.join(staticDir, safePath);

    if (!filePath.startsWith(staticDir)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    sendFile(res, filePath);
  };
}

function createAppServer() {
  return http.createServer(createRequestHandler());
}

function startServer() {
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`CommandCenter running at http://${HOST}:${PORT}`);
    console.log(`Mode: ${config.mode}`);
  });
  return server;
}

module.exports = {
  config,
  createAppServer,
  startServer,
  __test: {
    clearSessionPreferences,
    cleanUserMessage,
    clip,
    collectTaskTimeline,
    getCommandCenterSessionKey,
    getStaticDir,
    isWebAppBuilt,
    normalizeChatMessage,
    normalizeSessionUser,
    parseCompactNumber,
    parseOpenClawResponse,
    parseSessionStatusText,
    summarizeMessages,
  },
};

if (require.main === module) {
  startServer();
}
