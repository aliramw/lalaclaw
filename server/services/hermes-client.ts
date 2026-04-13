import path from 'node:path';

import {
  inferHermesProgressState,
} from './agent-progress.ts';

type LooseRecord = Record<string, any>;

type ExecFileResponse = {
  stdout?: string;
  stderr?: string;
};

type HermesDispatchOptions = {
  model?: string;
  sessionId?: string;
  sessionUser?: string;
};

type HermesStatus = {
  installPath?: string;
  model?: string;
  provider?: string;
};

type HermesDispatchResult = {
  outputText: string;
  sessionId?: string;
  usage: null;
  progressStage?: string;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

type HermesSessionStats = {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  endedAt?: number | null;
  inputTokens?: number;
  messageCount?: number;
  model?: string;
  outputTokens?: number;
  reasoningTokens?: number;
  sessionId?: string;
  startedAt?: number | null;
};

type HermesClientOptions = {
  execFileAsync?: (file: string, args?: string[], options?: Record<string, unknown>) => Promise<ExecFileResponse>;
  HERMES_BIN?: string;
  PROJECT_ROOT?: string;
};

const DEFAULT_HERMES_MODEL = 'gpt-5.4';
const FALLBACK_HERMES_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.4': 1050000,
  'openai/gpt-5.4': 1050000,
};

function resolveHermesBin(explicitBin = '') {
  const normalizedExplicitBin = String(explicitBin || '').trim();
  if (normalizedExplicitBin) {
    return normalizedExplicitBin;
  }

  const homeDir = String(process.env.HOME || '').trim();
  return [
    String(process.env.HERMES_BIN || '').trim(),
    homeDir ? path.join(homeDir, '.local', 'bin', 'hermes') : '',
    homeDir ? path.join(homeDir, '.hermes', 'hermes-agent', 'hermes') : '',
    'hermes',
  ].find(Boolean) || 'hermes';
}

export function isHermesAgentId(agentId = '') {
  return String(agentId || '').trim().toLowerCase() === 'hermes';
}

function buildHermesExecEnv(hermesBin: string, baseEnv = process.env) {
  const values = [
    path.dirname(process.execPath),
    path.isAbsolute(hermesBin) ? path.dirname(hermesBin) : '',
    ...String(baseEnv?.PATH || '').split(path.delimiter),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return {
    ...baseEnv,
    PATH: values.filter((value, index) => values.indexOf(value) === index).join(path.delimiter),
  };
}

function parseHermesSessionId(stdout = '') {
  const match = String(stdout || '').match(/(?:^|\n)\s*session_id:\s*([^\s]+)\s*(?:\n|$)/i);
  return String(match?.[1] || '').trim();
}

function trimHermesOutput(stdout = '') {
  const lines = String(stdout || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''));
  const isChromeLine = (line = '') => {
    const trimmed = String(line || '').trim();
    return Boolean(trimmed) && (
      /^[╭╮╰╯┌┐└┘│─\s]+$/u.test(trimmed)
      || /^╭.*Hermes.*╮$/u.test(trimmed)
      || /^↻\s+Resumed session\b/i.test(trimmed)
    );
  };

  while (lines.length && !String(lines[0] || '').trim()) {
    lines.shift();
  }

  while (lines.length && !String(lines[lines.length - 1] || '').trim()) {
    lines.pop();
  }

  while (lines.length && isChromeLine(lines[0])) {
    lines.shift();
    while (lines.length && !String(lines[0] || '').trim()) {
      lines.shift();
    }
  }

  while (
    lines.length
    && (
      /^session_id:\s*/i.test(String(lines[lines.length - 1] || '').trim())
      || isChromeLine(lines[lines.length - 1])
      || !String(lines[lines.length - 1] || '').trim()
    )
  ) {
    lines.pop();
  }

  const firstMeaningfulLine = String(lines[0] || '').trim();
  if (firstMeaningfulLine) {
    let nextMeaningfulIndex = -1;
    for (let index = 1; index < lines.length; index += 1) {
      if (String(lines[index] || '').trim()) {
        nextMeaningfulIndex = index;
        break;
      }
    }

    if (
      nextMeaningfulIndex > 0
      && String(lines[nextMeaningfulIndex] || '').trim() === firstMeaningfulLine
    ) {
      lines.splice(1, nextMeaningfulIndex);
    }
  }

  return lines.join('\n').trim();
}

