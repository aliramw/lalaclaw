import { useCallback, useEffect, useRef, useState } from "react";

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];
const PING_TIMEOUT_MS = 45000;

function buildWsUrl(sessionUser, agentId) {
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
export function useRuntimeSocket({ sessionUser, agentId, enabled = true }) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(0);
  const pingTimerRef = useRef(0);
  const onMessageRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setOnMessage = useCallback((handler) => {
    onMessageRef.current = handler;
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    const url = buildWsUrl(sessionUser, agentId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: payload.ts }));
          clearTimeout(pingTimerRef.current);
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

    ws.onclose = () => {
      setConnected(false);
      clearTimeout(pingTimerRef.current);
      wsRef.current = null;

      if (!enabledRef.current) return;

      const attempt = reconnectAttemptRef.current;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      clearTimeout(pingTimerRef.current);
    };
  }, [sessionUser, agentId]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    clearTimeout(pingTimerRef.current);
    reconnectAttemptRef.current = 0;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    connected,
    setOnMessage,
    disconnect,
  };
}
