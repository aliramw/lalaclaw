function createLalaClawUpdateHandler({
  getLalaClawUpdateState,
  parseRequestBody,
  runLalaClawUpdate,
  sendJson,
}) {
  return async function handleLalaClawUpdate(req, res) {
    try {
      if (req.method === 'GET') {
        const result = await getLalaClawUpdateState();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST') {
        await parseRequestBody(req);
        const result = await runLalaClawUpdate();
        sendJson(res, result?.accepted ? 202 : 200, result);
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: error?.message || 'LalaClaw update request failed',
        errorCode: error?.errorCode || 'lalaclaw_update_failed',
      });
    }
  };
}

module.exports = {
  createLalaClawUpdateHandler,
};
