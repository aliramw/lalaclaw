import { describe, expect, it, vi } from "vitest";
import { cn, formatShortcutForPlatform, stripMarkdownForDisplay } from "@/lib/utils";

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

describe("stripMarkdownForDisplay", () => {
  it("removes emphasis markers while preserving text", () => {
    expect(stripMarkdownForDisplay("结论先说： **重点内容**。")).toBe("结论先说： 重点内容。");
  });

  it("flattens common markdown structures into plain text", () => {
    expect(stripMarkdownForDisplay("### 标题\n- [链接](https://example.com)\n> 引用\n`代码`")).toBe("标题 链接 引用 代码");
  });
});
