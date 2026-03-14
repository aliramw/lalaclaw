const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { URL } = require('node:url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');
const HOME_DIR = process.env.HOME || '';
const PROJECT_ROOT = __dirname;
const LOCAL_OPENCLAW_CONFIG = path.join(HOME_DIR, '.openclaw', 'openclaw.json');
const LOCAL_OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const execFileAsync = promisify(execFile);

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return '';
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveDefaultAgentId(localConfig) {
  const defaultAgent = localConfig?.agents?.list?.find((agent) => agent?.default);
  return process.env.OPENCLAW_AGENT_ID || defaultAgent?.id || 'main';
}

function resolveAgentModel(agent, localConfig = config.localConfig) {
  const primary = agent?.model?.primary || (typeof agent?.model === 'string' ? agent.model : '');
  return resolveCanonicalModelId(primary, localConfig);
}

function getConfiguredModelEntries(localConfig = config.localConfig) {
  return Object.entries(localConfig?.agents?.defaults?.models || {}).filter(([modelId]) => String(modelId || '').trim());
}

function resolveCanonicalModelId(value = '', localConfig = config.localConfig) {
  const requestedModel = String(value || '').trim();
  if (!requestedModel) {
    return '';
  }

  const configuredModels = getConfiguredModelEntries(localConfig);
  if (!configuredModels.length) {
    return requestedModel;
  }

  const normalizedRequestedModel = requestedModel.toLowerCase();
  const exactMatch = configuredModels.find(([modelId]) => modelId.toLowerCase() === normalizedRequestedModel);
  if (exactMatch) {
    return exactMatch[0];
  }

  const aliasMatch = configuredModels.find(([, meta]) => String(meta?.alias || '').trim().toLowerCase() === normalizedRequestedModel);
  if (aliasMatch) {
    return aliasMatch[0];
  }

  const suffixMatches = configuredModels.filter(([modelId]) => modelId.toLowerCase().endsWith(`/${normalizedRequestedModel}`));
  if (suffixMatches.length === 1) {
    return suffixMatches[0][0];
  }

  return requestedModel;
}

function collectAvailableModels(localConfig, preferred = []) {
  const seen = new Set();
  const ordered = [];

  function addModel(value) {
    const model = resolveCanonicalModelId(value, localConfig);
    if (!model || seen.has(model)) {
      return;
    }
    seen.add(model);
    ordered.push(model);
  }

  preferred.forEach(addModel);
  addModel(localConfig?.agents?.defaults?.model?.primary);
  (localConfig?.agents?.list || []).forEach((agent) => addModel(resolveAgentModel(agent, localConfig)));
  return ordered;
}

function collectAvailableAgents(localConfig, preferred = []) {
  const seen = new Set();
  const ordered = [];

  function addAgent(value) {
    const agentId = String(value || '').trim();
    if (!agentId || seen.has(agentId)) {
      return;
    }
    seen.add(agentId);
    ordered.push(agentId);
  }

  preferred.forEach(addAgent);
  (localConfig?.agents?.list || []).forEach((agent) => addAgent(agent?.id));
  return ordered;
}

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

function buildRuntimeConfig() {
  const localConfig = readJsonIfExists(LOCAL_OPENCLAW_CONFIG);
  const localGatewayPort = Number(localConfig?.gateway?.port || 18789);
  const localToken = localConfig?.gateway?.auth?.token || '';
  const localAgentId = resolveDefaultAgentId(localConfig);
  const envBaseUrl = process.env.OPENCLAW_BASE_URL || '';
  const envModel = resolveCanonicalModelId(process.env.OPENCLAW_MODEL || '', localConfig);
  const envAgentId = process.env.OPENCLAW_AGENT_ID || '';
  const baseUrl = envBaseUrl || (localToken ? `http://127.0.0.1:${localGatewayPort}` : '');
  const agentId = envAgentId || localAgentId;
  const defaultModel = resolveCanonicalModelId(
    localConfig?.agents?.defaults?.model?.primary || resolveAgentModel(localConfig?.agents?.list?.find((agent) => agent?.id === agentId), localConfig),
    localConfig,
  );
  const workspaceRoot = localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');
  const availableModels = collectAvailableModels(localConfig, [envModel]);
  const availableAgents = collectAvailableAgents(localConfig, [agentId]);

  return {
    mode: baseUrl ? 'openclaw' : 'mock',
    model: envModel || defaultModel || 'openclaw',
    agentId,
    baseUrl,
    apiKey: process.env.OPENCLAW_API_KEY || localToken,
    apiStyle: process.env.OPENCLAW_API_STYLE || 'chat',
    apiPath: process.env.OPENCLAW_API_PATH || '/v1/chat/completions',
    localDetected: Boolean(localToken),
    localConfig,
    gatewayPort: localGatewayPort,
    browserControlPort: localGatewayPort + 2,
    healthPort: localGatewayPort + 3,
    workspaceRoot,
    logsDir: path.join(LOCAL_OPENCLAW_DIR, 'logs'),
    availableModels,
    availableAgents,
  };
}

