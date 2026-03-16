#!/usr/bin/env node

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const { spawn, spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_FRONTEND_PORT = '5173';
const DEFAULT_BACKEND_PORT = '3000';
const DEFAULT_MODEL = 'openclaw';
const DEFAULT_AGENT_ID = 'main';
const REQUIRED_NODE_MAJOR = 22;
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const EXAMPLE_ENV_FILE = path.join(PROJECT_ROOT, '.env.local.example');
const OPTION_ALIASES = {
  '--config-file': 'configFile',
  '--profile': 'profile',
  '--host': 'host',
  '--port': 'backendPort',
  '--frontend-host': 'frontendHost',
  '--frontend-port': 'frontendPort',
  '--base-url': 'openclawBaseUrl',
  '--api-key': 'openclawApiKey',
  '--model': 'openclawModel',
  '--agent-id': 'openclawAgentId',
  '--api-style': 'openclawApiStyle',
  '--api-path': 'openclawApiPath',
};

function printHelp() {
  console.log(`LalaClaw CLI

Usage:
  lalaclaw init [--defaults] [--write-example] [--config-file <path>] [--profile <name>] [--base-url <url>]
  lalaclaw doctor [--config-file <path>] [--json]
  lalaclaw dev [--config-file <path>]
  lalaclaw start [--config-file <path>]
  lalaclaw frontend [--config-file <path>]
  lalaclaw backend [--config-file <path>]

Commands:
  init      Create a local config file for LalaClaw development.
  doctor    Check Node.js, OpenClaw discovery, ports, and local config.
  dev       Start both frontend and backend in development mode.
  start     Start the built backend server after checking dist/.
  frontend  Start only the Vite frontend server.
  backend   Start only the backend server.
`);
}

function parseArgs(argv) {
  const args = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args.push(token);
      continue;
    }

    if (token === '--defaults') {
      options.defaults = true;
      continue;
    }

    if (token === '--write-example') {
      options.writeExample = true;
      continue;
    }

    if (token === '--json') {
      options.json = true;
      continue;
    }

    if (token in OPTION_ALIASES) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${token} requires a value`);
      }
      const key = OPTION_ALIASES[token];
      options[key] = key === 'configFile' ? path.resolve(process.cwd(), value) : value;
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return {
    command: args[0] || 'help',
    options,
  };
}

function readEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isValidPort(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 65535;
}

function normalizeApiStyle(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'chat';
}

function normalizeProfile(value = '') {
  return String(value || '').trim().toLowerCase();
}

function clipText(value, length = 200) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function readExampleEnvTemplate() {
  return fs.readFileSync(EXAMPLE_ENV_FILE, 'utf8');
}

function detectLocalOpenClaw() {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');

  if (!fs.existsSync(configPath)) {
    return {
      exists: false,
      path: configPath,
      config: null,
      token: '',
      gatewayPort: 18789,
      workspaceRoot: path.join(os.homedir(), '.openclaw', 'workspace'),
      defaultAgentId: DEFAULT_AGENT_ID,
      defaultModel: DEFAULT_MODEL,
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const defaultAgent = Array.isArray(config?.agents?.list)
      ? config.agents.list.find((agent) => agent?.default) || config.agents.list[0]
      : null;

    return {
      exists: true,
      path: configPath,
      config,
      token: config?.gateway?.auth?.token || '',
      gatewayPort: Number(config?.gateway?.port || 18789),
      workspaceRoot: config?.agents?.defaults?.workspace || path.join(os.homedir(), '.openclaw', 'workspace'),
      defaultAgentId: defaultAgent?.id || DEFAULT_AGENT_ID,
      defaultModel: defaultAgent?.model?.primary || config?.agents?.defaults?.model?.primary || DEFAULT_MODEL,
    };
  } catch (error) {
    return {
      exists: true,
      path: configPath,
      parseError: error,
      config: null,
      token: '',
      gatewayPort: 18789,
      workspaceRoot: path.join(os.homedir(), '.openclaw', 'workspace'),
      defaultAgentId: DEFAULT_AGENT_ID,
      defaultModel: DEFAULT_MODEL,
    };
  }
}

function resolveRuntimeProfile(envValues, localOpenClaw) {
  if (String(envValues.OPENCLAW_BASE_URL || '').trim()) {
    return 'remote-gateway';
  }
  if (truthy(envValues.COMMANDCENTER_FORCE_MOCK)) {
    return 'mock';
  }
  if (localOpenClaw.exists && localOpenClaw.token && !localOpenClaw.parseError) {
    return 'local-openclaw';
  }
  return 'mock';
}

function resolveConfig(envValues, localOpenClaw) {
  const host = String(envValues.HOST || DEFAULT_HOST).trim() || DEFAULT_HOST;
  const backendPort = String(envValues.PORT || DEFAULT_BACKEND_PORT).trim() || DEFAULT_BACKEND_PORT;
  const frontendHost = String(envValues.FRONTEND_HOST || host).trim() || host;
  const frontendPort = String(envValues.FRONTEND_PORT || DEFAULT_FRONTEND_PORT).trim() || DEFAULT_FRONTEND_PORT;
  const profile = resolveRuntimeProfile(envValues, localOpenClaw);
  const apiStyle = normalizeApiStyle(envValues.OPENCLAW_API_STYLE || 'chat');

  return {
    host,
    backendPort,
    frontendHost,
    frontendPort,
    profile,
    commandCenterForceMock: profile === 'mock' ? '1' : '',
    openclawBaseUrl: String(envValues.OPENCLAW_BASE_URL || '').trim(),
    openclawApiKey: String(envValues.OPENCLAW_API_KEY || '').trim(),
    openclawModel: String(envValues.OPENCLAW_MODEL || localOpenClaw.defaultModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    openclawAgentId: String(envValues.OPENCLAW_AGENT_ID || localOpenClaw.defaultAgentId || DEFAULT_AGENT_ID).trim() || DEFAULT_AGENT_ID,
    openclawApiStyle: apiStyle,
    openclawApiPath: String(envValues.OPENCLAW_API_PATH || (apiStyle === 'responses' ? '/v1/responses' : '/v1/chat/completions')).trim(),
  };
}

function applyConfigOverrides(config, options = {}) {
  const nextConfig = { ...config };
  const apiStyleChanged = Boolean(options.openclawApiStyle);

  if (options.host) {
    nextConfig.host = String(options.host).trim();
  }
  if (options.backendPort) {
    nextConfig.backendPort = String(options.backendPort).trim();
  }
  if (options.frontendHost) {
    nextConfig.frontendHost = String(options.frontendHost).trim();
  }
  if (options.frontendPort) {
    nextConfig.frontendPort = String(options.frontendPort).trim();
  }
  if (options.profile) {
    nextConfig.profile = normalizeProfile(options.profile);
  }
  if (options.openclawBaseUrl) {
    nextConfig.openclawBaseUrl = String(options.openclawBaseUrl).trim();
  }
  if (options.openclawApiKey !== undefined) {
    nextConfig.openclawApiKey = String(options.openclawApiKey).trim();
  }
  if (options.openclawModel) {
    nextConfig.openclawModel = String(options.openclawModel).trim();
  }
  if (options.openclawAgentId) {
    nextConfig.openclawAgentId = String(options.openclawAgentId).trim();
  }
  if (options.openclawApiStyle) {
    nextConfig.openclawApiStyle = normalizeApiStyle(options.openclawApiStyle);
  }
  if (options.openclawApiPath) {
    nextConfig.openclawApiPath = String(options.openclawApiPath).trim();
  }

  nextConfig.commandCenterForceMock = nextConfig.profile === 'mock' ? '1' : '0';
  if (apiStyleChanged && !options.openclawApiPath) {
    nextConfig.openclawApiPath = nextConfig.openclawApiStyle === 'responses' ? '/v1/responses' : '/v1/chat/completions';
  } else if (!nextConfig.openclawApiPath) {
    nextConfig.openclawApiPath = nextConfig.openclawApiStyle === 'responses' ? '/v1/responses' : '/v1/chat/completions';
  }

  return nextConfig;
}

function validateConfig(config, localOpenClaw, openclawBinary = '') {
  const errors = [];
  const warnings = [];
  const notes = [];

  if (!config.host) {
    errors.push('HOST is required.');
  }

  if (!config.frontendHost) {
    errors.push('FRONTEND_HOST is required.');
  }

  if (!isValidPort(config.backendPort)) {
    errors.push(`PORT must be an integer between 1 and 65535. Received: ${config.backendPort}`);
  }

  if (!isValidPort(config.frontendPort)) {
    errors.push(`FRONTEND_PORT must be an integer between 1 and 65535. Received: ${config.frontendPort}`);
  }

  if (!['local-openclaw', 'mock', 'remote-gateway'].includes(config.profile)) {
    errors.push(`Unsupported runtime profile: ${config.profile}`);
  }

  if (!['chat', 'responses'].includes(config.openclawApiStyle)) {
    errors.push(`OPENCLAW_API_STYLE must be "chat" or "responses". Received: ${config.openclawApiStyle}`);
  }

  if (!String(config.openclawApiPath || '').startsWith('/')) {
    errors.push(`OPENCLAW_API_PATH must start with "/". Received: ${config.openclawApiPath}`);
  }

  if (config.profile === 'local-openclaw') {
    if (!localOpenClaw.exists) {
      errors.push(`Local OpenClaw profile selected, but ${localOpenClaw.path} was not found.`);
    } else if (localOpenClaw.parseError) {
      errors.push(`Local OpenClaw profile selected, but ${localOpenClaw.path} could not be parsed.`);
    } else if (!localOpenClaw.token) {
      errors.push(`Local OpenClaw profile selected, but no gateway token was found in ${localOpenClaw.path}.`);
    } else if (!openclawBinary) {
      errors.push('Local OpenClaw profile selected, but the `openclaw` CLI was not found. Install it or set OPENCLAW_BIN.');
    } else {
      notes.push(`Using local OpenClaw config from ${localOpenClaw.path}.`);
    }
  }

  if (config.profile === 'remote-gateway') {
    if (!config.openclawBaseUrl) {
      errors.push('OPENCLAW_BASE_URL is required for the remote-gateway profile.');
    }

    if (config.openclawBaseUrl) {
      try {
        const parsedUrl = new URL(config.openclawBaseUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          errors.push(`OPENCLAW_BASE_URL must use http or https. Received: ${config.openclawBaseUrl}`);
        }
      } catch {
        errors.push(`OPENCLAW_BASE_URL must be a valid URL. Received: ${config.openclawBaseUrl}`);
      }
    }

    if (!config.openclawApiKey) {
      warnings.push('OPENCLAW_API_KEY is empty. Some remote gateways require a token.');
    }
  }

  if (config.profile === 'mock') {
    notes.push('Mock mode will keep the UI usable without connecting to a live OpenClaw gateway.');
  }

  return {
    errors,
    warnings,
    notes,
  };
}

function printIssueList(level, items) {
  items.forEach((message) => {
    console.log(`${level} ${message}`);
  });
}

function printConfigSummary(config) {
  console.log(`INFO  Runtime profile: ${config.profile}`);
  console.log(`INFO  Frontend URL: http://${config.frontendHost}:${config.frontendPort}`);
  console.log(`INFO  Backend URL:  http://${config.host}:${config.backendPort}`);
  if (config.profile === 'remote-gateway') {
    console.log(`INFO  Gateway URL:  ${config.openclawBaseUrl}`);
    console.log(`INFO  API style:    ${config.openclawApiStyle}`);
    console.log(`INFO  API path:     ${config.openclawApiPath}`);
  }
}

