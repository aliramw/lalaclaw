import { describe, expect, it } from "vitest";
import * as chatRuntimePending from "@/features/chat/state/chat-runtime-pending";

describe("chat-runtime-pending core API", () => {
  it("only exposes the centralized runtime pending contracts", () => {
    expect(Object.keys(chatRuntimePending).sort()).toEqual([
      "findPendingUserIndex",
      "findSnapshotPendingAssistantIndex",
      "hasAuthoritativePendingAssistantReply",
      "hasSnapshotAdvancedPastPendingTurn",
      "resolveRuntimePendingEntry",
    ]);
  });
});
