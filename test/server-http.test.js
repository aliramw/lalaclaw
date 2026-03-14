import { createRequire } from "node:module";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createAppServer } = require("../server");
const { createChatHandler } = require("../server/routes/chat");
const { createSessionHandlers } = require("../server/routes/session");
const { parseRequestBody, sendJson } = require("../server/http");
const { DIST_DIR } = require("../server/core");

function createServerHarness() {
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
    const match = /^\/fast(?:\s+(status|on|off))?\s*$/i.exec(String(content || "").trim());
    return match ? { action: String(match[1] || "status").toLowerCase() } : null;
  });
  const parseSessionResetCommand = vi.fn((content) => {
    const trimmed = String(content || "").trim();
    if (/^\/new(?:\s+.*)?$/i.test(trimmed)) {
      return { kind: "new", tail: trimmed.slice(4).trim() };
    }
    if (/^\/reset(?:\s+.*)?$/i.test(trimmed)) {
      return { kind: "reset", tail: trimmed.slice(6).trim() };
    }
    return null;
  });
  const parseSlashCommandState = vi.fn((content) => {
    const trimmed = String(content || "").trim();
    const thinkMatch = /^\/think\s+(\S+)\s*$/i.exec(trimmed);
    if (thinkMatch) {
      return { kind: "thinkMode", value: normalizeThinkModeValue(thinkMatch[1]) || "off" };
    }

    const fastMatch = /^\/fast\s+(on|off)\s*$/i.exec(trimmed);
    if (fastMatch) {
      return { kind: "fastMode", value: fastMatch[1].toLowerCase() === "on" };
    }

    return null;
  });

  const chatDependencies = {
    appendLocalSessionConversation: vi.fn(),
    buildDashboardSnapshot,
    callOpenClawGateway: vi.fn(async () => ({})),
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

  it("applies think mode before dispatching an openclaw chat turn over HTTP", async () => {
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
        messages: [{ role: "user", content: "/think high" }],
      }),
    });
    const payload = await readJson(response);

    expect(response.ok).toBe(true);
    expect(harness.chatDependencies.callOpenClawGateway).toHaveBeenNthCalledWith(1, "sessions.patch", {
      key: "agent:worker:api-user",
      model: "openai/gpt-5-mini",
    });
    expect(harness.chatDependencies.callOpenClawGateway).toHaveBeenNthCalledWith(2, "sessions.patch", {
      key: "agent:worker:api-user",
      thinkingLevel: "high",
    });
    expect(harness.chatDependencies.dispatchOpenClaw).toHaveBeenCalledWith(
      [{ role: "user", content: "/think high" }],
      false,
      "api-user",
      { commandBody: "/think high", thinkMode: "high" },
    );
    expect(payload.ok).toBe(true);
    expect(payload.metadata.summary).toBe("summary");
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
        messages: [{ role: "user", content: "继续整理项目结构" }],
      }),
    });
    const chatPayload = await readJson(chatResponse);

    expect(chatResponse.ok).toBe(true);
    expect(harness.chatDependencies.dispatchOpenClaw).toHaveBeenCalledWith(
      [{ role: "user", content: "继续整理项目结构" }],
      true,
      "api-user",
      { commandBody: "", thinkMode: "high" },
    );
    expect(harness.chatDependencies.callOpenClawGateway).not.toHaveBeenCalled();
    expect(chatPayload.session).toMatchObject({
      agentId: "worker",
      fastMode: true,
      selectedModel: "openai/gpt-5-mini",
      thinkMode: "high",
    });
  });

  it("carries session preferences into a new HTTP session created by /new", async () => {
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
        messages: [{ role: "user", content: "/new 继续拆分测试" }],
      }),
    });
    const resetPayload = await readJson(resetResponse);

    expect(resetResponse.ok).toBe(true);
    expect(resetPayload.resetSessionUser).toBe("api-user-1700000000000");
    expect(harness.readSessionPreferences("api-user-1700000000000")).toEqual({
      agentId: "worker",
      model: "openai/gpt-5-mini",
      fastMode: false,
      thinkMode: "medium",
    });

    const followUpResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: resetPayload.resetSessionUser,
        fastMode: false,
        messages: [{ role: "user", content: "继续" }],
      }),
    });
    const followUpPayload = await readJson(followUpResponse);

    expect(followUpResponse.ok).toBe(true);
    expect(harness.chatDependencies.dispatchOpenClaw).toHaveBeenLastCalledWith(
      [{ role: "user", content: "继续" }],
      false,
      "api-user-1700000000000",
      { commandBody: "", thinkMode: "medium" },
    );
    expect(followUpPayload.session).toMatchObject({
      agentId: "worker",
      selectedModel: "openai/gpt-5-mini",
      thinkMode: "medium",
    });
  });
});
