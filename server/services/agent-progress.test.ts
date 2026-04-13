import { afterEach, describe, expect, it, vi } from "vitest";
import { agentProgressStages } from "@/features/chat/state/chat-progress";
import {
  AGENT_PROGRESS_STAGES,
  coerceAgentProgressStage,
  createAgentProgressState,
  mapHermesProgressLine,
  inferHermesProgressState,
  inferOpenClawDispatchProgressState,
  inferOpenClawStreamProgressState,
} from "./agent-progress.ts";

describe("agent progress helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the canonical agent progress stage order", () => {
    expect(AGENT_PROGRESS_STAGES).toEqual([
      "thinking",
      "inspecting",
      "executing",
      "synthesizing",
      "finishing",
    ]);
  });

  it("stays aligned with the client-side stage list", () => {
    expect(AGENT_PROGRESS_STAGES).toEqual(agentProgressStages);
  });

  it("coerces unknown stage values to an empty stage", () => {
    expect(coerceAgentProgressStage("EXECUTING")).toBe("executing");
    expect(coerceAgentProgressStage(" not-a-stage ")).toBe("");
  });

  it("creates a normalized agent progress state", () => {
    expect(createAgentProgressState({
      stage: "synthesizing",
      label: "Synthesizing answer",
      updatedAt: 12345,
    })).toEqual({
      progressStage: "synthesizing",
      progressLabel: "Synthesizing answer",
      progressUpdatedAt: 12345,
    });
  });

  it("accepts canonical progress fields too", () => {
    expect(createAgentProgressState({
      progressStage: "executing",
      progressLabel: "Executing answer",
      progressUpdatedAt: 12345,
    })).toEqual({
      progressStage: "executing",
      progressLabel: "Executing answer",
      progressUpdatedAt: 12345,
    });
  });

  it("falls back to provider fields when canonical fields are invalid", () => {
    expect(createAgentProgressState({
      progressStage: "mystery",
      stage: "executing",
      progressLabel: " ",
      label: "Executing answer",
      progressUpdatedAt: 0,
      updatedAt: 12345,
    })).toEqual({
      progressStage: "executing",
      progressLabel: "Executing answer",
      progressUpdatedAt: 12345,
    });
  });

  it("drops object-like labels and falls back to the provider string label", () => {
    expect(createAgentProgressState({
      progressStage: "executing",
      progressLabel: { value: "ignored" },
      label: " Executing answer ",
      progressUpdatedAt: 12345,
    })).toEqual({
      progressStage: "executing",
      progressLabel: "Executing answer",
      progressUpdatedAt: 12345,
    });
  });

  it("drops malformed stages instead of inventing thinking", () => {
    expect(createAgentProgressState({
      progressStage: "mystery",
      progressLabel: "",
      progressUpdatedAt: 12345,
    })).toEqual({});
    expect(createAgentProgressState({
      progressStage: "mystery",
      progressLabel: "Still working",
      progressUpdatedAt: 12345,
    })).toEqual({
      progressLabel: "Still working",
      progressUpdatedAt: 12345,
    });
  });

  it("maps the latest hermes progress line to a normalized provider stage", () => {
    const progress = inferHermesProgressState({
      stdout: [
        "检查工作区…",
        "执行命令…",
        "第二轮已收",
        "session_id: hermes-session-1",
      ].join("\n"),
      progressUpdatedAt: 12345,
    });

    expect(progress).toEqual({
      progressStage: "executing",
      progressLabel: "执行命令…",
      progressUpdatedAt: 12345,
    });
  });

  it("does not classify ordinary assistant prose as hermes progress", () => {
    expect(mapHermesProgressLine("我会先查看你的上下文，再分析结果并输出一个完成后的建议。")).toEqual({});
    expect(inferHermesProgressState({
      stdout: "我会先查看你的上下文，再分析结果并输出一个完成后的建议。",
      progressUpdatedAt: 12345,
    })).toEqual({});
  });

  it("treats an openclaw stream with no visible delta as thinking", () => {
    expect(inferOpenClawStreamProgressState({
      hasStarted: true,
      progressUpdatedAt: 12345,
    })).toEqual({
      progressStage: "thinking",
      progressUpdatedAt: 12345,
    });
  });

  it("marks a completed openclaw dispatch as synthesizing", () => {
    expect(inferOpenClawDispatchProgressState({
      hasOutput: true,
      progressUpdatedAt: 12345,
    })).toEqual({
      progressStage: "synthesizing",
      progressUpdatedAt: 12345,
    });
  });
});
