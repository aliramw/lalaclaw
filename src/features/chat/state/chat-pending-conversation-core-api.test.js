import { describe, expect, it } from "vitest";
import * as chatPendingConversation from "@/features/chat/state/chat-pending-conversation";

describe("chat-pending-conversation core API", () => {
  it("only exposes the pending overlay builder", () => {
    expect(Object.keys(chatPendingConversation).sort()).toEqual([
      "buildPendingConversationOverlayMessages",
    ]);
  });
});
