import { describe, expect, it } from "vitest";
import {
  buildInitialHydratedMessagesByTabId,
  buildInitialBusyByTabId,
  buildStoredPendingChatTurns,
} from "@/features/app/controllers/use-command-center-hydration";

describe("buildStoredPendingChatTurns", () => {
  it("drops a stored pending turn when local messages have already advanced to a later user turn", () => {
    const chatTabs = [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }];
    const tabMetaById = {
      "agent:main": {
        agentId: "main",
        sessionUser: "command-center",
      },
    };
    const messagesByTabId = {
      "agent:main": [
        { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "已经完成", timestamp: 101 },
        { id: "msg-user-2", role: "user", content: "继续说", timestamp: 102 },
        { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 103 },
      ],
    };
    const storedPendingChatTurns = {
      "command-center:main": {
        key: "command-center:main",
        startedAt: 100,
        pendingTimestamp: 101,
        assistantMessageId: "msg-assistant-pending-1",
        userMessage: {
          id: "msg-user-1",
          role: "user",
          content: "旧问题",
          timestamp: 100,
        },
      },
    };

    const nextStoredPendingChatTurns = buildStoredPendingChatTurns(
      storedPendingChatTurns,
      messagesByTabId,
      tabMetaById,
    );

    expect(nextStoredPendingChatTurns).toEqual({});
    expect(buildInitialBusyByTabId(chatTabs, tabMetaById, nextStoredPendingChatTurns)).toEqual({
      "agent:main": false,
    });
  });
});

describe("buildInitialHydratedMessagesByTabId", () => {
  it("restores only settled transcript messages when there is no tracked pending turn", () => {
    expect(
      buildInitialHydratedMessagesByTabId(
        [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        {
          "agent:main": {
            agentId: "main",
            sessionUser: "command-center",
          },
        },
        {
          "agent:main": [
            { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-1", role: "assistant", content: "第一段", timestamp: 2, streaming: true },
          ],
        },
        {},
      ),
    ).toEqual({
      "agent:main": [
        { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
      ],
    });
  });

  it("restores only the settled transcript for tracked pending turns", () => {
    expect(
      buildInitialHydratedMessagesByTabId(
        [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        {
          "agent:main": {
            agentId: "main",
            sessionUser: "command-center",
          },
        },
        {
          "agent:main": [
            { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-1", role: "assistant", content: "第一段", timestamp: 2, streaming: true },
          ],
        },
        {
          "command-center:main": {
            key: "command-center:main",
            assistantMessageId: "msg-assistant-1",
            pendingTimestamp: 2,
            userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
          },
        },
      ),
    ).toEqual({
      "agent:main": [
        { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
      ],
    });
  });

  it("restores a settled transcript from dashboard session output instead of the visible pending overlay", () => {
    expect(
      buildInitialHydratedMessagesByTabId(
        [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        {
          "agent:main": {
            agentId: "main",
            sessionUser: "command-center",
          },
        },
        {
          "agent:main": [],
        },
        {
          "command-center:main": {
            key: "command-center:main",
            assistantMessageId: "msg-assistant-1",
            pendingTimestamp: 2,
            startedAt: 1,
            userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
          },
        },
        "正在思考...",
      ),
    ).toEqual({
      "agent:main": [
        { id: "msg-user-1", role: "user", content: "继续", timestamp: 1 },
      ],
    });
  });
});
