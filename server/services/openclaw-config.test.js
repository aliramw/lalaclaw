import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOpenClawConfigService } from './openclaw-config.ts';

function getValueAtPath(target, dotPath = '') {
  return String(dotPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, segment) => (current && typeof current === 'object' ? current[segment] : undefined), target);
}

function setValueAtPath(target, dotPath = '', value) {
  const segments = String(dotPath || '').split('.').filter(Boolean);
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

function unsetValueAtPath(target, dotPath = '') {
  const segments = String(dotPath || '').split('.').filter(Boolean);
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      return;
    }
    cursor = cursor[segment];
  }
  delete cursor[segments[segments.length - 1]];
}

async function createTempConfigFixture(configJson) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lalaclaw-openclaw-config-'));
  const configPath = path.join(tempDir, 'openclaw.json');
  await fs.writeFile(configPath, JSON.stringify(configJson, null, 2));
  return { tempDir, configPath };
}

function createExecMock(configPath, { invalidAfterSet = false } = {}) {
  return async (_command, args) => {
    if (args[0] === 'config' && args[1] === 'validate') {
      if (invalidAfterSet) {
        return {
          stdout: JSON.stringify({
            valid: false,
            path: configPath,
            errors: [{ path: 'gateway.bind', message: 'Unsupported bind mode' }],
          }),
          stderr: '',
        };
      }

      return {
        stdout: JSON.stringify({ valid: true, path: configPath }),
        stderr: '',
      };
    }

    if (args[0] === 'config' && args[1] === 'set') {
      const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      setValueAtPath(nextConfig, args[2], JSON.parse(args[3]));
      await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2));
      return { stdout: `set ${args[2]}`, stderr: '' };
    }

    if (args[0] === 'config' && args[1] === 'unset') {
      const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      unsetValueAtPath(nextConfig, args[2]);
      await fs.writeFile(configPath, JSON.stringify(nextConfig, null, 2));
      return { stdout: `unset ${args[2]}`, stderr: '' };
    }

    if (args[0] === 'gateway' && args[1] === 'restart') {
      return { stdout: 'restarted', stderr: '' };
    }

    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };
}

