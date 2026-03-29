import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = process.cwd();
const srcRoot = path.join(workspaceRoot, "src");
const storageRoot = path.join(srcRoot, "features", "app", "storage");
const storageBarrelImportPattern = /from\s+["']@\/features\/app\/storage["']/;

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

describe("storage public API boundary", () => {
  it("does not let internal src modules depend on the storage barrel", () => {
    const offenders = walkFiles(srcRoot)
      .filter((filePath) => !filePath.startsWith(storageRoot))
      .filter((filePath) => /\.(?:[cm]?[jt]sx?)$/.test(filePath))
      .filter((filePath) => storageBarrelImportPattern.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(workspaceRoot, filePath));

    expect(offenders).toEqual([]);
  });
});
