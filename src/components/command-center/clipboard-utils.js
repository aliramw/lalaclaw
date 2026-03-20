export async function copyTextToClipboard(content) {
  await navigator.clipboard?.writeText?.(String(content || ""));
}
