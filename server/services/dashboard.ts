const fs = require('node:fs');
const path = require('node:path');

type LooseRecord = Record<string, any>;
type DashboardEntry = LooseRecord & {
  content?: string;
  role?: string;
  timestamp?: number;
};
type DashboardSnapshotOverrides = {
  agentId?: string;
  fastMode?: boolean;
  model?: string;
  thinkMode?: string;
};
type EnvironmentItem = {
  label: string;
  previewable?: boolean;
  revealable?: boolean;
  value: string;
};
type DirectoryPreviewEntry = {
  kind?: string;
  name?: string;
  [key: string]: any;
};
type DashboardEnvironmentPeekInput = {
  agentId?: string;
  fastMode?: boolean;
  latestModel?: string;
  liveConfig?: LooseRecord | null;
  parsedStatus?: LooseRecord | null;
  selectedModel?: string;
  sessionKey?: string;
  sessionUser?: string;
  sessionVersion?: string;
  thinkMode?: string;
  workspaceRoot?: string;
};
type DashboardServiceOptions = {
  HOST: string;
  PORT: number;
  PROJECT_ROOT: string;
  buildAgentGraph: () => LooseRecord[];
  callOpenClawGateway: (method: string, payload?: LooseRecord) => Promise<LooseRecord | null>;
  clip: (value: unknown, length?: number) => string;
  collectAllowedSubagents: (localConfig: LooseRecord | null, agentId: string) => string[];
  collectArtifacts: (entries: LooseRecord[]) => LooseRecord[];
  collectAvailableAgents: (localConfig: LooseRecord | null, preferred?: string[]) => string[];
  collectAvailableModels: (localConfig: LooseRecord | null, preferred?: string[]) => string[];
  collectAvailableSkills: (localConfig: LooseRecord | null, agentId: string) => LooseRecord[];
  collectConversationMessages: (entries: LooseRecord[]) => DashboardEntry[];
  collectFiles: (entries: LooseRecord[], roots: string[], options?: LooseRecord) => LooseRecord[];
  collectLatestRunUsage: (entries: LooseRecord[]) => LooseRecord | null;
  collectSnapshots: (entries: LooseRecord[], sessionRecord?: LooseRecord | null) => LooseRecord[];
  collectTaskRelationships: (entries: LooseRecord[], agentId?: string) => LooseRecord[];
  collectTaskTimeline: (entries: LooseRecord[], roots: string[], options?: LooseRecord) => LooseRecord[];
  collectToolHistory: (entries: LooseRecord[]) => LooseRecord[];
  config: LooseRecord;
  countWorkspaceFiles?: (rootDir: string) => number;
  extractTextSegments: (content: LooseRecord[] | null | undefined) => string[];
  fetchBrowserPeek: () => Promise<LooseRecord>;
  findLatestSessionForAgent: (agentId: string) => LooseRecord | null;
  formatTimestamp: (value: unknown) => string;
  formatTokenBadge: (usage: LooseRecord | null) => string;
  getCommandCenterSessionKey: (agentId: string, sessionUser?: string) => string;
  getDefaultModelForAgent: (agentId: string) => string;
  getLocalSessionConversation: (sessionUser?: string) => DashboardEntry[];
  getLocalSessionFileEntries: (sessionUser?: string) => LooseRecord[];
  getOpenClawOperationSummary?: () => LooseRecord;
  getRuntimeHubDebugInfo?: (input?: { agentId?: string; sessionUser?: string }) => LooseRecord | null;
  getTranscriptEntriesForSession?: (agentId: string, sessionRecord: LooseRecord | null, sessionKey: string, limit?: number) => LooseRecord[];
  getTranscriptPath: (agentId: string, sessionId: string) => string;
  invokeOpenClawTool: (toolName: string, args?: LooseRecord, sessionKey?: string) => Promise<LooseRecord | null>;
  lalaclawVersion?: string;
  listDirectoryPreview: (rootDir: string) => DirectoryPreviewEntry[];
  listImSessionsForAgent: (agentId: string) => LooseRecord[];
  listWorkspaceFiles?: (rootDir: string, options?: { limit?: number }) => LooseRecord[];
  normalizeSessionUser: (sessionUser?: string) => string;
  parseSessionStatusText: (statusText: string) => LooseRecord | null;
  readJsonLines: (filePath: string) => LooseRecord[];
  readTextIfExists: (filePath: string) => string;
  resolveAgentDisplayName: (agentId: string) => string;
  resolveAgentWorkspace?: (agentId: string) => string;
  resolveSessionAgentId: (sessionUser?: string) => string;
  resolveSessionFastMode: (sessionUser?: string) => boolean;
  resolveSessionModel: (sessionUser?: string, agentId?: string) => string;
  resolveSessionRecord: (agentId: string, sessionKey: string) => LooseRecord | null;
  resolveSessionThinkMode: (sessionUser?: string) => string;
  tailLines: (text: string, limit?: number) => string[];
};

