import { describe, expect, it } from "vitest";

import { collectAvailableRuntimeAgentIds } from "@/features/session/runtime/runtime-agent-availability";

describe("collectAvailableRuntimeAgentIds", () => {
  it("keeps availableAgents first and supplements explicitly installed agents", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main"],
        agents: [
          { agentId: "hermes", installed: true },
        ],
      }),
    ).toEqual(["main", "hermes"]);
  });

  it("does not surface agents without explicit installed state", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main"],
        agents: [
          { agentId: "hermes" },
          { agentId: "writer", installed: false },
        ],
      }),
    ).toEqual(["main"]);
  });

  it("drops malformed and duplicate ids while preserving order", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main", "hermes", "main", "", {}],
        agents: [
          null,
          { id: "hermes", installed: true },
          { agentId: "worker", installed: true },
          { agentId: "worker", installed: true },
        ],
      }),
    ).toEqual(["main", "hermes", "worker"]);
  });

  it("falls back past whitespace-only agent ids", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main"],
        agents: [
          { agentId: "   ", id: "worker", installed: true },
          { agentId: "\t", name: "writer", installed: true },
        ],
      }),
    ).toEqual(["main", "worker", "writer"]);
  });

  it("ignores malformed non-array containers", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: { 0: "main", length: 1 },
        agents: "hermes",
      }),
    ).toEqual([]);
  });
});
