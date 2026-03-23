import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { performHealthCheck } from './openclaw-management';

const DEFAULT_CONFIG_TIMEOUT_MS = 30_000;
type LooseRecord = Record<string, any>;
type OpenClawConfigError = Error & {
  statusCode?: number;
  errorCode?: string;
  cause?: unknown;
};
type ConfigFieldDefinition = {
  key: string;
  path: string;
  type: string;
  allowUnset?: boolean;
  restartRequired?: boolean;
  options?: string[];
  meta?: LooseRecord;
};
type CommandSummary = {
  ok: boolean;
  timedOut: boolean;
  exitCode: number | null;
  signal: string;
  stdout: string;
  stderr: string;
  error: string;
  command: {
    bin: string;
    args: string[];
    display: string;
  };
};
type ChangedField = {
  key: string;
  path: string;
  before: unknown;
  after: unknown;
  restartRequired: boolean;
  meta?: LooseRecord;
};
export const MODEL_PRIMARY_PATH = 'agents.defaults.model.primary';
export const AGENT_MODEL_KEY = 'agentModel';
export const GATEWAY_BIND_PATH = 'gateway.bind';
export const CHAT_COMPLETIONS_ENABLED_PATH = 'gateway.http.endpoints.chatCompletions.enabled';

export const openClawConfigFieldDefinitions: ConfigFieldDefinition[] = [
  {
    key: 'modelPrimary',
    path: MODEL_PRIMARY_PATH,
    type: 'string',
    allowUnset: true,
    restartRequired: false,
  },
  {
    key: 'gatewayBind',
    path: GATEWAY_BIND_PATH,
    type: 'enum',
    options: ['loopback', 'tailnet', 'lan', 'auto', 'custom'],
    restartRequired: true,
  },
  {
    key: 'chatCompletionsEnabled',
    path: CHAT_COMPLETIONS_ENABLED_PATH,
    type: 'boolean',
    restartRequired: true,
  },
];

