import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isRemoteOpenClawTarget } from '../services/openclaw-operations';

type LooseRecord = Record<string, any>;

type SkillOption = {
  name: string;
  ownerAgentId: string;
};

export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number(process.env.PORT || 3000);
export const HERMES_DEFAULT_MODEL = String(process.env.HERMES_DEFAULT_MODEL || 'gpt-5.4').trim() || 'gpt-5.4';
const projectRootCandidate = path.resolve(__dirname, '..', '..');
export const PROJECT_ROOT = path.basename(projectRootCandidate) === '.server-build'
  ? path.dirname(projectRootCandidate)
  : projectRootCandidate;
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
export const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const HOME_DIR = process.env.HOME || '';
const LOCAL_OPENCLAW_CONFIG = path.join(HOME_DIR, '.openclaw', 'openclaw.json');
export const LOCAL_OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');
const NPM_GLOBAL_DIR = path.join(HOME_DIR, '.npm-global');

function resolveOpenClawBin(): string {
  const explicitBin = String(process.env.OPENCLAW_BIN || '').trim();
  if (explicitBin) {
    return explicitBin;
  }

  const candidateBins = [
    path.join(NPM_GLOBAL_DIR, 'bin', 'openclaw'),
    path.join(NPM_GLOBAL_DIR, 'lib', 'node_modules', 'openclaw', 'openclaw.mjs'),
  ];

  const matchedCandidate = candidateBins.find((candidatePath) => fileExists(candidatePath));
  return matchedCandidate || 'openclaw';
}

export const OPENCLAW_BIN = resolveOpenClawBin();

function resolveDefaultConfigDir(): string {
  const explicitConfigDir = String(process.env.LALACLAW_CONFIG_DIR || '').trim();
  if (explicitConfigDir) {
    return path.resolve(explicitConfigDir);
  }

  if (process.platform === 'win32') {
    const appDataDir = String(process.env.APPDATA || '').trim();
    if (appDataDir) {
      return path.join(appDataDir, 'LalaClaw');
    }
  }

  if (HOME_DIR) {
    return path.join(HOME_DIR, '.config', 'lalaclaw');
  }

  return path.join(os.tmpdir(), 'lalaclaw');
}

function resolveServerConfigFile(): string {
  const explicitConfigFile = String(process.env.LALACLAW_CONFIG_FILE || '').trim();
  if (explicitConfigFile) {
    return path.resolve(explicitConfigFile);
  }

  return path.join(resolveDefaultConfigDir(), '.env.local');
}

export function resolveLalaclawStateDir(): string {
  return resolveDefaultConfigDir();
}

