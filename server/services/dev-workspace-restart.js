const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const STATUS_FILENAME = 'dev-workspace-restart.json';

function isValidPort(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 65535;
}

function buildIdleState() {
  return {
    ok: true,
    available: true,
    active: false,
    restartId: '',
    status: 'idle',
    requestedAt: 0,
    readyAt: 0,
    error: '',
    frontendHost: '',
    frontendPort: 0,
    backendHost: '',
    backendPort: 0,
    currentBranch: '',
    branches: [],
    targetBranch: '',
    currentWorktreePath: '',
    worktrees: [],
    targetWorktreePath: '',
  };
}

function normalizeStatusState(payload = null) {
  const idleState = buildIdleState();
  return {
    ...idleState,
    ...(payload && typeof payload === 'object' ? payload : {}),
    ok: true,
    available: true,
    active: ['scheduled', 'restarting'].includes(String(payload?.status || '').trim()),
    restartId: String(payload?.restartId || '').trim(),
    status: String(payload?.status || 'idle').trim() || 'idle',
    requestedAt: Number(payload?.requestedAt || 0) || 0,
    readyAt: Number(payload?.readyAt || 0) || 0,
    error: String(payload?.error || '').trim(),
    frontendHost: String(payload?.frontendHost || '').trim(),
    frontendPort: Number(payload?.frontendPort || 0) || 0,
    backendHost: String(payload?.backendHost || '').trim(),
    backendPort: Number(payload?.backendPort || 0) || 0,
    currentBranch: String(payload?.currentBranch || '').trim(),
    branches: Array.isArray(payload?.branches)
      ? payload.branches.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
    targetBranch: String(payload?.targetBranch || '').trim(),
    currentWorktreePath: String(payload?.currentWorktreePath || '').trim(),
    worktrees: Array.isArray(payload?.worktrees)
      ? payload.worktrees
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const worktreePath = String(entry.path || '').trim();
          if (!worktreePath) {
            return null;
          }
          return {
            path: worktreePath,
            name: String(entry.name || '').trim(),
            branch: String(entry.branch || '').trim(),
            detached: Boolean(entry.detached),
          };
        })
        .filter(Boolean)
      : [],
    targetWorktreePath: String(payload?.targetWorktreePath || '').trim(),
  };
}

