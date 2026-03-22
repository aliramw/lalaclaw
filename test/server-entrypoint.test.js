import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("server entrypoint", () => {
  it("prefers the published server runtime when tsconfig is absent", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-server-entry-"));
    tempDirs.push(tempRoot);

    const markerPath = path.join(tempRoot, "tsc-ran.txt");
    fs.mkdirSync(path.join(tempRoot, ".server-build", "server"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, ".server-build", "server", "entry.js"),
      [
        "module.exports = {",
        "  config: { mode: 'prebuilt-runtime' },",
        "  createAppServer() { return 'app-server'; },",
        "  startServer() { return 'started'; },",
        "  __test: { getStaticDir() { return 'dist'; } },",
        "};",
      ].join("\n"),
      "utf8",
    );
    fs.mkdirSync(path.join(tempRoot, "node_modules", "typescript", "bin"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "node_modules", "typescript", "package.json"), "{}\n", "utf8");
    fs.writeFileSync(
      path.join(tempRoot, "node_modules", "typescript", "bin", "tsc"),
      `require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "ran"); process.exit(1);\n`,
      "utf8",
    );
    fs.copyFileSync(path.join(process.cwd(), "server.js"), path.join(tempRoot, "server.js"));

    const loaded = require(path.join(tempRoot, "server.js"));

    expect(loaded.config).toEqual({ mode: "prebuilt-runtime" });
    expect(loaded.createAppServer()).toBe("app-server");
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});
