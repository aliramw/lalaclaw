import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionHandlers } from "../server/routes/session.ts";

function createResponseRecorder() {
  const calls = [];
  return {
    calls,
    sendJson: vi.fn((res, statusCode, payload) => {
      calls.push({ statusCode, payload });
    }),
  };
}

function createHarness(overrides = {}) {
  const responseRecorder = createResponseRecorder();
  const dependencies = {
    buildDashboardSnapshot: vi.fn(async () => ({
      session: {
        agentId: "worker",
        selectedModel: "openai/gpt-5-mini",
      },
      conversation: [],
    })),
    callOpenClawGateway: vi.fn(async () => ({})),
    collectAvailableAgents: vi.fn(() => ["main", "worker"]),
    collectAvailableModels: vi.fn(() => ["gpt-5", "openai/gpt-5-mini"]),
    config: { mode: "openclaw", model: "gpt-5" },
    delay: vi.fn(async () => {}),
    getCommandCenterSessionKey: vi.fn((agentId, sessionUser) => `agent:${agentId}:${sessionUser}`),
    getDefaultAgentId: vi.fn(() => "main"),
    getDefaultModelForAgent: vi.fn((agentId) => (agentId === "worker" ? "worker-default" : "main-default")),
    getSessionPreferences: vi.fn(() => ({ model: "gpt-5", fastMode: false, thinkMode: "off" })),
    normalizeSessionUser: vi.fn((value) => String(value || "command-center")),
    normalizeThinkMode: vi.fn((value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return ["off", "minimal", "low", "medium", "high", "xhigh", "adaptive"].includes(normalized) ? normalized : "";
    }),
    parseRequestBody: vi.fn(async () => ({})),
    resolveAgentDisplayName: vi.fn(() => "worker"),
    resolveCanonicalModelId: vi.fn((value) => (value === "gpt-5-mini" ? "openai/gpt-5-mini" : value)),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveSessionFastMode: vi.fn(() => false),
    resolveSessionModel: vi.fn(() => "gpt-5"),
    resolveSessionThinkMode: vi.fn(() => "off"),
    sendJson: responseRecorder.sendJson,
    setSessionPreferences: vi.fn(),
    ...overrides,
  };

  return {
    ...dependencies,
    responseRecorder,
    handlers: createSessionHandlers(dependencies),
  };
}

describe("createSessionHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("patches openclaw session settings before persisting local preferences", async () => {
    const harness = createHarness({
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        agentId: "worker",
        model: "gpt-5-mini",
        fastMode: true,
        thinkMode: "high",
      })),
    });

    await harness.handlers.handleSessionUpdate({}, {});

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
      model: "openai/gpt-5-mini",
      fastMode: true,
      thinkMode: "high",
    });
    expect(harness.responseRecorder.calls[0]).toMatchObject({
      statusCode: 200,
      payload: {
        ok: true,
        sessionUser: "api-user",
      },
    });
  });

  it("returns 500 without persisting local preferences when gateway patch fails", async () => {
    const harness = createHarness({
      parseRequestBody: vi.fn(async () => ({
        sessionUser: "api-user",
        model: "gpt-5-mini",
      })),
      callOpenClawGateway: vi.fn(async () => {
        throw new Error("session patch failed");
      }),
    });

    await harness.handlers.handleSessionUpdate({}, {});

    expect(harness.setSessionPreferences).not.toHaveBeenCalled();
    expect(harness.responseRecorder.calls[0]).toMatchObject({
      statusCode: 500,
      payload: {
        ok: false,
        error: "session patch failed",
      },
    });
  });
});
