import { describe, expect, it } from "vitest";
import * as chatSessionView from "@/features/chat/state/chat-session-view";

describe("chat-session-view core API", () => {
  it("only exposes the remaining hydrated pending helper", () => {
    expect(Object.keys(chatSessionView).sort()).toEqual([
      "buildHydratedPendingConversationMessages",
    ]);
  });
});