export function readJsonIfExists(filePath: string): LooseRecord | null {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function readTextIfExists(filePath: string): string {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return '';
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveDefaultAgentId(localConfig: LooseRecord | null): string {
  const defaultAgent = localConfig?.agents?.list?.find((agent: LooseRecord) => agent?.default);
  return process.env.OPENCLAW_AGENT_ID || defaultAgent?.id || 'main';
}

function getConfiguredModelEntries(localConfig: LooseRecord | null = null): Array<[string, LooseRecord]> {
  const models = localConfig?.agents?.defaults?.models;
  if (!models || typeof models !== 'object') {
    return [];
  }

  return Object.entries(models).reduce<Array<[string, LooseRecord]>>((entries, [modelId, meta]) => {
    const normalizedModelId = String(modelId || '').trim();
    if (!normalizedModelId || !meta || typeof meta !== 'object') {
      return entries;
    }

    entries.push([normalizedModelId, meta as LooseRecord]);
    return entries;
  }, []);
}

function getOpenClawBackupStorePath(): string {
  return path.join(resolveDefaultConfigDir(), 'openclaw-backups.json');
}

function readLatestBackedUpOpenClawConfig(): LooseRecord | null {
  const entries = readJsonIfExists(getOpenClawBackupStorePath());
  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }

  const latestConfigBackup = [...entries]
    .filter((entry: LooseRecord) => String(entry?.scope || '').trim() === 'config')
    .sort((left: LooseRecord, right: LooseRecord) => Number(right?.createdAt || 0) - Number(left?.createdAt || 0))
    .find((entry: LooseRecord) => String(entry?.raw || '').trim());

  if (!latestConfigBackup?.raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(latestConfigBackup.raw || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function resolveModelConfigSource(localConfig: LooseRecord | null = null): LooseRecord | null {
  if (getConfiguredModelEntries(localConfig).length) {
    return localConfig;
  }

  const backupConfig = readLatestBackedUpOpenClawConfig();
  if (!backupConfig) {
    return localConfig;
  }

  return {
    ...backupConfig,
    ...localConfig,
    agents: {
      ...(backupConfig?.agents || {}),
      ...(localConfig?.agents || {}),
      defaults: {
        ...(backupConfig?.agents?.defaults || {}),
        ...(localConfig?.agents?.defaults || {}),
        models: localConfig?.agents?.defaults?.models || backupConfig?.agents?.defaults?.models || {},
      },
      list: Array.isArray(localConfig?.agents?.list) && localConfig.agents.list.length
        ? localConfig.agents.list
        : (Array.isArray(backupConfig?.agents?.list) ? backupConfig.agents.list : []),
    },
  };
}

export function resolveCanonicalModelId(value = '', localConfig: LooseRecord | null = null): string {
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

  const aliasMatch = configuredModels.find(([, meta]) => String((meta as any)?.alias || '').trim().toLowerCase() === normalizedRequestedModel);
  if (aliasMatch) {
    return aliasMatch[0];
  }

  const suffixMatches = configuredModels.filter(([modelId]) => modelId.toLowerCase().endsWith(`/${normalizedRequestedModel}`));
  if (suffixMatches.length === 1) {
    return suffixMatches[0]?.[0] || requestedModel;
  }

  return requestedModel;
}

export function resolveAgentModel(agent: LooseRecord | null, localConfig: LooseRecord | null = null): string {
  const primary = agent?.model?.primary || (typeof agent?.model === 'string' ? agent.model : '');
  return resolveCanonicalModelId(primary, localConfig);
}

export function collectAvailableModels(
  localConfig: LooseRecord | null,
  preferred: string[] = [],
  _options: { agentId?: string } = {},
): string[] {
  const effectiveLocalConfig = resolveModelConfigSource(localConfig);
  const seen = new Set();
  const ordered: string[] = [];
  const configuredModels = getConfiguredModelEntries(effectiveLocalConfig);

  function addModel(value: string) {
    const model = resolveCanonicalModelId(value, effectiveLocalConfig);
    if (!model || seen.has(model)) {
      return;
    }
    seen.add(model);
    ordered.push(model);
  }

  preferred.forEach(addModel);
  addModel(effectiveLocalConfig?.agents?.defaults?.model?.primary);
  configuredModels.forEach(([modelId]) => addModel(modelId));
  (effectiveLocalConfig?.agents?.list || []).forEach((agent: LooseRecord) => addModel(resolveAgentModel(agent, effectiveLocalConfig)));
  return ordered;
}

function collectLocallyInstalledAgentIds(): string[] {
  const candidates: Array<{ id: string; paths: string[] }> = [
    {
      id: 'hermes',
      paths: [
        String(process.env.HERMES_BIN || '').trim(),
        path.join(HOME_DIR, '.local', 'bin', 'hermes'),
        path.join(HOME_DIR, '.hermes', 'hermes-agent', 'hermes'),
      ].filter(Boolean),
    },
  ];

  return candidates
    .filter((entry) => entry.paths.some((candidatePath) => fileExists(candidatePath)))
    .map((entry) => entry.id);
}

export function collectAvailableAgents(
  localConfig: LooseRecord | null,
  preferred: string[] = [],
  options: { includeLocallyInstalledAgents?: boolean } = {},
): string[] {
  const seen = new Set();
  const ordered: string[] = [];

  function addAgent(value: string) {
    const agentId = String(value || '').trim();
    if (!agentId || seen.has(agentId)) {
      return;
    }
    seen.add(agentId);
    ordered.push(agentId);
  }

  preferred.forEach(addAgent);
  (localConfig?.agents?.list || []).forEach((agent: LooseRecord) => addAgent(agent?.id));
  if (options.includeLocallyInstalledAgents) {
    collectLocallyInstalledAgentIds().forEach(addAgent);
  }
  return ordered;
}

export function collectAvailableSkills(localConfig: LooseRecord | null, agentId: string): SkillOption[] {
  const configuredAgents = Array.isArray(localConfig?.agents?.list) ? localConfig.agents.list : [];
  const currentAgent = configuredAgents.find((agent: LooseRecord) => String(agent?.id || '').trim() === String(agentId || '').trim());
  if (!currentAgent) {
    return [];
  }

  const allowedAgentIds = [
    String(currentAgent.id || '').trim(),
    ...(Array.isArray(currentAgent?.subagents?.allowAgents) ? currentAgent.subagents.allowAgents : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const allowedAgents = allowedAgentIds
    .map((allowedId) => configuredAgents.find((agent: LooseRecord) => String(agent?.id || '').trim() === allowedId))
    .filter(Boolean);
  const seen = new Set();
  const ordered: SkillOption[] = [];

  function addSkill(name: string, ownerAgentId = '') {
    const normalizedName = String(name || '').trim();
    if (!normalizedName || seen.has(normalizedName)) {
      return;
    }

    seen.add(normalizedName);
    ordered.push({
      name: normalizedName,
      ownerAgentId: String(ownerAgentId || '').trim(),
    });
  }

  allowedAgents.forEach((agent: LooseRecord) => {
    const ownerAgentId = String(agent?.id || '').trim();
    const skills = Array.isArray(agent?.skills) ? agent.skills : [];
    skills.forEach((value: string) => {
      addSkill(value, ownerAgentId);
    });
  });

  const workspaceRoot = localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');
  const skillDirectories = [
    path.join(workspaceRoot, 'skills'),
    path.join(LOCAL_OPENCLAW_DIR, 'skills'),
    path.join(NPM_GLOBAL_DIR, 'lib', 'node_modules', 'openclaw', 'skills'),
  ];

  skillDirectories.forEach((directoryPath) => {
    try {
      if (!directoryPath || !fs.existsSync(directoryPath)) {
        return;
      }

      fs.readdirSync(directoryPath, { withFileTypes: true })
        .filter((entry) => entry?.isDirectory?.())
        .forEach((entry) => {
          const skillPath = path.join(directoryPath, entry.name, 'SKILL.md');
          if (fs.existsSync(skillPath)) {
            addSkill(entry.name);
          }
        });
    } catch {}
  });

  const skillLockFiles = [
    path.join(workspaceRoot, 'skills-lock.json'),
    path.join(workspaceRoot, '.clawhub', 'lock.json'),
  ];

  skillLockFiles.forEach((filePath) => {
    const payload = readJsonIfExists(filePath);
    Object.keys(payload?.skills || {}).forEach((name) => addSkill(name));
  });

  return ordered;
}

export function collectAllowedSubagents(localConfig: LooseRecord | null, agentId: string): string[] {
  const configuredAgents = Array.isArray(localConfig?.agents?.list) ? localConfig.agents.list : [];
  const configuredAgentIds = new Set(
    configuredAgents
      .map((agent: LooseRecord) => String(agent?.id || '').trim())
      .filter(Boolean),
  );
  const currentAgent = configuredAgents.find((agent: LooseRecord) => String(agent?.id || '').trim() === String(agentId || '').trim());
  const allowAgents = Array.isArray(currentAgent?.subagents?.allowAgents) ? currentAgent.subagents.allowAgents : [];
  const seen = new Set();
  const ordered: string[] = [];

  allowAgents.forEach((value: string) => {
    const nextAgentId = String(value || '').trim();
    if (!nextAgentId || seen.has(nextAgentId) || !configuredAgentIds.has(nextAgentId)) {
      return;
    }
    seen.add(nextAgentId);
    ordered.push(nextAgentId);
  });

  return ordered;
}

export function buildRuntimeConfig() {
  const localConfig = readJsonIfExists(LOCAL_OPENCLAW_CONFIG);
  const stateDir = resolveLalaclawStateDir();
  const forceMockMode = ['1', 'true', 'yes', 'on'].includes(String(process.env.COMMANDCENTER_FORCE_MOCK || '').trim().toLowerCase());
  const localGatewayPort = Number(localConfig?.gateway?.port || 18789);
  const localToken = localConfig?.gateway?.auth?.token || '';
  const localAgentId = resolveDefaultAgentId(localConfig);
  const envBaseUrl = process.env.OPENCLAW_BASE_URL || '';
  const envModel = resolveCanonicalModelId(process.env.OPENCLAW_MODEL || '', localConfig);
  const envAgentId = process.env.OPENCLAW_AGENT_ID || '';
  const detectedBaseUrl = envBaseUrl || (localToken ? `http://127.0.0.1:${localGatewayPort}` : '');
  const baseUrl = forceMockMode ? '' : detectedBaseUrl;
  const agentId = envAgentId || localAgentId;
  const defaultModel = resolveCanonicalModelId(
    localConfig?.agents?.defaults?.model?.primary || resolveAgentModel(localConfig?.agents?.list?.find((agent: LooseRecord) => agent?.id === agentId), localConfig),
    localConfig,
  );
  const workspaceRoot = localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');
  const availableModels = collectAvailableModels(localConfig, [envModel]);
  const availableAgents = collectAvailableAgents(localConfig, [agentId], { includeLocallyInstalledAgents: true });
  const availableSkills = collectAvailableSkills(localConfig, agentId);

  const runtimeConfig = {
    mode: baseUrl ? 'openclaw' : 'mock',
    model: envModel || defaultModel || 'openclaw',
    agentId,
    baseUrl,
    apiKey: process.env.OPENCLAW_API_KEY || localToken,
    apiStyle: process.env.OPENCLAW_API_STYLE || 'chat',
    apiPath: process.env.OPENCLAW_API_PATH || '/v1/chat/completions',
    localDetected: !forceMockMode && Boolean(localToken),
    forceMockMode,
    localConfig,
    localConfigPath: LOCAL_OPENCLAW_CONFIG,
    openclawDir: LOCAL_OPENCLAW_DIR,
    openclawBin: OPENCLAW_BIN,
    gatewayPort: localGatewayPort,
    browserControlPort: localGatewayPort + 2,
    healthPort: localGatewayPort + 3,
    workspaceRoot,
    logsDir: path.join(LOCAL_OPENCLAW_DIR, 'logs'),
    availableModels,
    availableAgents,
    availableSkills,
    accessMode: process.env.COMMANDCENTER_ACCESS_MODE || 'off',
    accessTokensRaw: process.env.COMMANDCENTER_ACCESS_TOKENS || '',
    accessTokensFile: process.env.COMMANDCENTER_ACCESS_TOKENS_FILE || '',
    accessCookieName: process.env.COMMANDCENTER_ACCESS_COOKIE_NAME || '',
    accessSessionTtlMs: Number(process.env.COMMANDCENTER_ACCESS_SESSION_TTL_MS || 0),
    accessConfigFile: resolveServerConfigFile(),
    remoteOpenClawTarget: false,
    stateDir,
  };

  runtimeConfig.remoteOpenClawTarget = isRemoteOpenClawTarget(runtimeConfig);

  return runtimeConfig;
}
