#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveTypeScriptBin(projectRoot = process.cwd()) {
  try {
    return require.resolve('typescript/bin/tsc', { paths: [projectRoot] });
  } catch {
    return '';
  }
}

function cleanServerBuild(projectRoot = process.cwd(), fsImpl = fs) {
  fsImpl.rmSync(path.join(projectRoot, '.server-build'), {
    recursive: true,
    force: true,
  });
}

function buildServerRuntime({
  projectRoot = path.resolve(__dirname, '..'),
  fsImpl = fs,
  spawnSyncImpl = spawnSync,
  resolveTypeScriptBinImpl = resolveTypeScriptBin,
  execPath = process.execPath,
} = {}) {
  cleanServerBuild(projectRoot, fsImpl);

  const tsconfigPath = path.join(projectRoot, 'tsconfig.server.json');
  const tscBin = resolveTypeScriptBinImpl(projectRoot);
  if (!tscBin) {
    throw new Error('Local TypeScript compiler is unavailable.');
  }

  const result = spawnSyncImpl(execPath, [tscBin, '-p', tsconfigPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
  process.exit(buildServerRuntime());
}

module.exports = {
  buildServerRuntime,
  cleanServerBuild,
  resolveTypeScriptBin,
};