async function probeOpenClawGateway(config, fetchImpl = fetch, timeoutMs = 5000) {
  if (config.profile !== 'remote-gateway' || !config.openclawBaseUrl) {
    return {
      ok: false,
      skipped: true,
      message: 'Remote gateway probe skipped because the active profile is not remote-gateway.',
    };
  }

  const headers = {};
  if (config.openclawApiKey) {
    headers.Authorization = `Bearer ${config.openclawApiKey}`;
  }

  const endpoints = [
    { label: 'health', url: new URL('/healthz', config.openclawBaseUrl).toString() },
    { label: 'root', url: new URL('/', config.openclawBaseUrl).toString() },
  ];
  const failures = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchImpl(endpoint.url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        return {
          ok: true,
          endpoint: endpoint.label,
          url: endpoint.url,
          status: response.status,
          message: `Remote gateway responded from ${endpoint.url} with HTTP ${response.status}.`,
        };
      }

      failures.push(`${endpoint.url} returned HTTP ${response.status}`);

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          endpoint: endpoint.label,
          url: endpoint.url,
          status: response.status,
          message: `Remote gateway rejected credentials at ${endpoint.url} with HTTP ${response.status}.`,
        };
      }
    } catch (error) {
      failures.push(`${endpoint.url} failed: ${error.message}`);
    }
  }

  return {
    ok: false,
    url: config.openclawBaseUrl,
    message: `Remote gateway probe failed. ${failures.join(' ')}`,
  };
}

