import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const storageKey = "command-center-ui-state-v2";

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

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
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

    expect((await screen.findAllByText("10:00:00")).length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "帮我检查状态");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("帮我检查状态")).toBeInTheDocument();
    expect(await screen.findByText("任务已完成。")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    });
  });

  it("marks the UI offline when runtime loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJsonResponse({ ok: false, error: "Runtime snapshot failed" }, false, 500)),
    );

    render(<App />);

    expect(await screen.findByText("OpenClaw 离线")).toBeInTheDocument();
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
});
