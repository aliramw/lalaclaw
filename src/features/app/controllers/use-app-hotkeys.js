import { useEffect, useEffectEvent } from "react";
import { isEditableElement } from "@/features/chat/utils";

export function useAppHotkeys({
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
    const isThemeCombo = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey;
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
    if (activeElement === textarea || isEditableElement(activeElement)) {
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
      onPromptCharacterHotkey(event);
    };

    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  }, []);
}
