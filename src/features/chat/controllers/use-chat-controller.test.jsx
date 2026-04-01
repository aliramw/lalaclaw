import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatController } from "@/features/chat/controllers";

function mockJsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    headers: {
      get: () => "application/json; charset=utf-8",
    },
    json: async () => payload,
  });
}

function mockStreamResponse(events, ok = true, status = ok ? 200 : 500) {
  const encoder = new TextEncoder();

  return Promise.resolve({
    ok,
    status,
    headers: {
      get: (name) => (String(name).toLowerCase() === "content-type" ? "application/x-ndjson; charset=utf-8" : null),
    },
    body: new ReadableStream({
      start(controller) {
        events.forEach((event) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        });
        controller.close();
      },
    }),
  });
}

function createI18n() {
  return {
    chat: {
      thinkingPlaceholder: "正在思考…",
      stoppedResponse: "已停止",
    },
    common: {
      failed: "失败",
      idle: "空闲",
      requestFailed: "请求失败。",
      running: "运行中",
    },
    sessionOverview: {
      fastMode: {
        on: "已开启",
      },
    },
  };
}

class MockFileReader {
  readAsText(file) {
    this.result = `TEXT:${file.name}`;
    this.onload?.();
  }

  readAsDataURL(file) {
    this.result = `data:${file.type};base64,AAAA`;
    this.onload?.();
  }
}

function collectPendingSnapshots(mockFn) {
  const snapshots = [];
  let state = {};

  mockFn.mock.calls.forEach(([updater]) => {
    if (typeof updater !== "function") {
      state = updater;
    } else {
      state = updater(state);
    }
    snapshots.push(state);
  });

  return snapshots;
}

