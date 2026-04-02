import { useCallback, useEffect, useRef, useState } from "react";

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];
const PING_TIMEOUT_MS = 45000;
export const RUNTIME_SOCKET_STATES = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
} as const;

type RuntimeSocketState = (typeof RUNTIME_SOCKET_STATES)[keyof typeof RUNTIME_SOCKET_STATES];

type RuntimeSocketMessage = {
  ts?: unknown;
  type?: string;
} & Record<string, unknown>;

type UseRuntimeSocketInput = {
  agentId?: string;
  disconnectErrorLabel?: string;
  enabled?: boolean;
  sessionUser?: string;
};

type RuntimeSocketHandler = ((payload: RuntimeSocketMessage) => void) | null;

function buildWsUrl(sessionUser = "", agentId = "") {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ sessionUser });
  if (agentId) {
    params.set("agentId", agentId);
  }
  return `${protocol}//${window.location.host}/api/runtime/ws?${params}`;
}

/**
 * Low-level WebSocket transport hook for the runtime channel.
 *
 * Returns connection state and an `onMessage` registration callback.
 * The parent hook (useRuntimeSnapshot) decides how to apply incoming
 * events to React state.
 */
export function useRuntimeSocket({ sessionUser = "", agentId = "", disconnectErrorLabel = "WebSocket error", enabled = true }: UseRuntimeSocketInput) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<RuntimeSocketState>(
    enabled ? RUNTIME_SOCKET_STATES.CONNECTING : RUNTIME_SOCKET_STATES.DISCONNECTED,
  );
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastDisconnectReason, setLastDisconnectReason] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const connectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const onMessageRef = useRef<RuntimeSocketHandler>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setOnMessage = useCallback((handler: RuntimeSocketHandler) => {
    onMessageRef.current = handler;
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    setStatus(reconnectAttemptRef.current > 0 ? RUNTIME_SOCKET_STATES.RECONNECTING : RUNTIME_SOCKET_STATES.CONNECTING);
    const url = buildWsUrl(sessionUser, agentId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatus(RUNTIME_SOCKET_STATES.CONNECTED);
      reconnectAttemptRef.current = 0;
      setReconnectAttempts(0);
      setLastDisconnectReason("");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RuntimeSocketMessage;

        if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: payload.ts }));
          if (pingTimerRef.current != null) {
            clearTimeout(pingTimerRef.current);
          }
          pingTimerRef.current = window.setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(4000, "Ping timeout");
            }
          }, PING_TIMEOUT_MS);
          return;
        }

        if (onMessageRef.current) {
          onMessageRef.current(payload);
        }
      } catch {}
    };

    ws.onclose = (event) => {
      setConnected(false);
      if (pingTimerRef.current != null) {
        clearTimeout(pingTimerRef.current);
      }
      wsRef.current = null;
      const nextReason = String(event?.reason || "").trim() || (event?.code ? `code ${event.code}` : "closed");
      setLastDisconnectReason(nextReason);

      if (!enabledRef.current) {
        setStatus(RUNTIME_SOCKET_STATES.DISCONNECTED);
        return;
      }

      const attempt = reconnectAttemptRef.current;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
       setReconnectAttempts(attempt + 1);
      setStatus(RUNTIME_SOCKET_STATES.RECONNECTING);
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      if (pingTimerRef.current != null) {
        clearTimeout(pingTimerRef.current);
      }
      if (enabledRef.current && ws.readyState !== WebSocket.OPEN) {
        setLastDisconnectReason((current) => current || disconnectErrorLabel);
        setStatus(RUNTIME_SOCKET_STATES.RECONNECTING);
      }
    };
  }, [sessionUser, agentId, disconnectErrorLabel]);

  const disconnect = useCallback(() => {
    if (connectTimerRef.current != null) {
      clearTimeout(connectTimerRef.current);
    }
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (pingTimerRef.current != null) {
      clearTimeout(pingTimerRef.current);
    }
    reconnectAttemptRef.current = 0;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setStatus(RUNTIME_SOCKET_STATES.DISCONNECTED);
    setReconnectAttempts(0);
  }, []);

  useEffect(() => {
    if (enabled) {
      if (connectTimerRef.current != null) {
        clearTimeout(connectTimerRef.current);
      }
      connectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 0);
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    connected,
    lastDisconnectReason,
    reconnectAttempts,
    status,
    setOnMessage,
    disconnect,
  };
}
