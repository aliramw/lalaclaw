import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPersistence } from "@/features/app/storage";
import * as chatPersistedMessages from "@/features/chat/state/chat-persisted-messages";
import { promptDraftStorageKey } from "@/features/app/state/app-prompt-storage";

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
        ],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          startedAt: 1,
          pendingTimestamp: 2,
          progressStage: "executing",
          progressLabel: "Executing",
          progressUpdatedAt: 3,
          userMessage: { role: "user", content: "你好", timestamp: 1 },
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
            startedAt: 1,
            pendingTimestamp: 2,
            progressStage: "executing",
            progressLabel: "Executing",
            progressUpdatedAt: 3,
            userMessage: { role: "user", content: "你好", timestamp: 1 },
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
            startedAt: 1,
            pendingTimestamp: 2,
            progressStage: "executing",
            progressLabel: "Executing",
            progressUpdatedAt: 3,
            userMessage: { role: "user", content: "你好", timestamp: 1 },
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
          agentId: "main",
          key: "command-center:main",
          pendingTimestamp: 2,
          progressStage: "executing",
          progressLabel: "Executing",
          progressUpdatedAt: 3,
          sessionUser: "command-center",
          startedAt: 1,
          userMessage: { role: "user", content: "你好", timestamp: 1 },
        },
      },
    });
  });

  it("persists top-level active messages from structured tab storage instead of a stale messages prop", async () => {
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [
          { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 2 },
        ],
      },
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });

    renderHook(() =>
      useAppPersistence(createProps({
        messages: [
          { id: "stale-top-level", role: "assistant", content: "旧的顶层消息", timestamp: 1 },
        ],
        messagesByTabId: {
          "agent:main": [
            { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 2 },
          ],
        },
      })),
    );

    await waitFor(() => {
      const storedPayload = JSON.parse(window.localStorage.getItem("command-center-ui-state-v2") || "{}");
      expect(storedPayload.messages).toEqual([
        { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 2 },
      ]);
      expect(storedPayload.messagesByTabId["agent:main"]).toEqual([
        { id: "structured-active", role: "assistant", content: "结构化 active transcript", timestamp: 2 },
      ]);
    });
  });

  it("prunes stale pending turns before writing the pending storage snapshot", async () => {
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "已经完成", timestamp: 101 },
          { id: "msg-user-2", role: "user", content: "继续说", timestamp: 102 },
          { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 103 },
        ],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          startedAt: 100,
          pendingTimestamp: 101,
          assistantMessageId: "msg-assistant-1",
          userMessage: {
            id: "msg-user-1",
            role: "user",
            content: "旧问题",
            timestamp: 100,
          },
        },
      },
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });

    renderHook(() =>
      useAppPersistence(createProps({
        messages: [
          { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
          { id: "msg-assistant-1", role: "assistant", content: "已经完成", timestamp: 101 },
          { id: "msg-user-2", role: "user", content: "继续说", timestamp: 102 },
          { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 103 },
        ],
        messagesByTabId: {
          "agent:main": [
            { id: "msg-user-1", role: "user", content: "旧问题", timestamp: 100 },
            { id: "msg-assistant-1", role: "assistant", content: "已经完成", timestamp: 101 },
            { id: "msg-user-2", role: "user", content: "继续说", timestamp: 102 },
            { id: "msg-assistant-2", role: "assistant", content: "后续回复", timestamp: 103 },
          ],
        },
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
            startedAt: 100,
            pendingTimestamp: 101,
            assistantMessageId: "msg-assistant-1",
            userMessage: {
              id: "msg-user-1",
              role: "user",
              content: "旧问题",
              timestamp: 100,
            },
          },
        },
      })),
    );

    await waitFor(() => {
      expect(window.localStorage.getItem("command-center-pending-chat-v1")).toBeNull();
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
    const initialStoredMessagesByTabIdRef = { current: initialMessagesByTabId };
    const initialStoredPendingRef = { current: initialPending };
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
        initialStoredMessagesByTabIdRef,
        initialStoredPendingRef,
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

    expect(initialStoredMessagesByTabIdRef.current).toEqual({});
    expect(initialStoredPendingRef.current).toEqual({});

    const messagesByTabUpdater = setMessagesByTabId.mock.calls[0][0];
    expect(messagesByTabUpdater(initialMessagesByTabId)).toEqual(hydratedState.messagesByKey);

    const pendingUpdater = setPendingChatTurns.mock.calls[0][0];
    expect(pendingUpdater(initialPending)).toEqual(hydratedState.pendingChatTurns);
  });

  it("hydrates attachment payloads from the latest settled tab transcript instead of a stale visible ref", async () => {
    const settledMessages = [
      {
        id: "msg-assistant-settled",
        role: "assistant",
        content: "稳定输出",
        timestamp: 2,
      },
    ];
    const staleVisibleMessages = [
      {
        id: "msg-assistant-visible",
        role: "assistant",
        content: "旧的可见态",
        timestamp: 99,
        streaming: true,
      },
    ];

    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": settledMessages,
      },
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [
          {
            ...settledMessages[0],
            attachments: [{ id: "attachment-1" }],
          },
        ],
      },
      pendingChatTurns: {},
    });

    const setMessagesSynced = vi.fn();
    const initialStoredMessagesByTabIdRef = {
      current: {
        "agent:main": settledMessages,
      },
    };

    renderHook(() =>
      useAppPersistence(createProps({
        initialStoredMessagesByTabIdRef,
        messages: staleVisibleMessages,
        messagesByTabId: {
          "agent:main": settledMessages,
        },
        messagesRef: { current: staleVisibleMessages },
        setMessagesSynced,
      })),
    );

    await waitFor(() => {
      expect(setMessagesSynced).toHaveBeenCalledWith([
        {
          id: "msg-assistant-settled",
          role: "assistant",
          content: "稳定输出",
          timestamp: 2,
          attachments: [{ id: "attachment-1" }],
        },
      ]);
    });
  });

  it("clears initial stored hydration refs even when attachment hydration fails", async () => {
    const initialMessagesByTabId = { "agent:main": [{ role: "user", content: "恢复失败", timestamp: 1 }] };
    const initialPending = {
      "command-center:main": {
        key: "command-center:main",
      },
    };
    const initialStoredMessagesByTabIdRef = { current: initialMessagesByTabId };
    const initialStoredPendingRef = { current: initialPending };
    const setMessagesByTabId = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();

    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockRejectedValue(new Error("hydrate failed"));

    renderHook(() =>
      useAppPersistence({
        ...createProps({
          initialStoredMessagesByTabIdRef,
          initialStoredPendingRef,
          messages: initialMessagesByTabId["agent:main"],
          messagesByTabId: initialMessagesByTabId,
          messagesRef: { current: initialMessagesByTabId["agent:main"] },
          pendingChatTurns: initialPending,
          setMessagesByTabId,
          setMessagesSynced,
          setPendingChatTurns,
        }),
      }),
    );

    await waitFor(() => {
      expect(attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage).toHaveBeenCalledWith(initialMessagesByTabId, initialPending);
    });

    await waitFor(() => {
      expect(initialStoredMessagesByTabIdRef.current).toEqual({});
      expect(initialStoredPendingRef.current).toEqual({});
    });

    expect(setMessagesByTabId).not.toHaveBeenCalled();
    expect(setMessagesSynced).not.toHaveBeenCalled();
    expect(setPendingChatTurns).not.toHaveBeenCalled();
  });

  it("retires empty bootstrap attachment caches without starting hydration", async () => {
    const initialStoredMessagesByTabIdRef = { current: { "agent:main": [] } };
    const initialStoredPendingRef = { current: {} };
    const setMessagesByTabId = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();

    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [{ role: "user", content: "你好", timestamp: 1, pending: false }],
      },
      pendingChatTurns: {},
    });

    renderHook(() =>
      useAppPersistence({
        ...createProps({
          initialStoredMessagesByTabIdRef,
          initialStoredPendingRef,
          setMessagesByTabId,
          setMessagesSynced,
          setPendingChatTurns,
        }),
      }),
    );

    await waitFor(() => {
      expect(attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage).not.toHaveBeenCalled();
      expect(initialStoredMessagesByTabIdRef.current).toEqual({});
      expect(initialStoredPendingRef.current).toEqual({});
    });

    expect(setMessagesByTabId).not.toHaveBeenCalled();
    expect(setMessagesSynced).not.toHaveBeenCalled();
    expect(setPendingChatTurns).not.toHaveBeenCalled();
  });

  it("persists inline image attachments immediately instead of waiting for the debounce window", async () => {
    vi.useFakeTimers();
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {
        "agent:main": [
          {
            role: "user",
            content: "看图",
            timestamp: 1,
            attachments: [
              {
                id: "image-1",
                kind: "image",
                name: "avatar.png",
                mimeType: "image/png",
                storageKey: "image-1",
              },
            ],
          },
        ],
      },
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });

    const imageMessage = {
      role: "user",
      content: "看图",
      timestamp: 1,
      attachments: [
        {
          id: "image-1",
          kind: "image",
          name: "avatar.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,AAAA",
          previewUrl: "data:image/png;base64,AAAA",
        },
      ],
    };

    renderHook(() => useAppPersistence(createProps({
      messages: [imageMessage],
      messagesByTabId: {
        "agent:main": [imageMessage],
      },
    })));

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledTimes(1);
    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledWith(
      {
        "agent:main": [imageMessage],
      },
      {},
    );

    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockClear();
    await vi.advanceTimersByTimeAsync(449);
    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).not.toHaveBeenCalled();
  });

  it("merges hydrated attachment payloads into newer runtime conversation state", async () => {
    let resolveHydration;
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockReturnValue(
      new Promise((resolve) => {
        resolveHydration = resolve;
      }),
    );

    const initialMessages = [
      {
        role: "user",
        content: "只用一句话说你看到了什么",
        timestamp: 1,
        attachments: [
          {
            id: "image-1",
            kind: "image",
            name: "avatar.png",
            storageKey: "image-1",
          },
        ],
      },
    ];
    const initialMessagesByTabId = { "agent:main": initialMessages };
    const initialPending = {
      "command-center:main": {
        key: "command-center:main",
        userMessage: initialMessages[0],
      },
    };
    const runtimeMessages = [
      initialMessages[0],
      { role: "assistant", content: "我看到一个卡通化的大头公仔人物。", timestamp: 2 },
    ];
    const messagesRef = { current: runtimeMessages };
    const setMessagesByTabId = vi.fn();
    const setMessagesSynced = vi.fn();
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
        messages: runtimeMessages,
        messagesByTabId: { "agent:main": runtimeMessages },
        messagesRef,
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

    resolveHydration({
      messagesByKey: {
        "agent:main": [
          {
            role: "user",
            content: "只用一句话说你看到了什么",
            timestamp: 1,
            attachments: [
              {
                id: "image-1",
                kind: "image",
                name: "avatar.png",
                storageKey: "image-1",
                dataUrl: "data:image/png;base64,AAAA",
                previewUrl: "data:image/png;base64,AAAA",
              },
            ],
          },
        ],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          userMessage: {
            role: "user",
            content: "只用一句话说你看到了什么",
            timestamp: 1,
            attachments: [
              {
                id: "image-1",
                kind: "image",
                name: "avatar.png",
                storageKey: "image-1",
                dataUrl: "data:image/png;base64,AAAA",
              },
            ],
          },
        },
      },
    });

    await waitFor(() => {
      expect(setMessagesByTabId).toHaveBeenCalled();
      expect(setMessagesSynced).toHaveBeenCalled();
      expect(setPendingChatTurns).toHaveBeenCalled();
    });

    const messagesByTabUpdater = setMessagesByTabId.mock.calls[0][0];
    expect(messagesByTabUpdater({ "agent:main": runtimeMessages })).toEqual({
      "agent:main": [
        {
          role: "user",
          content: "只用一句话说你看到了什么",
          timestamp: 1,
          attachments: [
            expect.objectContaining({
              id: "image-1",
              dataUrl: "data:image/png;base64,AAAA",
              previewUrl: "data:image/png;base64,AAAA",
            }),
          ],
        },
        { role: "assistant", content: "我看到一个卡通化的大头公仔人物。", timestamp: 2 },
      ],
    });

    expect(setMessagesSynced).toHaveBeenCalledWith([
      {
        role: "user",
        content: "只用一句话说你看到了什么",
        timestamp: 1,
        attachments: [
          expect.objectContaining({
            id: "image-1",
            dataUrl: "data:image/png;base64,AAAA",
            previewUrl: "data:image/png;base64,AAAA",
          }),
        ],
      },
      { role: "assistant", content: "我看到一个卡通化的大头公仔人物。", timestamp: 2 },
    ]);

    const pendingUpdater = setPendingChatTurns.mock.calls[0][0];
    expect(pendingUpdater(initialPending)).toEqual({
      "command-center:main": {
        key: "command-center:main",
        userMessage: {
          role: "user",
          content: "只用一句话说你看到了什么",
          timestamp: 1,
          attachments: [
            expect.objectContaining({
              id: "image-1",
              dataUrl: "data:image/png;base64,AAAA",
            }),
          ],
        },
      },
    });
  });

  it("does not re-add reset messages or stale pending turns when attachment hydration resolves late", async () => {
    let resolveHydration;
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockReturnValue(
      new Promise((resolve) => {
        resolveHydration = resolve;
      }),
    );

    const initialMessages = [
      {
        role: "user",
        content: "晚到的附件恢复",
        timestamp: 1,
        attachments: [
          {
            id: "image-1",
            kind: "image",
            name: "avatar.png",
            storageKey: "image-1",
          },
        ],
      },
    ];
    const initialMessagesByTabId = { "agent:main": initialMessages };
    const initialPending = {
      "command-center:main": {
        key: "command-center:main",
        userMessage: initialMessages[0],
      },
    };
    const messagesRef = { current: initialMessages };
    const setMessagesByTabId = vi.fn();
    const setMessagesSynced = vi.fn();
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
        messagesRef,
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

    messagesRef.current = [];

    resolveHydration({
      messagesByKey: {
        "agent:main": [
          {
            role: "user",
            content: "晚到的附件恢复",
            timestamp: 1,
            attachments: [
              {
                id: "image-1",
                kind: "image",
                name: "avatar.png",
                storageKey: "image-1",
                dataUrl: "data:image/png;base64,AAAA",
              },
            ],
          },
        ],
      },
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          userMessage: {
            role: "user",
            content: "晚到的附件恢复",
            timestamp: 1,
            attachments: [
              {
                id: "image-1",
                kind: "image",
                name: "avatar.png",
                storageKey: "image-1",
                dataUrl: "data:image/png;base64,AAAA",
              },
            ],
          },
        },
      },
    });

    await waitFor(() => {
      expect(setMessagesByTabId).toHaveBeenCalled();
      expect(setPendingChatTurns).toHaveBeenCalled();
    });

    const messagesByTabUpdater = setMessagesByTabId.mock.calls[0][0];
    expect(messagesByTabUpdater({})).toEqual({});

    const pendingUpdater = setPendingChatTurns.mock.calls[0][0];
    expect(pendingUpdater({})).toEqual({});

    expect(setMessagesSynced).not.toHaveBeenCalled();
  });

  it("hydrates initial attachment storage only once and applies active messages for the latest active tab", async () => {
    let resolveHydration;
    attachmentStorageMocks.serializeAttachmentStateByKeyForStorage.mockResolvedValue({
      messagesByKey: {},
      pendingChatTurns: {},
    });
    attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage.mockReturnValue(
      new Promise((resolve) => {
        resolveHydration = resolve;
      }),
    );

    const initialMessagesByTabId = {
      "agent:main": [{ role: "user", content: "主会话", timestamp: 1 }],
      "agent:paint": [{ role: "user", content: "副会话", timestamp: 2 }],
    };
    const messagesRef = { current: initialMessagesByTabId["agent:main"] };
    const setMessagesByTabId = vi.fn();
    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();

    const { rerender } = renderHook((props) => useAppPersistence(props), {
      initialProps: createProps({
        activeChatTabId: "agent:main",
        chatTabs: [
          { id: "agent:main", agentId: "main", sessionUser: "command-center" },
          { id: "agent:paint", agentId: "paint", sessionUser: "command-center-paint-1" },
        ],
        initialStoredMessagesByTabIdRef: { current: initialMessagesByTabId },
        initialStoredPendingRef: { current: {} },
        messages: initialMessagesByTabId["agent:main"],
        messagesByTabId: initialMessagesByTabId,
        messagesRef,
        setMessagesByTabId,
        setMessagesSynced,
        setPendingChatTurns,
        tabMetaById: {
          "agent:main": {
            agentId: "main",
            sessionUser: "command-center",
            model: "",
            fastMode: false,
            thinkMode: "off",
          },
          "agent:paint": {
            agentId: "paint",
            sessionUser: "command-center-paint-1",
            model: "",
            fastMode: false,
            thinkMode: "off",
          },
        },
      }),
    });

    messagesRef.current = initialMessagesByTabId["agent:paint"];

    rerender(createProps({
      activeChatTabId: "agent:paint",
      chatTabs: [
        { id: "agent:main", agentId: "main", sessionUser: "command-center" },
        { id: "agent:paint", agentId: "paint", sessionUser: "command-center-paint-1" },
      ],
      initialStoredMessagesByTabIdRef: { current: initialMessagesByTabId },
      initialStoredPendingRef: { current: {} },
      messages: initialMessagesByTabId["agent:paint"],
      messagesByTabId: initialMessagesByTabId,
      messagesRef,
      setMessagesByTabId,
      setMessagesSynced,
      setPendingChatTurns,
      tabMetaById: {
        "agent:main": {
          agentId: "main",
          sessionUser: "command-center",
          model: "",
          fastMode: false,
          thinkMode: "off",
        },
        "agent:paint": {
          agentId: "paint",
          sessionUser: "command-center-paint-1",
          model: "",
          fastMode: false,
          thinkMode: "off",
        },
      },
    }));

    resolveHydration({
      messagesByKey: {
        "agent:main": [{ role: "user", content: "主会话", timestamp: 1, attachments: [{ id: "main-a1" }] }],
        "agent:paint": [{ role: "user", content: "副会话", timestamp: 2, attachments: [{ id: "paint-a1" }] }],
      },
      pendingChatTurns: {},
    });

    await waitFor(() => {
      expect(attachmentStorageMocks.hydrateAttachmentStateByKeyFromStorage).toHaveBeenCalledTimes(1);
      expect(setMessagesSynced).toHaveBeenCalledWith([{ role: "user", content: "副会话", timestamp: 2, attachments: [{ id: "paint-a1" }] }]);
    });
  });

  it("debounces persistence while chat messages update rapidly", async () => {
    vi.useFakeTimers();
    const sanitizeSpy = vi.spyOn(chatPersistedMessages, "sanitizeMessagesForStorage");
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
    await Promise.resolve();
    sanitizeSpy.mockClear();

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

    sanitizeSpy.mockClear();

    await vi.advanceTimersByTimeAsync(449);
    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).not.toHaveBeenCalled();
    expect(sanitizeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(attachmentStorageMocks.serializeAttachmentStateByKeyForStorage).toHaveBeenCalledTimes(1);
    expect(sanitizeSpy).toHaveBeenCalled();
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
