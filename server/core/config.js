const fs = require('node:fs');
const path = require('node:path');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const HOME_DIR = process.env.HOME || '';
const LOCAL_OPENCLAW_CONFIG = path.join(HOME_DIR, '.openclaw', 'openclaw.json');
const LOCAL_OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

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

function getConfiguredModelEntries(localConfig = null) {
  return Object.entries(localConfig?.agents?.defaults?.models || {}).filter(([modelId]) => String(modelId || '').trim());
}

function resolveCanonicalModelId(value = '', localConfig = null) {
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

function resolveAgentModel(agent, localConfig = null) {
  const primary = agent?.model?.primary || (typeof agent?.model === 'string' ? agent.model : '');
  return resolveCanonicalModelId(primary, localConfig);
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

function collectAvailableSkills(localConfig, agentId) {
  const configuredAgents = Array.isArray(localConfig?.agents?.list) ? localConfig.agents.list : [];
  const currentAgent = configuredAgents.find((agent) => String(agent?.id || '').trim() === String(agentId || '').trim());
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
    .map((allowedId) => configuredAgents.find((agent) => String(agent?.id || '').trim() === allowedId))
    .filter(Boolean);
  const seen = new Set();
  const ordered = [];

  allowedAgents.forEach((agent) => {
    const ownerAgentId = String(agent?.id || '').trim();
    const skills = Array.isArray(agent?.skills) ? agent.skills : [];
    skills.forEach((value) => {
      const name = String(value || '').trim();
      if (!name || seen.has(name)) {
        return;
      }
      seen.add(name);
      ordered.push({
        name,
        ownerAgentId,
      });
    });
  });

  return ordered;
}

function collectAllowedSubagents(localConfig, agentId) {
  const configuredAgents = Array.isArray(localConfig?.agents?.list) ? localConfig.agents.list : [];
  const configuredAgentIds = new Set(
    configuredAgents
      .map((agent) => String(agent?.id || '').trim())
      .filter(Boolean),
  );
  const currentAgent = configuredAgents.find((agent) => String(agent?.id || '').trim() === String(agentId || '').trim());
  const allowAgents = Array.isArray(currentAgent?.subagents?.allowAgents) ? currentAgent.subagents.allowAgents : [];
  const seen = new Set();
  const ordered = [];

  allowAgents.forEach((value) => {
    const nextAgentId = String(value || '').trim();
    if (!nextAgentId || seen.has(nextAgentId) || !configuredAgentIds.has(nextAgentId)) {
      return;
    }
    seen.add(nextAgentId);
    ordered.push(nextAgentId);
  });

  return ordered;
}

function buildRuntimeConfig() {
  const localConfig = readJsonIfExists(LOCAL_OPENCLAW_CONFIG);
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
    localConfig?.agents?.defaults?.model?.primary || resolveAgentModel(localConfig?.agents?.list?.find((agent) => agent?.id === agentId), localConfig),
    localConfig,
  );
  const workspaceRoot = localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');
  const availableModels = collectAvailableModels(localConfig, [envModel]);
  const availableAgents = collectAvailableAgents(localConfig, [agentId]);
  const availableSkills = collectAvailableSkills(localConfig, agentId);

  return {
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
    gatewayPort: localGatewayPort,
    browserControlPort: localGatewayPort + 2,
    healthPort: localGatewayPort + 3,
    workspaceRoot,
    logsDir: path.join(LOCAL_OPENCLAW_DIR, 'logs'),
    availableModels,
    availableAgents,
    availableSkills,
  };
}

module.exports = {
  HOST,
  PORT,
  PROJECT_ROOT,
  PUBLIC_DIR,
  DIST_DIR,
  LOCAL_OPENCLAW_DIR,
  OPENCLAW_BIN,
  buildRuntimeConfig,
  collectAvailableAgents,
  collectAvailableSkills,
  collectAllowedSubagents,
  collectAvailableModels,
  fileExists,
  readJsonIfExists,
  readTextIfExists,
  resolveAgentModel,
  resolveCanonicalModelId,
};