function buildRemoteValidationRequest(config) {
  const endpoint = new URL(config.openclawApiPath, config.openclawBaseUrl).toString();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.openclawApiKey) {
    headers.Authorization = `Bearer ${config.openclawApiKey}`;
  }

  if (config.openclawAgentId) {
    headers['x-openclaw-agent-id'] = config.openclawAgentId;
  }

  if (config.openclawApiStyle === 'responses') {
    return {
      endpoint,
      headers,
      payload: {
        model: config.openclawModel,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: 'Return OK.' }] },
          { role: 'user', content: [{ type: 'input_text', text: 'healthcheck' }] },
        ],
        max_output_tokens: 1,
      },
    };
  }

  return {
    endpoint,
    headers,
    payload: {
      model: config.openclawModel,
      messages: [
        { role: 'system', content: 'Return OK.' },
        { role: 'user', content: 'healthcheck' },
      ],
      max_tokens: 1,
      temperature: 0,
      user: 'lalaclaw-doctor',
      stream: false,
    },
  };
}

async function validateRemoteRuntimeConfig(config, fetchImpl = fetch, timeoutMs = 8000) {
  if (config.profile !== 'remote-gateway' || !config.openclawBaseUrl) {
    return {
      ok: false,
      skipped: true,
      message: 'Remote runtime validation skipped because the active profile is not remote-gateway.',
    };
  }

  const request = buildRemoteValidationRequest(config);

  try {
    const response = await fetchImpl(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      return {
        ok: true,
        endpoint: request.endpoint,
        status: response.status,
        message: `Remote model ${config.openclawModel} and agent ${config.openclawAgentId} were accepted by ${request.endpoint}.`,
      };
    }

    const responseText = await response.text().catch(() => '');
    return {
      ok: false,
      endpoint: request.endpoint,
      status: response.status,
      message: `Remote runtime validation failed at ${request.endpoint} with HTTP ${response.status}. ${clipText(responseText)}`,
    };
  } catch (error) {
    return {
      ok: false,
      endpoint: request.endpoint,
      message: `Remote runtime validation could not reach ${request.endpoint}. ${error.message}`,
    };
  }
}

