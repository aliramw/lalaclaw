const fs = require('node:fs');
const path = require('node:path');

const DUPLICATE_CONVERSATION_TURN_WINDOW_MS = 90 * 1000;
const DUPLICATE_CONVERSATION_ASSISTANT_REPLAY_GAP_MS = 5 * 1000;
const DUPLICATE_CONVERSATION_LONG_TURN_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_WORKSPACE_FILE_LIMIT = 200;

function normalizeConversationContent(content = '') {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseDuplicateConversationTurns(entries = []) {
  const collapsed = [];
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

function mergeConversationMessages(primary = [], secondary = []) {
  return collapseDuplicateConversationTurns(
    [...primary, ...secondary]
      .filter((entry) => entry?.role && entry?.content)
      .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0)),
  ).slice(-80);
}

function mergeProjectedFiles(primary = [], secondary = []) {
  const merged = new Map();

  [...primary, ...secondary].forEach((item) => {
    const key = item?.fullPath || item?.path;
    if (!key || merged.has(key)) {
      return;
    }
    merged.set(key, item);
  });

  return [...merged.values()];
}

function serializeEnvironmentValue(value) {
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

function directoryHasVisibleChildren(targetPath) {
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    return entries.some((entry) => entry?.name && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.git');
  } catch {
    return false;
  }
}

function defaultListWorkspaceFiles(rootDir, {
  limit = DEFAULT_WORKSPACE_FILE_LIMIT,
} = {}) {
  const normalizedRoot = String(rootDir || '').trim();
  if (!normalizedRoot || !path.isAbsolute(normalizedRoot)) {
    return [];
  }

  try {
    return fs
      .readdirSync(normalizedRoot, { withFileTypes: true })
      .filter((entry) => entry?.name && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.git')
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
      })
      .slice(0, limit)
      .map((entry) => {
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

function defaultCountWorkspaceFiles(rootDir) {
  const normalizedRoot = String(rootDir || '').trim();
  if (!normalizedRoot || !path.isAbsolute(normalizedRoot)) {
    return 0;
  }

  let total = 0;
  const pendingDirectories = [normalizedRoot];

  while (pendingDirectories.length) {
    const currentDirectory = pendingDirectories.pop();
    let entries = [];

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

function flattenEnvironmentObject(value, prefix = '', items = []) {
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

function createDashboardService({
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
  extractTextSegments,
  fetchBrowserPeek,
  formatTokenBadge,
  formatTimestamp,
  getCommandCenterSessionKey,
  getDefaultModelForAgent,
  getLocalSessionFileEntries,
  getLocalSessionConversation,
  getTranscriptPath,
  invokeOpenClawTool,
  countWorkspaceFiles = defaultCountWorkspaceFiles,
  listDirectoryPreview,
  listWorkspaceFiles = defaultListWorkspaceFiles,
  normalizeSessionUser,
  findLatestSessionForAgent,
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
}) {
  let liveConfigCache = {
    fetchedAt: 0,
    value: null,
  };

  async function resolveLiveConfig() {
    if (config.mode !== 'openclaw') {
      return config.localConfig;
    }

    if (liveConfigCache.value && Date.now() - liveConfigCache.fetchedAt < 60000) {
      return liveConfigCache.value;
    }

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
        { label: '项目内容', value: projectEntries.map((item) => `${item.kind === 'dir' ? '目录' : '文件'} ${item.name}`).join(' · ') || '暂无内容' },
        { label: '工作区内容', value: agentEntries.map((item) => `${item.kind === 'dir' ? '目录' : '文件'} ${item.name}`).join(' · ') || '暂无内容' },
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
    sessionKey,
    sessionVersion,
    thinkMode,
    workspaceRoot,
  }) {
    const items = [];
    const openClawVersion =
      parsedStatus?.versionDisplay ||
      liveConfig?.version ||
      liveConfig?.gateway?.version ||
      sessionVersion ||
      '';
    const sessionItems = [
      { label: 'OPENCLAW.VERSION', value: openClawVersion },
      { label: 'session.mode', value: config.mode },
      { label: 'session.agent', value: agentId },
      { label: 'session.sessionKey', value: sessionKey || parsedStatus?.sessionKey || '' },
      { label: 'session.workspaceRoot', value: workspaceRoot },
      { label: 'session.selectedModel', value: selectedModel },
      { label: 'session.resolvedModel', value: latestModel || parsedStatus?.modelDisplay || '' },
      { label: 'session.auth', value: parsedStatus?.authDisplay || '' },
      { label: 'session.runtime', value: parsedStatus?.runtimeDisplay || '' },
      { label: 'session.thinkMode', value: parsedStatus?.thinkMode || thinkMode || '' },
      { label: 'session.fastMode', value: fastMode ? 'on' : 'off' },
      { label: 'session.context', value: parsedStatus?.contextDisplay || '' },
      { label: 'session.queue', value: parsedStatus?.queueDisplay || '' },
      { label: 'session.time', value: parsedStatus?.time || '' },
      { label: 'gateway.baseUrl', value: config.baseUrl || '' },
      { label: 'gateway.port', value: String(config.gatewayPort || '') },
      { label: 'gateway.healthPort', value: String(config.healthPort || '') },
      { label: 'gateway.apiPath', value: config.apiPath || '' },
      { label: 'gateway.apiStyle', value: config.apiStyle || '' },
    ];

    sessionItems.forEach((item) => {
      if (item.value) {
        items.push(item);
      }
    });

    flattenEnvironmentObject(liveConfig?.gateway || {}, 'gateway.config', items);

    return {
      summary: '这里汇总当前会话与 Gateway 提供的环境信息。',
      items,
    };
  }

  function buildMockSnapshot(sessionUser = 'command-center', overrides = {}) {
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
        sessionUser: normalizeSessionUser(sessionUser),
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
      taskRelationships: [],
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
          sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
          sessionVersion: 'mock',
          thinkMode,
          workspaceRoot,
        }),
      },
    };
  }

  async function buildOpenClawSnapshot(sessionUser = 'command-center', overrides = {}) {
    const forcedAgentId = String(overrides?.agentId || '').trim();
    const forcedModel = String(overrides?.model || '').trim();
    const forcedThinkMode = String(overrides?.thinkMode || '').trim();
    const agentId = forcedAgentId || resolveSessionAgentId(sessionUser);
    let effectiveSessionUser = sessionUser;
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
    const entries = transcriptPath ? readJsonLines(transcriptPath).slice(-240) : [];
    const injectedFiles = sessionRecord?.systemPromptReport?.injectedWorkspaceFiles || [];
    const [statusResult, browserPeek, liveConfig] = await Promise.all([
      invokeOpenClawTool('session_status', {}, sessionKey).catch(() => null),
      fetchBrowserPeek().catch(() => ({
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
        sessionUser: normalizeSessionUser(effectiveSessionUser),
        sessionKey: parsedStatus?.sessionKey || sessionKey,
        workspaceRoot,
        status: '就绪',
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
      conversation: mergeConversationMessages(gatewayConversation, localConversation),
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
          sessionKey,
          sessionVersion: resolvedVersion,
          thinkMode: parsedStatus?.thinkMode || preferredThinkMode,
          workspaceRoot,
        }),
      },
    };
  }

  async function buildDashboardSnapshot(sessionUser = 'command-center', overrides = {}) {
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

module.exports = {
  createDashboardService,
  collapseDuplicateConversationTurns,
  mergeConversationMessages,
};
