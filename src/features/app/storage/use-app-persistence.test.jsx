import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPersistence } from "@/features/app/storage";

const attachmentStorageMocks = vi.hoisted(() => ({
  hydrateAttachmentStateFromStorage: vi.fn(),
  serializeAttachmentStateForStorage: vi.fn(),
}));

vi.mock("@/lib/attachment-storage", () => ({
  hydrateAttachmentStateFromStorage: attachmentStorageMocks.hydrateAttachmentStateFromStorage,
  serializeAttachmentStateForStorage: attachmentStorageMocks.serializeAttachmentStateForStorage,
}));

function createSession(overrides = {}) {
  return {
    agentId: "main",
    sessionUser: "command-center",
    thinkMode: "off",
    ...overrides,
  };
}

describe("useAppPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    attachmentStorageMocks.serializeAttachmentStateForStorage.mockReset();
    attachmentStorageMocks.hydrateAttachmentStateFromStorage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists sanitized UI state and prompt history", async () => {
    attachmentStorageMocks.serializeAttachmentStateForStorage.mockResolvedValue({
      messages: [
        { role: "user", content: "你好", timestamp: 1 },
        { role: "assistant", content: "收到", timestamp: 2, tokenBadge: "↑1" },
      ],
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
        },
      },
    });
    attachmentStorageMocks.hydrateAttachmentStateFromStorage.mockResolvedValue({
      messages: [],
      pendingChatTurns: {},
    });

    renderHook(() =>
      useAppPersistence({
        activeTab: "timeline",
        fastMode: true,
        initialStoredMessagesRef: { current: [] },
        initialStoredPendingRef: { current: {} },
        messages: [{ role: "user", content: "你好", timestamp: 1, pending: false }],
        messagesRef: { current: [] },
        model: "gpt-5",
        pendingChatTurns: {
          "command-center:main": {
            key: "command-center:main",
          },
        },
        promptHistoryByConversation: {
          "command-center:main": ["你好"],
        },
        session: createSession(),
        setMessagesSynced: vi.fn(),
        setPendingChatTurns: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(attachmentStorageMocks.serializeAttachmentStateForStorage).toHaveBeenCalled();
      expect(JSON.parse(window.localStorage.getItem("command-center-ui-state-v2") || "{}")).toMatchObject({
        activeTab: "timeline",
        fastMode: true,
        model: "gpt-5",
        sessionUser: "command-center",
      });
    });

    expect(JSON.parse(window.localStorage.getItem("command-center-prompt-history-v1") || "{}")).toEqual({
      "command-center:main": ["你好"],
    });
    expect(JSON.parse(window.localStorage.getItem("command-center-pending-chat-v1") || "{}")).toEqual({
      "command-center:main": {
        key: "command-center:main",
      },
    });
  });

  it("hydrates stored attachments back into app state on mount", async () => {
    const initialMessages = [{ role: "user", content: "恢复", timestamp: 1 }];
    const initialPending = {
      "command-center:main": {
        key: "command-center:main",
      },
    };
    const hydratedState = {
      messages: [{ role: "user", content: "恢复", timestamp: 1, attachments: [{ id: "a1" }] }],
      pendingChatTurns: {
        "command-center:main": {
          key: "command-center:main",
          userMessage: { attachments: [{ id: "p1" }] },
        },
      },
    };

    attachmentStorageMocks.serializeAttachmentStateForStorage.mockResolvedValue({
      messages: initialMessages,
      pendingChatTurns: initialPending,
    });
    attachmentStorageMocks.hydrateAttachmentStateFromStorage.mockResolvedValue(hydratedState);

    const setMessagesSynced = vi.fn();
    const setPendingChatTurns = vi.fn();

    renderHook(() =>
      useAppPersistence({
        activeTab: "timeline",
        fastMode: false,
        initialStoredMessagesRef: { current: initialMessages },
        initialStoredPendingRef: { current: initialPending },
        messages: initialMessages,
        messagesRef: { current: initialMessages },
        model: "",
        pendingChatTurns: initialPending,
        promptHistoryByConversation: {},
        session: createSession(),
        setMessagesSynced,
        setPendingChatTurns,
      }),
    );

    await waitFor(() => {
      expect(attachmentStorageMocks.hydrateAttachmentStateFromStorage).toHaveBeenCalledWith(initialMessages, initialPending);
      expect(setMessagesSynced).toHaveBeenCalledWith(hydratedState.messages);
    });

    const pendingUpdater = setPendingChatTurns.mock.calls[0][0];
    expect(pendingUpdater(initialPending)).toEqual(hydratedState.pendingChatTurns);
  });
});
