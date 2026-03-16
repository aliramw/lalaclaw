import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createTranscriptProjector } = require("../server/services");

function createProjector(overrides = {}) {
  return createTranscriptProjector({
    PROJECT_ROOT: overrides.PROJECT_ROOT || process.cwd(),
    LOCAL_OPENCLAW_DIR: overrides.LOCAL_OPENCLAW_DIR || process.cwd(),
    config: overrides.config || { agentId: "main", model: "gpt-5", localConfig: null },
    fileExists: overrides.fileExists || fs.existsSync,
    readJsonIfExists: overrides.readJsonIfExists || (() => null),
    readTextIfExists: overrides.readTextIfExists || (() => ""),
    normalizeThinkMode: overrides.normalizeThinkMode || ((value) => String(value || "").trim().toLowerCase()),
    parseCompactNumber: overrides.parseCompactNumber || (() => 0),
    parseTokenDisplay: overrides.parseTokenDisplay || (() => ({ input: 0, output: 0 })),
    formatTokenBadge: overrides.formatTokenBadge || (() => ""),
    clip: overrides.clip || ((value, length = 999) => String(value || "").slice(0, length)),
    formatTimestamp: overrides.formatTimestamp || ((value) => `ts-${value}`),
  });
}

describe("createTranscriptProjector", () => {
  afterEach(() => {
    fs.rmSync(path.join(os.tmpdir(), "lalaclaw-transcript-test"), { recursive: true, force: true });
  });

  it("collects cleaned conversation messages with assistant token badges", () => {
    const projector = createProjector({
      formatTokenBadge: (usage) => (usage?.output_tokens ? `↑${usage.output_tokens}` : ""),
    });
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "[Sun 2026-03-15 01:11 GMT+8] 你好" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          usage: { output_tokens: 42 },
          content: [{ type: "text", text: "**<small>meta</small>**\n\n[[reply_to_current]]\n已完成" }],
        },
      },
    ];

    expect(projector.collectConversationMessages(entries)).toEqual([
      { role: "user", content: "你好", timestamp: 1 },
      { role: "assistant", content: "已完成", timestamp: 2, tokenBadge: "↑42" },
    ]);
  });

  it("strips injected system exec summaries from user messages and drops NO_REPLY assistant messages", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [
            {
              type: "text",
              text: [
                "System: [2026-03-15 17:48:14 GMT+8] Exec completed (grand-re, code 0) :: uploaded files...",
                "",
                "Sender (untrusted metadata):",
                "```json",
                '{"label":"command-center-backend (gateway-client)","id":"gateway-client"}',
                "```",
                "",
                "[Sun 2026-03-15 17:49 GMT+8] 好",
              ].join("\n"),
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [{ type: "text", text: "NO_REPLY" }],
        },
      },
    ];

    expect(projector.collectConversationMessages(entries)).toEqual([
      { role: "user", content: "好", timestamp: 1 },
    ]);
  });

  it("collapses fallback-replayed user messages after a transient assistant failure", () => {
    const projector = createProjector();
    const wrappedPrompt = [
      "Sender (untrusted metadata):",
      "```json",
      '{"label":"command-center-backend (gateway-client)","id":"gateway-client"}',
      "```",
      "",
      "[Mon 2026-03-16 11:12 GMT+8] 你昨天做了些什么？",
    ].join("\n");
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1000,
          content: [{ type: "text", text: wrappedPrompt }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2500,
          content: [],
          stopReason: "error",
          errorMessage: "402 This request requires more credits",
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 121000,
          content: [{ type: "text", text: wrappedPrompt }],
        },
      },
      {
        type: "message",
        timestamp: 4,
        message: {
          role: "assistant",
          timestamp: 121500,
          content: [{ type: "text", text: "我昨天主要完成了部署和发布链路。" }],
        },
      },
    ];

    expect(projector.collectConversationMessages(entries)).toEqual([
      { role: "user", content: "你昨天做了些什么？", timestamp: 1000 },
      { role: "assistant", content: "我昨天主要完成了部署和发布链路。", timestamp: 121500 },
    ]);
  });

  it("drops a transient partial assistant reply when the same user turn is auto-replayed after a prompt error", () => {
    const projector = createProjector();
    const wrappedPrompt = [
      "Sender (untrusted metadata):",
      "```json",
      '{"label":"LalaClaw (gateway-client)","id":"gateway-client"}',
      "```",
      "",
      "[Mon 2026-03-16 14:41 GMT+8] 在深入说说",
    ].join("\n");
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1000,
          content: [{ type: "text", text: wrappedPrompt }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2000,
          content: [{ type: "text", text: "[[reply_to_current]] 第一版开头" }],
        },
      },
      {
        type: "custom",
        customType: "openclaw:prompt-error",
        timestamp: 3,
        data: {
          timestamp: 2500,
          error: "aborted",
        },
      },
      {
        type: "custom",
        customType: "model-snapshot",
        timestamp: 4,
        data: {
          timestamp: 2600,
          modelId: "openai/gpt-5.4",
        },
      },
      {
        type: "message",
        timestamp: 5,
        message: {
          role: "user",
          timestamp: 3000,
          content: [{ type: "text", text: wrappedPrompt }],
        },
      },
      {
        type: "message",
        timestamp: 6,
        message: {
          role: "assistant",
          timestamp: 4500,
          content: [{ type: "text", text: "[[reply_to_current]] 第二版完整回答" }],
        },
      },
    ];

    expect(projector.collectConversationMessages(entries)).toEqual([
      { role: "user", content: "在深入说说", timestamp: 1000 },
      { role: "assistant", content: "第二版完整回答", timestamp: 4500 },
    ]);
  });

  it("drops a stopped partial assistant reply from conversation artifacts and snapshots", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1000,
          content: [{ type: "text", text: "[Mon 2026-03-16 19:01 GMT+8] hi" }],
        },
      },
      {
        id: "assistant-partial",
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2000,
          content: [{ type: "text", text: "[[reply_to_current]] 嗯，马锐拉，我在。" }],
        },
      },
      {
        type: "custom",
        customType: "openclaw:prompt-error",
        timestamp: 3,
        data: {
          timestamp: 2200,
          error: "aborted",
        },
      },
    ];

    expect(projector.collectConversationMessages(entries)).toEqual([
      { role: "user", content: "hi", timestamp: 1000 },
    ]);
    expect(projector.collectArtifacts(entries)).toEqual([]);
    expect(projector.collectSnapshots(entries, { sessionId: "session-1" })).toEqual([]);
  });

  it("keeps repeated user messages when there was no transient assistant failure between them", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1000,
          content: [{ type: "text", text: "[Mon 2026-03-16 11:12 GMT+8] 你昨天做了些什么？" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "user",
          timestamp: 3000,
          content: [{ type: "text", text: "[Mon 2026-03-16 11:12 GMT+8] 你昨天做了些什么？" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "assistant",
          timestamp: 5000,
          content: [{ type: "text", text: "我可以重复回答这类问题。" }],
        },
      },
    ];

    expect(projector.collectConversationMessages(entries)).toEqual([
      { role: "user", content: "你昨天做了些什么？", timestamp: 1000 },
      { role: "user", content: "你昨天做了些什么？", timestamp: 3000 },
      { role: "assistant", content: "我可以重复回答这类问题。", timestamp: 5000 },
    ]);
  });

  it("builds tool history and marks failed tool results", () => {
    const projector = createProjector({
      clip: (value, length = 999) => String(value || "").slice(0, length),
    });
    const entries = [
      {
        type: "message",
        timestamp: 10,
        message: {
          role: "assistant",
          timestamp: 10,
          content: [{ type: "toolCall", id: "tool-1", name: "edit", arguments: '{"path":"src/App.jsx"}' }],
        },
      },
      {
        type: "message",
        timestamp: 11,
        message: {
          role: "toolResult",
          timestamp: 11,
          toolCallId: "tool-1",
          toolName: "edit",
          details: { isError: true },
          content: [{ type: "text", text: "permission denied" }],
        },
      },
    ];

    expect(projector.collectToolHistory(entries)).toEqual([
      {
        id: "tool-1",
        name: "edit",
        status: "失败",
        detail: "permission denied",
        timestamp: 10,
      },
    ]);
  });

  it("collects files mentioned in assistant text and injected workspace files", () => {
    const tmpRoot = path.join(os.tmpdir(), "lalaclaw-transcript-test");
    const writerWorkspace = path.join(tmpRoot, "workspace-writer");
    const userFile = path.join(writerWorkspace, "USER.md");
    const projectFile = path.join(tmpRoot, "src", "App.jsx");
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.mkdirSync(path.dirname(projectFile), { recursive: true });
    fs.writeFileSync(userFile, "# user\n");
    fs.writeFileSync(projectFile, "export default null;\n");

    const projector = createProjector({
      PROJECT_ROOT: tmpRoot,
    });
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [{ type: "text", text: "你的 `USER.md` 里定义了风格。" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [{ type: "text", text: `完整路径是 \`${projectFile}\`` }],
        },
      },
    ];

    expect(
      projector.collectFiles(entries, [tmpRoot], {
        injectedFiles: [{ path: userFile }],
      }),
    ).toEqual([
      expect.objectContaining({
        path: "src/App.jsx",
        fullPath: projectFile,
        primaryAction: "viewed",
      }),
      expect.objectContaining({
        path: "workspace-writer/USER.md",
        fullPath: userFile,
        primaryAction: "viewed",
      }),
    ]);
  });

  it("collects files from message attachments with local paths", () => {
    const tmpRoot = path.join(os.tmpdir(), "lalaclaw-transcript-test");
    const imageFile = path.join(tmpRoot, "assets", "poster.png");
    fs.mkdirSync(path.dirname(imageFile), { recursive: true });
    fs.writeFileSync(imageFile, "png");

    const projector = createProjector({
      PROJECT_ROOT: tmpRoot,
    });

    expect(
      projector.collectFiles(
        [
          {
            type: "message",
            timestamp: 1,
            message: {
              role: "user",
              timestamp: 1,
              content: [{ type: "text", text: "帮我看这张图" }],
              attachments: [{ name: "poster.png", path: imageFile, fullPath: imageFile, kind: "image" }],
            },
          },
        ],
        [tmpRoot],
      ),
    ).toEqual([
      expect.objectContaining({
        path: "assets/poster.png",
        fullPath: imageFile,
        primaryAction: "viewed",
      }),
    ]);
  });

  it("prioritizes recently mentioned files over older file mtimes", () => {
    const tmpRoot = path.join(os.tmpdir(), "lalaclaw-transcript-test");
    const recentWorkspaceFile = path.join(tmpRoot, "workspace", "latest.md");
    const olderMentionedFile = path.join(tmpRoot, "assets", "poster.png");
    fs.mkdirSync(path.dirname(recentWorkspaceFile), { recursive: true });
    fs.mkdirSync(path.dirname(olderMentionedFile), { recursive: true });
    fs.writeFileSync(recentWorkspaceFile, "latest");
    fs.writeFileSync(olderMentionedFile, "poster");
    fs.utimesSync(recentWorkspaceFile, new Date("2026-03-15T00:00:00Z"), new Date("2026-03-15T00:00:00Z"));
    fs.utimesSync(olderMentionedFile, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"));

    const projector = createProjector({
      PROJECT_ROOT: tmpRoot,
    });

    const files = projector.collectFiles(
      [
        {
          type: "message",
          timestamp: 1,
          message: {
            role: "assistant",
            timestamp: 1,
            content: [{ type: "text", text: `更新了 ${recentWorkspaceFile}` }],
          },
        },
        {
          type: "message",
          timestamp: 2,
          message: {
            role: "user",
            timestamp: 2,
            content: [{ type: "text", text: `你看一下这个文件：${olderMentionedFile}` }],
          },
        },
      ],
      [tmpRoot],
    );

    expect(files[0]).toMatchObject({
      path: "assets/poster.png",
      fullPath: olderMentionedFile,
      primaryAction: "viewed",
    });
  });

  it("preserves all detected files instead of truncating to eight entries", () => {
    const tmpRoot = path.join(os.tmpdir(), "lalaclaw-transcript-test");
    const projector = createProjector({
      PROJECT_ROOT: tmpRoot,
    });

    const entries = Array.from({ length: 9 }, (_, index) => {
      const filePath = path.join(tmpRoot, "batch", `file-${index + 1}.md`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `file ${index + 1}`);
      return {
        type: "message",
        timestamp: index + 1,
        message: {
          role: "assistant",
          timestamp: index + 1,
          content: [{ type: "text", text: `查看 ${filePath}` }],
        },
      };
    });

    const files = projector.collectFiles(entries, [tmpRoot]);

    expect(files).toHaveLength(9);
    expect(files.at(-1)).toMatchObject({
      path: "batch/file-1.md",
    });
  });

  it("builds agent graph from local config and session index activity", () => {
    const tmpRoot = path.join(os.tmpdir(), "lalaclaw-transcript-test");
    const sessionsDir = path.join(tmpRoot, "agents", "worker", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        "agent:worker:test": {
          updatedAt: 123,
        },
      }),
    );

    const projector = createProjector({
      LOCAL_OPENCLAW_DIR: tmpRoot,
      readJsonIfExists: (filePath) => {
        if (!fs.existsSync(filePath)) {
          return null;
        }
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      },
      config: {
        agentId: "main",
        model: "gpt-5",
        localConfig: {
          agents: {
            defaults: {
              model: { primary: "gpt-5" },
            },
            list: [
              { id: "main", default: true, model: { primary: "gpt-5" }, subagents: { allowAgents: ["worker"] } },
              { id: "worker", model: { primary: "gpt-5-mini" } },
            ],
          },
        },
      },
    });

    expect(projector.buildAgentGraph()).toEqual([
      {
        id: "main",
        label: "main",
        state: "active",
        detail: "主 Agent · gpt-5",
        updatedAt: 0,
        sessionCount: 0,
      },
      {
        id: "worker",
        label: "worker",
        state: "ready",
        detail: "可调度子 Agent · gpt-5-mini",
        updatedAt: 123,
        sessionCount: 1,
      },
    ]);
  });

  it("collects task relationships across multiple task windows with derived statuses", () => {
    const projector = createProjector({
      config: {
        agentId: "main",
        model: "gpt-5",
        localConfig: null,
      },
    });
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "上一轮任务" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [
            {
              id: "tool-writer",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2.5,
        message: {
          role: "toolResult",
          timestamp: 2.5,
          toolCallId: "tool-writer",
          toolName: "sessions_spawn",
          details: { status: "accepted" },
          content: [{ type: "text", text: "{\"status\":\"accepted\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 3,
          content: [{ type: "text", text: "当前任务" }],
        },
      },
      {
        type: "message",
        timestamp: 4,
        message: {
          role: "assistant",
          timestamp: 4,
          content: [
            {
              id: "tool-session",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                mode: "session",
                label: "fresh-session",
              },
            },
            {
              id: "tool-paint",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "paint",
                mode: "run",
                label: "image-worker",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 4.2,
        message: {
          role: "toolResult",
          timestamp: 4.2,
          toolCallId: "tool-session",
          toolName: "sessions_spawn",
          details: { status: "accepted" },
          content: [{ type: "text", text: "{\"status\":\"accepted\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 4.3,
        message: {
          role: "toolResult",
          timestamp: 4.3,
          toolCallId: "tool-paint",
          toolName: "sessions_spawn",
          details: { status: "error", error: "spawn failed" },
          content: [{ type: "text", text: "{\"status\":\"error\",\"error\":\"spawn failed\"}" }],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:2:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "",
        toolCallId: "tool-writer",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 2,
        status: "running",
      },
      {
        id: "session:fresh-session:4:0",
        type: "session_spawn",
        sourceAgentId: "main",
        targetAgentId: "",
        detail: "fresh-session",
        toolCallId: "tool-session",
        childSessionKey: "",
        spawnMode: "session",
        runtime: "",
        timestamp: 4,
        status: "established",
      },
      {
        id: "agent:paint:4:1",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        toolCallId: "tool-paint",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 4,
        status: "failed",
      },
    ]);
  });

  it("keeps multiple child-task relationships instead of collapsing later ones over earlier ones", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "主任务一" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [
            {
              id: "tool-paint-initial",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "paint",
                mode: "run",
                label: "image-worker",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 3,
          content: [{ type: "text", text: "主任务二" }],
        },
      },
      {
        type: "message",
        timestamp: 4,
        message: {
          role: "assistant",
          timestamp: 4,
          content: [
            {
              id: "tool-writer-later",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "draft-worker",
              },
            },
            {
              id: "tool-paint-later",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "paint",
                mode: "run",
                label: "review-worker",
              },
            },
          ],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:paint:2:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        toolCallId: "tool-paint-initial",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 2,
        status: "dispatching",
      },
      {
        id: "agent:writer:4:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "draft-worker",
        toolCallId: "tool-writer-later",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 4,
        status: "dispatching",
      },
      {
        id: "agent:paint:4:1",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "review-worker",
        toolCallId: "tool-paint-later",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 4,
        status: "dispatching",
      },
    ]);
  });

  it("reuses the same relationship entry when a failed spawn is retried in the same task turn", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "并行写三篇文章" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [
            {
              id: "tool-writer-initial",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "write-human-future",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2.1,
        message: {
          role: "toolResult",
          timestamp: 2.1,
          toolCallId: "tool-writer-initial",
          toolName: "sessions_spawn",
          details: {
            status: "error",
            error: "streamTo is only supported for runtime=acp; got runtime=subagent",
          },
          content: [{ type: "text", text: "{\"status\":\"error\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "assistant",
          timestamp: 3,
          content: [
            {
              id: "tool-writer-retry",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "write-human-future",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 3.1,
        message: {
          role: "toolResult",
          timestamp: 3.1,
          toolCallId: "tool-writer-retry",
          toolName: "sessions_spawn",
          details: {
            status: "accepted",
            childSessionKey: "agent:writer:subagent:child-retry",
          },
          content: [{ type: "text", text: "{\"status\":\"accepted\",\"childSessionKey\":\"agent:writer:subagent:child-retry\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 4,
        message: {
          role: "user",
          timestamp: 4,
          provenance: {
            kind: "inter_session",
            sourceSessionKey: "agent:writer:subagent:child-retry",
            sourceTool: "subagent_announce",
          },
          content: [
            {
              type: "text",
              text: `[Sun 2026-03-15 08:36 GMT+8] OpenClaw runtime context (internal):
This context is runtime-generated, not user-authored. Keep internal details private.

[Internal task completion event]
source: subagent
session_key: agent:writer:subagent:child-retry
session_id: child-session-retry
type: subagent task
task: write-human-future
status: completed successfully`,
            },
          ],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:2:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "write-human-future",
        toolCallId: "tool-writer-retry",
        childSessionKey: "agent:writer:subagent:child-retry",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 2,
        status: "completed",
      },
    ]);
  });

  it("keeps separate relationship entries when the user retries the same task in a later turn", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "user",
          timestamp: 1,
          content: [{ type: "text", text: "第一次写《人类的未来》" }],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "assistant",
          timestamp: 2,
          content: [
            {
              id: "tool-writer-initial",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "write-human-future",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2.1,
        message: {
          role: "toolResult",
          timestamp: 2.1,
          toolCallId: "tool-writer-initial",
          toolName: "sessions_spawn",
          details: {
            status: "error",
            error: "spawn failed",
          },
          content: [{ type: "text", text: "{\"status\":\"error\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 3,
          content: [{ type: "text", text: "再试一次《人类的未来》" }],
        },
      },
      {
        type: "message",
        timestamp: 4,
        message: {
          role: "assistant",
          timestamp: 4,
          content: [
            {
              id: "tool-writer-retry",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "write-human-future",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 4.1,
        message: {
          role: "toolResult",
          timestamp: 4.1,
          toolCallId: "tool-writer-retry",
          toolName: "sessions_spawn",
          details: {
            status: "accepted",
          },
          content: [{ type: "text", text: "{\"status\":\"accepted\"}" }],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:2:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "write-human-future",
        toolCallId: "tool-writer-initial",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 2,
        status: "failed",
      },
      {
        id: "agent:writer:4:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "write-human-future",
        toolCallId: "tool-writer-retry",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 4,
        status: "running",
      },
    ]);
  });

  it("uses the task text as the relationship label when sessions_spawn has no explicit label", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [
            {
              id: "tool-paint-task-only",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "paint",
                mode: "run",
                task: "生成封面草图",
              },
            },
            {
              id: "tool-session-task-only",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                mode: "session",
                task: "切换到作家会话",
              },
            },
          ],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "生成封面草图",
        toolCallId: "tool-paint-task-only",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 1,
        status: "dispatching",
      },
      {
        id: "session:spawn:1:1",
        type: "session_spawn",
        sourceAgentId: "main",
        targetAgentId: "",
        detail: "切换到作家会话",
        toolCallId: "tool-session-task-only",
        childSessionKey: "",
        spawnMode: "session",
        runtime: "",
        timestamp: 1,
        status: "dispatching",
      },
    ]);
  });

  it("marks child-agent relationships completed when the spawned session has already replied", () => {
    const tmpRoot = path.join(os.tmpdir(), "lalaclaw-transcript-test");
    const childSessionKey = "agent:writer:subagent:child-1";
    const childSessionId = "child-session-1";
    const childSessionsDir = path.join(tmpRoot, "agents", "writer", "sessions");
    fs.mkdirSync(childSessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(childSessionsDir, "sessions.json"),
      JSON.stringify({
        [childSessionKey]: { sessionId: childSessionId },
      }),
    );
    fs.writeFileSync(
      path.join(childSessionsDir, `${childSessionId}.jsonl`),
      [
        JSON.stringify({
          type: "message",
          timestamp: 11,
          message: {
            role: "user",
            timestamp: 11,
            content: [{ type: "text", text: "写一段文案" }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: 12,
          message: {
            role: "assistant",
            timestamp: 12,
            content: [{ type: "text", text: "文案已完成" }],
          },
        }),
      ].join("\n"),
    );

    const projector = createProjector({
      LOCAL_OPENCLAW_DIR: tmpRoot,
      readJsonIfExists: (filePath) => (fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null),
      readTextIfExists: (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""),
    });
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [
            {
              id: "tool-writer-complete",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "draft-worker",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "toolResult",
          timestamp: 2,
          toolCallId: "tool-writer-complete",
          toolName: "sessions_spawn",
          details: {
            status: "accepted",
            childSessionKey,
          },
          content: [{ type: "text", text: `{"status":"accepted","childSessionKey":"${childSessionKey}"}` }],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "draft-worker",
        toolCallId: "tool-writer-complete",
        childSessionKey,
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 1,
        status: "completed",
      },
    ]);
  });

  it("backfills a missing task label from sessions_spawn tool results", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [
            {
              id: "tool-writer-result-label",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "toolResult",
          timestamp: 2,
          toolCallId: "tool-writer-result-label",
          toolName: "sessions_spawn",
          details: {
            status: "accepted",
            task: "写产品总结",
          },
          content: [{ type: "text", text: "{\"status\":\"accepted\",\"task\":\"写产品总结\"}" }],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "写产品总结",
        toolCallId: "tool-writer-result-label",
        childSessionKey: "",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 1,
        status: "running",
      },
    ]);
  });

  it("marks child-agent relationships completed from internal task completion events in the parent transcript", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [
            {
              id: "tool-writer-complete-event",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "writer",
                mode: "run",
                label: "writer-poem-3",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "toolResult",
          timestamp: 2,
          toolCallId: "tool-writer-complete-event",
          toolName: "sessions_spawn",
          details: { status: "accepted" },
          content: [{ type: "text", text: "{\"status\":\"accepted\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 3,
          provenance: {
            kind: "inter_session",
            sourceSessionKey: "agent:writer:subagent:child-3",
            sourceTool: "subagent_announce",
          },
          content: [
            {
              type: "text",
              text: `[Sun 2026-03-15 08:36 GMT+8] OpenClaw runtime context (internal):
This context is runtime-generated, not user-authored. Keep internal details private.

[Internal task completion event]
source: subagent
session_key: agent:writer:subagent:child-3
session_id: child-session-3
type: subagent task
task: writer-poem-3
status: completed successfully`,
            },
          ],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "writer-poem-3",
        toolCallId: "tool-writer-complete-event",
        childSessionKey: "agent:writer:subagent:child-3",
        spawnMode: "run",
        runtime: "subagent",
        timestamp: 1,
        status: "completed",
      },
    ]);
  });

  it("backfills session-spawn task labels from internal completion events", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [
            {
              id: "tool-session-complete-event",
              type: "toolCall",
              name: "sessions_spawn",
              arguments: {
                mode: "session",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "toolResult",
          timestamp: 2,
          toolCallId: "tool-session-complete-event",
          toolName: "sessions_spawn",
          details: {
            status: "accepted",
            childSessionKey: "agent:writer:session:child-4",
          },
          content: [{ type: "text", text: "{\"status\":\"accepted\",\"childSessionKey\":\"agent:writer:session:child-4\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 3,
          provenance: {
            kind: "inter_session",
            sourceSessionKey: "agent:writer:session:child-4",
            sourceTool: "session_announce",
          },
          content: [
            {
              type: "text",
              text: `[Sun 2026-03-15 08:36 GMT+8] OpenClaw runtime context (internal):
This context is runtime-generated, not user-authored. Keep internal details private.

[Internal task completion event]
source: session
session_key: agent:writer:session:child-4
session_id: child-session-4
type: session task
task: 切换到作家会话
status: completed successfully`,
            },
          ],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "session:spawn:1:0",
        type: "session_spawn",
        sourceAgentId: "main",
        targetAgentId: "",
        detail: "切换到作家会话",
        toolCallId: "tool-session-complete-event",
        childSessionKey: "agent:writer:session:child-4",
        spawnMode: "session",
        runtime: "",
        timestamp: 1,
        status: "completed",
      },
    ]);
  });

  it("backfills the task label from an internal completion event when the spawn had no label", () => {
    const projector = createProjector();
    const entries = [
      {
        type: "message",
        timestamp: 1,
        message: {
          role: "assistant",
          timestamp: 1,
          content: [
            {
              id: "tool-writer-unlabeled",
              type: "toolCall",
              name: "subagents",
              arguments: {
                action: "spawn",
                agentId: "writer",
              },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: 2,
        message: {
          role: "toolResult",
          timestamp: 2,
          toolCallId: "tool-writer-unlabeled",
          toolName: "subagents",
          details: { status: "accepted" },
          content: [{ type: "text", text: "{\"status\":\"accepted\"}" }],
        },
      },
      {
        type: "message",
        timestamp: 3,
        message: {
          role: "user",
          timestamp: 3,
          provenance: {
            kind: "inter_session",
            sourceSessionKey: "agent:writer:subagent:child-unlabeled",
            sourceTool: "subagent_announce",
          },
          content: [
            {
              type: "text",
              text: `[Sun 2026-03-15 08:36 GMT+8] OpenClaw runtime context (internal):
This context is runtime-generated, not user-authored. Keep internal details private.

[Internal task completion event]
source: subagent
session_key: agent:writer:subagent:child-unlabeled
session_id: child-session-unlabeled
type: subagent task
task: draft-worker
status: completed successfully`,
            },
          ],
        },
      },
    ];

    expect(projector.collectTaskRelationships(entries, "main")).toEqual([
      {
        id: "agent:writer:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "draft-worker",
        toolCallId: "tool-writer-unlabeled",
        childSessionKey: "agent:writer:subagent:child-unlabeled",
        spawnMode: "spawn",
        runtime: "subagent",
        timestamp: 1,
        status: "completed",
      },
    ]);
  });
});
