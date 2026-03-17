import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPersistence } from "@/features/app/storage";
import { promptDraftStorageKey } from "@/features/app/storage/app-storage";

const attachmentStorageMocks = vi.hoisted(() => ({
  hydrateAttachmentStateByKeyFromStorage: vi.fn(),
  serializeAttachmentStateByKeyForStorage: vi.fn(),
}));

vi.mock("@/lib/attachment-storage", () => ({
  hydrateAttachmentStateByKeyFromStorage: attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage,
  serializeAttachmentStateByKeyForStorage: attachmentStorageMocks.serializeAttachmentStateByKeyForStorage,
}));

function createSession(overrides = {}) {
  return {
    agentId: "main",
    sessionUser: "command-center",
    thinkMode: "off",
    ...overrides,
  };
}

function createProps(overrides = {}) {
  return {
    activeChatTabId: "agent:main",
    activeTab: "timeline",
    chatFontSize: "small",
    composerSendMode: "enter-send",
    chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
    dismissedTaskRelationshipIdsByConversation: {},
    fastMode: false,
    initialStoredMessagesByTabIdRef: { current: {} },
    initialStoredPendingRef: { current: {} },
    inspectorPanelWidth: 380,
    messages: [{ role: "user", content: "你好", timestamp: 1, pending: false }],
    messagesByTabId: {
      "agent:main": [{ role: "user", content: "你好", timestamp: 1, pending: false }],
    },
    messagesRef: { current: [] },
    model: "",
    pendingChatTurns: {},
    promptDraftsByConversation: {},
    promptHistoryByConversation: {},
    session: createSession(),
    setMessagesByTabId: vi.fn(),
    setMessagesSynced: vi.fn(),
    setPendingChatTurns: vi.fn(),
    tabMetaById: {
      "agent:main": {
        agentId: "main",
        fastMode: false,
        model: "",
        sessionUser: "command-center",
        thinkMode: "off",
      },
    },
    ...overrides,
  };
}

