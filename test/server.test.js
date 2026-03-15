import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.COMMANDCENTER_FORCE_MOCK = "1";

const require = createRequire(import.meta.url);
const { createAppServer, __test } = require("../server");
const { DIST_DIR } = require("../server/core");

async function readJson(response) {
  return await response.json();
}

async function readStreamDonePayload(response) {
  const text = await response.text();
  const events = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return events.find((event) => event?.type === "done")?.payload;
}

describe("server helpers", () => {
  it("uses dist as the only static app directory", () => {
    expect(__test.getStaticDir()).toBe(DIST_DIR);
    expect(__test.isWebAppBuilt()).toBe(true);
  });

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
          content: [{ type: "toolCall", id: "tool-1", name: "edit_file", arguments: `{"path":"${serverPath}"}` }],
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

  it("attaches collaborative task relationships to the matching run", () => {
    const entries = [
      {
        id: "user-1",
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "让子 Agent 处理图片任务" }],
        },
      },
      {
        id: "assistant-1",
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [
            {
              type: "toolCall",
              id: "tool-subagent",
              name: "sessions_spawn",
              arguments: '{"agentId":"paint","runtime":"subagent","mode":"task","label":"image-worker","childSessionKey":"agent:paint:subagent:child-1"}',
            },
          ],
        },
      },
      {
        id: "tool-result-1",
        type: "message",
        timestamp: 3,
        message: {
          role: "toolResult",
          toolCallId: "tool-subagent",
          toolName: "sessions_spawn",
          timestamp: 3,
          content: [{ type: "text", text: '{"status":"running","childSessionKey":"agent:paint:subagent:child-1"}' }],
        },
      },
      {
        id: "assistant-2",
        type: "message",
        timestamp: 4,
        message: {
          role: "assistant",
          timestamp: 4,
          content: [{ type: "text", text: "已派发给 paint。" }],
        },
      },
    ];

    const [run] = __test.collectTaskTimeline(entries, [process.cwd()]);

    expect(run.relationships).toEqual([
      expect.objectContaining({
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
      }),
    ]);
  });

  it("normalizes OpenClaw responses from responses and chat styles", () => {
    expect(__test.parseOpenClawResponse({ output_text: "直接输出" })).toMatchObject({ outputText: "直接输出" });
    expect(
      __test.parseOpenClawResponse({
        choices: [{ message: { content: [{ type: "text", text: "聊天输出" }] } }],
      }),
    ).toMatchObject({ outputText: "聊天输出" });
  });

  it("strips OpenClaw user wrappers from hydrated messages", () => {
    expect(
      __test.cleanUserMessage(
        [
          "Sender (untrusted metadata):",
          "```json",
          '{"label":"openclaw-control-ui","id":"openclaw-control-ui"}',
          "```",
          "",
          "[Sun 2026-03-15 01:11 GMT+8] hi",
        ].join("\n"),
      ),
    ).toBe("hi");
    expect(__test.cleanUserMessage("[Sun 2026-03-15 01:03 GMT+8] 你是谁？")).toBe("你是谁？");
    expect(
      __test.cleanUserMessage(
        [
          "[Thu 2026-03-05 22:34 GMT+8] OpenClaw runtime context (internal):",
          "This context is runtime-generated, not user-authored. Keep internal details private.",
        ].join("\n"),
      ),
    ).toBe("");
  });

  it("uses cleaned user prompts in the task timeline", () => {
    const entries = [
      {
        id: "user-1",
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "[Sun 2026-03-15 01:11 GMT+8] hi" }],
        },
      },
    ];

    const [run] = __test.collectTaskTimeline(entries, [process.cwd()]);
    expect(run.prompt).toBe("hi");
  });

  it("collapses replayed duplicate user turns and their repeated assistant reply", () => {
    const merged = __test.mergeConversationMessages(
      [
        {
          role: "user",
          content: "给我看一点新闻",
          timestamp: 1000,
        },
        {
          role: "assistant",
          content: "第一版新闻简报",
          timestamp: 2000,
        },
        {
          role: "user",
          content: "给我看一点新闻",
          timestamp: 80_000,
        },
        {
          role: "assistant",
          content: "重复触发的第二版简报",
          timestamp: 81_000,
        },
      ],
      [],
    );

    expect(merged).toEqual([
      {
        role: "user",
        content: "给我看一点新闻",
        timestamp: 1000,
      },
      {
        role: "assistant",
        content: "第一版新闻简报",
        timestamp: 2000,
      },
    ]);
  });

  it("collapses duplicate user replays that land immediately after a long assistant run", () => {
    const merged = __test.mergeConversationMessages(
      [
        {
          role: "user",
          content: "给我看一点新闻",
          timestamp: 1_000,
        },
        {
          role: "assistant",
          content: "我去抓一版综合新闻，给你一个能直接看的简报。",
          timestamp: 10_000,
        },
        {
          role: "assistant",
          content: "第一版长新闻简报",
          timestamp: 99_000,
        },
        {
          role: "user",
          content: "给我看一点新闻",
          timestamp: 99_100,
        },
        {
          role: "assistant",
          content: "重复触发的第二版简报",
          timestamp: 120_000,
        },
      ],
      [],
    );

    expect(merged).toEqual([
      {
        role: "user",
        content: "给我看一点新闻",
        timestamp: 1_000,
      },
      {
        role: "assistant",
        content: "我去抓一版综合新闻，给你一个能直接看的简报。",
        timestamp: 10_000,
      },
      {
        role: "assistant",
        content: "第一版长新闻简报",
        timestamp: 99_000,
      },
    ]);
  });
});

