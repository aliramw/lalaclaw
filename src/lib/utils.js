import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function isApplePlatform() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function formatShortcutForPlatform(shortcutLabel = "") {
  const normalized = String(shortcutLabel || "").trim();
  if (!normalized) return "";
  return isApplePlatform() ? normalized : normalized.replace(/\bCmd\b/g, "Ctrl").replace(/⌘/g, "Ctrl");
}
