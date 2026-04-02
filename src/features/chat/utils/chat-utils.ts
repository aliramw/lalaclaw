export const maxPromptRows = 8;
export const rapidEnterSendThresholdMs = 420;

const textAttachmentExtensions = /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|scss|less|html|htm|xml|yml|yaml|py|rb|go|rs|java|kt|swift|sh|bash|zsh|sql|csv|log)$/i;
const textAttachmentMimePattern = /^(text\/|application\/(json|xml|javascript|x-javascript)|image\/svg\+xml)/i;

export function formatTime(timestamp: number | string | Date, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export function formatCompactK(value: unknown) {
  const numeric = Number(value) || 0;
  if (numeric < 1000) return String(numeric);
  if (numeric >= 1_000_000) {
    const scaledMillion = numeric / 1_000_000;
    if (scaledMillion >= 10) return `${Math.round(scaledMillion)}m`;
    return `${scaledMillion.toFixed(1).replace(/\.0$/, "")}m`;
  }
  const scaled = numeric / 1000;
  if (scaled >= 10) return `${Math.round(scaled)}k`;
  return `${scaled.toFixed(1).replace(/\.0$/, "")}k`;
}

export function isImageAttachmentFile(file: { type?: string } | null | undefined) {
  return /^image\//i.test(file?.type || "");
}

export function isTextAttachmentFile(file: { name?: string; type?: string } | null | undefined) {
  return textAttachmentMimePattern.test(file?.type || "") || textAttachmentExtensions.test(file?.name || "");
}

export function readFileAsDataUrl(file: Blob, fallbackErrorMessage = "Failed to read file as data URL") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(fallbackErrorMessage));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: Blob, fallbackErrorMessage = "Failed to read file as text") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(fallbackErrorMessage));
    reader.readAsText(file);
  });
}

export function moveCaretToEnd(textarea: HTMLTextAreaElement | HTMLInputElement | null | undefined) {
  if (!textarea) return;
  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
}

export function applyTextareaEnter(value = "", selectionStart = 0, selectionEnd = selectionStart) {
  return `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
}

export function isEditableElement(element: unknown) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (element.closest?.("[data-inline-file-editor='true'], .monaco-editor, .monaco-editor *")) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}
