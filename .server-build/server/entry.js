"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__test = exports.config = void 0;
exports.createRequestHandler = createRequestHandler;
exports.createAppServer = createAppServer;
exports.startServer = startServer;
const node_http_1 = __importDefault(require("node:http"));
const node_path_1 = __importDefault(require("node:path"));
const http_1 = require("./http");
const core_1 = require("./core");
const runtime_ws_1 = require("./routes/runtime-ws");
const defaultAppContext = (0, core_1.createAppContext)();
const { accessController, config, getStaticDir, helpers, } = defaultAppContext;
exports.config = config;
function respondToHandlerError(res, error) {
    if (res.headersSent || res.writableEnded || res.destroyed) {
        try {
            res.end();
        }
        catch { }
        return;
    }
    const errorMessage = error instanceof Error
        ? error.message
        : String(error?.message || '').trim() || 'Unknown server error';
    (0, http_1.sendJson)(res, 500, {
        ok: false,
        error: errorMessage,
    });
}
function runRouteHandler(handler, req, res) {
    try {
        const result = handler(req, res);
        if (result && typeof result.then === 'function') {
            result.catch((error) => {
                console.error('[server] Route handler failed', error);
                respondToHandlerError(res, error);
            });
        }
    }
    catch (error) {
        console.error('[server] Route handler failed', error);
        respondToHandlerError(res, error);
    }
}
function createRequestHandler(appContext = defaultAppContext) {
    const { accessController, handleChat, handleChatStop, handleAccessLogout, handleAccessState, handleAccessToken, handleFileManagerPaste, handleFileManagerRename, handleFileManagerReveal, handleDevWorkspaceRestart, handleLalaClawUpdateDev, handleLalaClawUpdate, handleOpenClawConfig, handleOpenClawHistory, handleOpenClawManagement, handleOpenClawOnboarding, handleOpenClawUpdate, handleFilePreview, handleFilePreviewContent, handleFilePreviewSave, handleRuntime, handleSession, handleSessionContext, handleSessionSearch, handleSessionUpdate, handleWorkspaceTree, getStaticDir: resolveStaticDir, helpers: appHelpers, } = appContext;
    const requireAccess = appHelpers?.requireAccess || (() => true);
    return (req, res) => {
        const requestPath = req.url || '/';
        const requestHost = req.headers.host || `${core_1.HOST}:${core_1.PORT}`;
        const url = new URL(requestPath, `http://${requestHost}`);
        if (req.method === 'GET' && url.pathname === '/api/auth/state') {
            if (handleAccessState) {
                runRouteHandler(handleAccessState, req, res);
                return;
            }
            (0, http_1.sendJson)(res, 200, {
                ok: true,
                accessMode: accessController?.accessMode || 'off',
                authenticated: true,
            });
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/token') {
            if (handleAccessToken) {
                runRouteHandler(handleAccessToken, req, res);
                return;
            }
            (0, http_1.sendJson)(res, 404, { ok: false, error: 'Auth route unavailable' });
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
            if (handleAccessLogout) {
                runRouteHandler(handleAccessLogout, req, res);
                return;
            }
            (0, http_1.sendJson)(res, 404, { ok: false, error: 'Auth route unavailable' });
            return;
        }
        if (url.pathname.startsWith('/api/') && !requireAccess(req, res)) {
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/session') {
            runRouteHandler(handleSession, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/session/context') {
            runRouteHandler(handleSessionContext, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/session/search') {
            runRouteHandler(handleSessionSearch, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/session') {
            runRouteHandler(handleSessionUpdate, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/runtime') {
            runRouteHandler(handleRuntime, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/file-preview') {
            runRouteHandler(handleFilePreview, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/file-preview/content') {
            runRouteHandler(handleFilePreviewContent, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/file-preview/save') {
            runRouteHandler(handleFilePreviewSave, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/workspace-tree') {
            runRouteHandler(handleWorkspaceTree, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/file-manager/reveal') {
            runRouteHandler(handleFileManagerReveal, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/file-manager/paste') {
            runRouteHandler(handleFileManagerPaste, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/file-manager/rename') {
            runRouteHandler(handleFileManagerRename, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/openclaw/manage') {
            runRouteHandler(handleOpenClawManagement, req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/openclaw/config') {
            runRouteHandler(handleOpenClawConfig, req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/openclaw/update') {
            runRouteHandler(handleOpenClawUpdate, req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/openclaw/onboarding') {
            runRouteHandler(handleOpenClawOnboarding, req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/lalaclaw/update') {
            runRouteHandler(handleLalaClawUpdate, req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE') && url.pathname === '/api/dev/lalaclaw/update-mock') {
            runRouteHandler(handleLalaClawUpdateDev, req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/dev/workspace-restart') {
            runRouteHandler(handleDevWorkspaceRestart, req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/openclaw/history') {
            runRouteHandler(handleOpenClawHistory, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/chat') {
            runRouteHandler(handleChat, req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/chat/stop') {
            runRouteHandler(handleChatStop, req, res);
            return;
        }
        if (req.method !== 'GET') {
            (0, http_1.sendJson)(res, 405, { error: 'Method not allowed' });
            return;
        }
        if (!appHelpers.isWebAppBuilt()) {
            (0, http_1.sendJson)(res, 503, {
                error: 'Web app build is missing',
                detail: 'Run `npm run build` to generate the dist bundle before starting the server.',
            });
            return;
        }
        const staticDir = resolveStaticDir();
        const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
        const safePath = node_path_1.default.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
        const filePath = node_path_1.default.join(staticDir, safePath);
        if (!filePath.startsWith(staticDir)) {
            (0, http_1.sendJson)(res, 403, { error: 'Forbidden' });
            return;
        }
        (0, http_1.sendFile)(res, filePath, req);
    };
}
function createAppServer(appContext = defaultAppContext) {
    const server = node_http_1.default.createServer(createRequestHandler(appContext));
    if (appContext.runtimeHub) {
        (0, runtime_ws_1.attachRuntimeWebSocket)(server, {
            runtimeHub: appContext.runtimeHub,
            accessController: appContext.accessController,
        });
    }
    return server;
}
function startServer() {
    const server = createAppServer();
    server.listen(core_1.PORT, core_1.HOST, () => {
        console.log(`CommandCenter running at http://${core_1.HOST}:${core_1.PORT}`);
        console.log(`Mode: ${config.mode}`);
        console.log(`Access: ${accessController?.accessMode || 'off'}`);
    });
    return server;
}
exports.__test = {
    ...helpers,
    getStaticDir,
};
