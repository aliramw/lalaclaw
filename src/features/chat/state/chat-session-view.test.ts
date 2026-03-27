import { describe, expect, it } from "vitest";
import { buildHydratedPendingConversationMessages } from "@/features/chat/state/chat-session-view";

describe("buildHydratedPendingConversationMessages", () => {
  it("keeps the current partial assistant while hydrating a pending turn", () => {
    expect(
      buildHydratedPendingConversationMessages({
        messages: [
          { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
        ],
        pendingEntry: {
          key: "command-center:main",
          assistantMessageId: "msg-assistant-pending-1",
          pendingTimestamp: 11,
          userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
        },
        pendingLabel: "正在思考…",
        localMessages: [
          { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 11, streaming: true },
        ],
      }),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 11, streaming: true },
    ]);
  });

  it("does not fall back to a placeholder when the local stream already has text", () => {
    expect(
      buildHydratedPendingConversationMessages({
        messages: [
          { role: "user", content: "给我 Things", timestamp: 100 },
        ],
        pendingEntry: {
          startedAt: 100,
          pendingTimestamp: 120,
          userMessage: { role: "user", content: "给我 Things", timestamp: 100 },
        },
        pendingLabel: "正在思考…",
        localMessages: [
          { role: "user", content: "给我 Things", timestamp: 100 },
          { role: "assistant", content: "Things\n\n- 第一条", timestamp: 120 },
        ],
      }),
    ).toEqual([
      { role: "user", content: "给我 Things", timestamp: 100 },
      { role: "assistant", content: "Things\n\n- 第一条", timestamp: 120 },
    ]);
  });
});
