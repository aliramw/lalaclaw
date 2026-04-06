import { describe, expect, it } from "vitest";
import { resolveMarkdownAnnotationMenuPosition } from "@/components/command-center/markdown-annotation-menu-position";

describe("resolveMarkdownAnnotationMenuPosition", () => {
  it("prefers showing the menu below the selection when there is room", () => {
    expect(
      resolveMarkdownAnnotationMenuPosition({
        rect: {
          bottom: 140,
          height: 24,
          left: 120,
          right: 220,
          top: 116,
          width: 100,
        },
        viewport: {
          height: 900,
          width: 1440,
        },
      }),
    ).toEqual({
      left: 120,
      top: 150,
    });
  });

  it("moves the menu above the selection when there is not enough room below", () => {
    expect(
      resolveMarkdownAnnotationMenuPosition({
        rect: {
          bottom: 860,
          height: 24,
          left: 320,
          right: 420,
          top: 836,
          width: 100,
        },
        viewport: {
          height: 900,
          width: 1440,
        },
      }),
    ).toEqual({
      left: 320,
      top: 702,
    });
  });

  it("includes the scroll offset when positioning inside a scrollable preview container", () => {
    expect(
      resolveMarkdownAnnotationMenuPosition({
        rect: {
          bottom: 304,
          height: 24,
          left: 220,
          right: 280,
          top: 280,
          width: 60,
        },
        scrollTop: 300,
        viewport: {
          height: 400,
          width: 600,
        },
      }),
    ).toEqual({
      left: 220,
      top: 446,
    });
  });
});
