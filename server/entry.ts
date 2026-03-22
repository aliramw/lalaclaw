import http from 'node:http';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { sendFile, sendJson } from './http';
import { HOST, PORT, createAppContext } from './core';
import { attachRuntimeWebSocket } from './routes/runtime-ws';

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

const defaultAppContext = createAppContext();
const {
  accessController,
  config,
  getStaticDir,
  helpers,
} = defaultAppContext;

function respondToHandlerError(res: ServerResponse, error: unknown) {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    try {
      res.end();
    } catch {}
    return;
  }

  const errorMessage = error instanceof Error
    ? error.message
    : String((error as { message?: string } | null)?.message || '').trim() || 'Unknown server error';

  sendJson(res, 500, {
    ok: false,
    error: errorMessage,
  });
}

function runRouteHandler(handler: RouteHandler, req: IncomingMessage, res: ServerResponse) {
  try {
    const result = handler(req, res);
    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        console.error('[server] Route handler failed', error);
        respondToHandlerError(res, error);
      });
    }
  } catch (error) {
    console.error('[server] Route handler failed', error);
    respondToHandlerError(res, error);
  }
}

export function createRequestHandler(appContext = defaultAppContext) {
  const {
    accessController,
    handleChat,
    handleChatStop,
    handleAccessLogout,
    handleAccessState,
    handleAccessToken,
    handleFileManagerPaste,
    handleFileManagerRename,
    handleFileManagerReveal,
    handleDevWorkspaceRestart,
    handleLalaClawUpdateDev,
    handleLalaClawUpdate,
    handleOpenClawConfig,
    handleOpenClawHistory,
    handleOpenClawManagement,
    handleOpenClawOnboarding,
    handleOpenClawUpdate,
    handleFilePreview,
    handleFilePreviewContent,
    handleFilePreviewSave,
    handleRuntime,
    handleSession,
    handleSessionContext,
    handleSessionSearch,
    handleSessionUpdate,
    handleWorkspaceTree,
    getStaticDir: resolveStaticDir,
    helpers: appHelpers,
  } = appContext;
  const requireAccess = appHelpers?.requireAccess || (() => true);

  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/auth/state') {
      if (handleAccessState) {
        runRouteHandler(handleAccessState, req, res);
        return;
      }
      sendJson(res, 200, {
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
      sendJson(res, 404, { ok: false, error: 'Auth route unavailable' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (handleAccessLogout) {
        runRouteHandler(handleAccessLogout, req, res);
        return;
      }
      sendJson(res, 404, { ok: false, error: 'Auth route unavailable' });
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
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (!appHelpers.isWebAppBuilt()) {
      sendJson(res, 503, {
        error: 'Web app build is missing',
        detail: 'Run `npm run build` to generate the dist bundle before starting the server.',
      });
      return;
    }

    const staticDir = resolveStaticDir();
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const filePath = path.join(staticDir, safePath);

    if (!filePath.startsWith(staticDir)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    sendFile(res, filePath);
  };
}

export function createAppServer(appContext = defaultAppContext) {
  const server = http.createServer(createRequestHandler(appContext));

  if (appContext.runtimeHub) {
    attachRuntimeWebSocket(server, {
      runtimeHub: appContext.runtimeHub,
      accessController: appContext.accessController,
    });
  }

  return server;
}

export function startServer() {
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`CommandCenter running at http://${HOST}:${PORT}`);
    console.log(`Mode: ${config.mode}`);
    console.log(`Access: ${accessController?.accessMode || 'off'}`);
  });
  return server;
}

export { config };

export const __test = {
  ...helpers,
  getStaticDir,
};
