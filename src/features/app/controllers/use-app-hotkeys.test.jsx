import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppHotkeys } from "@/features/app/controllers";

describe("useAppHotkeys", () => {
  let textarea;
  let requestAnimationFrameSpy;

  beforeEach(() => {
    textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
    textarea.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("triggers reset on ctrl/cmd+n", async () => {
    const handleReset = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useAppHotkeys({
        handlePromptChange: vi.fn(),
        handleReset,
        prompt: "",
        promptRef: { current: textarea },
        setTheme: vi.fn(),
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "n",
      code: "KeyN",
    });

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(handleReset).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("switches theme for cmd+shift shortcuts", () => {
    const setTheme = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handlePromptChange: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        prompt: "",
        promptRef: { current: textarea },
        setTheme,
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        shiftKey: true,
        key: "d",
        code: "KeyD",
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        shiftKey: true,
        key: "l",
        code: "KeyL",
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        shiftKey: true,
        key: "f",
        code: "KeyF",
      }),
    );

    expect(setTheme).toHaveBeenNthCalledWith(1, "dark");
    expect(setTheme).toHaveBeenNthCalledWith(2, "light");
    expect(setTheme).toHaveBeenNthCalledWith(3, "system");
  });

  it("captures plain character input when focus is outside editable elements", () => {
    const handlePromptChange = vi.fn((value) => {
      textarea.value = value;
    });
    const otherButton = document.createElement("button");
    document.body.appendChild(otherButton);
    otherButton.focus();

    renderHook(() =>
      useAppHotkeys({
        handlePromptChange,
        handleReset: vi.fn().mockResolvedValue(undefined),
        prompt: "已有",
        promptRef: { current: textarea },
        setTheme: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "x",
          code: "KeyX",
        }),
      );
    });

    expect(handlePromptChange).toHaveBeenCalledWith("已有x");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });
});
