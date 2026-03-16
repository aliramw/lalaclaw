import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createChatHandler } = require("../server/routes/chat");

function createResponseRecorder() {
  const calls = [];
  return {
    calls,
    sendJson: vi.fn((res, statusCode, payload) => {
      calls.push({ statusCode, payload });
    }),
  };
}

function createHandler(overrides = {}) {
  const responseRecorder = createResponseRecorder();
  const dependencies = {
    appendLocalSessionFileEntries: vi.fn(),
    appendLocalSessionConversation: vi.fn(),
    buildDashboardSnapshot: vi.fn(async (sessionUser) => ({
      session: {
        model: "gpt-5",
        sessionUser,
      },
      conversation: [],
    })),
    callOpenClawGateway: vi.fn(async () => ({})),
    clip: (value, length = 999) => String(value || "").slice(0, length),
    config: {
      mode: "mock",
      model: "gpt-5",
    },
    delay: vi.fn(async () => {}),
    dispatchOpenClaw: vi.fn(async () => ({ outputText: "完成", usage: { input: 1, output: 2 } })),
    formatTokenBadge: vi.fn((usage) => (usage ? "↑1 ↓2" : "")),
    getCommandCenterSessionKey: vi.fn((agentId, sessionUser) => `agent:${agentId}:${sessionUser}`),
    getDefaultAgentId: vi.fn(() => "main"),
    getDefaultModelForAgent: vi.fn((agentId) => `default-${agentId}`),
    getMessageAttachments: vi.fn((message) => message?.attachments || []),
    getSessionPreferences: vi.fn(() => ({ fastMode: true, thinkMode: "minimal" })),
    normalizeChatMessage: vi.fn((message) => String(message?.content || "")),
    normalizeSessionUser: vi.fn((value) => String(value || "command-center")),
    parseFastCommand: vi.fn(() => null),
    parseRequestBody: vi.fn(async () => ({})),
    parseSessionResetCommand: vi.fn(() => null),
    parseSlashCommandState: vi.fn(() => null),
    resolveCanonicalModelId: vi.fn((value) => value),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveSessionFastMode: vi.fn(() => false),
    resolveSessionModel: vi.fn(() => "gpt-5"),
    resolveSessionThinkMode: vi.fn(() => "off"),
    sendJson: responseRecorder.sendJson,
    setSessionPreferences: vi.fn(),
    summarizeMessages: vi.fn(() => "summary"),
    ...overrides,
  };

  return {
    ...dependencies,
    responseRecorder,
    handler: createChatHandler(dependencies),
  };
}

