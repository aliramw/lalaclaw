const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runtimeEntryPath = path.join(__dirname, '.server-build', 'server', 'entry.js');
const serverTsconfigPath = path.join(__dirname, 'tsconfig.server.json');

function resolveTypeScriptBin() {
  try {
    return require.resolve('typescript/bin/tsc');
  } catch {
    return '';
  }
}

function buildServerRuntime(tscBin) {
  const result = spawnSync(process.execPath, [tscBin, '-p', serverTsconfigPath], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const tscBin = resolveTypeScriptBin();
if (tscBin && fs.existsSync(serverTsconfigPath)) {
  buildServerRuntime(tscBin);
} else if (!fs.existsSync(runtimeEntryPath)) {
  throw new Error('Missing prebuilt server runtime (.server-build/server/entry.js) and no local TypeScript compiler is available.');
}

const runtimeEntry = require(runtimeEntryPath);

module.exports = runtimeEntry;

if (require.main === module && typeof runtimeEntry.startServer === 'function') {
  runtimeEntry.startServer();
}
