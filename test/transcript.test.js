import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createTranscriptProjector } = require("../server/transcript");

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
});
