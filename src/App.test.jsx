import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { TaskRelationshipsPanel } from "@/App";
import { I18nProvider } from "@/lib/i18n";
import { localeStorageKey } from "@/lib/i18n";

const storageKey = "command-center-ui-state-v2";
const currentStorageKey = "command-center-ui-state-v3";
const pendingChatStorageKey = "command-center-pending-chat-v1";
const chatScrollStorageKey = "command-center-chat-scroll-v1";
const promptDraftStorageKey = "command-center-prompt-drafts-v1";
const defaultPromptPlaceholder = "💡 想要和 main 一起做点什么？";

function createSnapshot(overrides = {}) {
  return {
    ok: true,
    mode: "openclaw",
    model: "openclaw",
    session: {
      mode: "openclaw",
      model: "openclaw",
      selectedModel: "openclaw",
      agentId: "main",
      selectedAgentId: "main",
      sessionUser: "command-center",
      sessionKey: "agent:main:openai-user:command-center",
      workspaceRoot: "/Users/marila/.openclaw/workspace",
      status: "空闲",
      fastMode: "关闭",
      contextUsed: 0,
      contextMax: 16000,
      contextDisplay: "0 / 16000",
      runtime: "online",
      queue: "none",
      updatedLabel: "刚刚",
      tokens: "0 in / 0 out",
      auth: "",
      time: "10:00:00",
      availableModels: ["openclaw"],
      availableAgents: ["main"],
    },
    taskTimeline: [],
    taskRelationships: [],
    files: [],
    artifacts: [],
    snapshots: [],
    agents: [],
    peeks: { workspace: null, terminal: null, browser: null },
    ...overrides,
  };
}

function mockJsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
  });
}

function stubFetchWithAccessState(fetchImpl) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      if (String(input) === "/api/auth/state") {
        return mockJsonResponse({
          ok: true,
          accessMode: "off",
          authenticated: true,
        });
      }
      try {
        return await fetchImpl(input, init);
      } catch (error) {
        if (String(input) === "/api/lalaclaw/update") {
          return mockJsonResponse({
            ok: true,
            currentVersion: "2026.3.20-1",
            currentRelease: { version: "2026.3.20-1", stable: true },
            targetRelease: { version: "2026.3.20-1", stable: true },
            stableTag: "stable",
            updateAvailable: false,
            capability: { installKind: "npm-package", restartMode: "manual", updateSupported: true, reason: "" },
            check: { ok: true, scope: "stable", checkedAt: 1, errorCode: "", error: "" },
            job: { active: false, status: "idle", targetVersion: "", currentVersionAtStart: "", startedAt: 0, finishedAt: 0, errorCode: "", error: "" },
          });
        }
        throw error;
      }
    }),
  );
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

function createSessionSnapshot(sessionUser = "command-center") {
  const snapshot = createSnapshot();
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      sessionUser,
      sessionKey: `agent:main:openai-user:${sessionUser}`,
    },
  };
}

