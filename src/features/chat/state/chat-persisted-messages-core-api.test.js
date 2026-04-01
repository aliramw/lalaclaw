import { describe, expect, it } from "vitest";
import * as chatPersistedMessages from "@/features/chat/state/chat-persisted-messages";

describe("chat-persisted-messages core API", () => {
  it("only exposes the centralized persisted message sanitizer", () => {
    expect(Object.keys(chatPersistedMessages).sort()).toEqual([
      "sanitizeMessagesForStorage",
    ]);
  });
});