describe("useChatController", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues entries while busy and flushes them when the hook becomes idle", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const activeTargetRef = {
      current: {
        sessionUser: "command-center",
        agentId: "main",
      },
    };
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-100",
        outputText: "任务完成",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-1",
      key: "command-center:main",
      content: "请继续",
      attachments: [],
      timestamp: 100,
      userMessageId: "msg-user-100-localsend",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      messagesRef.current = currentMessagesState;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result, rerender } = renderHook(
      ({ busy }) =>
        useChatController({
          activeChatTabId: "agent:main",
          activeConversationKey: "command-center:main",
          activeTargetRef,
          applySnapshot,
          busy,
          i18n: createI18n(),
          getMessagesForTab: () => messagesRef.current,
          messagesRef,
          setBusy,
          setMessagesForTab,
          setMessagesSynced,
          setPendingChatTurns,
          setSession,
        }),
      {
        initialProps: { busy: true },
      },
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    expect(result.current.activeQueuedMessages).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(appliedMessageSnapshots).toEqual([]);

    rerender({ busy: false });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"content":"请继续"'),
        }),
      );
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      {
        id: "msg-user-100-localsend",
        role: "user",
        content: "请继续",
        timestamp: 100,
      },
      {
        id: "msg-assistant-100",
        role: "assistant",
        content: "任务完成",
        timestamp: appliedMessageSnapshots.at(-1)?.[1]?.timestamp,
      },
    ]);
    expect(appliedMessageSnapshots.at(-1)?.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it("keeps queued normal prompts out of the conversation until they start", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        busy: true,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
          appliedMessageSnapshots.push(messagesRef.current);
        },
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-busy-1",
        key: "command-center:main",
        content: "第一条",
        attachments: [],
        timestamp: 2500,
        userMessageId: "msg-user-busy-1",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });

      await result.current.enqueueOrRunEntry({
        id: "entry-busy-2",
        key: "command-center:main",
        content: "第二条",
        attachments: [],
        timestamp: 2600,
        userMessageId: "msg-user-busy-2",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(appliedMessageSnapshots).toEqual([]);
    expect(appliedMessageSnapshots.some((snapshot) => snapshot.some((message) => message?.pending))).toBe(false);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
    expect(result.current.activeQueuedMessages).toHaveLength(2);
  });

  it("writes the optimistic user turn into the local tab messages immediately when a non-busy send starts", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };

    let resolveResponse;
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve;
    });

    vi.stubGlobal("fetch", vi.fn(() => responsePromise));

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      messagesRef.current = currentMessagesState;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        getMessagesForTab: () => messagesRef.current,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
      }),
    );

    const entry = {
      id: "entry-immediate-visible-1",
      key: "command-center:main",
      content: "很高兴认识你",
      attachments: [
        {
          id: "attachment-immediate-visible-1",
          kind: "image",
          name: "avatar.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,AAAA",
          previewUrl: "data:image/png;base64,AAAA",
        },
      ],
      timestamp: 1000,
      userMessageId: "msg-user-immediate-visible-1",
      assistantMessageId: "msg-assistant-immediate-visible-1",
      pendingTimestamp: 1050,
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    const turnPromise = act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    await waitFor(() => {
      expect(appliedMessageSnapshots[0]).toEqual([
        {
          id: "msg-user-immediate-visible-1",
          role: "user",
          content: "很高兴认识你",
          timestamp: 1000,
          attachments: [
            {
              id: "attachment-immediate-visible-1",
              kind: "image",
              name: "avatar.png",
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,AAAA",
              previewUrl: "data:image/png;base64,AAAA",
            },
          ],
        },
        {
          id: "msg-assistant-immediate-visible-1",
          role: "assistant",
          content: "正在思考…",
          timestamp: 1050,
          pending: true,
        },
      ]);
    });

    resolveResponse?.(
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-immediate-visible-1",
        outputText: "收到。",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    );

    await turnPromise;
  });

  it("does not append a second optimistic IM user turn when runtime already echoed the same message without the optimistic id", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { role: "user", content: "测试钉钉重复", timestamp: 1001 },
      ],
    };

    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
      appliedMessageSnapshots.push(messagesRef.current);
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-im-echo-1",
        outputText: "收到。",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "agent:main:dingtalk-connector:direct:398058",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main::dingtalk",
        activeConversationKey: "agent:main:dingtalk-connector:direct:398058:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        getMessagesForTab: () => messagesRef.current,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-im-echo-user",
        key: "agent:main:dingtalk-connector:direct:398058:main",
        content: "测试钉钉重复",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-im-echo-1",
        assistantMessageId: "msg-assistant-im-echo-1",
        pendingTimestamp: 1050,
        agentId: "main",
        sessionUser: "agent:main:dingtalk-connector:direct:398058",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(appliedMessageSnapshots[0]).toEqual([
      { role: "user", content: "测试钉钉重复", timestamp: 1001 },
      {
        id: "msg-assistant-im-echo-1",
        role: "assistant",
        content: "正在思考…",
        timestamp: 1050,
        pending: true,
      },
    ]);
  });

  it("restores a queued entry for editing and preserves its attachments", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { id: "msg-user-edit-1", role: "user", content: "排队草稿", timestamp: 2700 },
        { id: "msg-keep", role: "assistant", content: "保留消息", timestamp: 2701 },
      ],
    };

    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
    });

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: true,
        i18n: createI18n(),
        getMessagesForTab: () => messagesRef.current,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      result.current.setQueuedMessages([
        {
          id: "queued-edit-1",
          key: "command-center:main",
          content: "排队草稿",
          attachments: [{ id: "attachment-1", name: "notes.md" }],
          timestamp: 2700,
          userMessageId: "msg-user-edit-1",
          agentId: "main",
          sessionUser: "command-center",
          model: "gpt-5",
          fastMode: false,
          tabId: "agent:main",
        },
      ]);
    });

    let restoredEntry = null;
    await act(async () => {
      restoredEntry = result.current.editQueuedEntry("queued-edit-1");
    });

    expect(restoredEntry).toMatchObject({
      id: "queued-edit-1",
      content: "排队草稿",
      attachments: [{ id: "attachment-1", name: "notes.md" }],
    });
    expect(result.current.activeQueuedMessages).toEqual([]);
    expect(messagesRef.current).toEqual([
      { id: "msg-keep", role: "assistant", content: "保留消息", timestamp: 2701 },
    ]);
  });

  it("includes the current user label in /api/chat requests", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-userlabel",
        outputText: "收到",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main::feishu",
        activeConversationKey: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58:main",
        applySnapshot,
        i18n: createI18n(),
        getMessagesForTab: () => messagesRef.current,
        messagesRef,
        setBusy,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
        },
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        userLabel: "marila",
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-feishu-userlabel",
        key: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58:main",
        content: "测试飞书",
        attachments: [],
        timestamp: 100,
        userMessageId: "msg-user-feishu-userlabel",
        agentId: "main",
        sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
        model: "gpt-5",
        fastMode: false,
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"userLabel":"marila"'),
        }),
      );
    });
  });

  it("aborts the active turn and calls /api/chat/stop when the user stops a running reply", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((input, init = {}) => {
      const url = String(input);
      if (url === "/api/chat/stop") {
        return mockJsonResponse({ ok: true });
      }
      if (url === "/api/chat") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (name) => (String(name).toLowerCase() === "content-type" ? "application/x-ndjson; charset=utf-8" : null),
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`${JSON.stringify({
                type: "message.patch",
                messageId: "msg-assistant-200",
                delta: "第一段",
              })}\n`));
              init.signal?.addEventListener("abort", () => {
                controller.error(new DOMException("The operation was aborted.", "AbortError"));
              });
            },
          }),
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      messagesRef.current = currentMessagesState;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        getMessagesForTab: () => messagesRef.current,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
      }),
    );

    const entry = {
      id: "entry-stop-1",
      key: "command-center:main",
      content: "请开始",
      attachments: [],
      timestamp: 200,
      userMessageId: "msg-user-200",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    let turnPromise;
    await act(async () => {
      turnPromise = result.current.enqueueOrRunEntry(entry);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    });

    await act(async () => {
      await result.current.handleStop();
    });

    await act(async () => {
      await turnPromise;
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/chat/stop", expect.objectContaining({ method: "POST" }));
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      {
        id: "msg-user-200",
        role: "user",
        content: "请开始",
        timestamp: 200,
      },
      {
        id: "msg-assistant-200",
        role: "assistant",
        content: "第一段",
        timestamp: appliedMessageSnapshots.at(-1)?.[1]?.timestamp,
      },
    ]);
  });

  it("ignores a rapid duplicate submit of the same prompt before the first turn settles", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };
    let resolveFetch;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve(
              {
                ok: true,
                status: 200,
                headers: {
                  get: () => "application/json; charset=utf-8",
                },
                json: async () => ({
                  ok: true,
                  assistantMessageId: "msg-assistant-dup-1",
                  outputText: "任务完成",
                  metadata: { status: "已完成 / 标准" },
                  sessionPatch: {
                    agentId: "main",
                    sessionUser: "command-center",
                    selectedModel: "gpt-5",
                    thinkMode: "off",
                  },
                }),
              },
            );
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ busyByTabId }) =>
        useChatController({
          activeChatTabId: "agent:main",
          activeConversationKey: "command-center:main",
          busy: false,
          busyByTabId,
          i18n: createI18n(),
          messagesRef,
          setBusy,
          setMessagesSynced,
          setPendingChatTurns,
          setSession,
          applySnapshot,
        }),
      {
        initialProps: { busyByTabId: {} },
      },
    );

    const entry = {
      id: "entry-dup-1",
      key: "command-center:main",
      content: "给我分析一下 lalaclaw目录的代码量？",
      attachments: [],
      timestamp: 1000,
      userMessageId: "msg-user-dup-1",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    const duplicateEntry = {
      ...entry,
      id: "entry-dup-2",
      timestamp: 1200,
      userMessageId: "msg-user-dup-2",
    };

    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = result.current.enqueueOrRunEntry(entry);
      await Promise.resolve();
    });

    rerender({ busyByTabId: { "agent:main": true } });

    await act(async () => {
      secondPromise = result.current.enqueueOrRunEntry(duplicateEntry);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch();
      await firstPromise;
      await secondPromise;
    });
  });

  it("ignores a same-tab duplicate submit even before busy state rerenders", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };
    let resolveFetch;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve(
              {
                ok: true,
                status: 200,
                headers: {
                  get: () => "application/json; charset=utf-8",
                },
                json: async () => ({
                  ok: true,
                  assistantMessageId: "msg-assistant-race-1",
                  outputText: "任务完成",
                  metadata: { status: "已完成 / 标准" },
                  sessionPatch: {
                    agentId: "main",
                    sessionUser: "command-center",
                    selectedModel: "gpt-5",
                    thinkMode: "off",
                  },
                }),
              },
            );
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    const entry = {
      id: "entry-race-1",
      key: "command-center:main",
      content: "帮我看一下这段配置",
      attachments: [],
      timestamp: 1000,
      userMessageId: "msg-user-race-1",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    const duplicateEntry = {
      ...entry,
      id: "entry-race-2",
      timestamp: 1050,
      userMessageId: "msg-user-race-2",
    };

    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = result.current.enqueueOrRunEntry(entry);
      secondPromise = result.current.enqueueOrRunEntry(duplicateEntry);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch();
      await firstPromise;
      await secondPromise;
    });
  });

  it("queues a different prompt behind the in-flight turn even before busy state rerenders", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };
    let resolveFetch;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve(
              mockJsonResponse({
                ok: true,
                assistantMessageId: "msg-assistant-race-queue-1",
                outputText: "第一条已完成",
                metadata: { status: "已完成 / 标准" },
                sessionPatch: {
                  agentId: "main",
                  sessionUser: "command-center",
                  selectedModel: "gpt-5",
                  thinkMode: "off",
                },
              }),
            );
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
          appliedMessageSnapshots.push(messagesRef.current);
        },
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    const firstEntry = {
      id: "entry-race-queue-1",
      key: "command-center:main",
      content: "第一条",
      attachments: [],
      timestamp: 1000,
      userMessageId: "msg-user-race-queue-1",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    const secondEntry = {
      ...firstEntry,
      id: "entry-race-queue-2",
      content: "第二条",
      timestamp: 1100,
      userMessageId: "msg-user-race-queue-2",
    };

    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = result.current.enqueueOrRunEntry(firstEntry);
      secondPromise = result.current.enqueueOrRunEntry(secondEntry);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.activeQueuedMessages).toHaveLength(1);
    expect(result.current.activeQueuedMessages[0]?.content).toBe("第二条");
    expect(appliedMessageSnapshots[0]).toEqual([
      { id: "msg-user-race-queue-1", role: "user", content: "第一条", timestamp: 1000 },
      { id: expect.stringMatching(/^msg-assistant-pending-/), role: "assistant", content: "正在思考…", pending: true, timestamp: expect.any(Number) },
    ]);
    const pendingSnapshots = collectPendingSnapshots(setPendingChatTurns);
    expect(pendingSnapshots[0]?.["command-center:main"]).toMatchObject({
      userMessage: {
        id: "msg-user-race-queue-1",
        role: "user",
        content: "第一条",
        timestamp: 1000,
      },
    });
    expect(messagesRef.current.some((message) => message?.content === "第二条")).toBe(false);

    await act(async () => {
      resolveFetch();
      await firstPromise;
      await secondPromise;
    });
  });

  it("flushes the next queued turn after the direct-send dispatching lock is released", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };

    let resolveFirstFetch;
    const firstFetchPromise = new Promise((resolve) => {
      resolveFirstFetch = () =>
        resolve(
          mockJsonResponse({
            ok: true,
            assistantMessageId: "msg-assistant-dispatch-release-1",
            outputText: "第一条完成",
            metadata: { status: "已完成 / 标准" },
            sessionPatch: {
              agentId: "main",
              sessionUser: "command-center",
              selectedModel: "gpt-5",
              thinkMode: "off",
            },
          }),
        );
    });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstFetchPromise)
      .mockImplementationOnce(() =>
        mockJsonResponse({
          ok: true,
          assistantMessageId: "msg-assistant-dispatch-release-2",
          outputText: "第二条完成",
          metadata: { status: "已完成 / 标准" },
          sessionPatch: {
            agentId: "main",
            sessionUser: "command-center",
            selectedModel: "gpt-5",
            thinkMode: "off",
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ busy }) =>
        useChatController({
          activeChatTabId: "agent:main",
          activeConversationKey: "command-center:main",
          busy,
          i18n: createI18n(),
          messagesRef,
          setBusy,
          setMessagesForTab: (_tabId, value) => {
            messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
          },
          setMessagesSynced,
          setPendingChatTurns,
          setSession,
          applySnapshot,
        }),
      { initialProps: { busy: false } },
    );

    const firstEntry = {
      id: "entry-dispatch-release-1",
      key: "command-center:main",
      content: "1",
      attachments: [],
      timestamp: 1000,
      userMessageId: "msg-user-dispatch-release-1",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    const secondEntry = {
      ...firstEntry,
      id: "entry-dispatch-release-2",
      content: "2",
      timestamp: 1100,
      userMessageId: "msg-user-dispatch-release-2",
    };

    let firstPromise;
    await act(async () => {
      firstPromise = result.current.enqueueOrRunEntry(firstEntry);
      await Promise.resolve();
      await result.current.enqueueOrRunEntry(secondEntry);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.activeQueuedMessages).toHaveLength(1);

    rerender({ busy: true });

    await act(async () => {
      resolveFirstFetch();
      await firstPromise;
    });

    rerender({ busy: false });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"content":"2"');
    expect(messagesRef.current.some((message) => message?.content === "2" && message?.role === "user")).toBe(true);
  });

  it("reuses the trailing assistant slot instead of appending a second assistant when runtime already replaced the pending placeholder", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1050, pending: true },
      ],
    };

    const appliedMessageSnapshots = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
      appliedMessageSnapshots.push(messagesRef.current);
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        conversation: [
          { role: "user", content: "1", timestamp: 1000 },
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
        outputText: "收到。",
        assistantMessageId: "msg-assistant-pending-1",
        metadata: { status: "已完成 / 标准" },
        session: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        isTabActive: () => true,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-authoritative-conversation-1",
        key: "command-center:main",
        content: "1",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-1",
        assistantMessageId: "msg-assistant-pending-1",
        pendingTimestamp: 1050,
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: [
          { role: "user", content: "1", timestamp: 1000 },
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
      }),
      { syncConversation: true },
    );
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
    ]);
  });

  it("does not let the chat response snapshot hide the current user when its conversation is still assistant-only", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1050, pending: true },
      ],
    };

    const appliedMessageSnapshots = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
      appliedMessageSnapshots.push(messagesRef.current);
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        conversation: [
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
        outputText: "收到。",
        assistantMessageId: "msg-assistant-pending-1",
        metadata: { status: "已完成 / 标准" },
        session: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        isTabActive: () => true,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-response-assistant-only",
        key: "command-center:main",
        content: "1",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-1",
        assistantMessageId: "msg-assistant-pending-1",
        pendingTimestamp: 1050,
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: [
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
      }),
      { syncConversation: false },
    );
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
    ]);
  });

  it("clears the pending turn once the success snapshot already returned a final assistant reply", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1050, pending: true },
      ],
    };

    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        conversation: [
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
        outputText: "收到。",
        assistantMessageId: "msg-assistant-pending-1",
        metadata: { status: "已完成 / 标准" },
        session: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        isTabActive: () => true,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-retain-pending-assistant-only",
        key: "command-center:main",
        content: "1",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-1",
        assistantMessageId: "msg-assistant-pending-1",
        pendingTimestamp: 1050,
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    const pendingSnapshots = collectPendingSnapshots(setPendingChatTurns);
    expect(pendingSnapshots.at(-1)).toEqual({});
  });

  it("restores the current user before final assistant replacement when runtime has temporarily collapsed the view to assistant-only", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1050, pending: true },
      ],
    };

    const appliedMessageSnapshots = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
      appliedMessageSnapshots.push(messagesRef.current);

      if (appliedMessageSnapshots.length === 1) {
        messagesRef.current = [
          { id: "msg-assistant-pending-1", role: "assistant", content: "收到", timestamp: 1050, streaming: true },
        ];
      }
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        conversation: [
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
        outputText: "收到。",
        assistantMessageId: "msg-assistant-pending-1",
        metadata: { status: "已完成 / 标准" },
        session: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        isTabActive: () => true,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-final-restores-user",
        key: "command-center:main",
        content: "1",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-1",
        assistantMessageId: "msg-assistant-pending-1",
        pendingTimestamp: 1050,
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
    ]);
  });

  it("clears stale streaming state when the final assistant reply falls back to replacing the trailing assistant bubble", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = {
      current: [
        { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1050, pending: true },
      ],
    };

    const appliedMessageSnapshots = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
      appliedMessageSnapshots.push(messagesRef.current);

      if (appliedMessageSnapshots.length === 1) {
        messagesRef.current = [
          { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
          { role: "assistant", content: "收到", timestamp: 1774409543000, streaming: true },
        ];
      }
    });

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        conversation: [
          { role: "assistant", content: "收到。", timestamp: 1100 },
        ],
        outputText: "收到。",
        assistantMessageId: "msg-assistant-pending-1",
        metadata: { status: "已完成 / 标准" },
        session: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        isTabActive: () => true,
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-final-clears-streaming",
        key: "command-center:main",
        content: "1",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-1",
        assistantMessageId: "msg-assistant-pending-1",
        pendingTimestamp: 1050,
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
    ]);
    expect(appliedMessageSnapshots.at(-1)?.[1]?.streaming).toBeUndefined();
    expect(appliedMessageSnapshots.at(-1)?.[1]?.pending).toBeUndefined();
  });

  it("does not queue a duplicate prompt again while the tab is already busy", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        busy: true,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    const entry = {
      id: "entry-queue-1",
      key: "command-center:main",
      content: "给我分析一下 lalaclaw目录的代码量？",
      attachments: [],
      timestamp: 2000,
      userMessageId: "msg-user-queue-1",
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
      await result.current.enqueueOrRunEntry({
        ...entry,
        id: "entry-queue-2",
        timestamp: 2100,
        userMessageId: "msg-user-queue-2",
      });
    });

    expect(result.current.activeQueuedMessages).toHaveLength(1);
  });

  it("allows resubmitting the same prompt after the previous turn has already settled", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistantMessageId: "msg-assistant-rerun-1",
          outputText: "第一次完成",
          metadata: { status: "已完成 / 标准" },
          sessionPatch: {
            agentId: "main",
            sessionUser: "command-center",
            selectedModel: "gpt-5",
            thinkMode: "off",
          },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          ok: true,
          assistantMessageId: "msg-assistant-rerun-2",
          outputText: "第二次完成",
          metadata: { status: "已完成 / 标准" },
          sessionPatch: {
            agentId: "main",
            sessionUser: "command-center",
            selectedModel: "gpt-5",
            thinkMode: "off",
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
        },
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-rerun-1",
        key: "command-center:main",
        content: "继续",
        attachments: [],
        timestamp: 1000,
        userMessageId: "msg-user-rerun-1",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-rerun-2",
        key: "command-center:main",
        content: "继续",
        attachments: [],
        timestamp: 1200,
        userMessageId: "msg-user-rerun-2",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not show the local thinking placeholder for slash commands", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const activeTargetRef = {
      current: {
        sessionUser: "command-center",
        agentId: "main",
      },
    };
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-101",
        outputText: "新会话已开始。直接说你要我干什么。",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-command",
      key: "command-center:main",
      content: "/new",
      attachments: [],
      timestamp: 300,
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef,
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    expect(appliedMessageSnapshots.at(-1)).toEqual([
      {
        id: "msg-user-entry-command",
        role: "user",
        content: "/new",
        timestamp: 300,
      },
      {
        id: "msg-assistant-101",
        role: "assistant",
        content: "新会话已开始。直接说你要我干什么。",
        timestamp: expect.any(Number),
      },
    ]);
    expect(setPendingChatTurns).toHaveBeenCalledWith(expect.any(Function));
    const pendingUpdater = setPendingChatTurns.mock.calls[0][0];
    expect(
      pendingUpdater({})["command-center:main"],
    ).toMatchObject({
      suppressPendingPlaceholder: true,
      userMessage: { content: "/new", timestamp: 300 },
    });
    expect(appliedMessageSnapshots.some((snapshot) => snapshot.some((message) => message?.pending))).toBe(false);
  });

  it("keeps slash commands queueing quietly while the tab is busy", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        busy: true,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
        applySnapshot,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
          appliedMessageSnapshots.push(messagesRef.current);
        },
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-slash-busy-1",
        key: "command-center:main",
        content: "/new",
        attachments: [],
        timestamp: 2500,
        userMessageId: "msg-user-slash-busy-1",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(appliedMessageSnapshots).toEqual([]);
    expect(result.current.activeQueuedMessages).toHaveLength(1);
  });

  it("keeps the local thinking placeholder for normal messages until the streamed reply takes over", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const activeTargetRef = {
      current: {
        sessionUser: "command-center",
        agentId: "paint",
      },
    };
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockStreamResponse([
        { type: "message.start", message: { id: "msg-assistant-fast" } },
        { type: "message.patch", messageId: "msg-assistant-fast", delta: "嘿！" },
        {
          type: "message.complete",
          messageId: "msg-assistant-fast",
          payload: {
            ok: true,
            assistantMessageId: "msg-assistant-fast",
            outputText: "嘿！",
            tokenBadge: "↑1 ↓1",
            session: { agentId: "paint", sessionUser: "command-center", selectedModel: "gemini-3-flash-preview", thinkMode: "off", status: "已完成 / 标准" },
            conversation: [
              { role: "user", content: "hi", timestamp: 400 },
              { role: "assistant", content: "嘿！", timestamp: 420, tokenBadge: "↑1 ↓1" },
            ],
            metadata: { status: "已完成 / 标准" },
          },
        },
      ]),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-fast-stream",
      key: "command-center:paint",
      content: "hi",
      attachments: [],
      timestamp: 400,
      agentId: "paint",
      sessionUser: "command-center",
      model: "gemini-3-flash-preview",
      fastMode: false,
    };

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:paint",
        activeConversationKey: "command-center:paint",
        activeTargetRef,
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    const pendingSnapshots = collectPendingSnapshots(setPendingChatTurns);
    expect(pendingSnapshots[0]?.["command-center:paint"]).toMatchObject({
      userMessage: { id: "msg-user-entry-fast-stream", role: "user", content: "hi", timestamp: 400 },
    });
    expect(pendingSnapshots.some((snapshot) => snapshot?.["command-center:paint"]?.streamText === "嘿！")).toBe(true);
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-entry-fast-stream", role: "user", content: "hi", timestamp: 400 },
      { id: "msg-assistant-fast", role: "assistant", content: "嘿！", timestamp: expect.any(Number), tokenBadge: "↑1 ↓1" },
    ]);
  });

  it("invalidates stale tab runtime requests before a turn starts and again after a session reset", async () => {
    const setBusy = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const invalidateRuntimeRequestForTab = vi.fn();
    const messagesRef = { current: [] };

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        resetSessionUser: "command-center-1773638962082",
        outputText: "新会话已开始。直接说你要我干什么。",
        session: {
          agentId: "main",
          sessionUser: "command-center-1773638962082",
          selectedModel: "gpt-5",
          thinkMode: "off",
          status: "已完成 / 标准",
        },
        conversation: [
          { role: "assistant", content: "新会话已开始。直接说你要我干什么。", timestamp: 1000 },
        ],
        metadata: { status: "已完成 / 标准" },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        invalidateRuntimeRequestForTab,
        messagesRef,
        setBusy,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-reset-runtime",
        key: "command-center:main",
        content: "/new",
        attachments: [],
        timestamp: 900,
        userMessageId: "msg-user-reset-runtime",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(invalidateRuntimeRequestForTab).toHaveBeenNthCalledWith(1, "agent:main");
    expect(invalidateRuntimeRequestForTab).toHaveBeenNthCalledWith(2, "agent:main");
  });

  it("keeps the thinking placeholder visible while early stream chunks are not yet user-visible", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const activeTargetRef = {
      current: {
        sessionUser: "command-center",
        agentId: "main",
      },
    };
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockStreamResponse([
        { type: "message.start", message: { id: "msg-assistant-late-visible" } },
        { type: "message.patch", messageId: "msg-assistant-late-visible", delta: "[[reply_to_current]] " },
        { type: "message.patch", messageId: "msg-assistant-late-visible", delta: "\n\n" },
        { type: "message.patch", messageId: "msg-assistant-late-visible", delta: "真正的正文来了" },
        {
          type: "message.complete",
          messageId: "msg-assistant-late-visible",
          payload: {
            ok: true,
            assistantMessageId: "msg-assistant-late-visible",
            outputText: "[[reply_to_current]] \n\n真正的正文来了",
            tokenBadge: "↑1 ↓3",
            session: { agentId: "main", sessionUser: "command-center", selectedModel: "gpt-5", thinkMode: "off", status: "已完成 / 标准" },
            conversation: [
              { role: "user", content: "说点什么", timestamp: 600 },
              { role: "assistant", content: "真正的正文来了", timestamp: 620, tokenBadge: "↑1 ↓3" },
            ],
            metadata: { status: "已完成 / 标准" },
          },
        },
      ]),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-late-visible",
      key: "command-center:main",
      content: "说点什么",
      attachments: [],
      timestamp: 600,
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeChatTabId: "agent:main",
        activeConversationKey: "command-center:main",
        activeTargetRef,
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    const pendingSnapshots = collectPendingSnapshots(setPendingChatTurns);
    expect(pendingSnapshots[0]?.["command-center:main"]).toMatchObject({
      userMessage: { id: "msg-user-entry-late-visible", role: "user", content: "说点什么", timestamp: 600 },
    });
    expect(pendingSnapshots.some((snapshot) => snapshot?.["command-center:main"]?.streamText === "[[reply_to_current]] ")).toBe(false);
    expect(
      pendingSnapshots.some((snapshot) =>
        snapshot?.["command-center:main"]?.streamText === "[[reply_to_current]] \n\n真正的正文来了",
      ),
    ).toBe(true);
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-entry-late-visible", role: "user", content: "说点什么", timestamp: 600 },
      {
        id: "msg-assistant-late-visible",
        role: "assistant",
        content: "[[reply_to_current]] \n\n真正的正文来了",
        timestamp: expect.any(Number),
        tokenBadge: "↑1 ↓3",
      },
    ]);
  });

  it("streams assistant output incrementally when the chat API returns ndjson", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const activeTargetRef = {
      current: {
        sessionUser: "command-center",
        agentId: "main",
      },
    };
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockStreamResponse([
        { type: "message.start", message: { id: "msg-assistant-1" } },
        { type: "message.patch", messageId: "msg-assistant-1", delta: "第一段" },
        { type: "message.patch", messageId: "msg-assistant-1", delta: "第二段" },
        {
          type: "message.complete",
          messageId: "msg-assistant-1",
          payload: {
            ok: true,
            assistantMessageId: "msg-assistant-1",
            outputText: "第一段第二段",
            tokenBadge: "↑1 ↓2",
            session: { agentId: "main", sessionUser: "command-center", selectedModel: "gpt-5", thinkMode: "off", status: "已完成 / 标准" },
            conversation: [
              { role: "user", content: "请流式输出", timestamp: 200 },
              { role: "assistant", content: "第一段第二段", timestamp: 220, tokenBadge: "↑1 ↓2" },
            ],
            metadata: { status: "已完成 / 标准" },
          },
        },
        {
          type: "session.sync",
          session: { agentId: "main", sessionUser: "command-center", thinkMode: "off", selectedModel: "gpt-5", status: "已完成 / 标准" },
        },
      ]),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-stream",
      key: "command-center:main",
      content: "请流式输出",
      attachments: [],
      timestamp: 200,
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      appliedMessageSnapshots.push(currentMessagesState);
      setMessagesSynced(value);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef,
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab,
        setMessagesSynced,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"stream":true'),
      }),
    );
    const pendingSnapshots = collectPendingSnapshots(setPendingChatTurns);
    expect(pendingSnapshots[0]?.["command-center:main"]).toMatchObject({
      userMessage: { role: "user", content: "请流式输出", timestamp: 200 },
    });
    expect(pendingSnapshots.some((snapshot) => snapshot?.["command-center:main"]?.streamText === "第一段")).toBe(true);
    expect(pendingSnapshots.some((snapshot) => snapshot?.["command-center:main"]?.streamText === "第一段第二段")).toBe(true);
    expect(applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: [
          { role: "user", content: "请流式输出", timestamp: 200 },
          { role: "assistant", content: "第一段第二段", timestamp: 220, tokenBadge: "↑1 ↓2" },
        ],
      }),
      { syncConversation: true },
    );

    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-entry-stream", role: "user", content: "请流式输出", timestamp: 200 },
      { id: "msg-assistant-1", role: "assistant", content: "第一段第二段", timestamp: expect.any(Number), tokenBadge: "↑1 ↓2" },
    ]);
  });

  it("persists the optimistic pending turn immediately and clears it again after the authoritative conversation settles", async () => {
    const setBusy = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const persistOptimisticChatState = vi.fn();
    const messagesRef = { current: [] };

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-persist-1",
        conversation: [
          { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
          { id: "msg-assistant-persist-1", role: "assistant", content: "任务完成", timestamp: 3050 },
        ],
        outputText: "任务完成",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        persistOptimisticChatState,
        setBusy,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
        },
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-persist-1",
        key: "command-center:main",
        content: "发完立刻刷新",
        attachments: [],
        timestamp: 3000,
        userMessageId: "msg-user-persist-1",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(persistOptimisticChatState).toHaveBeenNthCalledWith(1, {
      tabId: "command-center:main",
      nextMessages: [
        { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
        { id: expect.stringMatching(/^msg-assistant-pending-/), role: "assistant", content: "正在思考…", pending: true, timestamp: expect.any(Number) },
      ],
      pendingEntry: expect.objectContaining({
        key: "command-center:main",
        userMessage: { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
      }),
    });

    expect(persistOptimisticChatState).toHaveBeenLastCalledWith({
      tabId: "command-center:main",
      nextMessages: [
        { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
        { id: "msg-assistant-persist-1", role: "assistant", content: "任务完成", timestamp: expect.any(Number) },
      ],
      clearPendingKey: "command-center:main",
    });
  });

  it("clears the persisted pending turn when the success payload omits conversation but already returns final output", async () => {
    const setBusy = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const persistOptimisticChatState = vi.fn();
    const messagesRef = { current: [] };

    vi.stubGlobal("fetch", vi.fn(() =>
      mockJsonResponse({
        ok: true,
        assistantMessageId: "msg-assistant-persist-runtime-catchup-1",
        outputText: "任务完成",
        metadata: { status: "已完成 / 标准" },
        sessionPatch: {
          agentId: "main",
          sessionUser: "command-center",
          selectedModel: "gpt-5",
          thinkMode: "off",
        },
      }),
    ));

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        persistOptimisticChatState,
        setBusy,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
        },
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry({
        id: "entry-persist-runtime-catchup-1",
        key: "command-center:main",
        content: "发完立刻刷新",
        attachments: [],
        timestamp: 3000,
        userMessageId: "msg-user-persist-1",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
    });

    expect(persistOptimisticChatState).toHaveBeenNthCalledWith(1, {
      tabId: "command-center:main",
      nextMessages: [
        { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
        { id: expect.stringMatching(/^msg-assistant-pending-/), role: "assistant", content: "正在思考…", pending: true, timestamp: expect.any(Number) },
      ],
      pendingEntry: expect.objectContaining({
        key: "command-center:main",
        userMessage: { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
      }),
    });

    expect(persistOptimisticChatState).toHaveBeenLastCalledWith({
      tabId: "command-center:main",
      nextMessages: [
        { id: "msg-user-persist-1", role: "user", content: "发完立刻刷新", timestamp: 3000 },
        { id: "msg-assistant-persist-runtime-catchup-1", role: "assistant", content: "任务完成", timestamp: expect.any(Number) },
      ],
      clearPendingKey: "command-center:main",
    });
  });

  it("preserves partial streamed output when the ndjson stream ends with an error", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const activeTargetRef = {
      current: {
        sessionUser: "command-center",
        agentId: "main",
      },
    };
    const messagesRef = { current: [] };
    const fetchMock = vi.fn(() =>
      mockStreamResponse([
        { type: "message.start", message: { id: "msg-assistant-2" } },
        { type: "message.patch", messageId: "msg-assistant-2", delta: "第一段" },
        { type: "message.patch", messageId: "msg-assistant-2", delta: "第二段" },
        { type: "message.error", messageId: "msg-assistant-2", error: "Gateway chat stream closed" },
      ]),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-stream-error",
      key: "command-center:main",
      content: "请继续",
      attachments: [],
      timestamp: 210,
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    let currentMessagesState = [];
    const setMessagesForTab = vi.fn((_tabId, value) => {
      currentMessagesState = typeof value === "function" ? value(currentMessagesState) : value;
      appliedMessageSnapshots.push(currentMessagesState);
    });

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef,
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab,
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      await result.current.enqueueOrRunEntry(entry);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(appliedMessageSnapshots.some((snapshot) =>
      snapshot?.some((message) => message?.role === "assistant" && message?.content === "第一段第二段"),
    )).toBe(true);
    expect(appliedMessageSnapshots.at(-1)).toEqual([
      { id: "msg-user-entry-stream-error", role: "user", content: "请继续", timestamp: 210 },
      { id: "msg-assistant-2", role: "assistant", content: "第一段第二段", timestamp: expect.any(Number) },
    ]);
    expect(appliedMessageSnapshots.at(-1)[1].content).not.toContain("请求失败");
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it("does not overwrite the pending placeholder with a network error when the page is unloading", async () => {
    const setBusy = vi.fn();
    const appliedMessageSnapshots = [];
    const setPendingChatTurns = vi.fn();
    const setSession = vi.fn();
    const applySnapshot = vi.fn();
    const messagesRef = { current: [] };

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("network error"))));

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
        setMessagesForTab: (_tabId, value) => {
          messagesRef.current = typeof value === "function" ? value(messagesRef.current) : value;
          appliedMessageSnapshots.push(messagesRef.current);
        },
        setPendingChatTurns,
        setSession,
      }),
    );

    await act(async () => {
      const requestPromise = result.current.enqueueOrRunEntry({
        id: "entry-refresh-unload",
        key: "command-center:main",
        content: "说说数学",
        attachments: [],
        timestamp: 5000,
        userMessageId: "msg-user-refresh-unload",
        agentId: "main",
        sessionUser: "command-center",
        model: "gpt-5",
        fastMode: false,
      });
      window.dispatchEvent(new Event("pagehide"));
      await requestPromise;
    });

    expect(appliedMessageSnapshots[0]).toEqual([
      { id: "msg-user-refresh-unload", role: "user", content: "说说数学", timestamp: 5000 },
      { id: expect.stringMatching(/^msg-assistant-pending-/), role: "assistant", content: "正在思考…", pending: true, timestamp: expect.any(Number) },
    ]);
    expect(appliedMessageSnapshots.some((snapshot) =>
      snapshot?.some((message) => String(message?.content || "").includes("network error")),
    )).toBe(false);
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setBusy).not.toHaveBeenLastCalledWith(false);
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it("hydrates text attachments into composer state", async () => {
    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef: { current: { sessionUser: "command-center", agentId: "main" } },
        applySnapshot: vi.fn(),
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        setBusy: vi.fn(),
        setMessagesSynced: vi.fn(),
        setPendingChatTurns: vi.fn(),
        setSession: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleAddAttachments([
        new File(["console.log('hi')"], "notes.js", { type: "text/javascript" }),
      ]);
    });

    expect(result.current.composerAttachments).toHaveLength(1);
    expect(result.current.composerAttachments[0]).toMatchObject({
      kind: "text",
      name: "notes.js",
      textContent: "TEXT:notes.js",
    });
  });

  it("preserves local file paths on image attachments when available", async () => {
    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef: { current: { sessionUser: "command-center", agentId: "main" } },
        applySnapshot: vi.fn(),
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        setBusy: vi.fn(),
        setMessagesSynced: vi.fn(),
        setPendingChatTurns: vi.fn(),
        setSession: vi.fn(),
      }),
    );

    const imageFile = new File(["png"], "poster.png", { type: "image/png" });
    Object.defineProperty(imageFile, "path", {
      value: "/Users/marila/projects/assets/poster.png",
      configurable: true,
    });

    await act(async () => {
      await result.current.handleAddAttachments([imageFile]);
    });

    expect(result.current.composerAttachments[0]).toMatchObject({
      kind: "image",
      name: "poster.png",
      path: "/Users/marila/projects/assets/poster.png",
      fullPath: "/Users/marila/projects/assets/poster.png",
    });
  });

  it("dedupes equivalent pasted image attachments when the same clipboard image is added twice", async () => {
    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef: { current: { sessionUser: "command-center", agentId: "main" } },
        applySnapshot: vi.fn(),
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        setBusy: vi.fn(),
        setMessagesSynced: vi.fn(),
        setPendingChatTurns: vi.fn(),
        setSession: vi.fn(),
      }),
    );

    const pastedImageA = new File(["same-image"], "image.png", { type: "image/png" });
    const pastedImageB = new File(["same-image"], "image.png", { type: "image/png" });

    await act(async () => {
      await result.current.handleAddAttachments([pastedImageA]);
      await result.current.handleAddAttachments([pastedImageB]);
    });

    expect(result.current.composerAttachments).toHaveLength(1);
    expect(result.current.composerAttachments[0]).toMatchObject({
      kind: "image",
      name: "image.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,AAAA",
      previewUrl: "data:image/png;base64,AAAA",
    });
  });
});
