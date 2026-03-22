const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { version: PACKAGE_VERSION } = require('../package.json');

const MACOS_LAUNCHD_LABEL = 'ai.lalaclaw.app';

function resolveLaunchdLabel() {
  return String(process.env.LALACLAW_LAUNCHD_LABEL || '').trim() || MACOS_LAUNCHD_LABEL;
}

function resolveConfigDir() {
  const explicitConfigDir = String(process.env.LALACLAW_CONFIG_DIR || '').trim();
  if (explicitConfigDir) {
    return path.resolve(explicitConfigDir);
  }

  const xdgConfigHome = String(process.env.XDG_CONFIG_HOME || '').trim();
  if (xdgConfigHome) {
    return path.join(path.resolve(xdgConfigHome), 'lalaclaw');
  }

  const homeDir = os.homedir();
  return homeDir ? path.join(homeDir, '.config', 'lalaclaw') : process.cwd();
}

function resolveLaunchdPlistPath(homeDir = os.homedir()) {
  return path.join(homeDir, 'Library', 'LaunchAgents', `${resolveLaunchdLabel()}.plist`);
}

function resolveLaunchdLogDir() {
  return path.join(resolveConfigDir(), 'logs');
}

function runLaunchctl(args) {
  return spawnSync('launchctl', args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function readMacosLaunchAgentStatus() {
  const guiTarget = `gui/${process.getuid()}`;
  const launchdLabel = resolveLaunchdLabel();
  const serviceTarget = `${guiTarget}/${launchdLabel}`;
  const plistPath = resolveLaunchdPlistPath();
  const plistExists = fs.existsSync(plistPath);
  const printResult = runLaunchctl(['print', serviceTarget]);
  const details = String(printResult.stdout || printResult.stderr || '').trim();
  const plistContent = plistExists ? fs.readFileSync(plistPath, 'utf8') : '';
  const commentMatch = plistContent.match(/<key>Comment<\/key>\s*<string>([^<]+)<\/string>/);

  return {
    kind: 'launchd',
    platform: 'darwin',
    label: launchdLabel,
    installed: plistExists,
    running: printResult.status === 0,
    plistPath,
    logDir: resolveLaunchdLogDir(),
    serviceVersion: PACKAGE_VERSION,
    comment: commentMatch?.[1] || '',
    details,
  };
}

function getLalaClawServiceStatus() {
  if (process.platform === 'darwin') {
    return readMacosLaunchAgentStatus();
  }

  return {
    kind: 'unsupported',
    platform: process.platform,
    installed: false,
    running: false,
    label: '',
    plistPath: '',
    logDir: '',
    serviceVersion: PACKAGE_VERSION,
    comment: '',
    details: '',
  };
}

module.exports = {
  getLalaClawServiceStatus,
  resolveConfigDir,
  resolveLaunchdLabel,
  resolveLaunchdLogDir,
  resolveLaunchdPlistPath,
};