function createInteractiveFetchMock({
  agentId = "main",
  availableAgents = ["main"],
  availableModels = ["openclaw"],
  model = "openclaw",
  sessionUser = "command-center",
  thinkMode = "off",
  agentModels = {},
} = {}) {
  const state = {
    agentId,
    availableAgents,
    availableModels,
    fastMode: false,
    model,
    sessionUser,
    thinkMode,
  };
  const sessionUpdates = [];
  const chatBodies = [];

  const buildSnapshot = (overrides = {}, runtimeState = {}) =>
    createSnapshot({
      model: runtimeState.model || state.model,
      session: {
        ...createSnapshot().session,
        agentId: runtimeState.agentId || state.agentId,
        selectedAgentId: runtimeState.agentId || state.agentId,
        availableAgents: state.availableAgents,
        availableModels: state.availableModels,
        fastMode: (typeof runtimeState.fastMode === "boolean" ? runtimeState.fastMode : state.fastMode) ? "已开启" : "已关闭",
        model: runtimeState.model || state.model,
        selectedModel: runtimeState.model || state.model,
        sessionKey: `agent:${runtimeState.agentId || state.agentId}:openai-user:${runtimeState.sessionUser || state.sessionUser}`,
        sessionUser: runtimeState.sessionUser || state.sessionUser,
        thinkMode: runtimeState.thinkMode || state.thinkMode,
      },
      ...overrides,
    });

  const fetchMock = vi.fn(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/runtime")) {
      const params = new URL(url, "http://localhost").searchParams;
      const runtimeAgentId = params.get("agentId") || state.agentId;
      const runtimeModel = params.get("model") || agentModels[runtimeAgentId] || state.model;
      const runtimeFastMode = params.has("fastMode") ? params.get("fastMode") === "1" : state.fastMode;
      const runtimeThinkMode = params.get("thinkMode") || state.thinkMode;
      const runtimeSessionUser = params.get("sessionUser") || state.sessionUser;
      return mockJsonResponse(
        buildSnapshot({}, {
          agentId: runtimeAgentId,
          fastMode: runtimeFastMode,
          model: runtimeModel,
          sessionUser: runtimeSessionUser,
          thinkMode: runtimeThinkMode,
        }),
      );
    }

    if (url === "/api/session" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      sessionUpdates.push(body);

      if (body.sessionUser) {
        state.sessionUser = body.sessionUser;
      }

      if (body.agentId) {
        state.agentId = body.agentId;
        state.model = agentModels[body.agentId] || body.model || state.model;
      }

      if (body.model) {
        state.model = body.model;
      }

      if (typeof body.fastMode === "boolean") {
        state.fastMode = body.fastMode;
      }

      if (typeof body.thinkMode === "string") {
        state.thinkMode = body.thinkMode;
      }

      return mockJsonResponse(buildSnapshot());
    }

    if (url === "/api/chat" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      chatBodies.push(body);

       if (body.sessionUser) {
        state.sessionUser = body.sessionUser;
      }

      if (body.agentId) {
        state.agentId = body.agentId;
        state.model = agentModels[body.agentId] || body.model || state.model;
      }

      if (body.model) {
        state.model = body.model;
      }

      if (typeof body.fastMode === "boolean") {
        state.fastMode = body.fastMode;
      }

      return mockJsonResponse({
        ...buildSnapshot(),
        outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
        metadata: { status: body.fastMode ? "已完成 / 快速" : "已完成 / 标准" },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  return {
    chatBodies,
    fetchMock,
    sessionUpdates,
  };
}

function getNormalizedBodyText() {
  return document.body.textContent?.replace(/\s+/g, "") || "";
}

function hasAncestorClass(node, className) {
  let current = node;
  while (current) {
    if (typeof current.className === "string" && current.className.includes(className)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function mockDesktopLayout(width = 1200) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: true,
      media: "(min-width: 1280px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback([{ contentRect: { width } }]);
    }

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
}

function mockNarrowLayout() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(min-width: 1280px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

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
    this.onopen?.();
  }

  simulateMessage(payload) {
    this.onmessage?.({
      data: JSON.stringify(payload),
    });
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

function hasMessageText(text, role = "") {
  const selector = role ? `[data-message-role="${role}"]` : "[data-message-role]";
  const expectedText = String(text || "").trim();
  return Array.from(document.querySelectorAll(selector)).some((node) =>
    String(node.textContent || "").includes(expectedText),
  );
}

describe("App", () => {
  let originalWebSocket;

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(localeStorageKey, "zh");
    vi.stubGlobal("confirm", vi.fn(() => true));
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  async function waitForAgentSwitcherReady() {
    await screen.findByText("main - 当前会话");
    await waitFor(() => {
      expect(screen.getByLabelText("切换 Agent")).toBeEnabled();
    });
  }

  it("loads runtime data and sends a chat message", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({
          ...openClawSnapshot,
          outputText: "任务已完成。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox"), "帮我检查状态");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(hasMessageText("帮我检查状态", "user")).toBe(true);
      expect(hasMessageText("任务已完成。", "assistant")).toBe(true);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    });
  }, 10_000);

  it("shows the runtime transport status in the session overview", async () => {
    const fetchMock = vi.fn((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    expect(await screen.findByText("轮询 / 连接中")).toBeInTheDocument();
  });

  it("keeps the full app interactive after switching to a non-Chinese locale", async () => {
    const fetchMock = vi.fn((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url.startsWith("/api/workspace-tree")) {
        return mockJsonResponse({ ok: true, entries: [] });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    mockDesktopLayout();

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换语言" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "English" }));

    expect(await screen.findByRole("button", { name: "Switch language" })).toBeInTheDocument();
    expect(screen.getByText("main - Current session")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("keeps Trace & Observe docked as a narrow icon rail on narrow screens", async () => {
    const fetchMock = vi.fn((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    mockNarrowLayout();

    const { container } = render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回复摘要" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拖动调整聊天区与追踪区宽度" })).not.toBeInTheDocument();
    expect(screen.queryByText("追踪与观察")).not.toBeInTheDocument();

    const main = container.querySelector("main");
    expect(main).toBeTruthy();
    expect(main?.style.gridTemplateColumns).toMatch(/^minmax\(0, 1fr\) \d+px$/);
  });

  it("requests the initial runtime snapshot only once on first load", async () => {
    const fetchMock = vi.fn((input) => {
      const url = String(input);

      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url.startsWith("/api/workspace-tree")) {
        return mockJsonResponse({ ok: true, entries: [] });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    mockDesktopLayout();

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();

    await waitFor(() => {
      const runtimeCalls = fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/runtime"));
      expect(runtimeCalls).toHaveLength(1);
    });
  });

  it("switches the main action to stop while a reply is running and aborts the turn on click", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((input, init = {}) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat/stop" && init?.method === "POST") {
        return mockJsonResponse({ ok: true });
      }

      if (url === "/api/chat" && init?.method === "POST") {
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
                messageId: "msg-assistant-stop-app",
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

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox"), "请开始");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("button", { name: "停止" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停止" }));

    expect(await screen.findByText("第一段")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat/stop", expect.objectContaining({ method: "POST" }));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    });
  });

  it("shows only one thinking bubble while later prompts wait in the queue", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    let resolveFirstChat;
    let chatCallCount = 0;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        chatCallCount += 1;

        if (chatCallCount === 1) {
          return new Promise((resolve) => {
            resolveFirstChat = () =>
              resolve(
                mockJsonResponse({
                  ...openClawSnapshot,
                  outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
                  metadata: { status: "已完成 / 标准" },
                }),
              );
          });
        }

        return mockJsonResponse({
          ...openClawSnapshot,
          outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "甲");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "乙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await user.type(composer, "丙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => {
      expect(hasMessageText("甲", "user")).toBe(true);
    });
    expect(screen.getAllByText("正在思考…")).toHaveLength(1);
    expect(screen.getByText("待发送 2")).toBeInTheDocument();
    expect(screen.getByText("当前回复结束后将按顺序发送")).toBeInTheDocument();
    expect(hasMessageText("乙", "user")).toBe(false);
    expect(hasMessageText("丙", "user")).toBe(false);
    expect(chatBodies).toHaveLength(1);

    resolveFirstChat?.();

    await waitFor(() => {
      expect(screen.getByText("已处理：甲")).toBeInTheDocument();
    });
  }, 10_000);

  it("removes a queued message and skips sending it later", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    let resolveFirstChat;
    let resolveSecondChat;
    let chatCallCount = 0;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        chatCallCount += 1;

        if (chatCallCount === 1) {
          return new Promise((resolve) => {
            resolveFirstChat = () =>
              resolve(
                mockJsonResponse({
                  ...openClawSnapshot,
                  outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
                  metadata: { status: "已完成 / 标准" },
                }),
              );
          });
        }

        if (chatCallCount === 2) {
          return new Promise((resolve) => {
            resolveSecondChat = () =>
              resolve(
                mockJsonResponse({
                  ...openClawSnapshot,
                  outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
                  metadata: { status: "已完成 / 标准" },
                }),
              );
          });
        }
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "甲");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "乙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await user.type(composer, "丙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => {
      expect(screen.getByText("待发送 2")).toBeInTheDocument();
      expect(hasMessageText("乙", "user")).toBe(false);
      expect(hasMessageText("丙", "user")).toBe(false);
    });

    await user.click(screen.getByRole("button", { name: "删除第 1 条待发送消息" }));

    await waitFor(() => {
      expect(screen.getByText("待发送 1")).toBeInTheDocument();
      expect(hasMessageText("乙", "user")).toBe(false);
      expect(hasMessageText("丙", "user")).toBe(false);
    });

    expect(chatBodies).toHaveLength(1);

    resolveFirstChat?.();

    await waitFor(() => {
      expect(chatBodies).toHaveLength(2);
      expect(chatBodies[1]?.messages.at(-1)?.content).toBe("丙");
    });

    resolveSecondChat?.();

    await waitFor(() => {
      expect(screen.getByText("已处理：丙")).toBeInTheDocument();
    });
  }, 10_000);

  it("clears all queued messages and does not send them later", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    let resolveFirstChat;
    let chatCallCount = 0;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        chatCallCount += 1;

        if (chatCallCount === 1) {
          return new Promise((resolve) => {
            resolveFirstChat = () =>
              resolve(
                mockJsonResponse({
                  ...openClawSnapshot,
                  outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
                  metadata: { status: "已完成 / 标准" },
                }),
              );
          });
        }

        return mockJsonResponse({
          ...openClawSnapshot,
          outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "甲");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "乙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await user.type(composer, "丙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => {
      expect(screen.getByText("待发送 2")).toBeInTheDocument();
      expect(hasMessageText("乙", "user")).toBe(false);
      expect(hasMessageText("丙", "user")).toBe(false);
    });

    await user.click(screen.getByRole("button", { name: "清空待发送" }));

    await waitFor(() => {
      expect(screen.queryByText("待发送 2")).not.toBeInTheDocument();
      expect(screen.queryByText("待发送 1")).not.toBeInTheDocument();
      expect(hasMessageText("乙", "user")).toBe(false);
      expect(hasMessageText("丙", "user")).toBe(false);
    });

    resolveFirstChat?.();

    await waitFor(() => {
      expect(screen.getByText("已处理：甲")).toBeInTheDocument();
    });

    expect(chatBodies).toHaveLength(1);
  }, 10_000);

  it("only moves queued turns into the conversation when each turn actually starts", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    const firstTurn = createDeferred();
    const secondTurn = createDeferred();
    const thirdTurn = createDeferred();
    let chatCallCount = 0;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        chatCallCount += 1;

        const resolveTurn = (label) =>
          mockJsonResponse({
            ...openClawSnapshot,
            outputText: `已处理：${label}`,
            metadata: { status: "已完成 / 标准" },
          });

        if (chatCallCount === 1) {
          return firstTurn.promise.then(() => resolveTurn("甲"));
        }
        if (chatCallCount === 2) {
          return secondTurn.promise.then(() => resolveTurn("乙"));
        }
        if (chatCallCount === 3) {
          return thirdTurn.promise.then(() => resolveTurn("丙"));
        }
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "甲");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "乙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await user.type(composer, "丙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => {
      expect(hasMessageText("甲", "user")).toBe(true);
      expect(hasMessageText("乙", "user")).toBe(false);
      expect(hasMessageText("丙", "user")).toBe(false);
      expect(screen.getByText("待发送 2")).toBeInTheDocument();
      expect(chatBodies).toHaveLength(1);
      expect(chatBodies[0]?.messages.at(-1)?.content).toBe("甲");
    });

    firstTurn.resolve();

    await waitFor(() => {
      expect(screen.getByText("已处理：甲")).toBeInTheDocument();
      expect(hasMessageText("乙", "user")).toBe(true);
      expect(hasMessageText("丙", "user")).toBe(false);
      expect(screen.getByText("待发送 1")).toBeInTheDocument();
      expect(chatBodies).toHaveLength(2);
      expect(chatBodies[1]?.messages.at(-1)?.content).toBe("乙");
    });

    secondTurn.resolve();

    await waitFor(() => {
      expect(screen.getByText("已处理：乙")).toBeInTheDocument();
      expect(hasMessageText("丙", "user")).toBe(true);
      expect(screen.queryByText("待发送 1")).not.toBeInTheDocument();
      expect(chatBodies).toHaveLength(3);
      expect(chatBodies[2]?.messages.at(-1)?.content).toBe("丙");
    });

    thirdTurn.resolve();

    await waitFor(() => {
      expect(screen.getByText("已处理：丙")).toBeInTheDocument();
    });
  }, 10_000);

  it("keeps queue progress stable when a lagging runtime conversation update arrives after the first reply", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    const firstTurn = createDeferred();
    const secondTurn = createDeferred();
    const thirdTurn = createDeferred();
    let chatCallCount = 0;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        chatCallCount += 1;

        const responseFor = (label, assistantId) =>
          mockJsonResponse({
            ...openClawSnapshot,
            assistantMessageId: assistantId,
            outputText: `已处理：${label}`,
            metadata: { status: "已完成 / 标准" },
          });

        if (chatCallCount === 1) {
          return firstTurn.promise.then(() => responseFor("甲", "msg-assistant-queue-stable-1"));
        }
        if (chatCallCount === 2) {
          return secondTurn.promise.then(() => responseFor("乙", "msg-assistant-queue-stable-2"));
        }
        if (chatCallCount === 3) {
          return thirdTurn.promise.then(() => responseFor("丙", "msg-assistant-queue-stable-3"));
        }
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    await screen.findByText("main - 当前会话");
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });
    MockWebSocket.instances[0].simulateOpen();

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "甲");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "乙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await user.type(composer, "丙");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => {
      expect(chatBodies).toHaveLength(1);
      expect(screen.getByText("待发送 2")).toBeInTheDocument();
    });

    firstTurn.resolve();

    await waitFor(() => {
      expect(screen.getByText("已处理：甲")).toBeInTheDocument();
      expect(screen.getAllByText("已处理：甲")).toHaveLength(1);
      expect(hasMessageText("乙", "user")).toBe(true);
      expect(hasMessageText("丙", "user")).toBe(false);
      expect(chatBodies).toHaveLength(2);
    });

    MockWebSocket.instances[0].simulateMessage({
      type: "conversation.sync",
      conversation: [
        { role: "user", content: "甲", timestamp: chatBodies[0]?.messages[0]?.content === "甲" ? chatBodies[0].messages[0].timestamp || 1 : 1 },
      ],
    });

    await waitFor(() => {
      expect(screen.getAllByText("已处理：甲")).toHaveLength(1);
      expect(hasMessageText("乙", "user")).toBe(true);
      expect(hasMessageText("丙", "user")).toBe(false);
      expect(screen.getByText("待发送 1")).toBeInTheDocument();
    });

    secondTurn.resolve();

    await waitFor(() => {
      expect(screen.getByText("已处理：乙")).toBeInTheDocument();
      expect(hasMessageText("丙", "user")).toBe(true);
      expect(chatBodies).toHaveLength(3);
    });

    thirdTurn.resolve();

    await waitFor(() => {
      expect(screen.getByText("已处理：丙")).toBeInTheDocument();
      expect(screen.queryByText("待发送 1")).not.toBeInTheDocument();
    });
  }, 10_000);

  it("suppresses dispatching a rapid duplicate while the current reply is still pending", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    let resolveFirstChat;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        return new Promise((resolve) => {
          resolveFirstChat = () =>
            resolve(
              mockJsonResponse({
                ...openClawSnapshot,
                outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
                metadata: { status: "已完成 / 标准" },
              }),
            );
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "1");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(chatBodies).toHaveLength(1);
    expect(screen.getAllByText("正在思考…")).toHaveLength(1);

    resolveFirstChat?.();

    await waitFor(() => {
      expect(screen.getByText("已处理：1")).toBeInTheDocument();
    });
  });

  it("suppresses dispatching repeated rapid duplicates while the first reply is pending", async () => {
    const openClawSnapshot = createSnapshot({
      session: {
        ...createSnapshot().session,
        mode: "openclaw",
        status: "空闲",
      },
    });
    let resolveFirstChat;
    const chatBodies = [];
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(openClawSnapshot);
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        return new Promise((resolve) => {
          resolveFirstChat = () =>
            resolve(
              mockJsonResponse({
                ...openClawSnapshot,
                outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
                metadata: { status: "已完成 / 标准" },
              }),
            );
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const composer = await screen.findByRole("textbox");
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    await user.type(composer, "1");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await user.type(composer, "1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await user.type(composer, "1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    await waitFor(() => {
      expect(chatBodies).toHaveLength(1);
    });
    expect(screen.getAllByText("正在思考…")).toHaveLength(1);

    resolveFirstChat?.();

    await waitFor(() => {
      expect(screen.getByText("已处理：1")).toBeInTheDocument();
    });
  }, 10_000);

  it("scrolls the chat viewport to the matching assistant bubble when an artifact summary is clicked", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const assistantTimestamp = 1700000000000;
    const fetchMock = vi.fn((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(
          createSnapshot({
            conversation: [
              { role: "user", content: "先看摘要", timestamp: assistantTimestamp - 1 },
              { role: "assistant", content: "这是最终回复，用来测试摘要联动定位。", timestamp: assistantTimestamp },
            ],
            artifacts: [
              {
                title: "回复 10:00",
                type: "assistant_output",
                detail: "这是最终回复，用来测试摘要联动定位。",
                messageRole: "assistant",
                messageTimestamp: assistantTimestamp,
                timestamp: assistantTimestamp,
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    mockDesktopLayout();

    render(<App />);

    const assistantMessage = await screen.findByText("这是最终回复，用来测试摘要联动定位。");
    const assistantBubble = assistantMessage.closest('[data-message-role="assistant"]');
    const viewport = [...document.querySelectorAll("[data-radix-scroll-area-viewport]")]
      .find((element) => element.contains(assistantMessage));

    expect(viewport).toBeTruthy();
    expect(assistantBubble).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 2400 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 900,
      bottom: 400,
      width: 900,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    assistantBubble.getBoundingClientRect = () => ({
      top: 820 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 1000 - viewport.scrollTop,
      width: 700,
      height: 180,
      x: 0,
      y: 820 - viewport.scrollTop,
      toJSON: () => ({}),
    });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "回复摘要" }));
    await user.click(screen.getByRole("button", { name: "定位到 回复 10:00" }));

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(700);
    });
  });

  it("focuses the prompt and starts typing when a printable key is pressed outside the composer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(createSnapshot());
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);
    const sendButton = screen.getByRole("button", { name: "发送" });

    sendButton.focus();
    expect(sendButton).toHaveFocus();

    await user.keyboard("h");

    await waitFor(() => {
      expect(textarea).toHaveFocus();
      expect(textarea).toHaveValue("h");
    });
  });

  it("applies the selected chat font size across chat tabs", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:expert", agentId: "expert", sessionUser: "command-center-expert-1" },
        ],
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "openclaw",
            sessionUser: "command-center",
            thinkMode: "off",
          },
          "agent:expert": {
            agentId: "expert",
            fastMode: false,
            model: "openclaw",
            sessionUser: "command-center-expert-1",
            thinkMode: "off",
          },
        },
        messagesByTabId: {
          "agent:main": [{ role: "assistant", content: "主会话消息", timestamp: 1 }],
          "agent:expert": [{ role: "assistant", content: "专家会话消息", timestamp: 2 }],
        },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          const params = new URL(url, "http://localhost").searchParams;
          const sessionUser = params.get("sessionUser") || "command-center";
          const agentId = params.get("agentId") || (sessionUser === "command-center-expert-1" ? "expert" : "main");
          return mockJsonResponse(
            createSnapshot({
              session: {
                ...createSnapshot().session,
                agentId,
                selectedAgentId: agentId,
                sessionUser,
                sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
              },
              conversation: sessionUser === "command-center-expert-1"
                ? [{ role: "assistant", content: "专家会话消息", timestamp: 2 }]
                : [{ role: "assistant", content: "主会话消息", timestamp: 1 }],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("主会话消息");
    await user.click(screen.getByRole("button", { name: "字体大小：大" }));

    await waitFor(() => {
      const mainMessage = screen.getByText("主会话消息");
      expect(hasAncestorClass(mainMessage, "text-[14px]")).toBe(true);
      expect(hasAncestorClass(mainMessage, "leading-6")).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: /expert/ }));

    await waitFor(() => {
      const expertMessage = screen.getByText("专家会话消息");
      expect(hasAncestorClass(expertMessage, "text-[14px]")).toBe(true);
      expect(hasAncestorClass(expertMessage, "leading-6")).toBe(true);
    });
  });

  it("shows a red unread dot when an inactive tab receives a background runtime message", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:main::feishu", agentId: "main", sessionUser: "agent:main:feishu:direct:ou_test" },
        ],
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "openclaw",
            sessionUser: "command-center",
            thinkMode: "off",
          },
          "agent:main::feishu": {
            agentId: "main",
            fastMode: false,
            model: "openclaw",
            sessionUser: "agent:main:feishu:direct:ou_test",
            thinkMode: "off",
          },
        },
        messagesByTabId: {
          "agent:main": [{ role: "assistant", content: "主会话消息", timestamp: 1 }],
          "agent:main::feishu": [{ role: "assistant", content: "飞书旧消息", timestamp: 2 }],
        },
      }),
    );

    stubFetchWithAccessState((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        const params = new URL(url, "http://localhost").searchParams;
        const sessionUser = params.get("sessionUser") || "command-center";
        const agentId = params.get("agentId") || "main";
        return mockJsonResponse(
          createSnapshot({
            session: {
              ...createSnapshot().session,
              agentId,
              selectedAgentId: agentId,
              sessionUser,
              sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
            },
            conversation: sessionUser === "agent:main:feishu:direct:ou_test"
              ? [{ role: "assistant", content: "飞书新消息", timestamp: 3 }]
              : [{ role: "assistant", content: "主会话消息", timestamp: 1 }],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<App />);

    await screen.findByText("main - 当前会话");
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /飞书/ }).querySelector(".cc-chat-tab-unread-badge")).toHaveTextContent("1");
    });
  });

  it("does not stack overlapping background IM runtime requests while a previous poll is still pending", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:main::feishu", agentId: "main", sessionUser: "agent:main:feishu:direct:ou_test" },
        ],
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "openclaw",
            sessionUser: "command-center",
            thinkMode: "off",
          },
          "agent:main::feishu": {
            agentId: "main",
            fastMode: false,
            model: "openclaw",
            sessionUser: "agent:main:feishu:direct:ou_test",
            thinkMode: "off",
          },
        },
        messagesByTabId: {
          "agent:main": [{ role: "assistant", content: "主会话消息", timestamp: 1 }],
          "agent:main::feishu": [{ role: "assistant", content: "飞书旧消息", timestamp: 2 }],
        },
      }),
    );

    const deferredBackgroundRuntime = createDeferred();
    const backgroundSessionUser = "agent:main:feishu:direct:ou_test";
    const fetchMock = vi.fn((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        const params = new URL(url, "http://localhost").searchParams;
        const sessionUser = params.get("sessionUser") || "command-center";
        const agentId = params.get("agentId") || "main";

        if (sessionUser === backgroundSessionUser) {
          return deferredBackgroundRuntime.promise;
        }

        return mockJsonResponse(
          createSnapshot({
            session: {
              ...createSnapshot().session,
              agentId,
              selectedAgentId: agentId,
              sessionUser,
              sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
            },
            conversation: [{ role: "assistant", content: "主会话消息", timestamp: 1 }],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    await act(async () => {
      render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("main - 当前会话")).toBeInTheDocument();
    const backgroundSessionQuery = encodeURIComponent(backgroundSessionUser);
    const initialFeishuCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes(`sessionUser=${backgroundSessionQuery}`));
    expect(initialFeishuCalls).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    const feishuCallsWhilePending = fetchMock.mock.calls.filter(([input]) => String(input).includes(`sessionUser=${backgroundSessionQuery}`));
    expect(feishuCallsWhilePending).toHaveLength(1);

    deferredBackgroundRuntime.resolve(
      mockJsonResponse(
        createSnapshot({
          session: {
            ...createSnapshot().session,
            agentId: "main",
            selectedAgentId: "main",
            sessionUser: backgroundSessionUser,
            sessionKey: `agent:main:openai-user:${backgroundSessionUser}`,
          },
          conversation: [{ role: "assistant", content: "飞书新消息", timestamp: 3 }],
        }),
      ),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("marks the UI offline when runtime loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJsonResponse({ ok: false, error: "Runtime snapshot failed" }, false, 500)),
    );

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();
    await waitFor(() => {
      expect(getNormalizedBodyText()).toContain("Openclaw尚未连接，请稍候。");
    }, {
      timeout: 2_500,
    });
  });

  it("shows task relationships above trace and observe while the current task is still running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              conversation: [{ role: "assistant", content: "处理中", timestamp: 1, pending: true }],
              taskRelationships: [
                { id: "rel-session", type: "session_spawn", sourceAgentId: "main", targetAgentId: "", detail: "fresh-session", status: "established" },
                { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "running" },
              ],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText("协同任务")).toBeInTheDocument();
    expect(screen.getByText("已建立")).toBeInTheDocument();
    expect(screen.getByText("执行中")).toBeInTheDocument();
    expect(screen.getByText("会话创建")).toBeInTheDocument();
    expect(screen.getByText("fresh-session")).toBeInTheDocument();
    expect(screen.getByText("paint")).toBeInTheDocument();
    expect(screen.getByText("image-worker")).toBeInTheDocument();
  });

  it("localizes task relationship statuses for english UI", async () => {
    window.localStorage.setItem(localeStorageKey, "en");

    const { rerender } = render(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-complete", type: "child_agent", sourceAgentId: "main", targetAgentId: "writer", detail: "draft-worker", status: "执行中" },
            { id: "rel-failed", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "失败" },
          ]}
        />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-complete", type: "child_agent", sourceAgentId: "main", targetAgentId: "writer", detail: "draft-worker", status: "已完成" },
            { id: "rel-failed", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "失败" },
          ]}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("allows dismissing failed task relationships from the context menu", async () => {
    const onDismissRelationship = vi.fn();

    render(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          onDismissRelationship={onDismissRelationship}
          relationships={[
            { id: "rel-failed", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "failed" },
          ]}
        />
      </I18nProvider>,
    );

    fireEvent.contextMenu(screen.getByText("image-worker").closest("div[class*='grid-cols-[auto_minmax(2.5rem,1fr)_auto]']") || screen.getByText("image-worker"));

    const closeMenuItem = await screen.findByRole("menuitem", { name: "关闭" });
    fireEvent.click(closeMenuItem);

    expect(onDismissRelationship).toHaveBeenCalledWith("rel-failed");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("hides completed task relationships by default when they were already completed on first render", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              conversation: [{ role: "assistant", content: "已完成", timestamp: 1 }],
              taskRelationships: [
                { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "completed" },
              ],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    expect(screen.queryByText("协同任务")).not.toBeInTheDocument();
    expect(screen.queryByText("paint")).not.toBeInTheDocument();
  });

  it("shows a 60-second hide countdown only when a visible task transitions into completed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T09:10:00Z"));

    const { rerender } = render(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "running" },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("60 秒后关闭")).not.toBeInTheDocument();
    expect(screen.getByText("paint")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(27000);
    });

    rerender(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "completed" },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("60 秒后关闭")).toBeInTheDocument();
    expect(screen.getByText("paint")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("59 秒后关闭")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(59000);
    });

    expect(screen.queryByText("paint")).not.toBeInTheDocument();
  });

  it("updates the completed-task countdown every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T09:20:00Z"));

    const { rerender } = render(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "running" },
          ]}
        />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "completed" },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("60 秒后关闭")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("59 秒后关闭")).toBeInTheDocument();
  });

  it("keeps the completed-task countdown moving across runtime refreshes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T09:30:00Z"));

    const { rerender } = render(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "running" },
          ]}
        />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "completed" },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("60 秒后关闭")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("58 秒后关闭")).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <TaskRelationshipsPanel
          visible
          sessionAgentId="main"
          relationships={[
            { id: "rel-agent", type: "child_agent", sourceAgentId: "main", targetAgentId: "paint", detail: "image-worker", status: "completed" },
          ]}
        />
      </I18nProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("57 秒后关闭")).toBeInTheDocument();
  });

  it("shows an assistant error message when chat request fails", async () => {
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({ ok: false, error: "网关不可用" }, false, 502);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);
    await user.type(textarea, "这次会失败");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(hasMessageText("这次会失败", "user")).toBe(true);
    });
    expect(
      (
        await screen.findAllByText(
          (_, element) =>
            Boolean(element?.textContent?.includes("请求失败。")) &&
            Boolean(element?.textContent?.includes("网关不可用")),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("clears the composer input after sending a message", async () => {
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: "收到。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);
    await user.type(textarea, "没事");
    expect(textarea).toHaveValue("没事");

    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("没事")).toBeInTheDocument();
    expect(await screen.findByText("收到。")).toBeInTheDocument();

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("clears active messages on reset", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeTab: "timeline",
        messages: [],
        fastMode: false,
        model: "",
        agentId: "main",
        sessionUser: "command-center",
      }),
    );

    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: "这是待清空的回复。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);
    await user.type(textarea, "需要被重置");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(hasMessageText("需要被重置", "user")).toBe(true);
      expect(hasMessageText("这是待清空的回复。", "assistant")).toBe(true);
    });

    await user.click(screen.getByLabelText("开启新会话"));
    await user.click(await screen.findByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(hasMessageText("需要被重置", "user")).toBe(false);
      expect(hasMessageText("这是待清空的回复。", "assistant")).toBe(false);
    });
  });

  it("recalls sent prompts with arrow keys when the input is empty", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        const userMessage = body.messages.at(-1)?.content || "";
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: `已处理：${userMessage}`,
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "第一条");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => {
      expect(hasMessageText("已处理：第一条", "assistant")).toBe(true);
    });

    await user.clear(textarea);
    await user.type(textarea, "第二条");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => {
      expect(hasMessageText("已处理：第二条", "assistant")).toBe(true);
    });

    await user.clear(textarea);
    expect(textarea).toHaveValue("");

    await user.click(textarea);
    await user.keyboard("{ArrowUp}");
    expect(textarea).toHaveValue("第二条");

    await user.keyboard("{ArrowUp}");
    expect(textarea).toHaveValue("第一条");

    await user.keyboard("{ArrowDown}");
    expect(textarea).toHaveValue("第二条");

    await user.keyboard("{ArrowDown}");
    expect(textarea).toHaveValue("");
  }, 10000);

  it("clears the prompt draft after remount when storage is wiped", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    const user = userEvent.setup();
    const firstRender = render(<App />);
    const firstTextarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    await user.type(firstTextarea, "刷新后也要保留");
    expect(firstTextarea).toHaveValue("刷新后也要保留");

    firstRender.unmount();

    window.localStorage.removeItem(promptDraftStorageKey);
    window.localStorage.removeItem(currentStorageKey);
    window.localStorage.removeItem(storageKey);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(defaultPromptPlaceholder)).toHaveValue("");
    });
  });

  it("stores the resized inspector width globally after dragging the handle", async () => {
    mockDesktopLayout(1200);

    const fetchMock = vi.fn((input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    await screen.findByText("main - 当前会话");

    const resizeHandle = screen.getByRole("button", { name: "拖动调整聊天区与追踪区宽度" });
    const mainLayout = resizeHandle.closest("main");

    expect(mainLayout).toBeTruthy();
    mainLayout.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });

    act(() => {
      fireEvent.pointerDown(resizeHandle, { clientX: 820 });
      fireEvent.pointerMove(window, { clientX: 760 });
      fireEvent.pointerUp(window);
    });

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(storageKey) || "{}")).toMatchObject({
        inspectorPanelWidth: 440,
      });
    });
  });

  it("sends when plain enter is pressed in the default mode", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: `已发送：${body.messages.at(-1)?.content || ""}`,
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "第一行");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("已发送：第一行")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
      expect(textarea).toHaveValue("");
    });
  });

  it("inserts a newline on shift-enter in the default mode", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "第一行");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(textarea).toHaveValue("第一行\n");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/chat", expect.anything());
  });

  it("switches to double-enter send mode and updates the hint text", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: `已发送：${body.messages.at(-1)?.content || ""}`,
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    expect(screen.getByText("↑↓输入历史 - 回车发送，Shift + 回车换行")).toBeInTheDocument();
    expect(screen.getByTestId("composer-placeholder-overlay")).toHaveTextContent("PS: 不用点击输入框，任何时候直接打字");

    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    expect(screen.getByText("↑↓输入历史 - 快速连按回车或 Shift + 回车发送，回车换行")).toBeInTheDocument();
    expect(screen.getByTestId("composer-placeholder-overlay")).toHaveTextContent("PS: 不用点击输入框，任何时候直接打字");
    expect(screen.getByRole("button", { name: "切换为回车发送" })).toBeInTheDocument();

    const dateNowSpy = vi.spyOn(Date, "now");
    await user.type(textarea, "第一行");

    dateNowSpy.mockReturnValue(1_000);
    await user.keyboard("{Enter}");
    expect(textarea).toHaveValue("第一行\n");

    dateNowSpy.mockReturnValue(1_300);
    await user.keyboard("{Enter}");

    expect(await screen.findByText("已发送：第一行")).toBeInTheDocument();
    dateNowSpy.mockRestore();
  });

  it("sends attachments to the chat API", async () => {
    let lastChatBody = null;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        lastChatBody = JSON.parse(init.body);
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: "已接收附件。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    const { container } = render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const attachment = new File(["console.log('hello')"], "notes.js", { type: "text/javascript" });
    await user.upload(fileInput, attachment);
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("已接收附件。")).toBeInTheDocument();
    expect(lastChatBody?.messages.at(-1)?.attachments).toHaveLength(1);
    expect(lastChatBody?.messages.at(-1)?.attachments[0]?.name).toBe("notes.js");
    expect(lastChatBody?.messages.at(-1)?.attachments[0]?.textContent).toContain("console.log");
  });

  it("stores sent image attachments in the pending turn snapshot", async () => {
    let chatResponseResolve;
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return new Promise((resolve) => {
          chatResponseResolve = resolve;
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    const { container } = render(<App />);
    const user = userEvent.setup();

    await screen.findByText("LalaClaw");

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const attachment = new File(["image-bytes"], "draft.png", { type: "image/png" });
    await user.upload(fileInput, attachment);
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);
    await user.type(textarea, "图中是啥");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByAltText("draft.png")).toBeInTheDocument();

    await waitFor(() => {
      const pendingPayload = JSON.parse(window.localStorage.getItem(pendingChatStorageKey) || "{}");
      const pending = pendingPayload.pendingChatTurns || pendingPayload;
      const attachmentNames = Object.values(pending)
        .flatMap((entry) => entry?.userMessage?.attachments || [])
        .map((entry) => entry?.name);
      expect(attachmentNames).toContain("draft.png");
    });

    chatResponseResolve?.(
      mockJsonResponse({
        ...createSnapshot(),
        outputText: "看起来像头像。",
        metadata: { status: "已完成 / 标准" },
      }),
    );
  });

  it("restores sent image attachments from stored messages after refresh", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: "已查看图片。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    const { container, unmount } = render(<App />);
    const user = userEvent.setup();

    await screen.findByText("LalaClaw");

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const attachment = new File(["image-bytes"], "persisted.png", { type: "image/png" });
    await user.upload(fileInput, attachment);
    await user.type(screen.getByPlaceholderText(defaultPromptPlaceholder), "这是什么");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByAltText("persisted.png")).toBeInTheDocument();
    expect(await screen.findByText("已查看图片。")).toBeInTheDocument();

    unmount();

    render(<App />);

    expect(await screen.findByAltText("persisted.png")).toBeInTheDocument();
  });

  it("restores the pending assistant bubble after refresh while a request is still running", async () => {
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        "command-center:main": {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 101,
          userMessage: {
            role: "user",
            content: "刷新后继续显示",
            timestamp: 100,
          },
        },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              conversation: [{ role: "user", content: "刷新后继续显示", timestamp: 100 }],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(getNormalizedBodyText()).toContain("刷新后继续显示");
    });
    expect(await screen.findByText("正在思考…")).toBeInTheDocument();
    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
  });

  it("keeps the restored refresh-in-progress turn marked busy when stored messages already contain a partial assistant reply", async () => {
    const persistedState = {
      _persistedAt: Date.now(),
      activeChatTabId: "agent:main",
      activeTab: "timeline",
      chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
      chatFontSize: "small",
      composerSendMode: "enter-send",
      dismissedTaskRelationshipIdsByConversation: {},
      fastMode: false,
      inspectorPanelWidth: 380,
      thinkMode: "off",
      model: "openclaw",
      agentId: "main",
      sessionUser: "command-center",
      tabMetaById: {
        "agent:main": {
          agentId: "main",
          sessionUser: "command-center",
          model: "openclaw",
          fastMode: false,
          thinkMode: "off",
        },
      },
      messages: [
        { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
        { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 101 },
      ],
      messagesByTabId: {
        "agent:main": [
          { id: "msg-user-1", role: "user", content: "刷新后继续生成", timestamp: 100 },
          { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 101 },
        ],
      },
    };

    window.localStorage.setItem(currentStorageKey, JSON.stringify(persistedState));
    window.localStorage.setItem(storageKey, JSON.stringify(persistedState));
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        _persistedAt: Date.now(),
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 100,
            pendingTimestamp: 101,
            assistantMessageId: "msg-assistant-pending-1",
            userMessage: {
              id: "msg-user-1",
              role: "user",
              content: "刷新后继续生成",
              timestamp: 100,
            },
          },
        },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              session: {
                ...createSnapshot().session,
                status: "空闲",
              },
              conversation: [
                { role: "user", content: "刷新后继续生成", timestamp: 100 },
                { role: "assistant", content: "第一段", timestamp: 101 },
              ],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
      expect(screen.getByText("刷新后继续生成")).toBeInTheDocument();
      expect(screen.getByText("第一段")).toBeInTheDocument();
    });

    expect(container.querySelector(".cc-chat-tab-busy-dot")).toBeTruthy();
    expect(container.querySelector('[data-streaming-tail-dots="true"]')).toBeTruthy();
  });

  it("does not duplicate the latest user message when restoring a pending turn", async () => {
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        "command-center:main": {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 101,
          userMessage: {
            role: "user",
            content: "你好好思考，告诉我宇宙的答案是什么？",
            timestamp: 100,
          },
        },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              conversation: [
                {
                  role: "user",
                  content: "你好好思考，告诉我宇宙的答案是什么？",
                  timestamp: 200,
                },
              ],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    await waitFor(() => {
      const bodyText = getNormalizedBodyText();
      const occurrences = bodyText.split("你好好思考，告诉我宇宙的答案是什么？").length - 1;
      expect(occurrences).toBe(1);
    });
    expect(await screen.findByText("正在思考…")).toBeInTheDocument();
  });

  it("does not reinsert the latest user message between assistant replies after refresh", async () => {
    const promptText = "最后一句";
    window.localStorage.setItem(
      pendingChatStorageKey,
      JSON.stringify({
        "command-center:main": {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 101,
          userMessage: {
            role: "user",
            content: promptText,
            timestamp: 100,
          },
        },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              conversation: [
                {
                  role: "user",
                  content: promptText,
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
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    await waitFor(() => {
      const bodyText = getNormalizedBodyText();
      const occurrences = bodyText.split(promptText).length - 1;
      expect(occurrences).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByText("正在思考…")).not.toBeInTheDocument();
    });
  });

  it("hydrates prompt history from the current session conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(
            createSnapshot({
              conversation: [
                { role: "user", content: "旧消息一", timestamp: 1 },
                { role: "assistant", content: "收到", timestamp: 2 },
                { role: "user", content: "旧消息二", timestamp: 3 },
              ],
            }),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    await user.click(textarea);
    await user.keyboard("{ArrowUp}");
    expect(textarea).toHaveValue("旧消息二");

    await user.keyboard("{ArrowUp}");
    expect(textarea).toHaveValue("旧消息一");
  });

  it("switches theme with keyboard shortcuts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const url = String(input);
        if (url.startsWith("/api/runtime")) {
          return mockJsonResponse(createSnapshot());
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.keyboard("{Meta>}{Shift>}l{/Shift}{/Meta}");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.keyboard("{Meta>}{Shift>}f{/Shift}{/Meta}");
    expect(window.localStorage.getItem("command-center-theme")).toBe("system");
  });

  it("clears pointer focus from toolbar buttons after click while preserving keyboard focus", async () => {
    const { fetchMock } = createInteractiveFetchMock();
    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const languageButton = await screen.findByRole("button", { name: "切换语言" });

    await user.click(languageButton);
    expect(languageButton).not.toHaveFocus();

    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    languageButton.focus();
    expect(languageButton).toHaveFocus();
  });

  it("switches the selected model from the top menu", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(
          createSnapshot({
            model: "openai-codex/gpt-5.4",
            session: {
              ...createSnapshot().session,
              model: "openai-codex/gpt-5.4",
              selectedModel: "openai-codex/gpt-5.4",
              availableModels: ["openai-codex/gpt-5.4", "openrouter/google/gemini-3-flash-preview"],
            },
          }),
        );
      }

      if (url === "/api/session" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        return mockJsonResponse(
          createSnapshot({
            model: body.model,
            session: {
              ...createSnapshot().session,
              model: body.model,
              selectedModel: body.model,
              availableModels: ["openai-codex/gpt-5.4", "openrouter/google/gemini-3-flash-preview"],
            },
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.click(screen.getByLabelText("切换模型"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "openrouter/google/gemini-3-flash-preview" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/session",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("openrouter/google/gemini-3-flash-preview"),
        }),
      );
    });
  });

  it("keeps the previous model selected when session update fails", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(
          createSnapshot({
            model: "openai-codex/gpt-5.4",
            session: {
              ...createSnapshot().session,
              model: "openai-codex/gpt-5.4",
              selectedModel: "openai-codex/gpt-5.4",
              availableModels: ["openai-codex/gpt-5.4", "openrouter/google/gemini-3-flash-preview"],
            },
          }),
        );
      }

      if (url === "/api/session" && init?.method === "POST") {
        return mockJsonResponse({ ok: false, error: "Gateway RPC returned invalid JSON" }, false, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.click(screen.getByLabelText("切换模型"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "openrouter/google/gemini-3-flash-preview" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/session",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("openrouter/google/gemini-3-flash-preview"),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText("openai-codex/gpt-5.4").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("gemini-3-flash-preview")).not.toBeInTheDocument();
    expect(
      screen.getByText("切换模型失败：openrouter/google/gemini-3-flash-preview（Gateway RPC returned invalid JSON）"),
    ).toBeInTheDocument();
  });

  it("syncs the current session model after applying the current agent default model", async () => {
    const state = {
      globalModel: "openai-codex/gpt-5.4",
      agentModel: "openrouter/minimax/minimax-m2.5",
      sessionModel: "openrouter/minimax/minimax-m2.5",
    };

    const buildRuntimeSnapshot = () =>
      createSnapshot({
        model: state.sessionModel,
        session: {
          ...createSnapshot().session,
          model: state.sessionModel,
          selectedModel: state.sessionModel,
          availableModels: [
            "openrouter/minimax/minimax-m2.5",
            "openai-codex/gpt-5.4",
          ],
        },
        peeks: {
          workspace: null,
          terminal: null,
          browser: null,
          environment: {
            summary: "这里汇总 OpenClaw 诊断、管理动作与当前会话环境信息，便于排查与检阅。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
        },
      });

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(buildRuntimeSnapshot());
      }

      if (url === "/api/openclaw/config?agentId=main" && (!init || init.method === "GET")) {
        return mockJsonResponse({
          ok: true,
          currentAgentId: "main",
          configPath: "/Users/marila/.openclaw/openclaw.json",
          baseHash: "base-hash-1",
          modelOptions: [
            "openrouter/minimax/minimax-m2.5",
            "openai-codex/gpt-5.4",
          ],
          fields: [
            { key: "modelPrimary", value: state.globalModel },
            { key: "agentModel", value: state.agentModel, meta: { agentId: "main" } },
            { key: "gatewayBind", value: "loopback" },
            { key: "chatCompletionsEnabled", value: true },
          ],
          validation: { ok: true, valid: true },
        });
      }

      if (url === "/api/openclaw/config" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        state.globalModel = body.values.modelPrimary;
        state.agentModel = body.values.agentModel;
        return mockJsonResponse({
          ok: true,
          state: {
            ok: true,
            currentAgentId: "main",
            configPath: "/Users/marila/.openclaw/openclaw.json",
            baseHash: "base-hash-2",
            modelOptions: [
              "openrouter/minimax/minimax-m2.5",
              "openai-codex/gpt-5.4",
            ],
            fields: [
              { key: "modelPrimary", value: state.globalModel },
              { key: "agentModel", value: state.agentModel, meta: { agentId: "main" } },
              { key: "gatewayBind", value: "loopback" },
              { key: "chatCompletionsEnabled", value: true },
            ],
            validation: { ok: true, valid: true },
          },
        });
      }

      if (url === "/api/openclaw/update") {
        return mockJsonResponse({
          ok: true,
          installed: true,
          currentVersion: "2026.3.19-2",
          targetVersion: "2026.3.19-2",
        });
      }

      if (url === "/api/openclaw/history") {
        return mockJsonResponse({ ok: true, entries: [] });
      }

      if (url === "/api/session" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        state.sessionModel = body.model || state.sessionModel;
        return mockJsonResponse(buildRuntimeSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    mockDesktopLayout();

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("main - 当前会话");
    await waitFor(() => {
      expect(screen.getByLabelText("切换模型")).toHaveTextContent("openrouter/minimax/minimax-m2.5");
    });

    await user.click(screen.getByRole("tab", { name: "环境" }));
    await screen.findByText("OpenClaw 配置");
    await user.click(screen.getByRole("button", { name: "OpenClaw 配置 查看详情" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "main 默认模型" }), "openai-codex/gpt-5.4");
    await user.click(screen.getByRole("button", { name: "应用并重启" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/session",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("openai-codex/gpt-5.4"),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("切换模型")).toHaveTextContent("openai-codex/gpt-5.4");
    });
  });

  it("prioritizes onboarding in the environment tab until first-run OpenClaw setup is completed", async () => {
    const onboardingState = { complete: false };

    const buildRuntimeSnapshot = () =>
      createSnapshot({
        peeks: {
          workspace: null,
          terminal: null,
          browser: null,
          environment: {
            summary: "这里汇总 OpenClaw 诊断、管理动作与当前会话环境信息，便于排查与检阅。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
        },
      });

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(buildRuntimeSnapshot());
      }

      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return mockJsonResponse({
          ok: true,
          installed: true,
          ready: onboardingState.complete,
          needsOnboarding: !onboardingState.complete,
          configPath: "/Users/marila/.openclaw/openclaw.json",
          validation: onboardingState.complete
            ? { ok: true, valid: true, path: "/Users/marila/.openclaw/openclaw.json" }
            : { ok: false, valid: false, path: "/Users/marila/.openclaw/openclaw.json" },
          defaults: {
            authChoice: "openai-api-key",
            customCompatibility: "openai",
            daemonRuntime: "node",
            flow: "quickstart",
            gatewayAuth: "off",
            gatewayBind: "loopback",
            gatewayTokenInputMode: "plaintext",
            installDaemon: true,
            secretInputMode: "plaintext",
            skipHealthCheck: false,
            workspace: "/Users/marila/.openclaw/workspace",
          },
          supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "custom-api-key"],
          supportedDaemonRuntimes: ["node", "bun"],
          supportedFlows: ["quickstart", "advanced", "manual"],
          supportedGatewayAuthModes: ["off", "token", "password"],
          supportedGatewayTokenInputModes: ["plaintext", "ref"],
          supportedSecretInputModes: ["plaintext", "ref"],
          supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
        });
      }

      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        onboardingState.complete = true;
        return mockJsonResponse({
          ok: true,
          action: "onboard",
          commandResult: {
            ok: true,
            stdout: "onboarded",
            stderr: "",
            command: { display: "openclaw onboard --non-interactive --mode local --flow quickstart" },
          },
          state: {
            ok: true,
            installed: true,
            ready: true,
            needsOnboarding: false,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: true, valid: true, path: "/Users/marila/.openclaw/openclaw.json" },
            defaults: {
              authChoice: "openai-api-key",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "custom-api-key"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          },
          healthCheck: { status: "healthy" },
        });
      }

      if (url === "/api/openclaw/update") {
        return mockJsonResponse({
          ok: true,
          installed: true,
          currentVersion: "2026.3.19-2",
          targetVersion: "2026.3.19-2",
          availability: { available: false },
          update: { installKind: "package", packageManager: "pnpm" },
          channel: { value: "stable", label: "stable (default)" },
          preview: { actions: [] },
        });
      }

      if (url === "/api/openclaw/history") {
        return mockJsonResponse({ ok: true, entries: [] });
      }

      if (url.startsWith("/api/openclaw/config")) {
        return mockJsonResponse({
          ok: true,
          configPath: "/Users/marila/.openclaw/openclaw.json",
          baseHash: "hash",
          fields: [],
          validation: { ok: true, valid: true },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    mockDesktopLayout();

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("main - 当前会话");

    await user.click(screen.getByRole("tab", { name: "环境" }));
    await screen.findByText("OpenClaw 初始化");
    expect(screen.queryByText("OpenClaw 配置")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("API Key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/openclaw/onboarding",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            authChoice: "openai-api-key",
            apiKey: "sk-test",
            customBaseUrl: "",
            customCompatibility: "openai",
            customModelId: "",
            customProviderId: "",
            daemonRuntime: "node",
            flow: "quickstart",
            gatewayAuth: "off",
            gatewayBind: "loopback",
            gatewayPassword: "",
            gatewayToken: "",
            gatewayTokenInputMode: "plaintext",
            gatewayTokenRefEnv: "",
            installDaemon: true,
            secretInputMode: "plaintext",
            skipHealthCheck: false,
            token: "",
            tokenExpiresIn: "",
            tokenProfileId: "",
            tokenProvider: "",
            workspace: "/Users/marila/.openclaw/workspace",
          }),
        }),
      );
    });

    expect(await screen.findByText("OpenClaw 配置")).toBeInTheDocument();
    expect(screen.getByText("openclaw onboard --non-interactive --mode local --flow quickstart")).toBeInTheDocument();
  });

  it("shows an environment-tab alert and auto-expands the LalaClaw section when a new stable update is available", async () => {
    mockDesktopLayout();
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot({
          peeks: {
            workspace: null,
            terminal: null,
            browser: null,
            environment: {
              summary: "这里汇总 OpenClaw 诊断、管理动作与当前会话环境信息，便于排查与检阅。",
              items: [
                { label: "LALACLAW.VERSION", value: "2026.3.20-1" },
                { label: "LALACLAW.FRONTEND_URL", value: "http://127.0.0.1:5173" },
                { label: "LALACLAW.SERVER_URL", value: "http://127.0.0.1:3000" },
                { label: "LALACLAW.ACCESS_MODE", value: "off" },
                { label: "LALACLAW.GATEWAY_AUTH", value: "none" },
                { label: "openclaw.version", value: "1.2.3" },
              ],
            },
          },
        }));
      }

      if (url === "/api/lalaclaw/update" && (!init || init.method === "GET")) {
        return mockJsonResponse({
          ok: true,
          currentVersion: "2026.3.20-1",
          currentRelease: { version: "2026.3.20-1", stable: true },
          targetRelease: { version: "2026.3.21-1", stable: true },
          stableTag: "stable",
          updateAvailable: true,
          capability: { installKind: "npm-package", restartMode: "manual", updateSupported: true, reason: "" },
          check: { ok: true, scope: "stable", checkedAt: 1, errorCode: "", error: "" },
          job: { active: false, status: "idle", targetVersion: "", currentVersionAtStart: "", startedAt: 0, finishedAt: 0, errorCode: "", error: "" },
        });
      }

      if (url === "/api/openclaw/update") {
        return mockJsonResponse({
          ok: true,
          installed: true,
          currentVersion: "2026.3.19-2",
          targetVersion: "2026.3.19-2",
          availability: { available: false },
        });
      }

      if (url === "/api/openclaw/history") {
        return mockJsonResponse({ ok: true, entries: [] });
      }

      if (url.startsWith("/api/openclaw/config")) {
        return mockJsonResponse({
          ok: true,
          baseHash: "hash",
          fields: [],
          validation: { ok: true, valid: true },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);
    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await waitFor(() => {
      expect(screen.getByTestId("inspector-tab-alert-environment")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "环境" }));

    expect(screen.getByRole("button", { name: "立即更新" })).toBeInTheDocument();
    expect(screen.getByText("有可用更新")).toBeInTheDocument();
    expect(screen.queryByText("当前有新的 stable 版本可更新。")).not.toBeInTheDocument();
    expect(screen.getByText("2026.3.21-1")).toBeInTheDocument();
  });

  it("keeps prompt history isolated after resetting into a new session", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        const sessionUser = new URL(url, "http://localhost").searchParams.get("sessionUser") || "command-center";
        return mockJsonResponse(createSessionSnapshot(sessionUser));
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({
          ...createSessionSnapshot(),
          outputText: "已记录。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "旧会话消息");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("已记录。")).toBeInTheDocument();

    await user.click(screen.getByLabelText("开启新会话"));
    await user.click(await screen.findByRole("button", { name: "确定" }));
    await waitFor(() => {
      expect(hasMessageText("旧会话消息", "user")).toBe(false);
    });

    await user.click(textarea);
    await user.keyboard("{ArrowUp}");
    expect(textarea).toHaveValue("");
  });

  it("applies model, fast mode, and think mode changes before sending the next turn", async () => {
    const harness = createInteractiveFetchMock({
      availableModels: ["openai-codex/gpt-5.4", "openrouter/google/gemini-3-flash-preview"],
      model: "openai-codex/gpt-5.4",
    });

    stubFetchWithAccessState(harness.fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.click(screen.getByLabelText("切换模型"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "openrouter/google/gemini-3-flash-preview" }));

    await user.click(screen.getByRole("button", { name: "快速模式 已关闭" }));

    await user.click(screen.getByLabelText("切换思考模式"));
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: (name) => name.startsWith("high") && !name.startsWith("xhigh"),
      }),
    );

    await user.type(screen.getByPlaceholderText(defaultPromptPlaceholder), "整理一下当前项目");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("已处理：整理一下当前项目")).toBeInTheDocument();
    expect(harness.sessionUpdates).toEqual([
      { sessionUser: "command-center", model: "openrouter/google/gemini-3-flash-preview" },
      { sessionUser: "command-center", fastMode: true },
      { sessionUser: "command-center", thinkMode: "high" },
    ]);
    expect(harness.chatBodies[0]).toMatchObject({
      agentId: "main",
      fastMode: true,
      model: "openrouter/google/gemini-3-flash-preview",
      sessionUser: "command-center",
    });
  }, 10_000);

  it("shows a blocking overlay while switching agents", async () => {
    let resolveSessionUpdate;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(
          createSnapshot({
            session: {
              ...createSnapshot().session,
              availableAgents: ["main", "worker"],
            },
          }),
        );
      }

      if (url === "/api/session" && init?.method === "POST") {
        return new Promise((resolve) => {
          resolveSessionUpdate = () =>
            resolve(
              mockJsonResponse(
                createSnapshot({
                  session: {
                    ...createSnapshot().session,
                    agentId: "worker",
                    selectedAgentId: "worker",
                    availableAgents: ["main", "worker"],
                  },
                }),
              ),
            );
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await waitForAgentSwitcherReady();

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "worker" }));

    expect(await screen.findByText("正在开启与 worker 的会话...")).toBeInTheDocument();
    expect(screen.getByText("请稍候，界面会在切换完成后恢复。")).toBeInTheDocument();

    resolveSessionUpdate?.();

    await waitFor(() => {
      expect(screen.queryByText("正在开启与 worker 的会话...")).not.toBeInTheDocument();
    });
  });

  it("sends the next chat turn to the newly selected agent", async () => {
    const harness = createInteractiveFetchMock({
      availableAgents: ["main", "worker"],
      availableModels: ["openai-codex/gpt-5.4", "anthropic/claude-sonnet-4.5"],
      agentModels: {
        main: "openai-codex/gpt-5.4",
        worker: "anthropic/claude-sonnet-4.5",
      },
      model: "openai-codex/gpt-5.4",
    });

    stubFetchWithAccessState(harness.fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await waitForAgentSwitcherReady();

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "worker" }));
    await screen.findByText("worker - 当前会话");

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeEnabled();
    });
    await user.type(screen.getByRole("textbox"), "继续处理 worker 任务");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("已处理：继续处理 worker 任务")).toBeInTheDocument();
    expect(harness.sessionUpdates).toMatchObject([
      {
        agentId: "worker",
      },
    ]);
    expect(harness.sessionUpdates[0]?.sessionUser).toMatch(/^command-center-worker-/);
    expect(harness.chatBodies[0]).toMatchObject({
      agentId: "worker",
      model: "anthropic/claude-sonnet-4.5",
    });
    expect({
      chatBodySessionUser: harness.chatBodies[0]?.sessionUser,
      chatBodyAgentId: harness.chatBodies[0]?.agentId,
      sessionUpdateSessionUser: harness.sessionUpdates[0]?.sessionUser,
      sessionUpdateAgentId: harness.sessionUpdates[0]?.agentId,
    }).toMatchObject({
      chatBodySessionUser: expect.stringMatching(/^command-center-worker-/),
      chatBodyAgentId: "worker",
      sessionUpdateSessionUser: expect.stringMatching(/^command-center-worker-/),
      sessionUpdateAgentId: "worker",
    });
  }, 10_000);

  it("does not list agents that already have open tabs in the switcher menu", async () => {
    const harness = createInteractiveFetchMock({
      availableAgents: ["main", "worker"],
      availableModels: ["openai-codex/gpt-5.4", "anthropic/claude-sonnet-4.5"],
      agentModels: {
        main: "openai-codex/gpt-5.4",
        worker: "anthropic/claude-sonnet-4.5",
      },
      model: "openai-codex/gpt-5.4",
    });

    stubFetchWithAccessState(harness.fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await waitForAgentSwitcherReady();

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "worker" }));
    await screen.findByText("worker - 当前会话");

    await user.click(screen.getByLabelText("切换 Agent"));
    expect(screen.queryByRole("menuitem", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "worker" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/可以和主 Agent 对话让他帮你创建新的 Agent/),
    ).toBeInTheDocument();
  });

  it("opens an IM tab directly from the switcher menu without requiring session search", async () => {
    const harness = createInteractiveFetchMock({
      availableAgents: ["main"],
      availableModels: ["openai-codex/gpt-5.4"],
      model: "openai-codex/gpt-5.4",
    });

    stubFetchWithAccessState(harness.fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "飞书" }));

    expect(await screen.findByRole("button", { name: "飞书 main" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "定位飞书会话" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("切换 Agent"));
    expect(screen.queryByRole("menuitem", { name: "飞书" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "钉钉" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "企微" })).toBeInTheDocument();
  });

  it("resolves a bootstrap Feishu tab before sending the first message", async () => {
    const chatBodies = [];
    const nativeSessionUser = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    let feishuRuntimeRequestCount = 0;
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);

      if (url.startsWith("/api/runtime")) {
        const params = new URL(url, "http://localhost").searchParams;
        const sessionUser = params.get("sessionUser") || "command-center";

        if (sessionUser === "feishu:direct:default") {
          feishuRuntimeRequestCount += 1;
          return mockJsonResponse(createSnapshot({
            session: {
              ...createSnapshot().session,
              agentId: "main",
              selectedAgentId: "main",
              sessionUser: feishuRuntimeRequestCount > 1 ? nativeSessionUser : "feishu:direct:default",
              sessionKey: `agent:main:openai-user:${feishuRuntimeRequestCount > 1 ? nativeSessionUser : "feishu:direct:default"}`,
              status: "空闲",
            },
          }));
        }

        return mockJsonResponse(createSessionSnapshot(sessionUser));
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        return mockJsonResponse({
          ok: true,
          outputText: "收到",
          session: {
            ...createSnapshot().session,
            agentId: "main",
            selectedAgentId: "main",
            sessionUser: nativeSessionUser,
            sessionKey: `agent:main:openai-user:${nativeSessionUser}`,
            status: "空闲",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "飞书" }));
    expect(await screen.findByRole("button", { name: "飞书 main" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "hi");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(chatBodies[0]).toMatchObject({
        agentId: "main",
        sessionUser: nativeSessionUser,
      });
    });
  });

  it("clears the prompt immediately and avoids duplicate sends while a bootstrap IM send is still resolving", async () => {
    const deferredRuntime = createDeferred();
    const chatBodies = [];
    const nativeSessionUser = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    let feishuRuntimeRequestCount = 0;
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);

      if (url.startsWith("/api/runtime")) {
        const params = new URL(url, "http://localhost").searchParams;
        const sessionUser = params.get("sessionUser") || "command-center";

        if (sessionUser === "feishu:direct:default") {
          feishuRuntimeRequestCount += 1;
          if (feishuRuntimeRequestCount === 1) {
            return mockJsonResponse(createSnapshot({
              session: {
                ...createSnapshot().session,
                agentId: "main",
                selectedAgentId: "main",
                sessionUser: "feishu:direct:default",
                sessionKey: "agent:main:openai-user:feishu:direct:default",
                status: "空闲",
              },
            }));
          }

          return deferredRuntime.promise;
        }

        return mockJsonResponse(createSessionSnapshot(sessionUser));
      }

      if (url === "/api/chat" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        chatBodies.push(body);
        return mockJsonResponse({
          ok: true,
          outputText: "收到",
          session: {
            ...createSnapshot().session,
            agentId: "main",
            selectedAgentId: "main",
            sessionUser: nativeSessionUser,
            sessionKey: `agent:main:openai-user:${nativeSessionUser}`,
            status: "空闲",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw");

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "飞书" }));

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "hi");
    await user.keyboard("{Enter}{Enter}{Enter}");

    expect(textarea).toHaveValue("");

    deferredRuntime.resolve(mockJsonResponse(createSnapshot({
      session: {
        ...createSnapshot().session,
        agentId: "main",
        selectedAgentId: "main",
        sessionUser: nativeSessionUser,
        sessionKey: `agent:main:openai-user:${nativeSessionUser}`,
        status: "空闲",
      },
    })));

    await waitFor(() => {
      expect(chatBodies).toHaveLength(1);
      expect(chatBodies[0]).toMatchObject({
        agentId: "main",
        sessionUser: nativeSessionUser,
      });
    });
  });

  it("restores the previous chat scroll position when switching away and back to a conversation", async () => {
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        const params = new URL(url, "http://localhost").searchParams;
        const agentId = params.get("agentId") || "main";
        const sessionUser =
          params.get("sessionUser")
          || (agentId === "worker" ? "command-center-worker-1" : "command-center");

        return mockJsonResponse(
          createSnapshot({
            conversation:
              agentId === "worker"
                ? [
                    { role: "assistant", content: "worker 回复一", timestamp: 11 },
                    { role: "assistant", content: "worker 回复二", timestamp: 12 },
                  ]
                : [
                    { role: "assistant", content: "main 回复一", timestamp: 1 },
                    { role: "assistant", content: "main 回复二", timestamp: 2 },
                  ],
            session: {
              ...createSnapshot().session,
              agentId,
              selectedAgentId: agentId,
              availableAgents: ["main", "worker"],
              sessionUser,
              sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
            },
          }),
        );
      }

      if (url === "/api/session" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        const agentId = body.agentId || "main";
        const sessionUser =
          body.sessionUser
          || (agentId === "worker" ? "command-center-worker-1" : "command-center");

        return mockJsonResponse(
          createSnapshot({
            conversation:
              agentId === "worker"
                ? [
                    { role: "assistant", content: "worker 回复一", timestamp: 11 },
                    { role: "assistant", content: "worker 回复二", timestamp: 12 },
                  ]
                : [
                    { role: "assistant", content: "main 回复一", timestamp: 1 },
                    { role: "assistant", content: "main 回复二", timestamp: 2 },
                  ],
            session: {
              ...createSnapshot().session,
              agentId,
              selectedAgentId: agentId,
              availableAgents: ["main", "worker"],
              sessionUser,
              sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
            },
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    await screen.findByText("main - 当前会话");
    const mainMessage = await screen.findByText("main 回复二");
    const viewport = [...document.querySelectorAll("[data-radix-scroll-area-viewport]")]
      .find((element) => element.contains(mainMessage));

    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 1600 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });

    viewport.scrollTop = 365;
    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")).toHaveProperty("command-center:main");
    });

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "worker" }));
    await screen.findByText("worker - 当前会话");

    const storedMainScrollTop = JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")?.["command-center:main"]?.scrollTop;
    expect(Number.isFinite(storedMainScrollTop)).toBe(true);

    viewport.scrollTop = 48;

    await user.click(screen.getByRole("button", { name: "main" }));

    await waitFor(() => {
      expect(screen.getByText("main - 当前会话")).toBeInTheDocument();
      expect(viewport.scrollTop).toBe(storedMainScrollTop);
      expect(JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")).toMatchObject({
        "command-center:main": { scrollTop: storedMainScrollTop },
      });
    });
  });

  it("keeps the restored chat scroll position when IntersectionObserver has not fired yet", async () => {
    class IntersectionObserverMock {
      constructor() {}

      observe() {}

      disconnect() {}
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        const params = new URL(url, "http://localhost").searchParams;
        const agentId = params.get("agentId") || "main";
        const sessionUser =
          params.get("sessionUser")
          || (agentId === "worker" ? "command-center-worker-1" : "command-center");

        return mockJsonResponse(
          createSnapshot({
            conversation:
              agentId === "worker"
                ? [
                    { role: "assistant", content: "worker 回复一", timestamp: 11 },
                    { role: "assistant", content: "worker 回复二", timestamp: 12 },
                  ]
                : [
                    { role: "assistant", content: "main 回复一", timestamp: 1 },
                    { role: "assistant", content: "main 回复二", timestamp: 2 },
                  ],
            session: {
              ...createSnapshot().session,
              agentId,
              selectedAgentId: agentId,
              availableAgents: ["main", "worker"],
              sessionUser,
              sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
            },
          }),
        );
      }

      if (url === "/api/session" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        const agentId = body.agentId || "main";
        const sessionUser =
          body.sessionUser
          || (agentId === "worker" ? "command-center-worker-1" : "command-center");

        return mockJsonResponse(
          createSnapshot({
            conversation:
              agentId === "worker"
                ? [
                    { role: "assistant", content: "worker 回复一", timestamp: 11 },
                    { role: "assistant", content: "worker 回复二", timestamp: 12 },
                  ]
                : [
                    { role: "assistant", content: "main 回复一", timestamp: 1 },
                    { role: "assistant", content: "main 回复二", timestamp: 2 },
                  ],
            session: {
              ...createSnapshot().session,
              agentId,
              selectedAgentId: agentId,
              availableAgents: ["main", "worker"],
              sessionUser,
              sessionKey: `agent:${agentId}:openai-user:${sessionUser}`,
            },
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    render(<App />);

    await screen.findByText("main - 当前会话");
    const mainMessage = await screen.findByText("main 回复二");
    const viewport = [...document.querySelectorAll("[data-radix-scroll-area-viewport]")]
      .find((element) => element.contains(mainMessage));

    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 1600 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });

    viewport.scrollTop = 365;
    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")).toHaveProperty("command-center:main");
    });

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitem", { name: "worker" }));
    await screen.findByText("worker - 当前会话");

    const storedMainScrollTop = JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")?.["command-center:main"]?.scrollTop;
    expect(Number.isFinite(storedMainScrollTop)).toBe(true);

    viewport.scrollTop = 48;

    await user.click(screen.getByRole("button", { name: "main" }));

    await waitFor(() => {
      expect(screen.getByText("main - 当前会话")).toBeInTheDocument();
      expect(viewport.scrollTop).toBe(storedMainScrollTop);
    });
  });

  it("keeps a bottom-pinned conversation at the bottom after a refresh reload", async () => {
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(
          createSnapshot({
            conversation: [
              { role: "assistant", content: "main 回复一", timestamp: 1 },
              { role: "assistant", content: "main 回复二", timestamp: 2 },
            ],
            session: {
              ...createSnapshot().session,
              agentId: "main",
              selectedAgentId: "main",
              availableAgents: ["main"],
              sessionUser: "command-center",
              sessionKey: "agent:main:openai-user:command-center",
            },
          }),
        );
      }

      if (url === "/api/session" && init?.method === "POST") {
        return mockJsonResponse(
          createSnapshot({
            conversation: [
              { role: "assistant", content: "main 回复一", timestamp: 1 },
              { role: "assistant", content: "main 回复二", timestamp: 2 },
            ],
            session: {
              ...createSnapshot().session,
              agentId: "main",
              selectedAgentId: "main",
              availableAgents: ["main"],
              sessionUser: "command-center",
              sessionKey: "agent:main:openai-user:command-center",
            },
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    stubFetchWithAccessState(fetchMock);

    const firstRender = render(<App />);

    await screen.findByText("main - 当前会话");
    const firstMainMessage = await screen.findByText("main 回复二");
    const firstViewport = [...document.querySelectorAll("[data-radix-scroll-area-viewport]")]
      .find((element) => element.contains(firstMainMessage));

    expect(firstViewport).toBeTruthy();

    Object.defineProperty(firstViewport, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(firstViewport, "scrollHeight", { configurable: true, writable: true, value: 1600 });
    Object.defineProperty(firstViewport, "scrollTop", { configurable: true, writable: true, value: 1300 });

    fireEvent(window, new Event("beforeunload"));

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(chatScrollStorageKey) || "{}")).toMatchObject({
        "command-center:main": { scrollTop: 1300, atBottom: true },
      });
    });

    firstRender.unmount();

    render(<App />);

    await screen.findByText("main - 当前会话");
    const secondMainMessage = await screen.findByText("main 回复二");
    const secondViewport = [...document.querySelectorAll("[data-radix-scroll-area-viewport]")]
      .find((element) => element.contains(secondMainMessage));

    expect(secondViewport).toBeTruthy();

    Object.defineProperty(secondViewport, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(secondViewport, "scrollHeight", { configurable: true, writable: true, value: 1600 });
    Object.defineProperty(secondViewport, "scrollTop", { configurable: true, writable: true, value: 0 });

    await waitFor(() => {
      expect(secondViewport.scrollTop).toBe(1300);
    });
  });
});
