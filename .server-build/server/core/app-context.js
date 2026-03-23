"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppContext = createAppContext;
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const openclaw_operations_1 = require("../services/openclaw-operations");
const config_1 = require("./config");
const { buildOpenClawMessageContent, describeAttachmentForModel, getMessageAttachments, normalizeChatMessage, summarizeMessages, } = require('../formatters/chat-format');
const { parseFastCommand, parseModelCommand, parseSessionResetCommand, parseSlashCommandState, } = require('../formatters/chat-commands');
const { createDashboardService } = require('../services/dashboard');
const { collapseDuplicateConversationTurns, mergeConversationMessages } = require('../services/dashboard');
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
const { createOpenClawConfigService } = require('../services/openclaw-config');
const { createOpenClawFacade } = require('../services/openclaw-facade');
const { createOpenClawManagementService } = require('../services/openclaw-management');
const { createOpenClawOnboardingService } = require('../services/openclaw-onboarding');
const { createOpenClawUpdateService } = require('../services/openclaw-update');
const { createDevWorkspaceRestartService } = require('../services/dev-workspace-restart');
const { createLalaClawUpdateService } = require('../services/lalaclaw-update');
const { createSessionHandlers } = require('../routes/session');
const { createWorkspaceTreeHandler } = require('../routes/workspace-tree');
const session_store_1 = require("./session-store");
const { buildCanonicalImSessionUser } = require('../../shared/im-session-key.cjs');
const { createTranscriptProjector } = require('../services/transcript');
const { clip, collectLatestRunUsage, formatTokenBadge, formatTimestamp, parseCompactNumber, parseTokenDisplay, tailLines, } = require('../formatters/usage-format');
const { createAccessController } = require('../auth/access-control');
function createAppContext() {
    const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
    const config = (0, config_1.buildRuntimeConfig)();
    const lalaclawStateDir = String(config.stateDir || '').trim() || node_path_1.default.dirname(String(config.accessConfigFile || node_path_1.default.join(config_1.PROJECT_ROOT, '.env.local')));
    const openClawBackupStore = (0, openclaw_operations_1.createOpenClawBackupStore)({
        storageFile: node_path_1.default.join(lalaclawStateDir, 'openclaw-backups.json'),
    });
    const openClawOperationHistory = (0, openclaw_operations_1.createOpenClawOperationHistory)({
        storageFile: node_path_1.default.join(lalaclawStateDir, 'openclaw-operation-history.json'),
    });
    const accessController = createAccessController({
        config,
        parseRequestBody,
        readTextIfExists: config_1.readTextIfExists,
        sendJson,
    });
    function getAgentConfig(agentId) {
        return config.localConfig?.agents?.list?.find((agent) => agent?.id === agentId) || null;
    }
    function getDefaultAgentId() {
        return String(config.agentId || '').trim() || 'main';
    }
    function getAgentWorkspace(agentId) {
        const agentConfig = getAgentConfig(agentId);
        return agentConfig?.workspace || config.localConfig?.agents?.defaults?.workspace || node_path_1.default.join(config_1.LOCAL_OPENCLAW_DIR, 'workspace');
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
    function resolveAgentDisplayName(agentId) {
        const normalizedAgentId = String(agentId || '').trim() || getDefaultAgentId();
        const workspace = getAgentWorkspace(normalizedAgentId);
        const identityPath = node_path_1.default.join(workspace, 'IDENTITY.md');
        const identityText = (0, config_1.readTextIfExists)(identityPath);
        return parseIdentityName(identityText, normalizedAgentId);
    }
    function getDefaultModelForAgent(agentId = config.agentId) {
        const trimmedAgentId = String(agentId || config.agentId).trim() || config.agentId;
        const agentConfig = getAgentConfig(trimmedAgentId);
        return (0, config_1.resolveCanonicalModelId)((0, config_1.resolveAgentModel)(agentConfig) || config.localConfig?.agents?.defaults?.model?.primary || config.model);
    }
    const { appendLocalSessionFileEntries, appendLocalSessionConversation, clearLocalSessionConversation, clearLocalSessionFileEntries, clearSessionPreferences, getLocalSessionFileEntries, getLocalSessionConversation, getSessionPreferences, resolveSessionAgentId, resolveSessionFastMode, resolveSessionModel, resolveSessionThinkMode, setSessionPreferences, } = (0, session_store_1.createSessionStore)({
        getDefaultAgentId,
        getDefaultModelForAgent,
        resolveCanonicalModelId: config_1.resolveCanonicalModelId,
    });
    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    function getStaticDir() {
        return config_1.DIST_DIR;
    }
    function isWebAppBuilt() {
        return (0, config_1.fileExists)(node_path_1.default.join(config_1.DIST_DIR, 'index.html'));
    }
    function summarizeChatMessages(messages) {
        return summarizeMessages(messages, { clip });
    }
    function parseChatSlashCommandState(message = '') {
        return parseSlashCommandState(message, session_store_1.normalizeThinkMode);
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
    const { buildAgentGraph, cleanAssistantReply, cleanUserMessage, collectArtifacts, collectConversationMessages, collectFiles, collectSnapshots, collectTaskRelationships, collectTaskTimeline, collectToolHistory, extractTextSegments, findLatestSessionForAgent, getTranscriptEntriesForSession, getTranscriptPath, listImSessionsForAgent, listDirectoryPreview, parseSessionStatusText, readJsonLines, searchSessionsForAgent, resolveSessionRecord, } = createTranscriptProjector({
        PROJECT_ROOT: config_1.PROJECT_ROOT,
        LOCAL_OPENCLAW_DIR: config_1.LOCAL_OPENCLAW_DIR,
        config,
        fileExists: config_1.fileExists,
        readJsonIfExists: config_1.readJsonIfExists,
        readTextIfExists: config_1.readTextIfExists,
        normalizeThinkMode: session_store_1.normalizeThinkMode,
        parseCompactNumber,
        parseTokenDisplay,
        formatTokenBadge,
        clip,
        formatTimestamp,
    });
    const { callOpenClawGateway, dispatchOpenClaw, dispatchOpenClawStream, fetchBrowserPeek, invokeOpenClawTool, mirrorOpenClawUserMessage, parseOpenClawResponse, subscribeGatewayEvents, } = createOpenClawClient({
        config,
        execFileAsync,
        PROJECT_ROOT: config_1.PROJECT_ROOT,
        OPENCLAW_BIN: config_1.OPENCLAW_BIN,
        clip,
        normalizeSessionUser: session_store_1.normalizeSessionUser,
        normalizeChatMessage,
        getMessageAttachments,
        describeAttachmentForModel,
        buildOpenClawMessageContent,
        getCommandCenterSessionKey,
        resolveSessionAgentId,
        resolveSessionModel,
        readTextIfExists: config_1.readTextIfExists,
        tailLines,
    });
    let runtimeHub = null;
    const { buildDashboardSnapshot } = createDashboardService({
        HOST: config_1.HOST,
        PORT: config_1.PORT,
        PROJECT_ROOT: config_1.PROJECT_ROOT,
        callOpenClawGateway,
        clip,
        collectAvailableAgents: config_1.collectAvailableAgents,
        collectAvailableSkills: config_1.collectAvailableSkills,
        collectAllowedSubagents: config_1.collectAllowedSubagents,
        collectAvailableModels: config_1.collectAvailableModels,
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
        getTranscriptEntriesForSession,
        getTranscriptPath,
        getRuntimeHubDebugInfo: ({ sessionUser, agentId } = { sessionUser: '', agentId: '' }) => runtimeHub?.getDebugInfo({ sessionUser, agentId }) || null,
        getOpenClawOperationSummary: () => openClawOperationHistory.getSummary(),
        invokeOpenClawTool,
        listImSessionsForAgent,
        listDirectoryPreview,
        normalizeSessionUser: session_store_1.normalizeSessionUser,
        parseSessionStatusText,
        readJsonLines,
        readTextIfExists: config_1.readTextIfExists,
        resolveAgentDisplayName,
        resolveAgentWorkspace: getAgentWorkspace,
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
        dispatchOpenClaw,
        dispatchOpenClawStream,
        formatTokenBadge,
        getCommandCenterSessionKey,
        getDefaultAgentId,
        getDefaultModelForAgent,
        getMessageAttachments,
        getSessionPreferences,
        mirrorOpenClawUserMessage,
        normalizeChatMessage,
        normalizeSessionUser: session_store_1.normalizeSessionUser,
        parseFastCommand,
        parseModelCommand,
        parseRequestBody,
        parseSessionResetCommand,
        parseSlashCommandState: parseChatSlashCommandState,
        resolveCanonicalModelId: config_1.resolveCanonicalModelId,
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
        resolveSessionAgentId,
        sendJson,
    });
    const handleRuntime = createRuntimeHandler({
        buildDashboardSnapshot,
        config,
        normalizeSessionUser: session_store_1.normalizeSessionUser,
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
    const { applyOpenClawConfigPatch: applyLocalOpenClawConfigPatch, getOpenClawConfigState, restoreOpenClawConfigBackup: restoreLocalOpenClawConfigBackup, } = createOpenClawConfigService({
        backupStore: openClawBackupStore,
        callOpenClawGateway,
        config,
        execFileAsync,
    });
    const { getOpenClawUpdateState, runOpenClawInstall: runLocalOpenClawInstall, runOpenClawUpdate: runLocalOpenClawUpdate } = createOpenClawUpdateService({
        config,
        execFileAsync,
    });
    const { getOpenClawOnboardingState, runOpenClawOnboarding: runLocalOpenClawOnboarding, } = createOpenClawOnboardingService({
        config,
        execFileAsync,
    });
    const { getLalaClawUpdateDevMockState, getLalaClawUpdateState, runLalaClawUpdate, setLalaClawUpdateDevMockState, } = createLalaClawUpdateService({
        config,
    });
    const { getDevWorkspaceRestartState, scheduleDevWorkspaceRestart, } = createDevWorkspaceRestartService({
        backendHost: config_1.HOST,
        backendPort: config_1.PORT,
        fileExists: config_1.fileExists,
        processPid: process.pid,
        projectRoot: config_1.PROJECT_ROOT,
        readJsonIfExists: config_1.readJsonIfExists,
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
        normalizeSessionUser: session_store_1.normalizeSessionUser,
        resolveAgentWorkspace: getAgentWorkspace,
        resolveSessionAgentId,
        sendJson,
    });
    const { handleSession, handleSessionContext, handleSessionSearch, handleSessionUpdate } = createSessionHandlers({
        buildDashboardSnapshot,
        callOpenClawGateway,
        collectAvailableAgents: config_1.collectAvailableAgents,
        collectAvailableSkills: config_1.collectAvailableSkills,
        collectAllowedSubagents: config_1.collectAllowedSubagents,
        collectAvailableModels: config_1.collectAvailableModels,
        config,
        delay,
        getCommandCenterSessionKey,
        getDefaultAgentId,
        getDefaultModelForAgent,
        getSessionPreferences,
        listImSessionsForAgent,
        normalizeSessionUser: session_store_1.normalizeSessionUser,
        normalizeThinkMode: session_store_1.normalizeThinkMode,
        parseRequestBody,
        resolveAgentDisplayName,
        resolveCanonicalModelId: config_1.resolveCanonicalModelId,
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
            normalizeSessionUser: session_store_1.normalizeSessionUser,
            requireAccess: accessController.requireAccess,
            parseCompactNumber,
            parseOpenClawResponse,
            parseSessionStatusText,
            summarizeMessages: summarizeChatMessages,
        },
    };
}
