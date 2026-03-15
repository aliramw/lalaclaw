import { describe, expect, it, vi } from "vitest";
import { mergeTaskRelationships } from "@/features/session/runtime/use-runtime-snapshot";

describe("mergeTaskRelationships", () => {
  it("drops relationships that are missing from the latest runtime snapshot", () => {
    const previousRelationships = [
      {
        id: "rel-agent-paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        timestamp: 1,
      },
    ];
    const nextRelationships = [
      {
        id: "rel-agent-writer:2:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "writer",
        detail: "draft-worker",
        timestamp: 2,
      },
    ];

    expect(mergeTaskRelationships(previousRelationships, nextRelationships)).toEqual([nextRelationships[0]]);
  });

  it("clears all task relationships when the latest runtime snapshot is empty", () => {
    const previousRelationships = [
      {
        id: "rel-agent-paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        timestamp: 1,
        status: "failed",
      },
    ];

    expect(mergeTaskRelationships(previousRelationships, [])).toEqual([]);
  });

  it("deduplicates the same relationship id while keeping the latest payload", () => {
    const previousRelationships = [
      {
        id: "rel-agent-paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        timestamp: 1,
      },
    ];
    const nextRelationships = [
      {
        id: "rel-agent-paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker-updated",
        timestamp: 2,
      },
    ];

    expect(mergeTaskRelationships(previousRelationships, nextRelationships)).toEqual([
      nextRelationships[0],
    ]);
  });

  it("preserves completedAt once a relationship transitions to completed", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456);

    const previousRelationships = [
      {
        id: "rel-agent-paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        timestamp: 1,
        status: "running",
      },
    ];
    const nextRelationships = [
      {
        id: "rel-agent-paint:1:0",
        type: "child_agent",
        sourceAgentId: "main",
        targetAgentId: "paint",
        detail: "image-worker",
        timestamp: 2,
        status: "completed",
      },
    ];

    const merged = mergeTaskRelationships(previousRelationships, nextRelationships);

    expect(merged).toEqual([
      expect.objectContaining({
        id: "rel-agent-paint:1:0",
        status: "completed",
        completedAt: 123456,
      }),
    ]);

    nowSpy.mockRestore();
  });
});
