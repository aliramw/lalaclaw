/* global describe, expect, it */
const { createOpenClawUpdateService, parseNoisyJson } = require('./openclaw-update');

describe('parseNoisyJson', () => {
  it('extracts the trailing JSON payload from noisy stdout', () => {
    const payload = parseNoisyJson('[plugins] warning\n{"ok":true,"value":1}\n');
    expect(payload).toEqual({ ok: true, value: 1 });
  });
});

describe('createOpenClawUpdateService', () => {
  it('returns install guidance when the OpenClaw binary is missing', async () => {
    const service = createOpenClawUpdateService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async () => {
        const error = new Error('spawn openclaw ENOENT');
        error.code = 'ENOENT';
        throw error;
      },
    });

    const result = await service.getOpenClawUpdateState();

    expect(result.ok).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.installGuidance).toMatchObject({
      docsUrl: 'https://docs.openclaw.ai/install',
    });
  });

  it('loads update status plus dry-run preview for installed package setups', async () => {
    const service = createOpenClawUpdateService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async (_command, args) => {
        if (args.join(' ') === 'update status --json') {
          return {
            stdout: '[plugins] ready\n{"update":{"installKind":"package","registry":{"latestVersion":"2026.3.19"}},"channel":{"value":"stable"},"availability":{"available":true,"latestVersion":"2026.3.19","hasRegistryUpdate":true}}',
            stderr: '',
          };
        }
        if (args.join(' ') === 'update --dry-run --json') {
          return {
            stdout: '[plugins] ready\n{"dryRun":true,"currentVersion":"2026.3.13","targetVersion":"2026.3.19","actions":["Run global package manager update with spec openclaw@latest"]}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${args.join(' ')}`);
      },
    });

    const result = await service.getOpenClawUpdateState();

    expect(result.installed).toBe(true);
    expect(result.availability).toMatchObject({ available: true, latestVersion: '2026.3.19' });
    expect(result.preview).toMatchObject({
      dryRun: true,
      currentVersion: '2026.3.13',
      targetVersion: '2026.3.19',
    });
  });

  it('runs the official update command and reports post-update health', async () => {
    const execMock = async (_command, args) => {
      if (args.join(' ') === 'update status --json') {
        return {
          stdout: '{"update":{"installKind":"package"},"channel":{"value":"stable"},"availability":{"available":true}}',
          stderr: '',
        };
      }
      if (args.join(' ') === 'update --dry-run --json') {
        return {
          stdout: '{"dryRun":true,"currentVersion":"2026.3.13","targetVersion":"2026.3.19","actions":["Run global package manager update with spec openclaw@latest"]}',
          stderr: '',
        };
      }
      if (args.join(' ') === 'update --yes --json') {
        return {
          stdout: '{"ok":true,"currentVersion":"2026.3.13","targetVersion":"2026.3.19"}',
          stderr: '',
        };
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    };
    const service = createOpenClawUpdateService({
      config: {
        openclawBin: 'openclaw',
        baseUrl: 'http://127.0.0.1:18789',
      },
      execFileAsync: execMock,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
    });

    const result = await service.runOpenClawUpdate({ restartGateway: true });

    expect(result.ok).toBe(true);
    expect(result.commandResult.command.display).toBe('openclaw update --yes --json');
    expect(result.healthCheck).toMatchObject({ status: 'healthy' });
    expect(result.result).toMatchObject({
      ok: true,
      targetVersion: '2026.3.19',
    });
  });

  it('runs the official install command when OpenClaw is missing', async () => {
    let installExecuted = false;
    const service = createOpenClawUpdateService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async (command, args) => {
        if (command === 'openclaw') {
          if (!installExecuted) {
            const error = new Error('spawn openclaw ENOENT');
            error.code = 'ENOENT';
            throw error;
          }
          if (args.join(' ') === 'update status --json') {
            return {
              stdout: '{"update":{"installKind":"package"},"channel":{"value":"stable"},"availability":{"available":false}}',
              stderr: '',
            };
          }
          if (args.join(' ') === 'update --dry-run --json') {
            return {
              stdout: '{"dryRun":true,"currentVersion":"2026.3.19","targetVersion":"2026.3.19","actions":["Run global package manager update with spec openclaw@latest"]}',
              stderr: '',
            };
          }
        }
        if (command === 'bash' && args[0] === '-lc') {
          installExecuted = true;
          expect(args[1]).toContain('https://openclaw.ai/install.sh');
          return { stdout: 'installed', stderr: '' };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      },
    });

    const result = await service.runOpenClawInstall();

    expect(result.ok).toBe(true);
    expect(result.action).toBe('install');
    expect(result.commandResult.command.display).toContain('https://openclaw.ai/install.sh');
    expect(result.state.installed).toBe(true);
  });

  it('keeps install command output when post-install state inspection fails', async () => {
    let installExecuted = false;
    const service = createOpenClawUpdateService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async (command, args) => {
        if (command === 'openclaw') {
          if (!installExecuted) {
            const error = new Error('spawn openclaw ENOENT');
            error.code = 'ENOENT';
            throw error;
          }
          if (args.join(' ') === 'update status --json') {
            return {
              stdout: 'not json',
              stderr: '',
            };
          }
        }
        if (command === 'bash' && args[0] === '-lc') {
          installExecuted = true;
          return { stdout: 'installed', stderr: 'npm notice installing openclaw' };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      },
    });

    const result = await service.runOpenClawInstall();

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('update_status_failed');
    expect(result.commandResult.ok).toBe(true);
    expect(result.commandResult.stdout).toContain('installed');
    expect(result.state).toBeNull();
  });
});
