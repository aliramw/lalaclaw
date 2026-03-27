import { describe, expect, it, vi } from "vitest";
import {
  areEquivalentChatScrollState,
  buildChatScrollStateSnapshot,
  buildChatTabTitle,
  deriveUnreadTabState,
  getLatestSettledMessageKey,
  getSettledMessageKeys,
  getLatestUserMessageKey,
  hasActiveAssistantReply,
  isChatTabBusy,
  planSearchedSessionTabTarget,
  resolveTrackedPendingEntry,
  resolveRuntimeTabAgentId,
  resolveViewportAnchorCandidate,
  resolveImRuntimeSessionUser,
  stabilizeDashboardVisibleMessages,
  shouldReuseTabState,
  shouldApplyRuntimeSnapshotToTab,
} from "@/features/app/controllers/use-command-center";
import { buildInitialMessagesByTabId } from "@/features/app/controllers/use-command-center-helpers";

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

describe("buildInitialMessagesByTabId", () => {
  it("ignores legacy top-level messages once structured tab messages are absent from the normalized stored state", () => {
    expect(
      buildInitialMessagesByTabId(
        {
          messages: [{ role: "assistant", content: "legacy", timestamp: 1 }],
        },
        "agent:main",
      ),
    ).toEqual({
      "agent:main": [],
    });
  });
});

describe("resolveTrackedPendingEntry", () => {
  it("derives the active pending turn from local optimistic messages when storage has not caught up yet", () => {
    expect(
      resolveTrackedPendingEntry({
        agentId: "main",
        conversationKey: "command-center:main",
        messages: [
          { id: "msg-user-1", role: "user", content: "把这张图改成黑色背景", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 101, pending: true },
        ],
        sessionStatus: "待命",
        sessionUser: "command-center",
      }),
    ).toEqual({
      startedAt: 100,
      pendingTimestamp: 101,
      assistantMessageId: "msg-assistant-pending-1",
      suppressPendingPlaceholder: false,
      userMessage: {
        id: "msg-user-1",
        role: "user",
        content: "把这张图改成黑色背景",
        timestamp: 100,
      },
    });
  });
});

describe("stabilizeDashboardVisibleMessages", () => {
  it("keeps the latest visible user message mounted when a busy turn briefly collapses to assistant-only", () => {
    expect(
      stabilizeDashboardVisibleMessages({
        previousMessages: [
          { id: "msg-user-1", role: "user", content: "你好", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 101, pending: true },
        ],
        messages: [
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 102 },
        ],
        run: { status: "streaming" },
      }),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "你好", timestamp: 100 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 102 },
    ]);
  });

  it("does not reinsert a previous user message once the run is already idle", () => {
    expect(
      stabilizeDashboardVisibleMessages({
        previousMessages: [
          { id: "msg-user-1", role: "user", content: "你好", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 101, pending: true },
        ],
        messages: [
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 102 },
        ],
        run: { status: "idle" },
      }),
    ).toEqual([
      { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 102 },
    ]);
  });
});

describe("areEquivalentChatScrollState", () => {
  it("treats structurally identical scroll snapshots as equal", () => {
    expect(
      areEquivalentChatScrollState(
        {
          scrollTop: 120,
          atBottom: true,
          anchorNodeId: "msg-1-block-3",
          anchorMessageId: "msg-1",
          anchorOffset: 16,
        },
        {
          scrollTop: 120,
          atBottom: true,
          anchorNodeId: "msg-1-block-3",
          anchorMessageId: "msg-1",
          anchorOffset: 16,
        },
      ),
    ).toBe(true);
  });

  it("detects meaningful scroll snapshot changes without stringifying", () => {
    expect(
      areEquivalentChatScrollState(
        {
          scrollTop: 120,
          atBottom: false,
          anchorNodeId: "msg-1-block-3",
          anchorMessageId: "msg-1",
          anchorOffset: 16,
        },
        {
          scrollTop: 121,
          atBottom: false,
          anchorNodeId: "msg-1-block-3",
          anchorMessageId: "msg-1",
          anchorOffset: 16,
        },
      ),
    ).toBe(false);
  });
});

