import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCommandCenterTabState } from "@/features/app/controllers/use-command-center-tab-state";

describe("useCommandCenterTabState", () => {
  it("updates active-tab message refs synchronously before the React state setter flushes", () => {
    const activeChatTabIdRef = { current: "agent:main" };
    const chatTabsRef = { current: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }] };
    const tabMetaByIdRef = {
      current: {
        "agent:main": {
          agentId: "main",
          sessionUser: "command-center",
          model: "gpt-5",
          fastMode: false,
          thinkMode: "off",
          title: "",
          sessionFiles: [],
          sessionFileRewrites: [],
        },
      },
    };
    const nextMessages = [{ id: "msg-user-1", role: "user", content: "你好", timestamp: 100 }];
    const messagesByTabIdRef = { current: { "agent:main": [] } };
    const sessionByTabIdRef = { current: {} };
    const busyByTabIdRef = { current: {} };
    const messagesRef = { current: [] };
    const setMessages = vi.fn();
    const setMessagesByTabId = vi.fn();

    const { result } = renderHook(() =>
      useCommandCenterTabState({
        i18n: { common: { idle: "空闲" } },
        activeChatTabIdRef,
        chatTabsRef,
        tabMetaByIdRef,
        messagesByTabIdRef,
        sessionByTabIdRef,
        busyByTabIdRef,
        messagesRef,
        setBusy: vi.fn(),
        setBusyByTabId: vi.fn(),
        setChatTabs: vi.fn(),
        setFastMode: vi.fn(),
        setMessages,
        setMessagesByTabId,
        setModel: vi.fn(),
        setSession: vi.fn(),
        setSessionByTabId: vi.fn(),
        setTabMetaById: vi.fn(),
      }),
    );

    act(() => {
      result.current.setMessagesForTab("agent:main", nextMessages);
    });

    expect(messagesByTabIdRef.current["agent:main"]).toEqual(nextMessages);
    expect(messagesRef.current).toEqual(nextMessages);
    expect(setMessages).toHaveBeenCalledWith(nextMessages);
    expect(setMessagesByTabId).toHaveBeenCalledTimes(1);
  });
});
