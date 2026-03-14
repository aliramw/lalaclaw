const { URL } = require('node:url');

function createRuntimeHandler({
  buildDashboardSnapshot,
  config,
  normalizeSessionUser,
  sendJson,
}) {
  return async function handleRuntime(req, res) {
    try {
      const sessionUser = normalizeSessionUser(new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionUser') || 'command-center');
      const snapshot = await buildDashboardSnapshot(sessionUser);
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
