import { describe, expect, it } from "vitest";
import { agentProgressStages } from "@/features/chat/state/chat-progress";
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
});
