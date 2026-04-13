import { beforeEach, describe, expect, it } from "vitest";
import {
  loadStoredState,
  persistUiStateSnapshot,
} from "@/features/app/storage/app-ui-state-storage";
import {
  chatScrollStorageKey,
  loadStoredChatScrollTops,
  persistChatScrollTops,
} from "@/features/app/state/app-chat-scroll-storage";
import {
  loadPendingChatTurns,
  pendingChatStorageKey,
  pruneCompletedPendingChatTurns,
} from "@/features/app/state/app-pending-storage";
import {
  loadStoredPromptDrafts,
  loadStoredPromptHistory,
  promptDraftStorageKey,
  promptHistoryStorageKey,
} from "@/features/app/state/app-prompt-storage";
import {
  mergeConversationAttachments,
  mergeConversationIdentity,
} from "@/features/chat/state/chat-conversation-merge";
import {
  buildPendingConversationOverlayMessages,
} from "@/features/chat/state/chat-pending-conversation";
import { buildDashboardSettledMessages } from "@/features/chat/state/chat-dashboard-session";
import { sanitizeMessagesForStorage } from "@/features/chat/state/chat-persisted-messages";
import {
  hasAuthoritativePendingAssistantReply,
  resolveRuntimePendingEntry,
} from "@/features/chat/state/chat-runtime-pending";
import {
  buildHydratedConversationWithLocalTail,
  buildStabilizedHydratedConversationWithLocalState,
} from "@/features/chat/state/chat-settled-conversation";
import { createConversationKey } from "@/features/app/state/app-session-identity";
import { collapseDuplicateConversationTurns } from "@/features/chat/state/chat-conversation-dedupe";
import { shouldReuseSettledLocalConversationTail } from "@/features/chat/state/chat-settled-conversation";

const storageKey = "command-center-ui-state-v3";

