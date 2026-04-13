import { describe, expect, it } from "vitest";
import {
  AGENT_PROGRESS_STAGES,
  coerceAgentProgressStage,
  createAgentProgressState,
} from "./agent-progress.ts";

describe("agent progress helpers", () => {
  it("exposes the canonical agent progress stage order", () => {
    expect(AGENT_PROGRESS_STAGES).toEqual([
      "thinking",
      "inspecting",
      "executing",
      "synthesizing",
      "finishing",
    ]);
  });

  it("coerces unknown stage values to an empty stage", () => {
    expect(coerceAgentProgressStage("EXECUTING")).toBe("executing");
    expect(coerceAgentProgressStage(" not-a-stage ")).toBe("");
  });

  it("creates a normalized agent progress state", () => {
    expect(createAgentProgressState({
      progressStage: "synthesizing",
      progressLabel: "Synthesizing answer",
      progressUpdatedAt: 12345,
    })).toEqual({
      progressStage: "synthesizing",
      progressLabel: "Synthesizing answer",
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
});
