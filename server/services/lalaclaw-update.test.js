import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLalaClawUpdateService } from './lalaclaw-update.ts';

describe('createLalaClawUpdateService', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) {
      fs.rmSync(tempDirs.pop(), { force: true, recursive: true });
    }
  });

  it('uses the stable channel first when computing update availability', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: '/tmp/lalaclaw-package',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            latest: '2026.3.21-2',
            stable: '2026.3.21-1',
          },
        }),
      }),
      spawnImpl: () => ({ unref() {} }),
    });

    const result = await service.getLalaClawUpdateState();

    expect(result.check.ok).toBe(true);
    expect(result.targetRelease).toEqual({
      version: '2026.3.21-1',
      stable: true,
    });
    expect(result.channel).toEqual({
      value: 'stable',
      source: 'default',
      label: 'stable (default)',
      config: null,
    });
    expect(result.availability).toEqual({
      available: true,
      hasRegistryUpdate: true,
      latestVersion: '2026.3.21-1',
    });
    expect(result.workspaceVersion).toBe('2026.3.24');
    expect(result.updateAvailable).toBe(true);
    expect(result.stableTag).toBe('stable');
  });

  it('falls back to latest when the stable dist-tag is absent without marking it as a stable release', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.13',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: '/tmp/lalaclaw-package',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            latest: '2026.3.22',
          },
        }),
      }),
      spawnImpl: () => ({ unref() {} }),
    });

    const result = await service.getLalaClawUpdateState();

    expect(result.channel).toEqual({
      value: 'stable',
      source: 'default',
      label: 'stable (default)',
      config: null,
    });
    expect(result.stableTag).toBe('latest');
    expect(result.targetRelease).toEqual({
      version: '2026.3.22',
      stable: false,
    });
    expect(result.availability).toEqual({
      available: true,
      hasRegistryUpdate: true,
      latestVersion: '2026.3.22',
    });
    expect(result.updateAvailable).toBe(true);
  });

  it('blocks in-app updates from a source checkout', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: process.cwd(),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            stable: '2026.3.21-1',
          },
        }),
      }),
      spawnImpl: () => ({ unref() {} }),
    });

    await expect(service.runLalaClawUpdate()).rejects.toMatchObject({
      errorCode: 'lalaclaw_update_source_checkout_unsupported',
    });
  });

  it('starts a detached update worker when a newer stable version is available', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const spawned = [];
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: '/tmp/lalaclaw-package',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            stable: '2026.3.21-1',
          },
        }),
      }),
      spawnImpl: (command, args, options) => {
        spawned.push({ command, args, options });
        return { unref() {} };
      },
    });

    const result = await service.runLalaClawUpdate();

    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.state.job.status).toBe('scheduled');
    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe(process.execPath);
    expect(spawned[0].args).toContain('--target-version');
    expect(spawned[0].args).toContain('2026.3.21-1');
    expect(spawned[0].options.detached).toBe(true);
  });

  it('falls back to manual restart when the macOS launch agent is installed but not running', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const spawned = [];
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      getServiceStatus: () => ({
        kind: 'launchd',
        installed: true,
        running: false,
      }),
      platform: 'darwin',
      projectRoot: '/tmp/lalaclaw-package',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            stable: '2026.3.21-1',
          },
        }),
      }),
      spawnImpl: (command, args, options) => {
        spawned.push({ command, args, options });
        return { unref() {} };
      },
    });

    const result = await service.runLalaClawUpdate();

    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(true);
    expect(spawned).toHaveLength(1);
    const restartModeFlagIndex = spawned[0].args.indexOf('--restart-mode');
    expect(restartModeFlagIndex).toBeGreaterThan(-1);
    expect(spawned[0].args[restartModeFlagIndex + 1]).toBe('manual');
  });

  it('supports a dev mock preview flow for newer stable versions from a source checkout', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const spawned = [];
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: process.cwd(),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            stable: '2026.3.20-1',
          },
        }),
      }),
      spawnImpl: (command, args, options) => {
        spawned.push({ command, args, options });
        return { unref() {} };
      },
    });

    expect(service.setLalaClawUpdateDevMockState({
      enabled: true,
      stableVersion: '2026.3.21-1',
    })).toMatchObject({
      enabled: true,
      stableVersion: '2026.3.21-1',
      source: 'devtools',
    });

    const initialState = await service.getLalaClawUpdateState();

    expect(initialState.capability.updateSupported).toBe(true);
    expect(initialState.capability.installKind).toBe('npm-package');
    expect(initialState.updateAvailable).toBe(true);
    expect(initialState.targetRelease.version).toBe('2026.3.21-1');

    const started = await service.runLalaClawUpdate();

    expect(started.ok).toBe(true);
    expect(started.accepted).toBe(true);
    expect(started.state.job.status).toBe('scheduled');
    expect(started.state.job.active).toBe(true);
    expect(spawned).toHaveLength(0);

    const completedState = await service.getLalaClawUpdateState();

    expect(completedState.currentVersion).toBe('2026.3.21-1');
    expect(completedState.job.status).toBe('completed');
    expect(completedState.job.active).toBe(false);
    expect(completedState.updateAvailable).toBe(false);
  });

  it('can toggle the dev-only mock state without restarting the service', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: process.cwd(),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            stable: '2026.3.20-1',
          },
        }),
      }),
      spawnImpl: () => ({ unref() {} }),
    });

    expect(service.getLalaClawUpdateDevMockState()).toMatchObject({
      available: true,
      enabled: false,
      stableVersion: '',
      source: 'none',
    });

    await expect(service.getLalaClawUpdateState()).resolves.toMatchObject({
      updateAvailable: false,
      targetRelease: { version: '2026.3.20-1', stable: true },
    });

    expect(service.setLalaClawUpdateDevMockState({
      enabled: true,
      stableVersion: '2026.3.21-1',
    })).toMatchObject({
      available: true,
      enabled: true,
      stableVersion: '2026.3.21-1',
      source: 'devtools',
    });

    await expect(service.getLalaClawUpdateState()).resolves.toMatchObject({
      updateAvailable: true,
      targetRelease: { version: '2026.3.21-1', stable: true },
    });

    expect(service.setLalaClawUpdateDevMockState({ enabled: false })).toMatchObject({
      available: true,
      enabled: false,
      stableVersion: '',
      source: 'none',
    });

    await expect(service.getLalaClawUpdateState()).resolves.toMatchObject({
      updateAvailable: false,
      targetRelease: { version: '2026.3.20-1', stable: true },
    });
  });

  it('rejects the dev-only mock route outside a source checkout', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-update-'));
    tempDirs.push(stateDir);
    const service = createLalaClawUpdateService({
      currentVersion: '2026.3.20-1',
      config: {
        stateDir,
        accessConfigFile: '/tmp/lalaclaw/.env.local',
      },
      projectRoot: '/tmp/lalaclaw-package',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': {
            stable: '2026.3.20-1',
          },
        }),
      }),
      spawnImpl: () => ({ unref() {} }),
    });

    expect(() => service.getLalaClawUpdateDevMockState()).toThrow(expect.objectContaining({
      errorCode: 'lalaclaw_update_dev_mock_unavailable',
    }));
    expect(() => service.setLalaClawUpdateDevMockState({
      enabled: true,
      stableVersion: '2026.3.21-1',
    })).toThrow(expect.objectContaining({
      errorCode: 'lalaclaw_update_dev_mock_unavailable',
    }));
  });
});
