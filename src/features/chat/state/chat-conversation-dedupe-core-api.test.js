import { describe, expect, it } from "vitest";
import * as chatConversationDedupe from "@/features/chat/state/chat-conversation-dedupe";

describe("chat-conversation-dedupe core API", () => {
  it("only exposes the centralized dedupe contracts", () => {
    expect(Object.keys(chatConversationDedupe).sort()).toEqual([
      "collapseDuplicateConversationTurns",
    ]);
  });
});
