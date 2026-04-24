"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRuntimeHandler = createRuntimeHandler;
const node_url_1 = require("node:url");
const { buildCanonicalImSessionUser } = require('../../shared/im-session-key.cjs');
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
function createRuntimeHandler({ buildDashboardSnapshot, config, sendJson, }) {
    return async function handleRuntime(req, res) {
        try {
            const searchParams = new node_url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).searchParams;
            const agentId = String(searchParams.get('agentId') || '').trim();
            const requestedSessionUser = String(searchParams.get('sessionUser') || 'command-center').trim() || 'command-center';
            const sessionUser = buildCanonicalImSessionUser(requestedSessionUser, { agentId: agentId || 'main' }) || requestedSessionUser;
            const model = String(searchParams.get('model') || '').trim();
            const thinkMode = String(searchParams.get('thinkMode') || '').trim();
            const fastMode = parseOptionalBoolean(searchParams.get('fastMode'));
            const hermesSessionId = String(searchParams.get('hermesSessionId') || '').trim();
            const snapshot = await buildDashboardSnapshot(sessionUser, {
                ...(agentId ? { agentId } : {}),
                ...(model ? { model } : {}),
                ...(thinkMode ? { thinkMode } : {}),
                ...(typeof fastMode === 'boolean' ? { fastMode } : {}),
                ...(hermesSessionId ? { hermesSessionId } : {}),
            });
            const resolvedModel = snapshot.session?.model || config.model;
            const resolvedMode = String(snapshot.session?.mode || config.mode || '').trim() || config.mode;
            sendJson(res, 200, {
                ok: true,
                mode: resolvedMode,
                model: resolvedModel,
                ...snapshot,
            });
        }
        catch (error) {
            sendJson(res, 500, {
                ok: false,
                error: error?.message || 'Runtime snapshot failed',
            });
        }
    };
}
