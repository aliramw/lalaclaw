import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRuntimeSnapshot } from "@/features/session/runtime";

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

describe("useRuntimeSnapshot", () => {
  afterEach(() => {
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
      expect(fetchMock).toHaveBeenCalledWith("/api/runtime?sessionUser=command-center");
      expect(result.current.availableModels).toEqual(["gpt-5"]);
      expect(result.current.files).toEqual([{ path: "src/App.jsx" }]);
    });

    expect(setFastMode).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setModel).toHaveBeenCalledWith("gpt-5");

    expect(setMessagesSynced).toHaveBeenCalledWith([
      { role: "user", content: "旧消息", timestamp: 100 },
      { role: "assistant", content: "正在思考…", timestamp: 60, pending: true },
    ]);

    const promptHistoryUpdater = setPromptHistoryByConversation.mock.calls[0][0];
    expect(promptHistoryUpdater({})).toEqual({
      "command-center:main": ["旧消息"],
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
        body: JSON.stringify({ sessionUser: "command-center", model: "gpt-5.1" }),
      }),
    );

    expect(setModel).toHaveBeenCalledWith("gpt-5.1");
  });
});
