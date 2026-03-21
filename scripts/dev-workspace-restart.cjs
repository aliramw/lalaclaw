#!/usr/bin/env node

const fs = require('node:fs');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { waitForPortInUse } = require('../bin/lalaclaw.js');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !key.startsWith('--')) {
      continue;
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function readJson(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function updateStatus(statusFilePath, patch) {
  const current = readJson(statusFilePath) || {};
  writeJson(statusFilePath, {
    ...current,
    ...patch,
  });
}

function readCurrentBranch(projectRoot) {
  const result = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return '';
  }
  return String(result.stdout || '').trim();
}

function hasLocalBranch(projectRoot, branchName) {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function hasTrackedRemoteBranch(projectRoot, branchName) {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function switchToBranch(projectRoot, targetBranch) {
  const normalizedTargetBranch = String(targetBranch || '').trim();
  if (!normalizedTargetBranch) {
    return;
  }

  const currentBranch = readCurrentBranch(projectRoot);
  if (currentBranch && currentBranch === normalizedTargetBranch) {
    return;
  }

  const switchArgs = hasLocalBranch(projectRoot, normalizedTargetBranch)
    ? ['switch', normalizedTargetBranch]
    : hasTrackedRemoteBranch(projectRoot, normalizedTargetBranch)
      ? ['switch', '--track', '-c', normalizedTargetBranch, `origin/${normalizedTargetBranch}`]
      : ['switch', normalizedTargetBranch];
  const result = spawnSync('git', switchArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status === 0) {
    return;
  }

  const fallback = spawnSync('git', ['checkout', normalizedTargetBranch], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (fallback.status === 0) {
    return;
  }

  const errorMessage = String(fallback.stderr || fallback.stdout || result.stderr || result.stdout || '').trim();
  throw new Error(errorMessage || `Failed to switch to branch ${normalizedTargetBranch}`);
}

function findListeningPids(port) {
  const normalizedPort = Number(port || 0);
  if (!normalizedPort) {
    return [];
  }

  if (process.platform === 'win32') {
    const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
    if (result.status !== 0) {
      return [];
    }

    return String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes('LISTENING'))
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts[1] && parts[1].endsWith(`:${normalizedPort}`) && parts[4])
      .map((parts) => Number(parts[4]))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  const result = spawnSync('lsof', ['-nP', '-iTCP:' + normalizedPort, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  if (result.status !== 0 && !String(result.stderr || '').trim()) {
    return [];
  }

  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function stopPid(pid) {
  const normalizedPid = Number(pid || 0);
  if (!normalizedPid || normalizedPid === process.pid) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(normalizedPid), '/t', '/f'], { stdio: 'ignore' });
      return;
    }

    process.kill(normalizedPid, 'SIGTERM');
  } catch {}
}

async function stopPortProcesses(host, port, extraPid = 0) {
  const pids = new Set(findListeningPids(port));
  if (Number.isInteger(Number(extraPid)) && Number(extraPid) > 0) {
    pids.add(Number(extraPid));
  }
  pids.forEach((pid) => stopPid(pid));
  await waitForPortToClose(host, port);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const statusFile = String(options['status-file'] || '').trim();
  const restartId = String(options['restart-id'] || '').trim();
  const projectRoot = String(options['project-root'] || '').trim() || process.cwd();
  const frontendHost = String(options['frontend-host'] || '127.0.0.1').trim() || '127.0.0.1';
  const frontendPort = Number(options['frontend-port'] || 0);
  const backendHost = String(options['backend-host'] || '127.0.0.1').trim() || '127.0.0.1';
  const backendPort = Number(options['backend-port'] || 0);
  const backendPid = Number(options['backend-pid'] || 0);
  const targetBranch = String(options['target-branch'] || '').trim();
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  if (!statusFile || !restartId || !frontendPort || !backendPort) {
    process.exit(1);
  }

  try {
    await sleep(250);

    updateStatus(statusFile, {
      restartId,
      status: 'restarting',
      active: true,
      error: '',
      readyAt: 0,
    });

    switchToBranch(projectRoot, targetBranch);

    await stopPortProcesses(frontendHost, frontendPort);
    await stopPortProcesses(backendHost, backendPort, backendPid);

    const backendEnv = {
      ...process.env,
      HOST: backendHost,
      PORT: String(backendPort),
      FRONTEND_HOST: frontendHost,
      FRONTEND_PORT: String(frontendPort),
    };
    const backend = spawn(process.execPath, ['server.js'], {
      cwd: projectRoot,
      detached: true,
      env: backendEnv,
      stdio: 'ignore',
    });
    await waitForPortInUse('Backend port', backendHost, backendPort, backend, 45_000);
    backend.unref?.();

    const frontend = spawn(
      npmBin,
      ['run', 'dev', '--', '--host', frontendHost, '--port', String(frontendPort), '--strictPort'],
      {
        cwd: projectRoot,
        detached: true,
        env: backendEnv,
        stdio: 'ignore',
      },
    );
    await waitForPortInUse('Frontend port', frontendHost, frontendPort, frontend, 45_000);
    frontend.unref?.();

    updateStatus(statusFile, {
      restartId,
      status: 'ready',
      active: false,
      readyAt: Date.now(),
      error: '',
    });
  } catch (error) {
    updateStatus(statusFile, {
      restartId,
      status: 'failed',
      active: false,
      readyAt: 0,
      error: error?.message || 'Dev workspace restart failed',
    });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
