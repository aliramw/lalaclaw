import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStaleRunningDetector } from "@/features/session/runtime/use-stale-running-detector";

function createRun(overrides = {}) {
  return {
    status: "idle",
    runId: null,
    startedAt: null,
    lastDeltaAt: null,
    streamText: "",
    ...overrides,
  };
}

describe("useStaleRunningDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns not stale when run is idle", () => {
    const { result } = renderHook(() =>
      useStaleRunningDetector({ run: createRun() }),
    );

    expect(result.current.isStaleRunning).toBe(false);
    expect(result.current.staleSeconds).toBe(0);
  });

  it("returns not stale initially when run is busy", () => {
    const now = Date.now();
    const { result } = renderHook(() =>
      useStaleRunningDetector({
        run: createRun({
          status: "streaming",
          runId: "run-1",
          startedAt: now,
          lastDeltaAt: now,
        }),
      }),
    );

    expect(result.current.isStaleRunning).toBe(false);
    expect(result.current.staleSeconds).toBe(0);
  });

  it("becomes stale after threshold with no run progress changes", () => {
    const now = Date.now();
    const { result } = renderHook(() =>
      useStaleRunningDetector({
        run: createRun({
          status: "streaming",
          runId: "run-1",
          startedAt: now,
          lastDeltaAt: now,
        }),
      }),
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });

    expect(result.current.isStaleRunning).toBe(true);
    expect(result.current.staleSeconds).toBeGreaterThanOrEqual(45);
  });

  it("resets when lastDeltaAt advances", () => {
    const now = Date.now();
    const { result, rerender } = renderHook(
      ({ run }) => useStaleRunningDetector({ run }),
      {
        initialProps: {
          run: createRun({
            status: "streaming",
            runId: "run-1",
            startedAt: now,
            lastDeltaAt: now,
          }),
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(result.current.isStaleRunning).toBe(true);

    const progressedAt = now + 50_000;
    rerender({
      run: createRun({
        status: "streaming",
        runId: "run-1",
        startedAt: now,
        lastDeltaAt: progressedAt,
      }),
    });

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.isStaleRunning).toBe(false);
    expect(result.current.staleSeconds).toBe(0);
  });

  it("resets when run becomes idle", () => {
    const now = Date.now();
    const { result, rerender } = renderHook(
      ({ run }) => useStaleRunningDetector({ run }),
      {
        initialProps: {
          run: createRun({
            status: "streaming",
            runId: "run-1",
            startedAt: now,
            lastDeltaAt: now,
          }),
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(result.current.isStaleRunning).toBe(true);

    rerender({ run: createRun() });

    expect(result.current.isStaleRunning).toBe(false);
    expect(result.current.staleSeconds).toBe(0);
  });
});
