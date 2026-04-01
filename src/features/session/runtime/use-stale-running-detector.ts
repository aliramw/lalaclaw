import { useEffect, useMemo, useRef, useState } from "react";
import { selectChatRunBusy, type ChatRunState } from "@/features/chat/state/chat-session-state";

const STALE_THRESHOLD_MS = 45_000;
const CHECK_INTERVAL_MS = 5_000;

type UseStaleRunningDetectorInput = {
  run?: Partial<ChatRunState> | null;
};

export function useStaleRunningDetector({ run = null }: UseStaleRunningDetectorInput) {
  const [staleSeconds, setStaleSeconds] = useState(0);
  const busySinceRef = useRef<number | null>(null);
  const lastDeltaAtRef = useRef<number | null>(null);
  const runIsBusy = useMemo(() => selectChatRunBusy(run), [run]);
  const startedAt = Number(run?.startedAt || 0) || null;
  const lastDeltaAt = Number(run?.lastDeltaAt || 0) || null;

  useEffect(() => {
    if (runIsBusy) {
      const baseline = startedAt || Date.now();
      if (!busySinceRef.current) {
        busySinceRef.current = baseline;
      }
      if (!lastDeltaAtRef.current) {
        lastDeltaAtRef.current = lastDeltaAt || baseline;
      }
    } else {
      busySinceRef.current = null;
      lastDeltaAtRef.current = null;
      setStaleSeconds(0);
    }
  }, [lastDeltaAt, runIsBusy, startedAt]);

  useEffect(() => {
    if (!runIsBusy) {
      return;
    }

    if (startedAt && (!busySinceRef.current || startedAt > busySinceRef.current)) {
      busySinceRef.current = startedAt;
      setStaleSeconds(0);
    }

    if (lastDeltaAt && (!lastDeltaAtRef.current || lastDeltaAt > lastDeltaAtRef.current)) {
      lastDeltaAtRef.current = lastDeltaAt;
      setStaleSeconds(0);
    }
  }, [lastDeltaAt, runIsBusy, startedAt]);

  useEffect(() => {
    if (!runIsBusy) {
      return undefined;
    }

    const id = setInterval(() => {
      const baseline = Math.max(busySinceRef.current || 0, lastDeltaAtRef.current || 0);
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
  }, [runIsBusy]);

  return {
    isStaleRunning: staleSeconds > 0,
    staleSeconds,
  };
}