describe("buildPendingConversationOverlayMessages", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps locally streamed assistant text instead of restoring the pending placeholder", () => {
    expect(
      buildPendingConversationOverlayMessages(
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

  it("can build pending overlay messages through the explicit build helper", () => {
    expect(
      buildPendingConversationOverlayMessages(
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
      buildPendingConversationOverlayMessages(
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
      buildPendingConversationOverlayMessages(
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
      buildPendingConversationOverlayMessages(
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
          { role: "assistant", content: "先看看这个问题的根因", timestamp: 220, tokenBadge: "↑12", streaming: true },
        ],
      ),
    ).toEqual([
      { role: "user", content: "帮我分析", timestamp: 200 },
      { role: "assistant", content: "先看看这个问题的根因", timestamp: 220, tokenBadge: "↑12", streaming: true },
    ]);
  });

  it("keeps the runtime snapshot assistant when it is already newer than the local streamed text", () => {
    expect(
      buildPendingConversationOverlayMessages(
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

  it("does not let a local streaming assistant overwrite authoritative history after a later user turn has already appeared", () => {
    expect(
      buildPendingConversationOverlayMessages(
        [
          { role: "user", content: "帮我分析", timestamp: 200 },
          { role: "assistant", content: "先看", timestamp: 220 },
          { role: "user", content: "继续说", timestamp: 240 },
          { role: "assistant", content: "后面的权威消息", timestamp: 260 },
        ],
        {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "帮我分析", timestamp: 200 },
        },
        "正在思考…",
        [
          { role: "user", content: "帮我分析", timestamp: 200 },
          { role: "assistant", content: "先看看这个问题的根因", timestamp: 220, tokenBadge: "↑12", streaming: true },
        ],
      ),
    ).toEqual([
      { role: "user", content: "帮我分析", timestamp: 200 },
      { role: "assistant", content: "先看", timestamp: 220 },
      { role: "user", content: "继续说", timestamp: 240 },
      { role: "assistant", content: "后面的权威消息", timestamp: 260 },
    ]);
  });

  it("does not duplicate the final assistant when startedAt is slightly later than the current user timestamp", () => {
    expect(
      buildPendingConversationOverlayMessages(
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
      buildPendingConversationOverlayMessages(
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
      buildPendingConversationOverlayMessages(
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
      resolveRuntimePendingEntry({
        conversationKey: "command-center:main",
        localMessages: [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
          { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-pending-2", role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
        ],
        pendingChatTurns: {},
      }),
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

  it("synthesizes a pending IM turn when runtime sync ends on a new user message", () => {
    expect(
      resolveRuntimePendingEntry({
        agentId: "main",
        conversationKey: "agent:main:openclaw-weixin:direct:marila:main",
        conversationMessages: [
          { role: "assistant", content: "上一条回复", timestamp: 100 },
          { id: "msg-user-2", role: "user", content: "菠菜", timestamp: 200 },
        ],
        sessionStatus: "运行中",
        sessionUser: "agent:main:openclaw-weixin:direct:marila",
      }),
    ).toEqual({
      key: "agent:main:openclaw-weixin:direct:marila:main",
      agentId: "main",
      sessionUser: "agent:main:openclaw-weixin:direct:marila",
      startedAt: 200,
      pendingTimestamp: 200,
      userMessage: {
        id: "msg-user-2",
        role: "user",
        content: "菠菜",
        timestamp: 200,
      },
    });
  });

  it("does not synthesize an IM pending turn once an assistant reply is already the latest message", () => {
    expect(
      resolveRuntimePendingEntry({
        agentId: "main",
        conversationKey: "agent:main:openclaw-weixin:direct:marila:main",
        conversationMessages: [
          { role: "assistant", content: "上一条回复", timestamp: 100 },
          { role: "user", content: "菠菜", timestamp: 200 },
          { role: "assistant", content: "在。你说。", timestamp: 220 },
        ],
        sessionStatus: "运行中",
        sessionUser: "agent:main:openclaw-weixin:direct:marila",
      }),
    ).toBeNull();
  });

  it("does not keep a tracked pending turn once the conversation has already advanced to a later user turn", () => {
    expect(
      resolveRuntimePendingEntry({
        agentId: "main",
        conversationKey: "command-center:main",
        conversationMessages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "总结好了", timestamp: 120 },
          { role: "user", content: "继续说", timestamp: 140 },
          { role: "assistant", content: "后续回复", timestamp: 160 },
        ],
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 100,
            pendingTimestamp: 120,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: {
              role: "user",
              content: "旧问题",
              timestamp: 100,
            },
          },
        },
        sessionStatus: "空闲",
        sessionUser: "command-center",
      }),
    ).toBeNull();
  });

  it("inserts the pending user message before a snapshot assistant when the snapshot has not included the user yet", () => {
    expect(
      buildPendingConversationOverlayMessages(
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

  it("does not add a thinking placeholder for slash-command pending turns", () => {
    expect(
      buildPendingConversationOverlayMessages(
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

  it("can merge only the pending user into the transcript without adding a live assistant placeholder", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [{ role: "assistant", content: "先给你几条新闻", timestamp: 220 }],
        pendingEntry: {
          startedAt: 200,
          pendingTimestamp: 220,
          userMessage: { role: "user", content: "给我看点新闻", timestamp: 200 },
        },
      }),
    ).toEqual([
      { role: "user", content: "给我看点新闻", timestamp: 200 },
      { role: "assistant", content: "先给你几条新闻", timestamp: 220 },
    ]);
  });

  it("keeps an existing pending user match without appending a synthetic assistant bubble", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [{ role: "user", content: "旧消息", timestamp: 100 }],
        pendingEntry: {
          startedAt: 50,
          pendingTimestamp: 60,
          userMessage: { role: "user", content: "旧消息", timestamp: 55 },
        },
      }),
    ).toEqual([
      { role: "user", content: "旧消息", timestamp: 100 },
    ]);
  });

  it("can strip the current pending assistant match from the transcript while keeping the pending user", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
        ],
        pendingEntry: {
          startedAt: 1000,
          pendingTimestamp: 1050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
        },
        localHasLivePendingAssistant: true,
        localHasExplicitLivePendingAssistant: true,
      }),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
    ]);
  });

  it("keeps the local stopped assistant when the pending turn has already been stopped", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "这是完整回复", timestamp: 220 },
        ],
        pendingEntry: {
          startedAt: 200,
          pendingTimestamp: 220,
          assistantMessageId: "msg-assistant-pending-1",
          stopped: true,
          stoppedAt: 250,
          suppressPendingPlaceholder: true,
          userMessage: { role: "user", content: "帮我总结", timestamp: 200 },
        },
        localMessages: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "已停止", timestamp: 220 },
        ],
      }),
    ).toEqual([
      { role: "user", content: "帮我总结", timestamp: 200 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "已停止", timestamp: 220 },
    ]);
  });

  it("does not append a local stopped assistant once the authoritative snapshot has already moved to a later user turn", () => {
    const messages = buildDashboardSettledMessages({
        messages: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { role: "assistant", content: "这是完整回复", timestamp: 220 },
          { role: "user", content: "继续说", timestamp: 240 },
          { role: "assistant", content: "后面的权威消息", timestamp: 260 },
        ],
        pendingEntry: {
          startedAt: 200,
          pendingTimestamp: 220,
          assistantMessageId: "msg-assistant-pending-1",
          stopped: true,
          stoppedAt: 250,
          suppressPendingPlaceholder: true,
          userMessage: { role: "user", content: "帮我总结", timestamp: 200 },
        },
        localMessages: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "已停止", timestamp: 220 },
        ],
      });

    expect(messages).toHaveLength(4);
    expect(messages[0]).toMatchObject({ role: "user", content: "帮我总结", timestamp: 200 });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "这是完整回复", timestamp: 220 });
    expect(messages[2]).toMatchObject({ role: "user", content: "继续说", timestamp: 240 });
    expect(messages[3]).toMatchObject({ role: "assistant", content: "后面的权威消息", timestamp: 260 });
  });

  it("keeps the settled local assistant reply when the snapshot still lags behind", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
        ],
        pendingEntry: {
          key: "command-center:main",
          startedAt: 200,
          pendingTimestamp: 220,
          assistantMessageId: "msg-assistant-final-1",
          userMessage: { role: "user", content: "新问题", timestamp: 200 },
        },
        localMessages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
        ],
        localSettledPendingAssistantCandidate: { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
        snapshotHasAssistantReply: false,
      }),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
    ]);
  });

  it("does not append a settled local assistant once the authoritative snapshot has already moved to a later user turn", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { role: "assistant", content: "第一条已完成", timestamp: 220 },
          { role: "user", content: "继续说", timestamp: 240 },
          { role: "assistant", content: "后面的权威消息", timestamp: 260 },
        ],
        pendingEntry: {
          key: "command-center:main",
          startedAt: 200,
          pendingTimestamp: 220,
          assistantMessageId: "msg-assistant-final-1",
          userMessage: { role: "user", content: "新问题", timestamp: 200 },
        },
        localMessages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
        ],
        localSettledPendingAssistantCandidate: { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
        snapshotHasAssistantReply: false,
      }),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { role: "assistant", content: "第一条已完成", timestamp: 220 },
      { role: "user", content: "继续说", timestamp: 240 },
      { role: "assistant", content: "后面的权威消息", timestamp: 260 },
    ]);
  });

  it("can build a durable transcript directly from pending merge inputs", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
        ],
        pendingEntry: {
          startedAt: 1000,
          pendingTimestamp: 1050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
        },
        localMessages: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050, streaming: true },
        ],
        localHasLivePendingAssistant: true,
        localHasExplicitLivePendingAssistant: true,
        snapshotHasAssistantReply: false,
      }),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
    ]); 
  });

  it("can build a durable transcript directly from no-pending merge inputs", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        localMessages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { role: "assistant", content: "新回复", timestamp: 220 },
        ],
      }),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { role: "assistant", content: "新回复", timestamp: 220 },
    ]);
  });

  it("keeps the local tail when the runtime snapshot is only an older prefix of the conversation", () => {
    expect(
      buildHydratedConversationWithLocalTail(
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

  it("does not append a local tail when the first appended message predates the snapshot tail", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 110 },
          { role: "assistant", content: "顺序已经不对了", timestamp: 130 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
    ]);
  });

  it("does not append a local tail when the appended tail timestamps go backwards", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { role: "assistant", content: "顺序乱了", timestamp: 180 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
    ]);
  });

  it("keeps locally rendered messages when the runtime snapshot is temporarily empty", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [],
        [
          { id: "msg-user-1", role: "user", content: "hi", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "请求失败。\nspawn openclaw ENOENT", timestamp: 120 },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "hi", timestamp: 100 },
      { id: "msg-assistant-1", role: "assistant", content: "请求失败。\nspawn openclaw ENOENT", timestamp: 120 },
    ]);
  });

  it("does not append local messages when the runtime snapshot has already diverged from the local prefix", () => {
    expect(
      buildHydratedConversationWithLocalTail(
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
      buildHydratedConversationWithLocalTail(
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

  it("does not append an overlapping duplicate user from the stale local tail", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 100 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 100 },
          { id: "msg-user-1-dup", role: "user", content: "继续", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 120 },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 100 },
      { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 120 },
    ]);
  });

  it("does not treat a much later repeated visible turn as overlap when ids differ", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "user", content: "继续", timestamp: 100 },
          { role: "assistant", content: "收到。", timestamp: 120 },
        ],
        [
          { role: "user", content: "继续", timestamp: 100 },
          { role: "assistant", content: "收到。", timestamp: 120 },
          { role: "user", content: "继续", timestamp: 900_000 },
          { role: "assistant", content: "收到。", timestamp: 900_020 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "继续", timestamp: 100 },
      { role: "assistant", content: "收到。", timestamp: 120 },
      { role: "user", content: "继续", timestamp: 900_000 },
      { role: "assistant", content: "收到。", timestamp: 900_020 },
    ]);
  });

  it("does not treat a later repeated user turn as overlap once it falls outside the short turn window", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "user", content: "继续", timestamp: 100 },
          { role: "assistant", content: "收到。", timestamp: 120 },
        ],
        [
          { role: "user", content: "继续", timestamp: 100 },
          { role: "assistant", content: "收到。", timestamp: 120 },
          { role: "user", content: "继续", timestamp: 300_000 },
          { role: "assistant", content: "收到。", timestamp: 300_020 },
        ],
      ),
    ).toEqual([
      { role: "user", content: "继续", timestamp: 100 },
      { role: "assistant", content: "收到。", timestamp: 120 },
      { role: "user", content: "继续", timestamp: 300_000 },
      { role: "assistant", content: "收到。", timestamp: 300_020 },
    ]);
  });

  it("does not append a local assistant tail that only differs by transport wrappers", () => {
    expect(
      buildHydratedConversationWithLocalTail(
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

  it("merges a settled local tail into transcript when there is no tracked pending turn", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
        localMessages: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
          { role: "user", content: "新问题", timestamp: 200 },
          { role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
        ],
      }),
    ).toEqual([
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
    ]);
  });

  it("keeps the longer settled local assistant reply when a lagging snapshot replays a shorter prefix of the same card", () => {
    const messages = buildDashboardSettledMessages({
      messages: [
        { role: "user", content: "发0.5.4", timestamp: 100 },
        { role: "assistant", content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。", timestamp: 120 },
      ],
      localMessages: [
        { id: "msg-user-1", role: "user", content: "发0.5.4", timestamp: 100 },
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
          timestamp: 120,
        },
      ],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "发0.5.4",
      timestamp: 100,
    });
    expect(messages[1]).toMatchObject({
      id: "msg-assistant-1",
      role: "assistant",
      content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
      timestamp: 120,
    });
  });

  it("can build hydrated view messages directly from local-tail merge inputs", () => {
    expect(
      buildHydratedConversationWithLocalTail(
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

  it("merges a settled local tail into view when a lagging snapshot is missing the latest turn", () => {
    expect(
      buildHydratedConversationWithLocalTail(
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

  it("stabilizes a hydrated conversation with local ids after restoring the settled local tail", () => {
    expect(
      buildStabilizedHydratedConversationWithLocalState(
        [
          { role: "user", content: "旧问题", timestamp: 1000 },
          { role: "assistant", content: "旧回复", timestamp: 1100 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
          { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-2", role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
      { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
      { id: "msg-user-2", role: "user", content: "新问题", timestamp: 200 },
      { id: "msg-assistant-2", role: "assistant", content: "已经出来的部分回复", timestamp: 220 },
    ]);
  });

  it("does not re-append a stale local streaming assistant after the runtime snapshot has already settled", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { id: "msg-user-1", role: "user", content: "给我结论", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "最终结论", timestamp: 120, tokenBadge: "↑12" },
        ],
        [
          { id: "msg-user-1", role: "user", content: "给我结论", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "最终结论", timestamp: 120, tokenBadge: "↑12", streaming: true },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "给我结论", timestamp: 100 },
      { id: "msg-assistant-1", role: "assistant", content: "最终结论", timestamp: 120, tokenBadge: "↑12" },
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

  it("keeps restored pending turns when stored messages already contain the in-flight assistant with the same pending id", () => {
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
            { id: "msg-assistant-pending-1", role: "assistant", content: "先看一眼", timestamp: 220 },
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

  it("prunes restored pending turns once stored messages have already advanced to a later user turn", () => {
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
            { id: "msg-assistant-pending-1", role: "assistant", content: "先看一眼", timestamp: 220 },
            { role: "user", content: "继续", timestamp: 240 },
            { role: "assistant", content: "后续回复", timestamp: 260 },
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

  it("does not treat a streaming assistant as the final reply while the turn is still in progress", () => {
    expect(
      hasAuthoritativePendingAssistantReply(
        [
          { role: "user", content: "hi", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到", timestamp: 120, streaming: true },
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

  it("does not treat multiple assistant candidates in the same pending window as the authoritative final reply", () => {
    expect(
      hasAuthoritativePendingAssistantReply(
        [
          { role: "user", content: "hi", timestamp: 100 },
          { role: "assistant", content: "第一段", timestamp: 110 },
          { role: "assistant", content: "第二段", timestamp: 115 },
        ],
        {
          startedAt: 100,
          pendingTimestamp: 110,
          userMessage: { role: "user", content: "hi", timestamp: 100 },
        },
      ),
    ).toBe(false);
  });

  it("does not treat an earlier assistant as the current authoritative final reply once the snapshot has advanced to a later user turn", () => {
    expect(
      hasAuthoritativePendingAssistantReply(
        [
          { role: "user", content: "hi", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 110 },
          { role: "user", content: "继续", timestamp: 140 },
          { role: "assistant", content: "后续回复", timestamp: 160 },
        ],
        {
          startedAt: 100,
          pendingTimestamp: 110,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { role: "user", content: "hi", timestamp: 100 },
        },
      ),
    ).toBe(false);
  });

  it("keeps settled duplicate turns when there is no pending replay context", () => {
    expect(
      buildPendingConversationOverlayMessages(
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

  it("preserves the local pending user when the runtime snapshot briefly contains only the final assistant reply", () => {
    expect(
      buildPendingConversationOverlayMessages(
        [
          { role: "assistant", content: "收到。", timestamp: 1_100 },
        ],
        {
          startedAt: 1_000,
          pendingTimestamp: 1_050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: {
            id: "msg-user-1",
            role: "user",
            content: "1",
            timestamp: 1_000,
          },
        },
        "正在思考…",
        [
          { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1_050, pending: true },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
      { role: "assistant", content: "收到。", timestamp: 1_100 },
    ]);
  });

  it("does not restore the pending user once the authoritative snapshot has already advanced past that assistant reply", () => {
    expect(
      buildPendingConversationOverlayMessages(
        [
          { role: "assistant", content: "收到。", timestamp: 1_100 },
          { role: "assistant", content: "后面的新消息", timestamp: 1_300 },
        ],
        {
          startedAt: 1_000,
          pendingTimestamp: 1_050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: {
            id: "msg-user-1",
            role: "user",
            content: "1",
            timestamp: 1_000,
          },
        },
        "正在思考…",
        [
          { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1_050, pending: true },
        ],
      ),
    ).toEqual([
      { role: "assistant", content: "收到。", timestamp: 1_100 },
      { role: "assistant", content: "后面的新消息", timestamp: 1_300 },
    ]);
  });

  it("restores the trailing local user turn when a lagging snapshot only contains the matching assistant reply", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "assistant", content: "收到。", timestamp: 1_100 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
          { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 1_050 },
        ],
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
      { role: "assistant", content: "收到。", timestamp: 1_100 },
    ]);
  });

  it("does not restore the trailing local user when the matching assistant reply is from a much later turn", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "assistant", content: "收到。", timestamp: 20_000 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
          { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 1_050 },
        ],
      ),
    ).toEqual([
      { role: "assistant", content: "收到。", timestamp: 20_000 },
    ]);
  });

  it("does not restore the trailing local user when the matching assistant is no longer the latest snapshot message", () => {
    expect(
      buildHydratedConversationWithLocalTail(
        [
          { role: "assistant", content: "收到。", timestamp: 1_100 },
          { role: "assistant", content: "后面的新消息", timestamp: 1_300 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "1", timestamp: 1_000 },
          { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 1_050 },
        ],
      ),
    ).toEqual([
      { role: "assistant", content: "收到。", timestamp: 1_100 },
      { role: "assistant", content: "后面的新消息", timestamp: 1_300 },
    ]);
  });

  it("can skip empty-snapshot local tail reuse when the caller already trusts the empty transcript", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [],
        localMessages: [
          { id: "msg-user-1", role: "user", content: "hi", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "收到", timestamp: 120 },
        ],
        allowEmptySnapshotLocalTail: false,
      }),
    ).toEqual([]);
  });

  it("does not restore a missing pending user into transcript once the authoritative assistant is no longer the latest message", () => {
    expect(
      buildDashboardSettledMessages({
        messages: [
          { role: "assistant", content: "收到。", timestamp: 1_100 },
          { role: "assistant", content: "后面的新消息", timestamp: 1_300 },
        ],
        pendingEntry: {
          startedAt: 1_000,
          pendingTimestamp: 1_050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: {
            id: "msg-user-1",
            role: "user",
            content: "1",
            timestamp: 1_000,
          },
        },
      }),
    ).toEqual([
      { role: "assistant", content: "收到。", timestamp: 1_100 },
      { role: "assistant", content: "后面的新消息", timestamp: 1_300 },
    ]);
  });

  it("treats empty idle snapshots without pending turns as authoritative", () => {
    expect(
      shouldReuseSettledLocalConversationTail({
        snapshotMessages: [],
        pendingEntry: null,
        status: "待命",
        preferAuthoritativeEmptySnapshot: true,
      }),
    ).toBe(false);
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

  it("preserves attachment-only user turns", () => {
    expect(
      collapseDuplicateConversationTurns([
        {
          role: "user",
          content: "",
          timestamp: 2_000,
          attachments: [
            {
              kind: "image",
              name: "photo.jpg",
              path: "/tmp/photo.jpg",
              fullPath: "/tmp/photo.jpg",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        role: "user",
        content: "",
        timestamp: 2_000,
        attachments: [
          {
            kind: "image",
            name: "photo.jpg",
            path: "/tmp/photo.jpg",
            fullPath: "/tmp/photo.jpg",
          },
        ],
      },
    ]);
  });

  it("prefers the real attachment-bearing turn over a synthetic attachment prompt duplicate", () => {
    expect(
      collapseDuplicateConversationTurns([
        {
          role: "user",
          content: "给我改成米白色的布衣\n\n附件 avatar.JPG.png (image/png, 217 KB) 已附加。",
          timestamp: 2_000,
        },
        {
          role: "user",
          content: "给我改成米白色的布衣",
          timestamp: 2_000,
          attachments: [
            {
              kind: "image",
              name: "avatar.JPG.png",
              path: "/tmp/avatar.JPG.png",
              fullPath: "/tmp/avatar.JPG.png",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        role: "user",
        content: "给我改成米白色的布衣",
        timestamp: 2_000,
        attachments: [
          {
            kind: "image",
            name: "avatar.JPG.png",
            path: "/tmp/avatar.JPG.png",
            fullPath: "/tmp/avatar.JPG.png",
          },
        ],
      },
    ]);
  });

  it("collapses a delayed synthetic attachment prompt after an assistant reply", () => {
    expect(
      collapseDuplicateConversationTurns([
        {
          role: "user",
          content: "看得到图吗",
          timestamp: 2_000,
          attachments: [
            {
              kind: "image",
              name: "image.png",
              path: "/tmp/image.png",
              fullPath: "/tmp/image.png",
            },
          ],
        },
        {
          role: "assistant",
          content: "能，这次我看得到你发来的图片附件了。",
          timestamp: 2_001,
        },
        {
          role: "user",
          content: "看得到图吗\n\n附件 image.png (image/png, 1829 KB) 已附加。",
          timestamp: 2_002,
        },
      ]),
    ).toEqual([
      {
        role: "user",
        content: "看得到图吗",
        timestamp: 2_000,
        attachments: [
          {
            kind: "image",
            name: "image.png",
            path: "/tmp/image.png",
            fullPath: "/tmp/image.png",
          },
        ],
      },
      {
        role: "assistant",
        content: "能，这次我看得到你发来的图片附件了。",
        timestamp: 2_001,
      },
    ]);
  });

  it("collapses delayed duplicate assistant greetings when no user turn happened between them", () => {
    expect(
      collapseDuplicateConversationTurns([
        {
          role: "assistant",
          content: "我是 Tom Cruise，今晚我盯着，咱们直接干。你要我现在处理什么，给我一句话目标就行。",
          timestamp: 2_000,
          tokenBadge: "↑3.8k ↓99 R24.3k",
        },
        {
          role: "assistant",
          content: "我是 Tom Cruise，今晚我盯着，咱们直接干。你要我现在处理什么，给我一句话目标就行。",
          timestamp: 2_025,
          tokenBadge: "↑3.8k ↓99 R24.3k",
        },
      ]),
    ).toEqual([
      {
        role: "assistant",
        content: "我是 Tom Cruise，今晚我盯着，咱们直接干。你要我现在处理什么，给我一句话目标就行。",
        timestamp: 2_000,
        tokenBadge: "↑3.8k ↓99 R24.3k",
      },
    ]);
  });

  it("collapses a replayed assistant card when the later message extends the same reply", () => {
    expect(
      collapseDuplicateConversationTurns([
        { role: "user", content: "发0.5.4", timestamp: 1_000 },
        {
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍：改版本、补 changelog、提交推送、发 GitHub Release、再次 ClawHub。",
          timestamp: 2_000,
        },
        {
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍：改版本、补 changelog、提交推送、发 GitHub Release、再次 ClawHub。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
          timestamp: 2_010,
        },
      ]),
    ).toEqual([
      { role: "user", content: "发0.5.4", timestamp: 1_000 },
      {
        role: "assistant",
        content: "行，我直接把版本提到 0.5.4，然后按规范走一遍：改版本、补 changelog、提交推送、发 GitHub Release、再次 ClawHub。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
        timestamp: 2_010,
      },
    ]);
  });
});

describe("mergeConversationAttachments", () => {
  it("keeps the richer snapshot image payload when local state only has a skinny attachment shell", () => {
    expect(
      mergeConversationAttachments(
        [
          {
            role: "user",
            content: "只用一句话说你看到了什么",
            timestamp: 1_000,
            attachments: [
              {
                id: "img-1",
                kind: "image",
                name: "avatar.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,server-rich",
                previewUrl: "data:image/png;base64,server-preview",
              },
            ],
          },
        ],
        [
          {
            role: "user",
            content: "只用一句话说你看到了什么",
            timestamp: 1_000,
            attachments: [
              {
                id: "img-1",
                kind: "image",
                name: "avatar.png",
                mimeType: "image/png",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "只用一句话说你看到了什么",
        timestamp: 1_000,
        attachments: [
          {
            id: "img-1",
            kind: "image",
            name: "avatar.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,server-rich",
            previewUrl: "data:image/png;base64,server-preview",
          },
        ],
      },
    ]);
  });

  it("merges complementary attachment fields instead of dropping whichever side arrived first", () => {
    expect(
      mergeConversationAttachments(
        [
          {
            role: "user",
            content: "看图",
            timestamp: 2_000,
            attachments: [
              {
                id: "img-2",
                kind: "image",
                name: "merged.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,snapshot",
              },
            ],
          },
        ],
        [
          {
            role: "user",
            content: "看图",
            timestamp: 2_000,
            attachments: [
              {
                id: "img-2",
                kind: "image",
                name: "merged.png",
                mimeType: "image/png",
                fullPath: "/tmp/merged.png",
                path: "/tmp/merged.png",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "看图",
        timestamp: 2_000,
        attachments: [
          {
            id: "img-2",
            kind: "image",
            name: "merged.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,snapshot",
            fullPath: "/tmp/merged.png",
            path: "/tmp/merged.png",
          },
        ],
      },
    ]);
  });

  it("merges the same image attachment when local state keys it by id and the snapshot only knows its path", () => {
    expect(
      mergeConversationAttachments(
        [
          {
            role: "user",
            content: "修改这张图。把上衣改成姜黄色",
            timestamp: 3_000,
            attachments: [
              {
                kind: "image",
                name: "wukong-mibai-eyes-brave.png",
                mimeType: "image/png",
                path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
                fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
              },
            ],
          },
        ],
        [
          {
            role: "user",
            content: "修改这张图。把上衣改成姜黄色",
            timestamp: 3_000,
            attachments: [
              {
                id: "img-local-1",
                kind: "image",
                name: "wukong-mibai-eyes-brave.png",
                mimeType: "image/png",
                path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
                fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
                dataUrl: "data:image/png;base64,local-rich",
                previewUrl: "data:image/png;base64,local-preview",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "修改这张图。把上衣改成姜黄色",
        timestamp: 3_000,
        attachments: [
          {
            id: "img-local-1",
            kind: "image",
            name: "wukong-mibai-eyes-brave.png",
            mimeType: "image/png",
            path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
            fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
            dataUrl: "data:image/png;base64,local-rich",
            previewUrl: "data:image/png;base64,local-preview",
          },
        ],
      },
    ]);
  });

  it("does not merge attachments across different user turns that only share the same content", () => {
    expect(
      mergeConversationAttachments(
        [
          {
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 2_000,
            attachments: [
              {
                id: "img-original",
                kind: "image",
                name: "original.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,original",
              },
            ],
          },
          {
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 2_100,
            attachments: [
              {
                id: "img-second-turn",
                kind: "image",
                name: "second.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,second",
              },
            ],
          },
        ],
        [
          {
            role: "user",
            content: "把这张图改成黑色背景",
            timestamp: 2_000,
            attachments: [
              {
                id: "img-original",
                kind: "image",
                name: "original.png",
                mimeType: "image/png",
                previewUrl: "data:image/png;base64,preview-original",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "把这张图改成黑色背景",
        timestamp: 2_000,
        attachments: [
          {
            id: "img-original",
            kind: "image",
            name: "original.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,original",
            previewUrl: "data:image/png;base64,preview-original",
          },
        ],
      },
      {
        role: "user",
        content: "把这张图改成黑色背景",
        timestamp: 2_100,
        attachments: [
          {
            id: "img-second-turn",
            kind: "image",
            name: "second.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,second",
          },
        ],
      },
    ]);
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

  it("preserves the local pending turn ids while a streaming snapshot is still growing", () => {
    expect(
      mergeConversationIdentity(
        [
          { role: "user", content: "继续", timestamp: 2_000 },
          { role: "assistant", content: "收", timestamp: 2_100 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1_000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到更多内容", timestamp: 1_100, streaming: true },
        ],
        {
          startedAt: 1_000,
          pendingTimestamp: 1_100,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: {
            id: "msg-user-1",
            role: "user",
            content: "继续",
            timestamp: 1_000,
          },
        },
      ),
    ).toEqual([
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 1_000 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "收", timestamp: 1_100 },
    ]);
  });

  it("prefers the closest local duplicate turn when the same visible messages appear multiple times", () => {
    expect(
      mergeConversationIdentity(
        [
          { role: "user", content: "继续", timestamp: 5_000 },
          { role: "assistant", content: "收到。", timestamp: 5_100 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1_000 },
          { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 1_100 },
          { id: "msg-user-2", role: "user", content: "继续", timestamp: 4_000 },
          { id: "msg-assistant-2", role: "assistant", content: "收到。", timestamp: 4_100 },
        ],
      ),
    ).toEqual([
      { id: "msg-user-2", role: "user", content: "继续", timestamp: 4_000 },
      { id: "msg-assistant-2", role: "assistant", content: "收到。", timestamp: 4_100 },
    ]);
  });

  it("keeps local identity matches monotonic so duplicate turns do not cross-wire user and assistant across turns", () => {
    expect(
      mergeConversationIdentity(
        [
          { role: "user", content: "继续", timestamp: 5_000 },
          { role: "assistant", content: "收到。", timestamp: 4_700 },
        ],
        [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1_000 },
          { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 4_600 },
          { id: "msg-user-2", role: "user", content: "继续", timestamp: 4_800 },
          { id: "msg-assistant-2", role: "assistant", content: "收到。", timestamp: 9_000 },
        ],
      ),
    ).toEqual([
      { id: "msg-user-2", role: "user", content: "继续", timestamp: 4_800 },
      { id: "msg-assistant-2", role: "assistant", content: "收到。", timestamp: 9_000 },
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

  it("strips gateway restart wrappers from persisted user messages", () => {
    expect(
      sanitizeMessagesForStorage([
        {
          role: "user",
          content: [
            "System: [2026-03-21 14:47:22 GMT+8] Gateway restart restart ok (gateway.restart)",
            "System: ✅ LalaClaw 已重启完成！已升级到 next 版本 2026.3.21-1。",
            "System: Reason: LalaClaw upgraded to 2026.3.21-1 (next), user requested restart",
            "System: Run: openclaw doctor --non-interactive",
            "",
            "Sender (untrusted metadata):",
            "```json",
            '{"label":"LalaClaw (gateway-client)","id":"gateway-client","name":"LalaClaw","username":"LalaClaw"}',
            "```",
            "",
            "[Sat 2026-03-21 14:54 GMT+8] https://alidocs.example/link",
            "",
            "将上面的在线文档发给天翊",
          ].join("\n"),
          timestamp: 1000,
        },
      ]),
    ).toEqual([
      {
        role: "user",
        content: "https://alidocs.example/link\n\n将上面的在线文档发给天翊",
        timestamp: 1000,
      },
    ]);
  });

  it("drops pre-compaction memory flush directives from persisted user messages", () => {
    expect(
      sanitizeMessagesForStorage([
        {
          role: "user",
          content: [
            "Pre-compaction memory flush. Store durable memories only in memory/2026-03-24.md (create memory/ if needed).",
            "Treat workspace bootstrap/reference files such as MEMORY.md, SOUL.md, TOOLS.md, and AGENTS.md as read-only during this flush; never overwrite, replace, or edit them.",
            "If memory/2026-03-24.md already exists, APPEND new content only and do not overwrite existing entries.",
            "Do NOT create timestamped variant files (e.g., 2026-03-24-HHMM.md); always use the canonical 2026-03-24.md filename.",
            "If nothing to store, reply with NO_REPLY.",
            "Current time: Tuesday, March 24th, 2026 — 11:41 PM (Asia/Shanghai) / 2026-03-24 15:41 UTC",
          ].join("\n"),
          timestamp: 1000,
        },
        { role: "assistant", content: "正常回复", timestamp: 1100 },
      ]),
    ).toEqual([
      { role: "assistant", content: "正常回复", timestamp: 1100 },
    ]);
  });

  it("drops reset startup directives from persisted user messages", () => {
    expect(
      sanitizeMessagesForStorage([
        {
          role: "user",
          content: [
            "A new session was started via /new or /reset. Run your Session Startup sequence - read the required files before responding to the user.",
            "Then greet the user in your configured persona, if one is provided.",
            "Be yourself - use your defined voice, mannerisms, and mood. Keep it to 1-3 sentences and ask what they want to do.",
            "If the runtime model differs from default_model in the system prompt, mention the default model.",
            "Do not mention internal steps, files, tools, or reasoning.",
            "Current time: Tuesday, March 24th, 2026 — 11:47 PM (Asia/Shanghai) / 2026-03-24 15:47 UTC",
          ].join("\n"),
          timestamp: 1000,
        },
        { role: "assistant", content: "正常回复", timestamp: 1100 },
      ]),
    ).toEqual([
      { role: "assistant", content: "正常回复", timestamp: 1100 },
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
    expect(stored.tabMetaById["agent:main"]).toMatchObject({
      sessionFiles: [],
      sessionFileRewrites: [],
    });
  });

  it("upgrades older tab metadata that does not include session file overlays", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "files",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        messagesByTabId: {
          "agent:main": [],
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

    const stored = loadStoredState();

    expect(stored.tabMetaById["agent:main"]).toMatchObject({
      agentId: "main",
      sessionUser: "command-center",
      sessionFiles: [],
      sessionFileRewrites: [],
    });
  });

  it("restores a custom user label from persisted ui state", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        messagesByTabId: {
          "agent:main": [],
        },
        sessionUser: "command-center",
        userLabel: "  Lala Operator  ",
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

    expect(loadStoredState()?.userLabel).toBe("Lala Operator");
  });

  it("restores per-conversation workspace file open preferences", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "files",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        messagesByTabId: {
          "agent:main": [],
        },
        sessionUser: "command-center",
        workspaceFilesOpenByConversation: {
          "command-center:main": false,
          "command-center-expert:expert": true,
        },
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

    expect(loadStoredState()?.workspaceFilesOpenByConversation).toEqual({
      "command-center:main": false,
      "command-center-expert:expert": true,
    });
  });

  it("sanitizes invalid session file overlay shapes from stored tab metadata", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "files",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        messagesByTabId: {
          "agent:main": [],
        },
        sessionUser: "command-center",
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "openai-codex/gpt-5.4",
            sessionUser: "command-center",
            thinkMode: "off",
            sessionFiles: { nope: true },
            sessionFileRewrites: "bad-data",
          },
        },
      }),
    );

    const stored = loadStoredState();

    expect(stored.tabMetaById["agent:main"]).toMatchObject({
      sessionFiles: [],
      sessionFileRewrites: [],
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

  it("does not backfill the active tab from legacy top-level messages when structured tab messages already exist", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:expert",
        activeTab: "timeline",
        agentId: "expert",
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:expert", agentId: "expert", sessionUser: "command-center-expert-1" },
        ],
        messages: [
          { role: "assistant", content: "旧的 active 顶层消息", timestamp: 99 },
        ],
        messagesByTabId: {
          "agent:main": [{ role: "assistant", content: "main 的旧对话", timestamp: 1 }],
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

    expect(stored.messagesByTabId["agent:main"]).toEqual([{ role: "assistant", content: "main 的旧对话", timestamp: 1 }]);
    expect(stored.messagesByTabId["agent:expert"]).toBeUndefined();
    expect(stored.messages).toEqual([]);
  });

  it("sanitizes wrapped gateway restart messages when restoring stored user history", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        agentId: "main",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        messagesByTabId: {
          "agent:main": [
            {
              id: "msg-user-1",
              role: "user",
              content: [
                "System: [2026-03-21 14:47:22 GMT+8] Gateway restart restart ok (gateway.restart)",
                "System: ✅ LalaClaw 已重启完成！已升级到 next 版本 2026.3.21-1。",
                "System: Reason: LalaClaw upgraded to 2026.3.21-1 (next), user requested restart",
                "System: Run: openclaw doctor --non-interactive",
                "",
                "Sender (untrusted metadata):",
                "```json",
                '{"label":"LalaClaw (gateway-client)","id":"gateway-client","name":"LalaClaw","username":"LalaClaw"}',
                "```",
                "",
                "[Sat 2026-03-21 14:54 GMT+8] https://alidocs.example/link",
                "",
                "将上面的在线文档发给天翊",
              ].join("\n"),
              timestamp: 1,
            },
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
      {
        id: "msg-user-1",
        role: "user",
        content: "https://alidocs.example/link\n\n将上面的在线文档发给天翊",
        timestamp: 1,
      },
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
        agentId: "main",
        sessionUser: "command-center",
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

  it("does not persist a stale pending turn once the stored messages have already advanced to a later user turn", () => {
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
      messagesByTabId: {
        "agent:main": [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "已经完成", timestamp: 101 },
          { id: "msg-user-2", role: "user", content: "继续说", timestamp: 102 },
          { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 103 },
        ],
      },
      messages: [
        { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "已经完成", timestamp: 101 },
        { id: "msg-user-2", role: "user", content: "继续说", timestamp: 102 },
        { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 103 },
      ],
      pendingChatTurns: {
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
      },
    });

    expect(window.localStorage.getItem(pendingChatStorageKey)).toBeNull();
    expect(loadPendingChatTurns()).toEqual({});
  });

  it("persists the top-level active messages from structured tab transcripts when both are present", () => {
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
        { id: "legacy-top-level", role: "assistant", content: "旧的顶层消息", timestamp: 90 },
      ],
      messagesByTabId: {
        "agent:main": [
          { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 100 },
        ],
      },
      pendingChatTurns: {},
    });

    const storedPayload = JSON.parse(window.localStorage.getItem(storageKey) || "{}");

    expect(storedPayload.messages).toEqual([
      { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 100 },
    ]);
    expect(storedPayload.messagesByTabId["agent:main"]).toEqual([
      { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 100 },
    ]);
  });

  it("stores settled transcript messages without transient streaming flags", () => {
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
        { id: "msg-assistant-streaming", role: "assistant", content: "第一段", timestamp: 100, streaming: true },
      ],
      messagesByTabId: {
        "agent:main": [
          { id: "msg-assistant-streaming", role: "assistant", content: "第一段", timestamp: 100, streaming: true },
        ],
      },
      pendingChatTurns: {},
    });

    expect(loadStoredState()?.messagesByTabId?.["agent:main"]).toEqual([
      { id: "msg-assistant-streaming", role: "assistant", content: "第一段", timestamp: 100 },
    ]);
  });

  it("persists workspace file open preferences in the ui snapshot", () => {
    persistUiStateSnapshot({
      activeChatTabId: "agent:main",
      activeTab: "files",
      agentId: "main",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      sessionUser: "command-center",
      workspaceFilesOpenByConversation: {
        "command-center:main": false,
      },
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
        "agent:main": [],
      },
    });

    expect(loadStoredState()?.workspaceFilesOpenByConversation).toEqual({
      "command-center:main": false,
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
        agentId: "main",
        sessionUser: "command-center",
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

  it("persists tab-level session file overlays for the current conversation", () => {
    persistUiStateSnapshot({
      activeChatTabId: "agent:main",
      activeTab: "files",
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
          sessionFiles: [
            {
              path: "/Users/marila/projects/lalaclaw/src/clip.png",
              fullPath: "/Users/marila/projects/lalaclaw/src/clip.png",
              kind: "文件",
              primaryAction: "created",
            },
          ],
          sessionFileRewrites: [
            {
              previousPath: "/Users/marila/projects/lalaclaw/AGENTS.md",
              nextPath: "/Users/marila/projects/lalaclaw/README.md",
            },
          ],
        },
      },
      messagesByTabId: {
        "agent:main": [],
      },
      messages: [],
      pendingChatTurns: {},
    });

    const stored = loadStoredState();

    expect(stored.tabMetaById["agent:main"]).toMatchObject({
      sessionFiles: [
        expect.objectContaining({
          fullPath: "/Users/marila/projects/lalaclaw/src/clip.png",
          primaryAction: "created",
        }),
      ],
      sessionFileRewrites: [
        {
          previousPath: "/Users/marila/projects/lalaclaw/AGENTS.md",
          nextPath: "/Users/marila/projects/lalaclaw/README.md",
        },
      ],
    });
  });

  it("canonicalizes legacy DingTalk session users for dedicated chat tabs and conversation maps", () => {
    const dingtalkSessionUser = '{"channel":"dingtalk-connector","peerid":"398058","sendername":"马锐拉"}';
    const canonicalSessionUser = "agent:main:dingtalk-connector:direct:398058";
    const legacyConversationKey = `${dingtalkSessionUser}:main`;
    const canonicalConversationKey = createConversationKey(canonicalSessionUser, "main");
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main::abc123",
        activeTab: "timeline",
        agentId: "main",
        sessionUser: dingtalkSessionUser,
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:main::abc123", agentId: "main", sessionUser: dingtalkSessionUser },
        ],
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "",
            sessionUser: "command-center",
            thinkMode: "off",
          },
          "agent:main::abc123": {
            agentId: "main",
            fastMode: false,
            model: "",
            sessionUser: dingtalkSessionUser,
            thinkMode: "off",
          },
        },
        promptDraftsByConversation: {
          [legacyConversationKey]: "legacy-draft",
        },
        dismissedTaskRelationshipIdsByConversation: {
          [legacyConversationKey]: ["task-1"],
        },
        workspaceFilesOpenByConversation: {
          [legacyConversationKey]: true,
        },
      }),
    );

    const stored = loadStoredState();

    expect(stored.chatTabs).toEqual([
      { id: "agent:main", agentId: "main", sessionUser: "command-center" },
      { id: "agent:main::abc123", agentId: "main", sessionUser: canonicalSessionUser },
    ]);
    expect(stored.tabMetaById["agent:main::abc123"]).toMatchObject({
      agentId: "main",
      sessionUser: canonicalSessionUser,
    });
    expect(stored.sessionUser).toBe(canonicalSessionUser);
    expect(stored.promptDraftsByConversation).toEqual({
      [canonicalConversationKey]: "legacy-draft",
    });
    expect(stored.dismissedTaskRelationshipIdsByConversation).toEqual({
      [canonicalConversationKey]: ["task-1"],
    });
    expect(stored.workspaceFilesOpenByConversation).toEqual({
      [canonicalConversationKey]: true,
    });
  });

  it("migrates legacy IM conversation keys across dedicated storage buckets", () => {
    const dingtalkSessionUser = '{"channel":"dingtalk-connector","peerid":"398058","sendername":"马锐拉"}';
    const canonicalConversationKey = createConversationKey("agent:main:dingtalk-connector:direct:398058", "main");
    const legacyConversationKey = `${dingtalkSessionUser}:main`;

    window.localStorage.setItem(
      promptHistoryStorageKey,
      JSON.stringify({
        [legacyConversationKey]: ["第一条", "第二条"],
      }),
    );
    window.localStorage.setItem(
      promptDraftStorageKey,
      JSON.stringify({
        [legacyConversationKey]: "旧草稿",
      }),
    );
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        pendingChatTurns: {
          [legacyConversationKey]: {
            key: legacyConversationKey,
            startedAt: 100,
            pendingTimestamp: 120,
            userMessage: {
              role: "user",
              content: "帮我看看",
              timestamp: 100,
            },
          },
        },
      }),
    );
    window.localStorage.setItem(
      chatScrollStorageKey,
      JSON.stringify({
        [legacyConversationKey]: {
          scrollTop: 240,
          atBottom: true,
        },
      }),
    );

    expect(loadStoredPromptHistory()).toEqual({
      [canonicalConversationKey]: ["第一条", "第二条"],
    });
    expect(loadStoredPromptDrafts()).toEqual({
      [canonicalConversationKey]: "旧草稿",
    });
    expect(loadPendingChatTurns()).toEqual({
      [canonicalConversationKey]: {
        key: canonicalConversationKey,
        startedAt: 100,
        pendingTimestamp: 120,
        agentId: "main",
        sessionUser: "agent:main:dingtalk-connector:direct:398058",
        userMessage: {
          role: "user",
          content: "帮我看看",
          timestamp: 100,
        },
      },
    });
    expect(loadStoredChatScrollTops()).toEqual({
      [canonicalConversationKey]: {
        scrollTop: 240,
        atBottom: true,
      },
    });
  });

  it("restores pending progress fields from localStorage and drops malformed stages", () => {
    const canonicalKey = "command-center:main";
    const malformedKey = "command-center:expert";
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        pendingChatTurns: {
          [canonicalKey]: {
            key: canonicalKey,
            startedAt: 100,
            pendingTimestamp: 120,
            progressStage: "executing",
            progressLabel: "Inspecting graph",
            progressUpdatedAt: 1700000000000,
            userMessage: {
              role: "user",
              content: "帮我看看",
              timestamp: 100,
            },
          },
          [malformedKey]: {
            key: malformedKey,
            startedAt: 200,
            pendingTimestamp: 220,
            progressStage: "not-a-real-stage",
            progressLabel: "Still working",
            progressUpdatedAt: 1700000001234,
            userMessage: {
              role: "user",
              content: "再看看",
              timestamp: 200,
            },
          },
        },
      }),
    );

    expect(loadPendingChatTurns()).toEqual({
      [canonicalKey]: {
        key: canonicalKey,
        startedAt: 100,
        pendingTimestamp: 120,
        agentId: "main",
        sessionUser: "command-center",
        progressStage: "executing",
        progressLabel: "Inspecting graph",
        progressUpdatedAt: 1700000000000,
        userMessage: {
          role: "user",
          content: "帮我看看",
          timestamp: 100,
        },
      },
      [malformedKey]: {
        key: malformedKey,
        startedAt: 200,
        pendingTimestamp: 220,
        agentId: "expert",
        sessionUser: "command-center",
        progressLabel: "Still working",
        progressUpdatedAt: 1700000001234,
        userMessage: {
          role: "user",
          content: "再看看",
          timestamp: 200,
        },
      },
    });
  });

  it("drops object-like pending progress labels during restore", () => {
    const conversationKey = "command-center:main";
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        pendingChatTurns: {
          [conversationKey]: {
            key: conversationKey,
            startedAt: 100,
            pendingTimestamp: 120,
            progressStage: "executing",
            progressLabel: { value: "ignored" },
            progressUpdatedAt: 1700000000000,
            userMessage: {
              role: "user",
              content: "帮我看看",
              timestamp: 100,
            },
          },
        },
      }),
    );

    expect(loadPendingChatTurns()).toEqual({
      [conversationKey]: {
        key: conversationKey,
        startedAt: 100,
        pendingTimestamp: 120,
        agentId: "main",
        sessionUser: "command-center",
        progressStage: "executing",
        progressUpdatedAt: 1700000000000,
        userMessage: {
          role: "user",
          content: "帮我看看",
          timestamp: 100,
        },
      },
    });
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

  it("defaults the composer send mode to enter-send when storage does not have it", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      }),
    );

    expect(loadStoredState()?.composerSendMode).toBe("enter-send");
  });

  it("loads the stored composer send mode", () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        composerSendMode: "double-enter-send",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      }),
    );

    expect(loadStoredState()?.composerSendMode).toBe("double-enter-send");
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
