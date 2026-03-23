"use strict";
/**
 * WebSocket upgrade handler for /api/runtime/ws.
 *
 * Parses query parameters from the upgrade URL and delegates to the
 * runtime hub for subscription management and snapshot broadcasting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRuntimeWebSocket = attachRuntimeWebSocket;
const node_url_1 = require("node:url");
const ws_1 = require("ws");
const PING_INTERVAL_MS = 30000;
function parseOptionalBoolean(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (['1', 'true', 'on', 'yes'].includes(normalized))
        return true;
    if (['0', 'false', 'off', 'no'].includes(normalized))
        return false;
    return undefined;
}
function attachRuntimeWebSocket(httpServer, { runtimeHub, accessController = null }) {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (req, socket, head) => {
        const url = new node_url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        if (url.pathname !== '/api/runtime/ws') {
            socket.destroy();
            return;
        }
        if (accessController?.handleUpgrade && !accessController.handleUpgrade(req, socket)) {
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });
    wss.on('connection', (ws, req) => {
        const url = new node_url_1.URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        const searchParams = url.searchParams;
        const sessionUser = String(searchParams.get('sessionUser') || 'command-center').trim() || 'command-center';
        const agentId = String(searchParams.get('agentId') || '').trim();
        const model = String(searchParams.get('model') || '').trim();
        const thinkMode = String(searchParams.get('thinkMode') || '').trim();
        const fastMode = parseOptionalBoolean(searchParams.get('fastMode'));
        const overrides = {
            ...(agentId ? { agentId } : {}),
            ...(model ? { model } : {}),
            ...(thinkMode ? { thinkMode } : {}),
            ...(typeof fastMode === 'boolean' ? { fastMode } : {}),
        };
        const pingTimer = setInterval(() => {
            if (ws.readyState === 1) {
                try {
                    ws.send?.(JSON.stringify({ type: 'ping', ts: Date.now() }));
                }
                catch { }
            }
        }, PING_INTERVAL_MS);
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(String(raw));
                if (msg.type === 'pong')
                    return;
            }
            catch { }
        });
        ws.on('close', () => {
            clearInterval(pingTimer);
        });
        ws.on('error', () => {
            clearInterval(pingTimer);
        });
        runtimeHub.subscribe(ws, { sessionUser, agentId, overrides });
    });
    return wss;
}
