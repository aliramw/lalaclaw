import { describe, expect, it } from "vitest";
import { cleanWrappedUserMessage } from "@/features/app/state/app-prompt-storage";

describe("cleanWrappedUserMessage", () => {
  it("strips aborted-run system notes before inbound metadata and visible user text", () => {
    const wrappedMessage = [
      "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
      "",
      "Conversation info (untrusted metadata):",
      "```json",
      "{",
      '  "message_id": "openclaw-weixin:1775026722628-fa64a87f",',
      '  "timestamp": "Wed 2026-04-01 14:58 GMT+8"',
      "}",
      "```",
      "",
      "好了吗",
    ].join("\n");

    expect(cleanWrappedUserMessage(wrappedMessage)).toBe("好了吗");
  });
});
