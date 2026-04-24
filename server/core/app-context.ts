import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  createOpenClawBackupStore,
  createOpenClawOperationHistory,
} from '../services/openclaw-operations';
import {
  HOST,
  PORT,
  PROJECT_ROOT,
  DIST_DIR,
  HERMES_DEFAULT_MODEL,
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
} from './config';
const {
  buildOpenClawMessageContent,
  describeAttachmentForModel,
  getMessageAttachments,
  normalizeChatMessage,
  summarizeMessages,
} = require('../formatters/chat-format');
const {
  parseFastCommand,
  parseModelCommand,
  parseSessionResetCommand,
  parseSlashCommandState,
} = require('../formatters/chat-commands');
const { createDashboardService } = require('../services/dashboard');
const { collapseDuplicateConversationTurns, mergeConversationMessages } = require('../services/dashboard');
const { createHermesClient, isHermesAgentId } = require('../services/hermes-client');
const { createOpenClawClient } = require('../services/openclaw-client');
const { parseRequestBody, sendFile, sendJson } = require('../http/http-utils');
const { createChatHandler, createChatStopHandler } = require('../routes/chat');
const { createFileManagerHandlers } = require('../routes/file-manager');
const { createFilePreviewHandlers } = require('../routes/file-preview');
const { createDevWorkspaceRestartHandler } = require('../routes/dev-workspace-restart');
const { createLalaClawUpdateDevHandler } = require('../routes/lalaclaw-update-dev');
const { createLalaClawUpdateHandler } = require('../routes/lalaclaw-update');
const { createOpenClawConfigHandler } = require('../routes/openclaw-config');
const { createOpenClawHistoryHandler } = require('../routes/openclaw-history');
const { createOpenClawManagementHandler } = require('../routes/openclaw-management');
const { createOpenClawOnboardingHandler } = require('../routes/openclaw-onboarding');
const { createOpenClawUpdateHandler } = require('../routes/openclaw-update');
const { createRuntimeHandler } = require('../routes/runtime');
const { createRuntimeHub } = require('../services/runtime-hub');
const { materializeInlineAttachments } = require('../services/attachment-materializer');
const { createOpenClawConfigService } = require('../services/openclaw-config');
const { createOpenClawFacade } = require('../services/openclaw-facade');
const { createOpenClawManagementService } = require('../services/openclaw-management');
const { createOpenClawOnboardingService } = require('../services/openclaw-onboarding');
const { createOpenClawUpdateService } = require('../services/openclaw-update');
const { createDevWorkspaceRestartService } = require('../services/dev-workspace-restart');
const { createLalaClawUpdateService } = require('../services/lalaclaw-update');
const { createSessionHandlers } = require('../routes/session');
const { createWorkspaceTreeHandler } = require('../routes/workspace-tree');
import { createSessionStore, normalizeSessionUser, normalizeThinkMode } from './session-store';
const { buildCanonicalImSessionUser } = require('../../shared/im-session-key.cjs');
const { createTranscriptProjector } = require('../services/transcript');
const {
  clip,
  collectLatestRunUsage,
  formatTokenBadge,
  formatTimestamp,
  parseCompactNumber,
  parseTokenDisplay,
  tailLines,
} = require('../formatters/usage-format');
const { createAccessController } = require('../auth/access-control');

type LooseRecord = Record<string, any>;

