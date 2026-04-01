import { describe, expect, it } from "vitest";
import * as chatConversationMerge from "@/features/chat/state/chat-conversation-merge";

describe("chat-conversation-merge core API", () => {
  it("only exposes the centralized conversation merge contracts", () => {
    expect(Object.keys(chatConversationMerge).sort()).toEqual([
      "mergeConversationAttachments",
      "mergeConversationIdentity",
    ]);
  });
});
