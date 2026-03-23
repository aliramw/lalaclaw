"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDevWorkspaceRestartHandler = createDevWorkspaceRestartHandler;
function createDevWorkspaceRestartHandler({ getDevWorkspaceRestartState, parseRequestBody, scheduleDevWorkspaceRestart, sendJson, }) {
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
                    targetBranch: body?.targetBranch,
                    targetWorktreePath: body?.targetWorktreePath,
                });
                sendJson(res, 202, result);
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
                error: error?.message || 'Dev workspace restart failed',
                errorCode: error?.errorCode || 'dev_workspace_restart_failed',
            });
        }
    };
}