const config = buildRuntimeConfig();
const sessionPreferences = new Map();
const localSessionConversation = new Map();
const THINK_MODES = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive'];

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

function getSessionPreferences(sessionUser = 'command-center') {
  const key = normalizeSessionUser(sessionUser);
  return sessionPreferences.get(key) || {};
}

function setSessionPreferences(sessionUser = 'command-center', next = {}) {
  const key = normalizeSessionUser(sessionUser);
  const current = sessionPreferences.get(key) || {};
  const merged = { ...current, ...next };

  if (!merged.model) {
    delete merged.model;
  }
  if (!merged.agentId) {
    delete merged.agentId;
  }
  if (typeof merged.fastMode !== 'boolean') {
    delete merged.fastMode;
  }
  if (!THINK_MODES.includes(String(merged.thinkMode || '').trim().toLowerCase())) {
    delete merged.thinkMode;
  } else {
    merged.thinkMode = String(merged.thinkMode).trim().toLowerCase();
  }

  if (!Object.keys(merged).length) {
    sessionPreferences.delete(key);
    return {};
  }

  sessionPreferences.set(key, merged);
  return merged;
}

function resolveSessionAgentId(sessionUser = 'command-center') {
  const preferences = getSessionPreferences(sessionUser);
  return String(preferences.agentId || getDefaultAgentId()).trim() || getDefaultAgentId();
}

function resolveSessionModel(sessionUser = 'command-center', agentId = resolveSessionAgentId(sessionUser)) {
  const preferences = getSessionPreferences(sessionUser);
  return resolveCanonicalModelId(preferences.model || getDefaultModelForAgent(agentId)) || getDefaultModelForAgent(agentId);
}

function resolveSessionFastMode(sessionUser = 'command-center') {
  const preferences = getSessionPreferences(sessionUser);
  return Boolean(preferences.fastMode);
}

function normalizeThinkMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return THINK_MODES.includes(normalized) ? normalized : '';
}

function resolveSessionThinkMode(sessionUser = 'command-center') {
  const preferences = getSessionPreferences(sessionUser);
  return normalizeThinkMode(preferences.thinkMode) || 'off';
}

function clearSessionPreferences(sessionUser = 'command-center') {
  sessionPreferences.delete(normalizeSessionUser(sessionUser));
}

function getLocalSessionConversation(sessionUser = 'command-center') {
  return localSessionConversation.get(normalizeSessionUser(sessionUser)) || [];
}

function appendLocalSessionConversation(sessionUser = 'command-center', entries = []) {
  const key = normalizeSessionUser(sessionUser);
  const current = localSessionConversation.get(key) || [];
  const normalizedEntries = entries
    .filter(Boolean)
    .map((entry) => ({
      role: entry.role,
      content: String(entry.content || '').trim(),
      timestamp: Number(entry.timestamp) || Date.now(),
      ...(entry.tokenBadge ? { tokenBadge: String(entry.tokenBadge) } : {}),
    }))
    .filter((entry) => entry.role && entry.content);

  if (!normalizedEntries.length) {
    return current;
  }

  const merged = [...current, ...normalizedEntries]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-80);
  localSessionConversation.set(key, merged);
  return merged;
}

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
  return fileExists(DIST_DIR) ? DIST_DIR : PUBLIC_DIR;
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

