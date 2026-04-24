import { URL } from 'node:url';
const {
  buildCanonicalImSessionUser,
  getImSessionType,
  parseImSessionIdentity,
} = require('../../shared/im-session-key.cjs');

type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type SessionPreferences = {
  agentId?: string;
  model?: string;
  fastMode?: boolean;
  thinkMode?: string;
  hermesSessionId?: string;
};

type DashboardSnapshot = {
  session?: {
    availableAgents?: unknown[];
    availableMentionAgents?: unknown[];
    availableModels?: unknown[];
    availableSkills?: unknown[];
    agentLabel?: string;
    selectedModel?: string;
    agentId?: string;
    mode?: string;
    model?: string;
    sessionKey?: string;
    sessionUser?: string;
    thinkMode?: string;
  };
  [key: string]: unknown;
};

function parseRequestedSessionUser(value: unknown): string {
  return String(value || 'command-center').trim() || 'command-center';
}

function isPlaceholderOpenClawModel(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'openclaw' || normalized.endsWith('/openclaw');
}

export function createSessionHandlers({
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
}: {
  buildDashboardSnapshot: (sessionUser: string, overrides?: { agentId?: string; hermesSessionId?: string }) => Promise<DashboardSnapshot>;
  callOpenClawGateway: (method: string, payload: Record<string, unknown>, timeoutMs?: number) => Promise<Record<string, unknown>>;
  collectAvailableAgents: (
    localConfig: Record<string, unknown>,
    selectedAgents: string[],
    options?: { includeLocallyInstalledAgents?: boolean }
  ) => unknown[];
  collectAvailableSkills: (localConfig: Record<string, unknown>, agentId: string) => unknown[];
  collectAllowedSubagents: (localConfig: Record<string, unknown>, agentId: string) => unknown[];
  collectAvailableModels: (
    localConfig: Record<string, unknown>,
    selectedModels: string[],
    options?: { agentId?: string }
  ) => unknown[];
  config: {
    mode: string;
    apiStyle?: string;
    baseUrl?: string;
    apiKey?: string;
    localDetected?: boolean;
    localConfig: Record<string, unknown>;
  };
  delay: (ms: number) => Promise<void>;
  getCommandCenterSessionKey: (agentId: string, sessionUser: string) => string;
  getDefaultAgentId: () => string;
  getDefaultModelForAgent: (agentId: string) => string;
  getSessionPreferences: (sessionUser: string) => SessionPreferences;
  listImSessionsForAgent?: (agentId: string) => Array<Record<string, unknown>>;
  normalizeThinkMode: (value: string) => string;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  resolveAgentDisplayName: (agentId: string) => string;
  resolveModeForAgent?: (agentId: string) => string;
  resolveCanonicalModelId: (value: unknown) => string;
  resolveSessionAgentId: (sessionUser: string) => string;
  resolveSessionFastMode: (sessionUser: string) => boolean;
  resolveSessionModel: (sessionUser: string, agentId?: string) => string;
  resolveSessionThinkMode: (sessionUser: string) => string;
  searchSessionsForAgent: (agentId: string, payload: { channel: string; limit: number; term: string }) => unknown[];
  sendJson: JsonSender;
  setSessionPreferences: (sessionUser: string, preferences: SessionPreferences) => void;
}) {
  function resolveEffectiveSessionUser(agentId: string, requestedSessionUser: string) {
    const normalizedAgentId = String(agentId || getDefaultAgentId()).trim() || getDefaultAgentId();
    let sessionUser = buildCanonicalImSessionUser(requestedSessionUser, { agentId: normalizedAgentId }) || requestedSessionUser;
    const requestedIdentity = parseImSessionIdentity(sessionUser, { agentId: normalizedAgentId });

    if (requestedIdentity?.isBootstrap && typeof listImSessionsForAgent === 'function') {
      const requestedType = String(getImSessionType(sessionUser, { agentId: normalizedAgentId }) || '').trim().toLowerCase();
      const latestImSession = listImSessionsForAgent(normalizedAgentId).find((entry) => {
        const candidateSessionUser = String(entry?.sessionUser || '').trim();
        if (!candidateSessionUser) {
          return false;
        }

        const candidateIdentity = parseImSessionIdentity(candidateSessionUser, { agentId: normalizedAgentId });
        if (!candidateIdentity?.channel || candidateIdentity.isBootstrap) {
          return false;
        }

        if (String(getImSessionType(candidateSessionUser, { agentId: candidateIdentity.agentId || normalizedAgentId }) || '').trim().toLowerCase() !== requestedType) {
          return false;
        }

        const shouldMatchRequestedChatType = requestedIdentity.chatType && requestedIdentity.peerId !== 'default';
        if (shouldMatchRequestedChatType && candidateIdentity.chatType !== requestedIdentity.chatType) {
          return false;
        }

        return true;
      });

      if (latestImSession?.sessionUser) {
        sessionUser = String(latestImSession.sessionUser).trim();
      }
    }

    return buildCanonicalImSessionUser(sessionUser, { agentId: normalizedAgentId }) || sessionUser;
  }

  async function handleSession(req: { url?: string; headers: { host?: string } }, res: unknown) {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const requestedSessionUser = parseRequestedSessionUser(url.searchParams.get('sessionUser'));
    const requestedAgentId = String(url.searchParams.get('agentId') || '').trim();
    const agentId = requestedAgentId || resolveSessionAgentId(requestedSessionUser);
    const sessionUser = resolveEffectiveSessionUser(agentId, requestedSessionUser);
    const hermesSessionId = String(url.searchParams.get('hermesSessionId') || '').trim();
    const mode = typeof resolveModeForAgent === 'function' ? resolveModeForAgent(agentId) : config.mode;

    if (mode === 'hermes') {
      try {
        const snapshot = await buildDashboardSnapshot(sessionUser, {
          agentId,
          ...(hermesSessionId ? { hermesSessionId } : {}),
        });
        const snapshotSession = snapshot.session || {};
        sendJson(res, 200, {
          mode: snapshotSession.mode || mode,
          model: snapshotSession.selectedModel || snapshotSession.model || '',
          agentId: snapshotSession.agentId || agentId,
          agentLabel: snapshotSession.agentLabel || resolveAgentDisplayName(agentId),
          thinkMode: snapshotSession.thinkMode || 'off',
          sessionUser: snapshotSession.sessionUser || sessionUser,
          sessionKey: snapshotSession.sessionKey || getCommandCenterSessionKey(agentId, sessionUser),
          availableModels: snapshotSession.availableModels || [],
          availableAgents: snapshotSession.availableAgents || collectAvailableAgents(config.localConfig, [agentId], { includeLocallyInstalledAgents: true }),
          availableMentionAgents: snapshotSession.availableMentionAgents || [],
          availableSkills: snapshotSession.availableSkills || [],
          apiStyle: config.apiStyle,
          hasBaseUrl: Boolean(config.baseUrl),
          hasApiKey: Boolean(config.apiKey),
          localDetected: config.localDetected,
        });
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: (error as { message?: string } | null)?.message || 'Session snapshot failed',
        });
      }
      return;
    }

    const agentLabel = resolveAgentDisplayName(agentId);
    const resolvedModel = resolveSessionModel(sessionUser, agentId);
    let model = isPlaceholderOpenClawModel(resolvedModel) ? '' : resolvedModel;
    let availableModels = collectAvailableModels(config.localConfig, [model], { agentId });

    if (mode === 'openclaw' && isPlaceholderOpenClawModel(resolvedModel)) {
      try {
        const snapshot = await buildDashboardSnapshot(sessionUser, { agentId });
        const snapshotSession = snapshot.session || {};
        const snapshotModel = String(snapshotSession.selectedModel || snapshotSession.model || '').trim();
        if (snapshotModel && !isPlaceholderOpenClawModel(snapshotModel)) {
          model = snapshotModel;
          availableModels = Array.isArray(snapshotSession.availableModels) && snapshotSession.availableModels.length
            ? snapshotSession.availableModels
            : [snapshotModel];
        }
      } catch {
        // Keep the lightweight session fallback when the richer snapshot is unavailable.
      }
    }

    const thinkMode = resolveSessionThinkMode(sessionUser);
    sendJson(res, 200, {
      mode,
      model,
      agentId,
      agentLabel,
      thinkMode,
      sessionUser,
      sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
      availableModels,
      availableAgents: collectAvailableAgents(config.localConfig, [agentId], { includeLocallyInstalledAgents: true }),
      availableMentionAgents: collectAllowedSubagents(config.localConfig, agentId),
      availableSkills: collectAvailableSkills(config.localConfig, agentId),
      apiStyle: config.apiStyle,
      hasBaseUrl: Boolean(config.baseUrl),
      hasApiKey: Boolean(config.apiKey),
      localDetected: config.localDetected,
    });
  }

  function handleSessionSearch(req: { url?: string; headers: { host?: string } }, res: unknown) {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const requestedAgentId = String(url.searchParams.get('agentId') || '').trim();
    const agentId = requestedAgentId || getDefaultAgentId();
    const query = String(url.searchParams.get('q') || '').trim();
    const channel = String(url.searchParams.get('channel') || '').trim();
    const limit = Number(url.searchParams.get('limit') || 0);

    sendJson(res, 200, {
      ok: true,
      agentId,
      query,
      sessions: searchSessionsForAgent(agentId, {
        channel,
        limit,
        term: query,
      }),
    });
  }

  async function handleSessionUpdate(req: unknown, res: unknown) {
    try {
      const body = await parseRequestBody(req);
      const sessionUser = parseRequestedSessionUser(body.sessionUser);
      const currentPreferences = getSessionPreferences(sessionUser);
      const nextFastMode = typeof body.fastMode === 'boolean' ? body.fastMode : resolveSessionFastMode(sessionUser);
      const requestedThinkMode = typeof body.thinkMode === 'string' ? normalizeThinkMode(body.thinkMode) : '';
      if (typeof body.thinkMode === 'string' && !requestedThinkMode) {
        sendJson(res, 400, { ok: false, error: 'Invalid think mode' });
        return;
      }
      const nextThinkMode = requestedThinkMode || resolveSessionThinkMode(sessionUser);
      const previousAgentId = resolveSessionAgentId(sessionUser);
      const nextAgentId = body.agentId ? String(body.agentId).trim() || previousAgentId : previousAgentId;
      const nextMode = typeof resolveModeForAgent === 'function' ? resolveModeForAgent(nextAgentId) : config.mode;
      const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);
      const requestedHermesSessionId = typeof body.hermesSessionId === 'string' ? String(body.hermesSessionId || '').trim() : '';

      let nextModel = resolveSessionModel(sessionUser, previousAgentId);
      let shouldPersistModel = Boolean(currentPreferences.model);

      if (body.agentId && !body.model) {
        nextModel = defaultModelForNextAgent;
        shouldPersistModel = false;
      }

      if (body.model) {
        const requestedModel = resolveCanonicalModelId(body.model);
        nextModel = requestedModel || defaultModelForNextAgent;
        shouldPersistModel = Boolean(requestedModel) && requestedModel !== defaultModelForNextAgent;
      }

      const nextPreferences: SessionPreferences = {
        agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
        model: shouldPersistModel ? nextModel : undefined,
        fastMode: nextFastMode,
        thinkMode: nextThinkMode,
        ...(nextMode === 'hermes' && requestedHermesSessionId ? { hermesSessionId: requestedHermesSessionId } : {}),
      };
      const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);

      if (nextMode === 'openclaw' && (body.model || body.agentId)) {
        await callOpenClawGateway('sessions.patch', {
          key: sessionKey,
          model: nextModel,
        });
        await delay(150);
      }

      if (nextMode === 'openclaw' && requestedThinkMode) {
        await callOpenClawGateway('sessions.patch', {
          key: sessionKey,
          thinkingLevel: requestedThinkMode,
        });
        await delay(150);
      }

      setSessionPreferences(sessionUser, nextPreferences);

      const snapshot = await buildDashboardSnapshot(sessionUser, {
        agentId: nextAgentId,
        ...(nextMode === 'hermes' && requestedHermesSessionId ? { hermesSessionId: requestedHermesSessionId } : {}),
      });
      sendJson(res, 200, {
        ok: true,
        mode: snapshot.session?.mode || nextMode,
        model: snapshot.session?.selectedModel || resolveSessionModel(sessionUser, nextAgentId),
        agentId: snapshot.session?.agentId || nextAgentId,
        sessionUser,
        ...snapshot,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'Session update failed',
      });
    }
  }

  async function handleSessionContext(req: { url?: string; headers: { host?: string } }, res: unknown) {
    if (config.mode !== 'openclaw') {
      sendJson(res, 200, { ok: true, messages: [] });
      return;
    }

    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const requestedSessionUser = parseRequestedSessionUser(url.searchParams.get('sessionUser'));
      const requestedAgentId = String(url.searchParams.get('agentId') || '').trim();
      const agentId = requestedAgentId || resolveSessionAgentId(requestedSessionUser);
      const mode = typeof resolveModeForAgent === 'function' ? resolveModeForAgent(agentId) : config.mode;
      if (mode !== 'openclaw') {
        sendJson(res, 200, { ok: true, messages: [] });
        return;
      }
      const sessionUser = resolveEffectiveSessionUser(agentId, requestedSessionUser);
      const sessionKey = getCommandCenterSessionKey(agentId, sessionUser);
      const limitParam = Number(url.searchParams.get('limit') || 200);
      const limit = Math.max(1, Math.min(1000, limitParam));

      const result = await callOpenClawGateway('chat.history', { sessionKey, limit }, 15000);

      sendJson(res, 200, {
        ok: true,
        sessionKey: result.sessionKey || sessionKey,
        messages: result.messages || [],
        thinkingLevel: result.thinkingLevel,
        fastMode: result.fastMode,
        verboseLevel: result.verboseLevel,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'Failed to fetch session context',
      });
    }
  }

  return {
    handleSession,
    handleSessionContext,
    handleSessionSearch,
    handleSessionUpdate,
  };
}
