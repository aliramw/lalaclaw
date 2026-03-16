import { beforeEach, describe, expect, it } from "vitest";
import {
  chatScrollStorageKey,
  collapseDuplicateConversationTurns,
  createResetSessionUser,
  derivePendingEntryFromLocalMessages,
  hasAuthoritativePendingAssistantReply,
  loadPendingChatTurns,
  loadStoredChatScrollTops,
  loadStoredState,
  mergeConversationIdentity,
  mergePendingConversation,
  mergeStaleLocalConversationTail,
  pendingChatStorageKey,
  persistUiStateSnapshot,
  pruneCompletedPendingChatTurns,
  persistChatScrollTops,
  sanitizeMessagesForStorage,
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

  it("does not duplicate the final assistant when startedAt is slightly later than the current user timestamp", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "hi", timestamp: 100 },
          { role: "assistant", content: "hi.", timestamp: 110, tokenBadge: "↑1 ↓1" },
        ],
        {
          startedAt: 120,
          pendingTimestamp: 130,
          userMessage: { role: "user", content: "hi", timestamp: 100 },
        },
        "正在思考…",
        [
          { role: "user", content: "hi", timestamp: 100 },
          { role: "assistant", content: "hi.", timestamp: 130, tokenBadge: "↑1 ↓1" },
        ],
      ),
    ).toEqual([
      { role: "user", content: "hi", timestamp: 100 },
      { role: "assistant", content: "hi.", timestamp: 110, tokenBadge: "↑1 ↓1" },
    ]);
  });

  it("does not append an equivalent local assistant when the snapshot already contains the same reply", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "你好", timestamp: 200 },
          { role: "assistant", content: "hi.", timestamp: 205, tokenBadge: "↑5.3k ↓45 R19.6k" },
        ],
        {
          startedAt: 210,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "你好", timestamp: 200 },
        },
        "正在思考…",
        [
          { role: "user", content: "你好", timestamp: 200 },
          { role: "assistant", content: "hi.", timestamp: 220, tokenBadge: "↑5.3k ↓45 R19.6k" },
        ],
      ),
    ).toEqual([
      { role: "user", content: "你好", timestamp: 200 },
      { role: "assistant", content: "hi.", timestamp: 205, tokenBadge: "↑5.3k ↓45 R19.6k" },
    ]);
  });

  it("keeps the just-sent user and pending placeholder when the runtime snapshot only has older assistant history", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "新问题", timestamp: 200 },
        },
        "正在思考…",
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
        ],
      ),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
    ]);
  });

  it("can derive a pending entry from the local optimistic turn when runtime sync arrives before pending state catches up", () => {
    expect(
      derivePendingEntryFromLocalMessages([
        { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
        { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
        { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
        { id: "msg-assistant-pending-2", role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
      ]),
    ).toEqual({
      startedAt: 200,
      pendingTimestamp: 220,
      assistantMessageId: "msg-assistant-pending-2",
      suppressPendingPlaceholder: false,
      userMessage: {
        id: "msg-user-2",
        role: "user",
        content: "新问题",
        timestamp: 200,
      },
    });
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
      { role: "assistant", content: "先给你几条新闻", timestamp: 220 },
    ]);
  });

  it("does not add a thinking placeholder for slash-command pending turns", () => {
    expect(
      mergePendingConversation(
        [],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          suppressPendingPlaceholder: true,
          userMessage: { role: "user", content: "/new", timestamp: 200 },
        },
        "正在思考…",
        [{ role: "user", content: "/new", timestamp: 200 }],
      ),
    ).toEqual([{ role: "user", content: "/new", timestamp: 200 }]);
  });

  it("keeps the local tail when the runtime snapshot is only an older prefix of the conversation", () => {
    expect(
      mergeStaleLocalConversationTail(
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
    ]);
  });

  it("does not append local messages when the runtime snapshot has already diverged from the local prefix", () => {
    expect(
      mergeStaleLocalConversationTail(
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "服务端新回复", timestamp: 120 },
        ],
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "服务端新回复", timestamp: 120 },
    ]);
  });

  it("does not append an overlapping duplicate assistant from the stale local tail", () => {
    expect(
      mergeStaleLocalConversationTail(
        [
          { id: "msg-user-1", role: "user", content: "现在给我一个惊喜？", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "行，给你个不费脑但挺值的惊喜：", timestamp: 120, tokenBadge: "↑38.5k ↓621 R2.6k" },
        ],
        [
          { id: "msg-user-1", role: "user", content: "现在给我一个惊喜？", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "行，给你个不费脑但挺值的惊喜：", timestamp: 120, tokenBadge: "↑38.5k ↓621 R2.6k" },
          { id: "msg-assistant-1", role: "assistant", content: "行，给你个不费脑但挺值的惊喜：", timestamp: 120, tokenBadge: "↑38.5k ↓621 R2.6k" },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "现在给我一个惊喜？", timestamp: 100 },
      { id: "msg-assistant-1", role: "assistant", content: "行，给你个不费脑但挺值的惊喜：", timestamp: 120, tokenBadge: "↑38.5k ↓621 R2.6k" },
    ]);
  });

  it("does not append a local assistant tail that only differs by transport wrappers", () => {
    expect(
      mergeStaleLocalConversationTail(
        [
          { role: "assistant", content: "结论：大概 3.68 万行。", timestamp: 120, tokenBadge: "↑281 ↓252 R19.7k" },
        ],
        [
          {
            id: "msg-assistant-local-1",
            role: "assistant",
            content: "[[reply_to_current]] **<small>main - gpt-5.4 - 20k/272k</small>**\n\n结论：大概 3.68 万行。",
            timestamp: 120,
            tokenBadge: "↑281 ↓252 R19.7k",
          },
        ],
      ),
    ).toEqual([
      { role: "assistant", content: "结论：大概 3.68 万行。", timestamp: 120, tokenBadge: "↑281 ↓252 R19.7k" },
    ]);
  });

  it("prunes restored pending turns when local stored messages already contain the final assistant reply", () => {
    expect(
      pruneCompletedPendingChatTurns(
        {
          "command-center-paint-1:paint": {
            startedAt: 200,
            pendingTimestamp: 220,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { role: "user", content: "hi", timestamp: 200 },
          },
        },
        {
          "agent:paint": [
            { role: "user", content: "hi", timestamp: 200 },
            { role: "assistant", content: "嘿！又出现了？", timestamp: 220 },
          ],
        },
        {
          "agent:paint": {
            agentId: "paint",
            sessionUser: "command-center-paint-1",
          },
        },
      ),
    ).toEqual({});
  });

  it("keeps restored pending turns when local stored messages still do not contain an assistant reply", () => {
    expect(
      pruneCompletedPendingChatTurns(
        {
          "command-center-paint-1:paint": {
            startedAt: 200,
            pendingTimestamp: 220,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { role: "user", content: "hi", timestamp: 200 },
          },
        },
        {
          "agent:paint": [
            { role: "user", content: "hi", timestamp: 200 },
          ],
        },
        {
          "agent:paint": {
            agentId: "paint",
            sessionUser: "command-center-paint-1",
          },
        },
      ),
    ).toEqual({
      "command-center-paint-1:paint": {
        startedAt: 200,
        pendingTimestamp: 220,
        assistantMessageId: "msg-assistant-pending-1",
        userMessage: { role: "user", content: "hi", timestamp: 200 },
      },
    });
  });

  it("treats a snapshot assistant without the local assistant id as authoritative once the final reply is present", () => {
    expect(
      hasAuthoritativePendingAssistantReply(
        [
          { role: "user", content: "hi", timestamp: 100 },
          { role: "assistant", content: "hi.", timestamp: 110, tokenBadge: "↑5.3k ↓45 R19.6k" },
        ],
        {
          startedAt: 105,
          pendingTimestamp: 120,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { role: "user", content: "hi", timestamp: 100 },
        },
      ),
    ).toBe(true);
  });

  it("does not treat the restored pending placeholder as the final assistant reply", () => {
    expect(
      hasAuthoritativePendingAssistantReply(
        [
          { role: "user", content: "hi", timestamp: 100 },
          { role: "assistant", content: "正在思考…", timestamp: 120, pending: true },
        ],
        {
          startedAt: 105,
          pendingTimestamp: 120,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { role: "user", content: "hi", timestamp: 100 },
        },
      ),
    ).toBe(false);
  });

  it("keeps settled duplicate turns when there is no pending replay context", () => {
    expect(
      mergePendingConversation(
        [
          { role: "user", content: "详细说说", timestamp: 1_000 },
          { role: "assistant", content: "第二版完整回答", timestamp: 120_000 },
          { role: "user", content: "详细说说", timestamp: 121_000 },
          { role: "assistant", content: "第二版完整回答", timestamp: 121_500 },
        ],
        null,
        "正在思考…",
        [],
      ),
    ).toEqual([
      { role: "user", content: "详细说说", timestamp: 1_000 },
      { role: "assistant", content: "第二版完整回答", timestamp: 120_000 },
      { role: "user", content: "详细说说", timestamp: 121_000 },
      { role: "assistant", content: "第二版完整回答", timestamp: 121_500 },
    ]);
  });
});

