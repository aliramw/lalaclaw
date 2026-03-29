import { describe, expect, it } from "vitest";
import * as chatSettledConversation from "@/features/chat/state/chat-settled-conversation";

describe("chat-settled-conversation core API", () => {
  it("only exposes the centralized settled conversation builders and reuse policy", () => {
    expect(Object.keys(chatSettledConversation).sort()).toEqual([
      "buildDurableConversationWithLocalTail",
      "buildHydratedConversationWithLocalTail",
      "buildStabilizedHydratedConversationWithLocalState",
      "shouldReuseSettledLocalConversationTail",
    ]);
  });
});
