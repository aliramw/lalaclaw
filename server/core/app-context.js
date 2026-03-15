const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const {
  HOST,
  PORT,
  PROJECT_ROOT,
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
} = require('./config');
const {
  buildOpenClawMessageContent,
  describeAttachmentForModel,
  getMessageAttachments,
  normalizeChatMessage,
  summarizeMessages,
} = require('../formatters/chat-format');
const {
  parseFastCommand,
  parseSessionResetCommand,
  parseSlashCommandState,
} = require('../formatters/chat-commands');
const { createDashboardService } = require('../services/dashboard');
const { createOpenClawClient } = require('../services/openclaw-client');
const { parseRequestBody, sendFile, sendJson } = require('../http/http-utils');
const { createChatHandler } = require('../routes/chat');
const { createFileManagerHandler } = require('../routes/file-manager');
const { createFilePreviewHandlers } = require('../routes/file-preview');
const { createRuntimeHandler } = require('../routes/runtime');
const { createSessionHandlers } = require('../routes/session');
const { createSessionStore, normalizeSessionUser, normalizeThinkMode } = require('./session-store');
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

function createAppContext() {
  const execFileAsync = promisify(execFile);
  const config = buildRuntimeConfig();

  function getAgentConfig(agentId) {
    return config.localConfig?.agents?.list?.find((agent) => agent?.id === agentId) || null;
  }

  function getDefaultAgentId() {
    return String(config.agentId || '').trim() || 'main';
  }

  function getAgentWorkspace(agentId) {
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

  function resolveAgentDisplayName(agentId) {
    const normalizedAgentId = String(agentId || '').trim() || getDefaultAgentId();
    const workspace = getAgentWorkspace(normalizedAgentId);
    const identityPath = path.join(workspace, 'IDENTITY.md');
    const identityText = readTextIfExists(identityPath);
    return parseIdentityName(identityText, normalizedAgentId);
  }

  function getDefaultModelForAgent(agentId = config.agentId) {
    const trimmedAgentId = String(agentId || config.agentId).trim() || config.agentId;
    const agentConfig = getAgentConfig(trimmedAgentId);
    return resolveCanonicalModelId(resolveAgentModel(agentConfig) || config.localConfig?.agents?.defaults?.model?.primary || config.model);
  }

  const {
    appendLocalSessionFileEntries,
    appendLocalSessionConversation,
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStaticDir() {
    return DIST_DIR;
  }

  function isWebAppBuilt() {
    return fileExists(path.join(DIST_DIR, 'index.html'));
  }

  function summarizeChatMessages(messages) {
    return summarizeMessages(messages, { clip });
  }

  function parseChatSlashCommandState(message = '') {
    return parseSlashCommandState(message, normalizeThinkMode);
  }

  function getCommandCenterSessionKey(agentId = getDefaultAgentId(), sessionUser = 'command-center') {
    return `agent:${agentId}:openai-user:${normalizeSessionUser(sessionUser)}`;
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
    getTranscriptPath,
    listDirectoryPreview,
    parseSessionStatusText,
    readJsonLines,
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
    callOpenClawGateway,
    dispatchOpenClaw,
    dispatchOpenClawStream,
    fetchBrowserPeek,
    invokeOpenClawTool,
    parseOpenClawResponse,
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
    readTextIfExists,
    tailLines,
  });

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
    getLocalSessionFileEntries,
    getLocalSessionConversation,
    getTranscriptPath,
    invokeOpenClawTool,
    listDirectoryPreview,
    normalizeSessionUser,
    parseSessionStatusText,
    readJsonLines,
    readTextIfExists,
    resolveAgentDisplayName,
    resolveAgentWorkspace: getAgentWorkspace,
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
    normalizeChatMessage,
    normalizeSessionUser,
    parseFastCommand,
    parseRequestBody,
    parseSessionResetCommand,
    parseSlashCommandState: parseChatSlashCommandState,
    resolveCanonicalModelId,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    sendJson,
    setSessionPreferences,
    summarizeMessages: summarizeChatMessages,
  });

  const handleRuntime = createRuntimeHandler({
    buildDashboardSnapshot,
    config,
    normalizeSessionUser,
    sendJson,
  });

  const { handleFilePreview, handleFilePreviewContent } = createFilePreviewHandlers({
    sendFile,
    sendJson,
  });

  const handleFileManagerReveal = createFileManagerHandler({
    execFileAsync,
    parseRequestBody,
    sendJson,
  });

  const { handleSession, handleSessionUpdate } = createSessionHandlers({
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
    normalizeSessionUser,
    normalizeThinkMode,
    parseRequestBody,
    resolveAgentDisplayName,
    resolveCanonicalModelId,
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    sendJson,
    setSessionPreferences,
  });

  return {
    config,
    getStaticDir,
    handleChat,
    handleFileManagerReveal,
    handleFilePreview,
    handleFilePreviewContent,
    handleRuntime,
    handleSession,
    handleSessionUpdate,
    helpers: {
      clearSessionPreferences,
      cleanAssistantReply,
      cleanUserMessage,
      clip,
      collectTaskTimeline,
      getCommandCenterSessionKey,
      isWebAppBuilt,
      normalizeChatMessage,
      normalizeSessionUser,
      parseCompactNumber,
      parseOpenClawResponse,
      parseSessionStatusText,
      summarizeMessages: summarizeChatMessages,
    },
  };
}

module.exports = {
  HOST,
  PORT,
  createAppContext,
};