describe("collapseDuplicateConversationTurns", () => {
  it("treats wrapped assistant text as the same visible reply when collapsing replayed turns", () => {
    expect(
      collapseDuplicateConversationTurns([
        { role: "user", content: "详细说说", timestamp: 1_000 },
        { role: "assistant", content: "[[reply_to_current]] 第一版开头", timestamp: 120_000 },
        { role: "user", content: "详细说说", timestamp: 121_000 },
        { role: "assistant", content: "**<small>main - gpt-5.4</small>** 第一版开头", timestamp: 121_500 },
      ]),
    ).toEqual([
      { role: "user", content: "详细说说", timestamp: 1_000 },
      { role: "assistant", content: "[[reply_to_current]] 第一版开头", timestamp: 120_000 },
    ]);
  });
});

describe("createResetSessionUser", () => {
  it("uses a distinct prefix so reset sessions are not mistaken for bootstrap agent sessions", () => {
    expect(createResetSessionUser("paint")).toMatch(/^command-center-reset-paint-\d+$/);
  });
});

describe("mergeConversationIdentity", () => {
  it("preserves the local ids and timestamps for equivalent messages from a runtime snapshot", () => {
    expect(
      mergeConversationIdentity(
        [
          { role: "user", content: "hi", timestamp: 2000 },
          { role: "assistant", content: "你好，有什么事？", timestamp: 2100, tokenBadge: "↑17.7k ↓46" },
        ],
        [
          { id: "msg-user-100", role: "user", content: "hi", timestamp: 1000 },
          { id: "msg-assistant-100", role: "assistant", content: "你好，有什么事？", timestamp: 1100, tokenBadge: "↑17.7k ↓46" },
        ],
      ),
    ).toEqual([
      { id: "msg-user-100", role: "user", content: "hi", timestamp: 1000 },
      { id: "msg-assistant-100", role: "assistant", content: "你好，有什么事？", timestamp: 1100, tokenBadge: "↑17.7k ↓46" },
    ]);
  });

  it("does not carry a stale local streaming flag onto a settled runtime snapshot message", () => {
    expect(
      mergeConversationIdentity(
        [
          { role: "user", content: "hi", timestamp: 2000 },
          { role: "assistant", content: "你好，有什么事？", timestamp: 2100, tokenBadge: "↑17.7k ↓46" },
        ],
        [
          { id: "msg-user-100", role: "user", content: "hi", timestamp: 1000 },
          { id: "msg-assistant-100", role: "assistant", content: "你好，有什么事？", timestamp: 1100, tokenBadge: "↑17.7k ↓46", streaming: true },
        ],
      ),
    ).toEqual([
      { id: "msg-user-100", role: "user", content: "hi", timestamp: 1000 },
      { id: "msg-assistant-100", role: "assistant", content: "你好，有什么事？", timestamp: 1100, tokenBadge: "↑17.7k ↓46" },
    ]);
  });

  it("matches a runtime assistant with a local streamed assistant that still contains transport wrappers", () => {
    expect(
      mergeConversationIdentity(
        [
          { role: "assistant", content: "结论：大概 3.68 万行。", timestamp: 2100, tokenBadge: "↑281 ↓252 R19.7k" },
        ],
        [
          {
            id: "msg-assistant-100",
            role: "assistant",
            content: "[[reply_to_current]] **<small>main - gpt-5.4 - 20k/272k</small>**\n\n结论：大概 3.68 万行。",
            timestamp: 1100,
            tokenBadge: "↑281 ↓252 R19.7k",
          },
        ],
      ),
    ).toEqual([
      { id: "msg-assistant-100", role: "assistant", content: "结论：大概 3.68 万行。", timestamp: 1100, tokenBadge: "↑281 ↓252 R19.7k" },
    ]);
  });
});