describe('createOpenClawConfigService', () => {
  it('loads structured config state from remote OpenClaw config.get', async () => {
    const gatewayCalls = [];
    const service = createOpenClawConfigService({
      callOpenClawGateway: async (method) => {
        gatewayCalls.push(method);
        return {
          path: 'https://gateway.example.test/config',
          raw: '{"agents":{"defaults":{"model":{"primary":"openai/gpt-5.4"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
          parsed: {
            agents: { defaults: { model: { primary: 'openai/gpt-5.4' } } },
            bindings: [
              { agentId: 'main', match: { channel: 'dingtalk-connector', accountId: '__default__' } },
            ],
            channels: {
              'dingtalk-connector': { enabled: true },
              feishu: { enabled: true },
              wecom: { enabled: false },
              'openclaw-weixin': { enabled: true },
            },
            gateway: { bind: 'loopback', http: { endpoints: { chatCompletions: { enabled: true } } } },
            plugins: {
              entries: {
                'dingtalk-connector': { enabled: true },
                feishu: { enabled: true },
                'wecom-openclaw-plugin': { enabled: true },
                'openclaw-weixin': { enabled: true },
              },
            },
          },
          hash: 'remote-hash-1',
          valid: true,
          issues: [],
          warnings: [],
        };
      },
      config: {
        remoteOpenClawTarget: true,
        baseUrl: 'https://gateway.example.test',
        openclawBin: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('Should not run local openclaw config commands for remote state');
      },
    });

    const result = await service.getOpenClawConfigState();

    expect(gatewayCalls).toEqual(['config.get']);
    expect(result).toMatchObject({
      ok: true,
      remoteTarget: true,
      configPath: 'https://gateway.example.test/config',
      baseHash: 'remote-hash-1',
      modelOptions: ['openai/gpt-5.4'],
      validation: { ok: true, valid: true },
    });
    expect(result.imChannels).toMatchObject({
      'dingtalk-connector': expect.objectContaining({ enabled: true, defaultAgentId: 'main' }),
      feishu: expect.objectContaining({ enabled: true, defaultAgentId: '' }),
      wecom: expect.objectContaining({ enabled: false }),
      'openclaw-weixin': expect.objectContaining({ enabled: true, defaultAgentId: '' }),
    });
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'modelPrimary', value: 'openai/gpt-5.4' }),
      expect.objectContaining({ key: 'gatewayBind', value: 'loopback' }),
      expect.objectContaining({ key: 'chatCompletionsEnabled', value: true }),
    ]));
  });

  it('treats Weixin as enabled when the plugin is enabled even if no dedicated channel block exists', async () => {
    const service = createOpenClawConfigService({
      callOpenClawGateway: async () => ({
        path: 'https://gateway.example.test/config',
        parsed: {
          channels: {
            feishu: { enabled: true },
          },
          plugins: {
            entries: {
              'openclaw-weixin': { enabled: true },
            },
          },
        },
        hash: 'remote-hash-weixin-plugin-only',
        valid: true,
        issues: [],
        warnings: [],
      }),
      config: {
        remoteOpenClawTarget: true,
        baseUrl: 'https://gateway.example.test',
        openclawBin: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('Should not run local openclaw config commands for remote state');
      },
    });

    const result = await service.getOpenClawConfigState();

    expect(result.imChannels['openclaw-weixin']).toMatchObject({
      channelEnabled: true,
      pluginEnabled: true,
      enabled: true,
    });
  });

  it('applies a remote config patch through gateway RPC and stores a rollback point reference', async () => {
    const gatewayCalls = [];
    const savedBackups = [];
    const snapshots = [
      {
        path: 'https://gateway.example.test/config',
        raw: '{"agents":{"defaults":{"model":{"primary":"openai/gpt-5.4"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
        parsed: {
          agents: { defaults: { model: { primary: 'openai/gpt-5.4' } } },
          gateway: { bind: 'loopback', http: { endpoints: { chatCompletions: { enabled: true } } } },
        },
        hash: 'remote-hash-1',
        valid: true,
        issues: [],
        warnings: [],
      },
      {
        path: 'https://gateway.example.test/config',
        raw: '{"agents":{"defaults":{"model":{"primary":"openrouter/minimax/minimax-m2.5"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":false}}}}}',
        parsed: {
          agents: { defaults: { model: { primary: 'openrouter/minimax/minimax-m2.5' } } },
          gateway: { bind: 'loopback', http: { endpoints: { chatCompletions: { enabled: false } } } },
        },
        hash: 'remote-hash-2',
        valid: true,
        issues: [],
        warnings: [],
      },
    ];
    const service = createOpenClawConfigService({
      backupStore: {
        save(entry) {
          savedBackups.push(entry);
          return { id: 'backup-1', label: 'remote-config-backup-1', createdAt: entry.createdAt, hash: entry.hash };
        },
      },
      callOpenClawGateway: async (method, params) => {
        gatewayCalls.push({ method, params });
        if (method === 'config.get') {
          return snapshots.shift();
        }
        if (method === 'config.patch') {
          return {
            ok: true,
            restart: { scheduled: true },
          };
        }
        throw new Error(`Unexpected remote method ${method}`);
      },
      config: {
        remoteOpenClawTarget: true,
        baseUrl: 'https://gateway.example.test',
        openclawBin: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('Should not run local openclaw config commands for remote patch');
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
      now: () => Date.parse('2026-03-19T10:11:12Z'),
    });

    const result = await service.applyOpenClawConfigPatch({
      baseHash: 'remote-hash-1',
      restartGateway: true,
      remoteAuthorization: { confirmed: true, note: 'Apply remote patch from Inspector' },
      values: {
        modelPrimary: 'openrouter/minimax/minimax-m2.5',
        chatCompletionsEnabled: false,
      },
    });

    expect(savedBackups).toHaveLength(1);
    expect(savedBackups[0]).toMatchObject({
      target: 'remote',
      targetKey: 'remote:https://gateway.example.test',
      raw: expect.any(String),
    });
    expect(gatewayCalls.map((entry) => entry.method)).toEqual(['config.get', 'config.patch', 'config.get']);
    expect(gatewayCalls[1].params).toMatchObject({
      baseHash: 'remote-hash-1',
      note: 'Apply remote patch from Inspector',
    });
    expect(JSON.parse(gatewayCalls[1].params.raw)).toEqual({
      agents: { defaults: { model: { primary: 'openrouter/minimax/minimax-m2.5' } } },
      gateway: { http: { endpoints: { chatCompletions: { enabled: false } } } },
    });
    expect(result).toMatchObject({
      ok: true,
      remoteTarget: true,
      backupReference: { id: 'backup-1', label: 'remote-config-backup-1' },
      healthCheck: { status: 'healthy' },
    });
    expect(result.changedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'modelPrimary', before: 'openai/gpt-5.4', after: 'openrouter/minimax/minimax-m2.5' }),
      expect.objectContaining({ key: 'chatCompletionsEnabled', before: true, after: false }),
    ]));
  });

  it('retries reloading remote config state after config.patch restarts the gateway', async () => {
    const gatewayCalls = [];
    const snapshots = [
      {
        path: 'https://gateway.example.test/config',
        raw: '{"gateway":{"bind":"auto","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
        parsed: {
          gateway: { bind: 'auto', http: { endpoints: { chatCompletions: { enabled: true } } } },
        },
        hash: 'remote-hash-1',
        valid: true,
        issues: [],
        warnings: [],
      },
      {
        path: 'https://gateway.example.test/config',
        raw: '{"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
        parsed: {
          gateway: { bind: 'loopback', http: { endpoints: { chatCompletions: { enabled: true } } } },
        },
        hash: 'remote-hash-2',
        valid: true,
        issues: [],
        warnings: [],
      },
    ];
    let postPatchReloadAttempts = 0;
    const service = createOpenClawConfigService({
      backupStore: {
        save(entry) {
          return { id: 'backup-1', label: 'remote-config-backup-1', createdAt: entry.createdAt, hash: entry.hash };
        },
      },
      callOpenClawGateway: async (method, params) => {
        gatewayCalls.push({ method, params });
        if (method === 'config.get') {
          if (gatewayCalls.some((entry) => entry.method === 'config.patch')) {
            postPatchReloadAttempts += 1;
            if (postPatchReloadAttempts === 1) {
              const error = new Error('gateway closed (1006 abnormal closure (no close frame)): no close reason');
              throw error;
            }
          }
          return snapshots.shift();
        }
        if (method === 'config.patch') {
          return {
            ok: true,
            restart: { scheduled: true },
          };
        }
        throw new Error(`Unexpected remote method ${method}`);
      },
      config: {
        remoteOpenClawTarget: true,
        baseUrl: 'https://gateway.example.test',
        openclawBin: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('Should not run local openclaw config commands for remote patch');
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
      waitImpl: async () => {},
    });

    const result = await service.applyOpenClawConfigPatch({
      baseHash: 'remote-hash-1',
      restartGateway: true,
      remoteAuthorization: { confirmed: true, note: 'Apply remote patch from Inspector' },
      values: {
        gatewayBind: 'loopback',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      remoteTarget: true,
      healthCheck: { status: 'healthy' },
    });
    expect(postPatchReloadAttempts).toBe(2);
    expect(gatewayCalls.map((entry) => entry.method)).toEqual(['config.get', 'config.patch', 'config.get', 'config.get']);
  });

  it('restores a remote rollback point through gateway RPC', async () => {
    const gatewayCalls = [];
    const snapshots = [
      {
        path: 'https://gateway.example.test/config',
        raw: '{"agents":{"defaults":{"model":{"primary":"openrouter/minimax/minimax-m2.5"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":false}}}}}',
        parsed: {
          agents: { defaults: { model: { primary: 'openrouter/minimax/minimax-m2.5' } } },
          gateway: { bind: 'loopback', http: { endpoints: { chatCompletions: { enabled: false } } } },
        },
        hash: 'remote-hash-2',
        valid: true,
        issues: [],
        warnings: [],
      },
      {
        path: 'https://gateway.example.test/config',
        raw: '{"agents":{"defaults":{"model":{"primary":"openai/gpt-5.4"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
        parsed: {
          agents: { defaults: { model: { primary: 'openai/gpt-5.4' } } },
          gateway: { bind: 'loopback', http: { endpoints: { chatCompletions: { enabled: true } } } },
        },
        hash: 'remote-hash-3',
        valid: true,
        issues: [],
        warnings: [],
      },
    ];
    const service = createOpenClawConfigService({
      backupStore: {
        get(id) {
          if (id !== 'backup-1') {
            return null;
          }
          return {
            id: 'backup-1',
            label: 'remote-config-backup-1',
            target: 'remote',
            targetKey: 'remote:https://gateway.example.test',
            raw: '{"agents":{"defaults":{"model":{"primary":"openai/gpt-5.4"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
          };
        },
      },
      callOpenClawGateway: async (method, params) => {
        gatewayCalls.push({ method, params });
        if (method === 'config.get') {
          return snapshots.shift();
        }
        if (method === 'config.apply') {
          return {
            ok: true,
            restart: { scheduled: true },
          };
        }
        throw new Error(`Unexpected remote method ${method}`);
      },
      config: {
        remoteOpenClawTarget: true,
        baseUrl: 'https://gateway.example.test',
        openclawBin: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('Should not run local openclaw config commands for remote rollback');
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
    });

    const result = await service.restoreRemoteOpenClawConfigBackup({
      backupId: 'backup-1',
      remoteAuthorization: { confirmed: true, note: 'Restore remote snapshot' },
    });

    expect(gatewayCalls.map((entry) => entry.method)).toEqual(['config.get', 'config.apply', 'config.get']);
    expect(gatewayCalls[1].params).toMatchObject({
      baseHash: 'remote-hash-2',
      note: 'Restore remote snapshot',
      raw: '{"agents":{"defaults":{"model":{"primary":"openai/gpt-5.4"}}},"gateway":{"bind":"loopback","http":{"endpoints":{"chatCompletions":{"enabled":true}}}}}',
    });
    expect(result).toMatchObject({
      ok: true,
      rolledBack: true,
      remoteTarget: true,
      backupReference: { id: 'backup-1', label: 'remote-config-backup-1' },
      healthCheck: { status: 'healthy' },
    });
  });

  it('loads the structured config state with field values and validation', async () => {
    const { configPath } = await createTempConfigFixture({
      bindings: [
        { agentId: 'main', match: { channel: 'dingtalk-connector', accountId: '__default__' } },
      ],
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-5.4' },
        },
        list: [
          { id: 'main', model: 'openrouter/minimax/minimax-m2.5' },
          { id: 'writer' },
        ],
      },
      gateway: {
        bind: 'loopback',
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
      },
      channels: {
        'dingtalk-connector': { enabled: true },
        feishu: { enabled: false },
        wecom: { enabled: true },
        'openclaw-weixin': { enabled: true },
      },
      plugins: {
        entries: {
          'dingtalk-connector': { enabled: true },
          feishu: { enabled: true },
          'wecom-openclaw-plugin': { enabled: false },
          'openclaw-weixin': { enabled: true },
        },
      },
    });

    const service = createOpenClawConfigService({
      config: { localConfigPath: configPath, openclawBin: 'openclaw' },
      execFileAsync: createExecMock(configPath),
    });

    const result = await service.getOpenClawConfigState({ agentId: 'main' });

    expect(result.ok).toBe(true);
    expect(result.configPath).toBe(configPath);
    expect(result.baseHash).toMatch(/[a-f0-9]{64}/);
    expect(result.validation).toMatchObject({ ok: true, valid: true });
    expect(result.modelOptions).toEqual([
      'openai/gpt-5.4',
      'openrouter/minimax/minimax-m2.5',
    ]);
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'modelPrimary', value: 'openai/gpt-5.4' }),
      expect.objectContaining({ key: 'agentModel', value: 'openrouter/minimax/minimax-m2.5', meta: { agentId: 'main' } }),
      expect.objectContaining({ key: 'gatewayBind', value: 'loopback' }),
      expect.objectContaining({ key: 'chatCompletionsEnabled', value: true }),
    ]));
    expect(result.imChannels).toMatchObject({
      'dingtalk-connector': expect.objectContaining({ enabled: true, defaultAgentId: 'main' }),
      feishu: expect.objectContaining({ enabled: false }),
      wecom: expect.objectContaining({ enabled: false }),
      'openclaw-weixin': expect.objectContaining({ enabled: true, defaultAgentId: '' }),
    });
  });

  it('applies a safe config patch, saves a backup, and restarts the gateway when requested', async () => {
    const { configPath } = await createTempConfigFixture({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-5.4' },
        },
        list: [
          { id: 'main', model: 'openrouter/minimax/minimax-m2.5' },
        ],
      },
      gateway: {
        bind: 'loopback',
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
      },
    });
    const savedBackups = [];
    const service = createOpenClawConfigService({
      backupStore: {
        save(entry) {
          savedBackups.push(entry);
          return { id: 'backup-local-1', label: 'local-config-backup-1', createdAt: entry.createdAt, hash: entry.hash, backupPath: entry.backupPath };
        },
        get() {
          return null;
        },
      },
      config: {
        localConfigPath: configPath,
        openclawBin: 'openclaw',
        baseUrl: 'http://127.0.0.1:18789',
      },
      execFileAsync: createExecMock(configPath),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
      now: () => Date.parse('2026-03-19T10:11:12Z'),
    });

    const initialState = await service.getOpenClawConfigState();
    const result = await service.applyOpenClawConfigPatch({
      agentId: 'main',
      baseHash: initialState.baseHash,
      restartGateway: true,
      values: {
        modelPrimary: 'openrouter/minimax/minimax-m2.5',
        agentModel: 'openai-codex/gpt-5.4',
        chatCompletionsEnabled: false,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.backupPath).toContain('.backup.');
    expect(result.backupReference).toMatchObject({ id: 'backup-local-1', label: 'local-config-backup-1' });
    expect(savedBackups[0]).toMatchObject({
      target: 'local',
      targetKey: `local:${configPath}`,
      backupPath: result.backupPath,
    });
    expect(result.changedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'modelPrimary',
        before: 'openai/gpt-5.4',
        after: 'openrouter/minimax/minimax-m2.5',
      }),
      expect.objectContaining({
        key: 'agentModel',
        before: 'openrouter/minimax/minimax-m2.5',
        after: 'openai-codex/gpt-5.4',
        meta: { agentId: 'main' },
      }),
      expect.objectContaining({
        key: 'chatCompletionsEnabled',
        before: true,
        after: false,
      }),
    ]));
    expect(result.restartResult).toMatchObject({
      ok: true,
      command: { display: 'openclaw gateway restart' },
    });
    expect(result.healthCheck).toMatchObject({ status: 'healthy' });
    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(getValueAtPath(nextConfig, 'agents.defaults.model.primary')).toBe('openrouter/minimax/minimax-m2.5');
    expect(getValueAtPath(nextConfig, 'agents.list.0.model')).toBe('openai-codex/gpt-5.4');
    expect(getValueAtPath(nextConfig, 'gateway.http.endpoints.chatCompletions.enabled')).toBe(false);
  });

  it('restores a local rollback point from the backup store', async () => {
    const initialConfig = {
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-5.4' },
        },
      },
      gateway: {
        bind: 'loopback',
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
      },
    };
    const { configPath } = await createTempConfigFixture(initialConfig);
    const backupPath = `${configPath}.backup.20260319T101112Z`;
    const modifiedConfig = {
      ...initialConfig,
      gateway: {
        ...initialConfig.gateway,
        bind: 'lan',
        http: {
          endpoints: {
            chatCompletions: { enabled: false },
          },
        },
      },
    };
    await fs.writeFile(configPath, JSON.stringify(modifiedConfig, null, 2));
    await fs.writeFile(backupPath, JSON.stringify(initialConfig, null, 2));

    const execFileAsync = createExecMock(configPath);
    const service = createOpenClawConfigService({
      backupStore: {
        get(id) {
          if (id !== 'backup-local-1') {
            return null;
          }
          return {
            id: 'backup-local-1',
            label: 'local-config-backup-1',
            target: 'local',
            targetKey: `local:${configPath}`,
            backupPath,
            raw: JSON.stringify(initialConfig, null, 2),
          };
        },
      },
      config: {
        localConfigPath: configPath,
        openclawBin: 'openclaw',
        baseUrl: 'http://127.0.0.1:18789',
      },
      execFileAsync,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
    });

    const result = await service.restoreOpenClawConfigBackup({
      backupId: 'backup-local-1',
    });

    expect(result).toMatchObject({
      ok: true,
      rolledBack: true,
      backupPath,
      backupReference: { id: 'backup-local-1', label: 'local-config-backup-1' },
      healthCheck: { status: 'healthy' },
    });
    expect(result.restartResult).toMatchObject({
      ok: true,
      command: { display: 'openclaw gateway restart' },
    });
    const restoredConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(restoredConfig).toEqual(initialConfig);
  });

  it('rejects restoring a rollback point captured from a different remote target', async () => {
    const service = createOpenClawConfigService({
      backupStore: {
        get(id) {
          if (id !== 'backup-1') {
            return null;
          }
          return {
            id: 'backup-1',
            label: 'remote-config-backup-1',
            target: 'remote',
            targetKey: 'remote:https://gateway-a.example.test',
            raw: '{"gateway":{"bind":"loopback"}}',
          };
        },
      },
      callOpenClawGateway: async () => {
        throw new Error('Should not call remote gateway when the rollback target mismatches');
      },
      config: {
        remoteOpenClawTarget: true,
        baseUrl: 'https://gateway-b.example.test',
        openclawBin: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('Should not run local OpenClaw commands for remote rollback');
      },
    });

    await expect(service.restoreOpenClawConfigBackup({
      backupId: 'backup-1',
      remoteAuthorization: { confirmed: true, note: 'Restore mismatch' },
    })).rejects.toMatchObject({
      errorCode: 'backup_target_mismatch',
      statusCode: 409,
    });
  });

  it('unsets the current agent model override when agentModel is blank', async () => {
    const { configPath } = await createTempConfigFixture({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-5.4' },
        },
        list: [
          { id: 'main', model: 'openrouter/minimax/minimax-m2.5' },
        ],
      },
      gateway: {
        bind: 'loopback',
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
      },
    });
    const service = createOpenClawConfigService({
      config: {
        localConfigPath: configPath,
        openclawBin: 'openclaw',
      },
      execFileAsync: createExecMock(configPath),
    });

    const initialState = await service.getOpenClawConfigState({ agentId: 'main' });
    const result = await service.applyOpenClawConfigPatch({
      agentId: 'main',
      baseHash: initialState.baseHash,
      values: {
        agentModel: '',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.changedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'agentModel',
        before: 'openrouter/minimax/minimax-m2.5',
        after: undefined,
      }),
    ]));

    const nextConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(getValueAtPath(nextConfig, 'agents.list.0.model')).toBeUndefined();
  });

  it('restores the backup when validation fails after applying a patch', async () => {
    const initialConfig = {
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-5.4' },
        },
      },
      gateway: {
        bind: 'loopback',
        http: {
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
      },
    };
    const { configPath } = await createTempConfigFixture(initialConfig);
    const service = createOpenClawConfigService({
      config: {
        localConfigPath: configPath,
        openclawBin: 'openclaw',
      },
      execFileAsync: createExecMock(configPath, { invalidAfterSet: true }),
      now: () => Date.parse('2026-03-19T10:11:12Z'),
    });

    const initialState = await service.getOpenClawConfigState();
    const result = await service.applyOpenClawConfigPatch({
      baseHash: initialState.baseHash,
      values: {
        gatewayBind: 'lan',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.validation).toMatchObject({ ok: false, valid: false });
    const restoredConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(restoredConfig).toEqual(initialConfig);
    expect(result.state.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'gatewayBind', value: 'loopback' }),
    ]));
  });
});