export function createAppContext() {
  const execFileAsync = promisify(execFile);
  const config = buildRuntimeConfig();
  const lalaclawStateDir = String(config.stateDir || '').trim() || path.dirname(String(config.accessConfigFile || path.join(PROJECT_ROOT, '.env.local')));
  const openClawBackupStore = createOpenClawBackupStore({
    storageFile: path.join(lalaclawStateDir, 'openclaw-backups.json'),
  });
  const openClawOperationHistory = createOpenClawOperationHistory({
    storageFile: path.join(lalaclawStateDir, 'openclaw-operation-history.json'),
  });
  const accessController = createAccessController({
    config,
    parseRequestBody,
    readTextIfExists,
    sendJson,
  });

  function getAgentConfig(agentId: string): LooseRecord | null {
    return config.localConfig?.agents?.list?.find((agent: LooseRecord) => agent?.id === agentId) || null;
  }

  function getDefaultAgentId() {
    return String(config.agentId || '').trim() || 'main';
  }

  function getAgentWorkspace(agentId: string): string {
    if (isHermesAgentId(agentId)) {
      return PROJECT_ROOT;
    }
    const agentConfig = getAgentConfig(agentId);
    return agentConfig?.workspace || config.localConfig?.agents?.defaults?.workspace || path.join(LOCAL_OPENCLAW_DIR, 'workspace');
  }

  function parseIdentityName(identityText = '', fallback = '') {
    const text = String(identityText || '');
    if (!text) {
      return fallback;
    }

    const inlineMatch = text.match(/^-+\s*\*\*Name:\*\*\s*(.+)$/im);
    if (inlineMatch?.[1]) {
      return inlineMatch[1].trim();
    }

    const blockMatch = text.match(/^-+\s*\*\*Name:\*\*\s*\n([\s\S]*?)(?:\n-+\s*\*\*[A-Za-z]+:\*\*|\n---|\n$)/im);
    if (!blockMatch?.[1]) {
      return fallback;
    }

    const normalized = blockMatch[1]
      .split('\n')
      .map((line) => line.trim().replace(/^[-*]\s*/, ''))
      .filter(Boolean)
      .join(' ');

    return normalized || fallback;
  }

  function resolveAgentDisplayName(agentId: string) {
    const normalizedAgentId = String(agentId || '').trim() || getDefaultAgentId();
    const workspace = getAgentWorkspace(normalizedAgentId);
    const identityPath = path.join(workspace, 'IDENTITY.md');
    const identityText = readTextIfExists(identityPath);
    return parseIdentityName(identityText, normalizedAgentId);
  }

  function getDefaultModelForAgent(agentId = config.agentId): string {
    const trimmedAgentId = String(agentId || config.agentId).trim() || config.agentId;
    if (isHermesAgentId(trimmedAgentId)) {
      return HERMES_DEFAULT_MODEL;
    }
    const agentConfig = getAgentConfig(trimmedAgentId);
    return resolveCanonicalModelId(resolveAgentModel(agentConfig) || config.localConfig?.agents?.defaults?.model?.primary || config.model);
  }

  function resolveModeForAgent(agentId = '') {
    return isHermesAgentId(agentId) ? 'hermes' : config.mode;
  }

  const {
    appendLocalSessionFileEntries,
    appendLocalSessionConversation,
    clearLocalSessionConversation,
    clearLocalSessionFileEntries,
    clearSessionPreferences,
    getLocalSessionFileEntries,
    getLocalSessionConversation,
    getSessionPreferences,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    setSessionPreferences,
  } = createSessionStore({
    getDefaultAgentId,
    getDefaultModelForAgent,
    resolveCanonicalModelId,
  });

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStaticDir() {
    return DIST_DIR;
  }

  function isWebAppBuilt() {
    return fileExists(path.join(DIST_DIR, 'index.html'));
  }

  function summarizeChatMessages(messages: LooseRecord[]) {
    return summarizeMessages(messages, { clip });
  }

  function parseChatSlashCommandState(message = '') {
    return parseSlashCommandState(message, normalizeThinkMode);
  }

  function getCommandCenterSessionKey(agentId = getDefaultAgentId(), sessionUser = 'command-center') {
    const normalizedAgentId = String(agentId || getDefaultAgentId()).trim() || getDefaultAgentId();
    const resolvedSessionUser = String(sessionUser || 'command-center').trim() || 'command-center';
    if (resolvedSessionUser.startsWith('agent:')) {
      return resolvedSessionUser;
    }
    const canonicalImSessionUser = buildCanonicalImSessionUser(resolvedSessionUser, { agentId: normalizedAgentId });
    if (canonicalImSessionUser) {
      if (canonicalImSessionUser.startsWith('agent:')) {
        return canonicalImSessionUser;
      }

      return `agent:${normalizedAgentId}:${canonicalImSessionUser}`;
    }
    return `agent:${normalizedAgentId}:openai-user:${resolvedSessionUser}`;
  }

  const {
    buildAgentGraph,
    cleanAssistantReply,
    cleanUserMessage,
    collectArtifacts,
    collectConversationMessages,
    collectFiles,
    collectSnapshots,
    collectTaskRelationships,
    collectTaskTimeline,
    collectToolHistory,
    extractTextSegments,
    findLatestSessionForAgent,
    getTranscriptEntriesForSession,
    getTranscriptPath,
    listImSessionsForAgent,
    listDirectoryPreview,
    parseSessionStatusText,
    readJsonLines,
    searchSessionsForAgent,
    resolveSessionRecord,
  } = createTranscriptProjector({
    PROJECT_ROOT,
    LOCAL_OPENCLAW_DIR,
    config,
    fileExists,
    readJsonIfExists,
    readTextIfExists,
    normalizeThinkMode,
    parseCompactNumber,
    parseTokenDisplay,
    formatTokenBadge,
    clip,
    formatTimestamp,
  });

  const {
    dispatchHermes,
    getHermesModelContextWindow,
    getHermesSessionStats,
    getHermesStatus,
  } = createHermesClient({
    execFileAsync,
    HERMES_BIN: String(process.env.HERMES_BIN || '').trim(),
    PROJECT_ROOT,
  });

  const {
    callOpenClawGateway,
    dispatchOpenClaw,
    dispatchOpenClawStream,
    fetchBrowserPeek,
    invokeOpenClawTool,
    mirrorOpenClawUserMessage,
    parseOpenClawResponse,
    subscribeGatewayEvents,
  } = createOpenClawClient({
    config,
    execFileAsync,
    PROJECT_ROOT,
    OPENCLAW_BIN,
    clip,
    normalizeSessionUser,
    normalizeChatMessage,
    getMessageAttachments,
    describeAttachmentForModel,
    buildOpenClawMessageContent,
    getCommandCenterSessionKey,
    resolveSessionAgentId,
    resolveSessionModel,
    resolveSessionRecord,
    readTextIfExists,
    tailLines,
  });

  let runtimeHub: any = null;

  const { buildDashboardSnapshot } = createDashboardService({
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
    getHermesModelContextWindow,
    getHermesSessionStats,
    getHermesStatus,
    getLocalSessionFileEntries,
    getLocalSessionConversation,
    getSessionPreferences,
    getTranscriptEntriesForSession,
    getTranscriptPath,
    getRuntimeHubDebugInfo: ({ sessionUser, agentId } = { sessionUser: '', agentId: '' }) => runtimeHub?.getDebugInfo({ sessionUser, agentId }) || null,
    getOpenClawOperationSummary: () => openClawOperationHistory.getSummary(),
    invokeOpenClawTool,
    listImSessionsForAgent,
    listDirectoryPreview,
    normalizeSessionUser,
    parseSessionStatusText,
    readJsonLines,
    readTextIfExists,
    resolveAgentDisplayName,
    resolveAgentWorkspace: getAgentWorkspace,
    resolveModeForAgent,
    findLatestSessionForAgent,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionRecord,
    resolveSessionThinkMode,
    buildAgentGraph,
    tailLines,
  });

  const handleChat = createChatHandler({
    appendLocalSessionFileEntries,
    appendLocalSessionConversation,
    buildDashboardSnapshot,
    callOpenClawGateway,
    clearLocalSessionConversation,
    clearLocalSessionFileEntries,
    clip,
    config,
    delay,
    dispatchHermes,
    dispatchOpenClaw,
    dispatchOpenClawStream,
    formatTokenBadge,
    getCommandCenterSessionKey,
    getDefaultAgentId,
    getDefaultModelForAgent,
    getMessageAttachments,
    getSessionPreferences,
    materializeMessageAttachments: (attachments: LooseRecord[] = []) =>
      materializeInlineAttachments(attachments, { rootDir: LOCAL_OPENCLAW_DIR }),
    mirrorOpenClawUserMessage,
    normalizeChatMessage,
    normalizeSessionUser,
    parseFastCommand,
    parseModelCommand,
    parseRequestBody,
    parseSessionResetCommand,
    parseSlashCommandState: parseChatSlashCommandState,
    resolveCanonicalModelId,
    resolveModeForAgent,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    sendJson,
    setSessionPreferences,
    summarizeMessages: summarizeChatMessages,
  });
  const handleChatStop = createChatStopHandler({
    callOpenClawGateway,
    config,
    getCommandCenterSessionKey,
    parseRequestBody,
    resolveModeForAgent,
    resolveSessionAgentId,
    sendJson,
  });

  const handleRuntime = createRuntimeHandler({
    buildDashboardSnapshot,
    config,
    normalizeSessionUser,
    sendJson,
  });

  runtimeHub = createRuntimeHub({
    buildDashboardSnapshot,
    config,
    subscribeGatewayEvents,
  });

  const { handleFilePreview, handleFilePreviewContent, handleFilePreviewSave } = createFilePreviewHandlers({
    parseRequestBody,
    sendFile,
    sendJson,
  });

  const { handleFileManagerPaste, handleFileManagerRename, handleFileManagerReveal } = createFileManagerHandlers({
    execFileAsync,
    parseRequestBody,
    sendJson,
  });

  const { runOpenClawAction: runLocalOpenClawAction } = createOpenClawManagementService({
    config,
    execFileAsync,
  });
  const {
    applyOpenClawConfigPatch: applyLocalOpenClawConfigPatch,
    getOpenClawConfigState,
    restoreOpenClawConfigBackup: restoreLocalOpenClawConfigBackup,
  } = createOpenClawConfigService({
    backupStore: openClawBackupStore,
    callOpenClawGateway,
    config,
    execFileAsync,
  });
  const { getOpenClawUpdateState, runOpenClawInstall: runLocalOpenClawInstall, runOpenClawUpdate: runLocalOpenClawUpdate } = createOpenClawUpdateService({
    config,
    execFileAsync,
  });
  const {
    getOpenClawOnboardingState,
    runOpenClawOnboarding: runLocalOpenClawOnboarding,
  } = createOpenClawOnboardingService({
    config,
    execFileAsync,
  });
  const {
    getLalaClawUpdateDevMockState,
    getLalaClawUpdateState,
    runLalaClawUpdate,
    setLalaClawUpdateDevMockState,
  } = createLalaClawUpdateService({
    config,
  });
  const {
    getDevWorkspaceRestartState,
    scheduleDevWorkspaceRestart,
  } = createDevWorkspaceRestartService({
    backendHost: HOST,
    backendPort: PORT,
    fileExists,
    processPid: process.pid,
    projectRoot: PROJECT_ROOT,
    readJsonIfExists,
    stateDir: config.stateDir,
  });
  const openClawFacade = createOpenClawFacade({
    config,
    openClawOperationHistory,
    getOpenClawConfigState,
    applyLocalOpenClawConfigPatch,
    restoreLocalOpenClawConfigBackup,
    getOpenClawOnboardingState,
    getOpenClawUpdateState,
    runLocalOpenClawOnboarding,
    runLocalOpenClawAction,
    runLocalOpenClawInstall,
    runLocalOpenClawUpdate,
  });

  const handleOpenClawManagement = createOpenClawManagementHandler({
    parseRequestBody,
    runOpenClawAction: openClawFacade.runOpenClawAction,
    sendJson,
  });
  const handleOpenClawConfig = createOpenClawConfigHandler({
    applyOpenClawConfigPatch: openClawFacade.applyOpenClawConfigPatch,
    getOpenClawConfigState: openClawFacade.getOpenClawConfigState,
    parseRequestBody,
    restoreRemoteOpenClawConfigBackup: openClawFacade.restoreRemoteOpenClawConfigBackup,
    sendJson,
  });
  const handleOpenClawUpdate = createOpenClawUpdateHandler({
    getOpenClawUpdateState: openClawFacade.getOpenClawUpdateState,
    parseRequestBody,
    runOpenClawInstall: openClawFacade.runOpenClawInstall,
    runOpenClawUpdate: openClawFacade.runOpenClawUpdate,
    sendJson,
  });
  const handleOpenClawOnboarding = createOpenClawOnboardingHandler({
    getOpenClawOnboardingState: openClawFacade.getOpenClawOnboardingState,
    parseRequestBody,
    runOpenClawOnboarding: openClawFacade.runOpenClawOnboarding,
    sendJson,
  });
  const handleOpenClawHistory = createOpenClawHistoryHandler({
    listOpenClawOperationHistory: openClawFacade.listOpenClawOperationHistory,
    sendJson,
  });
  const handleLalaClawUpdateDev = createLalaClawUpdateDevHandler({
    getLalaClawUpdateDevMockState,
    parseRequestBody,
    sendJson,
    setLalaClawUpdateDevMockState,
  });
  const handleDevWorkspaceRestart = createDevWorkspaceRestartHandler({
    getDevWorkspaceRestartState,
    parseRequestBody,
    scheduleDevWorkspaceRestart,
    sendJson,
  });
  const handleLalaClawUpdate = createLalaClawUpdateHandler({
    getLalaClawUpdateState,
    parseRequestBody,
    runLalaClawUpdate,
    sendJson,
  });

  const handleWorkspaceTree = createWorkspaceTreeHandler({
    normalizeSessionUser,
    resolveAgentWorkspace: getAgentWorkspace,
    resolveSessionAgentId,
    sendJson,
  });

  const { handleSession, handleSessionContext, handleSessionSearch, handleSessionUpdate } = createSessionHandlers({
    buildDashboardSnapshot,
    callOpenClawGateway,
    collectAvailableAgents,
    collectAvailableSkills,
    collectAllowedSubagents,
    collectAvailableModels,
    config,
    delay,
    getCommandCenterSessionKey,
    getDefaultAgentId,
    getDefaultModelForAgent,
    getSessionPreferences,
    listImSessionsForAgent,
    normalizeSessionUser,
    normalizeThinkMode,
    parseRequestBody,
    resolveAgentDisplayName,
    resolveModeForAgent,
    resolveCanonicalModelId,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    searchSessionsForAgent,
    sendJson,
    setSessionPreferences,
  });

  return {
    accessController,
    config,
    getStaticDir,
    handleAccessLogout: accessController.handleLogout,
    handleAccessState: accessController.handleState,
    handleAccessToken: accessController.handleToken,
    handleChat,
    handleChatStop,
    handleFileManagerPaste,
    handleFileManagerRename,
    handleFileManagerReveal,
    handleDevWorkspaceRestart,
    handleLalaClawUpdateDev,
    handleLalaClawUpdate,
    handleOpenClawManagement,
    handleOpenClawConfig,
    handleOpenClawHistory,
    handleOpenClawOnboarding,
    handleOpenClawUpdate,
    handleFilePreview,
    handleFilePreviewContent,
    handleFilePreviewSave,
    handleRuntime,
    handleSession,
    handleSessionContext,
    handleSessionSearch,
    handleSessionUpdate,
    handleWorkspaceTree,
    runtimeHub,
    helpers: {
      clearLocalSessionConversation,
      clearLocalSessionFileEntries,
      clearSessionPreferences,
      cleanAssistantReply,
      cleanUserMessage,
      clip,
      collectTaskTimeline,
      collapseDuplicateConversationTurns,
      getCommandCenterSessionKey,
      isWebAppBuilt,
      mergeConversationMessages,
      normalizeChatMessage,
      normalizeSessionUser,
      requireAccess: accessController.requireAccess,
      parseCompactNumber,
      parseOpenClawResponse,
      parseSessionStatusText,
      summarizeMessages: summarizeChatMessages,
    },
  };
}