function createDevWorkspaceRestartService({
  backendHost,
  backendPort,
  fileExists,
  processEnv = process.env,
  processExecPath = process.execPath,
  processPid = process.pid,
  projectRoot,
  readJsonIfExists,
  spawnImpl = spawn,
  spawnSyncImpl = spawnSync,
  stateDir,
  writeFileSyncImpl = fs.writeFileSync,
}) {
  const helperScriptPath = path.join(projectRoot, 'scripts', 'dev-workspace-restart.cjs');
  const statusFilePath = path.join(stateDir, STATUS_FILENAME);

  function isAvailable() {
    return Boolean(
      fileExists(path.join(projectRoot, 'package.json'))
      && fileExists(path.join(projectRoot, 'vite.config.mjs'))
      && fileExists(path.join(projectRoot, 'server.js'))
      && fileExists(helperScriptPath),
    );
  }

  function runGit(args = []) {
    return spawnSyncImpl('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  }

  function listLocalBranches() {
    const result = runGit(['for-each-ref', '--format=%(refname:short)', '--sort=refname', 'refs/heads']);
    if (result.status !== 0) {
      return [];
    }

    return String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function listTrackedRemoteBranches() {
    const result = runGit(['for-each-ref', '--format=%(refname:lstrip=3)', '--sort=refname', 'refs/remotes/origin']);
    if (result.status !== 0) {
      return [];
    }

    return String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line !== 'HEAD' && line !== 'main');
  }

  function listSwitchableBranches() {
    const merged = new Set([
      ...listLocalBranches(),
      ...listTrackedRemoteBranches(),
    ]);

    return [...merged].sort((left, right) => left.localeCompare(right));
  }

  function listWorktrees() {
    const result = runGit(['worktree', 'list', '--porcelain']);
    if (result.status !== 0) {
      return [];
    }

    const lines = String(result.stdout || '').split(/\r?\n/);
    const worktrees = [];
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (current?.path) {
          worktrees.push(current);
        }
        current = null;
        continue;
      }

      if (line.startsWith('worktree ')) {
        if (current?.path) {
          worktrees.push(current);
        }
        const worktreePath = line.slice('worktree '.length).trim();
        current = {
          path: worktreePath,
          name: path.basename(worktreePath),
          branch: '',
          detached: false,
        };
        continue;
      }

      if (!current) {
        continue;
      }

      if (line.startsWith('branch ')) {
        current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
        continue;
      }

      if (line === 'detached') {
        current.detached = true;
      }
    }

    if (current?.path) {
      worktrees.push(current);
    }

    return worktrees;
  }

  function getCurrentBranch() {
    const result = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (result.status !== 0) {
      return '';
    }
    return String(result.stdout || '').trim();
  }

  function getState() {
    if (!isAvailable()) {
      return {
        ok: true,
        available: false,
        active: false,
        restartId: '',
        status: 'unavailable',
        requestedAt: 0,
        readyAt: 0,
        error: '',
        frontendHost: '',
        frontendPort: 0,
        backendHost: String(backendHost || '').trim(),
        backendPort: Number(backendPort || 0) || 0,
        currentBranch: '',
        branches: [],
        targetBranch: '',
        currentWorktreePath: projectRoot,
        worktrees: [],
        targetWorktreePath: '',
      };
    }

    return normalizeStatusState({
      ...readJsonIfExists(statusFilePath),
      currentBranch: getCurrentBranch(),
      branches: listSwitchableBranches(),
      currentWorktreePath: projectRoot,
      worktrees: listWorktrees(),
    });
  }

  function writeState(nextState) {
    writeFileSyncImpl(statusFilePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  }

  function scheduleRestart({
    frontendHost,
    frontendPort,
    targetBranch,
    targetWorktreePath,
  }) {
    if (!isAvailable()) {
      const error = new Error('Dev workspace restart is only available from a source checkout.');
      error.statusCode = 404;
      error.errorCode = 'dev_workspace_restart_unavailable';
      throw error;
    }

    const normalizedFrontendHost = String(frontendHost || '').trim() || '127.0.0.1';
    const normalizedFrontendPort = Number(frontendPort || 0);
    const normalizedTargetBranch = String(targetBranch || '').trim();
    const normalizedTargetWorktreePath = String(targetWorktreePath || '').trim() || projectRoot;
    if (!isValidPort(normalizedFrontendPort)) {
      const error = new Error('A valid frontend port is required for dev workspace restart.');
      error.statusCode = 400;
      error.errorCode = 'dev_workspace_restart_invalid_frontend_port';
      throw error;
    }

    const availableBranches = listSwitchableBranches();
    const currentBranch = getCurrentBranch();
    const availableWorktrees = listWorktrees();
    const targetWorktree = availableWorktrees.find((entry) => entry.path === normalizedTargetWorktreePath);
    if (!targetWorktree) {
      const error = new Error(`Target worktree is not available in this workspace set: ${normalizedTargetWorktreePath}`);
      error.statusCode = 400;
      error.errorCode = 'dev_workspace_restart_invalid_target_worktree';
      throw error;
    }
    if (normalizedTargetBranch && !availableBranches.includes(normalizedTargetBranch)) {
      const error = new Error(`Target branch is not available in this workspace: ${normalizedTargetBranch}`);
      error.statusCode = 400;
      error.errorCode = 'dev_workspace_restart_invalid_target_branch';
      throw error;
    }

    const restartId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

    const nextState = normalizeStatusState({
      restartId,
      status: 'scheduled',
      requestedAt: Date.now(),
      readyAt: 0,
      error: '',
      frontendHost: normalizedFrontendHost,
      frontendPort: normalizedFrontendPort,
      backendHost: String(backendHost || '').trim(),
      backendPort: Number(backendPort || 0) || 0,
      currentBranch,
      branches: availableBranches,
      targetBranch: normalizedTargetBranch,
      currentWorktreePath: projectRoot,
      worktrees: availableWorktrees,
      targetWorktreePath: normalizedTargetWorktreePath,
    });

    writeState(nextState);

    const child = spawnImpl(
      processExecPath,
      [
        helperScriptPath,
        '--status-file', statusFilePath,
        '--restart-id', restartId,
        '--project-root', normalizedTargetWorktreePath,
        '--frontend-host', normalizedFrontendHost,
        '--frontend-port', String(normalizedFrontendPort),
        '--backend-host', String(backendHost || '').trim(),
        '--backend-port', String(backendPort || ''),
        '--backend-pid', String(processPid || 0),
        '--target-branch', normalizedTargetBranch,
      ],
      {
        cwd: projectRoot,
        detached: true,
        env: {
          ...processEnv,
          HOST: String(backendHost || '').trim(),
          PORT: String(backendPort || ''),
          FRONTEND_HOST: normalizedFrontendHost,
          FRONTEND_PORT: String(normalizedFrontendPort),
        },
        stdio: 'ignore',
      },
    );

    child?.unref?.();

    return {
      ...nextState,
      accepted: true,
    };
  }

  return {
    getDevWorkspaceRestartState: getState,
    scheduleDevWorkspaceRestart: scheduleRestart,
  };
}

module.exports = {
  STATUS_FILENAME,
  createDevWorkspaceRestartService,
};
