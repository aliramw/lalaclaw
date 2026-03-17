import { createRequire } from "node:module";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createAppServer } = require("../server");
const { createChatHandler, createChatStopHandler } = require("../server/routes/chat");
const { createSessionHandlers } = require("../server/routes/session");
const { parseRequestBody, sendJson } = require("../server/http");
const { DIST_DIR } = require("../server/core");

function createServerHarness({ chatDependencyOverrides = {} } = {}) {
  const sessionPreferences = new Map();
  const normalizeThinkModeValue = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return ["off", "minimal", "low", "medium", "high", "xhigh", "adaptive"].includes(normalized) ? normalized : "";
  };
  const defaultSessionPreferences = {
    agentId: undefined,
    model: undefined,
    fastMode: false,
    thinkMode: "off",
  };
  const normalizeSessionUser = vi.fn((value) => String(value || "command-center"));
  const getStoredPreferences = (sessionUser) => {
    const normalized = normalizeSessionUser(sessionUser);
    if (!sessionPreferences.has(normalized)) {
      sessionPreferences.set(normalized, { ...defaultSessionPreferences });
    }
    return sessionPreferences.get(normalized);
  };
  const getDefaultAgentId = vi.fn(() => "main");
  const getDefaultModelForAgent = vi.fn((agentId) => (agentId === "worker" ? "worker-default" : "main-default"));
  const resolveSessionAgentId = vi.fn((sessionUser) => getStoredPreferences(sessionUser).agentId || getDefaultAgentId());
  const resolveSessionModel = vi.fn((sessionUser, agentId = resolveSessionAgentId(sessionUser)) => getStoredPreferences(sessionUser).model || getDefaultModelForAgent(agentId));
  const resolveSessionFastMode = vi.fn((sessionUser) => Boolean(getStoredPreferences(sessionUser).fastMode));
  const resolveSessionThinkMode = vi.fn((sessionUser) => getStoredPreferences(sessionUser).thinkMode || "off");
  const getSessionPreferences = vi.fn((sessionUser) => ({ ...getStoredPreferences(sessionUser) }));
  const setSessionPreferences = vi.fn((sessionUser, updates = {}) => {
    const normalized = normalizeSessionUser(sessionUser);
    const current = getStoredPreferences(normalized);
    sessionPreferences.set(normalized, {
      ...current,
      ...updates,
    });
  });
  const buildDashboardSnapshot = vi.fn(async (sessionUser) => {
    const normalized = normalizeSessionUser(sessionUser);
    const agentId = resolveSessionAgentId(normalized);
    const selectedModel = resolveSessionModel(normalized, agentId);

    return {
      session: {
        agentId,
        fastMode: resolveSessionFastMode(normalized),
        model: selectedModel,
        selectedModel,
        sessionUser: normalized,
        thinkMode: resolveSessionThinkMode(normalized),
      },
      conversation: [],
    };
  });
  const parseFastCommand = vi.fn((content) => {
    const match = /^\/fast(?:\s*:?\s*(status|on|off))?\s*$/i.exec(String(content || "").trim());
    return match ? { action: String(match[1] || "status").toLowerCase() } : null;
  });
  const parseModelCommand = vi.fn((content) => {
    const trimmed = String(content || "").trim();
    if (/^\/models\s*$/i.test(trimmed)) {
      return { kind: "model", action: "list" };
    }
    const match = /^\/model(?:\s*:?\s*([\s\S]+))?\s*$/i.exec(trimmed);
    if (!match) {
      return null;
    }
    const tail = String(match[1] || "").trim();
    if (!tail || /^status$/i.test(tail)) {
      return { kind: "model", action: "status" };
    }
    if (/^(list|ls)$/i.test(tail)) {
      return { kind: "model", action: "list" };
    }
    return { kind: "model", action: "set", value: tail };
  });
  const parseSessionResetCommand = vi.fn((content) => {
    const trimmed = String(content || "").trim();
    if (/^\/new(?:\s*:?\s*.*)?$/i.test(trimmed)) {
      return { kind: "new", tail: trimmed.slice(4).trim().replace(/^:\s*/, "") };
    }
    if (/^\/reset(?:\s*:?\s*.*)?$/i.test(trimmed)) {
      return { kind: "reset", tail: trimmed.slice(6).trim().replace(/^:\s*/, "") };
    }
    return null;
  });
  const parseSlashCommandState = vi.fn((content) => {
    const trimmed = String(content || "").trim();
    const thinkMatch = /^\/(?:think|thinking|t)\s*:?\s*(\S+)\s*$/i.exec(trimmed);
    if (thinkMatch) {
      return { kind: "thinkMode", value: normalizeThinkModeValue(thinkMatch[1]) || "off" };
    }

    const fastMatch = /^\/fast\s*:?\s*(on|off)\s*$/i.exec(trimmed);
    if (fastMatch) {
      return { kind: "fastMode", value: fastMatch[1].toLowerCase() === "on" };
    }

    return null;
  });

  const chatDependencies = {
    appendLocalSessionFileEntries: vi.fn(),
    appendLocalSessionConversation: vi.fn(),
    buildDashboardSnapshot,
    callOpenClawGateway: vi.fn(async () => ({})),
    clearLocalSessionConversation: vi.fn(),
    clearLocalSessionFileEntries: vi.fn(),
    clip: (value, length = 999) => String(value || "").slice(0, length),
    config: {
      mode: "openclaw",
      model: "gpt-5",
    },
    delay: vi.fn(async () => {}),
    dispatchOpenClaw: vi.fn(async () => ({ outputText: "完成", usage: { input: 1, output: 2 } })),
    formatTokenBadge: vi.fn((usage) => (usage ? "↑1 ↓2" : "")),
    getCommandCenterSessionKey: vi.fn((agentId, sessionUser) => `agent:${agentId}:${sessionUser}`),
    getDefaultAgentId,
    getDefaultModelForAgent,
    getMessageAttachments: vi.fn((message) => message?.attachments || []),
    getSessionPreferences,
    normalizeChatMessage: vi.fn((message) => String(message?.content || "")),
    normalizeSessionUser,
    parseFastCommand,
    parseModelCommand,
    parseRequestBody,
    parseSessionResetCommand,
    parseSlashCommandState,
    resolveCanonicalModelId: vi.fn((value) => (value === "gpt-5-mini" ? "openai/gpt-5-mini" : value)),
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    sendJson,
    setSessionPreferences,
    summarizeMessages: vi.fn(() => "summary"),
    ...chatDependencyOverrides,
  };

  const sessionDependencies = {
    buildDashboardSnapshot,
    callOpenClawGateway: vi.fn(async () => ({})),
    collectAvailableAgents: vi.fn(() => ["main", "worker"]),
    collectAvailableModels: vi.fn(() => ["gpt-5", "openai/gpt-5-mini"]),
    config: { mode: "openclaw", model: "gpt-5" },
    delay: vi.fn(async () => {}),
    getCommandCenterSessionKey: vi.fn((agentId, sessionUser) => `agent:${agentId}:${sessionUser}`),
    getDefaultAgentId,
    getDefaultModelForAgent,
    getSessionPreferences,
    normalizeSessionUser,
    normalizeThinkMode: vi.fn((value) => normalizeThinkModeValue(value)),
    parseRequestBody,
    resolveAgentDisplayName: vi.fn(() => "worker"),
    resolveCanonicalModelId: vi.fn((value) => (value === "gpt-5-mini" ? "openai/gpt-5-mini" : value)),
    resolveSessionAgentId,
    resolveSessionFastMode,
    resolveSessionModel,
    resolveSessionThinkMode,
    sendJson,
    setSessionPreferences,
  };

  const appContext = {
    config: { mode: "openclaw" },
    getStaticDir: () => DIST_DIR,
    handleChat: createChatHandler(chatDependencies),
    handleChatStop: createChatStopHandler(chatDependencies),
    handleRuntime: async (req, res) => {
      const sessionUser = normalizeSessionUser(new URL(req.url, `http://${req.headers.host}`).searchParams.get("sessionUser") || "command-center");
      const snapshot = await buildDashboardSnapshot(sessionUser);
      sendJson(res, 200, {
        ok: true,
        mode: "openclaw",
        ...snapshot,
      });
    },
    ...createSessionHandlers(sessionDependencies),
    helpers: {
      isWebAppBuilt: () => true,
    },
  };

  return {
    appContext,
    chatDependencies,
    sessionDependencies,
    readSessionPreferences: (sessionUser) => ({ ...getStoredPreferences(sessionUser) }),
  };
}

