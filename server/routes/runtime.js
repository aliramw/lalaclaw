const { URL } = require('node:url');

function createRuntimeHandler({
  buildDashboardSnapshot,
  config,
  normalizeSessionUser,
  sendJson,
}) {
  function parseOptionalBoolean(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    if (['1', 'true', 'on', 'yes'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'off', 'no'].includes(normalized)) {
      return false;
    }
    return undefined;
  }

  return async function handleRuntime(req, res) {
    try {
      const searchParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const sessionUser = normalizeSessionUser(searchParams.get('sessionUser') || 'command-center');
      const agentId = String(searchParams.get('agentId') || '').trim();
      const model = String(searchParams.get('model') || '').trim();
      const thinkMode = String(searchParams.get('thinkMode') || '').trim();
      const fastMode = parseOptionalBoolean(searchParams.get('fastMode'));
      const snapshot = await buildDashboardSnapshot(sessionUser, {
        ...(agentId ? { agentId } : {}),
        ...(model ? { model } : {}),
        ...(thinkMode ? { thinkMode } : {}),
        ...(typeof fastMode === 'boolean' ? { fastMode } : {}),
      });
      const resolvedModel = snapshot.session?.model || config.model;
      sendJson(res, 200, {
        ok: true,
        mode: config.mode,
        model: resolvedModel,
        ...snapshot,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || 'Runtime snapshot failed' });
    }
  };
}

module.exports = {
  createRuntimeHandler,
};
