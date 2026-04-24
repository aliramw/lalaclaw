/* global describe, expect, it */
import { createSessionHandlers } from "./session.ts";

describe("createSessionHandlers", () => {
  it("normalizes IM session identity to the plugin-native session key format", () => {
    let responseBody = null;
    const handlers = createSessionHandlers({
      buildDashboardSnapshot: async () => ({}),
      callOpenClawGateway: async () => ({}),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      config: { mode: "openclaw", apiStyle: "openclaw", baseUrl: "http://127.0.0.1:3000", apiKey: "test", localDetected: true, localConfig: {} },
      delay: async () => {},
      getCommandCenterSessionKey: (_agentId, sessionUser) => sessionUser,
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getSessionPreferences: () => ({}),
      listImSessionsForAgent: () => [],
      normalizeSessionUser: (value) => value,
      normalizeThinkMode: () => "off",
      parseRequestBody: async () => ({}),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveCanonicalModelId: (value) => value,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionThinkMode: () => "off",
      searchSessionsForAgent: () => [],
      sendJson: (_res, _status, body) => {
        responseBody = body;
      },
      setSessionPreferences: () => ({}),
    });

    handlers.handleSession(
      {
        headers: { host: "127.0.0.1:3000" },
        url: "/api/session?sessionUser=%7B%22channel%22%3A%22dingtalk-connector%22%2C%22peerid%22%3A%22398058%22%7D",
      },
      {},
    );

    expect(responseBody.sessionUser).toBe("agent:main:dingtalk-connector:direct:398058");
    expect(responseBody.sessionKey).toBe("agent:main:dingtalk-connector:direct:398058");
  });

  it("resolves a bootstrap Weixin session to the latest real Weixin session", () => {
    let responseBody = null;
    const nativeSessionUser = "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat";
    const handlers = createSessionHandlers({
      buildDashboardSnapshot: async () => ({}),
      callOpenClawGateway: async () => ({}),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      config: { mode: "openclaw", apiStyle: "openclaw", baseUrl: "http://127.0.0.1:3000", apiKey: "test", localDetected: true, localConfig: {} },
      delay: async () => {},
      getCommandCenterSessionKey: (agentId, sessionUser) => String(sessionUser || "").startsWith("agent:") ? sessionUser : `agent:${agentId}:openai-user:${sessionUser}`,
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getSessionPreferences: () => ({}),
      listImSessionsForAgent: () => [
        {
          agentId: "main",
          sessionUser: nativeSessionUser,
          updatedAt: 1774255203918,
        },
      ],
      normalizeSessionUser: (value) => value,
      normalizeThinkMode: () => "off",
      parseRequestBody: async () => ({}),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveCanonicalModelId: (value) => value,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionThinkMode: () => "off",
      searchSessionsForAgent: () => [],
      sendJson: (_res, _status, body) => {
        responseBody = body;
      },
      setSessionPreferences: () => ({}),
    });

    handlers.handleSession(
      {
        headers: { host: "127.0.0.1:3000" },
        url: "/api/session?sessionUser=openclaw-weixin%3Adirect%3Adefault",
      },
      {},
    );

    expect(responseBody.sessionUser).toBe(nativeSessionUser);
    expect(responseBody.sessionKey).toBe(nativeSessionUser);
  });

  it("falls back to the dashboard snapshot model when the openclaw session model is only a placeholder", async () => {
    let responseBody = null;
    const handlers = createSessionHandlers({
      buildDashboardSnapshot: async () => ({
        session: {
          selectedModel: "anthropic/claude-opus-4-6",
          model: "anthropic/claude-opus-4-6",
          availableModels: ["anthropic/claude-opus-4-6"],
        },
      }),
      callOpenClawGateway: async () => ({}),
      collectAvailableAgents: () => ["main"],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => ["openclaw"],
      config: { mode: "openclaw", apiStyle: "openclaw", baseUrl: "http://127.0.0.1:3000", apiKey: "test", localDetected: true, localConfig: {} },
      delay: async () => {},
      getCommandCenterSessionKey: (_agentId, sessionUser) => `agent:main:openai-user:${sessionUser}`,
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "openclaw",
      getSessionPreferences: () => ({}),
      listImSessionsForAgent: () => [],
      normalizeSessionUser: (value) => value,
      normalizeThinkMode: () => "off",
      parseRequestBody: async () => ({}),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveCanonicalModelId: (value) => value,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openclaw",
      resolveSessionThinkMode: () => "off",
      searchSessionsForAgent: () => [],
      sendJson: (_res, _status, body) => {
        responseBody = body;
      },
      setSessionPreferences: () => ({}),
    });

    await handlers.handleSession(
      {
        headers: { host: "127.0.0.1:3000" },
        url: "/api/session?sessionUser=command-center&agentId=main",
      },
      {},
    );

    expect(responseBody.model).toBe("anthropic/claude-opus-4-6");
    expect(responseBody.availableModels).toEqual(["anthropic/claude-opus-4-6"]);
  });

  it("does not expose raw agent catalog models in the openclaw session response", async () => {
    let responseBody = null;
    const handlers = createSessionHandlers({
      buildDashboardSnapshot: async () => ({}),
      callOpenClawGateway: async () => ({}),
      collectAvailableAgents: () => ["main"],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: (_localConfig, selectedModels, options) => {
        expect(selectedModels).toEqual(["openai-codex/gpt-5.4"]);
        expect(options).toEqual({ agentId: "main" });
        return ["openai-codex/gpt-5.4"];
      },
      config: { mode: "openclaw", apiStyle: "openclaw", baseUrl: "http://127.0.0.1:3000", apiKey: "test", localDetected: true, localConfig: {} },
      delay: async () => {},
      getCommandCenterSessionKey: (_agentId, sessionUser) => `agent:main:openai-user:${sessionUser}`,
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getSessionPreferences: () => ({}),
      listImSessionsForAgent: () => [],
      normalizeThinkMode: () => "off",
      parseRequestBody: async () => ({}),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveCanonicalModelId: (value) => value,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionThinkMode: () => "off",
      searchSessionsForAgent: () => [],
      sendJson: (_res, _status, body) => {
        responseBody = body;
      },
      setSessionPreferences: () => ({}),
    });

    await handlers.handleSession(
      {
        headers: { host: "127.0.0.1:3000" },
        url: "/api/session?sessionUser=command-center&agentId=main",
      },
      {},
    );

    expect(responseBody.availableModels).toEqual(["openai-codex/gpt-5.4"]);
  });
});
