import { useEffect, useRef, useState } from "react";

const STALE_THRESHOLD_MS = 45_000;
const CHECK_INTERVAL_MS = 5_000;

type StaleRunningMessage = {
  content?: unknown;
  pending?: boolean;
  role?: string;
};

type UseStaleRunningDetectorInput = {
  busy?: boolean;
  messages?: StaleRunningMessage[];
};

export function useStaleRunningDetector({ busy = false, messages = [] }: UseStaleRunningDetectorInput) {
  const [staleSeconds, setStaleSeconds] = useState(0);
  const busySinceRef = useRef(0);
  const lastContentChangeRef = useRef(0);
  const messagesLengthRef = useRef(messages.length);

  useEffect(() => {
    if (busy) {
      const now = Date.now();
      if (!busySinceRef.current) {
        busySinceRef.current = now;
        lastContentChangeRef.current = now;
      }
    } else {
      busySinceRef.current = 0;
      lastContentChangeRef.current = 0;
      setStaleSeconds(0);
    }
  }, [busy]);

  useEffect(() => {
    if (!busy) {
      return;
    }
    if (messages.length !== messagesLengthRef.current) {
      messagesLengthRef.current = messages.length;
      lastContentChangeRef.current = Date.now();
      setStaleSeconds(0);
      return;
    }
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last?.content && !last?.pending) {
      lastContentChangeRef.current = Date.now();
      setStaleSeconds(0);
    }
  }, [busy, messages]);

  useEffect(() => {
    if (!busy) {
      return undefined;
    }

    const id = setInterval(() => {
      const baseline = Math.max(busySinceRef.current, lastContentChangeRef.current);
      if (!baseline) {
        return;
      }
      const elapsed = Date.now() - baseline;
      if (elapsed >= STALE_THRESHOLD_MS) {
        setStaleSeconds(Math.round(elapsed / 1000));
      } else {
        setStaleSeconds(0);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [busy]);

  return {
    isStaleRunning: staleSeconds > 0,
    staleSeconds,
  };
}
