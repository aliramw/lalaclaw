#!/usr/bin/env node

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { PACKAGE_NAME } = require('../../bin/lalaclaw.js');

function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !key.startsWith('--')) {
      continue;
    }
    options[key.slice(2)] = value || '';
  }
  return options;
}

function normalizeJob(rawJob = null) {
  if (!rawJob || typeof rawJob !== 'object') {
    return {
      active: false,
      status: 'idle',
      targetVersion: '',
      currentVersionAtStart: '',
      startedAt: 0,
      finishedAt: 0,
      errorCode: '',
      error: '',
      commandResult: null,
      restartResult: null,
    };
  }

  const status = String(rawJob.status || 'idle').trim() || 'idle';
  return {
    active: ['scheduled', 'updating', 'restarting'].includes(status),
    status,
    targetVersion: String(rawJob.targetVersion || '').trim(),
    currentVersionAtStart: String(rawJob.currentVersionAtStart || '').trim(),
    startedAt: Number(rawJob.startedAt || 0),
    finishedAt: Number(rawJob.finishedAt || 0),
    errorCode: String(rawJob.errorCode || '').trim(),
    error: String(rawJob.error || '').trim(),
    commandResult: rawJob.commandResult || null,
    restartResult: rawJob.restartResult || null,
  };
}

function readJsonFile(filePath = '') {
  const normalized = String(filePath || '').trim();
  if (!normalized || !fs.existsSync(normalized)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(normalized, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath = '', payload = {}) {
  const normalized = String(filePath || '').trim();
  if (!normalized) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(normalized), { recursive: true });
    const tempFile = `${normalized}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, normalized);
  } catch {}
}

function clipOutput(value = '', maxLength = 10_000) {
  const normalized = String(value || '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateJob(statusFile = '', patch = {}) {
  const current = normalizeJob(readJsonFile(statusFile));
  const next = normalizeJob({
    ...current,
    ...patch,
  });
  writeJsonFile(statusFile, next);
  return next;
}

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });

  return {
    ok: result.status === 0,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || '',
    stdout: clipOutput(result.stdout || ''),
    stderr: clipOutput(result.stderr || ''),
    command: {
      bin: command,
      args,
      display: [command, ...args].join(' '),
    },
  };
}

function isPortOpen(host = '127.0.0.1', port = 0) {
  return new Promise((resolve) => {
    if (!port) {
      resolve(false);
      return;
    }

    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      try {
        socket.destroy();
      } catch {}
      resolve(value);
    };

    socket.setTimeout(350, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function waitForPortToClose(host = '127.0.0.1', port = 0, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const open = await isPortOpen(host, port);
    if (!open) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const statusFile = String(options['status-file'] || '').trim();
  const targetVersion = String(options['target-version'] || '').trim();
  const restartMode = String(options['restart-mode'] || 'manual').trim() || 'manual';
  const configFile = String(options['config-file'] || '').trim();
  const host = String(options.host || '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(options.port || 0);
  const projectRoot = String(options['project-root'] || '').trim() || process.cwd();
  const serverPid = Number(options['server-pid'] || 0);
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const cliPath = path.join(projectRoot, 'bin', 'lalaclaw.js');

  if (!statusFile || !targetVersion) {
    process.exit(1);
  }

  await sleep(700);
  updateJob(statusFile, {
    status: 'updating',
    errorCode: '',
    error: '',
  });

  const installResult = runCommand(npmBin, ['install', '-g', `${PACKAGE_NAME}@${targetVersion}`], {
    cwd: projectRoot,
  });

  if (!installResult.ok) {
    updateJob(statusFile, {
      active: false,
      status: 'failed',
      finishedAt: Date.now(),
      errorCode: 'lalaclaw_update_install_failed',
      error: installResult.stderr || installResult.stdout || 'The package manager failed to install the new LalaClaw version.',
      commandResult: installResult,
    });
    process.exit(1);
  }

  updateJob(statusFile, {
    status: 'restarting',
    commandResult: installResult,
  });

  if (restartMode === 'launchd' && typeof process.getuid === 'function') {
    const restartResult = runCommand('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/ai.lalaclaw.app`], {
      cwd: projectRoot,
    });

    if (!restartResult.ok) {
      updateJob(statusFile, {
        active: false,
        status: 'failed',
        finishedAt: Date.now(),
        errorCode: 'lalaclaw_update_restart_failed',
        error: restartResult.stderr || restartResult.stdout || 'The LalaClaw launchd service could not be restarted.',
        commandResult: installResult,
        restartResult,
      });
      process.exit(1);
    }

    updateJob(statusFile, {
      restartResult,
    });
    process.exit(0);
  }

  if (serverPid > 0) {
    try {
      process.kill(serverPid, 'SIGTERM');
    } catch {}
  }

  await waitForPortToClose(host, port);

  const args = ['start'];
  if (configFile) {
    args.push('--config-file', configFile);
  }
  if (host) {
    args.push('--host', host);
  }
  if (port > 0) {
    args.push('--port', String(port));
  }

  try {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      detached: true,
      env: process.env,
      stdio: 'ignore',
    });
    if (typeof child.unref === 'function') {
      child.unref();
    }
    updateJob(statusFile, {
      restartResult: {
        ok: true,
        exitCode: 0,
        signal: '',
        stdout: '',
        stderr: '',
        command: {
          bin: process.execPath,
          args: [cliPath, ...args],
          display: [process.execPath, cliPath, ...args].join(' '),
        },
      },
    });
    process.exit(0);
  } catch (error) {
    updateJob(statusFile, {
      active: false,
      status: 'failed',
      finishedAt: Date.now(),
      errorCode: 'lalaclaw_update_restart_failed',
      error: String(error?.message || 'The updated LalaClaw process could not be started.'),
      commandResult: installResult,
      restartResult: {
        ok: false,
        exitCode: null,
        signal: '',
        stdout: '',
        stderr: '',
        command: {
          bin: process.execPath,
          args: [cliPath, ...args],
          display: [process.execPath, cliPath, ...args].join(' '),
        },
      },
    });
    process.exit(1);
  }
}

main().catch(() => {
  process.exit(1);
});
