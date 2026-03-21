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
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex: vi.fn(),
        handleReset,
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
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

  it("switches theme for cmd+shift shortcuts on macOS", () => {
    const setTheme = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
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

  it("switches theme for ctrl+shift shortcuts on Windows", () => {
    const setTheme = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
        setTheme,
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        shiftKey: true,
        key: "d",
        code: "KeyD",
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        shiftKey: true,
        key: "l",
        code: "KeyL",
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
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
    textarea.value = "已有";
    const setPromptVisible = vi.fn((value) => {
      textarea.value = value;
    });
    const otherButton = document.createElement("button");
    document.body.appendChild(otherButton);
    otherButton.focus();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible,
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

    expect(setPromptVisible).toHaveBeenCalledWith("已有x");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });

  it("activates the indexed chat tab on cmd/ctrl+number", () => {
    const handleActivateChatTabByIndex = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex,
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
        setTheme: vi.fn(),
      }),
    );

    const macEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "2",
      code: "Digit2",
      metaKey: true,
    });
    window.dispatchEvent(macEvent);

    const windowsEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "3",
      code: "Digit3",
      ctrlKey: true,
    });
    window.dispatchEvent(windowsEvent);

    expect(handleActivateChatTabByIndex).toHaveBeenNthCalledWith(1, 2);
    expect(handleActivateChatTabByIndex).toHaveBeenNthCalledWith(2, 3);
    expect(macEvent.defaultPrevented).toBe(true);
    expect(windowsEvent.defaultPrevented).toBe(true);
  });

  it("ignores unsupported chat tab hotkeys", () => {
    const handleActivateChatTabByIndex = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex,
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
        setTheme: vi.fn(),
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "0",
        code: "Digit0",
        metaKey: true,
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "1",
        code: "Digit1",
        metaKey: true,
        shiftKey: true,
      }),
    );

    expect(handleActivateChatTabByIndex).not.toHaveBeenCalled();
  });

  it("switches to adjacent tabs with cmd+arrow on macOS", () => {
    const handleActivateAdjacentChatTab = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab,
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
        setTheme: vi.fn(),
      }),
    );

    const leftEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowLeft",
      code: "ArrowLeft",
      metaKey: true,
    });
    const rightEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      code: "ArrowRight",
      metaKey: true,
    });

    window.dispatchEvent(leftEvent);
    window.dispatchEvent(rightEvent);

    expect(handleActivateAdjacentChatTab).toHaveBeenNthCalledWith(1, -1);
    expect(handleActivateAdjacentChatTab).toHaveBeenNthCalledWith(2, 1);
    expect(leftEvent.defaultPrevented).toBe(true);
    expect(rightEvent.defaultPrevented).toBe(true);
  });

  it("switches to adjacent tabs with ctrl+arrow on Windows", () => {
    const handleActivateAdjacentChatTab = vi.fn();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab,
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
        setTheme: vi.fn(),
      }),
    );

    const leftEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowLeft",
      code: "ArrowLeft",
      ctrlKey: true,
    });
    const rightEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      code: "ArrowRight",
      ctrlKey: true,
    });

    window.dispatchEvent(leftEvent);
    window.dispatchEvent(rightEvent);

    expect(handleActivateAdjacentChatTab).toHaveBeenNthCalledWith(1, -1);
    expect(handleActivateAdjacentChatTab).toHaveBeenNthCalledWith(2, 1);
    expect(leftEvent.defaultPrevented).toBe(true);
    expect(rightEvent.defaultPrevented).toBe(true);
  });

  it("does not switch adjacent tabs while focus is inside an editable field", () => {
    const handleActivateAdjacentChatTab = vi.fn();
    textarea.focus();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab,
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible: vi.fn(),
        setTheme: vi.fn(),
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowLeft",
        code: "ArrowLeft",
        metaKey: true,
      }),
    );

    expect(handleActivateAdjacentChatTab).not.toHaveBeenCalled();
  });

  it("does not steal printable keys from an inline Monaco editor", () => {
    const setPromptVisible = vi.fn();
    const editorRoot = document.createElement("div");
    editorRoot.setAttribute("data-inline-file-editor", "true");
    editorRoot.className = "monaco-editor";
    const editorSurface = document.createElement("div");
    editorSurface.tabIndex = 0;
    editorRoot.appendChild(editorSurface);
    document.body.appendChild(editorRoot);
    editorSurface.focus();

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible,
        setTheme: vi.fn(),
      }),
    );

    act(() => {
      editorSurface.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "x",
          code: "KeyX",
        }),
      );
    });

    expect(setPromptVisible).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editorSurface);
  });

  it("does not route printable keys into the prompt while a modal dialog is open", () => {
    const setPromptVisible = vi.fn();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    renderHook(() =>
      useAppHotkeys({
        handleActivateAdjacentChatTab: vi.fn(),
        handleActivateChatTabByIndex: vi.fn(),
        handleReset: vi.fn().mockResolvedValue(undefined),
        promptRef: { current: textarea },
        setPromptVisible,
        setTheme: vi.fn(),
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "e",
        code: "KeyE",
      }),
    );

    expect(setPromptVisible).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });
});