const DUPLICATE_CONVERSATION_TURN_WINDOW_MS = 90 * 1000;
const DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS = 5 * 1000;
const DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_WORKSPACE_FILE_LIMIT = 200;
const DEFAULT_FRONTEND_URL = 'http://127.0.0.1:5173';
const LALACLAW_VERSION = (() => {
  try {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return String(packageJson?.version || '').trim();
  } catch {
    return '';
  }
})();

function normalizeConversationContent(content = ''): string {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collapseDuplicateConversationTurns(entries: DashboardEntry[] = []): DashboardEntry[] {
  const collapsed: DashboardEntry[] = [];
  let lastUserFingerprint = '';
  let lastUserTimestamp = 0;
  let lastAssistantTimestamp = 0;
  let lastAssistantFingerprint = '';
  let assistantSeenForCurrentTurn = false;
  let pendingReplayBeforeAssistant = false;
  let suppressAssistantReplay = false;

  for (const entry of entries) {
    if (!entry?.role || !entry?.content) {
      continue;
    }

    if (entry.role === 'user') {
      const fingerprint = normalizeConversationContent(entry.content);
      const timestamp = Number(entry.timestamp || 0);
      const withinShortReplayWindow =
        timestamp > 0
        && lastUserTimestamp > 0
        && timestamp - lastUserTimestamp <= DUPLICATE_CONVERSATION_TURN_WINDOW_MS;
      const immediateAssistantReplay =
        timestamp > 0
        && lastAssistantTimestamp > 0
        && lastUserTimestamp > 0
        && timestamp - lastAssistantTimestamp <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS
        && timestamp - lastUserTimestamp <= DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS;
      const isReplay =
        Boolean(fingerprint)
        && fingerprint === lastUserFingerprint
        && (
          (assistantSeenForCurrentTurn && (withinShortReplayWindow || immediateAssistantReplay))
          || (!assistantSeenForCurrentTurn && withinShortReplayWindow)
        );

      if (isReplay) {
        if (!assistantSeenForCurrentTurn && withinShortReplayWindow) {
          pendingReplayBeforeAssistant = true;
          suppressAssistantReplay = false;
          continue;
        }
        suppressAssistantReplay = true;
        continue;
      }

      collapsed.push(entry);
      lastUserFingerprint = fingerprint;
      lastUserTimestamp = timestamp;
      assistantSeenForCurrentTurn = false;
      lastAssistantFingerprint = '';
      pendingReplayBeforeAssistant = false;
      suppressAssistantReplay = false;
      continue;
    }

    if (entry.role === 'assistant') {
      const fingerprint = normalizeConversationContent(entry.content);
      const timestamp = Number(entry.timestamp || 0);
      const isImmediateDuplicateAssistant =
        assistantSeenForCurrentTurn
        && !pendingReplayBeforeAssistant
        && !suppressAssistantReplay
        && Boolean(fingerprint)
        && fingerprint === lastAssistantFingerprint
        && timestamp > 0
        && lastAssistantTimestamp > 0
        && timestamp - lastAssistantTimestamp <= DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS;

      if (isImmediateDuplicateAssistant) {
        continue;
      }

      if (pendingReplayBeforeAssistant) {
        collapsed.push(entry);
        assistantSeenForCurrentTurn = true;
        lastAssistantTimestamp = timestamp;
        lastAssistantFingerprint = fingerprint;
        pendingReplayBeforeAssistant = false;
        suppressAssistantReplay = true;
        continue;
      }

      if (suppressAssistantReplay) {
        suppressAssistantReplay = false;
        assistantSeenForCurrentTurn = true;
        lastAssistantTimestamp = timestamp;
        lastAssistantFingerprint = fingerprint;
        continue;
      }

      collapsed.push(entry);
      assistantSeenForCurrentTurn = true;
      lastAssistantTimestamp = timestamp;
      lastAssistantFingerprint = fingerprint;
      continue;
    }

    collapsed.push(entry);
  }

  return collapsed;
}

export function mergeConversationMessages(primary: DashboardEntry[] = [], secondary: DashboardEntry[] = []): DashboardEntry[] {
  return collapseDuplicateConversationTurns(
    [...primary, ...secondary]
      .filter((entry) => entry?.role && entry?.content)
      .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0)),
  ).slice(-80);
}

function mergeProjectedFiles(primary: LooseRecord[] = [], secondary: LooseRecord[] = []): LooseRecord[] {
  const merged = new Map<string, LooseRecord>();

  [...primary, ...secondary].forEach((item) => {
    const key = item?.fullPath || item?.path;
    if (!key || merged.has(key)) {
      return;
    }
    merged.set(key, item);
  });

  return [...merged.values()];
}

