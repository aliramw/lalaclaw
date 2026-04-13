import { describe, expect, it, vi } from "vitest";
import { createHermesClient } from "./hermes-client.ts";

describe("createHermesClient", () => {
  it("preserves normal assistant text while trimming the hermes banner and session id", async () => {
    const client = createHermesClient({
      HERMES_BIN: "hermes",
      PROJECT_ROOT: "/workspace/project",
      execFileAsync: vi.fn(async () => ({
        stdout: [
          "",
          "╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮",
          "hermes-ok",
          "",
          "session_id: 20260413_120617_8ad9f4",
          "",
        ].join("\n"),
      })),
    });

    await expect(
      client.dispatchHermes([{ role: "user", content: "Reply with exactly: hermes-ok" }], { model: "gpt-5.4" }),
    ).resolves.toEqual({
      outputText: "hermes-ok",
      sessionId: "20260413_120617_8ad9f4",
      usage: null,
    });
  });

  it("deduplicates a repeated leading line emitted by the hermes cli", async () => {
    const client = createHermesClient({
      HERMES_BIN: "hermes",
      PROJECT_ROOT: "/workspace/project",
      execFileAsync: vi.fn(async () => ({
        stdout: [
          "╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮",
          "当前运行目录是：",
          "当前运行目录是：",
          "/workspace/project",
          "",
          "session_id: 20260413_132157_fcad5a",
        ].join("\n"),
      })),
    });

    await expect(
      client.dispatchHermes([{ role: "user", content: "当前运行目录是？" }], { model: "gpt-5.4" }),
    ).resolves.toEqual({
      outputText: "当前运行目录是：\n/workspace/project",
      sessionId: "20260413_132157_fcad5a",
      usage: null,
    });
  });

  it("deduplicates a repeated leading line even when hermes inserts a blank separator", async () => {
    const client = createHermesClient({
      HERMES_BIN: "hermes",
      PROJECT_ROOT: "/workspace/project",
      execFileAsync: vi.fn(async () => ({
        stdout: [
          "╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮",
          "是。",
          "",
          "是。",
          "",
          "我是 Hermes Agent。",
          "",
          "session_id: 20260413_132125_2edb08",
        ].join("\n"),
      })),
    });

    await expect(
      client.dispatchHermes([{ role: "user", content: "你是 hermes agent 吗？" }], { model: "gpt-5.4" }),
    ).resolves.toEqual({
      outputText: "是。\n\n我是 Hermes Agent。",
      sessionId: "20260413_132125_2edb08",
      usage: null,
    });
  });

  it("strips the resume notice and hermes chrome before returning resumed session output", async () => {
    const client = createHermesClient({
      HERMES_BIN: "hermes",
      PROJECT_ROOT: "/workspace/project",
      execFileAsync: vi.fn(async () => ({
        stdout: [
          "↻ Resumed session 20260413_135703_6ed2ea (1 user message, 2 total messages)",
          "",
          "╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮",
          "第二轮已收",
          "",
          "session_id: 20260413_135703_6ed2ea",
        ].join("\n"),
      })),
    });

    await expect(
      client.dispatchHermes([{ role: "user", content: "只回复：第二轮已收" }], {
        model: "gpt-5.4",
        sessionId: "20260413_135703_6ed2ea",
      }),
    ).resolves.toEqual({
      outputText: "第二轮已收",
      sessionId: "20260413_135703_6ed2ea",
      usage: null,
    });
  });

  it("returns the latest hermes progress stage alongside normalized output", async () => {
    const client = createHermesClient({
      HERMES_BIN: "hermes",
      PROJECT_ROOT: "/workspace/project",
      execFileAsync: vi.fn(async () => ({
        stdout: [
          "╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮",
          "检查工作区…",
          "执行命令…",
          "第二轮已收",
          "",
          "session_id: 20260413_151122_ba5e9f",
        ].join("\n"),
      })),
    });

    await expect(
      client.dispatchHermes([{ role: "user", content: "继续" }], { model: "gpt-5.4" }),
    ).resolves.toMatchObject({
      outputText: "第二轮已收",
      sessionId: "20260413_151122_ba5e9f",
      usage: null,
      progressStage: "executing",
      progressLabel: "执行命令…",
      progressUpdatedAt: expect.any(Number),
    });
  });
});
