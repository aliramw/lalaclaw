import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type ClassValue = Parameters<typeof clsx>[0];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isApplePlatform() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform
    || navigator.userAgent
    || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function formatShortcutForPlatform(shortcutLabel = "") {
  const normalized = String(shortcutLabel || "").trim();
  if (!normalized) {
    return "";
  }

  return isApplePlatform() ? normalized : normalized.replace(/\bCmd\b/g, "Ctrl").replace(/⌘/g, "Ctrl");
}

export function stripMarkdownForDisplay(value = "") {
  const normalized = String(value || "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) {
    return "";
  }

  let text = normalized
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(^|[\s([{'"`“‘])#{1,6}\s+/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, "")
    .replace(/(^|[\s:：])[-+*]\s+(?=\S)/g, "$1")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ")
    .replace(/(^|\s)(?:[-*_]\s*){3,}(?=\s|$)/g, " ");

  const wrapperPatterns = [
    /(?:\*\*|__)(?=\S)([\s\S]*?\S)(?:\*\*|__)/g,
    /(?:\*|_)(?=\S)([\s\S]*?\S)(?:\*|_)/g,
    /~~(?=\S)([\s\S]*?\S)~~/g,
  ];

  for (const pattern of wrapperPatterns) {
    let previous = "";
    while (previous !== text) {
      previous = text;
      text = text.replace(pattern, (_match, content: string) => content);
    }
  }

  return text
    .replace(/(\*\*|__|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