function parseImSessionIdentity(sessionUser = '') {
  const normalizedSessionUser = String(sessionUser || '').trim();
  if (!normalizedSessionUser) {
    return null;
  }

  if (normalizedSessionUser === 'dingtalk-connector' || normalizedSessionUser.includes('dingtalk-connector')) {
    return {
      type: 'dingtalk',
      chatType: '',
      peerId: normalizedSessionUser,
    };
  }

  let match = normalizedSessionUser.match(/^agent:[^:]+:(feishu|wecom):([^:]+):(.+)$/i);
  if (!match) {
    match = normalizedSessionUser.match(/^(feishu|wecom):([^:]+):(.+)$/i);
  }

  if (!match) {
    return null;
  }

  return {
    type: String(match[1] || '').trim().toLowerCase(),
    chatType: String(match[2] || '').trim().toLowerCase(),
    peerId: String(match[3] || '').trim(),
  };
}

function isImBootstrapSessionUser(sessionUser = '') {
  const identity = parseImSessionIdentity(sessionUser);
  if (!identity?.type) {
    return false;
  }

  return identity.type === 'dingtalk'
    ? String(sessionUser || '').trim() === 'dingtalk-connector'
    : identity.peerId === 'default';
}

function isRoutableImSessionUser(sessionUser = '') {
  const identity = parseImSessionIdentity(sessionUser);
  if (!identity?.type) {
    return false;
  }

  return !isImBootstrapSessionUser(sessionUser);
}

function serializeEnvironmentValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeEnvironmentValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function directoryHasVisibleChildren(targetPath: string): boolean {
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    return entries.some((entry: any) => entry?.name && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.git');
  } catch {
    return false;
  }
}