function quoteEnvValue(value) {
  if (value === '') {
    return '""';
  }
  return /[\s#"'`]/.test(value) ? JSON.stringify(value) : value;
}

function renderEnvFile(config) {
  const lines = [
    '# LalaClaw local configuration',
    '# Generated by `lalaclaw init`.',
    '',
    '# Development server bindings',
    `HOST=${quoteEnvValue(config.host)}`,
    `PORT=${quoteEnvValue(config.backendPort)}`,
    `FRONTEND_HOST=${quoteEnvValue(config.frontendHost)}`,
    `FRONTEND_PORT=${quoteEnvValue(config.frontendPort)}`,
    '',
    '# Runtime profile: local-openclaw | mock | remote-gateway',
    `COMMANDCENTER_FORCE_MOCK=${config.profile === 'mock' ? '1' : '0'}`,
  ];

  if (config.profile === 'remote-gateway') {
    lines.push(
      `OPENCLAW_BASE_URL=${quoteEnvValue(config.openclawBaseUrl)}`,
      `OPENCLAW_API_KEY=${quoteEnvValue(config.openclawApiKey)}`,
      `OPENCLAW_MODEL=${quoteEnvValue(config.openclawModel)}`,
      `OPENCLAW_AGENT_ID=${quoteEnvValue(config.openclawAgentId)}`,
      `OPENCLAW_API_STYLE=${quoteEnvValue(config.openclawApiStyle)}`,
      `OPENCLAW_API_PATH=${quoteEnvValue(config.openclawApiPath)}`,
    );
  } else {
    lines.push(
      '# OPENCLAW_BASE_URL=',
      '# OPENCLAW_API_KEY=',
      `OPENCLAW_MODEL=${quoteEnvValue(config.openclawModel)}`,
      `OPENCLAW_AGENT_ID=${quoteEnvValue(config.openclawAgentId)}`,
      `OPENCLAW_API_STYLE=${quoteEnvValue(config.openclawApiStyle)}`,
      `OPENCLAW_API_PATH=${quoteEnvValue(config.openclawApiPath)}`,
    );
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function promptWithDefault(rl, label, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function promptProfile(rl, defaultProfile) {
  while (true) {
    const answer = (await rl.question(`Runtime profile [local-openclaw/mock/remote-gateway] [${defaultProfile}]: `)).trim();
    const value = answer || defaultProfile;
    if (['local-openclaw', 'mock', 'remote-gateway'].includes(value)) {
      return value;
    }
    console.log('Please choose one of: local-openclaw, mock, remote-gateway');
  }
}

function buildDoctorReport({
  envFilePath,
  envFileExists,
  nodeVersion,
  nodeMatches,
  localOpenClaw,
  openclawBinary,
  frontendPortFree,
  backendPortFree,
  config,
  validation,
  gatewayProbe = null,
  remoteValidation = null,
}) {
  const warnings = [...validation.warnings];
  const errors = [...validation.errors];

  if (!nodeMatches) {
    warnings.push(`Node.js ${nodeVersion} does not match required major ${REQUIRED_NODE_MAJOR}.`);
  }

  if (!frontendPortFree) {
    warnings.push(`Frontend port ${config.frontendHost}:${config.frontendPort} is already in use.`);
  }

  if (!backendPortFree) {
    warnings.push(`Backend port ${config.host}:${config.backendPort} is already in use.`);
  }

  if (gatewayProbe && !gatewayProbe.ok && !gatewayProbe.skipped) {
    warnings.push(gatewayProbe.message);
  }

  if (remoteValidation && !remoteValidation.ok && !remoteValidation.skipped) {
    errors.push(remoteValidation.message);
  }

  const summary = {
    status: errors.length ? 'error' : warnings.length ? 'warn' : 'ok',
    exitCode: errors.length ? 1 : 0,
    warningCount: warnings.length,
    errorCount: errors.length,
    warnings,
    errors,
  };

  return {
    projectRoot: PROJECT_ROOT,
    envFilePath,
    envFileExists,
    node: {
      version: nodeVersion,
      requiredMajor: REQUIRED_NODE_MAJOR,
      matches: nodeMatches,
    },
    localOpenClaw: {
      exists: Boolean(localOpenClaw.exists),
      path: localOpenClaw.path,
      parseError: localOpenClaw.parseError ? localOpenClaw.parseError.message : '',
      tokenDetected: Boolean(localOpenClaw.token),
      workspaceRoot: localOpenClaw.workspaceRoot || '',
    },
    openclawBinary: {
      found: Boolean(openclawBinary),
      path: openclawBinary || '',
    },
    ports: {
      frontend: {
        host: config.frontendHost,
        port: config.frontendPort,
        available: frontendPortFree,
      },
      backend: {
        host: config.host,
        port: config.backendPort,
        available: backendPortFree,
      },
    },
    runtime: {
      host: config.host,
      backendPort: config.backendPort,
      frontendHost: config.frontendHost,
      frontendPort: config.frontendPort,
      profile: config.profile,
      frontendUrl: `http://${config.frontendHost}:${config.frontendPort}`,
      backendUrl: `http://${config.host}:${config.backendPort}`,
      gatewayUrl: config.openclawBaseUrl || '',
      openclawBaseUrl: config.openclawBaseUrl || '',
      model: config.openclawModel,
      agentId: config.openclawAgentId,
      apiStyle: config.openclawApiStyle,
      openclawApiStyle: config.openclawApiStyle,
      apiPath: config.openclawApiPath,
      openclawApiPath: config.openclawApiPath,
    },
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
      notes: validation.notes,
    },
    summary,
    probes: {
      gateway: gatewayProbe,
      runtime: remoteValidation,
    },
  };
}

async function collectDoctorData(envFilePath) {
  const envValues = readEnvFile(envFilePath);
  const localOpenClaw = detectLocalOpenClaw();
  const config = resolveConfig(envValues, localOpenClaw);
  const nodeVersion = process.versions.node;
  const nodeMajor = Number(String(nodeVersion || '').split('.')[0] || 0);
  const nodeMatches = nodeMajor === REQUIRED_NODE_MAJOR;
  const openclawBinary = findExecutable(process.env.OPENCLAW_BIN || 'openclaw');
  const validation = validateConfig(config, localOpenClaw, openclawBinary);
  const frontendPortFree = await checkPortAvailable(config.frontendHost, config.frontendPort);
  const backendPortFree = await checkPortAvailable(config.host, config.backendPort);
  let gatewayProbe = null;
  let remoteValidation = null;

  if (!validation.errors.length && config.profile === 'remote-gateway') {
    gatewayProbe = await probeOpenClawGateway(config);
    remoteValidation = await validateRemoteRuntimeConfig(config);
  }

  return buildDoctorReport({
    envFilePath,
    envFileExists: fs.existsSync(envFilePath),
    nodeVersion,
    nodeMatches,
    localOpenClaw,
    openclawBinary,
    frontendPortFree,
    backendPortFree,
    config,
    validation,
    gatewayProbe,
    remoteValidation,
  });
}

function printDoctorReport(report) {
  console.log(`INFO  Project root: ${report.projectRoot}`);
  console.log(`INFO  Env file: ${report.envFileExists ? report.envFilePath : `${report.envFilePath} (not found, using defaults)`}`);
  console.log(`${report.node.matches ? 'OK   ' : 'WARN '} Node.js ${report.node.version} ${report.node.matches ? `matches required major ${report.node.requiredMajor}` : `does not match required major ${report.node.requiredMajor}`}`);

  if (!report.localOpenClaw.exists) {
    console.log(`WARN  Local OpenClaw config not found at ${report.localOpenClaw.path}`);
  } else if (report.localOpenClaw.parseError) {
    console.log(`WARN  Local OpenClaw config exists but could not be parsed: ${report.localOpenClaw.parseError}`);
  } else {
    console.log(`OK    Local OpenClaw config found at ${report.localOpenClaw.path}`);
    console.log(`${report.localOpenClaw.tokenDetected ? 'OK   ' : 'WARN '} Gateway token ${report.localOpenClaw.tokenDetected ? 'detected' : 'missing'} in local OpenClaw config`);
    console.log(`INFO  Workspace root: ${report.localOpenClaw.workspaceRoot}`);
  }

  console.log(`${report.openclawBinary.found ? 'OK   ' : 'WARN '} OpenClaw CLI ${report.openclawBinary.found ? `found at ${report.openclawBinary.path}` : 'not found on PATH'}`);
  console.log(`${report.ports.frontend.available ? 'OK   ' : 'WARN '} Frontend ${report.ports.frontend.host}:${report.ports.frontend.port} ${report.ports.frontend.available ? 'is available' : 'is already in use'}`);
  console.log(`${report.ports.backend.available ? 'OK   ' : 'WARN '} Backend ${report.ports.backend.host}:${report.ports.backend.port} ${report.ports.backend.available ? 'is available' : 'is already in use'}`);
  printConfigSummary(report.runtime);
  printIssueList('WARN ', report.validation.warnings);
  printIssueList('INFO ', report.validation.notes);

  if (report.probes.gateway) {
    console.log(`${report.probes.gateway.ok ? 'OK   ' : 'WARN '} ${report.probes.gateway.message}`);
  }

  if (report.probes.runtime) {
    console.log(`${report.probes.runtime.ok ? 'OK   ' : 'ERROR'} ${report.probes.runtime.message}`);
  }
}

async function runInit(envFilePath, options = {}) {
  if (options.writeExample) {
    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.writeFileSync(envFilePath, readExampleEnvTemplate(), 'utf8');
    console.log(`OK    Wrote example config to ${envFilePath}`);
    console.log('Next steps:');
    console.log('  1. Review the placeholder values in the file');
    console.log('  2. npm run doctor');
    console.log('  3. npm run dev:all');
    return;
  }

  const localOpenClaw = detectLocalOpenClaw();
  const openclawBinary = findExecutable(process.env.OPENCLAW_BIN || 'openclaw');
  const currentEnv = readEnvFile(envFilePath);
  const detectedConfig = resolveConfig(currentEnv, localOpenClaw);

  if (localOpenClaw.exists && localOpenClaw.parseError) {
    console.log(`WARN  Found ${localOpenClaw.path} but could not parse it: ${localOpenClaw.parseError.message}`);
  } else if (localOpenClaw.exists) {
    console.log(`INFO  Found local OpenClaw config at ${localOpenClaw.path}`);
  } else {
    console.log(`INFO  No local OpenClaw config found at ${localOpenClaw.path}`);
  }

  let nextConfig = applyConfigOverrides(detectedConfig, options);

  if (!options.defaults) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      nextConfig.host = await promptWithDefault(rl, 'Backend host', nextConfig.host);
      nextConfig.backendPort = await promptWithDefault(rl, 'Backend port', nextConfig.backendPort);
      nextConfig.frontendHost = await promptWithDefault(rl, 'Frontend host', nextConfig.frontendHost);
      nextConfig.frontendPort = await promptWithDefault(rl, 'Frontend port', nextConfig.frontendPort);
      nextConfig.profile = await promptProfile(rl, nextConfig.profile);
      nextConfig.commandCenterForceMock = nextConfig.profile === 'mock' ? '1' : '0';

      if (nextConfig.profile === 'remote-gateway') {
        nextConfig.openclawBaseUrl = await promptWithDefault(rl, 'OpenClaw base URL', nextConfig.openclawBaseUrl);
        nextConfig.openclawApiKey = await promptWithDefault(rl, 'OpenClaw API key', nextConfig.openclawApiKey);
        nextConfig.openclawModel = await promptWithDefault(rl, 'OpenClaw model', nextConfig.openclawModel);
        nextConfig.openclawAgentId = await promptWithDefault(rl, 'OpenClaw agent id', nextConfig.openclawAgentId);
        nextConfig.openclawApiStyle = await promptWithDefault(rl, 'OpenClaw API style', nextConfig.openclawApiStyle);
        const defaultApiPath = nextConfig.openclawApiStyle === 'responses' ? '/v1/responses' : '/v1/chat/completions';
        nextConfig.openclawApiPath = await promptWithDefault(
          rl,
          'OpenClaw API path',
          nextConfig.openclawApiPath || defaultApiPath,
        );
      }
    } finally {
      rl.close();
    }
  }
  const validation = validateConfig(nextConfig, localOpenClaw, openclawBinary);
  if (validation.errors.length) {
    throw new Error(validation.errors.join(' '));
  }

  if (validation.warnings.length) {
    printIssueList('WARN ', validation.warnings);
  }

  if (validation.notes.length) {
    printIssueList('INFO ', validation.notes);
  }

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, renderEnvFile(nextConfig), 'utf8');
  console.log(`OK    Wrote ${envFilePath}`);
  printConfigSummary(nextConfig);
  console.log('Next steps:');
  console.log('  1. npm run doctor');
  console.log('  2. npm run dev:all');
}

