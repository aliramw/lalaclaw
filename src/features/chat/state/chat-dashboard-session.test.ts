import { describe, expect, it } from "vitest";
import {
  buildDashboardChatSessionState,
  buildDashboardSettledMessages,
} from "@/features/chat/state/chat-dashboard-session";
import { selectChatRunBusy } from "@/features/chat/state/chat-session-state";

describe("buildDashboardChatSessionState", () => {
  it("returns settled messages separately from the visible pending overlay", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [],
      pendingEntry: {
        key: "pending-overlay-split",
        startedAt: 7000,
        pendingTimestamp: 7001,
        assistantMessageId: "assistant-pending-overlay-split",
        userMessage: {
          id: "optimistic-user-overlay-split",
          role: "user",
          content: "下一条消息",
          timestamp: 7000,
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.settledMessages).toEqual([
      {
        id: "optimistic-user-overlay-split",
        role: "user",
        content: "下一条消息",
        timestamp: 7000,
      },
    ]);
    expect(state.visibleMessages).toEqual([
      {
        id: "optimistic-user-overlay-split",
        role: "user",
        content: "下一条消息",
        timestamp: 7000,
      },
      {
        id: "assistant-pending-overlay-split",
        role: "assistant",
        content: "正在思考...",
        timestamp: 7001,
        pending: true,
      },
    ]);
  });

  it("keeps a pending text user turn continuously visible across optimistic and runtime snapshots", () => {
    const optimisticState = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [],
      pendingEntry: {
        key: "pending-text-continuity",
        startedAt: 9000,
        pendingTimestamp: 9001,
        assistantMessageId: "assistant-pending-text-continuity",
        userMessage: {
          id: "optimistic-user-text-continuity",
          role: "user",
          content: "第二条纯文字消息",
          timestamp: 9000,
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });
    const runtimeState = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-text-continuity",
          role: "user",
          content: "第二条纯文字消息",
          timestamp: 9002,
        },
      ],
      pendingEntry: {
        key: "pending-text-continuity",
        startedAt: 9000,
        pendingTimestamp: 9001,
        assistantMessageId: "assistant-pending-text-continuity",
        userMessage: {
          id: "optimistic-user-text-continuity",
          role: "user",
          content: "第二条纯文字消息",
          timestamp: 9000,
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(optimisticState.visibleMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(runtimeState.visibleMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(optimisticState.visibleMessages[0]).toMatchObject({
      role: "user",
      content: "第二条纯文字消息",
    });
    expect(runtimeState.visibleMessages[0]).toMatchObject({
      role: "user",
      content: "第二条纯文字消息",
    });
  });

  it("reinserts a missing pending user turn ahead of an already-restored partial assistant reply", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "assistant-pending-partial-order-1",
          role: "assistant",
          content: "第一段",
          timestamp: 1001,
        },
      ],
      pendingEntry: {
        key: "pending-partial-order-1",
        startedAt: 1000,
        pendingTimestamp: 1001,
        assistantMessageId: "assistant-pending-partial-order-1",
        userMessage: {
          id: "user-partial-order-1",
          role: "user",
          content: "刷新后继续生成",
          timestamp: 1000,
        },
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.settledMessages).toEqual([
      {
        id: "user-partial-order-1",
        role: "user",
        content: "刷新后继续生成",
        timestamp: 1000,
      },
      {
        id: "assistant-pending-partial-order-1",
        role: "assistant",
        content: "第一段",
        timestamp: 1001,
      },
    ]);
    expect(state.visibleMessages).toHaveLength(2);
    expect(state.visibleMessages[0]).toMatchObject({
      role: "user",
      content: "刷新后继续生成",
    });
    expect(state.visibleMessages[1]).toMatchObject({
      id: "assistant-pending-partial-order-1",
      role: "assistant",
      content: "第一段",
    });
  });

  it("keeps a pending text user turn visible without duplicating it when runtime id changes", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-1",
          role: "user",
          content: "很高兴认识你",
          timestamp: 1002,
        },
      ],
      pendingEntry: {
        key: "pending-1",
        startedAt: 1000,
        pendingTimestamp: 1001,
        assistantMessageId: "assistant-pending-1",
        userMessage: {
          id: "optimistic-user-1",
          role: "user",
          content: "很高兴认识你",
          timestamp: 1001,
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.conversation.messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(state.visibleMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(state.visibleMessages.at(-1)).toMatchObject({
      role: "assistant",
      pending: true,
      content: "正在思考...",
    });
  });

  it("collapses duplicate runtime echoes for the current in-flight text user turn", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-echo-1",
          role: "user",
          content: "我刚才执行的是 openclaw plugins install brave",
          timestamp: 48001,
        },
        {
          id: "runtime-user-echo-2",
          role: "user",
          content: "我刚才执行的是 openclaw plugins install brave",
          timestamp: 48002,
        },
      ],
      pendingEntry: {
        key: "pending-runtime-user-echo",
        startedAt: 48000,
        pendingTimestamp: 48001,
        assistantMessageId: "assistant-pending-runtime-user-echo",
        userMessage: {
          id: "optimistic-user-runtime-echo",
          role: "user",
          content: "我刚才执行的是 openclaw plugins install brave",
          timestamp: 48000,
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.conversation.messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(state.visibleMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(state.visibleMessages.at(-1)).toMatchObject({
      role: "assistant",
      pending: true,
      content: "正在思考...",
    });
  });

  it("keeps an image user turn visible without duplicating attachments when runtime id changes", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-image",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 2002,
          attachments: [
            { id: "runtime-attachment", previewUrl: "file:///runtime.png" },
          ],
        },
      ],
      pendingEntry: {
        key: "pending-image",
        startedAt: 2000,
        pendingTimestamp: 2001,
        assistantMessageId: "assistant-pending-image",
        userMessage: {
          id: "optimistic-user-image",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 2001,
          attachments: [
            { id: "runtime-attachment", previewUrl: "file:///runtime.png" },
          ],
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    const userMessages = state.visibleMessages.filter((message) => message.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.attachments || []).toHaveLength(1);
  });

  it("keeps an image user turn continuously visible across optimistic and runtime snapshots", () => {
    const optimisticState = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [],
      pendingEntry: {
        key: "pending-image-continuity",
        startedAt: 9100,
        pendingTimestamp: 9101,
        assistantMessageId: "assistant-pending-image-continuity",
        userMessage: {
          id: "optimistic-user-image-continuity",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 9100,
          attachments: [
            { id: "attachment-image-continuity", previewUrl: "file:///runtime.png" },
          ],
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });
    const runtimeState = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-image-continuity",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 9102,
          attachments: [
            { id: "attachment-image-continuity", previewUrl: "file:///runtime.png" },
          ],
        },
      ],
      pendingEntry: {
        key: "pending-image-continuity",
        startedAt: 9100,
        pendingTimestamp: 9101,
        assistantMessageId: "assistant-pending-image-continuity",
        userMessage: {
          id: "optimistic-user-image-continuity",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 9100,
          attachments: [
            { id: "attachment-image-continuity", previewUrl: "file:///runtime.png" },
          ],
        },
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(optimisticState.visibleMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(runtimeState.visibleMessages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(optimisticState.visibleMessages[0]?.attachments || []).toHaveLength(1);
    expect(runtimeState.visibleMessages[0]?.attachments || []).toHaveLength(1);
  });

  it("drops the assistant overlay once an authoritative assistant reply already exists", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-2",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 3001,
        },
        {
          id: "runtime-assistant-2",
          role: "assistant",
          content: "已完成。",
          timestamp: 3005,
        },
      ],
      pendingEntry: {
        key: "pending-2",
        startedAt: 3000,
        pendingTimestamp: 3002,
        assistantMessageId: "assistant-pending-2",
        userMessage: {
          id: "optimistic-user-2",
          role: "user",
          content: "把这张图改成黑色背景",
          timestamp: 3000,
        },
        streamText: "正在思考中",
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.visibleMessages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(state.visibleMessages[1]?.content).toBe("已完成。");
  });

  it("keeps the thinking overlay visible while a retained pending turn has no assistant projection yet", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-retained-1",
          role: "user",
          content: "继续帮我处理",
          timestamp: 4100,
        },
      ],
      pendingEntry: {
        key: "pending-retained-1",
        startedAt: 4100,
        pendingTimestamp: 4101,
        assistantMessageId: "assistant-pending-retained-1",
        suppressPendingPlaceholder: true,
        userMessage: {
          id: "runtime-user-retained-1",
          role: "user",
          content: "继续帮我处理",
          timestamp: 4100,
        },
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(selectChatRunBusy(state.run)).toBe(true);
    expect(state.run.status).toBe("starting");
    expect(state.visibleMessages).toEqual([
      {
        id: "runtime-user-retained-1",
        role: "user",
        content: "继续帮我处理",
        timestamp: 4100,
      },
      {
        id: "assistant-pending-retained-1",
        role: "assistant",
        content: "正在思考...",
        timestamp: 4101,
        pending: true,
      },
    ]);
  });

  it("does not keep the run busy once a locally settled assistant reply is visible and raw busy has cleared", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "msg-user-local-settled-1",
          role: "user",
          content: "本地完成但 runtime 不回写",
          timestamp: 5000,
        },
        {
          id: "msg-assistant-local-settled-1",
          role: "assistant",
          content: "本地已完成",
          timestamp: 5001,
        },
      ],
      pendingEntry: {
        key: "pending-local-settled-1",
        startedAt: 5000,
        pendingTimestamp: 5001,
        assistantMessageId: "msg-assistant-local-settled-1",
        suppressPendingPlaceholder: true,
        userMessage: {
          id: "msg-user-local-settled-1",
          role: "user",
          content: "本地完成但 runtime 不回写",
          timestamp: 5000,
        },
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(selectChatRunBusy(state.run)).toBe(false);
    expect(state.run.status).toBe("idle");
    expect(state.visibleMessages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(state.visibleMessages[1]).toMatchObject({
      id: "msg-assistant-local-settled-1",
      role: "assistant",
      content: "本地已完成",
    });
  });

  it("keeps the run busy until raw busy clears even after an authoritative assistant reply already exists", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-authoritative-1",
          role: "user",
          content: "第一条",
          timestamp: 4001,
        },
        {
          id: "runtime-assistant-authoritative-1",
          role: "assistant",
          content: "已完成。",
          timestamp: 4005,
        },
      ],
      pendingEntry: {
        key: "pending-authoritative-1",
        startedAt: 4000,
        pendingTimestamp: 4002,
        assistantMessageId: "assistant-pending-authoritative-1",
        userMessage: {
          id: "optimistic-user-authoritative-1",
          role: "user",
          content: "第一条",
          timestamp: 4000,
        },
      },
      rawBusy: true,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(selectChatRunBusy(state.run)).toBe(true);
    expect(state.visibleMessages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(state.visibleMessages[1]?.content).toBe("已完成。");
  });

  it("reuses a partial assistant reply already present in conversation without appending a duplicate overlay", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "runtime-user-partial-1",
          role: "user",
          content: "刷新后继续生成",
          timestamp: 100,
        },
        {
          id: "assistant-pending-partial-1",
          role: "assistant",
          content: "第一段",
          timestamp: 101,
        },
      ],
      pendingEntry: {
        key: "pending-partial-1",
        startedAt: 100,
        pendingTimestamp: 101,
        assistantMessageId: "assistant-pending-partial-1",
        userMessage: {
          id: "runtime-user-partial-1",
          role: "user",
          content: "刷新后继续生成",
          timestamp: 100,
        },
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.run.status).toBe("starting");
    expect(state.visibleMessages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(state.visibleMessages[1]).toMatchObject({
      id: "assistant-pending-partial-1",
      role: "assistant",
      content: "第一段",
    });
  });

  it("deduplicates repeated explicit-id messages before rendering the visible conversation", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          id: "msg-user-repeat-1",
          role: "user",
          content: "刷新后继续生成",
          timestamp: 100,
        },
        {
          id: "msg-assistant-repeat-1",
          role: "assistant",
          content: "第一段",
          timestamp: 101,
        },
        {
          id: "msg-assistant-repeat-1",
          role: "assistant",
          content: "第一段",
          timestamp: 101,
        },
      ],
      pendingEntry: {
        key: "pending-repeat-1",
        startedAt: 100,
        pendingTimestamp: 101,
        assistantMessageId: "msg-assistant-repeat-1",
        userMessage: {
          id: "msg-user-repeat-1",
          role: "user",
          content: "刷新后继续生成",
          timestamp: 100,
        },
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(
      state.visibleMessages.filter((message) => message.role === "assistant" && message.id === "msg-assistant-repeat-1"),
    ).toHaveLength(1);
  });

  it("collapses replayed assistant cards without explicit ids when a later snapshot extends the same reply", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          role: "user",
          content: "继续修这个问题",
          timestamp: 100,
        },
        {
          role: "assistant",
          content: "已改完。",
          timestamp: 120,
        },
        {
          role: "assistant",
          content: "已改完。\n\nDone:\n- 修正渲染 key\n- 保持卡片稳定",
          timestamp: 147,
        },
      ],
      pendingEntry: {
        key: "pending-replayed-assistant-1",
        startedAt: 100,
        pendingTimestamp: 119,
        assistantMessageId: "assistant-pending-replayed-assistant-1",
        userMessage: {
          role: "user",
          content: "继续修这个问题",
          timestamp: 100,
        },
        streamText: "已改完。\n\nDone:\n- 修正渲染 key\n- 保持卡片稳定",
      },
      rawBusy: true,
      sessionStatus: "running",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.visibleMessages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(state.visibleMessages[1]?.content).toBe("已改完。\n\nDone:\n- 修正渲染 key\n- 保持卡片稳定");
  });

  it("drops the pending overlay once multiple assistant replies already follow the restored user turn", () => {
    const state = buildDashboardChatSessionState({
      conversationKey: "main::command-center",
      messages: [
        {
          role: "user",
          content: "最后一句",
          timestamp: 100,
        },
        {
          role: "assistant",
          content: "刚查完了，结果如上：",
          timestamp: 90,
        },
        {
          role: "assistant",
          content: "已修复 3 个问题：",
          timestamp: 95,
        },
      ],
      pendingEntry: {
        key: "pending-followup-1",
        startedAt: 100,
        pendingTimestamp: 101,
        userMessage: {
          role: "user",
          content: "最后一句",
          timestamp: 100,
        },
      },
      rawBusy: false,
      sessionStatus: "idle",
      thinkingPlaceholder: "正在思考...",
      transport: "ws",
    });

    expect(state.run.status).toBe("idle");
    expect(state.visibleMessages.map((message) => message.role)).toEqual(["user", "assistant", "assistant"]);
    expect(state.visibleMessages.some((message) => message.content === "正在思考...")).toBe(false);
  });
});

