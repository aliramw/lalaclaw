import { useEffect, useEffectEvent } from "react";
import { isEditableElement } from "@/features/chat/utils";

export function useAppHotkeys({
  handleActivateAdjacentChatTab,
  handleActivateChatTabByIndex,
  handlePromptChange,
  handleReset,
  prompt,
  promptRef,
  setTheme,
}) {
  const onResetHotkey = useEffectEvent((event) => {
    const isResetCombo = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.code === "KeyN" || event.key?.toLowerCase() === "n");
    if (!isResetCombo || event.repeat || event.isComposing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleReset().catch(() => {});
  });

  const onThemeHotkey = useEffectEvent((event) => {
    const normalizedKey = event.key?.toLowerCase();
    const isThemeCombo = (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && !(event.metaKey && event.ctrlKey);
    if (!isThemeCombo || event.repeat || event.isComposing) {
      return;
    }

    const nextTheme =
      normalizedKey === "f" ? "system" : normalizedKey === "l" ? "light" : normalizedKey === "d" ? "dark" : null;
    if (!nextTheme) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setTheme(nextTheme);
  });

  const onChatTabHotkey = useEffectEvent((event) => {
    const hasModifier = (event.metaKey || event.ctrlKey) && !(event.metaKey && event.ctrlKey);
    if (!hasModifier || event.shiftKey || event.altKey || event.repeat || event.isComposing) {
      return;
    }

    const normalizedKey = String(event.key || "").trim();
    if (!/^[1-9]$/.test(normalizedKey)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleActivateChatTabByIndex?.(Number.parseInt(normalizedKey, 10));
  });

  const onAdjacentChatTabHotkey = useEffectEvent((event) => {
    const normalizedKey = String(event.key || "").trim();
    const isArrowKey = normalizedKey === "ArrowLeft" || normalizedKey === "ArrowRight";
    const usesExpectedModifier =
      ((event.metaKey && !event.ctrlKey) || (event.ctrlKey && !event.metaKey))
      && !event.altKey;

    if (!isArrowKey || !usesExpectedModifier || event.shiftKey || event.repeat || event.isComposing) {
      return;
    }

    if (isEditableElement(document.activeElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleActivateAdjacentChatTab?.(normalizedKey === "ArrowLeft" ? -1 : 1);
  });

  const onPromptCharacterHotkey = useEffectEvent((event) => {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key !== " " && event.key.length !== 1) {
      return;
    }

    const textarea = promptRef.current;
    if (!textarea) {
      return;
    }

    const activeElement = document.activeElement;
    const eventTarget = event.target instanceof HTMLElement ? event.target : null;
    if (activeElement === textarea || isEditableElement(activeElement) || isEditableElement(eventTarget)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextPrompt = `${prompt}${event.key}`;
    handlePromptChange(nextPrompt);
    window.requestAnimationFrame(() => {
      const nextTextarea = promptRef.current;
      if (!nextTextarea) {
        return;
      }
      nextTextarea.focus();
      const end = nextPrompt.length;
      nextTextarea.setSelectionRange(end, end);
    });
  });

  useEffect(() => {
    const listener = (event) => {
      onResetHotkey(event);
      onThemeHotkey(event);
      onChatTabHotkey(event);
      onAdjacentChatTabHotkey(event);
      onPromptCharacterHotkey(event);
    };

    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  }, []);
}
