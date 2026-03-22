import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildServerRuntime } = require("../scripts/build-server.cjs");
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("build:server script", () => {
  it("cleans stale .server-build artifacts before compiling", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-build-server-"));
    tempDirs.push(tempRoot);

    const staleFilePath = path.join(tempRoot, ".server-build", "server", "stale.test.js");
    const emittedEntryPath = path.join(tempRoot, ".server-build", "server", "entry.js");
    fs.mkdirSync(path.dirname(staleFilePath), { recursive: true });
    fs.writeFileSync(staleFilePath, "stale\n", "utf8");
    fs.writeFileSync(path.join(tempRoot, "tsconfig.server.json"), "{}\n", "utf8");

    let staleFileSeenDuringBuild = true;
    const status = buildServerRuntime({
      projectRoot: tempRoot,
      execPath: "/fake/node",
      resolveTypeScriptBinImpl: () => "/fake/tsc",
      spawnSyncImpl: (command, args, options) => {
        staleFileSeenDuringBuild = fs.existsSync(staleFilePath);
        expect(command).toBe("/fake/node");
        expect(args).toEqual(["/fake/tsc", "-p", path.join(tempRoot, "tsconfig.server.json")]);
        expect(options.cwd).toBe(tempRoot);
        fs.mkdirSync(path.dirname(emittedEntryPath), { recursive: true });
        fs.writeFileSync(emittedEntryPath, "module.exports = {};\n", "utf8");
        return { status: 0 };
      },
    });

    expect(status).toBe(0);
    expect(staleFileSeenDuringBuild).toBe(false);
    expect(fs.existsSync(emittedEntryPath)).toBe(true);
  });
});
