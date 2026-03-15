import { describe, expect, it, vi } from "vitest";
import { cn, formatShortcutForPlatform } from "@/lib/utils";

describe("cn", () => {
  it("merges conditional and duplicate Tailwind classes", () => {
    expect(cn("px-2", undefined, "px-4", ["text-sm"])).toBe("px-4 text-sm");
  });
});

describe("formatShortcutForPlatform", () => {
  it("keeps Cmd shortcuts on Apple platforms", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(formatShortcutForPlatform("Cmd + N")).toBe("Cmd + N");
  });

  it("converts Cmd shortcuts to Ctrl on Windows", () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");
    expect(formatShortcutForPlatform("Cmd + N")).toBe("Ctrl + N");
  });
});
