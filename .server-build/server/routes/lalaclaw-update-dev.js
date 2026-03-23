"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLalaClawUpdateDevHandler = createLalaClawUpdateDevHandler;
function createLalaClawUpdateDevHandler({ getLalaClawUpdateDevMockState, parseRequestBody, sendJson, setLalaClawUpdateDevMockState, }) {
    return async function handleLalaClawUpdateDev(req, res) {
        try {
            if (req.method === 'GET') {
                const result = await getLalaClawUpdateDevMockState();
                sendJson(res, 200, result);
                return;
            }
            if (req.method === 'POST') {
                const body = await parseRequestBody(req);
                const enabled = body?.enabled !== false;
                const result = await setLalaClawUpdateDevMockState({
                    enabled,
                    stableVersion: body?.stableVersion,
                });
                sendJson(res, 200, result);
                return;
            }
            if (req.method === 'DELETE') {
                const result = await setLalaClawUpdateDevMockState({ enabled: false });
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
                error: error?.message || 'LalaClaw update dev mock request failed',
                errorCode: error?.errorCode || 'lalaclaw_update_dev_mock_failed',
            });
        }
    };
}
