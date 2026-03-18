import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRuntimeHub, channelKey, diffSnapshot } = require("../server/services/runtime-hub");

function createMockWs() {
  const sent = [];
  const listeners = {};
  return {
    readyState: 1,
    send: vi.fn((data) => sent.push(typeof data === "string" ? JSON.parse(data) : data)),
    close: vi.fn(),
    on: vi.fn((event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    }),
    sent,
    listeners,
    triggerClose() {
      (listeners.close || []).forEach((fn) => fn());
    },
  };
}

function createHub(overrides = {}) {
  const buildDashboardSnapshot = vi.fn(async () => ({
    session: { status: "就绪", agentId: "main", model: "gpt-5" },
    conversation: [{ role: "user", content: "hello" }],
    taskRelationships: [],
    taskTimeline: [],
    files: [],
    artifacts: [],
    snapshots: [],
    agents: [{ id: "main" }],
    peeks: { workspace: null, terminal: null, browser: null, environment: null },
  }));
  const config = { mode: "mock", model: "gpt-5" };

  return {
    hub: createRuntimeHub({ buildDashboardSnapshot, config, ...overrides }),
    buildDashboardSnapshot,
    config,
  };
}

describe("channelKey", () => {
  it("builds key from agentId and sessionUser", () => {
    expect(channelKey("command-center", "main")).toBe("main::command-center");
  });

  it("defaults missing values", () => {
    expect(channelKey("", "")).toBe("main::command-center");
    expect(channelKey(null, null)).toBe("main::command-center");
  });
});