function createOpenClawConfigError(message = '', statusCode = 500, errorCode = '') {
  const error = new Error(message) as OpenClawConfigError;
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function clipOutput(value = '', maxLength = 8_000) {
  const normalized = String(value || '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}

function hashContent(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getValueAtPath(target: LooseRecord | null | undefined, dotPath = '') {
  return String(dotPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, segment) => (current && typeof current === 'object' ? current[segment] : undefined), target);
}

function setValueAtPath(target: LooseRecord, dotPath = '', value: any) {
  const segments = String(dotPath || '').split('.').filter(Boolean);
  if (!segments.length) {
    return;
  }

  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  const finalSegment = segments[segments.length - 1];
  if (finalSegment) {
    cursor[finalSegment] = value;
  }
}

function parseValidationPayload(text = ''): LooseRecord | null {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function createCommandSummary(command: string, args: string[] = [], response: LooseRecord = {}): CommandSummary {
  const exitCode = typeof response?.exitCode === 'number' && Number.isInteger(response.exitCode)
    ? response.exitCode
    : (response?.ok ? 0 : null);
  return {
    ok: Boolean(response?.ok),
    timedOut: Boolean(response?.timedOut),
    exitCode,
    signal: response?.signal || '',
    stdout: clipOutput(response?.stdout || ''),
    stderr: clipOutput(response?.stderr || ''),
    error: response?.error || '',
    command: {
      bin: command,
      args,
      display: [command, ...args].join(' '),
    },
  };
}

function summarizeCommandError(command: string, args: string[] = [], error: LooseRecord) {
  const message = String(error?.message || 'OpenClaw config command failed');
  const timedOut = Boolean(error?.killed) && /timed out/i.test(message);
  const exitCode = typeof error?.code === 'number' && Number.isInteger(error.code) ? error.code : null;

  return createCommandSummary(command, args, {
    ok: false,
    timedOut,
    exitCode,
    signal: error?.signal || '',
    stdout: error?.stdout || '',
    stderr: error?.stderr || '',
    error: message,
  });
}

function normalizeFieldValue(definition: ConfigFieldDefinition | null | undefined, rawValue: any) {
  if (!definition) {
    throw createOpenClawConfigError('Unsupported OpenClaw config field', 400, 'unsupported_field');
  }

  if (definition.type === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    if (rawValue === 'true') {
      return true;
    }
    if (rawValue === 'false') {
      return false;
    }
    throw createOpenClawConfigError(`Expected a boolean value for ${definition.key}`, 400, 'invalid_field_value');
  }

  if (definition.type === 'enum') {
    const normalized = String(rawValue || '').trim();
    if (definition.options?.includes(normalized)) {
      return normalized;
    }
    throw createOpenClawConfigError(`Unsupported option for ${definition.key}`, 400, 'invalid_field_value');
  }

  const normalized = String(rawValue ?? '').trim();
  if (!normalized && definition.allowUnset) {
    return undefined;
  }
  return normalized;
}

function findAgentModelFieldDefinition(configJson: LooseRecord = {}, agentId = ''): ConfigFieldDefinition | null {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) {
    return null;
  }

  const agents = Array.isArray(configJson?.agents?.list) ? configJson.agents.list : [];
  const index = agents.findIndex((agent: LooseRecord) => String(agent?.id || '').trim() === normalizedAgentId);
  if (index < 0) {
    return null;
  }

  return {
    key: AGENT_MODEL_KEY,
    path: `agents.list.${index}.model`,
    type: 'string',
    allowUnset: true,
    restartRequired: false,
    meta: {
      agentId: normalizedAgentId,
    },
  };
}

function buildFieldDefinitions(configJson: LooseRecord = {}, options: LooseRecord = {}): ConfigFieldDefinition[] {
  const definitions = [...openClawConfigFieldDefinitions];
  const agentField = findAgentModelFieldDefinition(configJson, options.agentId);
  if (agentField) {
    definitions.splice(1, 0, agentField);
  }
  return definitions;
}

function buildFieldStateForConfig(configJson: LooseRecord = {}, options: LooseRecord = {}) {
  return buildFieldDefinitions(configJson, options).map((definition) => ({
    key: definition.key,
    path: definition.path,
    type: definition.type,
    options: definition.options || [],
    restartRequired: Boolean(definition.restartRequired),
    allowUnset: Boolean(definition.allowUnset),
    value: getValueAtPath(configJson, definition.path),
    ...(definition.meta ? { meta: definition.meta } : {}),
  }));
}

function collectConfiguredModelOptions(configJson: LooseRecord = {}) {
  const seen = new Set();
  const ordered: string[] = [];

  function addModel(value: any) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  addModel(configJson?.agents?.defaults?.model?.primary);
  Object.keys(configJson?.agents?.defaults?.models || {}).forEach(addModel);
  (Array.isArray(configJson?.agents?.list) ? configJson.agents.list : []).forEach((agent: LooseRecord) => {
    const model = agent?.model?.primary || (typeof agent?.model === 'string' ? agent.model : '');
    addModel(model);
  });

  return ordered;
}

function buildLocalTargetKey(configPath = '') {
  const normalized = String(configPath || '').trim();
  return normalized ? `local:${normalized}` : '';
}

function buildRemoteTargetKey(baseUrl = '') {
  const normalized = String(baseUrl || '').trim();
  return normalized ? `remote:${normalized}` : '';
}

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function ensureFileReadable(filePath = '') {
  const normalized = String(filePath || '').trim();
  if (!normalized) {
    throw createOpenClawConfigError('OpenClaw config file is unavailable', 500, 'config_unavailable');
  }

  try {
    return await fs.readFile(normalized, 'utf8');
  } catch (error) {
    const nextError = createOpenClawConfigError('OpenClaw config file could not be read', 500, 'config_read_failed');
    nextError.cause = error;
    throw nextError;
  }
}

async function readConfigSnapshot(configPath = '') {
  const raw = await ensureFileReadable(configPath);
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const nextError = createOpenClawConfigError('OpenClaw config file is not valid JSON', 500, 'config_parse_failed');
    nextError.cause = error;
    throw nextError;
  }

  return {
    raw,
    parsed,
    hash: hashContent(raw),
  };
}

function buildBackupPath(configPath = '', now = () => Date.now()) {
  const timestamp = new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${configPath}.backup.${timestamp}`;
}

function buildValidationSummary(commandResult: LooseRecord, payload: LooseRecord | null) {
  const valid = Boolean(payload?.valid) && Boolean(commandResult?.ok);
  return {
    ok: valid,
    valid,
    path: payload?.path || '',
    details: payload || null,
    commandResult,
  };
}

function buildGuidance({
  changedFields = [],
  healthCheck = null,
  noChanges = false,
  restartRequested = false,
  rolledBack = false,
  validation = null,
}: {
  changedFields?: ChangedField[];
  healthCheck?: Awaited<ReturnType<typeof performHealthCheck>> | null;
  noChanges?: boolean;
  restartRequested?: boolean;
  rolledBack?: boolean;
  validation?: LooseRecord | null;
} = {}) {
  const guidance = [];

  if (rolledBack) {
    guidance.push('Configuration validation failed, so the backup was restored.');
  }

  if (noChanges) {
    guidance.push('No supported config values changed.');
  }

  if (!validation?.ok) {
    guidance.push('Review the validation details before retrying the config change.');
  }

  if (restartRequested && healthCheck?.status === 'healthy') {
    guidance.push('The gateway restarted and the health check is healthy.');
  }

  const healthStatus = String(healthCheck?.status || '').trim();
  if (restartRequested && ['unreachable', 'unhealthy'].includes(healthStatus)) {
    guidance.push('The config change was written, but the post-restart health check needs attention.');
  }

  if (!restartRequested && changedFields.some((field) => field.restartRequired)) {
    guidance.push('Some changes only take effect after restarting the OpenClaw gateway.');
  }

  return guidance;
}

function buildRemoteCommandSummary(method = '', result: any = null) {
  return {
    ok: true,
    timedOut: false,
    exitCode: 0,
    signal: '',
    stdout: '',
    stderr: '',
    error: '',
    command: {
      bin: 'openclaw',
      args: ['gateway', 'call', method],
      display: `openclaw gateway call ${method}`,
    },
    result,
  };
}

export function createOpenClawConfigService({
  backupStore = null,
  callOpenClawGateway = null,
  config,
  execFileAsync,
  fetchImpl = global.fetch,
  now = () => Date.now(),
  waitImpl = wait,
}: LooseRecord) {
  if (typeof execFileAsync !== 'function') {
    throw new Error('execFileAsync is required');
  }
  const execFile = execFileAsync;
  const runtimeConfig = config && typeof config === 'object' ? config : {};

  const openclawBin = String(runtimeConfig?.openclawBin || 'openclaw').trim() || 'openclaw';
  const configPath = String(runtimeConfig?.localConfigPath || '').trim();
  const remoteTarget = Boolean(runtimeConfig?.remoteOpenClawTarget);
  const localTargetKey = buildLocalTargetKey(configPath);
  const remoteTargetKey = buildRemoteTargetKey(runtimeConfig?.baseUrl || '');

  async function runOpenClawCommand(args: string[] = []) {
    try {
      const response = await execFile(openclawBin, args, {
        timeout: DEFAULT_CONFIG_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
      return createCommandSummary(openclawBin, args, {
        ok: true,
        stdout: response?.stdout || '',
        stderr: response?.stderr || '',
      });
    } catch (error) {
      return summarizeCommandError(openclawBin, args, error as LooseRecord);
    }
  }

  async function validateConfig() {
    const commandResult = await runOpenClawCommand(['config', 'validate', '--json']);
    const payload = parseValidationPayload(commandResult.stdout) || parseValidationPayload(commandResult.stderr);
    return buildValidationSummary(commandResult, payload);
  }

  async function loadRemoteSnapshot() {
    if (typeof callOpenClawGateway !== 'function') {
      throw createOpenClawConfigError('Remote OpenClaw config access is unavailable', 500, 'remote_config_unavailable');
    }

    const result = await callOpenClawGateway('config.get', {}, 15000);
    const payload = result?.result && typeof result.result === 'object' ? result.result : result;
    let parsed = payload?.parsed || payload?.config || payload?.resolved || null;
    if ((!parsed || typeof parsed !== 'object') && typeof payload?.raw === 'string' && payload.raw.trim()) {
      try {
        parsed = JSON.parse(payload.raw);
      } catch {}
    }
    if (!parsed || typeof parsed !== 'object') {
      throw createOpenClawConfigError('Remote OpenClaw config snapshot is unavailable', 500, 'remote_config_unavailable');
    }

    return {
      path: String(payload?.path || runtimeConfig?.baseUrl || '').trim(),
      raw: String(payload?.raw || '').trim(),
      parsed,
      hash: String(payload?.hash || '').trim(),
      valid: payload?.valid !== false,
      issues: Array.isArray(payload?.issues) ? payload.issues : [],
      warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
    };
  }

  function buildRemoteValidation(snapshot: LooseRecord = {}) {
    return {
      ok: Boolean(snapshot?.valid),
      valid: Boolean(snapshot?.valid),
      path: snapshot?.path || '',
      details: {
        issues: Array.isArray(snapshot?.issues) ? snapshot.issues : [],
        warnings: Array.isArray(snapshot?.warnings) ? snapshot.warnings : [],
      },
      commandResult: {
        ok: true,
        timedOut: false,
        exitCode: 0,
        signal: '',
        stdout: '',
        stderr: '',
        error: '',
        command: {
          bin: 'openclaw',
          args: ['gateway', 'call', 'config.get'],
          display: 'openclaw gateway call config.get',
        },
      },
    };
  }

  async function getOpenClawConfigState(options: LooseRecord = {}) {
    if (remoteTarget) {
      const snapshot = await loadRemoteSnapshot();
      const currentAgentId = String(options?.agentId || '').trim();

      return {
        ok: true,
        remoteTarget: true,
        configPath: snapshot.path,
        baseHash: snapshot.hash,
        fields: buildFieldStateForConfig(snapshot.parsed, { agentId: currentAgentId }),
        modelOptions: collectConfiguredModelOptions(snapshot.parsed),
        currentAgentId,
        validation: buildRemoteValidation(snapshot),
      };
    }

    const snapshot = await readConfigSnapshot(configPath);
    const validation = await validateConfig();
    const currentAgentId = String(options?.agentId || '').trim();

    return {
      ok: true,
      configPath,
      baseHash: snapshot.hash,
      fields: buildFieldStateForConfig(snapshot.parsed, { agentId: currentAgentId }),
      modelOptions: collectConfiguredModelOptions(snapshot.parsed),
      currentAgentId,
      validation,
    };
  }

  async function getRemoteOpenClawConfigStateWithRetry(options: LooseRecord = {}, retryOptions: LooseRecord = {}) {
    const attempts = Math.max(1, Number(retryOptions?.attempts) || 6);
    const delayMs = Math.max(0, Number(retryOptions?.delayMs) || 1000);
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await getOpenClawConfigState(options);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts - 1) {
          break;
        }
        await waitImpl(delayMs);
      }
    }

    throw lastError || new Error('Remote OpenClaw config state could not be reloaded');
  }

  async function restoreBackup(backupPath = '', options: LooseRecord = {}) {
    if (!backupPath) {
      return null;
    }

    try {
      await fs.copyFile(backupPath, configPath);
      const restoredState = await getOpenClawConfigState(options);
      return restoredState;
    } catch {
      return null;
    }
  }

  async function applyOpenClawConfigPatch({
    agentId = '',
    baseHash = '',
    remoteAuthorization = null,
    restartGateway = false,
    values = {},
  }: LooseRecord = {}): Promise<Record<string, unknown>> {
    const normalizedBaseHash = String(baseHash || '').trim();
    if (!normalizedBaseHash) {
      throw createOpenClawConfigError('A base hash is required before applying config changes', 400, 'base_hash_required');
    }

    const normalizedAgentId = String(agentId || '').trim();

    if (remoteTarget) {
      const beforeSnapshot = await loadRemoteSnapshot();
      if (beforeSnapshot.hash !== normalizedBaseHash) {
        throw createOpenClawConfigError('OpenClaw config changed since it was loaded', 409, 'config_conflict');
      }

      const fieldDefinitions = buildFieldDefinitions(beforeSnapshot.parsed, { agentId: normalizedAgentId });
      const beforeState = buildFieldStateForConfig(beforeSnapshot.parsed, { agentId: normalizedAgentId });
      const beforeByKey = Object.fromEntries(beforeState.map((field) => [field.key, field]));
      const changedFields = [];

      for (const definition of fieldDefinitions) {
        if (!Object.prototype.hasOwnProperty.call(values || {}, definition.key)) {
          continue;
        }

        const nextValue = normalizeFieldValue(definition, values[definition.key]);
        const previousValue = beforeByKey[definition.key]?.value;

        if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
          continue;
        }

        changedFields.push({
          key: definition.key,
          path: definition.path,
          before: previousValue,
          after: nextValue,
          restartRequired: Boolean(definition.restartRequired),
          ...(definition.meta ? { meta: definition.meta } : {}),
        });
      }

      if (!changedFields.length) {
        const currentState = await getOpenClawConfigState({ agentId: normalizedAgentId });
        return {
          ok: Boolean(currentState.validation?.ok),
          noChanges: true,
          rolledBack: false,
          remoteTarget: true,
          configPath: beforeSnapshot.path,
          backupPath: '',
          backupReference: null,
          changedFields: [],
          commandResults: [],
          restartRequested: true,
          restartResult: null,
          healthCheck: null,
          guidance: [
            'No supported config values changed.',
            'Remote config patches always use the gateway restart flow when a write is needed.',
          ],
          state: currentState,
          validation: currentState.validation,
        };
      }

      const patchObject = {};
      changedFields.forEach((field) => {
        setValueAtPath(patchObject, field.path, typeof field.after === 'undefined' ? null : field.after);
      });

      const backupReference = backupStore?.save({
        scope: 'config',
        target: 'remote',
        targetKey: remoteTargetKey,
        createdAt: now(),
        label: `remote-config-${new Date(now()).toISOString()}`,
        summary: 'Remote OpenClaw config snapshot captured before config.patch.',
        hash: beforeSnapshot.hash,
        raw: beforeSnapshot.raw || JSON.stringify(beforeSnapshot.parsed, null, 2),
      }) || null;

      let rpcResult;
      try {
        rpcResult = await callOpenClawGateway('config.patch', {
          raw: JSON.stringify(patchObject, null, 2),
          baseHash: beforeSnapshot.hash,
          note: String(remoteAuthorization?.note || 'LalaClaw remote config patch').trim(),
          restartDelayMs: 2000,
        }, 20000);
      } catch (error) {
        const nextCause = error as OpenClawConfigError;
        const nextError = createOpenClawConfigError(
          nextCause?.message || 'Remote OpenClaw config patch failed',
          Number.isInteger(nextCause?.statusCode) ? nextCause.statusCode : 500,
          nextCause?.errorCode || 'remote_config_patch_failed',
        );
        throw nextError;
      }

      const healthCheck = await performHealthCheck(config, { fetchImpl });
      const currentState = await getRemoteOpenClawConfigStateWithRetry(
        { agentId: normalizedAgentId },
        { attempts: 8, delayMs: 1000 },
      );
      const ok = Boolean(currentState.validation?.ok) && ['healthy', 'unknown'].includes(healthCheck?.status || 'unknown');

      return {
        ok,
        noChanges: false,
        rolledBack: false,
        remoteTarget: true,
        configPath: beforeSnapshot.path,
        backupPath: '',
        backupReference,
        changedFields,
        commandResults: [buildRemoteCommandSummary('config.patch', rpcResult)],
        restartRequested: true,
        restartResult: {
          ok: true,
          command: { display: 'openclaw gateway call config.patch' },
          result: rpcResult,
        },
        healthCheck,
        guidance: [
          `Remote config patch applied to ${changedFields.length} field(s).`,
          backupReference ? `A pre-change remote snapshot was stored as ${backupReference.label}.` : '',
          healthCheck?.status === 'healthy'
            ? 'The remote gateway health check recovered after the config patch.'
            : 'The remote write completed, but the follow-up health check still needs attention.',
        ].filter(Boolean),
        validation: currentState.validation,
        state: currentState,
      };
    }

    const beforeSnapshot = await readConfigSnapshot(configPath);
    if (beforeSnapshot.hash !== normalizedBaseHash) {
      throw createOpenClawConfigError('OpenClaw config changed since it was loaded', 409, 'config_conflict');
    }
    const fieldDefinitions = buildFieldDefinitions(beforeSnapshot.parsed, { agentId: normalizedAgentId });
    const beforeState = buildFieldStateForConfig(beforeSnapshot.parsed, { agentId: normalizedAgentId });
    const beforeByKey = Object.fromEntries(beforeState.map((field) => [field.key, field]));
    const changedFields = [];

    for (const definition of fieldDefinitions) {
      if (!Object.prototype.hasOwnProperty.call(values || {}, definition.key)) {
        continue;
      }

      const nextValue = normalizeFieldValue(definition, values[definition.key]);
      const previousValue = beforeByKey[definition.key]?.value;

      if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
        continue;
      }

      changedFields.push({
        key: definition.key,
        path: definition.path,
        before: previousValue,
        after: nextValue,
        restartRequired: Boolean(definition.restartRequired),
        ...(definition.meta ? { meta: definition.meta } : {}),
      });
    }

    if (!changedFields.length) {
      const currentState = await getOpenClawConfigState({ agentId: normalizedAgentId });
      const healthCheck = restartGateway ? await performHealthCheck(config, { fetchImpl }) : null;
      return {
        ok: Boolean(currentState.validation?.ok),
        noChanges: true,
        rolledBack: false,
        configPath,
        backupPath: '',
        changedFields: [],
        commandResults: [],
        restartRequested: Boolean(restartGateway),
        restartResult: null,
        healthCheck,
        guidance: buildGuidance({
          noChanges: true,
          restartRequested: Boolean(restartGateway),
          healthCheck,
          validation: currentState.validation,
        }),
        state: currentState,
      };
    }

    const backupPath = buildBackupPath(configPath, now);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(configPath, backupPath);
    const backupReference = backupStore?.save({
      scope: 'config',
      target: 'local',
      targetKey: localTargetKey,
      createdAt: now(),
      label: `local-config-${new Date(now()).toISOString()}`,
      summary: 'Local OpenClaw config snapshot captured before config changes.',
      hash: beforeSnapshot.hash,
      backupPath,
    }) || null;

    const commandResults = [];
    for (const field of changedFields) {
      const args = typeof field.after === 'undefined'
        ? ['config', 'unset', field.path]
        : ['config', 'set', field.path, JSON.stringify(field.after), '--strict-json'];
      const commandResult = await runOpenClawCommand(args);
      commandResults.push(commandResult);

      if (!commandResult.ok) {
        const restoredState = await restoreBackup(backupPath, { agentId: normalizedAgentId });
        return {
          ok: false,
          noChanges: false,
          rolledBack: true,
          configPath,
          backupPath,
          backupReference,
          changedFields,
          commandResults,
          restartRequested: Boolean(restartGateway),
          restartResult: null,
          healthCheck: null,
          guidance: buildGuidance({
            changedFields,
            rolledBack: true,
            restartRequested: Boolean(restartGateway),
            validation: { ok: false },
          }),
          state: restoredState || await getOpenClawConfigState({ agentId: normalizedAgentId }),
        };
      }
    }

    const validation = await validateConfig();
    if (!validation.ok) {
      const restoredState = await restoreBackup(backupPath, { agentId: normalizedAgentId });
      return {
        ok: false,
        noChanges: false,
        rolledBack: true,
        configPath,
        backupPath,
        backupReference,
        changedFields,
        commandResults,
        restartRequested: Boolean(restartGateway),
        restartResult: null,
        healthCheck: null,
        guidance: buildGuidance({
          changedFields,
          rolledBack: true,
          restartRequested: Boolean(restartGateway),
          validation,
        }),
        validation,
        state: restoredState || await getOpenClawConfigState({ agentId: normalizedAgentId }),
      };
    }

    let restartResult = null;
    let healthCheck = null;
    if (restartGateway) {
      restartResult = await runOpenClawCommand(['gateway', 'restart']);
      healthCheck = await performHealthCheck(config, { fetchImpl });
    }

    const currentState = await getOpenClawConfigState({ agentId: normalizedAgentId });
    const ok = Boolean(currentState.validation?.ok)
      && (!restartGateway || (Boolean(restartResult?.ok) && healthCheck?.status === 'healthy'));

    return {
      ok,
      noChanges: false,
      rolledBack: false,
      configPath,
      backupPath,
      backupReference,
      changedFields,
      commandResults,
      restartRequested: Boolean(restartGateway),
      restartResult,
      healthCheck,
      guidance: buildGuidance({
        changedFields,
        restartRequested: Boolean(restartGateway),
        healthCheck,
        validation: currentState.validation,
      }),
      validation: currentState.validation,
      state: currentState,
    };
  }

  async function restoreOpenClawConfigBackup({
    agentId = '',
    backupId = '',
    remoteAuthorization = null,
  }: LooseRecord = {}): Promise<Record<string, unknown>> {
    const normalizedBackupId = String(backupId || '').trim();
    if (!normalizedBackupId) {
      throw createOpenClawConfigError(remoteTarget ? 'A remote rollback point is required' : 'A local rollback point is required', 400, 'backup_id_required');
    }

    const backupEntry = backupStore?.get(normalizedBackupId);
    if (!backupEntry) {
      throw createOpenClawConfigError(`The requested ${remoteTarget ? 'remote' : 'local'} rollback point could not be found`, 404, 'backup_not_found');
    }

    const normalizedAgentId = String(agentId || '').trim();
    const expectedTargetKey = remoteTarget ? remoteTargetKey : localTargetKey;
    if (String(backupEntry.target || '').trim() !== (remoteTarget ? 'remote' : 'local')) {
      throw createOpenClawConfigError('The requested rollback point belongs to a different OpenClaw target', 409, 'backup_target_mismatch');
    }
    if (expectedTargetKey && (!backupEntry.targetKey || backupEntry.targetKey !== expectedTargetKey)) {
      throw createOpenClawConfigError('The requested rollback point belongs to a different OpenClaw target', 409, 'backup_target_mismatch');
    }

    if (!remoteTarget) {
      if (!backupEntry.backupPath && !backupEntry.raw) {
        throw createOpenClawConfigError('The requested local rollback point could not be restored', 404, 'backup_not_found');
      }

      try {
        if (backupEntry.backupPath) {
          await fs.copyFile(backupEntry.backupPath, configPath);
        } else {
          await fs.writeFile(configPath, backupEntry.raw, 'utf8');
        }
      } catch (error) {
        const nextCause = error as OpenClawConfigError;
        const nextError = createOpenClawConfigError(
          nextCause?.message || 'Local OpenClaw config rollback failed',
          Number.isInteger(nextCause?.statusCode) ? nextCause.statusCode : 500,
          nextCause?.errorCode || 'local_config_rollback_failed',
        );
        throw nextError;
      }

      const validation = await validateConfig();
      const restartResult = await runOpenClawCommand(['gateway', 'restart']);
      const healthCheck = await performHealthCheck(config, { fetchImpl });
      const currentState = await getOpenClawConfigState({ agentId: normalizedAgentId });
      const ok = Boolean(currentState.validation?.ok)
        && Boolean(restartResult?.ok)
        && ['healthy', 'unknown'].includes(healthCheck?.status || 'unknown');

      return {
        ok,
        noChanges: false,
        rolledBack: true,
        configPath,
        backupPath: backupEntry.backupPath || '',
        backupReference: {
          id: backupEntry.id,
          label: backupEntry.label,
        },
        changedFields: [],
        commandResults: restartResult ? [restartResult] : [],
        restartRequested: true,
        restartResult,
        healthCheck,
        guidance: [
          `Local config rollback restored the snapshot saved as ${backupEntry.label}.`,
          validation?.ok
            ? 'The restored config validates successfully.'
            : 'The restored config still needs validation attention.',
          healthCheck?.status === 'healthy'
            ? 'The local gateway health check recovered after the rollback.'
            : 'The rollback completed, but the post-restart health check still needs attention.',
        ].filter(Boolean),
        validation: currentState.validation,
        state: currentState,
      };
    }

    if (!backupEntry?.raw) {
      throw createOpenClawConfigError('The requested remote rollback point could not be found', 404, 'backup_not_found');
    }

    const currentSnapshot = await loadRemoteSnapshot();

    let rpcResult;
      try {
        rpcResult = await callOpenClawGateway('config.apply', {
          raw: backupEntry.raw,
          baseHash: currentSnapshot.hash,
          note: String(remoteAuthorization?.note || `Restore remote config from ${backupEntry.label}`).trim(),
          restartDelayMs: 2000,
        }, 20000);
    } catch (error) {
      const nextCause = error as OpenClawConfigError;
      const nextError = createOpenClawConfigError(
        nextCause?.message || 'Remote OpenClaw config rollback failed',
        Number.isInteger(nextCause?.statusCode) ? nextCause.statusCode : 500,
        nextCause?.errorCode || 'remote_config_rollback_failed',
      );
      throw nextError;
    }

    const healthCheck = await performHealthCheck(config, { fetchImpl });
    const currentState = await getRemoteOpenClawConfigStateWithRetry(
      { agentId: normalizedAgentId },
      { attempts: 8, delayMs: 1000 },
    );
    const ok = Boolean(currentState.validation?.ok) && ['healthy', 'unknown'].includes(healthCheck?.status || 'unknown');

    return {
      ok,
      noChanges: false,
      rolledBack: true,
      remoteTarget: true,
      configPath: currentSnapshot.path,
      backupPath: '',
      backupReference: {
        id: backupEntry.id,
        label: backupEntry.label,
      },
      changedFields: [],
      commandResults: [buildRemoteCommandSummary('config.apply', rpcResult)],
      restartRequested: true,
      restartResult: {
        ok: true,
        command: { display: 'openclaw gateway call config.apply' },
        result: rpcResult,
      },
      healthCheck,
      guidance: [
        `Remote config rollback restored the snapshot saved as ${backupEntry.label}.`,
        healthCheck?.status === 'healthy'
          ? 'The remote gateway health check recovered after the rollback.'
          : 'The rollback completed, but the follow-up health check still needs attention.',
      ].filter(Boolean),
      validation: currentState.validation,
      state: currentState,
    };
  }

  return {
    getOpenClawConfigState,
    applyOpenClawConfigPatch,
    restoreOpenClawConfigBackup,
    restoreRemoteOpenClawConfigBackup: restoreOpenClawConfigBackup,
  };
}
