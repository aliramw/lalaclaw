import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeHub } from "./runtime-hub.ts";

function createWebSocketStub() {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.send = vi.fn();
  ws.close = vi.fn();
  return ws;
}

function createIdleSnapshot() {
  return {
    session: {
      sessionUser: "command-center",
      agentId: "main",
      status: "就绪",
    },
    conversation: [],
    files: [],
    taskRelationships: [],
    taskTimeline: [],
    artifacts: [],
    snapshots: [],
    agents: [],
    peeks: { workspace: null, terminal: null, browser: null, environment: null },
  };
}

describe("createRuntimeHub gateway readiness", () => {
  it("keeps idle polling on the fast fallback cadence until the gateway event stream is ready", async () => {
    let handlers = null;
    const hub = createRuntimeHub({
      buildDashboardSnapshot: vi.fn(async () => createIdleSnapshot()),
      config: { mode: "openclaw" },
      subscribeGatewayEvents: (nextHandlers) => {
        handlers = nextHandlers;
        return { stop() {} };
      },
    });

    const ws = createWebSocketStub();
    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    const key = hub.__test.channelKey("command-center", "main");
    const channel = hub.__test.channels.get(key);
    expect(channel).toBeTruthy();

    await hub.__test.refreshChannel(key, channel, "test");

    expect(channel.currentInterval).toBe(8000);
    expect(hub.getDebugInfo().gatewayConnected).toBe(false);
    expect(typeof handlers?.onReady).toBe("function");

    hub.shutdown();
  });

  it("drops idle polling back to the fast fallback cadence when gateway readiness is lost", async () => {
    let handlers = null;
    const hub = createRuntimeHub({
      buildDashboardSnapshot: vi.fn(async () => createIdleSnapshot()),
      config: { mode: "openclaw" },
      subscribeGatewayEvents: (nextHandlers) => {
        handlers = nextHandlers;
        return { stop() {} };
      },
    });

    const ws = createWebSocketStub();
    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    const key = hub.__test.channelKey("command-center", "main");
    const channel = hub.__test.channels.get(key);
    expect(channel).toBeTruthy();

    await hub.__test.refreshChannel(key, channel, "test");
    handlers?.onReady?.();
    expect(channel.currentInterval).toBe(30000);
    expect(hub.getDebugInfo().gatewayConnected).toBe(true);

    handlers?.onError?.(new Error("gateway connect failed"));
    expect(channel.currentInterval).toBe(8000);
    expect(hub.getDebugInfo().gatewayConnected).toBe(false);

    hub.shutdown();
  });
});