describe("useAppPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockReset();
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists sanitized UI state and prompt history", async () => {
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [
          { role: "user", content: "你好", timestamp: 1 },
          { role: "assistant", content: "收到", timestamp: 2, tokenBadge: "↑1" },
        ],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
        },
      },
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });

    renderHook(() =>
      useAppPersistence({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatFontSize: "medium",
        composerSendMode: "double-enter-send",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        dismissedTaskRelationshipIdsByConversation: {
          "command-center:main": ["rel-agent-1"],
        },
        fastMode: true,
        initialStoredMessagesByTabIdRef: { current: {} },
        initialStoredPendingRef: { current: {} },
        inspectorPanelWidth: 432,
        messages: [{ role: "user", content: "你好", timestamp: 1, pending: false }],
        messagesByTabId: {
          "agent:main": [{ role: "user", content: "你好", timestamp: 1, pending: false }],
        },
        messagesRef: { current: [] },
        model: "gpt-5",
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
          },
        },
        promptDraftsByConversation: {
          "command-center:main": "还没发送",
        },
        promptHistoryByConversation: {
          "command-center:main": ["你好"],
        },
        session: createSession(),
        setMessagesByTabId: vi.fn(),
        setMessagesSynced: vi.fn(),
        setPendingChatTurns: vi.fn(),
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: true,
            model: "gpt-5",
            sessionUser: "command-center",
            thinkMode: "off",
          },
        },
      }),
    );

    await waitFor(() => {
      expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledWith(
        {
          "agent:main": [{ role: "user", content: "你好", timestamp: 1, pending: false }],
        },
        {
          "command-center:main": {
            key: "command-center:main",
          },
        },
      );
      expect(JSON.parse(window.localStorage.getItem("command-center-ui-state-v2") || "{}")).toMatchObject({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatFontSize: "medium",
        composerSendMode: "double-enter-send",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        dismissedTaskRelationshipIdsByConversation: {
          "command-center:main": ["rel-agent-1"],
        },
        fastMode: true,
        inspectorPanelWidth: 432,
        model: "gpt-5",
        promptDraftsByConversation: {
          "command-center:main": "还没发送",
        },
        sessionUser: "command-center",
      });
    });

    expect(JSON.parse(window.localStorage.getItem("command-center-prompt-drafts-v1") || "{}")).toEqual({
      "command-center:main": "还没发送",
    });
    expect(JSON.parse(window.localStorage.getItem("command-center-prompt-history-v1") || "{}")).toEqual({
      "command-center:main": ["你好"],
    });
    expect(JSON.parse(window.localStorage.getItem("command-center-pending-chat-v1") || "{}")).toEqual({
      _persistedAt: expect.any(Number),
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
        },
      },
    });
  });

  it("hydrates stored attachments back into app state on mount", async () => {
    const initialMessages = [{ role: "user", content: "恢复", timestamp: 1 }];
    const initialMessagesByTabId = { "agent:main": initialMessages };
    const initialPending = {
      "command-center:main": {
        key: "command-center:main",
      },
    };
    const hydratedState = {
      messagesByKey: {
        "agent:main": [{ role: "user", content: "恢复", timestamp: 1, attachments: [{ id: "a1" }] }],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          userMessage: { attachments: [{ id: "p1" }] },
        },
      },
    };

    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: initialMessagesByTabId,
      pendingChatTurns: initialPending,
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue(hydratedState);

    const setMessagesSynced = vi.fn();
    const setMessagesByTabId = vi.fn();
    const setPendingChatTurns = vi.fn();

    renderHook(() =>
      useAppPersistence({
        activeChatTabId: "agent:main",
        activeTab: "timeline",
        chatFontSize: "small",
        composerSendMode: "enter-send",
        chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
        dismissedTaskRelationshipIdsByConversation: {},
        fastMode: false,
        initialStoredMessagesByTabIdRef: { current: initialMessagesByTabId },
        initialStoredPendingRef: { current: initialPending },
        inspectorPanelWidth: 380,
        messages: initialMessages,
        messagesByTabId: initialMessagesByTabId,
        messagesRef: { current: initialMessages },
        model: "",
        pendingChatTurns: initialPending,
        promptDraftsByConversation: {},
        promptHistoryByConversation: {},
        session: createSession(),
        setMessagesByTabId,
        setMessagesSynced,
        setPendingChatTurns,
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            fastMode: false,
            model: "",
            sessionUser: "command-center",
            thinkMode: "off",
          },
        },
      }),
    );

    await waitFor(() => {
      expect(attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage).toHaveBeenCalledWith(initialMessagesByTabId, initialPending);
      expect(setMessagesByTabId).toHaveBeenCalled();
      expect(setMessagesSynced).toHaveBeenCalledWith(hydratedState.messagesByKey["agent:main"]);
    });

    const messagesByTabUpdater = setMessagesByTabId.mock.calls[0][0];
    expect(messagesByTabUpdater(initialMessagesByTabId)).toEqual(hydratedState.messagesByKey);

    const pendingUpdater = setPendingChatTurns.mock.calls[0][0];
    expect(pendingUpdater(initialPending)).toEqual(hydratedState.pendingChatTurns);
  });

  it("debounces persistence while chat messages update rapidly", async () => {
    vi.useFakeTimers();
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [{ role: "assistant", content: "最终输出", timestamp: 3 }],
      },
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });

    const { rerender } = renderHook((props) => useAppPersistence(props), {
      initialProps: createProps(),
    });

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledTimes(1);
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockClear();
    expect(JSON.parse(window.localStorage.getItem(promptDraftStorageKey) || "{}")).toEqual({});

    rerender(createProps({
      messages: [
        { role: "user", content: "你好", timestamp: 1, pending: false },
        { role: "assistant", content: "正", timestamp: 2, streaming: true },
      ],
      messagesByTabId: {
        "agent:main": [
          { role: "user", content: "你好", timestamp: 1, pending: false },
          { role: "assistant", content: "正", timestamp: 2, streaming: true },
        ],
      },
    }));

    rerender(createProps({
      messages: [
        { role: "user", content: "你好", timestamp: 1, pending: false },
        { role: "assistant", content: "正在", timestamp: 2, streaming: true },
      ],
      messagesByTabId: {
        "agent:main": [
          { role: "user", content: "你好", timestamp: 1, pending: false },
          { role: "assistant", content: "正在", timestamp: 2, streaming: true },
        ],
      },
    }));

    await vi.advanceTimersByTimeAsync(449);
    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledTimes(1);
    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledWith(
      {
        "agent:main": [
          { role: "user", content: "你好", timestamp: 1, pending: false },
          { role: "assistant", content: "正在", timestamp: 2, streaming: true },
        ],
      },
      {},
    );
  });

  it("debounces prompt draft persistence while typing rapidly", async () => {
    vi.useFakeTimers();
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [{ role: "user", content: "你好", timestamp: 1, pending: false }],
      },
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });

    const { rerender } = renderHook((props) => useAppPersistence(props), {
      initialProps: createProps(),
    });

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledTimes(1);
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockClear();

    rerender(createProps({
      promptDraftsByConversation: {
        "command-center:main": "1",
      },
    }));

    rerender(createProps({
      promptDraftsByConversation: {
        "command-center:main": "12",
      },
    }));

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(promptDraftStorageKey) || "{}")).toEqual({});

    await vi.advanceTimersByTimeAsync(449);
    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(promptDraftStorageKey) || "{}")).toEqual({});

    await vi.advanceTimersByTimeAsync(1);

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(promptDraftStorageKey) || "{}")).toEqual({
      "command-center:main": "12",
    });
  });
});
