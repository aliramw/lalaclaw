// Text processing utilities

export function estimateVisualLineCount(content = "") {
  const lines = String(content || "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  return Math.max(lines.length, 1);
}

export function getAgentMentionMatch(value = "", caret = 0) {
  const safeValue = String(value || "");
  const safeCaret = Number.isFinite(caret) ? Math.max(0, Math.min(caret, safeValue.length)) : safeValue.length;
  const beforeCaret = safeValue.slice(0, safeCaret);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCaret);

  if (!match) {
    return null;
  }

  return {
    start: beforeCaret.length - String(match[2] || "").length - 1,
    end: safeCaret,
    query: match[2] || "",
  };
}

export function shouldIgnoreMentionKeyUp(key = "") {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Tab" || key === "Escape";
}
