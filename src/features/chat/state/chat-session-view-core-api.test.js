import { describe, expect, it } from "vitest";
import * as chatSessionView from "@/features/chat/state/chat-session-view";

describe("chat-session-view core API", () => {
  it("only exposes the centralized chat session view builders and matchers", () => {
    expect(Object.keys(chatSessionView).sort()).toEqual([
      "buildHydratedPendingConversationMessages",
      "buildSettledConversationMessages",
      "buildSettledPendingConversationMessages",
      "buildStabilizedHydratedConversationMessages",
    ]);
  });
});
