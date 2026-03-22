import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimeHub,
  applyRuntimePatchToSnapshot,
  channelKey,
  diffSnapshot,
} from "../server/services/runtime-hub.ts";

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

describe("applyRuntimePatchToSnapshot", () => {
  it("merges session patches and replaces array sections", () => {
    const snapshot = {
      session: { status: "就绪", model: "gpt-5", agentId: "main" },
      conversation: [{ role: "user", content: "hi", timestamp: 1 }],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    };

    expect(applyRuntimePatchToSnapshot(snapshot, {
      type: "session.sync",
      session: { status: "运行中" },
    })).toMatchObject({
      session: { status: "运行中", model: "gpt-5", agentId: "main" },
    });

    expect(applyRuntimePatchToSnapshot(snapshot, {
      type: "taskTimeline.sync",
      taskTimeline: [{ id: "task-1", status: "完成" }],
    })).toMatchObject({
      taskTimeline: [{ id: "task-1", status: "完成" }],
    });
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

  it("reports per-channel debug info for environment inspection", async () => {
    const { hub } = createHub();
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(hub.getDebugInfo({ sessionUser: "command-center", agentId: "main" })).toMatchObject({
      gatewayConnected: false,
      channelCount: 1,
      subscriberCount: 1,
      channel: {
        key: "main::command-center",
        agentId: "main",
        sessionUser: "command-center",
        subscriberCount: 1,
        hasSnapshot: true,
        lastRefreshReason: "initial_snapshot",
      },
    });
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

  it("notifyChannelActivity triggers immediate refresh for specific channel", async () => {
    let callCount = 0;
    const buildDashboardSnapshot = vi.fn(async () => {
      callCount++;
      return {
        session: { status: callCount <= 1 ? "就绪" : "运行中", agentId: "main", model: "gpt-5" },
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
    const initialSentCount = ws.sent.length;

    await hub.notifyChannelActivity("command-center", "main");

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);
    expect(ws.sent.length).toBeGreaterThan(initialSentCount);
  });

  it("notifyChannelActivity refreshes all channels when no args given", async () => {
    const buildDashboardSnapshot = vi.fn(async () => ({
      session: { status: "就绪" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({ buildDashboardSnapshot, config: { mode: "mock", model: "gpt-5" } });
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "worker", overrides: {} });

    const callsBefore = buildDashboardSnapshot.mock.calls.length;
    await hub.notifyChannelActivity();

    // 两个 channel 各触发一次刷新
    expect(buildDashboardSnapshot.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2);
  });

  it("does not start gateway subscription in mock mode", async () => {
    const subscribeGatewayEvents = vi.fn(() => ({ stop: vi.fn() }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot: vi.fn(async () => ({
        session: {}, conversation: [], taskRelationships: [], taskTimeline: [],
        files: [], artifacts: [], snapshots: [], agents: [], peeks: {},
      })),
      config: { mode: "mock", model: "gpt-5" },
      subscribeGatewayEvents,
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(subscribeGatewayEvents).not.toHaveBeenCalled();
  });

  it("starts gateway subscription in openclaw mode on first subscribe", async () => {
    const subscribeGatewayEvents = vi.fn(() => ({ stop: vi.fn() }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot: vi.fn(async () => ({
        session: {}, conversation: [], taskRelationships: [], taskTimeline: [],
        files: [], artifacts: [], snapshots: [], agents: [], peeks: {},
      })),
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents,
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });

    expect(subscribeGatewayEvents).toHaveBeenCalledTimes(1);
  });

  it("does not start gateway subscription twice", async () => {
    const subscribeGatewayEvents = vi.fn(() => ({ stop: vi.fn() }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot: vi.fn(async () => ({
        session: {}, conversation: [], taskRelationships: [], taskTimeline: [],
        files: [], artifacts: [], snapshots: [], agents: [], peeks: {},
      })),
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents,
    });
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "command-center", agentId: "worker", overrides: {} });

    expect(subscribeGatewayEvents).toHaveBeenCalledTimes(1);
  });

  it("shutdown stops gateway subscription", async () => {
    const stopFn = vi.fn();
    const subscribeGatewayEvents = vi.fn(() => ({ stop: stopFn }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot: vi.fn(async () => ({
        session: {}, conversation: [], taskRelationships: [], taskTimeline: [],
        files: [], artifacts: [], snapshots: [], agents: [], peeks: {},
      })),
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents,
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    hub.shutdown();

    expect(stopFn).toHaveBeenCalled();
  });

  it("applies gateway chat deltas directly without forcing a snapshot refresh", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async () => ({
      session: { status: "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
      conversation: [{ role: "user", content: "继续", timestamp: 1 }],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);

    await gatewayHandlers.onEvent({
      event: "chat",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        runId: "run-1",
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "前半段" }],
        },
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);
    const sessionPatch = ws.sent.findLast((message) => message.type === "session.sync");
    const conversationPatch = ws.sent.findLast((message) => message.type === "conversation.sync");
    expect(sessionPatch).toMatchObject({
      type: "session.sync",
      session: expect.objectContaining({ status: "运行中" }),
    });
    expect(conversationPatch).toMatchObject({
      type: "conversation.sync",
      conversation: [
        { role: "user", content: "继续", timestamp: 1 },
        expect.objectContaining({ role: "assistant", content: "前半段" }),
      ],
    });
  });

  it("pushes gateway chat finals immediately, then refreshes snapshot-backed sections", async () => {
    let gatewayHandlers = null;
    let snapshotCallCount = 0;
    const buildDashboardSnapshot = vi.fn(async () => {
      snapshotCallCount += 1;
      return {
        session: { status: snapshotCallCount === 1 ? "就绪" : "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
        conversation: [
          { role: "user", content: "继续", timestamp: 1 },
          ...(snapshotCallCount >= 2 ? [{ role: "assistant", content: "完整回答", timestamp: 2 }] : []),
        ],
        taskRelationships: [],
        taskTimeline: snapshotCallCount >= 2 ? [{ id: "task-1", status: "完成" }] : [],
        files: [],
        artifacts: snapshotCallCount >= 2 ? [{ title: "当前回复" }] : [],
        snapshots: [],
        agents: [],
        peeks: {},
      };
    });
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await gatewayHandlers.onEvent({
      event: "chat",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        runId: "run-2",
        state: "delta",
        message: {
          role: "assistant",
          timestamp: 2,
          content: [{ type: "text", text: "前半段" }],
        },
      },
    });
    await gatewayHandlers.onEvent({
      event: "chat",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        runId: "run-2",
        state: "final",
        message: {
          role: "assistant",
          timestamp: 2,
          content: [{ type: "text", text: "完整回答" }],
        },
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);
    const sessionPatch = ws.sent.findLast((message) => message.type === "session.sync");
    const conversationPatch = ws.sent.findLast((message) => message.type === "conversation.sync");
    const artifactsPatch = ws.sent.findLast((message) => message.type === "artifacts.sync");
    const timelinePatch = ws.sent.findLast((message) => message.type === "taskTimeline.sync");

    expect(sessionPatch).toMatchObject({
      type: "session.sync",
      session: expect.objectContaining({ status: "就绪" }),
    });
    expect(conversationPatch).toMatchObject({
      type: "conversation.sync",
      conversation: [
        { role: "user", content: "继续", timestamp: 1 },
        { role: "assistant", content: "完整回答", timestamp: 2 },
      ],
    });
    expect(artifactsPatch).toEqual({ type: "artifacts.sync", artifacts: [{ title: "当前回复" }] });
    expect(timelinePatch).toEqual({ type: "taskTimeline.sync", taskTimeline: [{ id: "task-1", status: "完成" }] });
  });

  it("applies embedded assistant stream events without forcing a snapshot refresh", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async () => ({
      session: { status: "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
      conversation: [{ role: "user", content: "继续", timestamp: 1 }],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await gatewayHandlers.onEvent({
      event: "agent",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        runId: "run-embedded-1",
        stream: "assistant",
        data: {
          text: "嵌入式输出",
          delta: "嵌入式",
        },
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);
    const sessionPatch = ws.sent.findLast((message) => message.type === "session.sync");
    const conversationPatch = ws.sent.findLast((message) => message.type === "conversation.sync");
    expect(sessionPatch).toMatchObject({
      type: "session.sync",
      session: expect.objectContaining({ status: "运行中" }),
    });
    expect(conversationPatch).toMatchObject({
      type: "conversation.sync",
      conversation: [
        { role: "user", content: "继续", timestamp: 1 },
        expect.objectContaining({ role: "assistant", content: "嵌入式输出" }),
      ],
    });
  });

  it("refreshes after embedded lifecycle end so snapshot-backed sections catch up", async () => {
    let gatewayHandlers = null;
    let snapshotCallCount = 0;
    const buildDashboardSnapshot = vi.fn(async () => {
      snapshotCallCount += 1;
      return {
        session: { status: "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
        conversation: [
          { role: "user", content: "继续", timestamp: 1 },
          ...(snapshotCallCount >= 2 ? [{ role: "assistant", content: "最终输出", timestamp: 2 }] : []),
        ],
        taskRelationships: [],
        taskTimeline: snapshotCallCount >= 2 ? [{ id: "task-embedded", status: "完成" }] : [],
        files: [],
        artifacts: snapshotCallCount >= 2 ? [{ title: "嵌入式回复" }] : [],
        snapshots: [],
        agents: [],
        peeks: {},
      };
    });
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await gatewayHandlers.onEvent({
      event: "agent",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        runId: "run-embedded-2",
        stream: "assistant",
        data: {
          text: "最终输出",
          delta: "最终输出",
        },
      },
    });
    await gatewayHandlers.onEvent({
      event: "agent",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        runId: "run-embedded-2",
        stream: "lifecycle",
        data: {
          phase: "end",
        },
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);
    expect(ws.sent.findLast((message) => message.type === "artifacts.sync")).toEqual({
      type: "artifacts.sync",
      artifacts: [{ title: "嵌入式回复" }],
    });
    expect(ws.sent.findLast((message) => message.type === "taskTimeline.sync")).toEqual({
      type: "taskTimeline.sync",
      taskTimeline: [{ id: "task-embedded", status: "完成" }],
    });
  });

  it("applies direct sync patch events without rebuilding the snapshot", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async () => ({
      session: { status: "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await gatewayHandlers.onEvent({
      event: "taskTimeline.sync",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        taskTimeline: [{ id: "task-direct", status: "完成" }],
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);
    expect(ws.sent.findLast((message) => message.type === "taskTimeline.sync")).toEqual({
      type: "taskTimeline.sync",
      taskTimeline: [{ id: "task-direct", status: "完成" }],
    });
  });

  it("applies nested data sync patch events without rebuilding the snapshot", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async () => ({
      session: { status: "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await gatewayHandlers.onEvent({
      event: "agent",
      payload: {
        type: "taskTimeline.sync",
        sessionKey: "agent:main:openai-user:command-center",
        data: {
          taskTimeline: [{ id: "task-nested", status: "完成" }],
        },
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);
    expect(ws.sent.findLast((message) => message.type === "taskTimeline.sync")).toEqual({
      type: "taskTimeline.sync",
      taskTimeline: [{ id: "task-nested", status: "完成" }],
    });
  });

  it("applies multiple nested direct patches from one gateway event", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async () => ({
      session: { status: "就绪", agentId: "main", model: "gpt-5", sessionUser: "command-center" },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();

    await hub.subscribe(ws, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await gatewayHandlers.onEvent({
      event: "agent",
      payload: {
        sessionKey: "agent:main:openai-user:command-center",
        data: {
          session: { status: "运行中" },
          taskRelationships: [{ id: "rel-direct", type: "child_agent", status: "running" }],
          taskTimeline: [{ id: "task-direct", status: "进行中" }],
        },
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);
    expect(ws.sent.findLast((message) => message.type === "session.sync")).toEqual({
      type: "session.sync",
      session: { status: "运行中" },
    });
    expect(ws.sent.findLast((message) => message.type === "taskRelationships.sync")).toEqual({
      type: "taskRelationships.sync",
      taskRelationships: [{ id: "rel-direct", type: "child_agent", status: "running" }],
    });
    expect(ws.sent.findLast((message) => message.type === "taskTimeline.sync")).toEqual({
      type: "taskTimeline.sync",
      taskTimeline: [{ id: "task-direct", status: "进行中" }],
    });
  });

  it("routes openai-user gateway events to the matching channel without splitting JSON session users", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async (sessionUser, overrides = {}) => ({
      session: {
        status: "就绪",
        agentId: overrides.agentId || "main",
        model: "gpt-5",
        sessionUser,
      },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();
    const sessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';

    await hub.subscribe(ws, { sessionUser, agentId: "main", overrides: {} });
    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);

    await gatewayHandlers.onEvent({
      payload: {
        sessionKey: `agent:main:openai-user:${sessionUser}`,
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);
    expect(buildDashboardSnapshot).toHaveBeenLastCalledWith(sessionUser, {});
  });

  it("routes native channel gateway events to the matching full session key", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async (sessionUser, overrides = {}) => ({
      session: {
        status: "就绪",
        agentId: overrides.agentId || "main",
        model: "gpt-5",
        sessionUser,
      },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();
    const sessionUser = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";

    await hub.subscribe(ws, { sessionUser, agentId: "main", overrides: {} });
    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);

    await gatewayHandlers.onEvent({
      payload: {
        sessionKey: sessionUser,
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);
    expect(buildDashboardSnapshot).toHaveBeenLastCalledWith(sessionUser, {});
  });

  it("routes bootstrap IM session keys to the matching bootstrap channel", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async (sessionUser, overrides = {}) => ({
      session: {
        status: "就绪",
        agentId: overrides.agentId || "main",
        model: "gpt-5",
        sessionUser,
      },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws = createMockWs();
    const sessionUser = "feishu:direct:default";

    await hub.subscribe(ws, { sessionUser, agentId: "main", overrides: {} });
    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(1);

    await gatewayHandlers.onEvent({
      payload: {
        sessionKey: "agent:main:openai-user:feishu:direct:default",
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);
    expect(buildDashboardSnapshot).toHaveBeenLastCalledWith(sessionUser, {});
  });

  it("refreshes all channels when a malformed gateway session key cannot be parsed", async () => {
    let gatewayHandlers = null;
    const buildDashboardSnapshot = vi.fn(async (sessionUser, overrides = {}) => ({
      session: {
        status: "就绪",
        agentId: overrides.agentId || "main",
        model: "gpt-5",
        sessionUser,
      },
      conversation: [],
      taskRelationships: [],
      taskTimeline: [],
      files: [],
      artifacts: [],
      snapshots: [],
      agents: [],
      peeks: {},
    }));
    const hub = createRuntimeHub({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "gpt-5" },
      subscribeGatewayEvents: vi.fn((handlers) => {
        gatewayHandlers = handlers;
        return { stop: vi.fn() };
      }),
    });
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await hub.subscribe(ws1, { sessionUser: "command-center", agentId: "main", overrides: {} });
    await hub.subscribe(ws2, { sessionUser: "agent:main:feishu:direct:ou_demo", agentId: "main", overrides: {} });
    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(2);

    await gatewayHandlers.onEvent({
      payload: {
        sessionKey: "definitely:not:a:valid:session:key:{",
      },
    });

    expect(buildDashboardSnapshot).toHaveBeenCalledTimes(4);
  });
});
