import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandCenterBackgroundRuntimeSync } from "@/features/app/controllers/use-command-center-background-runtime-sync";

function mockJsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
  });
}

describe("useCommandCenterBackgroundRuntimeSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the dashboard settled transcript for background IM tabs while keeping pending turns out of the settled assistant list", async () => {
    const backgroundTabId = "agent:main::wecom-marila";
    const backgroundSessionUser = "agent:main:wecom:direct:marila";
    const backgroundMessages = [
      { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
      { id: "msg-assistant-pending-1", role: "assistant", content: "第一段", timestamp: 1050, streaming: true },
    ];
    const pendingEntry = {
      key: "agent:main:wecom:direct:marila:main",
      tabId: backgroundTabId,
      startedAt: 1000,
      pendingTimestamp: 1050,
      assistantMessageId: "msg-assistant-pending-1",
      userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
      agentId: "main",
      sessionUser: backgroundSessionUser,
    };
    const messagesByTabIdRef = {
      current: {
        [backgroundTabId]: backgroundMessages,
      },
    };
    const setMessagesForTab = vi.fn((tabId, value) => {
      const currentMessages = messagesByTabIdRef.current[tabId] || [];
      messagesByTabIdRef.current[tabId] = typeof value === "function" ? value(currentMessages) : value;
    });
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: backgroundSessionUser,
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "运行中",
        },
        conversation: [
          { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useCommandCenterBackgroundRuntimeSync({
        activeChatTabId: "agent:main",
        backgroundRuntimeAbortByTabIdRef: { current: {} },
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: backgroundTabId, agentId: "main", sessionUser: backgroundSessionUser },
        ],
        i18nFastModeOn: "已开启",
        i18nJustReset: "刚刚重置",
        i18nThinkingPlaceholder: "正在思考…",
        intlLocale: "zh-CN",
        messagesByTabIdRef,
        pendingChatTurnsRef: {
          current: {
            "agent:main:wecom:direct:marila:main": pendingEntry,
          },
        },
        runtimeRequestByTabIdRef: { current: {} },
        setBusyForTab: vi.fn(),
        setMessagesForTab,
        setRuntimeCacheByTabId: vi.fn(),
        tabMetaByIdRef: {
          current: {
            [backgroundTabId]: {
              agentId: "main",
              sessionUser: backgroundSessionUser,
              model: "openclaw",
              fastMode: false,
              thinkMode: "off",
              title: "企微 main",
            },
          },
        },
        updateTabIdentity: vi.fn(),
        updateTabMeta: vi.fn(),
        updateTabSession: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/runtime?sessionUser=agent%3Amain%3Awecom%3Adirect%3Amarila&agentId=main",
        expect.any(Object),
      );
      expect(setMessagesForTab).toHaveBeenCalledWith(backgroundTabId, [
        { id: "msg-user-1", role: "user", content: "继续", timestamp: 1000 },
      ]);
    });
  });

  it("keeps the settled local tail for background tabs when the runtime snapshot is only an older prefix", async () => {
    const backgroundTabId = "agent:expert::wecom-marila";
    const backgroundSessionUser = "agent:expert:wecom:direct:marila";
    const backgroundMessages = [
      { role: "user", content: "旧问题", timestamp: 100 },
      { role: "assistant", content: "旧回复", timestamp: 120 },
      { role: "user", content: "新问题", timestamp: 200 },
      { role: "assistant", content: "我先查一下昨天的记录", timestamp: 220 },
    ];
    const messagesByTabIdRef = {
      current: {
        [backgroundTabId]: backgroundMessages,
      },
    };
    const setMessagesForTab = vi.fn((tabId, value) => {
      const currentMessages = messagesByTabIdRef.current[tabId] || [];
      messagesByTabIdRef.current[tabId] = typeof value === "function" ? value(currentMessages) : value;
    });
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: backgroundSessionUser,
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
      useCommandCenterBackgroundRuntimeSync({
        activeChatTabId: "agent:main",
        backgroundRuntimeAbortByTabIdRef: { current: {} },
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: backgroundTabId, agentId: "expert", sessionUser: backgroundSessionUser },
        ],
        i18nFastModeOn: "已开启",
        i18nJustReset: "刚刚重置",
        i18nThinkingPlaceholder: "正在思考…",
        intlLocale: "zh-CN",
        messagesByTabIdRef,
        pendingChatTurnsRef: {
          current: {},
        },
        runtimeRequestByTabIdRef: { current: {} },
        setBusyForTab: vi.fn(),
        setMessagesForTab,
        setRuntimeCacheByTabId: vi.fn(),
        tabMetaByIdRef: {
          current: {
            [backgroundTabId]: {
              agentId: "expert",
              sessionUser: backgroundSessionUser,
              model: "claude-opus-4.6",
              fastMode: false,
              thinkMode: "off",
              title: "企微 expert",
            },
          },
        },
        updateTabIdentity: vi.fn(),
        updateTabMeta: vi.fn(),
        updateTabSession: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(setMessagesForTab).toHaveBeenCalledWith(backgroundTabId, [
        { role: "user", content: "旧问题", timestamp: 100 },
        { role: "assistant", content: "旧回复", timestamp: 120 },
        { role: "user", content: "新问题", timestamp: 200 },
        { role: "assistant", content: "我先查一下昨天的记录", timestamp: 220 },
      ]);
    });
  });

  it("does not keep a background tab busy when only a stale local streaming flag remains from an older turn", async () => {
    const backgroundTabId = "agent:main::wecom-marila";
    const backgroundSessionUser = "agent:main:wecom:direct:marila";
    const setBusyForTab = vi.fn();
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: backgroundSessionUser,
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
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
      useCommandCenterBackgroundRuntimeSync({
        activeChatTabId: "agent:main",
        backgroundRuntimeAbortByTabIdRef: { current: {} },
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: backgroundTabId, agentId: "main", sessionUser: backgroundSessionUser },
        ],
        i18nFastModeOn: "已开启",
        i18nJustReset: "刚刚重置",
        i18nThinkingPlaceholder: "正在思考…",
        intlLocale: "zh-CN",
        messagesByTabIdRef: {
          current: {
            [backgroundTabId]: [
              { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 1000 },
              { id: "msg-assistant-1", role: "assistant", content: "半截旧回复", timestamp: 1050, streaming: true },
              { id: "msg-user-2", role: "user", content: "后续问题", timestamp: 1100 },
              { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 1150 },
            ],
          },
        },
        pendingChatTurnsRef: {
          current: {},
        },
        runtimeRequestByTabIdRef: { current: {} },
        setBusyForTab,
        setMessagesForTab: vi.fn(),
        setRuntimeCacheByTabId: vi.fn(),
        tabMetaByIdRef: {
          current: {
            [backgroundTabId]: {
              agentId: "main",
              sessionUser: backgroundSessionUser,
              model: "openclaw",
              fastMode: false,
              thinkMode: "off",
              title: "企微 main",
            },
          },
        },
        updateTabIdentity: vi.fn(),
        updateTabMeta: vi.fn(),
        updateTabSession: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(setBusyForTab).toHaveBeenCalledWith(backgroundTabId, false);
    });
  });

  it("trusts an empty idle snapshot over a stale settled local tail for reset-style background IM tabs", async () => {
    const backgroundTabId = "agent:main::wecom-reset";
    const backgroundSessionUser = "agent:main:wecom:direct:marila";
    const messagesByTabIdRef = {
      current: {
        [backgroundTabId]: [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "旧回复", timestamp: 120 },
        ],
      },
    };
    const setMessagesForTab = vi.fn((tabId, value) => {
      const currentMessages = messagesByTabIdRef.current[tabId] || [];
      messagesByTabIdRef.current[tabId] = typeof value === "function" ? value(currentMessages) : value;
    });
    const fetchMock = vi.fn(() =>
      mockJsonResponse({
        ok: true,
        session: {
          sessionUser: backgroundSessionUser,
          agentId: "main",
          selectedModel: "openclaw",
          availableModels: ["openclaw"],
          availableAgents: ["main"],
          status: "空闲",
          updatedLabel: "刚刚重置",
        },
        conversation: [],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useCommandCenterBackgroundRuntimeSync({
        activeChatTabId: "agent:main",
        backgroundRuntimeAbortByTabIdRef: { current: {} },
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: backgroundTabId, agentId: "main", sessionUser: backgroundSessionUser },
        ],
        i18nFastModeOn: "已开启",
        i18nJustReset: "刚刚重置",
        i18nThinkingPlaceholder: "正在思考…",
        intlLocale: "zh-CN",
        messagesByTabIdRef,
        pendingChatTurnsRef: {
          current: {},
        },
        runtimeRequestByTabIdRef: { current: {} },
        setBusyForTab: vi.fn(),
        setMessagesForTab,
        setRuntimeCacheByTabId: vi.fn(),
        tabMetaByIdRef: {
          current: {
            [backgroundTabId]: {
              agentId: "main",
              sessionUser: backgroundSessionUser,
              model: "openclaw",
              fastMode: false,
              thinkMode: "off",
              title: "企微 main",
            },
          },
        },
        updateTabIdentity: vi.fn(),
        updateTabMeta: vi.fn(),
        updateTabSession: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(setMessagesForTab).toHaveBeenCalledWith(backgroundTabId, []);
    });
  });

});
