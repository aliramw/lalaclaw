import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parseArgs, resolveTarballPath } = require("../scripts/release-install-smoke.cjs");
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("release install smoke script", () => {
  it("parses CLI flags for release smoke options", () => {
    expect(parseArgs([
      "--tarball",
      "./artifacts/lalaclaw-2026.3.24.tgz",
      "--host",
      "0.0.0.0",
      "--port",
      "6789",
      "--keep-tmp",
      "--json",
      "--no-chat",
    ])).toEqual({
      tarball: "./artifacts/lalaclaw-2026.3.24.tgz",
      host: "0.0.0.0",
      port: 6789,
      keepTmp: true,
      json: true,
      noChat: true,
    });
  });

  it("picks the newest lalaclaw tarball from artifacts when none is specified", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-release-install-smoke-"));
    tempDirs.push(tempRoot);

    const artifactsDir = path.join(tempRoot, "artifacts");
    fs.mkdirSync(artifactsDir, { recursive: true });

    const olderTarball = path.join(artifactsDir, "lalaclaw-2026.3.23.tgz");
    const newerTarball = path.join(artifactsDir, "lalaclaw-2026.3.24.tgz");
    fs.writeFileSync(olderTarball, "older\n", "utf8");
    fs.writeFileSync(newerTarball, "newer\n", "utf8");

    const olderTime = new Date("2026-03-23T10:00:00.000Z");
    const newerTime = new Date("2026-03-24T10:00:00.000Z");
    fs.utimesSync(olderTarball, olderTime, olderTime);
    fs.utimesSync(newerTarball, newerTime, newerTime);

    expect(resolveTarballPath({ cwd: tempRoot })).toBe(newerTarball);
  });
});