describe("buildDashboardSettledMessages", () => {
  it("strips the current pending assistant match while a local live assistant is still streaming", () => {
    const messages = buildDashboardSettledMessages({
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
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到更多", timestamp: 1050 },
        ],
        localHasLivePendingAssistant: true,
        localHasExplicitLivePendingAssistant: true,
      });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "msg-user-1",
      role: "user",
      content: "继续",
      timestamp: 1000,
    });
  });

  it("keeps the local stopped assistant when a pending turn was already stopped", () => {
    const messages = buildDashboardSettledMessages({
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
      });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "帮我总结",
      timestamp: 200,
    });
    expect(messages[1]).toMatchObject({
      id: "msg-assistant-pending-1",
      role: "assistant",
      content: "已停止",
      timestamp: 220,
    });
  });

  it("prefers the longer local assistant replay over a shorter snapshot replay for the same pending turn", () => {
    const messages = buildDashboardSettledMessages({
      messages: [
        { role: "user", content: "发0.5.4", timestamp: 100 },
        {
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。",
          timestamp: 120,
        },
      ],
      pendingEntry: {
        startedAt: 100,
        pendingTimestamp: 120,
        assistantMessageId: "msg-assistant-pending-1",
        userMessage: {
          id: "msg-user-1",
          role: "user",
          content: "发0.5.4",
          timestamp: 100,
        },
      },
      localMessages: [
        {
          id: "msg-user-1",
          role: "user",
          content: "发0.5.4",
          timestamp: 100,
        },
        {
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
          timestamp: 120,
        },
      ],
      snapshotHasAssistantReply: false,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "发0.5.4",
      timestamp: 100,
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
      timestamp: 120,
    });
  });
});
