import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';

const ORIGINAL_ENV = { ...process.env };

function loadCli() {
  return require('../bin/lalaclaw.js');
}

describe('lalaclaw launchd helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('uses the default launchd label when no override is set', () => {
    const cli = loadCli();
    const plistPath = cli.resolveLaunchdPlistPath('/Users/tester');
    expect(plistPath).toBe('/Users/tester/Library/LaunchAgents/ai.lalaclaw.app.plist');
  });

  it('uses an overridden launchd label for plist paths and targets', () => {
    process.env.LALACLAW_LAUNCHD_LABEL = 'ai.lalaclaw.app.verify';
    const cli = loadCli();
    const plistPath = cli.resolveLaunchdPlistPath('/Users/tester');
    const targets = cli.getLaunchdTargets();

    expect(plistPath).toBe('/Users/tester/Library/LaunchAgents/ai.lalaclaw.app.verify.plist');
    expect(targets.label).toBe('ai.lalaclaw.app.verify');
    expect(targets.serviceTarget).toContain('/ai.lalaclaw.app.verify');
  });

  it('renders launchd plist with OpenClaw-style service metadata', () => {
    process.env.LALACLAW_LAUNCHD_LABEL = 'ai.lalaclaw.app.verify';
    const cli = loadCli();
    const plist = cli.renderLaunchdPlist({
      nodePath: '/usr/local/bin/node',
      cliPath: '/Users/tester/projects/lalaclaw2/bin/lalaclaw.js',
      workingDirectory: '/Users/tester/projects/lalaclaw2',
      envFilePath: '/tmp/lalaclaw/.env.local',
      stdoutPath: '/tmp/lalaclaw/out.log',
      stderrPath: '/tmp/lalaclaw/err.log',
      pathEnv: '/usr/local/bin:/usr/bin:/bin',
    });

    expect(plist).toContain('<string>ai.lalaclaw.app.verify</string>');
    expect(plist).toContain('<key>Comment</key>');
    expect(plist).toContain('LalaClaw Server (v');
    expect(plist).toContain('<key>ThrottleInterval</key>');
    expect(plist).toContain('<integer>1</integer>');
    expect(plist).toContain('<key>Umask</key>');
    expect(plist).toContain('<key>LALACLAW_LAUNCHD_LABEL</key>');
    expect(plist).toContain('<string>ai.lalaclaw.app.verify</string>');
    expect(plist).toContain('<key>LALACLAW_CONFIG_FILE</key>');
    expect(plist).toContain('<string>/tmp/lalaclaw/.env.local</string>');
  });
});