function normalizeSessionUser(sessionUser = '') {
  const normalized = String(sessionUser || 'command-center')
    .trim()
    .replace(/[^\w:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-:]+|[-:]+$/g, '');

  return normalized || 'command-center';
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

function getSessionsIndexPath(agentId) {
  return path.join(LOCAL_OPENCLAW_DIR, 'agents', agentId, 'sessions', 'sessions.json');
}

function getTranscriptPath(agentId, sessionId) {
  return path.join(LOCAL_OPENCLAW_DIR, 'agents', agentId, 'sessions', `${sessionId}.jsonl`);
}

function loadSessionsIndex(agentId) {
  return readJsonIfExists(getSessionsIndexPath(agentId)) || {};
}

function resolveSessionRecord(agentId, sessionKey) {
  const sessionsIndex = loadSessionsIndex(agentId);
  return sessionsIndex[sessionKey] || null;
}

function readJsonLines(filePath) {
  const raw = readTextIfExists(filePath);
  if (!raw) {
    return [];
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function extractTextSegments(content) {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .map((item) => {
      if (item?.type === 'text') {
        return item.text || '';
      }
      if (item?.type === 'toolCall') {
        return item.arguments || item.partialJson || '';
      }
      return '';
    })
    .filter(Boolean);
}

function extractPlainTextSegments(content) {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((item) => item?.type === 'text')
    .map((item) => item.text || '')
    .filter(Boolean);
}

function cleanAssistantReply(text) {
  return String(text || '')
    .replace(/\*\*<small>.*?<\/small>\*\*/g, '')
    .replace(/\[\[reply_to_current\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseSessionStatusText(statusText) {
  if (!statusText) {
    return null;
  }

  const versionLine = statusText.match(/^🦞\s*OpenClaw\s+(.+)$/m);
  const modelLine = statusText.match(/🧠 Model:\s*(.+?)(?:\s*·\s*🔑\s*(.+))?$/m);
  const tokensLine = statusText.match(/🧮 Tokens:\s*(.+)$/m);
  const contextLine = statusText.match(/📚 Context:\s*([^\n]+)$/m);
  const sessionLine = statusText.match(/🧵 Session:\s*([^•\n]+)(?:•\s*(.+))?$/m);
  const runtimeLine = statusText.match(/⚙️ Runtime:\s*(.+)$/m);
  const queueLine = statusText.match(/🪢 Queue:\s*(.+)$/m);
  const timeLine = statusText.match(/🕒 Time:\s*(.+)$/m);

  let contextUsed = null;
  let contextMax = null;
  let contextRaw = '';
  if (contextLine?.[1]) {
    contextRaw = contextLine[1];
    const contextMatch = contextLine[1].match(/([0-9.]+[km]?)\/([0-9.]+[km]?)/i);
    if (contextMatch) {
      contextUsed = parseCompactNumber(contextMatch[1]);
      contextMax = parseCompactNumber(contextMatch[2]);
    }
  }

  const parsedTokens = parseTokenDisplay(tokensLine?.[1] || '');
  const runtimeDisplay = runtimeLine?.[1] || '';
  const parsedThinkMode = normalizeThinkMode(runtimeDisplay.match(/(?:^|·)\s*Think:\s*([a-z]+)\s*(?:·|$)/i)?.[1] || '');

  return {
    text: statusText,
    versionDisplay: versionLine?.[1]?.trim() || '',
    time: timeLine?.[1] || '',
    modelDisplay: modelLine?.[1] || '',
    authDisplay: modelLine?.[2] || '',
    tokensDisplay: tokensLine?.[1] || '',
    tokensInput: parsedTokens?.input || 0,
    tokensOutput: parsedTokens?.output || 0,
    contextDisplay: contextRaw,
    contextUsed,
    contextMax,
    sessionKey: sessionLine?.[1]?.trim() || '',
    updatedLabel: sessionLine?.[2]?.trim() || '',
    runtimeDisplay,
    thinkMode: parsedThinkMode || '',
    queueDisplay: queueLine?.[1] || '',
  };
}

function listDirectoryPreview(rootDir, maxEntries = 6) {
  try {
    const entries = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => {
        const fullPath = path.join(rootDir, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          name: entry.name,
          kind: entry.isDirectory() ? 'dir' : 'file',
          path: fullPath,
          updatedAt: stat.mtimeMs,
          size: entry.isDirectory() ? '' : `${Math.max(1, Math.round(stat.size / 1024))} KB`,
        };
      })
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'dir' ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      })
      .slice(0, maxEntries);

    return entries;
  } catch {
    return [];
  }
}

function normalizeCandidatePath(candidate, roots) {
  const cleaned = String(candidate || '').replace(/[),.;:]+$/g, '');
  if (!cleaned || /^https?:/i.test(cleaned) || cleaned.includes('://')) {
    return null;
  }

  if (path.isAbsolute(cleaned) && fileExists(cleaned)) {
    return cleaned;
  }

  for (const root of roots) {
    const resolved = path.resolve(root, cleaned);
    if (fileExists(resolved)) {
      return resolved;
    }
  }

  return null;
}

function isIgnoredWorkspacePath(targetPath) {
  if (!targetPath) {
    return true;
  }

  const segments = String(targetPath)
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  return segments.includes('node_modules');
}

function inferExecFileAction(command = '') {
  const normalized = String(command || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    /\b(touch|truncate)\b/.test(normalized) ||
    /(^|[^>])>\s*\S/.test(normalized) ||
    /\btee\b/.test(normalized)
  ) {
    return 'created';
  }

  if (
    /\b(cat|less|more|head|tail|grep|rg|sed\s+-n|awk|wc|stat|ls|find|readlink)\b/.test(normalized)
  ) {
    return 'viewed';
  }

  if (
    /\b(edit|write|cp|mv|sed\s+-i|perl\s+-pi|python|node|ruby)\b/.test(normalized)
  ) {
    return 'modified';
  }

  return null;
}

function inferToolFileAction(name = '', args = {}) {
  const normalizedName = String(name || '').toLowerCase();
  if (normalizedName === 'read' || normalizedName === 'memory_get') {
    return 'viewed';
  }
  if (normalizedName === 'write') {
    return 'created';
  }
  if (normalizedName === 'edit') {
    return 'modified';
  }
  if (normalizedName === 'exec') {
    return inferExecFileAction(args?.command || '');
  }
  return null;
}

function actionPriority(action = '') {
  if (action === 'created') return 3;
  if (action === 'modified') return 2;
  if (action === 'viewed') return 1;
  return 0;
}

function extractResolvedPathsFromSource(source, roots) {
  const pathPattern = /(?:\/Users\/[^\s"'`]+|(?:\.{0,2}\/)?(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/g;
  const matches = String(source || '').match(pathPattern) || [];
  const resolvedPaths = [];

  for (const match of matches) {
    const resolved = normalizeCandidatePath(match, roots);
    if (!resolved || isIgnoredWorkspacePath(resolved)) {
      continue;
    }
    resolvedPaths.push(resolved);
  }

  return resolvedPaths;
}

function collectFiles(entries, roots) {
  const found = new Map();

  for (const entry of entries) {
    if (entry.type !== 'message') {
      continue;
    }

    const payload = entry.message || {};
    const content = payload.content || [];
    for (const item of Array.isArray(content) ? content : []) {
      if (item?.type !== 'toolCall') {
        continue;
      }

      const action = inferToolFileAction(item.name, item.arguments || {});
      const sources = [item.arguments || item.partialJson || {}];

      for (const source of sources) {
        const resolvedPaths = extractResolvedPathsFromSource(
          typeof source === 'string' ? source : JSON.stringify(source),
          roots,
        );

        for (const resolved of resolvedPaths) {
          const stat = fs.statSync(resolved);
          if (stat.isDirectory()) {
            continue;
          }
          const existing = found.get(resolved);
          const nextAction =
            actionPriority(action) >= actionPriority(existing?.primaryAction)
              ? action || existing?.primaryAction || 'viewed'
              : existing?.primaryAction || action || 'viewed';

          if (!existing) {
            found.set(resolved, {
              path: resolved.startsWith(PROJECT_ROOT) ? path.relative(PROJECT_ROOT, resolved) : resolved,
              fullPath: resolved,
              kind: stat.isDirectory() ? '目录' : '文件',
              updatedAt: stat.mtimeMs,
              updatedLabel: formatTimestamp(stat.mtimeMs),
              primaryAction: nextAction,
              actions: action ? [action] : [],
            });
            continue;
          }

          found.set(resolved, {
            ...existing,
            updatedAt: stat.mtimeMs,
            updatedLabel: formatTimestamp(stat.mtimeMs),
            primaryAction: nextAction,
            actions: Array.from(new Set([...(existing.actions || []), ...(action ? [action] : [])])),
          });
        }
      }
    }
  }

  return [...found.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8);
}

function collectArtifacts(entries) {
  return entries
    .filter((entry) => entry.type === 'message' && entry.message?.role === 'assistant')
    .map((entry) => {
      const reply = cleanAssistantReply(extractPlainTextSegments(entry.message.content).join('\n\n'));
      if (!reply) {
        return null;
      }

      return {
        title: `回复 ${formatTimestamp(entry.message.timestamp || entry.timestamp)}`,
        type: 'assistant_output',
        detail: clip(reply, 180),
        timestamp: entry.message.timestamp || entry.timestamp,
      };
    })
    .filter(Boolean)
    .slice(-6)
    .reverse();
}

function collectConversationMessages(entries) {
  return entries
    .filter((entry) => entry.type === 'message')
    .map((entry) => {
      const payload = entry.message || {};
      if (payload.role === 'user') {
        const content = extractPlainTextSegments(payload.content).join('\n\n').trim();
        if (!content) {
          return null;
        }

        return {
          role: 'user',
          content,
          timestamp: payload.timestamp || Date.parse(entry.timestamp) || Date.now(),
        };
      }

      if (payload.role === 'assistant') {
        const content = cleanAssistantReply(extractPlainTextSegments(payload.content).join('\n\n'));
        if (!content) {
          return null;
        }

        const tokenBadge = formatTokenBadge(payload.usage);

        return {
          role: 'assistant',
          content,
          timestamp: payload.timestamp || Date.parse(entry.timestamp) || Date.now(),
          ...(tokenBadge ? { tokenBadge } : {}),
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(-80);
}

function collectSnapshots(entries, sessionRecord) {
  return entries
    .filter((entry) => entry.type === 'message' && entry.message?.role === 'assistant')
    .map((entry) => {
      const reply = cleanAssistantReply(extractPlainTextSegments(entry.message.content).join('\n\n'));
      if (!reply) {
        return null;
      }

      return {
        id: entry.id,
        title: `快照 ${formatTimestamp(entry.message.timestamp || entry.timestamp)}`,
        detail: clip(reply, 120),
        sessionId: sessionRecord?.sessionId || '',
        timestamp: entry.message.timestamp || entry.timestamp,
      };
    })
    .filter(Boolean)
    .slice(-6)
    .reverse();
}

function collectToolHistory(entries) {
  const history = [];
  const unresolvedCalls = new Map();

  for (const entry of entries) {
    if (entry.type !== 'message') {
      continue;
    }

    const payload = entry.message || {};
    const content = Array.isArray(payload.content) ? payload.content : [];

    if (payload.role === 'assistant') {
      for (const item of content) {
        if (item?.type !== 'toolCall') {
          continue;
        }

        const toolEvent = {
          id: item.id,
          name: item.name || 'tool.call',
          status: '执行中',
          detail: clip(item.arguments || item.partialJson || '{}', 160),
          timestamp: payload.timestamp || entry.timestamp,
        };
        history.push(toolEvent);
        unresolvedCalls.set(item.id, toolEvent);
      }
    }

    if (payload.role === 'toolResult') {
      const pending = unresolvedCalls.get(payload.toolCallId);
      const text = extractTextSegments(payload.content).join('\n');
      const status = payload.details?.isError ? '失败' : '完成';
      if (pending) {
        pending.status = status;
        pending.detail = clip(text || pending.detail, 160);
      } else {
        history.push({
          id: payload.toolCallId,
          name: payload.toolName || 'tool.result',
          status,
          detail: clip(text, 160),
          timestamp: payload.timestamp || entry.timestamp,
        });
      }
    }
  }

  return history.slice(-12).reverse();
}

function summarizeToolsForRun(tools) {
  if (!tools.length) {
    return '本轮未调用工具';
  }

  return tools
    .map((tool) => `${tool.name}(${tool.status})`)
    .join(' · ');
}

function collectTaskTimeline(entries, roots) {
  const runs = [];
  let currentRun = null;
  const unresolvedCalls = new Map();

  function ensureRun(timestamp) {
    if (currentRun) {
      return currentRun;
    }

    currentRun = {
      id: `run-${timestamp || Date.now()}`,
      title: `执行 ${formatTimestamp(timestamp || Date.now())}`,
      prompt: '',
      timestamp: timestamp || Date.now(),
      tools: [],
      files: new Map(),
      snapshots: [],
      outcome: '',
      status: '进行中',
    };
    runs.push(currentRun);
    return currentRun;
  }

  for (const entry of entries) {
    if (entry.type !== 'message') {
      continue;
    }

    const payload = entry.message || {};
    const timestamp = payload.timestamp || entry.timestamp || Date.now();
    const content = Array.isArray(payload.content) ? payload.content : [];

    if (payload.role === 'user') {
      currentRun = {
        id: entry.id || `run-${timestamp}`,
        title: `执行 ${formatTimestamp(timestamp)}`,
        prompt: clip(extractPlainTextSegments(content).join('\n\n'), 160),
        timestamp,
        tools: [],
        files: new Map(),
        snapshots: [],
        outcome: '',
        status: '进行中',
      };
      runs.push(currentRun);
      continue;
    }

    const run = ensureRun(timestamp);

    if (payload.role === 'assistant') {
      for (const item of content) {
        if (item?.type !== 'toolCall') {
          continue;
        }

        const toolEvent = {
          id: item.id,
          name: item.name || 'tool.call',
          status: '执行中',
          input: clip(item.arguments || item.partialJson || '{}', 600),
          output: '',
          detail: clip(item.arguments || item.partialJson || '{}', 120),
          timestamp,
        };
        run.tools.push(toolEvent);
        unresolvedCalls.set(item.id, toolEvent);
      }

      const reply = cleanAssistantReply(extractPlainTextSegments(content).join('\n\n'));
      if (reply) {
        run.outcome = clip(reply, 180);
        run.snapshots.push({
          id: entry.id || `snapshot-${timestamp}`,
          title: `快照 ${formatTimestamp(timestamp)}`,
          detail: clip(reply, 120),
          timestamp,
        });
        if (run.status !== '失败') {
          run.status = '已完成';
        }
      }
    }

    if (payload.role === 'toolResult') {
      const detail = clip(extractTextSegments(content).join('\n'), 600);
      const pending = unresolvedCalls.get(payload.toolCallId);
      const status = payload.details?.isError ? '失败' : '完成';
      if (pending) {
        pending.status = status;
        pending.output = detail || pending.output;
        pending.detail = clip(detail || pending.detail, 120);
      } else {
        run.tools.push({
          id: payload.toolCallId || `${timestamp}`,
          name: payload.toolName || 'tool.result',
          status,
          input: '',
          output: detail,
          detail: clip(detail, 120),
          timestamp,
        });
      }

      if (status === '失败') {
        run.status = '失败';
      }
    }

    const fileMatches = collectFiles([entry], roots);
    for (const item of fileMatches) {
      run.files.set(item.path, item);
    }
  }

  return runs
    .map((run) => ({
      id: run.id,
      title: run.title,
      timestamp: run.timestamp,
      prompt: run.prompt || '未记录输入',
      status: run.status,
      tools: run.tools,
      toolsSummary: summarizeToolsForRun(run.tools),
      files: [...run.files.values()].slice(0, 6),
      snapshots: run.snapshots.slice(-3).reverse(),
      outcome: run.outcome || '执行仍在进行，等待最终回复。',
    }))
    .filter((run) => run.prompt || run.tools.length || run.outcome)
    .slice(-8)
    .reverse();
}

function collectAgentActivity(agentId) {
  const sessions = loadSessionsIndex(agentId);
  const updatedAt = Object.values(sessions).reduce((latest, session) => {
    const next = session?.updatedAt || 0;
    return next > latest ? next : latest;
  }, 0);
  return {
    updatedAt,
    sessionCount: Object.keys(sessions).length,
  };
}

function buildAgentGraph() {
  const localConfig = config.localConfig;
  if (!localConfig?.agents?.list?.length) {
    return [{ id: config.agentId, label: config.agentId, state: 'active', detail: '当前 Agent' }];
  }

  const mainAgent = localConfig.agents.list.find((agent) => agent.default) || localConfig.agents.list[0];
  const allowed = new Set(mainAgent?.subagents?.allowAgents || []);
  return localConfig.agents.list.map((agent) => {
    const activity = collectAgentActivity(agent.id);
    const isMain = agent.id === mainAgent?.id;
    const role = isMain ? '主 Agent' : allowed.has(agent.id) ? '可调度子 Agent' : '独立 Agent';
    const modelPrimary =
      agent?.model?.primary ||
      (typeof agent?.model === 'string' ? agent.model : '') ||
      config.localConfig?.agents?.defaults?.model?.primary ||
      config.model;

    return {
      id: agent.id,
      label: agent.id,
      state: isMain ? 'active' : allowed.has(agent.id) ? 'ready' : 'idle',
      detail: `${role} · ${clip(modelPrimary, 42)}`,
      updatedAt: activity.updatedAt,
      sessionCount: activity.sessionCount,
    };
  });
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
            ? await callOpenClaw([{ role: 'user', content: resetCommand.tail }], fastMode, nextSessionUser)
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
        ? await callOpenClaw(outboundMessages, fastMode, sessionUser, { commandBody })
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
    clip,
    collectTaskTimeline,
    getCommandCenterSessionKey,
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
