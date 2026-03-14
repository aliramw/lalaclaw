const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const config = {
  mode: process.env.OPENCLAW_BASE_URL ? 'openclaw' : 'mock',
  model: process.env.OPENCLAW_MODEL || 'openclaw-agent',
  baseUrl: process.env.OPENCLAW_BASE_URL || '',
  apiKey: process.env.OPENCLAW_API_KEY || '',
  apiStyle: process.env.OPENCLAW_API_STYLE || 'chat',
  apiPath: process.env.OPENCLAW_API_PATH || '/v1/chat/completions',
};

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
      } catch (error) {
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
    return 'No conversation yet.';
  }

  return recent
    .map((item) => `${item.role}: ${clip(item.content.replace(/\s+/g, ' ').trim(), 72)}`)
    .join(' | ');
}

function buildMockReply(messages, fastMode) {
  const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
  const prompt = lastUserMessage?.content?.trim() || 'No prompt supplied.';
  const status = fastMode ? '执行中 / Fast' : '执行中 / Standard';
  const summary = summarizeMessages(messages);
  const lines = [
    'OpenClaw command channel is online in mock mode.',
    `Current intent: ${clip(prompt, 160)}`,
    'Suggested next product slice:',
    '1. Lock the single-agent chat loop',
    '2. Persist tool traces and imported files',
    '3. Add multi-agent execution graph',
  ];

  return {
    outputText: lines.join('\n'),
    usage: {
      input_tokens: Math.max(prompt.length * 2, 64),
      output_tokens: 96,
      total_tokens: Math.max(prompt.length * 2, 64) + 96,
    },
    metadata: {
      status,
      summary,
    },
    toolHistory: [
      {
        name: 'workspace.scan',
        status: 'completed',
        detail: 'Inspected current workspace and confirmed bootstrap state.',
      },
      {
        name: fastMode ? 'planner.fast-path' : 'planner.deep-path',
        status: 'completed',
        detail: fastMode ? 'Reduced planning depth for rapid iteration.' : 'Expanded reasoning depth for richer task planning.',
      },
    ],
    files: [
      { path: 'public/index.html', kind: 'ui-shell' },
      { path: 'server.js', kind: 'runtime-entry' },
    ],
    artifacts: [
      { title: 'Session brief', type: 'summary', detail: 'Conversation snapshot prepared for human review.' },
    ],
    snapshots: [
      { id: `snapshot-${Date.now()}`, title: 'Before next action', detail: `Summary: ${summary}` },
    ],
    agents: [
      { id: 'agent-root', label: 'Primary Agent', state: 'active' },
      { id: 'agent-ui', label: 'UI Planner', state: 'ready' },
      { id: 'agent-tools', label: 'Tool Trace', state: 'ready' },
    ],
  };
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

async function callOpenClaw(messages, fastMode) {
  const endpoint = new URL(config.apiPath, config.baseUrl).toString();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
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
  const parsed = parseOpenClawResponse(data);
  return {
    ...parsed,
    metadata: {
      status: fastMode ? '已完成 / Fast' : '已完成 / Standard',
      summary: summarizeMessages(messages),
    },
  };
}

function parseOpenClawResponse(data) {
  if (typeof data.output_text === 'string') {
    return {
      outputText: data.output_text,
      usage: data.usage || null,
      toolHistory: extractResponseTools(data.output || []),
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [
        { id: 'agent-root', label: 'Primary Agent', state: 'completed' },
      ],
    };
  }

  const choice = data.choices?.[0]?.message;
  const outputText = normalizeChatMessage(choice) || 'OpenClaw returned an empty response.';
  const toolHistory = Array.isArray(choice?.tool_calls)
    ? choice.tool_calls.map((call) => ({
        name: call.function?.name || call.type || 'tool.call',
        status: 'completed',
        detail: clip(call.function?.arguments || ''),
      }))
    : [];

  return {
    outputText,
    usage: data.usage || null,
    toolHistory,
    files: [],
    artifacts: [],
    snapshots: [],
    agents: [
      { id: 'agent-root', label: 'Primary Agent', state: 'completed' },
    ],
  };
}

function extractResponseTools(outputItems) {
  return outputItems
    .filter((item) => item.type && item.type !== 'message')
    .map((item) => ({
      name: item.name || item.type,
      status: item.status || 'completed',
      detail: clip(JSON.stringify(item), 200),
    }));
}

async function handleChat(req, res) {
  try {
    const body = await parseRequestBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const fastMode = Boolean(body.fastMode);
    const model = body.model || config.model;

    config.model = model;

    const reply = config.mode === 'openclaw'
      ? await callOpenClaw(messages, fastMode)
      : buildMockReply(messages, fastMode);

    sendJson(res, 200, {
      ok: true,
      mode: config.mode,
      model: config.model,
      ...reply,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message || 'Unknown server error',
    });
  }
}

function handleSession(res) {
  sendJson(res, 200, {
    mode: config.mode,
    model: config.model,
    apiStyle: config.apiStyle,
    hasBaseUrl: Boolean(config.baseUrl),
    hasApiKey: Boolean(config.apiKey),
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/session') {
    handleSession(res);
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
