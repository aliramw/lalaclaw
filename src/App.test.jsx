import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { TaskRelationshipsPanel } from "@/App";
import { I18nProvider } from "@/lib/i18n";
import { localeStorageKey } from "@/lib/i18n";

const storageKey = "command-center-ui-state-v2";
const pendingChatStorageKey = "command-center-pending-chat-v1";

function createSnapshot(overrides = {}) {
  return {
    ok: true,
    mode: "mock",
    model: "openclaw",
    session: {
      mode: "mock",
      model: "openclaw",
      selectedModel: "openclaw",
      agentId: "main",
      selectedAgentId: "main",
      sessionUser: "command-center",
      sessionKey: "agent:main:openai-user:command-center",
      workspaceRoot: "/Users/marila/.openclaw/workspace",
      status: "已完成",
      fastMode: "关闭",
      contextUsed: 0,
      contextMax: 16000,
      contextDisplay: "0 / 16000",
      runtime: "mock",
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

  const buildSnapshot = (overrides = {}) =>
    createSnapshot({
      model: state.model,
      session: {
        ...createSnapshot().session,
        agentId: state.agentId,
        selectedAgentId: state.agentId,
        availableAgents: state.availableAgents,
        availableModels: state.availableModels,
        fastMode: state.fastMode ? "已开启" : "已关闭",
        model: state.model,
        selectedModel: state.model,
        sessionKey: `agent:${state.agentId}:openai-user:${state.sessionUser}`,
        sessionUser: state.sessionUser,
        thinkMode: state.thinkMode,
      },
      ...overrides,
    });

  const fetchMock = vi.fn(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/runtime")) {
      return mockJsonResponse(buildSnapshot());
    }

    if (url === "/api/session" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      sessionUpdates.push(body);

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

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(localeStorageKey, "zh");
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads runtime data and sends a chat message", async () => {
    const fetchMock = vi.fn((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      if (url === "/api/chat" && init?.method === "POST") {
        return mockJsonResponse({
          ...createSnapshot(),
          outputText: "任务已完成。",
          metadata: { status: "已完成 / 标准" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "帮我检查状态");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("帮我检查状态")).toBeInTheDocument();
    expect(await screen.findByText("任务已完成。")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    });
  });

  it("scrolls the chat viewport to the matching assistant bubble when an artifact summary is clicked", async () => {
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

    vi.stubGlobal("fetch", fetchMock);

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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 700, behavior: "smooth" });
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
    const textarea = await screen.findByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    const sendButton = screen.getByRole("button", { name: "发送" });

    sendButton.focus();
    expect(sendButton).toHaveFocus();

    await user.keyboard("h");

    await waitFor(() => {
      expect(textarea).toHaveFocus();
      expect(textarea).toHaveValue("h");
    });
  });

  it("marks the UI offline when runtime loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJsonResponse({ ok: false, error: "Runtime snapshot failed" }, false, 500)),
    );

    render(<App />);

    expect(await screen.findByText("main - 当前会话")).toBeInTheDocument();
    expect(screen.getByLabelText("OpenClaw的状态")).toBeInTheDocument();
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
    expect(screen.getByText("Session Spawn")).toBeInTheDocument();
    expect(screen.getByText("fresh-session")).toBeInTheDocument();
    expect(screen.getByText("paint")).toBeInTheDocument();
    expect(screen.getByText("image-worker")).toBeInTheDocument();
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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "这次会失败");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("这次会失败")).toBeInTheDocument();
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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "需要被重置");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("需要被重置")).toBeInTheDocument();
    expect(await screen.findByText("这是待清空的回复。")).toBeInTheDocument();

    await user.click(screen.getByLabelText("重置对话"));

    await waitFor(() => {
      expect(screen.queryByText("需要被重置")).not.toBeInTheDocument();
      expect(screen.queryByText("这是待清空的回复。")).not.toBeInTheDocument();
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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "第一条");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("已处理：第一条")).toBeInTheDocument();

    await user.type(textarea, "第二条");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("已处理：第二条")).toBeInTheDocument();

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
  });

  it("sends when plain enter is pressed twice quickly", async () => {
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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    const dateNowSpy = vi.spyOn(Date, "now");

    await user.type(textarea, "第一行");
    dateNowSpy.mockReturnValue(1_000);
    await user.keyboard("{Enter}");
    expect(textarea).toHaveValue("第一行\n");

    dateNowSpy.mockReturnValue(1_300);
    await user.keyboard("{Enter}");

    expect(await screen.findByText("已发送：第一行")).toBeInTheDocument();
    await waitFor(() => expect(textarea).toHaveValue(""));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    });
    dateNowSpy.mockRestore();
  });

  it("keeps inserting newlines when plain enter presses are slow", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/runtime")) {
        return mockJsonResponse(createSnapshot());
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    const dateNowSpy = vi.spyOn(Date, "now");

    await user.type(textarea, "第一行");
    dateNowSpy.mockReturnValue(1_000);
    await user.keyboard("{Enter}");
    expect(textarea).toHaveValue("第一行\n");

    dateNowSpy.mockReturnValue(1_470);
    await user.keyboard("{Enter}");

    expect(textarea).toHaveValue("第一行\n\n");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/chat", expect.anything());
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

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw.ai");

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

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);
    const user = userEvent.setup();

    await screen.findByText("LalaClaw.ai");

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const attachment = new File(["image-bytes"], "draft.png", { type: "image/png" });
    await user.upload(fileInput, attachment);
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "图中是啥");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByAltText("draft.png")).toBeInTheDocument();

    await waitFor(() => {
      const pending = JSON.parse(window.localStorage.getItem(pendingChatStorageKey) || "{}");
      expect(pending["command-center:main"]?.userMessage?.attachments?.[0]?.name).toBe("draft.png");
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

    vi.stubGlobal("fetch", fetchMock);

    const { container, unmount } = render(<App />);
    const user = userEvent.setup();

    await screen.findByText("LalaClaw.ai");

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const attachment = new File(["image-bytes"], "persisted.png", { type: "image/png" });
    await user.upload(fileInput, attachment);
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "这是什么");
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
    expect(screen.getByText("思考中")).toBeInTheDocument();
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
    const textarea = await screen.findByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

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
    await screen.findByText("LalaClaw.ai");

    await user.keyboard("{Meta>}{Shift>}l{/Shift}{/Meta}");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.keyboard("{Meta>}{Shift>}d{/Shift}{/Meta}");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.keyboard("{Meta>}{Shift>}f{/Shift}{/Meta}");
    expect(window.localStorage.getItem("command-center-theme")).toBe("system");
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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw.ai");

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
        return mockJsonResponse({ ok: false, error: "Session update failed" }, false, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw.ai");

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
      expect(screen.getAllByText("gpt-5.4").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("gemini-3-flash-preview")).not.toBeInTheDocument();
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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "旧会话消息");
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("已记录。")).toBeInTheDocument();

    await user.click(screen.getByLabelText("重置对话"));
    await waitFor(() => {
      expect(screen.queryByText("旧会话消息")).not.toBeInTheDocument();
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

    vi.stubGlobal("fetch", harness.fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw.ai");

    await user.click(screen.getByLabelText("切换模型"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "openrouter/google/gemini-3-flash-preview" }));

    await user.click(screen.getByRole("button", { name: "快速模式 已关闭" }));

    await user.click(screen.getByLabelText("切换思考模式"));
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: (name) => name.startsWith("high") && !name.startsWith("xhigh"),
      }),
    );

    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "整理一下当前项目");
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
  });

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

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw.ai");

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "worker" }));

    expect(await screen.findByText("正在切换到 worker...")).toBeInTheDocument();
    expect(screen.getByText("请稍候，界面会在切换完成后恢复。")).toBeInTheDocument();

    resolveSessionUpdate?.();

    await waitFor(() => {
      expect(screen.queryByText("正在切换到 worker...")).not.toBeInTheDocument();
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

    vi.stubGlobal("fetch", harness.fetchMock);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("LalaClaw.ai");

    await user.click(screen.getByLabelText("切换 Agent"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "worker" }));

    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "继续处理 worker 任务");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("已处理：继续处理 worker 任务")).toBeInTheDocument();
    expect(harness.sessionUpdates).toEqual([
      { sessionUser: "command-center", agentId: "worker" },
    ]);
    expect(harness.chatBodies[0]).toMatchObject({
      agentId: "worker",
      model: "anthropic/claude-sonnet-4.5",
      sessionUser: "command-center",
    });
  });
});
