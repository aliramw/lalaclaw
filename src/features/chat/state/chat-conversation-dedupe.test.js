import { describe, expect, it } from "vitest";
import { collapseDuplicateConversationTurns } from "@/features/chat/state/chat-conversation-dedupe";

describe("collapseDuplicateConversationTurns", () => {
  it("drops wrapped user duplicates after an aborted-run note was split into a system message", () => {
    expect(
      collapseDuplicateConversationTurns([
        {
          role: "system",
          content: "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
          timestamp: 1_000,
        },
        {
          role: "user",
          content: "好了吗",
          timestamp: 1_000,
        },
        {
          role: "user",
          content: [
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
          ].join("\n"),
          timestamp: 1_000,
        },
      ]),
    ).toEqual([
      {
        role: "system",
        content: "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
        timestamp: 1_000,
      },
      {
        role: "user",
        content: "好了吗",
        timestamp: 1_000,
      },
    ]);
  });
});
