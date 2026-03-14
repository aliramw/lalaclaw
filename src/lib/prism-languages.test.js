import { describe, expect, it } from "vitest";
import { Prism } from "@/lib/prism-languages";

describe("prism language registration", () => {
  it("registers common non-bundled languages", () => {
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
});
