import { beforeEach, describe, expect, it } from "vitest";
import {
  chatScrollStorageKey,
  loadStoredChatScrollTops,
  loadStoredState,
  mergePendingConversation,
  persistChatScrollTops,
  storageKey,
} from "@/features/app/storage";

describe("mergePendingConversation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps locally streamed assistant text instead of restoring the pending placeholder", () => {
    expect(
      mergePendingConversation(
        [{ role: "user", content: "给我 Things", timestamp: 100 }],
        {
          startedAt: 100,
          pendingTimestamp: 120,
          userMessage: { role: "user", content: "给我 Things", timestamp: 100 },
        },
        "正在思考…",
        [
          { role: "user", content: "给我 Things", timestamp: 100 },
          { role: "assistant", content: "Things\n\n- 第一条", timestamp: 120 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "给我 Things", timestamp: 100 },
      { role: "assistant", content: "Things\n\n- 第一条", timestamp: 120 },
    ]);
  });

  it("keeps the current turn pending when the snapshot only contains an older identical user message and older assistants", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "最后一句", timestamp: 100 },
          { role: "assistant", content: "第一段回复", timestamp: 90 },
          { role: "assistant", content: "第二段回复", timestamp: 95 },
        ],
        {
          startedAt: 100,
          pendingTimestamp: 120,
          userMessage: { role: "user", content: "最后一句", timestamp: 100 },
        },
        "正在思考…",
        [],
      ),
    ).toEqual([
      { role: "user", content: "最后一句", timestamp: 100 },
      { role: "assistant", content: "第一段回复", timestamp: 90 },
      { role: "assistant", content: "第二段回复", timestamp: 95 },
      { role: "assistant", content: "正在思考…", timestamp: 120, pending: true },
    ]);
  });

  it("does not treat an older identical prompt as the current pending user message", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "访问网站，图片不还是667KB", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "访问网站，图片不还是667KB", timestamp: 200 },
        },
        "正在思考…",
        [
          { role: "user", content: "访问网站，图片不还是667KB", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "访问网站，图片不还是667KB", timestamp: 200 },
          { role: "assistant", content: "找到原因了", timestamp: 220 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "访问网站，图片不还是667KB", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "访问网站，图片不还是667KB", timestamp: 200 },
      { role: "assistant", content: "找到原因了", timestamp: 220 },
    ]);
  });

  it("keeps the newer local streaming assistant when the runtime snapshot only has an older partial reply", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "帮我分析", timestamp: 200 },
          { role: "assistant", content: "先看", timestamp: 220 },
        ],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "帮我分析", timestamp: 200 },
        },
        "正在思考…",
        [
          { role: "user", content: "帮我分析", timestamp: 200 },
          { role: "assistant", content: "先看看这个问题的根因", timestamp: 220, tokenBadge: "↑12" },
        ],
      ),
    ).toEqual([
      { role: "user", content: "帮我分析", timestamp: 200 },
      { role: "assistant", content: "先看看这个问题的根因", timestamp: 220, tokenBadge: "↑12" },
    ]);
  });

  it("keeps the runtime snapshot assistant when it is already newer than the local streamed text", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "帮我分析", timestamp: 200 },
          { role: "assistant", content: "先看看这个问题的根因，并给出修复建议", timestamp: 220 },
        ],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "帮我分析", timestamp: 200 },
        },
        "正在思考…",
        [
          { role: "user", content: "帮我分析", timestamp: 200 },
          { role: "assistant", content: "先看看这个问题", timestamp: 220, tokenBadge: "↑12" },
        ],
      ),
    ).toEqual([
      { role: "user", content: "帮我分析", timestamp: 200 },
      { role: "assistant", content: "先看看这个问题的根因，并给出修复建议", timestamp: 220, tokenBadge: "↑12" },
    ]);
  });

  it("inserts the pending user message before a snapshot assistant when the snapshot has not included the user yet", () => {
    expect(
      mergePendingConversation(
        [{ role: "assistant", content: "先给你几条新闻", timestamp: 220 }],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "给我看点新闻", timestamp: 200 },
        },
        "正在思考…",
        [],
      ),
    ).toEqual([
      { role: "user", content: "给我看点新闻", timestamp: 200 },
      { role: "assistant", content: "先给你几条新闻", timestamp: 220 },
    ]);
  });
});