function parseHermesStatus(stdout = ''): HermesStatus {
  const normalized = String(stdout || '');
  const readValue = (label: string) => {
    const match = normalized.match(new RegExp(`^\\s*${label}:\\s+(.+)$`, 'mi'));
    return String(match?.[1] || '').trim();
  };

  return {
    installPath: readValue('Project'),
    model: readValue('Model') || DEFAULT_HERMES_MODEL,
    provider: readValue('Provider'),
  };
}

function parseHermesSessionStats(stdout = ''): HermesSessionStats | null {
  const line = String(stdout || '').trim();
  if (!line) {
    return null;
  }

  const [
    sessionId = '',
    model = '',
    inputTokens = '0',
    outputTokens = '0',
    cacheReadTokens = '0',
    cacheWriteTokens = '0',
    reasoningTokens = '0',
    messageCount = '0',
    startedAt = '',
    endedAt = '',
  ] = line.split('\t');

  if (!String(sessionId || '').trim()) {
    return null;
  }

  return {
    sessionId: String(sessionId || '').trim(),
    model: String(model || '').trim(),
    inputTokens: Number(inputTokens) || 0,
    outputTokens: Number(outputTokens) || 0,
    cacheReadTokens: Number(cacheReadTokens) || 0,
    cacheWriteTokens: Number(cacheWriteTokens) || 0,
    reasoningTokens: Number(reasoningTokens) || 0,
    messageCount: Number(messageCount) || 0,
    startedAt: startedAt ? Number(startedAt) || null : null,
    endedAt: endedAt ? Number(endedAt) || null : null,
  };
}