describe("createChatHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("patches session model in openclaw mode and persists think mode from slash commands", async () => {
    const harness = createHandler({
      config: { mode: "openclaw", model: "gpt-5" },
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        agentId: "worker",
        model: "gpt-5-mini",
        fastMode: false,
        stream: false,
        messages: [
          {
            role: "user",
            content: "/think high",
            attachments: [{ name: "plan.md", kind: "text", textContent: "todo" }],
          },
        ],
      })),
      parseSlashCommandState: vi.fn(() => ({ kind: "thinkMode", value: "high" })),
      resolveCanonicalModelId: vi.fn((value) => (value === "gpt-5-mini" ? "openai/gpt-5-mini" : value)),
      buildDashboardSnapshot: vi.fn(async () => ({
        session: {
          model: "openai/gpt-5-mini",
        },
        conversation: [],
      })),
    });

    await harness.handler({}, {});

    expect(harness.callOpenClawGateway).toHaveBeenNthCalledWith(1, "sessions.patch", {
      key: "agent:worker:api-user",
      model: "openai/gpt-5-mini",
    });
    expect(harness.callOpenClawGateway).toHaveBeenNthCalledWith(2, "sessions.patch", {
      key: "agent:worker:api-user",
      thinkingLevel: "high",
    });
    expect(harness.setSessionPreferences).toHaveBeenCalledWith("api-user", {
      agentId: "worker",
      fastMode: false,
      model: "openai/gpt-5-mini",
      thinkMode: "high",
    });
    expect(harness.dispatchOpenClaw).toHaveBeenCalledWith(
      [
        {
          role: "user",
          content: "/think high",
          attachments: [{ name: "plan.md", kind: "text", textContent: "todo" }],
        },
      ],
      false,
      "api-user",
      { commandBody: "/think high", thinkMode: "high" },
    );
    expect(harness.responseRecorder.calls[0]).toMatchObject({
      statusCode: 200,
      payload: {
        ok: true,
        mode: "openclaw",
        model: "openai/gpt-5-mini",
        tokenBadge: "↑1 ↓2",
        metadata: {
          status: "已完成 / 标准",
          summary: "summary",
        },
      },
    });
  });

  it("does not persist local preferences when openclaw session patch fails", async () => {
    const harness = createHandler({
      config: { mode: "openclaw", model: "gpt-5" },
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        agentId: "worker",
        model: "gpt-5-mini",
        fastMode: false,
        stream: false,
        messages: [{ role: "user", content: "继续" }],
      })),
      callOpenClawGateway: vi.fn(async () => {
        throw new Error("gateway unavailable");
      }),
    });

    await harness.handler({}, {});

    expect(harness.setSessionPreferences).not.toHaveBeenCalled();
    expect(harness.dispatchOpenClaw).not.toHaveBeenCalled();
    expect(harness.responseRecorder.calls[0]).toMatchObject({
      statusCode: 500,
      payload: {
        ok: false,
        error: "gateway unavailable",
      },
    });
  });

  it("handles fast commands without dispatching a model request", async () => {
    const harness = createHandler({
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        messages: [{ role: "user", content: "/fast on" }],
      })),
      parseFastCommand: vi.fn(() => ({ kind: "fast", action: "on" })),
      resolveSessionFastMode: vi.fn(() => true),
      buildDashboardSnapshot: vi.fn(async () => ({
        session: {
          model: "gpt-5",
          fastMode: "开启",
        },
        conversation: [],
      })),
    });

    await harness.handler({}, {});

    expect(harness.dispatchOpenClaw).not.toHaveBeenCalled();
    expect(harness.setSessionPreferences).toHaveBeenCalledWith("api-user", { fastMode: true });
    expect(harness.appendLocalSessionConversation).toHaveBeenCalledWith("api-user", [
      { role: "user", content: "/fast on", timestamp: Date.now() - 1 },
      { role: "assistant", content: "已开启 fast。", timestamp: Date.now() },
    ]);
    expect(harness.responseRecorder.calls[0].payload).toMatchObject({
      commandHandled: "fast",
      outputText: "已开启 fast。",
    });
  });

  it("persists a normal chat turn to the local session conversation before building the snapshot", async () => {
    const harness = createHandler({
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        fastMode: false,
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      })),
      buildDashboardSnapshot: vi.fn(async (sessionUser) => ({
        session: {
          model: "gpt-5",
          sessionUser,
        },
        conversation: [],
      })),
    });

    await harness.handler({}, {});

    expect(harness.appendLocalSessionConversation).toHaveBeenCalledWith(
      "api-user",
      [
        { role: "user", content: "hi", timestamp: Date.now() },
        { role: "assistant", content: "OpenClaw command channel is online in mock mode.\nCurrent intent: hi", timestamp: Date.now() + 1 },
      ],
    );
    expect(harness.buildDashboardSnapshot).toHaveBeenCalledWith("api-user");
  });

  it("still completes the stream after the request input closes normally", async () => {
    let resolveDispatch;
    const harness = createHandler({
      config: { mode: "openclaw", model: "gpt-5" },
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        agentId: "worker",
        fastMode: false,
        stream: true,
        messages: [{ role: "user", content: "继续" }],
      })),
      dispatchOpenClawStream: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveDispatch = resolve;
          }),
      ),
    });

    const req = new EventEmitter();
    req.once = req.once.bind(req);
    const writes = [];
    const res = new EventEmitter();
    res.once = res.once.bind(res);
    res.headersSent = false;
    res.destroyed = false;
    res.writableEnded = false;
    res.writeHead = vi.fn(() => {
      res.headersSent = true;
    });
    res.write = vi.fn((chunk) => {
      writes.push(chunk);
    });
    res.end = vi.fn(() => {
      res.writableEnded = true;
    });

    const handlerPromise = harness.handler(req, res);
    await vi.waitFor(() => {
      expect(harness.dispatchOpenClawStream).toHaveBeenCalledTimes(1);
    });

    req.emit("close");

    resolveDispatch?.({ outputText: "已完成", usage: null });
    await handlerPromise;

    expect(writes.some((chunk) => String(chunk || "").includes("\"message.complete\""))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  it("does not abort the OpenClaw session when the client disconnects during a stream", async () => {
    let resolveDispatch;
    const harness = createHandler({
      config: { mode: "openclaw", model: "gpt-5" },
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        agentId: "worker",
        fastMode: false,
        stream: true,
        messages: [{ role: "user", content: "继续" }],
      })),
      dispatchOpenClawStream: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveDispatch = resolve;
          }),
      ),
    });

    const req = new EventEmitter();
    req.once = req.once.bind(req);
    const writes = [];
    const res = new EventEmitter();
    res.once = res.once.bind(res);
    res.headersSent = false;
    res.destroyed = false;
    res.writableEnded = false;
    res.writeHead = vi.fn(() => {
      res.headersSent = true;
    });
    res.write = vi.fn((chunk) => {
      writes.push(chunk);
    });
    res.end = vi.fn(() => {
      res.writableEnded = true;
    });

    const handlerPromise = harness.handler(req, res);
    await vi.waitFor(() => {
      expect(harness.dispatchOpenClawStream).toHaveBeenCalledTimes(1);
    });

    res.destroyed = true;
    res.emit("close");

    resolveDispatch?.({ outputText: "已完成", usage: null });
    await handlerPromise;

    expect(harness.callOpenClawGateway).not.toHaveBeenCalledWith("chat.abort", {
      sessionKey: "agent:worker:api-user",
    });
    expect(writes.some((chunk) => String(chunk || "").includes("\"message.complete\""))).toBe(false);
  });

  it("does not try to send a json error after a streamed response has already started", async () => {
    let rejectDispatch;
    const harness = createHandler({
      config: { mode: "openclaw", model: "gpt-5" },
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        agentId: "worker",
        fastMode: false,
        stream: true,
        messages: [{ role: "user", content: "继续" }],
      })),
      dispatchOpenClawStream: vi.fn(
        () =>
          new Promise((_, reject) => {
            rejectDispatch = reject;
          }),
      ),
    });

    const req = new EventEmitter();
    req.once = req.once.bind(req);
    const writes = [];
    const res = new EventEmitter();
    res.once = res.once.bind(res);
    res.headersSent = false;
    res.destroyed = false;
    res.writableEnded = false;
    res.writeHead = vi.fn(() => {
      res.headersSent = true;
    });
    res.write = vi.fn((chunk) => {
      writes.push(chunk);
    });
    res.end = vi.fn(() => {
      res.writableEnded = true;
    });

    const handlerPromise = harness.handler(req, res);
    await vi.waitFor(() => {
      expect(harness.dispatchOpenClawStream).toHaveBeenCalledTimes(1);
    });

    res.destroyed = true;
    res.emit("close");

    rejectDispatch?.(new Error("Gateway chat stream closed"));
    await expect(handlerPromise).resolves.toBeUndefined();

    expect(harness.responseRecorder.sendJson).not.toHaveBeenCalled();
    expect(writes.some((chunk) => String(chunk || "").includes("\"message.error\""))).toBe(false);
  });

  it("creates a fresh session for reset commands and copies preferences", async () => {
    const harness = createHandler({
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        fastMode: true,
        messages: [{ role: "user", content: "/new 继续整理" }],
      })),
      parseSessionResetCommand: vi.fn(() => ({ kind: "new", tail: "继续整理" })),
      buildDashboardSnapshot: vi.fn(async (sessionUser) => ({
        session: {
          model: "gpt-5",
          sessionUser,
        },
        conversation: [],
      })),
    });

    await harness.handler({}, {});

    expect(harness.setSessionPreferences).toHaveBeenCalledWith("api-user-1773568800000", {
      fastMode: true,
      thinkMode: "minimal",
    });
    expect(harness.dispatchOpenClaw).not.toHaveBeenCalled();
    expect(harness.appendLocalSessionConversation).toHaveBeenCalledWith("api-user-1773568800000", [
      { role: "user", content: "继续整理", timestamp: Date.now() - 1 },
      { role: "assistant", content: "OpenClaw command channel is online in mock mode.\nCurrent intent: 继续整理", timestamp: Date.now() },
    ]);
    expect(harness.responseRecorder.calls[0].payload).toMatchObject({
      commandHandled: "new",
      resetSessionUser: "api-user-1773568800000",
      metadata: {
        status: "已完成 / 快速",
      },
    });
  });
});