describe("loadStoredState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps metadata for closed agent tabs so they can be reopened with their previous session", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:expert",
        activeTab: "timeline",
        agentId: "expert",
        chatTabs: [{ id: "agent:expert", agentId: "expert", sessionUser: "command-center-expert-1" }],
        messagesByTabId: {
          "agent:main": [{ role: "assistant", content: "main 的旧对话", timestamp: 1 }],
          "agent:expert": [{ role: "assistant", content: "expert 的对话", timestamp: 2 }],
        },
        sessionUser: "command-center-expert-1",
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "openai-codex/gpt-5.4",
            sessionUser: "command-center",
            thinkMode: "off",
          },
          "agent:expert": {
            agentId: "expert",
            fastMode: false,
            model: "openai-codex/gpt-5.4",
            sessionUser: "command-center-expert-1",
            thinkMode: "off",
          },
        },
      }),
    );

    const stored = loadStoredState();

    expect(stored.chatTabs).toEqual([{ id: "agent:expert", agentId: "expert", sessionUser: "command-center-expert-1" }]);
    expect(stored.messagesByTabId["agent:main"]).toEqual([{ role: "assistant", content: "main 的旧对话", timestamp: 1 }]);
    expect(stored.tabMetaById["agent:main"]).toMatchObject({
      agentId: "main",
      sessionUser: "command-center",
    });
  });

  it("falls back to the legacy main session when reopening main without explicit tab metadata", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:expert",
        activeTab: "timeline",
        agentId: "expert",
        chatTabs: [{ id: "agent:expert", agentId: "expert", sessionUser: "command-center-expert-1" }],
        messagesByTabId: {
          "agent:main": [{ role: "assistant", content: "main 的旧对话", timestamp: 1 }],
        },
        sessionUser: "command-center-expert-1",
        tabMetaById: {
          "agent:expert": {
            agentId: "expert",
            fastMode: false,
            model: "",
            sessionUser: "command-center-expert-1",
            thinkMode: "off",
          },
        },
      }),
    );

    const stored = loadStoredState();

    expect(stored.tabMetaById["agent:main"]).toMatchObject({
      agentId: "main",
      sessionUser: "command-center",
    });
  });

  it("repairs corrupted stored tab labels by trusting the tab id", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:expert",
        activeTab: "timeline",
        chatTabs: [
          { id: "agent:expert", agentId: "main", sessionUser: "command-center-expert-1" },
          { id: "agent:main", agentId: "expert", sessionUser: "command-center" },
        ],
        tabMetaById: {
          "agent:expert": {
            agentId: "main",
            fastMode: false,
            model: "",
            sessionUser: "command-center-expert-1",
            thinkMode: "off",
          },
          "agent:main": {
            agentId: "expert",
            fastMode: false,
            model: "",
            sessionUser: "command-center",
            thinkMode: "off",
          },
        },
      }),
    );

    const stored = loadStoredState();

    expect(stored.chatTabs).toEqual([
      { id: "agent:expert", agentId: "expert", sessionUser: "command-center-expert-1" },
      { id: "agent:main", agentId: "main", sessionUser: "command-center" },
    ]);
    expect(stored.tabMetaById["agent:expert"]).toMatchObject({ agentId: "expert" });
    expect(stored.tabMetaById["agent:main"]).toMatchObject({ agentId: "main" });
  });
});

describe("chat scroll persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists sanitized chat scroll positions by conversation", () => {
    persistChatScrollTops({
      "command-center:main": {
        scrollTop: 420.4,
        atBottom: true,
        anchorNodeId: "message-200-3-block-4",
        anchorMessageId: "200-3",
        anchorOffset: 18.8,
      },
      "": 99,
      "command-center:expert": -12,
    });

    expect(JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")).toEqual({
      "command-center:main": {
        scrollTop: 420,
        atBottom: true,
        anchorNodeId: "message-200-3-block-4",
        anchorMessageId: "200-3",
        anchorOffset: 19,
      },
    });
  });

  it("loads only valid stored chat scroll positions", () => {
    window.localStorage.setItem(
      chatScrollStorageKey,
      JSON.stringify({
        "command-center:main": { scrollTop: 380, atBottom: true, anchorNodeId: "message-100-1-block-2", anchorMessageId: "100-1", anchorOffset: "24" },
        "command-center:expert": "512",
        "bad": -5,
      }),
    );

    expect(loadStoredChatScrollTops()).toEqual({
      "command-center:main": { scrollTop: 380, atBottom: true, anchorNodeId: "message-100-1-block-2", anchorMessageId: "100-1", anchorOffset: 24 },
      "command-center:expert": { scrollTop: 512 },
    });
  });
});
