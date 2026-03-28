// DOM and event utilities

export function isEditableTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  return Boolean(target.closest("textarea, input, select, [contenteditable='true'], [contenteditable='']"));
}

export function isManualScrollKey(event) {
  const key = String(event?.key || "");
  return [
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
    "Spacebar",
  ].includes(key);
}

export function hasActiveModalSurface() {
  if (typeof document === "undefined") {
    return false;
  }

  return Boolean(document.querySelector("[aria-modal='true']"));
}
