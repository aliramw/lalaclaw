function createDevWorkspaceRestartHandler({
  getDevWorkspaceRestartState,
  parseRequestBody,
  scheduleDevWorkspaceRestart,
  sendJson,
}) {
  return async function handleDevWorkspaceRestart(req, res) {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, await getDevWorkspaceRestartState());
        return;
      }

      if (req.method === 'POST') {
        const body = await parseRequestBody(req);
        const result = await scheduleDevWorkspaceRestart({
          frontendHost: body?.frontendHost,
          frontendPort: body?.frontendPort,
        });
        sendJson(res, 202, result);
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: error?.message || 'Dev workspace restart failed',
        errorCode: error?.errorCode || 'dev_workspace_restart_failed',
      });
    }
  };
}

module.exports = {
  createDevWorkspaceRestartHandler,
};
