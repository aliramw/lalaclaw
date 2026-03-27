#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const contractRoots = [
  "src/features/app/storage",
  "src/features/app/state",
  "src/features/chat/state",
  "src/features/theme",
];
const contractTestPattern = /(core-api|boundary|compatibility(?:-api)?)\.test\.(js|jsx|ts|tsx)$/;

function collectArchitectureContractFiles({
  rootDir = workspaceRoot,
  rootPaths = contractRoots,
  readdirSyncImpl = fs.readdirSync,
} = {}) {
  return rootPaths.flatMap((relativeRoot) => {
    const absoluteRoot = path.join(rootDir, relativeRoot);

    return readdirSyncImpl(absoluteRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && contractTestPattern.test(entry.name))
      .map((entry) => path.join(relativeRoot, entry.name))
      .sort();
  });
}

const contractFiles = collectArchitectureContractFiles();

function listArchitectureContracts() {
  return [...contractFiles];
}

function summarizeArchitectureContracts(files = contractFiles) {
  const summary = {
    total: files.length,
    byRoot: {
      appStorage: 0,
      appState: 0,
      chatState: 0,
      theme: 0,
    },
  };

  for (const filePath of files) {
    if (filePath.startsWith("src/features/app/storage/")) {
      summary.byRoot.appStorage += 1;
      continue;
    }

    if (filePath.startsWith("src/features/app/state/")) {
      summary.byRoot.appState += 1;
      continue;
    }

    if (filePath.startsWith("src/features/chat/state/")) {
      summary.byRoot.chatState += 1;
      continue;
    }

    if (filePath.startsWith("src/features/theme/")) {
      summary.byRoot.theme += 1;
    }
  }

  return summary;
}

function run(command, args, { spawnSyncImpl = spawnSync, platform = process.platform } = {}) {
  const result = spawnSyncImpl(command, args, {
    stdio: "inherit",
    shell: platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    return result.status;
  }

  return 0;
}

function runArchitectureContracts(mode = "check", options = {}) {
  if (mode === "list") {
    for (const filePath of listArchitectureContracts()) {
      console.log(filePath);
    }
    return 0;
  }

  if (mode === "json") {
    const files = listArchitectureContracts();
    console.log(JSON.stringify({
      contractFiles: files,
      summary: summarizeArchitectureContracts(files),
    }, null, 2));
    return 0;
  }

  if (mode === "lint") {
    return run("eslint", contractFiles, options);
  }

  if (mode === "test") {
    return run("vitest", ["run", ...contractFiles], options);
  }

  if (mode === "check") {
    const lintStatus = run("eslint", contractFiles, options);
    if (lintStatus !== 0) {
      return lintStatus;
    }

    return run("vitest", ["run", ...contractFiles], options);
  }

  return 1;
}

if (require.main === module) {
  const mode = process.argv[2] || "check";
  const status = runArchitectureContracts(mode);
  if (status !== 0) {
    console.error(`Unknown architecture contract mode: ${mode}`);
    console.error("Usage: node ./scripts/architecture-contracts.cjs [lint|test|check|list|json]");
  }
  process.exit(status);
}

module.exports = {
  collectArchitectureContractFiles,
  contractFiles,
  listArchitectureContracts,
  summarizeArchitectureContracts,
  runArchitectureContracts,
};
