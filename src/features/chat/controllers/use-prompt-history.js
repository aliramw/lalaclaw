import { useRef, useState } from "react";
import { applyTextareaEnter, moveCaretToEnd, rapidEnterSendThresholdMs } from "@/features/chat/utils";

function isImeComposingEvent(event) {
  return Boolean(
    event?.isComposing
    || event?.nativeEvent?.isComposing
    || event?.keyCode === 229
    || event?.which === 229,
  );
}

export function usePromptHistory({
  activeConversationKey,
  composerSendMode,
  composerAttachments,
  handleSend,
  promptHistoryByConversation,
  promptRef,
  setPrompt,
  syncPromptInput,
}) {
  const [promptHistoryNavigation, setPromptHistoryNavigation] = useState(null);
  const lastPlainEnterRef = useRef({ timestamp: 0, expectedValue: "" });

  const handlePromptKeyDown = (event) => {
    const textarea = event.currentTarget;
    const currentPrompt = String(textarea.value || "");
    const history = promptHistoryByConversation[activeConversationKey] || [];
    const hasComposerAttachments = composerAttachments.length > 0;
    const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
    const caretAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
    const caretAtEnd =
      textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length;
    const canBrowseUp =
      event.key === "ArrowUp" &&
      history.length &&
      !hasSelection &&
      !hasComposerAttachments &&
      (!currentPrompt || caretAtStart || promptHistoryNavigation);
    const canBrowseDown =
      event.key === "ArrowDown" &&
      history.length &&
      !hasSelection &&
      !hasComposerAttachments &&
      promptHistoryNavigation &&
      (caretAtEnd || !currentPrompt);

    if (canBrowseUp || canBrowseDown) {
      event.preventDefault();

      if (!promptHistoryNavigation || promptHistoryNavigation.key !== activeConversationKey) {
        if (event.key === "ArrowUp") {
          const nextIndex = history.length - 1;
          setPromptHistoryNavigation({
            key: activeConversationKey,
            index: nextIndex,
            draft: currentPrompt,
          });
          setPrompt(history[nextIndex] || "");
          window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
        }
        return;
      }

      if (event.key === "ArrowUp") {
        const nextIndex = Math.max(0, promptHistoryNavigation.index - 1);
        setPromptHistoryNavigation((current) => ({ ...current, index: nextIndex }));
        setPrompt(history[nextIndex] || "");
        window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
        return;
      }

      const nextIndex = promptHistoryNavigation.index + 1;
      if (nextIndex >= history.length) {
        setPrompt(promptHistoryNavigation.draft || "");
        setPromptHistoryNavigation(null);
        window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
        return;
      }

      setPromptHistoryNavigation((current) => ({ ...current, index: nextIndex }));
      setPrompt(history[nextIndex] || "");
      window.requestAnimationFrame(() => moveCaretToEnd(promptRef.current));
      return;
    }

    const isPlainEnter = event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (composerSendMode === "enter-send" && isPlainEnter && !isImeComposingEvent(event)) {
      event.preventDefault();
      lastPlainEnterRef.current = { timestamp: 0, expectedValue: "" };
      handleSend();
      return;
    }

    if (composerSendMode === "double-enter-send" && isPlainEnter && !isImeComposingEvent(event)) {
      const normalizedPrompt = currentPrompt.replace(/\r\n/g, "\n");
      const expectedValue = applyTextareaEnter(normalizedPrompt, textarea.selectionStart, textarea.selectionEnd);
      const now = Date.now();
      const isRapidRepeat =
        normalizedPrompt.includes("\n") &&
        lastPlainEnterRef.current.expectedValue === normalizedPrompt &&
        now - lastPlainEnterRef.current.timestamp <= rapidEnterSendThresholdMs;

      if (isRapidRepeat) {
        event.preventDefault();
        lastPlainEnterRef.current = { timestamp: 0, expectedValue: "" };
        handleSend();
        return;
      }

      lastPlainEnterRef.current = {
        timestamp: now,
        expectedValue,
      };
    }

    if (composerSendMode === "double-enter-send" && event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handlePromptChange = (nextPrompt) => {
    syncPromptInput(nextPrompt);
    if (!promptHistoryNavigation) {
      if (nextPrompt.replace(/\r\n/g, "\n") !== lastPlainEnterRef.current.expectedValue) {
        lastPlainEnterRef.current = { timestamp: 0, expectedValue: "" };
      }
      return;
    }

    const history = promptHistoryByConversation[activeConversationKey] || [];
    const activeHistoryEntry = history[promptHistoryNavigation.index] || "";
    if (nextPrompt !== activeHistoryEntry) {
      setPromptHistoryNavigation(null);
    }
  };

  const resetRapidEnterState = () => {
    lastPlainEnterRef.current = { timestamp: 0, expectedValue: "" };
  };

  return {
    handlePromptChange,
    handlePromptKeyDown,
    promptHistoryNavigation,
    resetRapidEnterState,
    setPromptHistoryNavigation,
  };
}
