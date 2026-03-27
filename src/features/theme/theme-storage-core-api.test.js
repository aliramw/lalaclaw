import { describe, expect, it } from "vitest";
import * as themeStorage from "@/features/theme/theme-storage";

describe("theme-storage core API", () => {
  it("only exposes the centralized theme storage contracts", () => {
    expect(Object.keys(themeStorage).sort()).toEqual([
      "loadStoredTheme",
      "themeStorageKey",
    ]);
  });
});
