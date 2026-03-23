"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenClawHistoryHandler = createOpenClawHistoryHandler;
function createOpenClawHistoryHandler({ listOpenClawOperationHistory, sendJson, }) {
    return async function handleOpenClawHistory(req, res) {
        try {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: 'Method not allowed' });
                return;
            }
            const result = await listOpenClawOperationHistory();
            sendJson(res, 200, result);
        }
        catch (error) {
            const statusCode = Number.isInteger(error?.statusCode)
                ? Number(error.statusCode)
                : 500;
            sendJson(res, statusCode, {
                ok: false,
                error: error?.message || 'OpenClaw operation history request failed',
            });
        }
    };
}