describe("sanitizeMessagesForStorage", () => {
  it("drops transient streaming flags when persisting messages", () => {
    expect(
      sanitizeMessagesForStorage([
        { role: "user", content: "hi", timestamp: 1000 },
        { id: "msg-assistant-100", role: "assistant", content: "你好，有什么事？", timestamp: 1100, tokenBadge: "↑17.7k ↓46", streaming: true },
      ]),
    ).toEqual([
      { role: "user", content: "hi", timestamp: 1000 },
      { id: "msg-assistant-100", role: "assistant", content: "你好，有什么事？", timestamp: 1100, tokenBadge: "↑17.7k ↓46" },
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

  it("preserves stored message ids so restored scroll anchors can stay stable across refreshes", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        messagesByTabId: {
          "agent:main": [
            { id: "msg-user-1", role: "user", content: "hi", timestamp: 1 },
            { id: "msg-assistant-1", role: "assistant", content: "hello", timestamp: 2 },
          ],
        },
        sessionUser: "command-center",
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "openai-codex/gpt-5.4",
            sessionUser: "command-center",
            thinkMode: "off",
          },
        },
      }),
    );

    expect(loadStoredState()?.messagesByTabId?.["agent:main"]).toEqual([
      { id: "msg-user-1", role: "user", content: "hi", timestamp: 1 },
      { id: "msg-assistant-1", role: "assistant", content: "hello", timestamp: 2 },
    ]);
  });

  it("stores pending turns separately so a fast refresh can restore the running turn", () => {
    persistUiStateSnapshot({
      activeChatTabId: "agent:main",
      activeTab: "timeline",
      agentId: "main",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      sessionUser: "command-center",
      tabMetaById: {
        "agent:main": {
          agentId: "main",
          fastMode: false,
          model: "gpt-5.4",
          sessionUser: "command-center",
          thinkMode: "off",
        },
      },
      messages: [
        { id: "msg-user-persist-1", role: "user", content: "hi", timestamp: 100 },
        { id: "msg-assistant-pending-100", role: "assistant", content: "正在思考…", timestamp: 120, pending: true },
      ],
      messagesByTabId: {
        "agent:main": [
          { id: "msg-user-persist-1", role: "user", content: "hi", timestamp: 100 },
          { id: "msg-assistant-pending-100", role: "assistant", content: "正在思考…", timestamp: 120, pending: true },
        ],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 120,
          assistantMessageId: "msg-assistant-pending-100",
          userMessage: {
            id: "msg-user-persist-1",
            role: "user",
            content: "hi",
            timestamp: 100,
          },
        },
      },
    });

    expect(loadStoredState()?.messagesByTabId?.["agent:main"]).toEqual([
      { id: "msg-user-persist-1", role: "user", content: "hi", timestamp: 100 },
    ]);
    expect(window.localStorage.getItem(pendingChatStorageKey)).toContain("\"command-center:main\"");
    expect(loadPendingChatTurns()).toEqual({
      "command-center:main": {
        key: "command-center:main",
        startedAt: 100,
        pendingTimestamp: 120,
        assistantMessageId: "msg-assistant-pending-100",
        userMessage: {
          id: "msg-user-persist-1",
          role: "user",
          content: "hi",
          timestamp: 100,
        },
      },
    });
  });

  it("does not let an older persisted snapshot overwrite a newer one", () => {
    persistUiStateSnapshot({
      persistedAt: 200,
      activeChatTabId: "agent:main",
      activeTab: "timeline",
      agentId: "main",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      sessionUser: "command-center",
      tabMetaById: {
        "agent:main": {
          agentId: "main",
          fastMode: false,
          model: "gpt-5.4",
          sessionUser: "command-center",
          thinkMode: "off",
        },
      },
      messagesByTabId: {
        "agent:main": [{ role: "user", content: "新消息", timestamp: 200 }],
      },
      messages: [{ role: "user", content: "新消息", timestamp: 200 }],
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "新消息", timestamp: 200 },
        },
      },
    });

    persistUiStateSnapshot({
      persistedAt: 100,
      activeChatTabId: "agent:main",
      activeTab: "timeline",
      agentId: "main",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      sessionUser: "command-center",
      tabMetaById: {
        "agent:main": {
          agentId: "main",
          fastMode: false,
          model: "gpt-5.4",
          sessionUser: "command-center",
          thinkMode: "off",
        },
      },
      messagesByTabId: {
        "agent:main": [{ role: "assistant", content: "旧消息", timestamp: 100 }],
      },
      messages: [{ role: "assistant", content: "旧消息", timestamp: 100 }],
      pendingChatTurns: {},
    });

    expect(loadStoredState()?.messagesByTabId?.["agent:main"]).toEqual([
      { role: "user", content: "新消息", timestamp: 200 },
    ]);
    expect(loadPendingChatTurns()).toEqual({
      "command-center:main": {
        key: "command-center:main",
        startedAt: 200,
        pendingTimestamp: 220,
        userMessage: { role: "user", content: "新消息", timestamp: 200 },
      },
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

  it("loads the global chat font size from the current storage shape", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatFontSize: "large",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      }),
    );

    expect(loadStoredState()?.chatFontSize).toBe("large");
  });

  it("falls back to the legacy per-session chat font size map when loading older storage", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatFontSizeBySessionUser: {
          "command-center": "medium",
        },
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      }),
    );

    expect(loadStoredState()?.chatFontSize).toBe("medium");
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

  it("drops stale streaming flags from stored messages when rehydrating chat history", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:paint",
        chatTabs: [{ id: "agent:paint", agentId: "paint", sessionUser: "command-center-paint-1" }],
        messagesByTabId: {
          "agent:paint": [
            { role: "user", content: "hi", timestamp: 100 },
            { id: "msg-assistant-100", role: "assistant", content: "你好", timestamp: 110, streaming: true },
          ],
        },
        tabMetaById: {
          "agent:paint": {
            agentId: "paint",
            fastMode: false,
            model: "gemini-3-flash-preview",
            sessionUser: "command-center-paint-1",
            thinkMode: "off",
          },
        },
      }),
    );

    const stored = loadStoredState();

    expect(stored.messagesByTabId["agent:paint"]).toEqual([
      { role: "user", content: "hi", timestamp: 100 },
      { id: "msg-assistant-100", role: "assistant", content: "你好", timestamp: 110 },
    ]);
  });
});
