import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

const require = createRequire(import.meta.url);
const {
  collectArchitectureContractFiles,
  contractFiles,
  listArchitectureContracts,
  summarizeArchitectureContracts,
  runArchitectureContracts,
} = require("../scripts/architecture-contracts.cjs");

describe("architecture contracts script", () => {
  it("keeps the npm script entrypoints wired to the shared architecture contracts runner", () => {
    expect(packageJson.scripts["lint:architecture:contracts"]).toBe("node ./scripts/architecture-contracts.cjs lint");
    expect(packageJson.scripts["test:architecture:contracts"]).toBe("node ./scripts/architecture-contracts.cjs test");
    expect(packageJson.scripts["check:architecture:contracts"]).toBe("node ./scripts/architecture-contracts.cjs check");
  });

  it("collects contract and boundary tests from the shared feature roots", () => {
    const files = collectArchitectureContractFiles();

    expect(files).toContain("src/features/app/storage/app-storage-core-api.test.js");
    expect(files).toContain("src/features/app/storage/storage-public-api-boundary.test.js");
    expect(files).toContain("src/features/app/state/app-state-storage-boundary.test.js");
    expect(files).toContain("src/features/chat/state/chat-session-view-core-api.test.js");
    expect(files).toContain("src/features/theme/theme-storage-boundary.test.js");

    expect(files).not.toContain("src/features/app/storage/app-storage.test.js");
    expect(files).not.toContain("src/features/app/state/app-session-identity.test.js");
    expect(files).not.toContain("src/features/chat/state/chat-session-view.test.ts");
  });

  it("lists the shared contract file list without mutating it", () => {
    expect(listArchitectureContracts()).toEqual(contractFiles);
    expect(listArchitectureContracts()).not.toBe(contractFiles);
  });

  it("prints machine-readable JSON in json mode without spawning commands", () => {
    const output = [];
    const originalConsoleLog = console.log;
    let called = false;

    console.log = (value) => {
      output.push(String(value));
    };

    try {
      const status = runArchitectureContracts("json", {
        spawnSyncImpl: () => {
          called = true;
          return { status: 0 };
        },
      });

      expect(status).toBe(0);
      expect(called).toBe(false);
      expect(JSON.parse(output.join("\n"))).toEqual({
        contractFiles,
        summary: summarizeArchitectureContracts(contractFiles),
      });
    } finally {
      console.log = originalConsoleLog;
    }
  });

  it("summarizes contracts by feature root", () => {
    expect(summarizeArchitectureContracts(contractFiles)).toEqual({
      total: contractFiles.length,
      byRoot: {
        appStorage: 7,
        appState: 6,
        chatState: 8,
        theme: 2,
      },
    });
  });

  it("runs eslint against the shared contract file list in lint mode", () => {
    const calls = [];

    const status = runArchitectureContracts("lint", {
      spawnSyncImpl: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
      platform: "darwin",
    });

    expect(status).toBe(0);
    expect(calls).toEqual([
      {
        command: "eslint",
        args: contractFiles,
        options: {
          shell: false,
          stdio: "inherit",
        },
      },
    ]);
  });

  it("runs eslint and vitest in check mode", () => {
    const calls = [];

    const status = runArchitectureContracts("check", {
      spawnSyncImpl: (command, args) => {
        calls.push([command, args]);
        return { status: 0 };
      },
      platform: "darwin",
    });

    expect(status).toBe(0);
    expect(calls).toEqual([
      ["eslint", contractFiles],
      ["vitest", ["run", ...contractFiles]],
    ]);
  });

  it("returns a non-zero status for unknown modes without spawning commands", () => {
    let called = false;

    const status = runArchitectureContracts("unknown", {
      spawnSyncImpl: () => {
        called = true;
        return { status: 0 };
      },
    });

    expect(status).toBe(1);
    expect(called).toBe(false);
  });
});