describe("resolveViewportAnchorCandidate", () => {
  it("uses top-edge point probing before scanning the whole viewport", () => {
    const anchorNode = document.createElement("div");
    anchorNode.setAttribute("data-message-id", "msg-1");
    anchorNode.getBoundingClientRect = () => ({
      top: 24,
      bottom: 64,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 24,
      toJSON: () => ({}),
    });

    const childNode = document.createElement("span");
    childNode.closest = () => anchorNode;

    const viewport = document.createElement("div");
    viewport.contains = (node) => node === childNode || node === anchorNode;
    viewport.querySelectorAll = vi.fn(() => []);

    document.elementsFromPoint = vi.fn(() => [childNode]);

    const candidate = resolveViewportAnchorCandidate(
      viewport,
      "[data-message-id]",
      { top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200 },
    );

    expect(candidate?.node).toBe(anchorNode);
    expect(viewport.querySelectorAll).not.toHaveBeenCalled();
  });

  it("falls back to the first visible node and stops scanning once the viewport has been reached", () => {
    const hiddenNode = document.createElement("div");
    hiddenNode.setAttribute("data-scroll-anchor-id", "hidden");
    hiddenNode.getBoundingClientRect = vi.fn(() => ({
      top: -80,
      bottom: -20,
      left: 0,
      right: 300,
      width: 300,
      height: 60,
      x: 0,
      y: -80,
      toJSON: () => ({}),
    }));

    const visibleNode = document.createElement("div");
    visibleNode.setAttribute("data-scroll-anchor-id", "visible");
    visibleNode.getBoundingClientRect = vi.fn(() => ({
      top: 12,
      bottom: 72,
      left: 0,
      right: 300,
      width: 300,
      height: 60,
      x: 0,
      y: 12,
      toJSON: () => ({}),
    }));

    const lowerNode = document.createElement("div");
    lowerNode.setAttribute("data-scroll-anchor-id", "lower");
    lowerNode.getBoundingClientRect = vi.fn(() => ({
      top: 120,
      bottom: 180,
      left: 0,
      right: 300,
      width: 300,
      height: 60,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    }));

    const viewport = document.createElement("div");
    viewport.querySelectorAll = vi.fn(() => [hiddenNode, visibleNode, lowerNode]);
    document.elementsFromPoint = vi.fn(() => []);

    const candidate = resolveViewportAnchorCandidate(
      viewport,
      "[data-scroll-anchor-id]",
      { top: 0, left: 0, right: 300, bottom: 100, width: 300, height: 100 },
    );

    expect(candidate?.node).toBe(visibleNode);
    expect(hiddenNode.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(visibleNode.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(lowerNode.getBoundingClientRect).not.toHaveBeenCalled();
  });
});

describe("buildChatScrollStateSnapshot", () => {
  it("skips anchor discovery entirely while the viewport is already at the bottom", () => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 300 });
    viewport.querySelectorAll = vi.fn(() => []);
    viewport.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      left: 0,
      right: 300,
      bottom: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    document.elementsFromPoint = vi.fn(() => []);

    expect(buildChatScrollStateSnapshot({ viewport, scrollTop: 900 })).toEqual({
      scrollTop: 900,
      atBottom: true,
    });
    expect(viewport.querySelectorAll).not.toHaveBeenCalled();
    expect(viewport.getBoundingClientRect).not.toHaveBeenCalled();
    expect(document.elementsFromPoint).not.toHaveBeenCalled();
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

  it("opens Weixin sessions in a dedicated tab and labels them as agent:weixin", () => {
    expect(
      planSearchedSessionTabTarget({
        activeTabId: "agent:main",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        sessionUser: "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat",
      }),
    ).toEqual(
      expect.objectContaining({
        create: true,
        title: "微信 main",
      }),
    );
  });
});

describe("resolveRuntimeTabAgentId", () => {
  it("keeps IM tabs bound to their existing agent even when runtime snapshots report another agent", () => {
    expect(
      resolveRuntimeTabAgentId({
        requestedAgentId: "main",
        currentAgentId: "main",
        snapshotAgentId: "paint",
        sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
      }),
    ).toBe("main");
  });

  it("still adopts snapshot agent ids for non-IM sessions", () => {
    expect(
      resolveRuntimeTabAgentId({
        requestedAgentId: "main",
        currentAgentId: "main",
        snapshotAgentId: "paint",
        sessionUser: "command-center",
      }),
    ).toBe("paint");
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

  it("formats Weixin tabs with the platform name prefix", () => {
    expect(buildChatTabTitle("expert", "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat")).toBe("微信 expert");
  });

  it("formats IM tab titles with English platform names outside Chinese locales", () => {
    expect(buildChatTabTitle("expert", '{"channel":"dingtalk-connector","peerid":"398058"}', { locale: "en-US" })).toBe("Dingtalk expert");
    expect(buildChatTabTitle("expert", "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58", { locale: "en-US" })).toBe("Feishu expert");
    expect(buildChatTabTitle("expert", "agent:main:wecom:direct:marila", { locale: "en-US" })).toBe("WeCom expert");
    expect(buildChatTabTitle("expert", "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat", { locale: "en-US" })).toBe("Weixin expert");
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

  it("keeps a tab busy while its pending turn is still tracked even if streaming markers momentarily disappear", () => {
    expect(
      isChatTabBusy({
        tabId: "agent:main",
        sessionUser: "command-center-main",
        activeChatTabId: "agent:main",
        sessionStatus: "待命",
        busyByTabId: {},
        messagesByTabId: {
          "agent:main": [
            { role: "user", content: "测试", timestamp: 1 },
            { role: "assistant", content: "收", timestamp: 2 },
          ],
        },
        pendingChatTurns: {
          "command-center-main:main": {
            key: "command-center-main:main",
            tabId: "agent:main",
            startedAt: 1,
            pendingTimestamp: 2,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { id: "msg-user-1", role: "user", content: "测试", timestamp: 1 },
          },
        },
      }),
    ).toBe(true);
  });

  it("does not keep a tab busy when its tracked pending turn has already been overtaken by a later user turn", () => {
    expect(
      isChatTabBusy({
        tabId: "agent:main",
        sessionUser: "command-center-main",
        activeChatTabId: "agent:main",
        sessionStatus: "待命",
        busyByTabId: {},
        messagesByTabId: {
          "agent:main": [
            { id: "msg-user-1", role: "user", content: "测试", timestamp: 1 },
            { id: "msg-assistant-pending-1", role: "assistant", content: "已完成", timestamp: 2 },
            { id: "msg-user-2", role: "user", content: "下一轮", timestamp: 3 },
            { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 4 },
          ],
        },
        pendingChatTurns: {
          "command-center-main:main": {
            key: "command-center-main:main",
            tabId: "agent:main",
            startedAt: 1,
            pendingTimestamp: 2,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { id: "msg-user-1", role: "user", content: "测试", timestamp: 1 },
          },
        },
      }),
    ).toBe(false);
  });

  it("ignores stale pending flags once no tracked run or runtime busy signal remains", () => {
    expect(
      isChatTabBusy({
        tabId: "agent:main",
        sessionUser: "command-center-main",
        activeChatTabId: "agent:main",
        sessionStatus: "待命",
        busyByTabId: {},
        messagesByTabId: {
          "agent:main": [
            { role: "user", content: "测试", timestamp: 1 },
            { role: "assistant", content: "已经完成", timestamp: 2, pending: true },
          ],
        },
        pendingChatTurns: {},
      }),
    ).toBe(false);
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
