"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenClawConfigHandler = createOpenClawConfigHandler;
const node_url_1 = require("node:url");
function createOpenClawConfigHandler({ applyOpenClawConfigPatch, getOpenClawConfigState, restoreRemoteOpenClawConfigBackup, parseRequestBody, sendJson, }) {
    return async function handleOpenClawConfig(req, res) {
        try {
            if (req.method === 'GET') {
                const url = new node_url_1.URL(req.url || '/', `http://${req.headers?.host || '127.0.0.1'}`);
                const result = await getOpenClawConfigState({
                    agentId: String(url.searchParams.get('agentId') || '').trim(),
                });
                sendJson(res, 200, result);
                return;
            }
            if (req.method === 'POST') {
                const body = await parseRequestBody(req);
                if (String(body?.action || '').trim() === 'rollback') {
                    const result = await restoreRemoteOpenClawConfigBackup({
                        agentId: String(body?.agentId || '').trim(),
                        backupId: String(body?.backupId || '').trim(),
                        remoteAuthorization: body?.remoteAuthorization || null,
                    });
                    sendJson(res, 200, result);
                    return;
                }
                const result = await applyOpenClawConfigPatch({
                    agentId: String(body?.agentId || '').trim(),
                    baseHash: body?.baseHash,
                    remoteAuthorization: body?.remoteAuthorization || null,
                    restartGateway: Boolean(body?.restartGateway),
                    values: body?.values || {},
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
                error: error?.message || 'OpenClaw config request failed',
                errorCode: error?.errorCode || 'openclaw_config_failed',
            });
        }
    };
}