function findExecutable(binName) {
  if (path.isAbsolute(binName)) {
    return fs.existsSync(binName) ? binName : '';
  }

  const locator = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(locator, [binName], { encoding: 'utf8' });
  if (result.status === 0) {
    const firstLine = String(result.stdout || '').split(/\r?\n/).find(Boolean);
    return firstLine || '';
  }
  return '';
}

function checkPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(Number(port), host);
  });
}

async function ensurePortAvailable(label, host, port) {
  const available = await checkPortAvailable(host, port);
  if (!available) {
    throw new Error(`${label} ${host}:${port} is already in use.`);
  }
}


function buildChildEnv(envFilePath) {
  const envValues = readEnvFile(envFilePath);
  const localOpenClaw = detectLocalOpenClaw();
  const config = resolveConfig(envValues, localOpenClaw);
  const childEnv = {
    ...process.env,
    HOST: config.host,
    PORT: config.backendPort,
  };

  if (config.frontendHost) {
    childEnv.FRONTEND_HOST = config.frontendHost;
  }
  if (config.frontendPort) {
    childEnv.FRONTEND_PORT = config.frontendPort;
  }

  if (config.profile === 'mock') {
    childEnv.COMMANDCENTER_FORCE_MOCK = '1';
    delete childEnv.OPENCLAW_BASE_URL;
    delete childEnv.OPENCLAW_API_KEY;
  } else {
    childEnv.COMMANDCENTER_FORCE_MOCK = '0';
    if (config.profile === 'remote-gateway') {
      childEnv.OPENCLAW_BASE_URL = config.openclawBaseUrl;
      childEnv.OPENCLAW_API_KEY = config.openclawApiKey;
    }
  }

  childEnv.OPENCLAW_MODEL = config.openclawModel;
  childEnv.OPENCLAW_AGENT_ID = config.openclawAgentId;
  childEnv.OPENCLAW_API_STYLE = config.openclawApiStyle;
  childEnv.OPENCLAW_API_PATH = config.openclawApiPath;

  return {
    childEnv,
    config,
  };
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runChild(command, args, env) {
  return spawn(command, args, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  });
}