function parseContextWindow(stdout = '') {
  const value = Number(String(stdout || '').trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatHermesMessage(message: LooseRecord = {}) {
  const role = String(message?.role || '').trim() || 'user';
  const content = String(message?.content || '').trim();
  const attachmentNames = Array.isArray(message?.attachments)
    ? message.attachments
      .map((attachment: LooseRecord) => String(attachment?.name || attachment?.path || '').trim())
      .filter(Boolean)
    : [];

  const suffix = attachmentNames.length ? `\nAttachments: ${attachmentNames.join(', ')}` : '';
  return `${role === 'assistant' ? 'Assistant' : role === 'system' ? 'System' : 'User'}: ${content || '(empty)'}${suffix}`.trim();
}

function buildHermesPrompt(messages: LooseRecord[] = []) {
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => message && typeof message === 'object' && String(message.role || '').trim())
    : [];

  if (!normalizedMessages.length) {
    return '';
  }

  if (normalizedMessages.length === 1) {
    return String(normalizedMessages[0]?.content || '').trim();
  }

  return [
    'Continue this conversation and reply as the assistant.',
    '',
    ...normalizedMessages.map((message) => formatHermesMessage(message)),
  ].join('\n');
}

export function createHermesClient({
  execFileAsync,
  HERMES_BIN,
  PROJECT_ROOT,
}: HermesClientOptions = {}) {
  const hermesBin = resolveHermesBin(HERMES_BIN);
  const projectRoot = String(PROJECT_ROOT || process.cwd()).trim() || process.cwd();
  const homeDir = String(process.env.HOME || '').trim();
  const hermesRoot = homeDir ? path.join(homeDir, '.hermes', 'hermes-agent') : '';
  const hermesStateDbPath = homeDir ? path.join(homeDir, '.hermes', 'state.db') : '';
  const hermesVenvPython = hermesRoot ? path.join(hermesRoot, 'venv', 'bin', 'python') : '';
  const contextWindowCache = new Map<string, number>();

  function getExecFileAsync() {
    if (typeof execFileAsync !== 'function') {
      throw new Error('execFileAsync is required');
    }
    return execFileAsync;
  }

  async function getHermesSessionStats(sessionId = ''): Promise<HermesSessionStats | null> {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId || !hermesStateDbPath) {
      return null;
    }

    const execFile = getExecFileAsync();
    const escapedSessionId = normalizedSessionId.replace(/'/g, "''");
    const response = await execFile('sqlite3', [
      '-separator',
      '\t',
      hermesStateDbPath,
      [
        'SELECT',
        'id,',
        'model,',
        'input_tokens,',
        'output_tokens,',
        'cache_read_tokens,',
        'cache_write_tokens,',
        'reasoning_tokens,',
        'message_count,',
        'started_at,',
        'ended_at',
        'FROM sessions',
        `WHERE id = '${escapedSessionId}'`,
        'LIMIT 1;',
      ].join(' '),
    ], {
      cwd: projectRoot,
      env: buildHermesExecEnv(hermesBin),
      maxBuffer: 1024 * 1024,
    });

    return parseHermesSessionStats(response?.stdout || '');
  }

  async function getHermesModelContextWindow(model = ''): Promise<number> {
    const normalizedModel = String(model || '').trim() || DEFAULT_HERMES_MODEL;
    if (contextWindowCache.has(normalizedModel)) {
      return contextWindowCache.get(normalizedModel) || 0;
    }

    const fallbackContextWindow = FALLBACK_HERMES_CONTEXT_WINDOWS[normalizedModel] || 0;
    if (!hermesVenvPython) {
      if (fallbackContextWindow) {
        contextWindowCache.set(normalizedModel, fallbackContextWindow);
      }
      return fallbackContextWindow;
    }

    try {
      const execFile = getExecFileAsync();
      const response = await execFile(hermesVenvPython, [
        '-c',
        [
          'import sys',
          `sys.path.insert(0, ${JSON.stringify(hermesRoot)})`,
          'from agent.model_metadata import get_model_context_length',
          `result = get_model_context_length(${JSON.stringify(normalizedModel)}, provider="openai-codex", base_url="https://chatgpt.com/backend-api/codex") or 0`,
          'print(int(result or 0))',
        ].join('; '),
      ], {
        cwd: projectRoot,
        env: buildHermesExecEnv(hermesBin),
        maxBuffer: 256 * 1024,
      });

      const contextWindow = parseContextWindow(response?.stdout || '') || fallbackContextWindow;
      if (contextWindow > 0) {
        contextWindowCache.set(normalizedModel, contextWindow);
      }
      return contextWindow;
    } catch {
      if (fallbackContextWindow > 0) {
        contextWindowCache.set(normalizedModel, fallbackContextWindow);
      }
      return fallbackContextWindow;
    }
  }

  async function getHermesStatus(): Promise<HermesStatus> {
    const execFile = getExecFileAsync();
    const response = await execFile(hermesBin, ['status', '--all'], {
      cwd: projectRoot,
      env: buildHermesExecEnv(hermesBin),
      maxBuffer: 1024 * 1024,
    });

    return parseHermesStatus(response?.stdout || '');
  }

  async function dispatchHermes(messages: LooseRecord[] = [], options: HermesDispatchOptions = {}): Promise<HermesDispatchResult> {
    const prompt = buildHermesPrompt(messages);
    const execFile = getExecFileAsync();
    const args = ['chat', '-q', prompt, '-Q'];
    const requestedModel = String(options.model || '').trim();
    const requestedSessionId = String(options.sessionId || '').trim();

    if (requestedModel) {
      args.push('-m', requestedModel);
    }
    if (requestedSessionId) {
      args.push('--resume', requestedSessionId);
    }

    const response = await execFile(hermesBin, args, {
      cwd: projectRoot,
      env: buildHermesExecEnv(hermesBin),
      maxBuffer: 4 * 1024 * 1024,
    });
    const progressState = inferHermesProgressState({
      stdout: response?.stdout || '',
    });

    return {
      outputText: trimHermesOutput(response?.stdout || ''),
      sessionId: parseHermesSessionId(response?.stdout || '') || requestedSessionId || undefined,
      usage: null,
      ...progressState,
    };
  }

  return {
    dispatchHermes,
    getHermesModelContextWindow,
    getHermesSessionStats,
    getHermesStatus,
    isHermesAgentId,
  };
}
