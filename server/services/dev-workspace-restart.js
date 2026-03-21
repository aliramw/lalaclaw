const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

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
      };
    }

    return normalizeStatusState(readJsonIfExists(statusFilePath));
  }

  function writeState(nextState) {
    writeFileSyncImpl(statusFilePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  }

  function scheduleRestart({
    frontendHost,
    frontendPort,
  }) {
    if (!isAvailable()) {
      const error = new Error('Dev workspace restart is only available from a source checkout.');
      error.statusCode = 404;
      error.errorCode = 'dev_workspace_restart_unavailable';
      throw error;
    }

    const normalizedFrontendHost = String(frontendHost || '').trim() || '127.0.0.1';
    const normalizedFrontendPort = Number(frontendPort || 0);
    if (!isValidPort(normalizedFrontendPort)) {
      const error = new Error('A valid frontend port is required for dev workspace restart.');
      error.statusCode = 400;
      error.errorCode = 'dev_workspace_restart_invalid_frontend_port';
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
    });

    writeState(nextState);

    const child = spawnImpl(
      processExecPath,
      [
        helperScriptPath,
        '--status-file', statusFilePath,
        '--restart-id', restartId,
        '--project-root', projectRoot,
        '--frontend-host', normalizedFrontendHost,
        '--frontend-port', String(normalizedFrontendPort),
        '--backend-host', String(backendHost || '').trim(),
        '--backend-port', String(backendPort || ''),
        '--backend-pid', String(processPid || 0),
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
