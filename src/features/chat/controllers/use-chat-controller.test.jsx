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
        outputText: "任务完成",
        metadata: { status: "已完成 / 标准" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const entry = {
      id: "entry-1",
      key: "command-center:main",
      content: "请继续",
      attachments: [],
      timestamp: 100,
      agentId: "main",
      sessionUser: "command-center",
      model: "gpt-5",
      fastMode: false,
    };

    const { result, rerender } = renderHook(
      ({ busy }) =>
        useChatController({
          activeConversationKey: "command-center:main",
          activeTargetRef,
          applySnapshot,
          busy,
          i18n: createI18n(),
          messagesRef,
          setBusy,
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
    expect(applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ outputText: "任务完成" }),
      { syncConversation: false },
    );
  });

  it("streams assistant output incrementally when the chat API returns ndjson", async () => {
    const setBusy = vi.fn();
    const setMessagesSynced = vi.fn();
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
        { type: "delta", delta: "第一段" },
        { type: "delta", delta: "第二段" },
        {
          type: "done",
          payload: {
            ok: true,
            outputText: "第一段第二段",
            tokenBadge: "↑1 ↓2",
            metadata: { status: "已完成 / 标准" },
          },
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

    const { result } = renderHook(() =>
      useChatController({
        activeConversationKey: "command-center:main",
        activeTargetRef,
        applySnapshot,
        busy: false,
        i18n: createI18n(),
        messagesRef,
        setBusy,
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
    expect(setMessagesSynced.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(applySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ outputText: "第一段第二段", tokenBadge: "↑1 ↓2" }),
      { syncConversation: false },
    );

    const initialMessages = setMessagesSynced.mock.calls[0]?.[0];
    const pendingTimestamp = initialMessages?.find((message) => message?.pending)?.timestamp;
    expect(typeof pendingTimestamp).toBe("number");

    const finalMessagesUpdater = setMessagesSynced.mock.calls.at(-1)?.[0];
    expect(typeof finalMessagesUpdater).toBe("function");
    expect(
      finalMessagesUpdater([
        { role: "user", content: "请流式输出", timestamp: 200 },
        { role: "assistant", content: "第一段第二段", timestamp: pendingTimestamp, tokenBadge: "↑1 ↓2" },
      ]),
    ).toEqual([
      { role: "user", content: "请流式输出", timestamp: 200 },
      { role: "assistant", content: "第一段第二段", timestamp: pendingTimestamp, tokenBadge: "↑1 ↓2" },
    ]);
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
});
