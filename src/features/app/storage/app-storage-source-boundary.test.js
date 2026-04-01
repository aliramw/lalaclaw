import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const storageBoundaryImportPattern = /from ["']@\/features\/app\/storage(?:["']|\/(?:app-storage|index)["'])/;

function collectStorageSourceFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return collectStorageSourceFiles(absolutePath);
    }

    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    if (/\.test\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    if (entry.name === "app-storage.ts" || entry.name === "index.ts") {
      return [];
    }

    return [absolutePath];
  });
}

describe("app-storage source boundary", () => {
  it("does not let storage source modules depend on the storage barrel or compatibility shell", () => {
    const sourceFiles = collectStorageSourceFiles(currentDir);

    const offenders = sourceFiles
      .filter((filePath) => storageBoundaryImportPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(path.resolve(currentDir, "../../../.."), filePath));

    expect(offenders).toEqual([]);
  });
});
