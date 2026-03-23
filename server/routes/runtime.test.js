/* global describe, expect, it */
import { createRuntimeHandler } from "./runtime.ts";

describe("createRuntimeHandler", () => {
  it("normalizes IM sessionUser values before building the dashboard snapshot", async () => {
    const buildDashboardSnapshot = async (sessionUser) => ({
      session: {
        sessionUser,
      },
      conversation: [],
    });
    let responseStatus = null;
    let responseBody = null;
    const handleRuntime = createRuntimeHandler({
      buildDashboardSnapshot,
      config: { mode: "openclaw", model: "openai-codex/gpt-5.4" },
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleRuntime(
      {
        headers: { host: "127.0.0.1:3000" },
        url: "/api/runtime?agentId=main&sessionUser=%7B%22channel%22%3A%22dingtalk-connector%22%2C%22peerid%22%3A%22398058%22%7D",
      },
      {},
    );

    expect(responseStatus).toBe(200);
    expect(responseBody.session.sessionUser).toBe("agent:main:dingtalk-connector:direct:398058");
  });
});
