import { describe, expect, it } from "vitest";
import { ensurePrismLanguage, normalizePrismLanguage, Prism } from "@/lib/prism-languages";

describe("prism language registration", () => {
  it("loads common non-bundled languages on demand", async () => {
    await Promise.all([
      ensurePrismLanguage("java"),
      ensurePrismLanguage("bash"),
      ensurePrismLanguage("docker"),
      ensurePrismLanguage("makefile"),
      ensurePrismLanguage("php"),
      ensurePrismLanguage("ruby"),
      ensurePrismLanguage("scala"),
      ensurePrismLanguage("csharp"),
      ensurePrismLanguage("powershell"),
      ensurePrismLanguage("toml"),
      ensurePrismLanguage("ini"),
    ]);

    expect(Prism.languages.java).toBeTruthy();
    expect(Prism.languages.bash).toBeTruthy();
    expect(Prism.languages.docker).toBeTruthy();
    expect(Prism.languages.makefile).toBeTruthy();
    expect(Prism.languages.php).toBeTruthy();
    expect(Prism.languages.ruby).toBeTruthy();
    expect(Prism.languages.scala).toBeTruthy();
    expect(Prism.languages.csharp).toBeTruthy();
    expect(Prism.languages.powershell).toBeTruthy();
    expect(Prism.languages.toml).toBeTruthy();
    expect(Prism.languages.ini).toBeTruthy();
  });

  it("normalizes common aliases before loading a language", async () => {
    expect(normalizePrismLanguage("md")).toBe("markdown");
    expect(normalizePrismLanguage("py")).toBe("python");
    expect(normalizePrismLanguage("zsh")).toBe("bash");

    await ensurePrismLanguage("zsh");
    expect(Prism.languages.bash).toBeTruthy();
  });
});
