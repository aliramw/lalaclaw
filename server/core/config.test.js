/* global describe, expect, it, vi, afterEach */
const os = require('node:os');
const path = require('node:path');

const ORIGINAL_ENV = { ...process.env };

function reloadConfigModule() {
  vi.resetModules();
  delete require.cache[require.resolve('./config')];
  return require('./config');
}

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe('buildRuntimeConfig', () => {
  it('uses the user config directory for state by default', () => {
    process.env = {
      ...ORIGINAL_ENV,
      HOME: '/Users/example',
      LALACLAW_CONFIG_DIR: '',
      LALACLAW_CONFIG_FILE: '',
    };

    const { buildRuntimeConfig } = reloadConfigModule();
    const runtimeConfig = buildRuntimeConfig();

    expect(runtimeConfig.stateDir).toBe('/Users/example/.config/lalaclaw');
    expect(runtimeConfig.accessConfigFile).toBe('/Users/example/.config/lalaclaw/.env.local');
  });

  it('never falls back to the repo root when HOME is unavailable', () => {
    process.env = {
      ...ORIGINAL_ENV,
      HOME: '',
      APPDATA: '',
      USERPROFILE: '',
      LALACLAW_CONFIG_DIR: '',
      LALACLAW_CONFIG_FILE: '',
    };

    const { buildRuntimeConfig, PROJECT_ROOT, resolveLalaclawStateDir } = reloadConfigModule();
    const runtimeConfig = buildRuntimeConfig();
    const expectedFallbackDir = path.join(os.tmpdir(), 'lalaclaw');

    expect(resolveLalaclawStateDir()).toBe(expectedFallbackDir);
    expect(runtimeConfig.stateDir).toBe(expectedFallbackDir);
    expect(runtimeConfig.accessConfigFile).toBe(path.join(expectedFallbackDir, '.env.local'));
    expect(runtimeConfig.stateDir).not.toBe(PROJECT_ROOT);
    expect(path.dirname(runtimeConfig.accessConfigFile)).not.toBe(PROJECT_ROOT);
  });
});
