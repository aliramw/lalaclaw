import { describe, expect, it } from "vitest";
import { buildAgentProgressMessage } from "@/features/chat/state/chat-progress";

describe("buildAgentProgressMessage", () => {
  it("ignores non-string progress labels and falls back to the stage copy", () => {
    expect(
      buildAgentProgressMessage(
        {
          progressStage: "executing",
          progressLabel: { value: "ignored" } as unknown as string,
          progressUpdatedAt: 1,
        },
        {
          chat: {
            agentProgress: {
              executing: "Executing…",
              staleExecuting: "Still executing…",
            },
            thinkingPlaceholder: "Thinking…",
          },
        },
        1,
      ),
    ).toBe("Executing…");
  });

  it("switches to the stale executing copy once the progress age crosses the threshold", () => {
    expect(
      buildAgentProgressMessage(
        {
          progressStage: "executing",
          progressUpdatedAt: 1,
        },
        {
          chat: {
            agentProgress: {
              executing: "Executing…",
              staleExecuting: "Still executing…",
            },
            thinkingPlaceholder: "Thinking…",
          },
        },
        45_001,
      ),
    ).toBe("Still executing…");
  });
});
