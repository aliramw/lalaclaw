import os from 'node:os';
import path from 'node:path';
import { performHealthCheck } from './openclaw-management';
import { getLalaClawServiceStatus } from './lalaclaw-service-status';

const DEFAULT_ONBOARDING_TIMEOUT_MS = 20 * 60 * 1000;
type LooseRecord = Record<string, any>;
type OpenClawOnboardingError = Error & {
  statusCode?: number;
  errorCode?: string;
  field?: string;
};
type CapabilityDetection = {
  source: string;
  reason: string;
  commandResult: LooseRecord | null;
  detectedAt: string;
  signature: string;
};
type OnboardingCapabilities = {
  supportedAuthChoices: string[];
  supportedDaemonRuntimes: string[];
  supportedFlows: string[];
  supportedGatewayAuthModes: string[];
  supportedSecretInputModes: string[];
  supportedGatewayTokenInputModes: string[];
  supportedGatewayBinds: string[];
  capabilityDetection: CapabilityDetection;
};
type AuthChoiceBuildOptions = {
  apiKey?: string;
  customBaseUrl?: string;
  customCompatibility?: string;
  customModelId?: string;
  customProviderId?: string;
  secretInputMode?: string;
  token?: string;
  tokenExpiresIn?: string;
  tokenProfileId?: string;
  tokenProvider?: string;
  gatewayToken?: string;
  gatewayTokenRefEnv?: string;
  gatewayPassword?: string;
};
type AuthChoiceDefinition = {
  key?: string;
  requires?: string[];
  buildArgs: (options?: AuthChoiceBuildOptions) => string[];
};
type CapabilitySnapshot = {
  signature: string;
  capabilities: OnboardingCapabilities;
};
const DEFAULT_GATEWAY_BIND = 'loopback';
const DEFAULT_GATEWAY_AUTH = 'off';
const DEFAULT_INSTALL_DAEMON = true;
const DEFAULT_ONBOARDING_FLOW = 'quickstart';
const DEFAULT_SKIP_HEALTH_CHECK = false;
const DEFAULT_DAEMON_RUNTIME = 'node';
const DEFAULT_SECRET_INPUT_MODE = 'plaintext';
const SUPPORTED_DAEMON_RUNTIMES = ['node', 'bun'];
const SUPPORTED_ONBOARDING_FLOWS = ['quickstart', 'advanced', 'manual'];
const SUPPORTED_GATEWAY_BINDS = ['loopback', 'tailnet', 'lan', 'auto', 'custom'];
const SUPPORTED_GATEWAY_AUTH_MODES = ['off', 'token', 'password'];
const SUPPORTED_GATEWAY_TOKEN_INPUT_MODES = ['plaintext', 'ref'];
const SUPPORTED_SECRET_INPUT_MODES = ['plaintext', 'ref'];

function createOpenClawOnboardingError(message = '', statusCode = 500, errorCode = '', field = '') {
  const error = new Error(message) as OpenClawOnboardingError;
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  if (field) {
    error.field = field;
  }
  return error;
}

