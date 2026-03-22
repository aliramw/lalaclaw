/* global describe, expect, it */
import { createSessionHandlers } from "./session.ts";

describe("createSessionHandlers", () => {
  it("preserves raw sessionUser values when reporting session identity", () => {
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
      getCommandCenterSessionKey: (agentId, sessionUser) => `agent:${agentId}:openai-user:${sessionUser}`,
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getSessionPreferences: () => ({}),
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

    expect(responseBody.sessionUser).toBe('{"channel":"dingtalk-connector","peerid":"398058"}');
    expect(responseBody.sessionKey).toBe('agent:main:openai-user:{"channel":"dingtalk-connector","peerid":"398058"}');
  });
});
