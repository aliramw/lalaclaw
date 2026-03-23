"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenClawUpdateHandler = createOpenClawUpdateHandler;
function createOpenClawUpdateHandler({ getOpenClawUpdateState, parseRequestBody, runOpenClawInstall, runOpenClawUpdate, sendJson, }) {
    return async function handleOpenClawUpdate(req, res) {
        try {
            if (req.method === 'GET') {
                const result = await getOpenClawUpdateState();
                sendJson(res, 200, result);
                return;
            }
            if (req.method === 'POST') {
                const body = await parseRequestBody(req);
                const action = String(body?.action || 'update').trim() || 'update';
                const result = action === 'install'
                    ? await runOpenClawInstall()
                    : await runOpenClawUpdate({
                        restartGateway: body?.restartGateway !== false,
                    });
                sendJson(res, 200, result);
                return;
            }
            sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        }
        catch (error) {
            const statusCode = Number.isInteger(error?.statusCode)
                ? Number(error.statusCode)
                : 500;
            sendJson(res, statusCode, {
                ok: false,
                error: error?.message || 'OpenClaw update request failed',
                errorCode: error?.errorCode || 'openclaw_update_failed',
            });
        }
    };
}
