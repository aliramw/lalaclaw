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

  it("keeps shell aliases highlightable for read-only file previews", async () => {
    expect(normalizePrismLanguage("bash")).toBe("bash");
    expect(normalizePrismLanguage("sh")).toBe("bash");
    expect(normalizePrismLanguage("zsh")).toBe("bash");
    expect(normalizePrismLanguage("shell")).toBe("bash");

    await expect(ensurePrismLanguage("bash")).resolves.toBe("bash");
    expect(Prism.languages.bash || Prism.languages.shell).toBeTruthy();
  });

  it("keeps powershell highlightable for read-only file previews", async () => {
    expect(normalizePrismLanguage("ps1")).toBe("powershell");
    expect(normalizePrismLanguage("powershell")).toBe("powershell");

    await expect(ensurePrismLanguage("ps1")).resolves.toBe("powershell");
    expect(Prism.languages.powershell).toBeTruthy();
  });

  it("keeps ini highlightable for read-only file previews", async () => {
    expect(normalizePrismLanguage("ini")).toBe("ini");

    await expect(ensurePrismLanguage("ini")).resolves.toBe("ini");
    expect(Prism.languages.ini).toBeTruthy();
  });

  it("keeps toml highlightable for read-only file previews", async () => {
    expect(normalizePrismLanguage("toml")).toBe("toml");

    await expect(ensurePrismLanguage("toml")).resolves.toBe("toml");
    expect(Prism.languages.toml).toBeTruthy();
  });

  it("keeps log highlightable for read-only file previews", async () => {
    expect(normalizePrismLanguage("log")).toBe("log");

    await expect(ensurePrismLanguage("log")).resolves.toBe("log");
    expect(Prism.languages.log).toBeTruthy();
  });

  it("normalizes aliases and safely falls back for unsupported languages", async () => {
    expect(normalizePrismLanguage("md")).toBe("markdown");
    expect(normalizePrismLanguage("py")).toBe("python");
    expect(normalizePrismLanguage("zsh")).toBe("bash");
    expect(normalizePrismLanguage("ps1")).toBe("powershell");
    expect(normalizePrismLanguage("ini")).toBe("ini");
    expect(normalizePrismLanguage("toml")).toBe("toml");
    expect(normalizePrismLanguage("log")).toBe("log");

    await expect(ensurePrismLanguage("zsh")).resolves.toBe("bash");
  });
});
