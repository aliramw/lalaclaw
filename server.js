const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const HOME_DIR = process.env.HOME || '';
const PROJECT_ROOT = __dirname;
const LOCAL_OPENCLAW_CONFIG = path.join(HOME_DIR, '.openclaw', 'openclaw.json');
const LOCAL_OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');

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

function buildRuntimeConfig() {
  const localConfig = readJsonIfExists(LOCAL_OPENCLAW_CONFIG);
  const localGatewayPort = Number(localConfig?.gateway?.port || 18789);
  const localToken = localConfig?.gateway?.auth?.token || '';
  const localAgentId = resolveDefaultAgentId(localConfig);
  const envBaseUrl = process.env.OPENCLAW_BASE_URL || '';
  const envModel = process.env.OPENCLAW_MODEL || '';
  const envAgentId = process.env.OPENCLAW_AGENT_ID || '';
  const baseUrl = envBaseUrl || (localToken ? `http://127.0.0.1:${localGatewayPort}` : '');
  const agentId = envAgentId || localAgentId;
  const workspaceRoot = localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');

  return {
    mode: baseUrl ? 'openclaw' : 'mock',
    model: envModel || 'openclaw',
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
  };
}

const config = buildRuntimeConfig();

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
      if (raw.length > 1_000_000) {
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

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function summarizeMessages(messages) {
  const recent = messages.filter((item) => item.role !== 'system').slice(-6);
  if (!recent.length) {
    return '暂无对话。';
  }

  return recent
    .map((item) => `${item.role}: ${clip(String(item.content || '').replace(/\s+/g, ' ').trim(), 72)}`)
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

function getCommandCenterSessionKey(agentId = config.agentId) {
  return `agent:${agentId}:openai-user:command-center`;
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

function translateUpdatedLabel(label) {
  if (!label) {
    return '';
  }

  return String(label)
    .replace('updated just now', '刚刚更新')
    .replace(/(\d+)m ago/g, '$1 分钟前')
    .replace(/(\d+)h ago/g, '$1 小时前');
}

function parseSessionStatusText(statusText) {
  if (!statusText) {
    return null;
  }

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

  return {
    text: statusText,
    time: timeLine?.[1] || '',
    modelDisplay: modelLine?.[1] || '',
    authDisplay: modelLine?.[2] || '',
    tokensDisplay: tokensLine?.[1] || '',
    contextDisplay: contextRaw,
    contextUsed,
    contextMax,
    sessionKey: sessionLine?.[1]?.trim() || '',
    updatedLabel: sessionLine?.[2]?.trim() || '',
    runtimeDisplay: runtimeLine?.[1] || '',
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

function collectFiles(entries, roots) {
  const pathPattern = /(?:\/Users\/[^\s"'`]+|(?:\.{0,2}\/)?(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/g;
  const found = new Map();

  for (const entry of entries) {
    if (entry.type !== 'message') {
      continue;
    }

    const payload = entry.message || {};
    const content = payload.content || [];
    const sources = [
      ...extractTextSegments(content),
      ...(Array.isArray(content)
        ? content
            .filter((item) => item?.type === 'toolCall')
            .map((item) => item.arguments || item.partialJson || '')
        : []),
    ];

    for (const source of sources) {
      const matches = String(source).match(pathPattern) || [];
      for (const match of matches) {
        const resolved = normalizeCandidatePath(match, roots);
        if (!resolved || found.has(resolved)) {
          continue;
        }

        const stat = fs.statSync(resolved);
        found.set(resolved, {
          path: resolved.startsWith(PROJECT_ROOT) ? path.relative(PROJECT_ROOT, resolved) : resolved,
          kind: stat.isDirectory() ? '目录' : '文件',
          updatedAt: stat.mtimeMs,
        });
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

function buildMockSnapshot(fastMode) {
  const now = Date.now();
  return {
    session: {
      mode: 'mock',
      model: config.model,
      agentId: config.agentId,
      sessionKey: '',
      status: '已完成',
      fastMode: fastMode ? '开启' : '关闭',
      contextUsed: 0,
      contextMax: 16000,
      contextDisplay: '0 / 16000',
      runtime: 'mock',
      queue: 'none',
      updatedLabel: '刚刚',
    },
    toolHistory: [
      { name: 'workspace.scan', status: '完成', detail: '已扫描当前项目目录。', timestamp: now },
      { name: fastMode ? 'planner.fast-path' : 'planner.standard-path', status: '完成', detail: '已生成最小可运行原型。', timestamp: now },
    ],
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
      { id: 'main', label: 'main', state: 'active', detail: '主 Agent · mock', updatedAt: now, sessionCount: 1 },
    ],
    peeks: {
      workspace: buildWorkspacePeek(),
      terminal: buildTerminalPeek(),
      browser: { summary: 'mock 模式未接入浏览器控制。', items: [{ label: '状态', value: '未连接 OpenClaw' }] },
    },
  };
}

async function buildOpenClawSnapshot(fastMode) {
  const sessionKey = getCommandCenterSessionKey(config.agentId);
  const sessionRecord = resolveSessionRecord(config.agentId, sessionKey);
  const transcriptPath = sessionRecord ? getTranscriptPath(config.agentId, sessionRecord.sessionId) : '';
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
    config.localConfig?.agents?.defaults?.model?.primary ||
    config.model;

  return {
    session: {
      mode: 'openclaw',
      model: latestModel,
      agentId: config.agentId,
      sessionKey: parsedStatus?.sessionKey || sessionKey,
      status: '就绪',
      fastMode: fastMode ? '开启' : '关闭',
      contextUsed: parsedStatus?.contextUsed || null,
      contextMax: parsedStatus?.contextMax || 272000,
      contextDisplay:
        parsedStatus?.contextUsed && parsedStatus?.contextMax
          ? `${parsedStatus.contextUsed} / ${parsedStatus.contextMax}`
          : parsedStatus?.contextDisplay || '未知',
      runtime: parsedStatus?.runtimeDisplay || '未知',
      queue: parsedStatus?.queueDisplay || '未知',
      updatedLabel:
        translateUpdatedLabel(parsedStatus?.updatedLabel) ||
        (sessionRecord?.updatedAt ? formatTimestamp(sessionRecord.updatedAt) : '未知'),
      tokens: parsedStatus?.tokensDisplay || '',
      auth: parsedStatus?.authDisplay || '',
      time: parsedStatus?.time || '',
    },
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

async function buildDashboardSnapshot(fastMode = false) {
  if (config.mode !== 'openclaw') {
    return buildMockSnapshot(fastMode);
  }
  return await buildOpenClawSnapshot(fastMode);
}

async function callOpenClaw(messages, fastMode) {
  const endpoint = new URL(config.apiPath, config.baseUrl).toString();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  if (config.agentId) {
    headers['x-openclaw-agent-id'] = config.agentId;
  }

  const systemPrompt =
    'You are OpenClaw, acting as the command center agent for a software workspace. ' +
    'Respond concisely and include operational clarity for the human operator.';

  let payload;
  if (config.apiStyle === 'responses') {
    payload = {
      model: config.model,
      input: [
        { role: 'system', content: systemPrompt },
        ...messages.map((message) => ({
          role: message.role,
          content: [{ type: 'text', text: normalizeChatMessage(message) }],
        })),
      ],
      reasoning: { effort: fastMode ? 'low' : 'medium' },
    };
  } else {
    payload = {
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: fastMode ? 0.3 : 0.7,
      stream: false,
      user: 'command-center',
    };
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
    config.model = body.model || config.model;

    const reply =
      config.mode === 'openclaw'
        ? await callOpenClaw(messages, fastMode)
        : {
            outputText: [
              'OpenClaw command channel is online in mock mode.',
              `Current intent: ${clip(messages.at(-1)?.content || 'No prompt supplied.', 160)}`,
            ].join('\n'),
            usage: null,
          };

    const snapshot = await buildDashboardSnapshot(fastMode);
    snapshot.session.status = fastMode ? '已完成 / 快速' : '已完成 / 标准';
    const resolvedModel = snapshot.session?.model || config.model;

    sendJson(res, 200, {
      ok: true,
      mode: config.mode,
      model: resolvedModel,
      outputText: reply.outputText,
      usage: reply.usage,
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

async function handleRuntime(res) {
  try {
    const snapshot = await buildDashboardSnapshot(false);
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

function handleSession(res) {
  sendJson(res, 200, {
    mode: config.mode,
    model: config.model,
    agentId: config.agentId,
    apiStyle: config.apiStyle,
    hasBaseUrl: Boolean(config.baseUrl),
    hasApiKey: Boolean(config.apiKey),
    localDetected: config.localDetected,
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/session') {
    handleSession(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime') {
    handleRuntime(res);
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

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`CommandCenter running at http://${HOST}:${PORT}`);
  console.log(`Mode: ${config.mode}`);
});
