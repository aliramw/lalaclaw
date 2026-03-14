const { URL } = require('node:url');

function createSessionHandlers({
  buildDashboardSnapshot,
  callOpenClawGateway,
  collectAvailableAgents,
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
}) {
  function handleSession(req, res) {
    const sessionUser = normalizeSessionUser(new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionUser') || 'command-center');
    const agentId = resolveSessionAgentId(sessionUser);
    const agentLabel = resolveAgentDisplayName(agentId);
    const model = resolveSessionModel(sessionUser, agentId);
    const thinkMode = resolveSessionThinkMode(sessionUser);
    sendJson(res, 200, {
      mode: config.mode,
      model,
      agentId,
      agentLabel,
      thinkMode,
      sessionUser,
      sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
      availableModels: collectAvailableModels(config.localConfig, [model]),
      availableAgents: collectAvailableAgents(config.localConfig, [agentId]),
      apiStyle: config.apiStyle,
      hasBaseUrl: Boolean(config.baseUrl),
      hasApiKey: Boolean(config.apiKey),
      localDetected: config.localDetected,
    });
  }

  async function handleSessionUpdate(req, res) {
    try {
      const body = await parseRequestBody(req);
      const sessionUser = normalizeSessionUser(body.sessionUser || 'command-center');
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
      const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);

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

      const nextPreferences = {
        agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
        model: shouldPersistModel ? nextModel : undefined,
        fastMode: nextFastMode,
        thinkMode: nextThinkMode,
      };
      const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);

      if (config.mode === 'openclaw' && (body.model || body.agentId)) {
        await callOpenClawGateway('sessions.patch', {
          key: sessionKey,
          model: nextModel,
        });
        await delay(150);
      }

      if (config.mode === 'openclaw' && requestedThinkMode) {
        await callOpenClawGateway('sessions.patch', {
          key: sessionKey,
          thinkingLevel: requestedThinkMode,
        });
        await delay(150);
      }

      setSessionPreferences(sessionUser, nextPreferences);

      const snapshot = await buildDashboardSnapshot(sessionUser);
      sendJson(res, 200, {
        ok: true,
        mode: config.mode,
        model: snapshot.session?.selectedModel || resolveSessionModel(sessionUser, nextAgentId),
        agentId: snapshot.session?.agentId || nextAgentId,
        sessionUser,
        ...snapshot,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || 'Session update failed' });
    }
  }

  return {
    handleSession,
    handleSessionUpdate,
  };
}

module.exports = {
  createSessionHandlers,
};