function stopChild(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
}

async function runFrontend(envFilePath) {
  const { childEnv, config } = buildChildEnv(envFilePath);
  await ensurePortAvailable('Frontend port', config.frontendHost, config.frontendPort);
  console.log(`INFO  Starting frontend at http://${config.frontendHost}:${config.frontendPort}`);
  const child = runChild(
    npmCommand(),
    ['run', 'dev', '--', '--host', config.frontendHost, '--port', config.frontendPort, '--strictPort'],
    childEnv,
  );

  child.on('exit', (code) => {
    process.exit(typeof code === 'number' ? code : 0);
  });
}

async function runBackend(envFilePath) {
  const { childEnv, config } = buildChildEnv(envFilePath);
  await ensurePortAvailable('Backend port', config.host, config.backendPort);
  console.log(`INFO  Starting backend at http://${config.host}:${config.backendPort} in ${config.profile} mode`);
  const child = runChild(process.execPath, ['server.js'], childEnv);

  child.on('exit', (code) => {
    process.exit(typeof code === 'number' ? code : 0);
  });
}

async function runDev(envFilePath) {
  const { childEnv, config } = buildChildEnv(envFilePath);
  await ensurePortAvailable('Frontend port', config.frontendHost, config.frontendPort);
  await ensurePortAvailable('Backend port', config.host, config.backendPort);
  const frontend = runChild(
    npmCommand(),
    ['run', 'dev', '--', '--host', config.frontendHost, '--port', config.frontendPort, '--strictPort'],
    childEnv,
  );
  const backend = runChild(process.execPath, ['server.js'], childEnv);
  const children = [frontend, backend];
  let shuttingDown = false;

  console.log(`INFO  Frontend: http://${config.frontendHost}:${config.frontendPort}`);
  console.log(`INFO  Backend:  http://${config.host}:${config.backendPort}`);
  console.log(`INFO  Runtime:  ${config.profile}`);

  const shutdown = (exitCode) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    children.forEach(stopChild);
    setTimeout(() => process.exit(exitCode), 50);
  };

  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));

  frontend.on('exit', (code) => shutdown(typeof code === 'number' ? code : 0));
  backend.on('exit', (code) => shutdown(typeof code === 'number' ? code : 0));
}

