import { StrictMode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRuntimeSnapshot } from "@/features/session/runtime";
import { getRuntimePollInterval } from "@/features/session/runtime/use-runtime-snapshot";

function mockJsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
  });
}

function createI18n() {
  return {
    common: {
      offline: "OpenClaw 离线",
      running: "运行中",
    },
    chat: {
      thinkingPlaceholder: "正在思考…",
    },
    sessionOverview: {
      fastMode: {
        on: "已开启",
      },
    },
  };
}

function createSession(overrides = {}) {
  return {
    mode: "mock",
    model: "openclaw",
    agentId: "main",
    sessionUser: "command-center",
    status: "空闲",
    ...overrides,
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe("useRuntimeSnapshot", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hydrates runtime data, pending turns, and prompt history from the snapshot", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        model: "gpt-5",
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          fastMode: "已开启",
          status: "就绪",
        },
        conversation: [{ role: "user", content: "旧消息", timestamp: 100 }],
        files: [{ path: "src/App.jsx" }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 50,
        pendingTimestamp: 60,
        userMessage: {
          role: "user",
          content: "旧消息",
          timestamp: 55,
        },
      },
    };

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main");
      expect(result.current.availableModels).toEqual(["gpt-5"]);
      expect(result.current.files).toEqual([{ path: "src/App.jsx" }]);
    });

    expect(setFastMode).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setModel).toHaveBeenCalledWith("gpt-5");
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "旧消息", timestamp: 100 },
      { role: "assistant", content: "正在思考…", timestamp: 60, pending: true },
    ]);
    expect(setPromptHistoryByConversation).toHaveBeenCalled();
  });

  it("keeps a restored pending turn even when the runtime snapshot still reports completed", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        model: "openclaw",
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          fastMode: "关闭",
          status: "已完成",
        },
        conversation: [{ role: "user", content: "刷新后继续显示", timestamp: 100 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 100,
        pendingTimestamp: 101,
        userMessage: {
          role: "user",
          content: "刷新后继续显示",
          timestamp: 100,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main");
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "刷新后继续显示", timestamp: 100 },
      { role: "assistant", content: "正在思考…", timestamp: 101, pending: true },
    ]);
  });

  it("deduplicates the initial runtime request under StrictMode", async () => {
    const deferred = createDeferred();
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() => deferred.promise);

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(
      () =>
        useRuntimeSnapshot({
          activePendingChat: null,
          busy: false,
          i18n: createI18n(),
          messagesRef: { current: [] },
          pendingChatTurns: {},
          session: createSession(),
          setBusy,
          setFastMode,
          setMessagesSynced,
          setModel,
          setPendingChatTurns,
          setPromptHistoryByConversation,
          setSession,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main");
    });

    deferred.resolve(
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
        },
        conversation: [],
      }),
    );

    await waitFor(() => {
      expect(setModel).toHaveBeenCalledWith("openclaw");
    });
  });

  it("ignores a runtime snapshot that resolves to a stale DingTalk session after reset", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const resetSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058:reset:1773319871765","sendername":"马锐拉"}';
    const staleDingTalkSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: staleDingTalkSessionUser,
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        conversation: [{ role: "user", content: "旧钉钉消息", timestamp: 100 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns: {},
        session: createSession({ sessionUser: resetSessionUser }),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/runtime?${new URLSearchParams({ sessionUser: resetSessionUser, agentId: "main" }).toString()}`,
      );
    });

    expect(setMessagesSynced).not.toHaveBeenCalled();
    expect(setModel).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("posts session updates with the active session user and applies the returned snapshot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);

      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse({
          ok: true,
          session: {
            sessionUser: "command-center",
            agentId: "main",
            selectedModel: "gpt-5",
            availableModels: ["gpt-5"],
            availableAgents: ["main"],
          },
          conversation: [],
        });
      }

      if (url === "/api/session" && init?.method === "POST") {
        return mockJsonResponse({
          ok: true,
          model: "gpt-5.1",
          session: {
            sessionUser: "command-center",
            agentId: "main",
            selectedModel: "gpt-5.1",
            availableModels: ["gpt-5", "gpt-5.1"],
            availableAgents: ["main"],
          },
          conversation: [],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns: {},
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await result.current.updateSessionSettings({ model: "gpt-5.1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const sessionCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/session");
    expect(JSON.parse(sessionCall?.[1]?.body || "{}")).toMatchObject({ sessionUser: "command-center", model: "gpt-5.1" });

    expect(setModel).toHaveBeenCalledWith("gpt-5.1");
  });

  it("rehydrates pending bubbles with the latest locale placeholder", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "就绪",
        },
        conversation: [{ role: "user", content: "旧消息", timestamp: 100 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 50,
        pendingTimestamp: 60,
        userMessage: {
          role: "user",
          content: "旧消息",
          timestamp: 55,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        i18n: {
          ...createI18n(),
          chat: { thinkingPlaceholder: "考えています…" },
        },
        messagesRef: { current: [] },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setBusy).toHaveBeenCalledWith(true);
    });
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "旧消息", timestamp: 100 },
      { role: "assistant", content: "考えています…", timestamp: 60, pending: true },
    ]);
  });

  it("polls runtime more aggressively while recovering a restored pending turn", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "就绪",
        },
        conversation: [{ role: "user", content: "旧消息", timestamp: 100 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 50,
        pendingTimestamp: 60,
        userMessage: {
          role: "user",
          content: "旧消息",
          timestamp: 55,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it("polls DingTalk sessions more aggressively even while locally idle", () => {
    expect(
      getRuntimePollInterval({
        recoveringPendingReply: false,
        busy: false,
        activePendingChat: null,
        sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
      }),
    ).toBe(4000);
  });

  it("polls Feishu sessions more aggressively even while locally idle", () => {
    expect(
      getRuntimePollInterval({
        recoveringPendingReply: false,
        busy: false,
        activePendingChat: null,
        sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
      }),
    ).toBe(4000);
  });

  it("keeps the session in running state when the snapshot has an assistant reply but is still missing the current pending user message", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "待命",
        },
        conversation: [{ role: "assistant", content: "先给你几条新闻", timestamp: 220 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 200,
        pendingTimestamp: 220,
        userMessage: {
          role: "user",
          content: "给我看点新闻",
          timestamp: 200,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [{ role: "user", content: "给我看点新闻", timestamp: 200 }] },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        { role: "assistant", content: "先给你几条新闻", timestamp: 220 },
      ]);
    });

    expect(setBusy).not.toHaveBeenCalledWith(true);
    expect(setSession).not.toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "assistant", content: "先给你几条新闻", timestamp: 220 },
    ]);
  });

  it("keeps the just-sent user visible when the snapshot only has older assistant history", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "待命",
        },
        conversation: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 200,
        pendingTimestamp: 220,
        userMessage: {
          role: "user",
          content: "新问题",
          timestamp: 200,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { role: "user", content: "旧问题", timestamp: 100 },
            { role: "assistant", content: "旧回复", timestamp: 120 },
            { role: "user", content: "新问题", timestamp: 200 },
            { role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
          ],
        },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        { role: "user", content: "旧问题", timestamp: 100 },
        { role: "assistant", content: "旧回复", timestamp: 120 },
        { role: "user", content: "新问题", timestamp: 200 },
        { role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
  });

  it("preserves locally streamed assistant text while the runtime snapshot still lags behind", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "就绪",
        },
        conversation: [{ role: "user", content: "给我 Things", timestamp: 100 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 100,
        pendingTimestamp: 120,
        userMessage: {
          role: "user",
          content: "给我 Things",
          timestamp: 100,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { role: "user", content: "给我 Things", timestamp: 100 },
            { role: "assistant", content: "Things\n\n- 第一条", timestamp: 120 },
          ],
        },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setBusy).toHaveBeenCalledWith(true);
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "给我 Things", timestamp: 100 },
      { role: "assistant", content: "Things\n\n- 第一条", timestamp: 120 },
    ]);
  });

  it("clears a restored pending turn once the runtime snapshot already contains the final assistant reply", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "就绪",
        },
        conversation: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { role: "assistant", content: "总结好了", timestamp: 220 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 200,
        pendingTimestamp: 220,
        userMessage: {
          role: "user",
          content: "帮我总结",
          timestamp: 200,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [{ role: "user", content: "帮我总结", timestamp: 200 }] },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setBusy).toHaveBeenCalledWith(false);
    });

    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "就绪" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "帮我总结", timestamp: 200 },
      { role: "assistant", content: "总结好了", timestamp: 220 },
    ]);
    expect(setPendingChatTurns).toHaveBeenCalled();
  });

  it("clears a restored orphaned pending turn when the runtime is already idle and keeps the latest user turn visible", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "待命",
        },
        conversation: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        startedAt: 200,
        pendingTimestamp: 220,
        assistantMessageId: "msg-assistant-pending-1",
        userMessage: {
          role: "user",
          content: "新问题",
          timestamp: 200,
        },
      },
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: true,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { role: "user", content: "旧问题", timestamp: 100 },
            { role: "assistant", content: "旧回复", timestamp: 120 },
            { role: "user", content: "新问题", timestamp: 200 },
            { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 220, pending: true },
          ],
        },
        pendingChatTurns,
        session: createSession(),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        { role: "user", content: "旧问题", timestamp: 100 },
        { role: "assistant", content: "旧回复", timestamp: 120 },
        { role: "user", content: "新问题", timestamp: 200 },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(false);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "待命" }));
    expect(setPendingChatTurns).toHaveBeenCalled();
  });

  it("does not let an older runtime snapshot erase the latest local turn after a stream error", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "expert",
          selectedModel: "claude-opus-4.6",
          availableModels: ["claude-opus-4.6"],
          availableAgents: ["expert"],
          status: "就绪",
        },
        conversation: [
          { role: "user", content: "旧问题", timestamp: 100 },
          { role: "assistant", content: "旧回复", timestamp: 120 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { role: "user", content: "旧问题", timestamp: 100 },
            { role: "assistant", content: "旧回复", timestamp: 120 },
            { role: "user", content: "你昨天做了些什么？", timestamp: 200 },
            { role: "assistant", content: "我先查一下昨天的记录", timestamp: 220 },
          ],
        },
        pendingChatTurns: {},
        session: createSession({ agentId: "expert" }),
        setBusy,
        setFastMode,
        setMessagesSynced,
        setModel,
        setPendingChatTurns,
        setPromptHistoryByConversation,
        setSession,
      }),
    );

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        { role: "user", content: "旧问题", timestamp: 100 },
        { role: "assistant", content: "旧回复", timestamp: 120 },
        { role: "user", content: "你昨天做了些什么？", timestamp: 200 },
        { role: "assistant", content: "我先查一下昨天的记录", timestamp: 220 },
      ]);
    });
  });

  it("applies an in-flight runtime response using the latest stopped pending state", async () => {
    const deferredRuntime = createDeferred();
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const fetchMock = vi.fn(() => deferredRuntime.promise);

    vi.stubGlobal("fetch", fetchMock);

    const initialPendingChatTurns = {
      "command-center:main": {
        startedAt: 200,
        pendingTimestamp: 220,
        assistantMessageId: "msg-assistant-pending-1",
        userMessage: {
          role: "user",
          content: "帮我总结",
          timestamp: 200,
        },
      },
    };

    const { rerender } = renderHook(
      ({
        activePendingChat,
        messagesRef,
        pendingChatTurns,
      }) =>
        useRuntimeSnapshot({
          activePendingChat,
          busy: false,
          i18n: createI18n(),
          messagesRef,
          pendingChatTurns,
          session: createSession(),
          setBusy,
          setFastMode,
          setMessagesSynced,
          setModel,
          setPendingChatTurns,
          setPromptHistoryByConversation,
          setSession,
        }),
      {
        initialProps: {
          activePendingChat: initialPendingChatTurns["command-center:main"],
          messagesRef: {
            current: [
              { role: "user", content: "帮我总结", timestamp: 200 },
              { id: "msg-assistant-pending-1", role: "assistant", content: "已停止", timestamp: 220 },
            ],
          },
          pendingChatTurns: initialPendingChatTurns,
        },
      },
    );

    const stoppedPendingChatTurns = {
      "command-center:main": {
        ...initialPendingChatTurns["command-center:main"],
        stopped: true,
        stoppedAt: 250,
        suppressPendingPlaceholder: true,
      },
    };

    rerender({
      activePendingChat: stoppedPendingChatTurns["command-center:main"],
      messagesRef: {
        current: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "已停止", timestamp: 220 },
        ],
      },
      pendingChatTurns: stoppedPendingChatTurns,
    });

    deferredRuntime.resolve(
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "就绪",
        },
        conversation: [
          { role: "user", content: "帮我总结", timestamp: 200 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "这是完整回复", timestamp: 220 },
        ],
      }),
    );

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        { role: "user", content: "帮我总结", timestamp: 200 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "已停止", timestamp: 220 },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(false);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "就绪" }));
  });
});
