import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const storageImportPattern = /from ["'][^"']*features\/app\/storage(?:\/[^"']*)?["']/;

function collectThemeSourceFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return collectThemeSourceFiles(absolutePath);
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

describe("theme storage boundary", () => {
  it("does not let theme source modules depend on app storage modules", () => {
    const sourceFiles = collectThemeSourceFiles(currentDir);

    const offenders = sourceFiles
      .filter((filePath) => storageImportPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(path.resolve(currentDir, "../../.."), filePath));

    expect(offenders).toEqual([]);
  });
});
