import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStaleRunningDetector } from "@/features/session/runtime/use-stale-running-detector";

describe("useStaleRunningDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns not stale when busy is false", () => {
    const { result } = renderHook(() =>
      useStaleRunningDetector({ busy: false, messages: [] }),
    );
    expect(result.current.isStaleRunning).toBe(false);
    expect(result.current.staleSeconds).toBe(0);
  });

  it("returns not stale initially when busy is true", () => {
    const { result } = renderHook(() =>
      useStaleRunningDetector({ busy: true, messages: [] }),
    );
    expect(result.current.isStaleRunning).toBe(false);
  });

  it("becomes stale after threshold with no message changes", () => {
    const { result } = renderHook(() =>
      useStaleRunningDetector({ busy: true, messages: [{ role: "user", content: "hi" }] }),
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });

    expect(result.current.isStaleRunning).toBe(true);
    expect(result.current.staleSeconds).toBeGreaterThanOrEqual(45);
  });

  it("resets when messages change", () => {
    const messages = [{ role: "user", content: "hi" }];
    const { result, rerender } = renderHook(
      ({ busy, msgs }) => useStaleRunningDetector({ busy, messages: msgs }),
      { initialProps: { busy: true, msgs: messages } },
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(result.current.isStaleRunning).toBe(true);

    const newMessages = [...messages, { role: "assistant", content: "hello" }];
    rerender({ busy: true, msgs: newMessages });

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.isStaleRunning).toBe(false);
  });

  it("resets when busy becomes false", () => {
    const { result, rerender } = renderHook(
      ({ busy }) => useStaleRunningDetector({ busy, messages: [] }),
      { initialProps: { busy: true } },
    );

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    expect(result.current.isStaleRunning).toBe(true);

    rerender({ busy: false });
    expect(result.current.isStaleRunning).toBe(false);
    expect(result.current.staleSeconds).toBe(0);
  });
});
