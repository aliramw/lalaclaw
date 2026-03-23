import { describe, expect, it } from "vitest";
import { ensurePrismLanguage, normalizePrismLanguage, Prism } from "@/lib/prism-languages";

describe("prism language registration", () => {
  it("keeps bundled languages highlightable without runtime language loading", async () => {
    await Promise.all([
      ensurePrismLanguage("python"),
      ensurePrismLanguage("go"),
      ensurePrismLanguage("rust"),
      ensurePrismLanguage("yaml"),
      ensurePrismLanguage("typescript"),
      ensurePrismLanguage("tsx"),
      ensurePrismLanguage("cpp"),
    ]);

    expect(Prism.languages.python).toBeTruthy();
    expect(Prism.languages.go).toBeTruthy();
    expect(Prism.languages.rust).toBeTruthy();
    expect(Prism.languages.yaml).toBeTruthy();
    expect(Prism.languages.typescript).toBeTruthy();
    expect(Prism.languages.tsx).toBeTruthy();
    expect(Prism.languages.cpp).toBeTruthy();
  });

  it("normalizes aliases and safely falls back for unsupported languages", async () => {
    expect(normalizePrismLanguage("md")).toBe("markdown");
    expect(normalizePrismLanguage("py")).toBe("python");
    expect(normalizePrismLanguage("zsh")).toBe("text");
    expect(normalizePrismLanguage("toml")).toBe("text");

    await expect(ensurePrismLanguage("zsh")).resolves.toBe("text");
    await expect(ensurePrismLanguage("toml")).resolves.toBe("text");
  });
});
