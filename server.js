const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { sendFile, sendJson } = require('./server/http');
const { HOST, PORT, createAppContext } = require('./server/core');

const defaultAppContext = createAppContext();
const {
  config,
  getStaticDir,
  helpers,
} = defaultAppContext;

function respondToHandlerError(res, error) {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    try {
      res.end();
    } catch {}
    return;
  }

  sendJson(res, 500, {
    ok: false,
    error: error?.message || 'Unknown server error',
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
  } catch (error) {
    console.error('[server] Route handler failed', error);
    respondToHandlerError(res, error);
  }
}

function createRequestHandler(appContext = defaultAppContext) {
  const {
    handleChat,
    handleChatStop,
    handleFileManagerReveal,
    handleFilePreview,
    handleFilePreviewContent,
    handleFilePreviewSave,
    handleRuntime,
    handleSession,
    handleSessionUpdate,
    handleWorkspaceTree,
    getStaticDir: resolveStaticDir,
    helpers: appHelpers,
  } = appContext;

  return (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/session') {
      runRouteHandler(handleSession, req, res);
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

function createAppServer(appContext = defaultAppContext) {
  return http.createServer(createRequestHandler(appContext));
}

function startServer() {
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`CommandCenter running at http://${HOST}:${PORT}`);
    console.log(`Mode: ${config.mode}`);
  });
  return server;
}

module.exports = {
  config,
  createAppServer,
  startServer,
  __test: {
    ...helpers,
    getStaticDir,
  },
};

if (require.main === module) {
  startServer();
}