function pathExists(targetPath: string): boolean {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function directoryExists(targetPath: string): boolean {
  try {
    return Boolean(targetPath) && fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(targetPath: string): boolean {
  try {
    return Boolean(targetPath) && fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function buildEnvironmentItem(label: string, value: string, {
  previewable = false,
  revealable = false,
} = {}) {
  return {
    label,
    value,
    ...(previewable ? { previewable: true } : {}),
    ...(revealable ? { revealable: true } : {}),
  };
}

function defaultListWorkspaceFiles(rootDir: string, {
  limit = DEFAULT_WORKSPACE_FILE_LIMIT,
}: { limit?: number } = {}): LooseRecord[] {
  const normalizedRoot = String(rootDir || '').trim();
  if (!normalizedRoot || !path.isAbsolute(normalizedRoot)) {
    return [];
  }

  try {
    return fs
      .readdirSync(normalizedRoot, { withFileTypes: true })
      .filter((entry: any) => entry?.name && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.git')
      .sort((left: any, right: any) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
      })
      .slice(0, limit)
      .map((entry: any) => {
        const fullPath = path.join(normalizedRoot, entry.name);
        return {
          name: entry.name,
          path: fullPath,
          fullPath,
          kind: entry.isDirectory() ? '目录' : '文件',
          hasChildren: entry.isDirectory() ? directoryHasVisibleChildren(fullPath) : false,
          source: 'workspace',
        };
      });
  } catch {
    return [];
  }
}

function defaultCountWorkspaceFiles(rootDir: string): number {
  const normalizedRoot = String(rootDir || '').trim();
  if (!normalizedRoot || !path.isAbsolute(normalizedRoot)) {
    return 0;
  }

  let total = 0;
  const pendingDirectories = [normalizedRoot];

  while (pendingDirectories.length) {
    const currentDirectory = pendingDirectories.pop();
    let entries: any[] = [];

    try {
      entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry?.name || entry.name.startsWith('.') || entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        total += 1;
      }
    }
  }

  return total;
}

function flattenEnvironmentObject(value: unknown, prefix = '', items: EnvironmentItem[] = []): EnvironmentItem[] {
  if (value == null) {
    return items;
  }

  if (Array.isArray(value)) {
    if (!value.length && prefix) {
      items.push({ label: prefix, value: '[]' });
      return items;
    }

    value.forEach((item, index) => {
      flattenEnvironmentObject(item, `${prefix}[${index}]`, items);
    });
    return items;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length && prefix) {
      items.push({ label: prefix, value: '{}' });
      return items;
    }

    entries.forEach(([key, nextValue]) => {
      flattenEnvironmentObject(nextValue, prefix ? `${prefix}.${key}` : key, items);
    });
    return items;
  }

  if (prefix) {
    items.push({ label: prefix, value: serializeEnvironmentValue(value) });
  }

  return items;
}

export function createDashboardService({
  HOST,
  PORT,
  PROJECT_ROOT,
  callOpenClawGateway,
  clip,
  collectAvailableAgents,
  collectAvailableSkills,
  collectAllowedSubagents,
  collectAvailableModels,
  collectArtifacts,
  collectConversationMessages,
  collectFiles,
  collectLatestRunUsage,
  collectSnapshots,
  collectTaskRelationships,
  collectTaskTimeline,
  collectToolHistory,
  config,
  lalaclawVersion = LALACLAW_VERSION,
  extractTextSegments,
  fetchBrowserPeek,
  formatTokenBadge,
  formatTimestamp,
  getCommandCenterSessionKey,
  getDefaultModelForAgent,
  getLocalSessionFileEntries,
  getLocalSessionConversation,
  getTranscriptEntriesForSession,
  getTranscriptPath,
  getOpenClawOperationSummary,
  getRuntimeHubDebugInfo,
  invokeOpenClawTool,
  countWorkspaceFiles = defaultCountWorkspaceFiles,
  listDirectoryPreview,
  listWorkspaceFiles = defaultListWorkspaceFiles,
  normalizeSessionUser,
  findLatestSessionForAgent,
  listImSessionsForAgent,
  parseSessionStatusText,
  readJsonLines,
  readTextIfExists,
  resolveAgentDisplayName,
  resolveAgentWorkspace,
  resolveSessionAgentId,
  resolveSessionFastMode,
  resolveSessionModel,
  resolveSessionRecord,
  resolveSessionThinkMode,
  buildAgentGraph,
  tailLines,
}: DashboardServiceOptions) {
  let liveConfigCache = {
    fetchedAt: 0,
    value: null as LooseRecord | null,
  };
  let liveConfigFetchPromise: Promise<LooseRecord | null> | null = null;

  function inferOpenClawSessionStatus(parsedStatus: LooseRecord | null, conversation: DashboardEntry[] = []): string {
    const latestUserTimestamp = [...conversation]
      .reverse()
      .find((entry) => entry?.role === 'user')
      ?.timestamp || 0;
    const latestAssistantTimestamp = [...conversation]
      .reverse()
      .find((entry) => entry?.role === 'assistant')
      ?.timestamp || 0;

    if (latestUserTimestamp && (!latestAssistantTimestamp || latestUserTimestamp > latestAssistantTimestamp)) {
      return '运行中';
    }

    const runtimeDisplay = String(parsedStatus?.runtimeDisplay || '');
    if (/running|thinking|dispatch|进行|执行中|处理中|思考中/i.test(runtimeDisplay)) {
      return '运行中';
    }

    const queueDisplay = String(parsedStatus?.queueDisplay || '');
    if (/\bdepth\s*[1-9]\d*\b/i.test(queueDisplay)) {
      return '运行中';
    }

    return '就绪';
  }

  async function resolveLiveConfig(): Promise<LooseRecord | null> {
    if (config.mode !== 'openclaw') {
      return config.localConfig;
    }

    if (liveConfigCache.value && Date.now() - liveConfigCache.fetchedAt < 60000) {
      return liveConfigCache.value;
    }

    if (liveConfigFetchPromise) {
      return await liveConfigFetchPromise;
    }

    liveConfigFetchPromise = (async () => {
      try {
        const result = await callOpenClawGateway('config.get');
        const nextConfig =
          result?.config ||
          result?.resolved ||
          result?.parsed ||
          (result?.agents?.list ? result : null);

        if (nextConfig?.agents?.list) {
          liveConfigCache = {
            fetchedAt: Date.now(),
            value: nextConfig,
          };
          return nextConfig;
        }
      } catch {}

      return config.localConfig;
    })();

    try {
      return await liveConfigFetchPromise;
    } finally {
      liveConfigFetchPromise = null;
    }
  }

  function buildWorkspacePeek(workspaceRoot = config.workspaceRoot) {
    const projectEntries = listDirectoryPreview(PROJECT_ROOT);
    const agentEntries = listDirectoryPreview(workspaceRoot);

    return {
      summary: '当前项目目录与 OpenClaw 主工作区的只读预览。',
      entries: listWorkspaceFiles(workspaceRoot),
      totalCount: countWorkspaceFiles(workspaceRoot),
      items: [
        { label: '当前项目', value: PROJECT_ROOT },
        { label: 'Agent 工作区', value: workspaceRoot },
        { label: '项目内容', value: projectEntries.map((item: DirectoryPreviewEntry) => `${item.kind === 'dir' ? '目录' : '文件'} ${item.name}`).join(' · ') || '暂无内容' },
        { label: '工作区内容', value: agentEntries.map((item: DirectoryPreviewEntry) => `${item.kind === 'dir' ? '目录' : '文件'} ${item.name}`).join(' · ') || '暂无内容' },
      ],
    };
  }

  function buildTerminalPeek() {
    const gatewayLogLines = tailLines(readTextIfExists(`${config.logsDir}/gateway.log`), 5);

    return {
      summary: '本地服务端口与最近日志。',
      items: [
        { label: 'CommandCenter', value: `http://${HOST}:${PORT}` },
        { label: 'OpenClaw Gateway', value: config.mode === 'openclaw' ? config.baseUrl : '未连接' },
        { label: '最近日志', value: gatewayLogLines.length ? gatewayLogLines.join(' | ') : '暂无日志' },
      ],
    };
  }

  function buildEnvironmentPeek({
    agentId,
    fastMode,
    latestModel,
    liveConfig,
    parsedStatus,
    selectedModel,
    sessionUser,
    sessionKey,
    sessionVersion,
    thinkMode,
    workspaceRoot,
  }: DashboardEnvironmentPeekInput) {
    const items: EnvironmentItem[] = [];
    const normalizedAgentId = String(agentId || '').trim();
    const normalizedSelectedModel = String(selectedModel || '').trim();
    const normalizedWorkspaceRoot = String(workspaceRoot || '').trim();
    const openClawVersion =
      parsedStatus?.versionDisplay ||
      liveConfig?.version ||
      liveConfig?.gateway?.version ||
      sessionVersion ||
      '';
    const localConfigPath = String(config.localConfigPath || '').trim();
    const logsDir = String(config.logsDir || '').trim();
    const gatewayLogPath = logsDir ? path.join(logsDir, 'gateway.log') : '';
    const supervisorLogPath = logsDir ? path.join(logsDir, 'supervisor.log') : '';
    const configExists = pathExists(localConfigPath);
    const workspaceExists = directoryExists(normalizedWorkspaceRoot);
    const logsAvailable = directoryExists(logsDir) || pathExists(gatewayLogPath) || pathExists(supervisorLogPath);
    const liveGatewayDetected =
      config.mode === 'openclaw'
      && Boolean(
        parsedStatus?.sessionKey
        || parsedStatus?.runtimeDisplay
        || parsedStatus?.time
        || (liveConfig && liveConfig !== config.localConfig),
      );
    const gatewayStatus = config.mode === 'openclaw' ? (liveGatewayDetected ? 'ok' : 'unreachable') : 'mock';
    const doctorConfig = configExists ? 'ok' : 'missing';
    const doctorWorkspace = workspaceExists ? 'ok' : 'missing';
    const doctorGateway = gatewayStatus;
    const doctorLogs = logsAvailable ? 'ok' : 'missing';
    const openClawOperationSummary =
      typeof getOpenClawOperationSummary === 'function'
        ? getOpenClawOperationSummary()
        : { count: 0, lastEntry: null };
    const doctorSummary =
      config.mode !== 'openclaw'
        ? 'mock'
        : [doctorConfig, doctorWorkspace, doctorGateway, doctorLogs].every((status) => status === 'ok')
          ? 'healthy'
          : 'attention';
    let gatewayHealthUrl = '';

    if (config.baseUrl) {
      try {
        gatewayHealthUrl = new URL('/healthz', config.baseUrl).toString();
      } catch {
        gatewayHealthUrl = '';
      }
    }

    const diagnosticsItems = [
      buildEnvironmentItem('openclaw.version', openClawVersion || 'unknown'),
      buildEnvironmentItem('openclaw.runtime.profile', config.mode || 'unknown'),
      buildEnvironmentItem('openclaw.config.path', localConfigPath || '', { previewable: fileExists(localConfigPath) }),
      buildEnvironmentItem('openclaw.config.status', doctorConfig),
      buildEnvironmentItem('openclaw.workspace.root', normalizedWorkspaceRoot, { revealable: directoryExists(normalizedWorkspaceRoot) }),
      buildEnvironmentItem('openclaw.workspace.status', doctorWorkspace),
      buildEnvironmentItem('openclaw.gateway.status', gatewayStatus),
      buildEnvironmentItem('openclaw.gateway.baseUrl', config.baseUrl || ''),
      buildEnvironmentItem('openclaw.gateway.healthUrl', gatewayHealthUrl),
      buildEnvironmentItem('openclaw.doctor.summary', doctorSummary),
      buildEnvironmentItem('openclaw.doctor.config', doctorConfig),
      buildEnvironmentItem('openclaw.doctor.workspace', doctorWorkspace),
      buildEnvironmentItem('openclaw.doctor.gateway', doctorGateway),
      buildEnvironmentItem('openclaw.doctor.logs', doctorLogs),
      buildEnvironmentItem('openclaw.logs.dir', logsDir || '', { revealable: directoryExists(logsDir) }),
      buildEnvironmentItem('openclaw.logs.gatewayPath', gatewayLogPath, { previewable: fileExists(gatewayLogPath) }),
      buildEnvironmentItem('openclaw.logs.supervisorPath', supervisorLogPath, { previewable: fileExists(supervisorLogPath) }),
      buildEnvironmentItem('openclaw.remote.target', config.remoteOpenClawTarget ? 'remote' : 'local'),
      buildEnvironmentItem('openclaw.remote.writeAccess', config.remoteOpenClawTarget ? 'blocked' : 'local'),
      buildEnvironmentItem('openclaw.remote.auditCount', String(openClawOperationSummary.count || 0)),
      buildEnvironmentItem('openclaw.remote.lastAction', openClawOperationSummary.lastEntry?.action || ''),
      buildEnvironmentItem('openclaw.remote.lastOutcome', openClawOperationSummary.lastEntry?.outcome || ''),
      buildEnvironmentItem('openclaw.remote.lastRollback', openClawOperationSummary.lastEntry?.rolledBack ? 'restored' : ''),
    ];
    diagnosticsItems.forEach((item) => {
      if (item.value) {
        items.push(item);
      }
    });
    const sessionItems = [
      buildEnvironmentItem('LALACLAW.VERSION', lalaclawVersion),
      buildEnvironmentItem('LALACLAW.FRONTEND_URL', DEFAULT_FRONTEND_URL),
      buildEnvironmentItem('LALACLAW.SERVER_URL', HOST && PORT ? `http://${HOST}:${PORT}` : ''),
      buildEnvironmentItem('LALACLAW.ACCESS_MODE', config.accessMode || 'off'),
      buildEnvironmentItem('LALACLAW.GATEWAY_AUTH', config.apiKey ? 'token' : 'none'),
      buildEnvironmentItem('OPENCLAW.VERSION', openClawVersion),
      buildEnvironmentItem('session.mode', config.mode),
      buildEnvironmentItem('session.agent', normalizedAgentId),
      buildEnvironmentItem('session.sessionKey', sessionKey || parsedStatus?.sessionKey || ''),
      buildEnvironmentItem('session.workspaceRoot', normalizedWorkspaceRoot, { revealable: directoryExists(normalizedWorkspaceRoot) }),
      buildEnvironmentItem('session.selectedModel', normalizedSelectedModel),
      buildEnvironmentItem('session.resolvedModel', latestModel || parsedStatus?.modelDisplay || ''),
      buildEnvironmentItem('session.auth', parsedStatus?.authDisplay || ''),
      buildEnvironmentItem('session.runtime', parsedStatus?.runtimeDisplay || ''),
      buildEnvironmentItem('session.thinkMode', parsedStatus?.thinkMode || thinkMode || ''),
      buildEnvironmentItem('session.fastMode', fastMode ? 'on' : 'off'),
      buildEnvironmentItem('session.context', parsedStatus?.contextDisplay || ''),
      buildEnvironmentItem('session.queue', parsedStatus?.queueDisplay || ''),
      buildEnvironmentItem('session.time', parsedStatus?.time || ''),
      buildEnvironmentItem('gateway.baseUrl', config.baseUrl || ''),
      buildEnvironmentItem('gateway.port', String(config.gatewayPort || '')),
      buildEnvironmentItem('gateway.healthPort', String(config.healthPort || '')),
      buildEnvironmentItem('gateway.apiPath', config.apiPath || ''),
      buildEnvironmentItem('gateway.apiStyle', config.apiStyle || ''),
    ];

    sessionItems.forEach((item) => {
      if (item.value) {
        items.push(item);
      }
    });

    flattenEnvironmentObject(liveConfig?.gateway || {}, 'gateway.config', items);
    flattenEnvironmentObject(
      typeof getRuntimeHubDebugInfo === 'function'
        ? getRuntimeHubDebugInfo({ sessionUser, agentId })
        : null,
      'runtimeHub',
      items,
    );

    return {
      summary: '',
      items,
    };
  }

  function buildMockSnapshot(sessionUser = 'command-center', overrides: DashboardSnapshotOverrides = {}) {
    const now = Date.now();
    const forcedAgentId = String(overrides?.agentId || '').trim();
    const forcedModel = String(overrides?.model || '').trim();
    const forcedThinkMode = String(overrides?.thinkMode || '').trim();
    const agentId = forcedAgentId || resolveSessionAgentId(sessionUser);
    const agentLabel = resolveAgentDisplayName(agentId);
    const workspaceRoot = typeof resolveAgentWorkspace === 'function' ? resolveAgentWorkspace(agentId) : config.workspaceRoot;
    const model = forcedModel || resolveSessionModel(sessionUser, agentId);
    const fastMode = typeof overrides?.fastMode === 'boolean' ? overrides.fastMode : resolveSessionFastMode(sessionUser);
    const thinkMode = forcedThinkMode || resolveSessionThinkMode(sessionUser);
    const localConversation = getLocalSessionConversation(sessionUser);
    const localFileEntries = getLocalSessionFileEntries(sessionUser);
    const localFiles = collectFiles(localFileEntries, [PROJECT_ROOT, workspaceRoot], { injectedFiles: [] });
    const latestAssistantMessage = [...localConversation].reverse().find((entry) => entry?.role === 'assistant');
    const availableMentionAgents = collectAllowedSubagents(config.localConfig, agentId);
    const availableSkills = collectAvailableSkills(config.localConfig, agentId);
    return {
      session: {
        mode: 'mock',
        model,
        selectedModel: model,
        agentId,
        agentLabel,
        selectedAgentId: agentId,
        sessionUser: String(sessionUser || 'command-center').trim() || 'command-center',
        sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
        workspaceRoot,
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
        availableMentionAgents,
        availableSkills,
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
            { path: 'src/App.jsx', kind: '文件', updatedLabel: formatTimestamp(now) },
          ],
          snapshots: [{ id: `snapshot-${now}`, title: `快照 ${formatTimestamp(now)}`, detail: 'mock 会话快照', timestamp: now }],
          outcome: 'mock 模式下的演示执行。',
        },
      ],
      taskRelationships: [] as LooseRecord[],
      toolHistory: [
        { name: 'workspace.scan', status: '完成', detail: '已扫描当前项目目录。', timestamp: now },
        { name: fastMode ? 'planner.fast-path' : 'planner.standard-path', status: '完成', detail: '已生成最小可运行原型。', timestamp: now },
      ],
      conversation: localConversation,
      files: mergeProjectedFiles(localFiles, [
        { path: 'server.js', kind: '文件' },
        { path: 'src/App.jsx', kind: '文件' },
      ]),
      artifacts: [
        {
          title: '当前回复',
          type: 'assistant_output',
          detail: 'mock 模式下的演示输出。',
          messageRole: 'assistant',
          messageTimestamp: latestAssistantMessage?.timestamp || now,
          timestamp: now,
        },
      ],
      snapshots: [
        { id: `snapshot-${now}`, title: `快照 ${formatTimestamp(now)}`, detail: 'mock 会话快照', timestamp: now },
      ],
      agents: [
        { id: agentId, label: agentId, state: 'active', detail: `主 Agent · ${clip(model, 42)}`, updatedAt: now, sessionCount: 1 },
      ],
      peeks: {
        workspace: buildWorkspacePeek(workspaceRoot),
        terminal: buildTerminalPeek(),
        browser: { summary: 'mock 模式未接入浏览器控制。', items: [{ label: '状态', value: '未连接 OpenClaw' }] },
        environment: buildEnvironmentPeek({
          agentId,
          fastMode,
          latestModel: model,
          liveConfig: config.localConfig,
          parsedStatus: {
            contextDisplay: '0 / 16000',
            queueDisplay: 'none',
            runtimeDisplay: 'mock',
            thinkMode,
            versionDisplay: 'mock',
          },
          selectedModel: model,
          sessionUser,
          sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
          sessionVersion: 'mock',
          thinkMode,
          workspaceRoot,
        }),
      },
    };
  }

  async function buildOpenClawSnapshot(sessionUser = 'command-center', overrides: DashboardSnapshotOverrides = {}) {
    const forcedAgentId = String(overrides?.agentId || '').trim();
    const forcedModel = String(overrides?.model || '').trim();
    const forcedThinkMode = String(overrides?.thinkMode || '').trim();
    const agentId = forcedAgentId || resolveSessionAgentId(sessionUser);
    let effectiveSessionUser = sessionUser;

    if (typeof listImSessionsForAgent === 'function' && isImBootstrapSessionUser(effectiveSessionUser)) {
      const requestedIdentity = parseImSessionIdentity(effectiveSessionUser);
      const latestImSession = listImSessionsForAgent(agentId).find((entry: LooseRecord) => {
        const candidateSessionUser = String(entry?.sessionUser || '').trim();
        const candidateIdentity = parseImSessionIdentity(candidateSessionUser);

        if (!candidateIdentity?.type || candidateIdentity.type !== requestedIdentity?.type) {
          return false;
        }

        const shouldMatchRequestedChatType =
          requestedIdentity?.chatType
          && requestedIdentity?.peerId !== 'default';

        if (shouldMatchRequestedChatType && candidateIdentity.chatType !== requestedIdentity.chatType) {
          return false;
        }

        return isRoutableImSessionUser(candidateSessionUser);
      });

      if (latestImSession?.sessionUser) {
        effectiveSessionUser = latestImSession.sessionUser;
      }
    }

    let sessionKey = getCommandCenterSessionKey(agentId, effectiveSessionUser);
    let sessionRecord = resolveSessionRecord(agentId, sessionKey);
    let localConversation = getLocalSessionConversation(effectiveSessionUser);
    let localFileEntries = getLocalSessionFileEntries(effectiveSessionUser);

    if (
      forcedAgentId &&
      agentId !== 'main' &&
      !sessionRecord &&
      normalizeSessionUser(effectiveSessionUser) === 'command-center' &&
      typeof findLatestSessionForAgent === 'function'
    ) {
      const latestSession = findLatestSessionForAgent(agentId);
      if (latestSession?.sessionUser) {
        effectiveSessionUser = latestSession.sessionUser;
        sessionKey = latestSession.sessionKey || getCommandCenterSessionKey(agentId, effectiveSessionUser);
        sessionRecord = latestSession.sessionRecord || resolveSessionRecord(agentId, sessionKey);
        localConversation = getLocalSessionConversation(effectiveSessionUser);
        localFileEntries = getLocalSessionFileEntries(effectiveSessionUser);
      }
    }

    const agentLabel = resolveAgentDisplayName(agentId);
    const workspaceRoot = typeof resolveAgentWorkspace === 'function' ? resolveAgentWorkspace(agentId) : config.workspaceRoot;
    const selectedModel = forcedModel || resolveSessionModel(effectiveSessionUser, agentId);
    const fastMode = typeof overrides?.fastMode === 'boolean' ? overrides.fastMode : resolveSessionFastMode(effectiveSessionUser);
    const preferredThinkMode = forcedThinkMode || resolveSessionThinkMode(effectiveSessionUser);
    const transcriptPath = sessionRecord ? getTranscriptPath(agentId, sessionRecord.sessionId) : '';
    const entries = typeof getTranscriptEntriesForSession === 'function'
      ? getTranscriptEntriesForSession(agentId, sessionRecord, sessionKey, 240)
      : transcriptPath
        ? readJsonLines(transcriptPath).slice(-240)
        : [];
    const injectedFiles = sessionRecord?.systemPromptReport?.injectedWorkspaceFiles || [];
    const [statusResult, browserPeek, liveConfig] = await Promise.all([
      invokeOpenClawTool('session_status', {}, sessionKey).catch((): null => null),
      fetchBrowserPeek().catch((): LooseRecord => ({
        summary: '浏览器状态暂时不可用。',
        items: [{ label: '状态', value: '读取失败' }],
      })),
      resolveLiveConfig(),
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
    const availableMentionAgents = collectAllowedSubagents(config.localConfig, agentId);
    const availableSkills = collectAvailableSkills(liveConfig || config.localConfig, agentId);
    const gatewayConversation = collectConversationMessages(entries);
    const mergedConversation = mergeConversationMessages(gatewayConversation, localConversation);
    const latestRunUsage = collectLatestRunUsage(entries);
    const tokenBadge = formatTokenBadge(
      latestRunUsage || {
        input: parsedStatus?.tokensInput || 0,
        output: parsedStatus?.tokensOutput || 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    );
    const resolvedVersion =
      parsedStatus?.versionDisplay ||
      liveConfig?.version ||
      liveConfig?.gateway?.version ||
      '';

    return {
      session: {
        mode: 'openclaw',
        model: latestModel,
        selectedModel,
        agentId,
        agentLabel,
        selectedAgentId: agentId,
        sessionUser: String(effectiveSessionUser || 'command-center').trim() || 'command-center',
        sessionKey: parsedStatus?.sessionKey || sessionKey,
        workspaceRoot,
        status: inferOpenClawSessionStatus(parsedStatus, mergedConversation),
        fastMode: fastMode ? '开启' : '关闭',
        thinkMode: parsedStatus?.thinkMode || preferredThinkMode,
        contextUsed: parsedStatus?.contextUsed || null,
        contextMax: parsedStatus?.contextMax || 272000,
        contextDisplay:
          parsedStatus?.contextUsed && parsedStatus?.contextMax
            ? `${parsedStatus.contextUsed} / ${parsedStatus.contextMax}`
            : parsedStatus?.contextDisplay || '',
        runtime: parsedStatus?.runtimeDisplay || '',
        queue: parsedStatus?.queueDisplay || '',
        updatedLabel: parsedStatus?.updatedLabel || '',
        updatedAt: sessionRecord?.updatedAt || null,
        tokens: tokenBadge || parsedStatus?.tokensDisplay || '',
        auth: parsedStatus?.authDisplay || '',
        version: resolvedVersion,
        time: parsedStatus?.time || '',
        availableModels,
        availableAgents,
        availableMentionAgents,
        availableSkills,
      },
      conversation: mergedConversation,
      taskRelationships: collectTaskRelationships(entries, agentId),
      taskTimeline: collectTaskTimeline(entries, [PROJECT_ROOT, config.workspaceRoot], { injectedFiles }),
      toolHistory: collectToolHistory(entries),
      files: mergeProjectedFiles(
        collectFiles([...entries, ...localFileEntries], [PROJECT_ROOT, config.workspaceRoot], { injectedFiles }),
        [],
      ),
      artifacts: collectArtifacts(entries),
      snapshots: collectSnapshots(entries, sessionRecord),
      agents: buildAgentGraph(),
      peeks: {
        workspace: buildWorkspacePeek(workspaceRoot),
        terminal: buildTerminalPeek(),
        browser: browserPeek,
        environment: buildEnvironmentPeek({
          agentId,
          fastMode,
          latestModel,
          liveConfig,
          parsedStatus,
          selectedModel,
          sessionUser: effectiveSessionUser,
          sessionKey,
          sessionVersion: resolvedVersion,
          thinkMode: parsedStatus?.thinkMode || preferredThinkMode,
          workspaceRoot,
        }),
      },
    };
  }

  async function buildDashboardSnapshot(sessionUser = 'command-center', overrides: DashboardSnapshotOverrides = {}) {
    if (config.mode !== 'openclaw') {
      return buildMockSnapshot(sessionUser, overrides);
    }
    return await buildOpenClawSnapshot(sessionUser, overrides);
  }

  return {
    buildDashboardSnapshot,
    buildMockSnapshot,
    buildOpenClawSnapshot,
    buildTerminalPeek,
    buildWorkspacePeek,
  };
}