async function readJson(response) {
  return await response.json();
}

describe("server HTTP integration", () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = null;
    baseUrl = "";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("forwards native think commands over HTTP without prepatching the openclaw session", async () => {
    const harness = createServerHarness();
    harness.chatDependencies.parseSlashCommandState.mockReturnValue({ kind: "thinkMode", value: "high" });
    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        agentId: "worker",
        model: "gpt-5-mini",
        fastMode: false,
        stream: false,
        messages: [{ role: "user", content: "/think high" }],
      }),
    });
    const payload = await readJson(response);

    expect(response.ok).toBe(true);
    expect(harness.chatDependencies.callOpenClawGateway).toHaveBeenNthCalledWith(1, "sessions.patch", {
      key: "agent:worker:api-user",
      model: "openai/gpt-5-mini",
    });
    expect(harness.chatDependencies.callOpenClawGateway).toHaveBeenCalledTimes(1);
    expect(harness.chatDependencies.dispatchOpenClaw).toHaveBeenCalledWith(
      [{ role: "user", content: "/think high" }],
      false,
      "api-user",
      { commandBody: "/think high", thinkMode: "off" },
    );
    expect(payload.ok).toBe(true);
    expect(payload.metadata.summary).toBe("summary");
  });

  it("forwards stop requests to OpenClaw chat.abort over HTTP", async () => {
    const harness = createServerHarness();
    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${baseUrl}/api/chat/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        agentId: "worker",
      }),
    });
    const payload = await readJson(response);

    expect(response.ok).toBe(true);
    expect(payload).toEqual({ ok: true });
    expect(harness.chatDependencies.callOpenClawGateway).toHaveBeenCalledWith("chat.abort", {
      sessionKey: "agent:worker:api-user",
    });
  });

  it.skip("keeps the OpenClaw session running when the streaming chat request disconnects", async () => {
    let resolveDispatch;
    const harness = createServerHarness({
      chatDependencyOverrides: {
        dispatchOpenClawStream: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveDispatch = resolve;
            }),
        ),
      },
    });
    harness.chatDependencies.callOpenClawGateway.mockResolvedValue({});

    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const abortController = new AbortController();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        sessionUser: "api-user",
        agentId: "worker",
        fastMode: false,
        stream: true,
        messages: [{ role: "user", content: "请开始" }],
      }),
    });

    const streamReader = response.body?.getReader?.();
    abortController.abort();
    resolveDispatch?.({ outputText: "", usage: null });
    await response.body?.cancel?.().catch(() => {});
    streamReader?.releaseLock?.();
    await Promise.resolve();
    expect(harness.chatDependencies.callOpenClawGateway).not.toHaveBeenCalledWith("chat.abort", {
      sessionKey: "agent:worker:api-user",
    });
  });

  it("returns a 500 session response without persisting preferences when patch fails over HTTP", async () => {
    const harness = createServerHarness();
    harness.sessionDependencies.callOpenClawGateway.mockRejectedValue(new Error("session patch failed"));
    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        model: "gpt-5-mini",
      }),
    });
    const payload = await readJson(response);

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      ok: false,
      error: "session patch failed",
    });
    expect(harness.sessionDependencies.setSessionPreferences).not.toHaveBeenCalled();
  });

  it("keeps the server alive when an async route handler rejects unexpectedly", async () => {
    const harness = createServerHarness();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.appContext.handleRuntime = async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:18789"), {
        code: "ECONNREFUSED",
      });
    };

    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const failedResponse = await fetch(`${baseUrl}/api/runtime`);
    const failedPayload = await readJson(failedResponse);

    expect(failedResponse.status).toBe(500);
    expect(failedPayload).toEqual({
      ok: false,
      error: "connect ECONNREFUSED 127.0.0.1:18789",
    });

    const recoveredResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        fastMode: false,
        stream: false,
        messages: [{ role: "user", content: "继续" }],
      }),
    });
    const recoveredPayload = await readJson(recoveredResponse);

    expect(recoveredResponse.ok).toBe(true);
    expect(recoveredPayload).toMatchObject({
      ok: true,
      mode: "openclaw",
      outputText: "完成",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("persists session settings over HTTP and reuses them on the next chat turn", async () => {
    const harness = createServerHarness();
    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const sessionResponse = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        agentId: "worker",
        model: "gpt-5-mini",
        fastMode: true,
        thinkMode: "high",
      }),
    });
    const sessionPayload = await readJson(sessionResponse);

    expect(sessionResponse.ok).toBe(true);
    expect(sessionPayload.session).toMatchObject({
      agentId: "worker",
      fastMode: true,
      selectedModel: "openai/gpt-5-mini",
      thinkMode: "high",
    });
    expect(harness.readSessionPreferences("api-user")).toEqual({
      agentId: "worker",
      model: "openai/gpt-5-mini",
      fastMode: true,
      thinkMode: "high",
    });

    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        fastMode: true,
        stream: false,
        messages: [{ role: "user", content: "继续整理项目结构" }],
      }),
    });
    const chatPayload = await readJson(chatResponse);

    expect(chatResponse.ok).toBe(true);
    expect(harness.chatDependencies.dispatchOpenClaw).toHaveBeenCalledWith(
      [{ role: "user", content: "继续整理项目结构" }],
      true,
      "api-user",
      { commandBody: "继续整理项目结构", thinkMode: "high" },
    );
    expect(harness.chatDependencies.callOpenClawGateway).not.toHaveBeenCalled();
    expect(chatPayload.session).toMatchObject({
      agentId: "worker",
      fastMode: true,
      selectedModel: "openai/gpt-5-mini",
      thinkMode: "high",
    });
  });

  it("forwards native /new commands over HTTP and clears local caches before appending the follow-up turn", async () => {
    const harness = createServerHarness();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    server = createAppServer(harness.appContext);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        agentId: "worker",
        model: "gpt-5-mini",
        thinkMode: "medium",
      }),
    });

    const resetResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        fastMode: false,
        stream: false,
        messages: [{ role: "user", content: "/new 继续拆分测试" }],
      }),
    });
    const resetPayload = await readJson(resetResponse);

    expect(resetResponse.ok).toBe(true);
    expect(harness.chatDependencies.dispatchOpenClaw).toHaveBeenCalledWith(
      [{ role: "user", content: "/new 继续拆分测试" }],
      false,
      "api-user",
      { commandBody: "/new 继续拆分测试", thinkMode: "medium" },
    );
    expect(harness.chatDependencies.clearLocalSessionConversation).toHaveBeenCalledWith("api-user");
    expect(harness.chatDependencies.clearLocalSessionFileEntries).toHaveBeenCalledWith("api-user");
    expect(resetPayload.session.sessionUser).toBe("api-user");
  });
});
