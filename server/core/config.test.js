/* global describe, expect, it, vi, afterEach */
const os = require('node:os');
const path = require('node:path');

const ORIGINAL_ENV = { ...process.env };

async function reloadConfigModule() {
  vi.resetModules();
  return import('./config');
}

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe('buildRuntimeConfig', () => {
  it('uses the user config directory for state by default', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      HOME: '/Users/example',
      LALACLAW_CONFIG_DIR: '',
      LALACLAW_CONFIG_FILE: '',
    };

    const { buildRuntimeConfig } = await reloadConfigModule();
    const runtimeConfig = buildRuntimeConfig();

    expect(runtimeConfig.stateDir).toBe('/Users/example/.config/lalaclaw');
    expect(runtimeConfig.accessConfigFile).toBe('/Users/example/.config/lalaclaw/.env.local');
  });

  it('never falls back to the repo root when HOME is unavailable', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      HOME: '',
      APPDATA: '',
      USERPROFILE: '',
      LALACLAW_CONFIG_DIR: '',
      LALACLAW_CONFIG_FILE: '',
    };

    const { buildRuntimeConfig, PROJECT_ROOT, resolveLalaclawStateDir } = await reloadConfigModule();
    const runtimeConfig = buildRuntimeConfig();
    const expectedFallbackDir = path.join(os.tmpdir(), 'lalaclaw');

    expect(resolveLalaclawStateDir()).toBe(expectedFallbackDir);
    expect(runtimeConfig.stateDir).toBe(expectedFallbackDir);
    expect(runtimeConfig.accessConfigFile).toBe(path.join(expectedFallbackDir, '.env.local'));
    expect(runtimeConfig.stateDir).not.toBe(PROJECT_ROOT);
    expect(path.dirname(runtimeConfig.accessConfigFile)).not.toBe(PROJECT_ROOT);
  });

  it('falls back to the npm global openclaw entry when the shell shim is missing', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      HOME: '/Users/example',
      OPENCLAW_BIN: '',
    };

    const fs = await import('node:fs');
    const existsSpy = vi.spyOn(fs.default || fs, 'existsSync').mockImplementation((targetPath) => {
      return targetPath === '/Users/example/.npm-global/lib/node_modules/openclaw/openclaw.mjs';
    });

    const { buildRuntimeConfig } = await reloadConfigModule();
    const runtimeConfig = buildRuntimeConfig();

    expect(runtimeConfig.openclawBin).toBe('/Users/example/.npm-global/lib/node_modules/openclaw/openclaw.mjs');
    existsSpy.mockRestore();
  });
});