function uniqueValues(values: unknown[] = []): string[] {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildStaticOnboardingCapabilities(): Omit<OnboardingCapabilities, 'capabilityDetection'> {
  return {
    supportedAuthChoices: [...SUPPORTED_AUTH_CHOICE_ORDER],
    supportedDaemonRuntimes: [...SUPPORTED_DAEMON_RUNTIMES],
    supportedFlows: [...SUPPORTED_ONBOARDING_FLOWS],
    supportedGatewayAuthModes: [...SUPPORTED_GATEWAY_AUTH_MODES],
    supportedSecretInputModes: [...SUPPORTED_SECRET_INPUT_MODES],
    supportedGatewayTokenInputModes: [...SUPPORTED_GATEWAY_TOKEN_INPUT_MODES],
    supportedGatewayBinds: [...SUPPORTED_GATEWAY_BINDS],
  };
}

function buildCapabilityDetection({
  source = 'static-fallback',
  reason = '',
  commandResult = null,
  detectedAt = '',
  signature = '',
}: LooseRecord = {}): CapabilityDetection {
  return {
    source: String(source || 'static-fallback').trim() || 'static-fallback',
    reason: String(reason || '').trim(),
    detectedAt: String(detectedAt || '').trim(),
    signature: String(signature || '').trim(),
    commandResult: commandResult || null,
  };
}

function resolveOpenClawVersionSignature(statusPayload: LooseRecord = {}, openclawBin = 'openclaw') {
  const currentVersion = String(
    statusPayload?.currentVersion
      || statusPayload?.update?.registry?.currentVersion
      || statusPayload?.update?.currentVersion
      || '',
  ).trim();
  const installKind = String(statusPayload?.update?.installKind || '').trim();
  const channel = String(statusPayload?.channel?.value || '').trim();
  const parts = [String(openclawBin || 'openclaw').trim(), currentVersion, installKind, channel].filter(Boolean);
  return parts.join('@') || String(openclawBin || 'openclaw').trim() || 'openclaw';
}

function findHelpFlagLine(helpText = '', flagName = '') {
  const normalizedFlagName = String(flagName || '').trim();
  if (!normalizedFlagName) {
    return '';
  }

  return String(helpText || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(`--${normalizedFlagName} `) || line.startsWith(`--${normalizedFlagName}<`) || line.startsWith(`--${normalizedFlagName}\t`))
    || '';
}

function parseDelimitedHelpValues(helpText = '', flagName = '', markerPattern = /:\s*([A-Za-z0-9:_|-]+)(?:\s+\(|$)/) {
  const line = findHelpFlagLine(helpText, flagName);
  if (!line) {
    return [];
  }

  const match = line.match(markerPattern);
  if (!match?.[1]) {
    return [];
  }

  return uniqueValues(String(match[1] || '').split('|'));
}

function intersectPreferredCapabilities(preferredValues: string[] = [], detectedValues: string[] = []): string[] {
  const detectedSet = new Set(uniqueValues(detectedValues));
  const intersection = preferredValues.filter((value) => detectedSet.has(value));
  return intersection.length ? intersection : [...preferredValues];
}

export function parseOnboardingHelpCapabilities(helpText = '') {
  const staticCapabilities = buildStaticOnboardingCapabilities();
  const parsedAuthChoices = parseDelimitedHelpValues(helpText, 'auth-choice', /Auth:\s*([A-Za-z0-9:_|-]+)(?:\s+\(|$)/);
  const parsedDaemonRuntimes = parseDelimitedHelpValues(helpText, 'daemon-runtime');
  const parsedFlows = parseDelimitedHelpValues(helpText, 'flow');
  const parsedGatewayBinds = parseDelimitedHelpValues(helpText, 'gateway-bind');
  const parsedGatewayAuthModes = parseDelimitedHelpValues(helpText, 'gateway-auth');
  const parsedSecretInputModes = parseDelimitedHelpValues(helpText, 'secret-input-mode');
  const tokenInputModes = [];
  if (findHelpFlagLine(helpText, 'gateway-token')) {
    tokenInputModes.push('plaintext');
  }
  if (findHelpFlagLine(helpText, 'gateway-token-ref-env')) {
    tokenInputModes.push('ref');
  }

  return {
    supportedAuthChoices: intersectPreferredCapabilities(staticCapabilities.supportedAuthChoices, parsedAuthChoices),
    supportedDaemonRuntimes: intersectPreferredCapabilities(staticCapabilities.supportedDaemonRuntimes, parsedDaemonRuntimes),
    supportedFlows: intersectPreferredCapabilities(staticCapabilities.supportedFlows, parsedFlows),
    supportedGatewayAuthModes: intersectPreferredCapabilities(
      staticCapabilities.supportedGatewayAuthModes,
      ['off', ...parsedGatewayAuthModes],
    ),
    supportedSecretInputModes: intersectPreferredCapabilities(staticCapabilities.supportedSecretInputModes, parsedSecretInputModes),
    supportedGatewayTokenInputModes: intersectPreferredCapabilities(staticCapabilities.supportedGatewayTokenInputModes, tokenInputModes),
    supportedGatewayBinds: intersectPreferredCapabilities(staticCapabilities.supportedGatewayBinds, parsedGatewayBinds),
    capabilityDetection: buildCapabilityDetection({
      source: 'help',
      reason: '',
      signature: '',
      commandResult: null,
    }),
  };
}

function resolveCapabilityValues(capabilities: LooseRecord | null = null) {
  const staticCapabilities = buildStaticOnboardingCapabilities();
  const source = capabilities && typeof capabilities === 'object' ? capabilities : {};

  return {
    supportedAuthChoices: intersectPreferredCapabilities(staticCapabilities.supportedAuthChoices, source.supportedAuthChoices || []),
    supportedDaemonRuntimes: intersectPreferredCapabilities(staticCapabilities.supportedDaemonRuntimes, source.supportedDaemonRuntimes || []),
    supportedFlows: intersectPreferredCapabilities(staticCapabilities.supportedFlows, source.supportedFlows || []),
    supportedGatewayAuthModes: intersectPreferredCapabilities(staticCapabilities.supportedGatewayAuthModes, source.supportedGatewayAuthModes || []),
    supportedSecretInputModes: intersectPreferredCapabilities(staticCapabilities.supportedSecretInputModes, source.supportedSecretInputModes || []),
    supportedGatewayTokenInputModes: intersectPreferredCapabilities(staticCapabilities.supportedGatewayTokenInputModes, source.supportedGatewayTokenInputModes || []),
    supportedGatewayBinds: intersectPreferredCapabilities(staticCapabilities.supportedGatewayBinds, source.supportedGatewayBinds || []),
    capabilityDetection: source.capabilityDetection && typeof source.capabilityDetection === 'object'
      ? {
          source: String(source.capabilityDetection.source || 'static-fallback').trim() || 'static-fallback',
          reason: String(source.capabilityDetection.reason || '').trim(),
          detectedAt: String(source.capabilityDetection.detectedAt || '').trim(),
          signature: String(source.capabilityDetection.signature || '').trim(),
          commandResult: source.capabilityDetection.commandResult || null,
        }
      : buildCapabilityDetection(),
  };
}

function resolveSupportedDefaultValue(preferredValue = '', supportedValues: string[] = [], fallbackValue = '') {
  if (supportedValues.includes(preferredValue)) {
    return preferredValue;
  }
  if (supportedValues.includes(fallbackValue)) {
    return fallbackValue;
  }
  return supportedValues[0] || fallbackValue || '';
}

function createApiKeyAuthChoice(flagName: string): AuthChoiceDefinition {
  return {
    key: 'apiKey',
    buildArgs: ({ apiKey = '', secretInputMode = DEFAULT_SECRET_INPUT_MODE } = {}) => (
      secretInputMode === 'plaintext' && apiKey
        ? [flagName, apiKey]
        : []
    ),
  };
}

function createPassthroughAuthChoice(): AuthChoiceDefinition {
  return {
    buildArgs: () => [],
  };
}

const SUPPORTED_AUTH_CHOICES: Record<string, AuthChoiceDefinition> = {
  token: {
    requires: ['tokenProvider', 'token'],
    buildArgs: ({
      token = '',
      tokenExpiresIn = '',
      tokenProfileId = '',
      tokenProvider = '',
    } = {}) => {
      const args = [
        '--token-provider',
        tokenProvider,
        '--token',
        token,
      ];
      if (tokenProfileId) {
        args.push('--token-profile-id', tokenProfileId);
      }
      if (tokenExpiresIn) {
        args.push('--token-expires-in', tokenExpiresIn);
      }
      return args;
    },
  },
  'github-copilot': createPassthroughAuthChoice(),
  'google-gemini-cli': createPassthroughAuthChoice(),
  'openai-api-key': createApiKeyAuthChoice('--openai-api-key'),
  'openrouter-api-key': createApiKeyAuthChoice('--openrouter-api-key'),
  'anthropic-api-key': createApiKeyAuthChoice('--anthropic-api-key'),
  'gemini-api-key': createApiKeyAuthChoice('--gemini-api-key'),
  'mistral-api-key': createApiKeyAuthChoice('--mistral-api-key'),
  'moonshot-api-key': createApiKeyAuthChoice('--moonshot-api-key'),
  'kimi-code-api-key': createApiKeyAuthChoice('--kimi-code-api-key'),
  'minimax-global-api': createApiKeyAuthChoice('--minimax-api-key'),
  'zai-api-key': createApiKeyAuthChoice('--zai-api-key'),
  'zai-coding-global': createApiKeyAuthChoice('--zai-api-key'),
  'zai-coding-cn': createApiKeyAuthChoice('--zai-api-key'),
  'zai-global': createApiKeyAuthChoice('--zai-api-key'),
  'zai-cn': createApiKeyAuthChoice('--zai-api-key'),
  'ai-gateway-api-key': createApiKeyAuthChoice('--ai-gateway-api-key'),
  'opencode-zen': createApiKeyAuthChoice('--opencode-zen-api-key'),
  'opencode-go': createApiKeyAuthChoice('--opencode-go-api-key'),
  'xai-api-key': createApiKeyAuthChoice('--xai-api-key'),
  'together-api-key': createApiKeyAuthChoice('--together-api-key'),
  'huggingface-api-key': createApiKeyAuthChoice('--huggingface-api-key'),
  'qianfan-api-key': createApiKeyAuthChoice('--qianfan-api-key'),
  'modelstudio-api-key': createApiKeyAuthChoice('--modelstudio-api-key'),
  'modelstudio-api-key-cn': createApiKeyAuthChoice('--modelstudio-api-key-cn'),
  'volcengine-api-key': createApiKeyAuthChoice('--volcengine-api-key'),
  'byteplus-api-key': createApiKeyAuthChoice('--byteplus-api-key'),
  'xiaomi-api-key': createApiKeyAuthChoice('--xiaomi-api-key'),
  'kilocode-api-key': createApiKeyAuthChoice('--kilocode-api-key'),
  'litellm-api-key': createApiKeyAuthChoice('--litellm-api-key'),
  'synthetic-api-key': createApiKeyAuthChoice('--synthetic-api-key'),
  'custom-api-key': {
    key: 'apiKey',
    requires: ['customBaseUrl', 'customModelId'],
    buildArgs: ({
      apiKey = '',
      customBaseUrl = '',
      customCompatibility = 'openai',
      customModelId = '',
      customProviderId = '',
      secretInputMode = DEFAULT_SECRET_INPUT_MODE,
    } = {}) => {
      const args = [
        '--custom-base-url',
        customBaseUrl,
        '--custom-model-id',
        customModelId,
        '--custom-compatibility',
        customCompatibility || 'openai',
      ];
      if (customProviderId) {
        args.push('--custom-provider-id', customProviderId);
      }
      if (secretInputMode === 'plaintext' && apiKey) {
        args.push('--custom-api-key', apiKey);
      }
      return args;
    },
  },
  ollama: {
    buildArgs: ({
      customBaseUrl = '',
      customModelId = '',
    } = {}) => {
      const args = [];
      if (customBaseUrl) {
        args.push('--custom-base-url', customBaseUrl);
      }
      if (customModelId) {
        args.push('--custom-model-id', customModelId);
      }
      return args;
    },
  },
  skip: {
    buildArgs: () => [],
  },
};
const SUPPORTED_AUTH_CHOICE_ORDER = [
  'token',
  'github-copilot',
  'google-gemini-cli',
  'openai-api-key',
  'openrouter-api-key',
  'anthropic-api-key',
  'gemini-api-key',
  'mistral-api-key',
  'moonshot-api-key',
  'kimi-code-api-key',
  'minimax-global-api',
  'zai-api-key',
  'zai-coding-global',
  'zai-coding-cn',
  'ai-gateway-api-key',
  'opencode-zen',
  'opencode-go',
  'xai-api-key',
  'together-api-key',
  'huggingface-api-key',
  'qianfan-api-key',
  'modelstudio-api-key',
  'modelstudio-api-key-cn',
  'volcengine-api-key',
  'byteplus-api-key',
  'xiaomi-api-key',
  'kilocode-api-key',
  'litellm-api-key',
  'synthetic-api-key',
  'custom-api-key',
  'ollama',
  'skip',
];

function clipOutput(value = '', maxLength = 10_000) {
  const normalized = String(value || '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}

export function parseNoisyJson(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return null;
  }

  const firstBraceIndex = normalized.indexOf('{');
  const lastBraceIndex = normalized.lastIndexOf('}');
  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  try {
    return JSON.parse(normalized.slice(firstBraceIndex, lastBraceIndex + 1));
  } catch {
    return null;
  }
}

function createCommandSummary(command: string, args: string[] = [], response: LooseRecord = {}) {
  return {
    ok: Boolean(response?.ok),
    timedOut: Boolean(response?.timedOut),
    exitCode: Number.isInteger(response?.exitCode) ? response.exitCode : (response?.ok ? 0 : null),
    signal: response?.signal || '',
    stdout: clipOutput(response?.stdout || ''),
    stderr: clipOutput(response?.stderr || ''),
    error: response?.error || '',
    systemErrorCode: response?.systemErrorCode || '',
    command: {
      bin: command,
      args,
      display: [command, ...args].join(' '),
    },
  };
}

function summarizeCommandError(command: string, args: string[] = [], error: LooseRecord) {
  const message = String(error?.message || 'OpenClaw onboarding command failed');
  const timedOut = Boolean(error?.killed) && /timed out/i.test(message);

  return createCommandSummary(command, args, {
    ok: false,
    timedOut,
    exitCode: Number.isInteger(error?.code) ? error.code : null,
    signal: error?.signal || '',
    stdout: error?.stdout || '',
    stderr: error?.stderr || '',
    error: message,
    systemErrorCode: typeof error?.code === 'string' ? error.code : '',
  });
}

function normalizeValidationSummary(commandResult: LooseRecord, payload: LooseRecord | null) {
  const valid = Boolean(payload?.valid) && Boolean(commandResult?.ok);
  return {
    ok: valid,
    valid,
    path: String(payload?.path || '').trim(),
    details: payload || null,
    commandResult,
  };
}

function resolveSuggestedWorkspace() {
  const homeDirectory = os.homedir();
  return homeDirectory ? path.join(homeDirectory, '.openclaw', 'workspace') : '';
}

function isLikelyConfigPath(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('[')) {
    return false;
  }
  return /^(~\/|\/|[A-Za-z]:\\).+/.test(normalized);
}

function normalizeConfigPath(commandResult: LooseRecord = {}) {
  const stdout = String(commandResult?.stdout || '').trim();
  if (stdout) {
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const configPathLine = lines.find((line) => isLikelyConfigPath(line));
    if (configPathLine) {
      return configPathLine;
    }
    return lines[0] || '';
  }
  return '';
}

function buildOnboardingState({
  capabilities = null,
  configPath = '',
  installed = false,
  validation = null,
  service = null,
}: LooseRecord = {}) {
  const resolvedCapabilities = resolveCapabilityValues(capabilities);
  const ready = Boolean(installed) && Boolean(validation?.ok);
  return {
    ok: true,
    installed: Boolean(installed),
    ready,
    needsOnboarding: Boolean(installed) && !ready,
    configPath: String(configPath || '').trim(),
    validation,
    defaults: {
      authChoice: resolveSupportedDefaultValue('openai-api-key', resolvedCapabilities.supportedAuthChoices, 'skip'),
      daemonRuntime: resolveSupportedDefaultValue(DEFAULT_DAEMON_RUNTIME, resolvedCapabilities.supportedDaemonRuntimes),
      flow: resolveSupportedDefaultValue(DEFAULT_ONBOARDING_FLOW, resolvedCapabilities.supportedFlows),
      secretInputMode: resolveSupportedDefaultValue(DEFAULT_SECRET_INPUT_MODE, resolvedCapabilities.supportedSecretInputModes),
      customCompatibility: 'openai',
      gatewayAuth: resolveSupportedDefaultValue(DEFAULT_GATEWAY_AUTH, resolvedCapabilities.supportedGatewayAuthModes),
      gatewayTokenInputMode: resolveSupportedDefaultValue('plaintext', resolvedCapabilities.supportedGatewayTokenInputModes),
      gatewayBind: resolveSupportedDefaultValue(DEFAULT_GATEWAY_BIND, resolvedCapabilities.supportedGatewayBinds),
      installDaemon: DEFAULT_INSTALL_DAEMON,
      skipHealthCheck: DEFAULT_SKIP_HEALTH_CHECK,
      workspace: resolveSuggestedWorkspace(),
    },
    supportedAuthChoices: [...resolvedCapabilities.supportedAuthChoices],
    supportedDaemonRuntimes: [...resolvedCapabilities.supportedDaemonRuntimes],
    supportedFlows: [...resolvedCapabilities.supportedFlows],
    supportedGatewayAuthModes: [...resolvedCapabilities.supportedGatewayAuthModes],
    supportedSecretInputModes: [...resolvedCapabilities.supportedSecretInputModes],
    supportedGatewayTokenInputModes: [...resolvedCapabilities.supportedGatewayTokenInputModes],
    supportedGatewayBinds: [...resolvedCapabilities.supportedGatewayBinds],
    capabilityDetection: resolvedCapabilities.capabilityDetection,
    service: service || getLalaClawServiceStatus(),
  };
}

function createUnsupportedAuthChoiceError() {
  return createOpenClawOnboardingError('Unsupported OpenClaw onboarding auth choice', 400, 'unsupported_auth_choice');
}

function createMissingValueError(fieldName = '') {
  return createOpenClawOnboardingError(`Missing required onboarding value: ${fieldName}`, 400, 'missing_required_value', fieldName);
}

function createUnsupportedSecretInputModeError() {
  return createOpenClawOnboardingError('Unsupported OpenClaw onboarding secret input mode', 400, 'unsupported_secret_input_mode');
}

function createUnsupportedGatewayAuthModeError() {
  return createOpenClawOnboardingError('Unsupported OpenClaw onboarding gateway auth mode', 400, 'unsupported_gateway_auth_mode');
}

function createUnsupportedGatewayTokenInputModeError() {
  return createOpenClawOnboardingError('Unsupported OpenClaw onboarding gateway token input mode', 400, 'unsupported_gateway_token_input_mode');
}

function createUnsupportedDaemonRuntimeError() {
  return createOpenClawOnboardingError('Unsupported OpenClaw onboarding daemon runtime', 400, 'unsupported_daemon_runtime');
}

function createUnsupportedFlowError() {
  return createOpenClawOnboardingError('Unsupported OpenClaw onboarding flow', 400, 'unsupported_onboarding_flow');
}

function normalizeNonEmptyValue(rawValue = '') {
  const normalized = String(rawValue || '').trim();
  return normalized || '';
}

function normalizeBooleanValue(rawValue: any, fallback = false) {
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function buildOnboardingArgs(options: LooseRecord = {}, capabilities: LooseRecord | null = null) {
  const resolvedCapabilities = resolveCapabilityValues(capabilities);
  const authChoice = normalizeNonEmptyValue(options.authChoice) || 'openai-api-key';
  const authDefinition = SUPPORTED_AUTH_CHOICES[authChoice];
  if (!authDefinition || !resolvedCapabilities.supportedAuthChoices.includes(authChoice)) {
    throw createUnsupportedAuthChoiceError();
  }
  const flow = normalizeNonEmptyValue(options.flow) || DEFAULT_ONBOARDING_FLOW;
  if (!resolvedCapabilities.supportedFlows.includes(flow)) {
    throw createUnsupportedFlowError();
  }

  const secretInputMode = normalizeNonEmptyValue(options.secretInputMode) || DEFAULT_SECRET_INPUT_MODE;
  if (!resolvedCapabilities.supportedSecretInputModes.includes(secretInputMode)) {
    throw createUnsupportedSecretInputModeError();
  }

  const apiKey = normalizeNonEmptyValue(options.apiKey);
  if (authDefinition.key && secretInputMode === 'plaintext' && !apiKey) {
    throw createMissingValueError('apiKey');
  }

  const gatewayBind = normalizeNonEmptyValue(options.gatewayBind) || DEFAULT_GATEWAY_BIND;
  if (!resolvedCapabilities.supportedGatewayBinds.includes(gatewayBind)) {
    throw createMissingValueError('gatewayBind');
  }

  const gatewayAuth = normalizeNonEmptyValue(options.gatewayAuth) || DEFAULT_GATEWAY_AUTH;
  if (!resolvedCapabilities.supportedGatewayAuthModes.includes(gatewayAuth)) {
    throw createUnsupportedGatewayAuthModeError();
  }

  const gatewayTokenInputMode = normalizeNonEmptyValue(options.gatewayTokenInputMode) || 'plaintext';
  if (!resolvedCapabilities.supportedGatewayTokenInputModes.includes(gatewayTokenInputMode)) {
    throw createUnsupportedGatewayTokenInputModeError();
  }

  const gatewayPassword = normalizeNonEmptyValue(options.gatewayPassword);
  const gatewayToken = normalizeNonEmptyValue(options.gatewayToken);
  const gatewayTokenRefEnv = normalizeNonEmptyValue(options.gatewayTokenRefEnv);
  const installDaemon = normalizeBooleanValue(options.installDaemon, DEFAULT_INSTALL_DAEMON);
  const skipHealthCheck = normalizeBooleanValue(options.skipHealthCheck, DEFAULT_SKIP_HEALTH_CHECK);
  const daemonRuntime = normalizeNonEmptyValue(options.daemonRuntime) || DEFAULT_DAEMON_RUNTIME;
  if (gatewayAuth === 'password' && !gatewayPassword) {
    throw createMissingValueError('gatewayPassword');
  }
  if (gatewayAuth === 'token' && gatewayTokenInputMode === 'plaintext' && !gatewayToken) {
    throw createMissingValueError('gatewayToken');
  }
  if (gatewayAuth === 'token' && gatewayTokenInputMode === 'ref' && !gatewayTokenRefEnv) {
    throw createMissingValueError('gatewayTokenRefEnv');
  }
  if (installDaemon && !resolvedCapabilities.supportedDaemonRuntimes.includes(daemonRuntime)) {
    throw createUnsupportedDaemonRuntimeError();
  }

  const customBaseUrl = normalizeNonEmptyValue(options.customBaseUrl);
  const customCompatibility = normalizeNonEmptyValue(options.customCompatibility) || 'openai';
  const customModelId = normalizeNonEmptyValue(options.customModelId);
  const customProviderId = normalizeNonEmptyValue(options.customProviderId);
  const token = normalizeNonEmptyValue(options.token);
  const tokenExpiresIn = normalizeNonEmptyValue(options.tokenExpiresIn);
  const tokenProfileId = normalizeNonEmptyValue(options.tokenProfileId);
  const tokenProvider = normalizeNonEmptyValue(options.tokenProvider);
  for (const requiredField of authDefinition.requires || []) {
    if (!normalizeNonEmptyValue(options[requiredField])) {
      throw createMissingValueError(requiredField);
    }
  }

  const args = [
    'onboard',
    '--non-interactive',
    '--accept-risk',
    '--mode',
    'local',
    '--flow',
    flow,
    '--secret-input-mode',
    secretInputMode,
    '--auth-choice',
    authChoice,
    '--gateway-bind',
    gatewayBind,
    '--skip-channels',
    '--json',
  ];

  const workspace = normalizeNonEmptyValue(options.workspace);
  if (workspace) {
    args.push('--workspace', workspace);
  }

  if (installDaemon) {
    args.push('--install-daemon', '--daemon-runtime', daemonRuntime);
  } else {
    args.push('--no-install-daemon');
  }

  if (skipHealthCheck) {
    args.push('--skip-health');
  }

  if (gatewayAuth === 'token') {
    args.push('--gateway-auth', 'token');
    if (gatewayTokenInputMode === 'ref') {
      args.push('--gateway-token-ref-env', gatewayTokenRefEnv);
    } else {
      args.push('--gateway-token', gatewayToken);
    }
  } else if (gatewayAuth === 'password') {
    args.push('--gateway-auth', 'password', '--gateway-password', gatewayPassword);
  }

  args.push(...authDefinition.buildArgs({
    apiKey,
    customBaseUrl,
    customCompatibility,
    customModelId,
    customProviderId,
    secretInputMode,
    token,
    tokenExpiresIn,
    tokenProfileId,
    tokenProvider,
  }));

  return args;
}

export function createOpenClawOnboardingService({
  config,
  execFileAsync,
  fetchImpl = global.fetch,
}: LooseRecord) {
  if (typeof execFileAsync !== 'function') {
    throw new Error('execFileAsync is required');
  }

  const openclawBin = String(config?.openclawBin || 'openclaw').trim() || 'openclaw';
  let cachedCapabilitySnapshot: CapabilitySnapshot | null = null;

  async function runOpenClawCommand(args: string[] = []) {
    try {
      const response = await execFileAsync(openclawBin, args, {
        timeout: DEFAULT_ONBOARDING_TIMEOUT_MS,
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

  async function getSupportedOnboardingCapabilities(signature = '', options: LooseRecord = {}) {
    const normalizedSignature = String(signature || '').trim() || openclawBin;
    const forceRefresh = Boolean(options?.forceRefresh);
    if (
      !forceRefresh
      && 
      cachedCapabilitySnapshot
      && cachedCapabilitySnapshot.signature === normalizedSignature
      && cachedCapabilitySnapshot.capabilities
    ) {
      return {
        ...cachedCapabilitySnapshot.capabilities,
        capabilityDetection: buildCapabilityDetection({
          ...(cachedCapabilitySnapshot.capabilities.capabilityDetection || {}),
          source: 'help-cache',
          signature: normalizedSignature,
        }),
      };
    }

    const helpCommandResult = await runOpenClawCommand(['onboard', '--help']);
    const detectedAt = new Date().toISOString();
    if (!helpCommandResult.ok) {
      return {
        ...buildStaticOnboardingCapabilities(),
        capabilityDetection: buildCapabilityDetection({
          source: 'static-fallback',
          reason: helpCommandResult.systemErrorCode === 'ENOENT' ? 'binary-missing' : 'help-command-failed',
          detectedAt,
          signature: normalizedSignature,
          commandResult: helpCommandResult,
        }),
      };
    }
    const capabilities = {
      ...parseOnboardingHelpCapabilities([
        helpCommandResult.stdout,
        helpCommandResult.stderr,
      ].filter(Boolean).join('\n')),
      capabilityDetection: buildCapabilityDetection({
        source: 'help',
        reason: '',
        detectedAt,
        signature: normalizedSignature,
        commandResult: helpCommandResult,
      }),
    };
    cachedCapabilitySnapshot = {
      signature: normalizedSignature,
      capabilities,
    };
    return capabilities;
  }

  async function getOpenClawOnboardingState(options: LooseRecord = {}) {
    const statusCommandResult = await runOpenClawCommand(['update', 'status', '--json']);
    if (!statusCommandResult.ok && statusCommandResult.systemErrorCode === 'ENOENT') {
      return buildOnboardingState({
        capabilities: {
          ...buildStaticOnboardingCapabilities(),
          capabilityDetection: buildCapabilityDetection({
            source: 'static-fallback',
            reason: 'binary-missing',
            commandResult: statusCommandResult,
          }),
        },
        installed: false,
        validation: null,
      });
    }

    const statusPayload = parseNoisyJson(statusCommandResult.stdout) || parseNoisyJson(statusCommandResult.stderr);
    if (!statusCommandResult.ok || !statusPayload) {
      throw createOpenClawOnboardingError('Failed to inspect OpenClaw onboarding state', 500, 'onboarding_state_failed');
    }

    const versionSignature = resolveOpenClawVersionSignature(statusPayload, openclawBin);
    const capabilities = await getSupportedOnboardingCapabilities(versionSignature, {
      forceRefresh: Boolean(options?.refreshCapabilities),
    });
    const configFileCommandResult = await runOpenClawCommand(['config', 'file']);
    const configPath = normalizeConfigPath(configFileCommandResult);
    const validationCommandResult = await runOpenClawCommand(['config', 'validate', '--json']);
    const validationPayload = parseNoisyJson(validationCommandResult.stdout) || parseNoisyJson(validationCommandResult.stderr);
    const validation = normalizeValidationSummary(validationCommandResult, validationPayload);

    return buildOnboardingState({
      capabilities,
      configPath,
      installed: true,
      validation,
    });
  }

  async function runOpenClawOnboarding(options: LooseRecord = {}) {
    const currentState = await getOpenClawOnboardingState();
    if (!currentState.installed) {
      throw createOpenClawOnboardingError('OpenClaw is not installed on this machine', 400, 'openclaw_not_installed');
    }

    const installDaemon = normalizeBooleanValue(options.installDaemon, DEFAULT_INSTALL_DAEMON);
    const args = buildOnboardingArgs(options, currentState);
    const commandResult = await runOpenClawCommand(args);
    const resultPayload = parseNoisyJson(commandResult.stdout) || parseNoisyJson(commandResult.stderr);
    const healthCheck = await performHealthCheck(config, { fetchImpl });
    const nextState = await getOpenClawOnboardingState();
    const healthStatus = String(healthCheck?.status || 'unknown');
    const ok = Boolean(commandResult.ok)
      && Boolean(nextState?.ready)
      && (!installDaemon || ['healthy', 'unknown'].includes(healthStatus));

    return {
      ok,
      action: 'onboard',
      commandResult,
      capabilityDetection: nextState?.capabilityDetection || currentState?.capabilityDetection || buildCapabilityDetection(),
      result: resultPayload,
      healthCheck,
      state: nextState,
      errorCode: '',
      error: '',
    };
  }

  return {
    getOpenClawOnboardingState,
    runOpenClawOnboarding,
  };
}
