"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenClawManagementHandler = createOpenClawManagementHandler;
function createOpenClawManagementHandler({ parseRequestBody, runOpenClawAction, sendJson, }) {
    return async function handleOpenClawManagement(req, res) {
        try {
            const body = await parseRequestBody(req);
            const action = String(body?.action || '').trim();
            if (!action) {
                sendJson(res, 400, { ok: false, error: 'OpenClaw action is required' });
                return;
            }
            const result = await runOpenClawAction(action);
            sendJson(res, 200, result);
        }
        catch (error) {
            const statusCode = Number.isInteger(error?.statusCode)
                ? Number(error.statusCode)
                : 500;
            sendJson(res, statusCode, {
                ok: false,
                error: error?.message || 'OpenClaw action failed',
                errorCode: error?.errorCode || 'openclaw_action_failed',
            });
        }
    };
}
