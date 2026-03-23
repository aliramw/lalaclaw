const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 3_500;

type RuntimeConfig = {
  baseUrl?: string;
  healthPort?: number;
  openclawBin?: string;
};

type CommandError = Error & {
  killed?: boolean;
  code?: number | string | null;
  signal?: string;
  stdout?: string;
  stderr?: string;
  statusCode?: number;
};

type GuidanceContext = {
  commandResult?: CommandSummary | null;
  healthCheck?: HealthCheckResult | null;
};

type CommandSummary = {
  ok: boolean;
  timedOut: boolean;
  exitCode: number | string | null;
  signal: string;
  stdout: string;
  stderr: string;
  error: string;
};

type HealthCheckResult = {
  status: 'healthy' | 'unhealthy' | 'unknown' | 'unreachable';
  url: string;
  httpStatus: number;
  detail: string;
};

type ExecFileResponse = {
  stdout?: string;
  stderr?: string;
};

type OpenClawActionDefinition = {
  key: string;
  args: string[];
  mutating: boolean;
  expectedHealth?: string;
};

type OpenClawManagementServiceOptions = {
  config?: RuntimeConfig;
  execFileAsync?: (file: string, args?: string[], options?: Record<string, unknown>) => Promise<ExecFileResponse>;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const openClawActionDefinitions: Record<'status' | 'start' | 'stop' | 'restart' | 'doctorRepair', OpenClawActionDefinition> = {
  status: {
    key: 'status',
    args: ['gateway', 'status'],
    mutating: false,
  },
  start: {
    key: 'start',
    args: ['gateway', 'start'],
    mutating: true,
    expectedHealth: 'healthy',
  },
  stop: {
    key: 'stop',
    args: ['gateway', 'stop'],
    mutating: true,
    expectedHealth: 'stopped',
  },
  restart: {
    key: 'restart',
    args: ['gateway', 'restart'],
    mutating: true,
    expectedHealth: 'healthy',
  },
  doctorRepair: {
    key: 'doctorRepair',
    args: ['doctor', '--repair'],
    mutating: true,
    expectedHealth: 'healthy',
  },
};

function clipOutput(value = '', maxLength = 8_000) {
  const normalized = String(value || '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}

function buildHealthCandidates(config: RuntimeConfig = {}) {
  const candidates = [];
  const baseUrl = String(config?.baseUrl || '').trim();
  if (baseUrl) {
    for (const pathname of ['/healthz', '/health']) {
      try {
        candidates.push(new URL(pathname, baseUrl).toString());
      } catch {}
    }
  }

  const healthPort = Number(config?.healthPort || 0);
  if (healthPort > 0) {
    candidates.push(`http://127.0.0.1:${healthPort}/healthz`);
    candidates.push(`http://127.0.0.1:${healthPort}/health`);
  }

  return [...new Set(candidates)];
}

type OpenClawActionKey = keyof typeof openClawActionDefinitions;

function summarizeCommandError(error: CommandError): CommandSummary {
  const message = String(error?.message || 'OpenClaw command failed');
  const timedOut = Boolean(error?.killed) && /timed out/i.test(message);
  const exitCode = typeof error?.code === 'number' && Number.isInteger(error.code) ? error.code : null;

  return {
    ok: false,
    timedOut,
    exitCode,
    signal: error?.signal || '',
    stdout: clipOutput(error?.stdout || ''),
    stderr: clipOutput(error?.stderr || ''),
    error: message,
  };
}

function evaluateHealthExpectation(expectedHealth = '', healthCheck: HealthCheckResult | null = null) {
  if (!expectedHealth) {
    return true;
  }

  if (!healthCheck) {
    return false;
  }

  if (expectedHealth === 'healthy') {
    return healthCheck.status === 'healthy';
  }

  if (expectedHealth === 'stopped') {
    return ['unreachable', 'unknown'].includes(healthCheck.status);
  }

  return false;
}

function buildGuidance(actionKey: string, {
  commandResult,
  healthCheck,
}: GuidanceContext = {}) {
  const guidance = [];

  if (commandResult?.timedOut) {
    guidance.push('The command timed out. Check OpenClaw logs and rerun the action after the gateway settles.');
  }

  if (!commandResult?.ok) {
    guidance.push('Review the command stderr output below before retrying the action.');
  }

  if (healthCheck?.status === 'unreachable' && ['start', 'restart', 'doctorRepair', 'status'].includes(actionKey)) {
    guidance.push('The gateway health endpoint is still unreachable. Review the gateway log and run `openclaw gateway status`.');
  }

  if (healthCheck?.status === 'healthy' && actionKey === 'stop') {
    guidance.push('The health endpoint still responds after stop. Confirm that another supervisor did not restart the gateway.');
  }

  if (healthCheck?.status === 'unhealthy') {
    guidance.push('The health endpoint responded but reported an unhealthy state. Review the command output and OpenClaw doctor checks.');
  }

  if (!guidance.length && commandResult?.ok) {
    guidance.push('The command completed successfully. Verify the updated gateway state in the diagnostics summary if needed.');
  }

  return guidance;
}

export async function performHealthCheck(config: RuntimeConfig, {
  fetchImpl = global.fetch,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
}: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<HealthCheckResult> {
  const urls = buildHealthCandidates(config);
  if (!urls.length || typeof fetchImpl !== 'function') {
    return {
      status: 'unknown' as const,
      url: '',
      httpStatus: 0,
      detail: 'Health check unavailable',
    };
  }

  let lastResult: HealthCheckResult = {
    status: 'unknown',
    url: urls[0] || '',
    httpStatus: 0,
    detail: 'Health check unavailable',
  };

  for (const url of urls) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        signal: controller?.signal,
      });
      const text = clipOutput(await response.text());
      const nextResult: HealthCheckResult = {
        status: response.ok ? 'healthy' : 'unhealthy',
        url,
        httpStatus: response.status,
        detail: text,
      };
      if (response.ok) {
        return nextResult;
      }
      lastResult = nextResult;
    } catch (error) {
      const nextError = error as Error;
      lastResult = {
        status: 'unreachable',
        url,
        httpStatus: 0,
        detail: String(nextError?.message || 'Health check failed'),
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  return lastResult;
}

export function createOpenClawManagementService({
  config,
  execFileAsync,
  fetchImpl = global.fetch,
  now = () => Date.now(),
}: OpenClawManagementServiceOptions) {
  if (typeof execFileAsync !== 'function') {
    throw new Error('execFileAsync is required');
  }
  const execFile = execFileAsync;
  const runtimeConfig: RuntimeConfig = config ?? {};

  async function runOpenClawAction(actionKey = '') {
    const normalizedAction = String(actionKey || '').trim();
    const definition = Object.prototype.hasOwnProperty.call(openClawActionDefinitions, normalizedAction)
      ? openClawActionDefinitions[normalizedAction as OpenClawActionKey]
      : null;
    if (!definition) {
      const error = new Error('Unsupported OpenClaw action') as CommandError;
      error.statusCode = 400;
      throw error;
    }

    const command = String(runtimeConfig.openclawBin || 'openclaw').trim() || 'openclaw';
    const startedAt = now();
    let commandResult;

    try {
      const response = await execFile(command, definition.args, {
        timeout: DEFAULT_ACTION_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
      commandResult = {
        ok: true,
        timedOut: false,
        exitCode: 0,
        signal: '',
        stdout: clipOutput(response?.stdout || ''),
        stderr: clipOutput(response?.stderr || ''),
        error: '',
      };
    } catch (error) {
      commandResult = summarizeCommandError(error as CommandError);
    }

    const healthCheck = await performHealthCheck(runtimeConfig, { fetchImpl });
    const healthMatchesExpectation = evaluateHealthExpectation(definition.expectedHealth, healthCheck);
    const ok = Boolean(commandResult.ok) && healthMatchesExpectation;

    return {
      ok,
      action: definition.key,
      mutating: definition.mutating,
      startedAt,
      finishedAt: now(),
      command: {
        bin: command,
        args: definition.args,
        display: [command, ...definition.args].join(' '),
      },
      commandResult,
      healthCheck,
      guidance: buildGuidance(definition.key, { commandResult, healthCheck }),
    };
  }

  return {
    runOpenClawAction,
  };
}

export {
  buildHealthCandidates,
  openClawActionDefinitions,
};
