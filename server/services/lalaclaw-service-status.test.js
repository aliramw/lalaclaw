import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLalaClawServiceStatus,
  resolveConfigDir,
  resolveLaunchdLogDir,
  resolveLaunchdPlistPath,
} from './lalaclaw-service-status.ts';

const ORIGINAL_ENV = { ...process.env };

describe('lalaclaw-service-status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('prefers explicit and xdg config directories before falling back to home', () => {
    process.env.LALACLAW_CONFIG_DIR = '/tmp/lalaclaw-config';
    expect(resolveConfigDir()).toBe('/tmp/lalaclaw-config');

    delete process.env.LALACLAW_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = '/tmp/xdg-config';
    expect(resolveConfigDir()).toBe('/tmp/xdg-config/lalaclaw');

    delete process.env.XDG_CONFIG_HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/demo');
    expect(resolveConfigDir()).toBe('/Users/demo/.config/lalaclaw');
  });

  it('builds launchd plist and log paths from the active label/config dir', () => {
    process.env.LALACLAW_LAUNCHD_LABEL = 'ai.lalaclaw.custom';
    process.env.LALACLAW_CONFIG_DIR = '/tmp/lalaclaw-config';

    expect(resolveLaunchdPlistPath('/Users/demo')).toBe(
      path.join('/Users/demo', 'Library', 'LaunchAgents', 'ai.lalaclaw.custom.plist'),
    );
    expect(resolveLaunchdLogDir()).toBe('/tmp/lalaclaw-config/logs');
  });

  it('returns the unsupported status shape on non-darwin platforms', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    expect(getLalaClawServiceStatus()).toEqual({
      kind: 'unsupported',
      platform: 'linux',
      installed: false,
      running: false,
      label: '',
      plistPath: '',
      logDir: '',
      serviceVersion: expect.any(String),
      comment: '',
      details: '',
    });
  });
});
