import { describe, expect, it } from "vitest";
import {
  buildChatTabTitle,
  getLatestUserMessageKey,
  hasActiveAssistantReply,
  isChatTabBusy,
  planSearchedSessionTabTarget,
  shouldApplyRuntimeSnapshotToTab,
} from "@/features/app/controllers/use-command-center";

describe("shouldApplyRuntimeSnapshotToTab", () => {
  it("accepts a runtime snapshot that still matches the tab identity", () => {
    expect(
      shouldApplyRuntimeSnapshotToTab({
        currentAgentId: "main",
        currentSessionUser: "command-center-1773638962082",
        requestedAgentId: "main",
        requestedSessionUser: "command-center-1773638962082",
        resolvedSessionUser: "command-center-1773638962082",
      }),
    ).toBe(true);
  });

  it("rejects a late runtime snapshot from a different session user", () => {
    expect(
      shouldApplyRuntimeSnapshotToTab({
        currentAgentId: "main",
        currentSessionUser: "command-center-1773639313324",
        requestedAgentId: "main",
        requestedSessionUser: "command-center",
        resolvedSessionUser: "command-center",
      }),
    ).toBe(false);
  });

  it("allows generated agent bootstrap fallbacks that resolve to the default session user", () => {
    expect(
      shouldApplyRuntimeSnapshotToTab({
        currentAgentId: "paint",
        currentSessionUser: "command-center-paint-1773639313324",
        requestedAgentId: "paint",
        requestedSessionUser: "command-center-paint-1773639313324",
        resolvedSessionUser: "command-center",
      }),
    ).toBe(true);
  });
});

describe("getLatestUserMessageKey", () => {
  it("returns the latest user message identity even when a pending assistant is already appended after it", () => {
    expect(
      getLatestUserMessageKey([
        { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 100 },
        { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
        { id: "msg-assistant-pending-2", role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
      ]),
    ).toBe("msg-user-2");
  });
});

describe("planSearchedSessionTabTarget", () => {
  it("opens DingTalk sessions in a dedicated tab and labels them as agent:dingtalk", () => {
    expect(
      planSearchedSessionTabTarget({
        activeTabId: "agent:main",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
      }),
    ).toEqual(
      expect.objectContaining({
        create: true,
        title: "main：钉钉",
      }),
    );
  });

  it("reuses an existing dedicated DingTalk tab for the same session", () => {
    expect(
      planSearchedSessionTabTarget({
        activeTabId: "agent:main",
        agentId: "main",
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:main::abc123", agentId: "main", sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}' },
        ],
        sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
      }),
    ).toEqual({
      create: false,
      tabId: "agent:main::abc123",
      title: "main：钉钉",
    });
  });
});

describe("buildChatTabTitle", () => {
  it("formats DingTalk tabs with the agent name prefix", () => {
    expect(buildChatTabTitle("expert", '{"channel":"dingtalk-connector","peerid":"398058"}')).toBe("expert：钉钉");
  });
});

describe("isChatTabBusy", () => {
  it("treats the active DingTalk tab as busy when runtime status is running", () => {
    expect(
      isChatTabBusy({
        tabId: "agent:main::abc123",
        sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
        activeChatTabId: "agent:main::abc123",
        sessionStatus: "运行中",
        busyByTabId: {},
        messagesByTabId: {
          "agent:main::abc123": [
            { role: "user", content: "测试", timestamp: 1 },
            { role: "assistant", content: "收到。", timestamp: 2 },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe("hasActiveAssistantReply", () => {
  it("treats pending assistant placeholders as busy tab activity", () => {
    expect(
      hasActiveAssistantReply([
        { role: "user", content: "继续", timestamp: 1 },
        { role: "assistant", content: "正在思考…", timestamp: 2, pending: true },
      ]),
    ).toBe(true);
  });

  it("treats streaming assistant replies as busy tab activity", () => {
    expect(
      hasActiveAssistantReply([
        { role: "assistant", content: "第一段", timestamp: 2, streaming: true },
      ]),
    ).toBe(true);
  });

  it("stays idle for completed assistant replies", () => {
    expect(
      hasActiveAssistantReply([
        { role: "user", content: "你是什么模型？", timestamp: 1 },
        { role: "assistant", content: "我是 gpt-5.4", timestamp: 2 },
      ]),
    ).toBe(false);
  });
});
