import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachRuntimeWebSocket } from "../server/routes/runtime-ws.ts";

function createMockHttpServer() {
  const emitter = new EventEmitter();
  emitter.on = emitter.on.bind(emitter);
  return emitter;
}

function createMockSocket() {
  return {
    destroy: vi.fn(),
    on: vi.fn(),
    write: vi.fn(),
  };
}

function createMockRuntimeHub() {
  return {
    subscribe: vi.fn(async () => {}),
  };
}

describe("attachRuntimeWebSocket", () => {
  let httpServer;
  let runtimeHub;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    runtimeHub = createMockRuntimeHub();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a WebSocketServer instance", () => {
    const wss = attachRuntimeWebSocket(httpServer, { runtimeHub });
    expect(wss).toBeDefined();
    expect(typeof wss.handleUpgrade).toBe("function");
  });

  it("destroys socket for non-matching paths", () => {
    attachRuntimeWebSocket(httpServer, { runtimeHub });

    const socket = createMockSocket();
    const req = {
      url: "/api/session",
      headers: { host: "127.0.0.1:3000" },
    };

    httpServer.emit("upgrade", req, socket, Buffer.alloc(0));

    expect(socket.destroy).toHaveBeenCalled();
    expect(runtimeHub.subscribe).not.toHaveBeenCalled();
  });

  it("calls handleUpgrade for /api/runtime/ws path", () => {
    const wss = attachRuntimeWebSocket(httpServer, { runtimeHub });

    let handleUpgradeCalled = false;
    wss.handleUpgrade = vi.fn(() => {
      handleUpgradeCalled = true;
    });

    const socket = createMockSocket();
    const req = {
      url: "/api/runtime/ws?sessionUser=test&agentId=worker",
      headers: {
        host: "127.0.0.1:3000",
        upgrade: "websocket",
        connection: "Upgrade",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
      },
    };

    httpServer.emit("upgrade", req, socket, Buffer.alloc(0));

    expect(handleUpgradeCalled).toBe(true);
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("destroys socket for unrelated WebSocket paths", () => {
    attachRuntimeWebSocket(httpServer, { runtimeHub });

    const socket = createMockSocket();
    const req = {
      url: "/api/chat/ws",
      headers: { host: "127.0.0.1:3000" },
    };

    httpServer.emit("upgrade", req, socket, Buffer.alloc(0));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("stops the upgrade when access control rejects the request", () => {
    const accessController = {
      handleUpgrade: vi.fn(() => false),
    };
    const wss = attachRuntimeWebSocket(httpServer, { runtimeHub, accessController });
    wss.handleUpgrade = vi.fn();

    const socket = createMockSocket();
    const req = {
      url: "/api/runtime/ws?sessionUser=test&agentId=worker",
      headers: {
        host: "127.0.0.1:3000",
        upgrade: "websocket",
        connection: "Upgrade",
      },
    };

    httpServer.emit("upgrade", req, socket, Buffer.alloc(0));

    expect(accessController.handleUpgrade).toHaveBeenCalledWith(req, socket);
    expect(wss.handleUpgrade).not.toHaveBeenCalled();
  });
});
