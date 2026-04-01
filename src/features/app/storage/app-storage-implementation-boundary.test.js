import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../../../..");
const implementationImportPattern = /from ["']@\/features\/app\/storage\/app-storage["']/;

function collectSourceFiles(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [absolutePath];
  });
}

describe("app-storage implementation boundary", () => {
  it("does not let internal modules import the compatibility shell directly", () => {
    const sourceFiles = collectSourceFiles(path.join(workspaceRoot, "src"));

    const offenders = sourceFiles
      .filter((filePath) => !filePath.endsWith(path.join("src", "features", "app", "storage", "app-storage-core-api.test.js")))
      .filter((filePath) => !filePath.endsWith(path.join("src", "features", "app", "storage", "app-storage-shell-compatibility.test.js")))
      .filter((filePath) => !filePath.endsWith(path.join("src", "features", "app", "storage", "app-storage.js")))
      .filter((filePath) => !filePath.endsWith(path.join("src", "features", "app", "storage", "app-storage.ts")))
      .filter((filePath) => implementationImportPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(workspaceRoot, filePath));

    expect(offenders).toEqual([]);
  });
});
