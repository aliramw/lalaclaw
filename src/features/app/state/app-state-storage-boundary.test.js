import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const storageImportPattern = /from ["'][^"']*features\/app\/storage(?:\/[^"']*)?["']/;

function collectAppStateSourceFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return collectAppStateSourceFiles(absolutePath);
    }

    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    if (/\.test\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [absolutePath];
  });
}

describe("app-state storage boundary", () => {
  it("does not let app state source modules depend on app storage modules", () => {
    const sourceFiles = collectAppStateSourceFiles(currentDir);

    const offenders = sourceFiles
      .filter((filePath) => storageImportPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(path.resolve(currentDir, "../../../.."), filePath));

    expect(offenders).toEqual([]);
  });
});