describe("server routes", () => {
  let server;
  let baseUrl;
  let spawnedSessionUsers;
  let tempDir;

  beforeEach(async () => {
    server = createAppServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    spawnedSessionUsers = new Set();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commandcenter-preview-"));
    __test.clearSessionPreferences("api-user");
  });

  afterEach(async () => {
    __test.clearSessionPreferences("api-user");
    for (const sessionUser of spawnedSessionUsers) {
      __test.clearSessionPreferences(sessionUser);
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(tempDir, { recursive: true, force: true });
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

  it("handles fast slash commands and reflects the updated runtime state", async () => {
    const fastOnResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        messages: [{ role: "user", content: "/fast on" }],
      }),
    });
    const fastOnPayload = await readJson(fastOnResponse);

    expect(fastOnResponse.ok).toBe(true);
    expect(fastOnPayload.commandHandled).toBe("fast");
    expect(fastOnPayload.outputText).toBe("已开启 fast。");
    expect(fastOnPayload.session.fastMode).toBe("开启");
    expect(fastOnPayload.metadata.summary).toBe("fast: on");

    const runtimeResponse = await fetch(`${baseUrl}/api/runtime?sessionUser=api-user`);
    const runtimePayload = await readJson(runtimeResponse);

    expect(runtimeResponse.ok).toBe(true);
    expect(runtimePayload.session.fastMode).toBe("开启");
    expect(runtimePayload.conversation.at(-2)).toMatchObject({
      role: "user",
      content: "/fast on",
    });
    expect(runtimePayload.conversation.at(-1)).toMatchObject({
      role: "assistant",
      content: "已开启 fast。",
    });

    const fastStatusResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        messages: [{ role: "user", content: "/fast status" }],
      }),
    });
    const fastStatusPayload = await readJson(fastStatusResponse);

    expect(fastStatusPayload.outputText).toBe("Fast 当前已开启。");
    expect(fastStatusPayload.metadata.summary).toBe("fast: status");
  });

  it("persists think mode from slash commands on normal chat requests", async () => {
    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        fastMode: false,
        messages: [{ role: "user", content: "/think high" }],
      }),
    });
    const chatPayload = await readStreamDonePayload(chatResponse);

    expect(chatResponse.ok).toBe(true);
    expect(chatPayload.outputText).toContain("Current intent: /think high");
    expect(chatPayload.session.thinkMode).toBe("high");
    expect(chatPayload.metadata.status).toBe("已完成 / 标准");

    const sessionResponse = await fetch(`${baseUrl}/api/session?sessionUser=api-user`);
    const sessionPayload = await readJson(sessionResponse);

    expect(sessionPayload.thinkMode).toBe("high");
  });

  it("creates a fresh session when /new is sent and carries over preferences", async () => {
    const updateResponse = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        model: "custom-model",
        fastMode: true,
        thinkMode: "minimal",
      }),
    });
    const updatePayload = await readJson(updateResponse);

    expect(updateResponse.ok).toBe(true);
    expect(updatePayload.session.selectedModel).toBe("custom-model");

    const resetResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: "api-user",
        fastMode: true,
        messages: [{ role: "user", content: "/new 继续整理项目结构" }],
      }),
    });
    const resetPayload = await readJson(resetResponse);

    spawnedSessionUsers.add(resetPayload.resetSessionUser);

    expect(resetResponse.ok).toBe(true);
    expect(resetPayload.commandHandled).toBe("new");
    expect(resetPayload.resetSessionUser).toMatch(/^api-user-/);
    expect(resetPayload.outputText).toContain("Current intent: 继续整理项目结构");
    expect(resetPayload.session.sessionUser).toBe(resetPayload.resetSessionUser);
    expect(resetPayload.session.selectedModel).toBe("custom-model");
    expect(resetPayload.session.fastMode).toBe("开启");
    expect(resetPayload.session.thinkMode).toBe("minimal");
    expect(resetPayload.conversation[0]).toMatchObject({
      role: "user",
      content: "继续整理项目结构",
    });

    const nextSessionResponse = await fetch(
      `${baseUrl}/api/session?sessionUser=${encodeURIComponent(resetPayload.resetSessionUser)}`,
    );
    const nextSessionPayload = await readJson(nextSessionResponse);

    expect(nextSessionPayload.model).toBe("custom-model");
    expect(nextSessionPayload.thinkMode).toBe("minimal");
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

  it("returns markdown/pdf preview payloads and serves raw media content", async () => {
    const markdownPath = path.join(tempDir, "TOOLS.md");
    const pdfPath = path.join(tempDir, "preview.pdf");
    const imagePath = path.join(tempDir, "preview.png");
    await fs.writeFile(markdownPath, "# Hello\n\nPreview body");
    await fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", "utf8"));
    await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const markdownResponse = await fetch(`${baseUrl}/api/file-preview?path=${encodeURIComponent(markdownPath)}`);
    const markdownPayload = await readJson(markdownResponse);

    expect(markdownResponse.ok).toBe(true);
    expect(markdownPayload).toMatchObject({
      ok: true,
      kind: "markdown",
      name: "TOOLS.md",
      content: "# Hello\n\nPreview body",
    });

    const pdfResponse = await fetch(`${baseUrl}/api/file-preview?path=${encodeURIComponent(pdfPath)}`);
    const pdfPayload = await readJson(pdfResponse);

    expect(pdfResponse.ok).toBe(true);
    expect(pdfPayload).toMatchObject({
      ok: true,
      kind: "pdf",
      name: "preview.pdf",
    });
    expect(pdfPayload.contentUrl).toContain("/api/file-preview/content?path=");

    const imageResponse = await fetch(`${baseUrl}/api/file-preview?path=${encodeURIComponent(imagePath)}`);
    const imagePayload = await readJson(imageResponse);

    expect(imageResponse.ok).toBe(true);
    expect(imagePayload.kind).toBe("image");
    expect(imagePayload.contentUrl).toContain("/api/file-preview/content?path=");

    const mediaResponse = await fetch(`${baseUrl}${imagePayload.contentUrl}`);
    expect(mediaResponse.ok).toBe(true);
    expect(mediaResponse.headers.get("content-type")).toContain("image/png");

    const pdfContentResponse = await fetch(`${baseUrl}${pdfPayload.contentUrl}`);
    expect(pdfContentResponse.ok).toBe(true);
    expect(pdfContentResponse.headers.get("content-type")).toContain("application/pdf");
  });
});
