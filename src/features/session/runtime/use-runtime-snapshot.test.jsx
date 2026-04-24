import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRuntimeSnapshot } from "@/features/session/runtime";
import { getRuntimePollInterval, mergeRuntimeFiles } from "@/features/session/runtime/use-runtime-snapshot";
import { RUNTIME_SOCKET_STATES } from "./use-runtime-socket";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }

  send() {}

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }
}

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
  let originalWebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.WebSocket = originalWebSocket;
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main", { credentials: "same-origin" });
      expect(result.current.availableModels).toEqual(["gpt-5"]);
      expect(result.current.files).toEqual([
        expect.objectContaining({ path: "src/App.jsx" }),
      ]);
    });

    expect(setFastMode).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setModel).toHaveBeenCalledWith("gpt-5");
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "旧消息", timestamp: 100 },
    ]);
    expect(setPromptHistoryByConversation).toHaveBeenCalled();
  });

  it("supplements availableAgents from explicitly installed runtime agents", async () => {
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
        agents: [
          { agentId: "hermes", installed: true },
        ],
        conversation: [],
      }),
    );

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

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual(["main", "hermes"]);
    });
  });

  it("keeps derived installed agents available when snapshots omit availableAgents", async () => {
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
          status: "就绪",
        },
        agents: [
          { agentId: "hermes", installed: true },
        ],
        conversation: [],
      }),
    );

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

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual(["hermes"]);
    });

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.simulateOpen();
      socket.onmessage?.({
        data: JSON.stringify({
          type: "agents.sync",
          agents: [
            { agentId: "hermes", installed: true },
            { agentId: "writer", installed: true },
          ],
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual(["hermes", "writer"]);
    });
  });

  it("keeps websocket availableAgents aligned with agents.sync updates and still clears explicit empty updates", async () => {
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
        agents: [],
        conversation: [],
      }),
    );

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

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual(["main"]);
    });

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.simulateOpen();
      socket.onmessage?.({
        data: JSON.stringify({
          type: "agents.sync",
          agents: [
            { agentId: "hermes", installed: true },
          ],
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual(["main", "hermes"]);
    });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "session.sync",
          session: {
            sessionUser: "command-center",
            agentId: "main",
            availableAgents: [],
            status: "就绪",
          },
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual([]);
    });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "agents.sync",
          agents: [
            { agentId: "hermes", installed: true },
          ],
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.availableAgents).toEqual([]);
    });
  });

  it("preserves previously detected files when a later snapshot temporarily reports no files", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const initialSnapshot = {
      ok: true,
      session: {
        sessionUser: "agent:main:wecom:direct:marila",
        agentId: "main",
        selectedModel: "gpt-5",
        availableModels: ["gpt-5"],
        availableAgents: ["main"],
        status: "空闲",
      },
      files: [
        {
          path: "/Users/marila/.openclaw/workspace/HEARTBEAT.md",
          fullPath: "/Users/marila/.openclaw/workspace/HEARTBEAT.md",
          kind: "文件",
          primaryAction: "viewed",
          observedAt: 100,
          updatedAt: 90,
        },
      ],
      conversation: [],
    };
    const fetchMock = vi.fn(() => mockJsonResponse(initialSnapshot));

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns: {},
        session: createSession({
          mode: "openclaw",
          sessionUser: "agent:main:wecom:direct:marila",
        }),
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
      expect(result.current.files).toHaveLength(1);
    });

    result.current.applySnapshot({
      session: {
        sessionUser: "agent:main:wecom:direct:marila",
        agentId: "main",
        selectedModel: "gpt-5",
        availableModels: ["gpt-5"],
        availableAgents: ["main"],
        status: "空闲",
      },
      files: [],
      conversation: [],
    });

    expect(result.current.files).toEqual([
      expect.objectContaining(initialSnapshot.files[0]),
    ]);
  });

  it("preserves existing tool calls when a later timeline update for the same run omits them", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const initialTool = {
      id: "tool-edit-1",
      name: "edit_file",
      status: "完成",
      input: '{"file":"README.md"}',
      output: "ok",
      timestamp: 1010,
    };
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        taskTimeline: [
          {
            id: "run-tool-preserve-1",
            timestamp: 1000,
            prompt: "继续执行",
            status: "进行中",
            toolsSummary: "edit_file(完成)",
            tools: [initialTool],
            outcome: "执行中",
          },
        ],
        conversation: [],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns: {},
        session: createSession({ mode: "openclaw" }),
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
      expect(result.current.taskTimeline).toEqual([
        expect.objectContaining({
          id: "run-tool-preserve-1",
          tools: [expect.objectContaining(initialTool)],
        }),
      ]);
    });

    act(() => {
      result.current.applySnapshot({
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "已完成",
        },
        taskTimeline: [
          {
            id: "run-tool-preserve-1",
            timestamp: 1000,
            prompt: "继续执行",
            status: "已完成",
            toolsSummary: "",
            tools: [],
            outcome: "执行完成",
          },
        ],
        conversation: [],
      });
    });

    expect(result.current.taskTimeline).toEqual([
      expect.objectContaining({
        id: "run-tool-preserve-1",
        status: "已完成",
        outcome: "执行完成",
        tools: [expect.objectContaining(initialTool)],
      }),
    ]);
  });

  it("trusts an empty idle snapshot over a stale settled local tail for fresh reset sessions", async () => {
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
          sessionUser: "command-center-reset-main-1",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "待命",
        },
        conversation: [],
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
            { id: "msg-user-1", role: "user", content: "旧消息", timestamp: 100 },
            { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
          ],
        },
        pendingChatTurns: {},
        session: createSession({
          sessionUser: "command-center-reset-main-1",
          updatedLabel: "刚刚重置",
        }),
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center-reset-main-1&agentId=main", { credentials: "same-origin" });
    });

    expect(setMessagesSynced).toHaveBeenCalledWith([]);
    expect(setBusy).toHaveBeenCalledWith(false);
  });

  it("uses the provided IM runtime anchor for polling instead of the last resolved native session user", async () => {
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
          sessionUser: "agent:main:wecom:group:project-room",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [{ role: "assistant", content: "群聊最新消息", timestamp: 100 }],
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
        runtimeSessionUser: "wecom:direct:default",
        session: createSession({
          mode: "openclaw",
          sessionUser: "agent:main:wecom:direct:marila",
        }),
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=wecom%3Adirect%3Adefault&agentId=main", { credentials: "same-origin" });
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("/api/runtime/ws");
    expect(MockWebSocket.instances[0].url).toContain("sessionUser=wecom%3Adirect%3Adefault");
    expect(MockWebSocket.instances[0].url).toContain("agentId=main");
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main", { credentials: "same-origin" });
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "刷新后继续显示", timestamp: 100 },
    ]);
  });

  it("does not clear busy on session.sync idle while a local pending turn is still active", async () => {
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
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        conversation: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收", timestamp: 1050, streaming: true },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: {
          key: "command-center:main",
          startedAt: 1000,
          pendingTimestamp: 1050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
        },
        busy: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
            { id: "msg-assistant-pending-1", role: "assistant", content: "收", timestamp: 1050, streaming: true },
          ],
        },
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 1000,
            pendingTimestamp: 1050,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          },
        },
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
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.simulateOpen();
    socket.onmessage?.({
      data: JSON.stringify({
        type: "session.sync",
        session: {
          sessionUser: "command-center",
          agentId: "main",
          status: "空闲",
        },
      }),
    });

    expect(setBusy).toHaveBeenLastCalledWith(true);
  });

  it("does not keep busy on session.sync idle when only a stale local streaming flag remains from an older turn", async () => {
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
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        conversation: [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 1000 },
          { id: "msg-assistant-1", role: "assistant", content: "半截旧回复", timestamp: 1050 },
          { id: "msg-user-2", role: "user", content: "后续问题", timestamp: 1100 },
          { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 1150 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 1000 },
            { id: "msg-assistant-1", role: "assistant", content: "半截旧回复", timestamp: 1050, streaming: true },
            { id: "msg-user-2", role: "user", content: "后续问题", timestamp: 1100 },
            { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 1150 },
          ],
        },
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

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.simulateOpen();
    socket.onmessage?.({
      data: JSON.stringify({
        type: "session.sync",
        session: {
          sessionUser: "command-center",
          agentId: "main",
          status: "空闲",
        },
      }),
    });

    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it("does not re-enter busy on session.sync running after a local command-center turn already settled", async () => {
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
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          { id: "msg-assistant-1", role: "assistant", content: "已经完成", timestamp: 1050 },
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
            { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
            { id: "msg-assistant-1", role: "assistant", content: "已经完成", timestamp: 1050 },
          ],
        },
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

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.simulateOpen();
      socket.onmessage?.({
        data: JSON.stringify({
          type: "session.sync",
          session: {
            sessionUser: "command-center",
            agentId: "main",
            status: "运行中",
          },
        }),
      });
    });

    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it("does not settle a local streaming assistant when conversation.sync only carries a partial assistant snapshot", async () => {
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
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        conversation: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "收", timestamp: 1050, streaming: true },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: {
          key: "command-center:main",
          startedAt: 1000,
          pendingTimestamp: 1050,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
        },
        busy: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
            { id: "msg-assistant-pending-1", role: "assistant", content: "收到更多", timestamp: 1050, streaming: true },
          ],
        },
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 1000,
            pendingTimestamp: 1050,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
          },
        },
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
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.simulateOpen();

    setBusy.mockClear();
    setMessagesSynced.mockClear();
    setPendingChatTurns.mockClear();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "conversation.sync",
        conversation: [
          { role: "user", content: "继续", timestamp: 1000 },
          { role: "assistant", content: "收到。", timestamp: 1060 },
        ],
      }),
    });

    await waitFor(() => {
      expect(setBusy).toHaveBeenLastCalledWith(true);
      expect(setMessagesSynced).toHaveBeenCalled();
    });

    expect(setPendingChatTurns).not.toHaveBeenCalled();
    expect(setMessagesSynced).toHaveBeenLastCalledWith([
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
    ]);
  });

  it("keeps a restored partial assistant busy after refresh until the runtime stream stabilizes", async () => {
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
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [
          { role: "user", content: "刷新后继续生成", timestamp: 100 },
          { role: "assistant", content: "第一段", timestamp: 101 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 101,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
        },
        busy: true,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
            {
              id: "msg-assistant-pending-1",
              role: "assistant",
              content: "第一段",
              timestamp: 101,
            },
          ],
        },
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 100,
            pendingTimestamp: 101,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
          },
        },
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
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(setBusy).toHaveBeenLastCalledWith(true);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
      {
        id: "msg-assistant-pending-1",
        role: "assistant",
        content: "第一段",
        timestamp: 101,
      },
    ]);
  });

  it("settles a restored streaming assistant after the runtime delivers a stable final snapshot", async () => {
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
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [
          { role: "user", content: "刷新后继续生成", timestamp: 100 },
          { role: "assistant", content: "第一段", timestamp: 101 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 101,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
        },
        busy: true,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
            {
              id: "msg-assistant-pending-1",
              role: "assistant",
              content: "第一段",
              timestamp: 101,
            },
          ],
        },
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 100,
            pendingTimestamp: 101,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
          },
        },
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
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.simulateOpen();

    setBusy.mockClear();
    setPendingChatTurns.mockClear();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "conversation.sync",
        conversation: [
          { role: "user", content: "刷新后继续生成", timestamp: 100 },
          { role: "assistant", content: "第一段，第二段", timestamp: 101 },
        ],
      }),
    });

    await waitFor(() => {
      expect(setBusy).toHaveBeenLastCalledWith(true);
    });

    socket.onmessage?.({
      data: JSON.stringify({
        type: "session.sync",
        session: {
          sessionUser: "command-center",
          agentId: "main",
          status: "空闲",
        },
      }),
    });

    socket.onmessage?.({
      data: JSON.stringify({
        type: "conversation.sync",
        conversation: [
          { role: "user", content: "刷新后继续生成", timestamp: 100 },
          { role: "assistant", content: "第一段，第二段", timestamp: 101 },
        ],
      }),
    });

    await waitFor(() => {
      expect(setBusy).toHaveBeenLastCalledWith(false);
      expect(setPendingChatTurns).toHaveBeenCalled();
    });
  });

  it("applies runtime snapshots that resolve an IM bootstrap session to the latest real session", async () => {
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
          sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          fastMode: "关闭",
          status: "就绪",
        },
        conversation: [],
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
        session: createSession({ sessionUser: "feishu:direct:default" }),
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=feishu%3Adirect%3Adefault&agentId=main", { credentials: "same-origin" });
      expect(setSession).toHaveBeenCalledWith(expect.objectContaining({
        sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
      }));
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("sessionUser=feishu%3Adirect%3Adefault");
  });

  it("opens runtime WebSocket subscriptions for native IM sessions", async () => {
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
          sessionUser: "agent:main:wecom:direct:marila",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [],
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
        session: createSession({
          mode: "openclaw",
          sessionUser: "agent:main:wecom:direct:marila",
        }),
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=agent%3Amain%3Awecom%3Adirect%3Amarila&agentId=main", { credentials: "same-origin" });
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("sessionUser=agent%3Amain%3Awecom%3Adirect%3Amarila");
    expect(MockWebSocket.instances[0].url).toContain("agentId=main");
  });

  it("keeps the recovered pending turn stable when the snapshot repeats the prompt and returns an outline-heavy assistant reply", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const prompt = "把这次切换整理成大纲";
    const outlineReply = [
      "一、保留当前 user turn",
      "- 不让用户消息消失",
      "- 不重复插入同一条 in-flight turn",
      "",
      "二、保留 assistant 输出稳定",
      "- 结构化大纲也只渲染一次",
      "- 收口后再清掉 pending 状态",
    ].join("\n");
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [
          { role: "user", content: prompt, timestamp: 100 },
          { role: "user", content: prompt, timestamp: 101 },
          { role: "assistant", content: outlineReply, timestamp: 120 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 120,
          assistantMessageId: "msg-assistant-pending-1",
          userMessage: {
            id: "msg-user-1",
            role: "user",
            content: prompt,
            timestamp: 100,
          },
        },
        busy: true,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: prompt, timestamp: 100 },
            { id: "msg-assistant-pending-1", role: "assistant", content: "一、保留当前 user turn", timestamp: 120, streaming: true },
          ],
        },
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 100,
            pendingTimestamp: 120,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: {
              id: "msg-user-1",
              role: "user",
              content: prompt,
              timestamp: 100,
            },
          },
        },
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main", { credentials: "same-origin" });
      expect(setMessagesSynced).toHaveBeenCalled();
    });

    const syncedMessages = setMessagesSynced.mock.calls.at(-1)?.[0] || [];
    expect(syncedMessages.filter((message) => message?.role === "user")).toHaveLength(1);
    expect(syncedMessages.filter((message) => message?.role === "assistant")).toHaveLength(1);
    expect(syncedMessages[0]).toMatchObject({
      role: "user",
      content: prompt,
    });
    expect(syncedMessages[1]).toMatchObject({
      role: "assistant",
      content: outlineReply,
    });
    expect(setBusy).toHaveBeenLastCalledWith(true);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
  });

  it("preserves recovered pending progress fields while the authoritative snapshot still has only the echoed user turn", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const prompt = "继续帮我处理这个恢复中的会话";
    let pendingState = {
      "command-center:main": {
        key: "command-center:main",
        startedAt: 100,
        pendingTimestamp: 120,
        assistantMessageId: "msg-assistant-progress-1",
        progressStage: "executing",
        progressLabel: "执行命令…",
        progressUpdatedAt: 456,
        userMessage: {
          id: "msg-user-progress-1",
          role: "user",
          content: prompt,
          timestamp: 100,
        },
      },
    };
    const setPendingChatTurns = vi.fn((value) => {
      pendingState = typeof value === "function" ? value(pendingState) : value;
    });
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        conversation: [
          { id: "msg-user-progress-1", role: "user", content: prompt, timestamp: 100 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 120,
          assistantMessageId: "msg-assistant-progress-1",
          progressStage: "executing",
          progressLabel: "执行命令…",
          progressUpdatedAt: 456,
          userMessage: {
            id: "msg-user-progress-1",
            role: "user",
            content: prompt,
            timestamp: 100,
          },
        },
        busy: false,
        recoveringPendingReply: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-progress-1", role: "user", content: prompt, timestamp: 100 },
          ],
        },
        pendingChatTurns: pendingState,
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
      expect(setMessagesSynced).toHaveBeenCalled();
    });

    const syncedMessages = setMessagesSynced.mock.calls.at(-1)?.[0] || [];
    expect(syncedMessages).toHaveLength(1);
    expect(syncedMessages[0]).toMatchObject({
      role: "user",
      content: prompt,
    });
    expect(pendingState["command-center:main"]).toMatchObject({
      assistantMessageId: "msg-assistant-progress-1",
      progressStage: "executing",
      progressLabel: "执行命令…",
      progressUpdatedAt: 456,
    });
    expect(setBusy).toHaveBeenLastCalledWith(true);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
  });

  it("shows a fresh thinking placeholder when an IM runtime snapshot ends on a synced user message", async () => {
    const setBusy = vi.fn();
    const setFastMode = vi.fn();
    const setMessagesSynced = vi.fn();
    const setModel = vi.fn();
    const setPendingChatTurns = vi.fn();
    const setPromptHistoryByConversation = vi.fn();
    const setSession = vi.fn();
    const sessionUser = "agent:main:openclaw-weixin:direct:marila";
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser,
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
        },
        conversation: [
          { role: "assistant", content: "在。你说。", timestamp: 100 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [{ role: "assistant", content: "在。你说。", timestamp: 100 }] },
        pendingChatTurns: {},
        session: createSession({
          mode: "openclaw",
          sessionUser,
        }),
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
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const socket = MockWebSocket.instances[0];
    socket.simulateOpen();

    setBusy.mockClear();
    setMessagesSynced.mockClear();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "runtime.snapshot",
        session: {
          sessionUser,
          agentId: "main",
          status: "运行中",
        },
        conversation: [
          { role: "assistant", content: "在。你说。", timestamp: 100 },
          { id: "msg-user-2", role: "user", content: "菠菜", timestamp: 200 },
        ],
      }),
    });

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenLastCalledWith([
        { role: "assistant", content: "在。你说。", timestamp: 100 },
        { id: "msg-user-2", role: "user", content: "菠菜", timestamp: 200 },
      ]);
      expect(setBusy).toHaveBeenLastCalledWith(true);
    });
  });

  it("exposes runtime socket state and transport mode", async () => {
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
        conversation: [],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: [] },
        pendingChatTurns: {},
        session: createSession({
          mode: "openclaw",
        }),
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
      expect(fetchMock).toHaveBeenCalled();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    expect(result.current.runtimeSocketStatus).toBe(RUNTIME_SOCKET_STATES.CONNECTING);
    expect(result.current.runtimeTransport).toBe("polling");

    MockWebSocket.instances[0].simulateOpen();

    await waitFor(() => {
      expect(result.current.runtimeSocketStatus).toBe(RUNTIME_SOCKET_STATES.CONNECTED);
      expect(result.current.runtimeTransport).toBe("ws");
    });
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main", { credentials: "same-origin" });
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
        { credentials: "same-origin" },
      );
    });

    expect(setMessagesSynced).not.toHaveBeenCalled();
    expect(setModel).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("includes the persisted hermes session id when loading a hermes runtime snapshot", async () => {
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
          sessionUser: "command-center-hermes",
          agentId: "hermes",
          selectedModel: "gpt-5.4",
          availableModels: ["gpt-5.4"],
          availableAgents: ["main", "hermes"],
        },
        conversation: [],
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
        session: createSession({
          mode: "hermes",
          agentId: "hermes",
          sessionUser: "command-center-hermes",
          hermesSessionId: "hermes-session-42",
        }),
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
        `/api/runtime?${new URLSearchParams({
          sessionUser: "command-center-hermes",
          agentId: "hermes",
          hermesSessionId: "hermes-session-42",
        }).toString()}`,
        { credentials: "same-origin" },
      );
    });
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
        { role: "user", content: "给我看点新闻", timestamp: 200 },
        { role: "assistant", content: "先给你几条新闻", timestamp: 220 },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "给我看点新闻", timestamp: 200 },
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
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ status: "运行中" }));
  });

  it("keeps the local settled assistant reply and clears the pending turn when the snapshot still lags behind", async () => {
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
          { role: "user", content: "新问题", timestamp: 200 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        key: "command-center:main",
        startedAt: 200,
        pendingTimestamp: 220,
        assistantMessageId: "msg-assistant-final-1",
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
            { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
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
        { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(false);
    expect(setPendingChatTurns).toHaveBeenCalled();
  });

  it("keeps the pending turn tracked when the local settled assistant reply arrives before the snapshot echoes the user turn", async () => {
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
          { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        key: "command-center:main",
        startedAt: 200,
        pendingTimestamp: 220,
        assistantMessageId: "msg-assistant-final-1",
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
            { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
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
        { id: "msg-assistant-final-1", role: "assistant", content: "第一条已完成", timestamp: 220 },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
  });

  it("keeps the pending turn tracked while the controller is still busy even after the snapshot already contains the final assistant reply", async () => {
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
          { role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-final-2", role: "assistant", content: "第二条已完成", timestamp: 220 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        key: "command-center:main",
        startedAt: 200,
        pendingTimestamp: 220,
        assistantMessageId: "msg-assistant-final-2",
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
        i18n: createI18n(),
        messagesRef: {
          current: [
            { role: "user", content: "旧问题", timestamp: 100 },
            { role: "assistant", content: "旧回复", timestamp: 120 },
            { role: "user", content: "新问题", timestamp: 200 },
          ],
        },
        pendingChatTurns,
        session: createSession({
          status: "运行中",
        }),
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
        { id: "msg-assistant-final-2", role: "assistant", content: "第二条已完成", timestamp: 220 },
      ]);
    });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setPendingChatTurns).not.toHaveBeenCalled();
  });

  it("keeps the latest local user-assistant turn stable when a snapshot temporarily omits the user", async () => {
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
        conversation: [],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const localMessages = [
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
      { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 1100 },
    ];

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: null,
        busy: false,
        i18n: createI18n(),
        messagesRef: { current: localMessages },
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

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    result.current.applySnapshot({
      session: {
        sessionUser: "command-center",
        agentId: "main",
        selectedModel: "gpt-5",
        availableModels: ["gpt-5"],
        availableAgents: ["main"],
        status: "待命",
      },
      conversation: [{ role: "assistant", content: "收到。", timestamp: 1200 }],
    });

    expect(setMessagesSynced).toHaveBeenLastCalledWith([
      { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
      { id: "msg-assistant-1", role: "assistant", content: "收到。", timestamp: 1100 },
    ]);
  });

  it("keeps the current user visible when the pending card disappears before the snapshot includes that user", async () => {
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
        conversation: [{ role: "assistant", content: "收到。", timestamp: 1100 }],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        key: "command-center:main",
        startedAt: 1000,
        pendingTimestamp: 1050,
        assistantMessageId: "msg-assistant-pending-1",
        userMessage: {
          id: "msg-user-1",
          role: "user",
          content: "1",
          timestamp: 1000,
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
            { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
            { id: "msg-assistant-pending-1", role: "assistant", content: "正在思考…", timestamp: 1050, pending: true },
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
        { id: "msg-user-1", role: "user", content: "1", timestamp: 1000 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "收到。", timestamp: 1050 },
      ]);
    });
  });

  it("produces one synced conversation for the same pending turn across local state and snapshot assistant reply", async () => {
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
        conversation: [],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingEntry = {
      key: "command-center:main",
      startedAt: 10,
      pendingTimestamp: 11,
      assistantMessageId: "assistant-1",
      userMessage: {
        id: "msg-user-1",
        role: "user",
        content: "hello",
        timestamp: 10,
      },
    };

    const { result } = renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingEntry,
        busy: true,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "hello", timestamp: 10 },
          ],
        },
        pendingChatTurns: {
          "command-center:main": pendingEntry,
        },
        session: createSession({
          status: "运行中",
        }),
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center&agentId=main", { credentials: "same-origin" });
    });

    setMessagesSynced.mockClear();

    act(() => {
      result.current.applySnapshot({
        session: {
          sessionUser: "command-center",
          agentId: "main",
          selectedModel: "gpt-5",
          availableModels: ["gpt-5"],
          availableAgents: ["main"],
          status: "待命",
        },
        conversation: [{ id: "assistant-1", role: "assistant", content: "done", timestamp: 11 }],
      });
    });

    expect(setMessagesSynced).toHaveBeenLastCalledWith([
      { id: "msg-user-1", role: "user", content: "hello", timestamp: 10 },
      { id: "assistant-1", role: "assistant", content: "done", timestamp: 11 },
    ]);
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

  it("clears a recovered pending turn once the authoritative snapshot has already advanced to a later user turn", async () => {
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
          { role: "user", content: "新问题", timestamp: 200 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "总结好了", timestamp: 220 },
          { role: "user", content: "继续说", timestamp: 240 },
          { role: "assistant", content: "后续回复", timestamp: 260 },
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
            { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 220 },
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
        { id: "msg-assistant-pending-1", role: "assistant", content: "总结好了", timestamp: 220 },
        { role: "user", content: "继续说", timestamp: 240 },
        { role: "assistant", content: "后续回复", timestamp: 260 },
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

  it("keeps only the longer local assistant reply when the runtime snapshot replays a shorter version of the same pending turn", async () => {
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
          { role: "user", content: "发0.5.4", timestamp: 100 },
          { role: "assistant", content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。", timestamp: 120 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const pendingChatTurns = {
      "command-center:main": {
        key: "command-center:main",
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
    };

    renderHook(() =>
      useRuntimeSnapshot({
        activePendingChat: pendingChatTurns["command-center:main"],
        busy: false,
        i18n: createI18n(),
        messagesRef: {
          current: [
            { id: "msg-user-1", role: "user", content: "发0.5.4", timestamp: 100 },
            {
              role: "assistant",
              content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
              timestamp: 120,
            },
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
        { id: "msg-user-1", role: "user", content: "发0.5.4", timestamp: 100 },
        {
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
          timestamp: 120,
        },
      ]);
    });
  });

  it("keeps the longer settled local assistant reply when a lagging runtime snapshot replays a shorter prefix after the turn already settled", async () => {
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
          { role: "user", content: "发0.5.4", timestamp: 100 },
          { role: "assistant", content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。", timestamp: 120 },
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
            { id: "msg-user-1", role: "user", content: "发0.5.4", timestamp: 100 },
            {
              id: "msg-assistant-1",
              role: "assistant",
              content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
              timestamp: 120,
            },
          ],
        },
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

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        { id: "msg-user-1", role: "user", content: "发0.5.4", timestamp: 100 },
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: "行，我直接把版本提到 0.5.4，然后按规范走一遍。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
          timestamp: 120,
        },
      ]);
    });
  });
});

describe("mergeRuntimeFiles", () => {
  it("keeps higher-priority file actions while merging repeated file snapshots", () => {
    expect(
      mergeRuntimeFiles(
        [{ fullPath: "/tmp/a.md", path: "/tmp/a.md", primaryAction: "created", actions: ["created"], observedAt: 10, updatedAt: 10 }],
        [{ fullPath: "/tmp/a.md", path: "/tmp/a.md", primaryAction: "viewed", actions: ["viewed"], observedAt: 20, updatedAt: 20 }],
      ),
    ).toEqual([
      {
        fullPath: "/tmp/a.md",
        path: "/tmp/a.md",
        primaryAction: "created",
        actions: ["created", "viewed"],
        observedAt: 20,
        updatedAt: 20,
      },
    ]);
  });
});
