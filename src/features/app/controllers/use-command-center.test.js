import { describe, expect, it } from "vitest";
import {
  buildChatTabTitle,
  deriveUnreadTabState,
  getLatestSettledMessageKey,
  getSettledMessageKeys,
  getLatestUserMessageKey,
  hasActiveAssistantReply,
  isChatTabBusy,
  planSearchedSessionTabTarget,
  resolveImRuntimeSessionUser,
  shouldReuseTabState,
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

  it("allows IM bootstrap tabs to resolve to the latest real IM session", () => {
    expect(
      shouldApplyRuntimeSnapshotToTab({
        currentAgentId: "main",
        currentSessionUser: "feishu:direct:default",
        requestedAgentId: "main",
        requestedSessionUser: "feishu:direct:default",
        resolvedSessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
      }),
    ).toBe(true);
  });

  it("rejects a stale IM snapshot that resolves to a different session after reset", () => {
    expect(
      shouldApplyRuntimeSnapshotToTab({
        currentAgentId: "main",
        currentSessionUser: '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058:reset:1773319871765","sendername":"马锐拉"}',
        requestedAgentId: "main",
        requestedSessionUser: '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058:reset:1773319871765","sendername":"马锐拉"}',
        resolvedSessionUser: '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}',
      }),
    ).toBe(false);
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

describe("getLatestSettledMessageKey", () => {
  it("ignores pending assistant placeholders and uses the latest settled message", () => {
    expect(
      getLatestSettledMessageKey([
        { id: "msg-user-1", role: "user", content: "hello", timestamp: 100 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "thinking", timestamp: 110, pending: true },
      ]),
    ).toBe("msg-user-1");
  });
});

describe("getSettledMessageKeys", () => {
  it("collects only settled message identities in order", () => {
    expect(
      getSettledMessageKeys([
        { id: "msg-user-1", role: "user", content: "hello", timestamp: 100 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "thinking", timestamp: 110, pending: true },
        { id: "msg-assistant-2", role: "assistant", content: "done", timestamp: 120 },
      ]),
    ).toEqual(["msg-user-1", "msg-assistant-2"]);
  });
});

describe("deriveUnreadTabState", () => {
  it("accumulates unread counts for inactive tabs and clears them once activated", () => {
    const chatTabs = [
      { id: "agent:main", agentId: "main", sessionUser: "command-center" },
      { id: "agent:writer", agentId: "writer", sessionUser: "command-center-writer-1" },
    ];
    const settledMessageKeysByTabId = {
      "agent:main": ["msg-user-1"],
      "agent:writer": ["msg-assistant-1", "msg-assistant-2", "msg-assistant-3"],
    };

    expect(
      deriveUnreadTabState({
        activeChatTabId: "agent:main",
        chatTabs,
        settledMessageKeysByTabId,
        previousSettledMessageKeysByTabId: {
          "agent:main": ["msg-user-1"],
          "agent:writer": ["msg-assistant-1"],
        },
        previousUnreadCountByTabId: { "agent:writer": 1 },
      }),
    ).toEqual({ "agent:writer": 3 });

    expect(
      deriveUnreadTabState({
        activeChatTabId: "agent:writer",
        chatTabs,
        settledMessageKeysByTabId,
        previousSettledMessageKeysByTabId: {
          "agent:main": ["msg-user-1"],
          "agent:writer": ["msg-assistant-1", "msg-assistant-2", "msg-assistant-3"],
        },
        previousUnreadCountByTabId: { "agent:writer": 3 },
      }),
    ).toEqual({});
  });
});

describe("shouldReuseTabState", () => {
  it("reuses identical synced message arrays even when they arrive as new objects", () => {
    expect(
      shouldReuseTabState(
        [
          { role: "user", content: "hello", timestamp: 1 },
          { role: "assistant", content: "world", timestamp: 2 },
        ],
        [
          { role: "user", content: "hello", timestamp: 1 },
          { role: "assistant", content: "world", timestamp: 2 },
        ],
      ),
    ).toBe(true);
  });

  it("does not reuse changed runtime cache payloads", () => {
    expect(
      shouldReuseTabState(
        { files: [{ path: "src/App.jsx" }], agents: [{ id: "main" }] },
        { files: [{ path: "src/App.jsx" }], agents: [{ id: "reviewer" }] },
      ),
    ).toBe(false);
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
        title: "钉钉 main",
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
      title: "钉钉 main",
    });
  });

  it("opens Feishu sessions in a dedicated tab and labels them as agent:feishu", () => {
    expect(
      planSearchedSessionTabTarget({
        activeTabId: "agent:main",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
      }),
    ).toEqual(
      expect.objectContaining({
        create: true,
        title: "飞书 main",
      }),
    );
  });

  it("opens WeCom sessions in a dedicated tab and labels them as agent:wecom", () => {
    expect(
      planSearchedSessionTabTarget({
        activeTabId: "agent:main",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        sessionUser: "agent:main:wecom:direct:marila",
      }),
    ).toEqual(
      expect.objectContaining({
        create: true,
        title: "企微 main",
      }),
    );
  });
});

describe("resolveImRuntimeSessionUser", () => {
  it("keeps generic IM channel tabs polling through their bootstrap anchor", () => {
    const { tabId } = planSearchedSessionTabTarget({
      activeTabId: "agent:main",
      agentId: "main",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      sessionUser: "agent:main:wecom:direct:marila",
    });

    expect(
      resolveImRuntimeSessionUser({
        tabId,
        agentId: "main",
        sessionUser: "agent:main:wecom:direct:marila",
      }),
    ).toBe("agent:main:wecom:direct:marila");
  });

  it("uses the IM bootstrap anchor when the tab id still belongs to the generic IM channel tab", () => {
    const { tabId } = planSearchedSessionTabTarget({
      activeTabId: "agent:main",
      agentId: "main",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      sessionUser: "wecom:direct:default",
    });

    expect(
      resolveImRuntimeSessionUser({
        tabId,
        agentId: "main",
        sessionUser: "agent:main:wecom:group:project-room",
      }),
    ).toBe("wecom:direct:default");
  });
});

describe("buildChatTabTitle", () => {
  it("formats DingTalk tabs with the platform name prefix", () => {
    expect(buildChatTabTitle("expert", '{"channel":"dingtalk-connector","peerid":"398058"}')).toBe("钉钉 expert");
  });

  it("keeps DingTalk reset sessions labeled as DingTalk tabs", () => {
    expect(
      buildChatTabTitle(
        "expert",
        '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058:reset:1773319871765","sendername":"马锐拉"}',
      ),
    ).toBe("钉钉 expert");
  });

  it("formats Feishu tabs with the platform name prefix", () => {
    expect(buildChatTabTitle("expert", "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58")).toBe("飞书 expert");
  });

  it("formats WeCom tabs with the platform name prefix", () => {
    expect(buildChatTabTitle("expert", "agent:main:wecom:direct:marila")).toBe("企微 expert");
  });

  it("formats IM tab titles with English platform names outside Chinese locales", () => {
    expect(buildChatTabTitle("expert", '{"channel":"dingtalk-connector","peerid":"398058"}', { locale: "en-US" })).toBe("Dingtalk expert");
    expect(buildChatTabTitle("expert", "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58", { locale: "en-US" })).toBe("Feishu expert");
    expect(buildChatTabTitle("expert", "agent:main:wecom:direct:marila", { locale: "en-US" })).toBe("WeCom expert");
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

  it("treats the active Feishu tab as busy when runtime status is running", () => {
    expect(
      isChatTabBusy({
        tabId: "agent:main::feishu123",
        sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
        activeChatTabId: "agent:main::feishu123",
        sessionStatus: "运行中",
        busyByTabId: {},
        messagesByTabId: {
          "agent:main::feishu123": [
            { role: "user", content: "测试", timestamp: 1 },
            { role: "assistant", content: "收到。", timestamp: 2 },
          ],
        },
      }),
    ).toBe(true);
  });

  it("treats the active WeCom tab as busy when runtime status is running", () => {
    expect(
      isChatTabBusy({
        tabId: "agent:main::wecom123",
        sessionUser: "agent:main:wecom:direct:marila",
        activeChatTabId: "agent:main::wecom123",
        sessionStatus: "运行中",
        busyByTabId: {},
        messagesByTabId: {
          "agent:main::wecom123": [
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
