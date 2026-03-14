import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createAppServer, __test } = require("../server");

async function readJson(response) {
  return await response.json();
}

describe("server helpers", () => {
  it("parses compact numbers and session metadata", () => {
    expect(__test.parseCompactNumber("1.5k")).toBe(1500);
    expect(__test.parseCompactNumber("12m")).toBe(12000000);
    expect(__test.normalizeSessionUser("  Foo Bar/@baz  ")).toBe("Foo-Bar-baz");

    const parsed = __test.parseSessionStatusText(
      [
        "🧠 Model: gpt-5 · 🔑 team-key",
        "🧮 Tokens: 120 in / 90 out",
        "📚 Context: 1.5k/32k",
        "🧵 Session: agent:main:openai-user:test • updated 3m ago",
        "⚙️ Runtime: online",
        "🪢 Queue: empty",
        "🕒 Time: 2026-03-14 18:00",
      ].join("\n"),
    );

    expect(parsed).toMatchObject({
      modelDisplay: "gpt-5",
      authDisplay: "team-key",
      contextUsed: 1500,
      contextMax: 32000,
      queueDisplay: "empty",
    });
  });

  it("builds timeline entries from transcript events", () => {
    const serverPath = path.join(process.cwd(), "server.js");
    const entries = [
      {
        id: "user-1",
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: `请更新 ${serverPath}` }],
        },
      },
      {
        id: "assistant-1",
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [{ type: "toolCall", id: "tool-1", name: "edit_file", arguments: `{\"path\":\"${serverPath}\"}` }],
        },
      },
      {
        id: "tool-result-1",
        type: "message",
        timestamp: 3,
        message: {
          role: "toolResult",
          toolCallId: "tool-1",
          toolName: "edit_file",
          timestamp: 3,
          content: [{ type: "text", text: "已更新 server.js" }],
        },
      },
      {
        id: "assistant-2",
        type: "message",
        timestamp: 4,
        message: {
          role: "assistant",
          timestamp: 4,
          content: [{ type: "text", text: "修改已完成。" }],
        },
      },
    ];

    const [run] = __test.collectTaskTimeline(entries, [process.cwd()]);

    expect(run.prompt).toContain("请更新");
    expect(run.toolsSummary).toContain("edit_file(完成)");
    expect(run.files[0].path).toBe("server.js");
    expect(run.outcome).toContain("修改已完成");
  });

  it("normalizes OpenClaw responses from responses and chat styles", () => {
    expect(__test.parseOpenClawResponse({ output_text: "直接输出" })).toMatchObject({ outputText: "直接输出" });
    expect(
      __test.parseOpenClawResponse({
        choices: [{ message: { content: [{ type: "text", text: "聊天输出" }] } }],
      }),
    ).toMatchObject({ outputText: "聊天输出" });
  });
});

describe("server routes", () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = createAppServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    __test.clearSessionPreferences("api-user");
  });

  afterEach(async () => {
    __test.clearSessionPreferences("api-user");
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("returns session details and supports session updates", async () => {
    const sessionResponse = await fetch(`${baseUrl}/api/session?sessionUser=api-user`);
    const sessionPayload = await readJson(sessionResponse);

    expect(sessionResponse.ok).toBe(true);
    expect(sessionPayload.agentId).toBe("main");

    const updateResponse = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionUser: "api-user", model: "custom-model" }),
    });
    const updatePayload = await readJson(updateResponse);

    expect(updateResponse.ok).toBe(true);
    expect(updatePayload.session.selectedModel).toBe("custom-model");
  });

  it("returns structured errors for invalid JSON bodies", async () => {
    const invalidChatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    const invalidChatPayload = await readJson(invalidChatResponse);

    expect(invalidChatResponse.status).toBe(500);
    expect(invalidChatPayload.ok).toBe(false);
    expect(invalidChatPayload.error).toBe("Invalid JSON body");

    const invalidSessionResponse = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    const invalidSessionPayload = await readJson(invalidSessionResponse);

    expect(invalidSessionResponse.status).toBe(500);
    expect(invalidSessionPayload.ok).toBe(false);
    expect(invalidSessionPayload.error).toBe("Invalid JSON body");
  });

  it("serves the web app and rejects unsupported methods", async () => {
    const indexResponse = await fetch(`${baseUrl}/`);
    const indexHtml = await indexResponse.text();

    expect(indexResponse.ok).toBe(true);
    expect(indexHtml).toContain("<!doctype html>");

    const invalidMethodResponse = await fetch(`${baseUrl}/`, {
      method: "POST",
    });
    const invalidMethodPayload = await readJson(invalidMethodResponse);

    expect(invalidMethodResponse.status).toBe(405);
    expect(invalidMethodPayload.error).toBe("Method not allowed");

    const missingResponse = await fetch(`${baseUrl}/missing-file.js`);
    const missingPayload = await readJson(missingResponse);

    expect(missingResponse.status).toBe(404);
    expect(missingPayload.error).toBe("Not found");
  });
});
