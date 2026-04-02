import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_SOCKET_STATES, useRuntimeSocket } from "./use-runtime-socket";

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
    this.sentMessages = [];
    MockWebSocket.instances.push(this);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === "string" ? data : JSON.stringify(data) });
    }
  }

  simulateClose(event = {}) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose(event);
  }

  simulateError() {
    if (this.onerror) this.onerror(new Error("ws error"));
  }
}

describe("useRuntimeSocket", () => {
  let originalWebSocket;

  function flushInitialConnect() {
    act(() => {
      vi.runOnlyPendingTimers();
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  it("connects when enabled", () => {
    const { result } = renderHook(() => useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }));
    flushInitialConnect();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("/api/runtime/ws");
    expect(MockWebSocket.instances[0].url).toContain("sessionUser=command-center");
    expect(MockWebSocket.instances[0].url).toContain("agentId=main");
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.CONNECTING);
  });

  it("does not connect when disabled", () => {
    const { result } = renderHook(() => useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: false }));

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.DISCONNECTED);
  });

  it("sets connected to true on open", () => {
    const { result } = renderHook(() =>
      useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }),
    );
    flushInitialConnect();

    expect(result.current.connected).toBe(false);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.CONNECTED);
  });

  it("sets connected to false on close", () => {
    const { result } = renderHook(() =>
      useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }),
    );
    flushInitialConnect();

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      MockWebSocket.instances[0].simulateClose({ reason: "network lost" });
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.RECONNECTING);
    expect(result.current.lastDisconnectReason).toBe("network lost");
    expect(result.current.reconnectAttempts).toBe(1);
  });

  it("calls onMessage handler for incoming data", () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }),
    );
    flushInitialConnect();

    act(() => {
      result.current.setOnMessage(handler);
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: "runtime.snapshot", session: {} });
    });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "runtime.snapshot" }));
  });

  it("uses the provided localized fallback when a websocket error has no close reason", () => {
    const { result } = renderHook(() =>
      useRuntimeSocket({
        sessionUser: "command-center",
        agentId: "main",
        enabled: true,
        disconnectErrorLabel: "Localized socket error",
      }),
    );
    flushInitialConnect();

    act(() => {
      MockWebSocket.instances[0].simulateError();
    });

    expect(result.current.lastDisconnectReason).toBe("Localized socket error");
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.RECONNECTING);
  });

  it("responds to ping with pong", () => {
    renderHook(() => useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }));
    flushInitialConnect();

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: "ping", ts: 12345 });
    });

    const sent = MockWebSocket.instances[0].sentMessages;
    expect(sent).toHaveLength(1);
    const parsed = JSON.parse(sent[0]);
    expect(parsed.type).toBe("pong");
    expect(parsed.ts).toBe(12345);
  });

  it("does not pass ping messages to onMessage handler", () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }),
    );
    flushInitialConnect();

    act(() => {
      result.current.setOnMessage(handler);
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: "ping", ts: 12345 });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("reconnects after close with exponential backoff", () => {
    const { result } = renderHook(() => useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }));
    flushInitialConnect();

    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.RECONNECTING);

    // 第一次重连延迟 1000ms
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("resets reconnect counter on successful open", () => {
    renderHook(() => useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }));
    flushInitialConnect();

    // 第一次连接打开后关闭
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    // 1000ms 后重连（第一次退避）
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    // 第二次也打开然后关闭
    act(() => {
      MockWebSocket.instances[1].simulateOpen();
    });
    act(() => {
      MockWebSocket.instances[1].simulateClose();
    });

    // 又是 1000ms（计数器已重置）
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("disconnects cleanly when disabled", () => {
    const { rerender, result } = renderHook(
      ({ enabled }) => useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled }),
      { initialProps: { enabled: true } },
    );
    flushInitialConnect();

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    rerender({ enabled: false });

    // 不应该有重连
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe(RUNTIME_SOCKET_STATES.DISCONNECTED);
  });

  it("disconnects on unmount", () => {
    const { unmount } = renderHook(() =>
      useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }),
    );
    flushInitialConnect();

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    unmount();

    // 不应该有重连
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("cancels a pending initial connect when unmounted before the timer fires", () => {
    const { unmount } = renderHook(() =>
      useRuntimeSocket({ sessionUser: "command-center", agentId: "main", enabled: true }),
    );

    expect(MockWebSocket.instances).toHaveLength(0);

    unmount();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
