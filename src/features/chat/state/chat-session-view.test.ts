import { describe, expect, it } from "vitest";
import { buildHydratedPendingConversationMessages, buildSettledConversationMessages, buildSettledPendingConversationMessages, buildStabilizedHydratedConversationMessages } from "@/features/chat/state/chat-session-view";

describe("buildSettledConversationMessages", () => {
  it("drops pending and streaming assistant messages from the settled transcript", () => {
    expect(
      buildSettledConversationMessages([
        { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 2, pending: true },
        { id: "msg-assistant-stream-1", role: "assistant", content: "第一段", timestamp: 3, streaming: true },
        { id: "msg-assistant-final-1", role: "assistant", content: "最终答案", timestamp: 4 },
      ]),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
      { id: "msg-assistant-final-1", role: "assistant", content: "最终答案", timestamp: 4 },
    ]);
  });

  it("treats the tracked optimistic user turn as overlay state instead of settled history", () => {
    expect(
      buildSettledConversationMessages(
        [
          { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 11, pending: true },
        ],
        {
          key: "command-center:main",
          pendingTimestamp: 11,
          userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
        },
      ),
    ).toEqual([]);
  });

  it("treats a settled user message with a later runtime timestamp as the same pending overlay turn", () => {
    expect(
      buildSettledConversationMessages(
        [
          {
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 101,
            attachments: [{ id: "attachment-1", storageKey: "attachment-1", name: "portrait.png" }],
          },
        ],
        {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 100,
          userMessage: {
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 100,
            attachments: [{ id: "attachment-1", storageKey: "attachment-1", name: "portrait.png" }],
          },
        },
      ),
    ).toEqual([]);
  });

  it("treats a settled user message with a different runtime id as the same pending overlay turn", () => {
    expect(
      buildSettledConversationMessages(
        [
          {
            id: "runtime-msg-user-1",
            role: "user",
            content: "很高兴认识你",
            timestamp: 101,
          },
        ],
        {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 100,
          userMessage: {
            id: "local-msg-user-1",
            role: "user",
            content: "很高兴认识你",
            timestamp: 100,
          },
        },
      ),
    ).toEqual([]);
  });

  it("treats a settled image user message with a different runtime id as the same pending overlay turn", () => {
    expect(
      buildSettledConversationMessages(
        [
          {
            id: "runtime-msg-user-image-1",
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 101,
            attachments: [{ id: "attachment-1", storageKey: "attachment-1", name: "portrait.png" }],
          },
        ],
        {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 100,
          userMessage: {
            id: "local-msg-user-image-1",
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 100,
            attachments: [{ id: "attachment-1", storageKey: "attachment-1", name: "portrait.png" }],
          },
        },
      ),
    ).toEqual([]);
  });

  it("can build a settled transcript directly from pending merge inputs", () => {
    expect(
      buildSettledPendingConversationMessages({
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
    ).toEqual([]);
  });

  it("can build a hydrated conversation directly from pending merge inputs", () => {
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

  it("can build a stabilized hydrated conversation directly from runtime merge inputs", () => {
    expect(
      buildStabilizedHydratedConversationMessages({
        messages: [
          { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
        ],
        pendingEntry: {
          key: "command-center:main",
          assistantMessageId: "msg-assistant-pending-1",
          pendingTimestamp: 11,
          userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
        },
        localMessages: [
          { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 11, streaming: true },
        ],
        pendingLabel: "正在思考…",
      }).stabilizedConversation,
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "刷新后继续", timestamp: 10 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 11, streaming: true },
    ]);
  });

  it("can build a stabilized hydrated conversation directly from no-pending local-tail inputs", () => {
    expect(
      buildStabilizedHydratedConversationMessages({
        messages: [
          { role: "user", content: "旧问题", timestamp: 1000 },
          { role: "assistant", content: "旧回复", timestamp: 1100 },
        ],
        localMessages: [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
          { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-2", role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
        ],
        localMessagesWithoutPending: [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
          { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-2", role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
        ],
      }).stabilizedConversation,
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
      { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
      { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
      { id: "msg-assistant-2", role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
    ]);
  });
});