describe("diffSnapshot", () => {
  it("returns null when previous is null", () => {
    expect(diffSnapshot(null, { session: {} })).toBeNull();
  });

  it("returns empty array when snapshots are identical", () => {
    const snapshot = {
      session: { status: "就绪" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    };
    expect(diffSnapshot(snapshot, snapshot)).toEqual([]);
  });

  it("returns patches for changed sections", () => {
    const prev = {
      session: { status: "就绪" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    };
    const next = {
      ...prev,
      session: { status: "运行中" },
      artifacts: [{ title: "new" }],
    };
    const patches = diffSnapshot(prev, next);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({ type: "session.sync", session: { status: "运行中" } });
    expect(patches[1]).toEqual({ type: "artifacts.sync", artifacts: [{ title: "new" }] });
  });

  it("detects conversation changes", () => {
    const prev = { session: {}, conversation: [], taskRelationships: [], taskTimeline: [], files: [], artifacts: [], snapshots: [], agents: [], peeks: {} };
    const next = { ...prev, conversation: [{ role: "user", content: "hi" }] };
    const patches = diffSnapshot(prev, next);
    expect(patches.some((p) => p.type === "conversation.sync")).toBe(true);
  });

  it("detects conversation tail content change without length change", () => {
    const base = { session: {}, taskRelationships: [], taskTimeline: [], files: [], artifacts: [], snapshots: [], agents: [], peeks: {} };
    const prev = { ...base, conversation: [{ role: "user", content: "hello", timestamp: 1 }, { role: "assistant", content: "partial", timestamp: 2 }] };
    const next = { ...base, conversation: [{ role: "user", content: "hello", timestamp: 1 }, { role: "assistant", content: "complete answer", timestamp: 2 }] };
    const patches = diffSnapshot(prev, next);
    expect(patches.some((p) => p.type === "conversation.sync")).toBe(true);
  });

  it("skips conversation patch when tail matches", () => {
    const base = { session: {}, taskRelationships: [], taskTimeline: [], files: [], artifacts: [], snapshots: [], agents: [], peeks: {} };
    const conversation = [{ role: "user", content: "hello", timestamp: 1 }, { role: "assistant", content: "hi", timestamp: 2 }];
    const prev = { ...base, conversation: [...conversation] };
    const next = { ...base, conversation: [...conversation] };
    const patches = diffSnapshot(prev, next);
    expect(patches.some((p) => p.type === "conversation.sync")).toBe(false);
  });

  it("detects session field-level changes", () => {
    const base = { conversation: [], taskRelationships: [], taskTimeline: [], files: [], artifacts: [], snapshots: [], agents: [], peeks: {} };
    const prev = { ...base, session: { status: "就绪", model: "gpt-5", agentId: "main" } };
    const next = { ...base, session: { status: "就绪", model: "gpt-5", agentId: "main" } };
    expect(diffSnapshot(prev, next).some((p) => p.type === "session.sync")).toBe(false);

    const changed = { ...base, session: { status: "运行中", model: "gpt-5", agentId: "main" } };
    expect(diffSnapshot(prev, changed).some((p) => p.type === "session.sync")).toBe(true);
  });

  it("detects peeks changes via summary and items", () => {
    const base = { session: {}, conversation: [], taskRelationships: [], taskTimeline: [], files: [], artifacts: [], snapshots: [], agents: [] };
    const peeks1 = { workspace: { summary: "foo", items: [{ label: "a", value: "1" }] } };
    const peeks2 = { workspace: { summary: "foo", items: [{ label: "a", value: "2" }] } };
    const prev = { ...base, peeks: peeks1 };
    const next = { ...base, peeks: peeks2 };
    expect(diffSnapshot(prev, next).some((p) => p.type === "peeks.sync")).toBe(true);

    const same = { ...base, peeks: { workspace: { summary: "foo", items: [{ label: "a", value: "1" }] } } };
    expect(diffSnapshot(prev, same).some((p) => p.type === "peeks.sync")).toBe(false);
  });

  it("detects array section changes via tail sampling", () => {
    const base = { session: {}, conversation: [], taskRelationships: [], taskTimeline: [], files: [], snapshots: [], agents: [], peeks: {} };
    const artifacts1 = [{ id: "a1", title: "first" }, { id: "a2", title: "second" }];
    const artifacts2 = [{ id: "a1", title: "first" }, { id: "a2", title: "updated" }];
    const prev = { ...base, artifacts: artifacts1 };
    const next = { ...base, artifacts: artifacts2 };
    expect(diffSnapshot(prev, next).some((p) => p.type === "artifacts.sync")).toBe(true);
  });
});

describe("createRuntimeHub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends initial snapshot on subscribe", async () => {
    const { hub } = createHub();
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].type).toBe("runtime.snapshot");
    expect(ws.sent[0].ok).toBe(true);
    expect(ws.sent[0].session).toBeDefined();
  });

  it("tracks channel and subscriber counts", async () => {
    const { hub } = createHub();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    expect(hub.getChannelCount()).toBe(0);
    expect(hub.getSubscriberCount()).toBe(0);

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    expect(hub.getChannelCount()).toBe(1);
    expect(hub.getSubscriberCount()).toBe(1);

    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "main", overrides: {} });
    expect(hub.getChannelCount()).toBe(1);
    expect(hub.getSubscriberCount()).toBe(2);
  });

  it("cleans up channel when all subscribers disconnect", async () => {
    const { hub } = createHub();
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    expect(hub.getChannelCount()).toBe(1);

    ws.triggerClose();
    expect(hub.getChannelCount()).toBe(0);
    expect(hub.getSubscriberCount()).toBe(0);
  });

  it("keeps channel alive when one of two subscribers disconnects", async () => {
    const { hub } = createHub();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "main", overrides: {} });

    ws1.triggerClose();
    expect(hub.getChannelCount()).toBe(1);
    expect(hub.getSubscriberCount()).toBe(1);
  });

  it("creates separate channels for different sessionUser/agentId", async () => {
    const { hub } = createHub();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "worker", overrides: {} });

    expect(hub.getChannelCount()).toBe(2);
    expect(hub.getSubscriberCount()).toBe(2);
  });

  it("reuses cached snapshot for second subscriber on same channel", async () => {
    const { hub, buildDashboardSnapshot } = createHub();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);
    expect(ws2.sent[0].type).toBe("runtime.snapshot");
  });

  it("broadcasts incremental patches on refresh", async () => {
    let callCount = 0;
    const buildDashboardSnapshot = vi.fn(async () => {
      callCount++;
      return {
        session: { status: callCount === 1 ? "就绪" : "运行中", agentId: "main", model: "gpt-5" },
        conversation: [],
        taskRelationships: [],
        taskTimeline: [],
        files: [],
        artifacts: callCount === 1 ? [] : [{ title: "new-artifact" }],
        snapshots: [],
        agents: [],
        peeks: {},
      };
    });

    const hub = createRuntimeHub({ buildDashboardSnapshot, config: { mode: "mock", model: "gpt-5" } });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    expect(ws.sent).toHaveLength(1);

    const channel = hub.__test.channels.values().next().value;
    await hub.__test.refreshChannel("main::command-center", channel);

    expect(ws.sent.length).toBeGreaterThan(1);
    const patches = ws.sent.slice(1);
    expect(patches.some((p) => p.type === "session.sync")).toBe(true);
    expect(patches.some((p) => p.type === "artifacts.sync")).toBe(true);
  });

  it("does not broadcast when snapshot is unchanged", async () => {
    const snapshot = {
      session: { status: "就绪", agentId: "main", model: "gpt-5" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    };
    const buildDashboardSnapshot = vi.fn(async () => ({ ...snapshot }));
    const hub = createRuntimeHub({ buildDashboardSnapshot, config: { mode: "mock", model: "gpt-5" } });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    const initialCount = ws.sent.length;

    const channel = hub.__test.channels.values().next().value;
    await hub.__test.refreshChannel("main::command-center", channel);

    expect(ws.sent.length).toBe(initialCount);
  });

  it("sends error event when snapshot fails", async () => {
    const buildDashboardSnapshot = vi.fn(async () => {
      throw new Error("gateway down");
    });
    const hub = createRuntimeHub({ buildDashboardSnapshot, config: { mode: "mock", model: "gpt-5" } });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].type).toBe("runtime.error");
    expect(ws.sent[0].error).toBe("gateway down");
  });

  it("broadcasts error when refresh fails after initial success", async () => {
    let callCount = 0;
    const buildDashboardSnapshot = vi.fn(async () => {
      callCount++;
      if (callCount > 1) throw new Error("refresh failed");
      return {
        session: { status: "就绪" },
        conversation: [],
        taskRelationships: [],
        taskTimeline: [],
        files: [],
        artifacts: [],
        snapshots: [],
        agents: [],
        peeks: {},
      };
    });
    const hub = createRuntimeHub({ buildDashboardSnapshot, config: { mode: "mock", model: "gpt-5" } });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    const channel = hub.__test.channels.values().next().value;
    await hub.__test.refreshChannel("main::command-center", channel);

    const errorMsg = ws.sent.find((m) => m.type === "runtime.error");
    expect(errorMsg).toBeDefined();
    expect(errorMsg.error).toBe("refresh failed");
  });

  it("shutdown closes all connections and clears channels", async () => {
    const { hub } = createHub();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "worker", overrides: {} });

    hub.shutdown();

    expect(ws1.close).toHaveBeenCalled();
    expect(ws2.close).toHaveBeenCalled();
    expect(hub.getChannelCount()).toBe(0);
    expect(hub.getSubscriberCount()).toBe(0);
  });

  it("skips send for closed websocket", async () => {
    const { hub } = createHub();
    const ws = createMockWs();
    ws.readyState = 3; // CLOSED

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(ws.send).not.toHaveBeenCalled();
  });
});
