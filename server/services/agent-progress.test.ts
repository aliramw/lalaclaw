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

  it("coerces unknown stage values back to the default stage", () => {
    expect(coerceAgentProgressStage("EXECUTING")).toBe("executing");
    expect(coerceAgentProgressStage(" not-a-stage ")).toBe("thinking");
  });

  it("creates a normalized agent progress state", () => {
    expect(createAgentProgressState({
      stage: "synthesizing",
      label: "Synthesizing answer",
      updatedAt: 12345,
    })).toEqual({
      stage: "synthesizing",
      label: "Synthesizing answer",
      updatedAt: 12345,
    });
  });
});
