/**
 * WebSocket upgrade handler for /api/runtime/ws.
 *
 * Parses query parameters from the upgrade URL and delegates to the
 * runtime hub for subscription management and snapshot broadcasting.
 */

import { URL } from 'node:url';
import { EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';

type WebSocketLike = EventEmitter & {
  readyState?: number;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  send?: (payload: string) => void;
};

type RuntimeHubLike = {
  subscribe: (
    ws: WebSocketLike,
    details: {
      sessionUser: string;
      agentId: string;
      overrides: {
        agentId?: string;
        model?: string;
        thinkMode?: string;
        fastMode?: boolean;
      };
    },
  ) => void;
};

type AccessControllerLike = {
  handleUpgrade?: (req: RequestLike, socket: SocketLike) => boolean;
} | null;

type RequestLike = {
  url?: string;
  headers: {
    host?: string;
  };
};

type SocketLike = {
  destroy: () => void;
};

type WebSocketServerLike = EventEmitter & {
  handleUpgrade: (
    req: RequestLike,
    socket: SocketLike,
    head: Buffer,
    callback: (ws: WebSocketLike) => void,
  ) => void;
};

type HttpServerLike = EventEmitter & {
  on: (event: 'upgrade', listener: (req: RequestLike, socket: SocketLike, head: Buffer) => void) => void;
};

const PING_INTERVAL_MS = 30000;

function parseOptionalBoolean(value: string | null): boolean | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  return undefined;
}

export function attachRuntimeWebSocket(
  httpServer: HttpServerLike,
  { runtimeHub, accessController = null }: { runtimeHub: RuntimeHubLike; accessController?: AccessControllerLike },
): WebSocketServerLike {
  const wss = new WebSocketServer({ noServer: true }) as unknown as WebSocketServerLike;

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

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

  wss.on('connection', (ws: WebSocketLike, req: RequestLike) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
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
        } catch {}
      }
    }, PING_INTERVAL_MS);

    ws.on('message', (raw: unknown) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'pong') return;
      } catch {}
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