async function runStart(envFilePath) {
  const { childEnv, config } = buildChildEnv(envFilePath);

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Build output is missing at ${DIST_DIR}. Run \`npm run build\` first.`);
  }

  await ensurePortAvailable('Backend port', config.host, config.backendPort);
  console.log(`INFO  Starting built app at http://${config.host}:${config.backendPort} in ${config.profile} mode`);
  const child = runChild(process.execPath, ['server.js'], childEnv);

  child.on('exit', (code) => {
    process.exit(typeof code === 'number' ? code : 0);
  });
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const envFilePath = options.configFile || DEFAULT_ENV_FILE;

  if (options.help || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'init') {
    await runInit(envFilePath, options);
    return;
  }

  if (command === 'doctor') {
    const report = await collectDoctorData(envFilePath);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printDoctorReport(report);
    }

    if (report.summary.exitCode > 0) {
      throw new Error('Doctor found actionable errors.');
    }
    return;
  }

  if (command === 'dev') {
    await runDev(envFilePath);
    return;
  }

  if (command === 'start') {
    await runStart(envFilePath);
    return;
  }

  if (command === 'frontend') {
    await runFrontend(envFilePath);
    return;
  }

  if (command === 'backend') {
    await runBackend(envFilePath);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

module.exports = {
  DEFAULT_ENV_FILE,
  DEFAULT_HOST,
  DEFAULT_FRONTEND_PORT,
  DEFAULT_BACKEND_PORT,
  DEFAULT_MODEL,
  DEFAULT_AGENT_ID,
  REQUIRED_NODE_MAJOR,
  EXAMPLE_ENV_FILE,
  parseArgs,
  readEnvFile,
  truthy,
  isValidPort,
  normalizeApiStyle,
  normalizeProfile,
  applyConfigOverrides,
  clipText,
  readExampleEnvTemplate,
  resolveRuntimeProfile,
  resolveConfig,
  renderEnvFile,
  validateConfig,
  probeOpenClawGateway,
  buildRemoteValidationRequest,
  validateRemoteRuntimeConfig,
  buildDoctorReport,
  collectDoctorData,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`ERROR ${error.message}`);
    process.exit(1);
  });
}
