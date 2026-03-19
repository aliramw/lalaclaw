/* global describe, expect, it */
const { createOpenClawConfigHandler } = require('./openclaw-config');

describe('createOpenClawConfigHandler', () => {
  it('returns the current structured config state for GET requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let requestedAgentId = null;
    const handleOpenClawConfig = createOpenClawConfigHandler({
      getOpenClawConfigState: async ({ agentId } = {}) => {
        requestedAgentId = agentId || '';
        return ({
        ok: true,
        configPath: '/Users/example/.openclaw/openclaw.json',
        baseHash: 'abc123',
        fields: [{ key: 'gatewayBind', value: 'loopback' }],
        validation: { ok: true, valid: true },
      });
      },
      applyOpenClawConfigPatch: async () => ({ ok: true }),
      restoreRemoteOpenClawConfigBackup: async () => ({ ok: true }),
      parseRequestBody: async () => ({}),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawConfig({ method: 'GET', url: '/api/openclaw/config?agentId=main', headers: { host: '127.0.0.1' } }, {});

    expect(responseStatus).toBe(200);
    expect(requestedAgentId).toBe('main');
    expect(responseBody).toMatchObject({
      ok: true,
      configPath: '/Users/example/.openclaw/openclaw.json',
      baseHash: 'abc123',
    });
  });

  it('applies a structured config patch for POST requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let applyArgs = null;
    const handleOpenClawConfig = createOpenClawConfigHandler({
      getOpenClawConfigState: async () => ({ ok: true }),
      applyOpenClawConfigPatch: async ({ agentId, baseHash, remoteAuthorization, restartGateway, values }) => {
        applyArgs = { agentId, baseHash, remoteAuthorization, restartGateway, values };
        return ({
        ok: true,
        agentId,
        baseHash,
        remoteAuthorization,
        restartGateway,
        values,
      });
      },
      restoreRemoteOpenClawConfigBackup: async () => ({ ok: true }),
      parseRequestBody: async () => ({
        agentId: 'main',
        baseHash: 'next-base-hash',
        remoteAuthorization: { confirmed: true, note: 'Remote config patch from test' },
        restartGateway: true,
        values: { gatewayBind: 'loopback' },
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawConfig({ method: 'POST' }, {});

    expect(responseStatus).toBe(200);
    expect(applyArgs).toEqual({
      agentId: 'main',
      baseHash: 'next-base-hash',
      remoteAuthorization: { confirmed: true, note: 'Remote config patch from test' },
      restartGateway: true,
      values: { gatewayBind: 'loopback' },
    });
    expect(responseBody).toEqual({
      ok: true,
      agentId: 'main',
      baseHash: 'next-base-hash',
      remoteAuthorization: { confirmed: true, note: 'Remote config patch from test' },
      restartGateway: true,
      values: { gatewayBind: 'loopback' },
    });
  });

  it('restores a remote rollback point for POST rollback requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let restoreArgs = null;
    const handleOpenClawConfig = createOpenClawConfigHandler({
      getOpenClawConfigState: async () => ({ ok: true }),
      applyOpenClawConfigPatch: async () => ({ ok: true }),
      restoreRemoteOpenClawConfigBackup: async ({ agentId, backupId, remoteAuthorization }) => {
        restoreArgs = { agentId, backupId, remoteAuthorization };
        return {
          ok: true,
          agentId,
          backupReference: { id: backupId, label: 'remote-config-rollback-1' },
        };
      },
      parseRequestBody: async () => ({
        action: 'rollback',
        agentId: 'main',
        backupId: 'backup-1',
        remoteAuthorization: { confirmed: true, note: 'Restore backup-1' },
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawConfig({ method: 'POST' }, {});

    expect(responseStatus).toBe(200);
    expect(restoreArgs).toEqual({
      agentId: 'main',
      backupId: 'backup-1',
      remoteAuthorization: { confirmed: true, note: 'Restore backup-1' },
    });
    expect(responseBody).toEqual({
      ok: true,
      agentId: 'main',
      backupReference: { id: 'backup-1', label: 'remote-config-rollback-1' },
    });
  });

  it('returns structured error codes when apply fails', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawConfig = createOpenClawConfigHandler({
      getOpenClawConfigState: async () => ({ ok: true }),
      applyOpenClawConfigPatch: async () => {
        const error = new Error('OpenClaw config changed since it was loaded');
        error.statusCode = 409;
        error.errorCode = 'config_conflict';
        throw error;
      },
      restoreRemoteOpenClawConfigBackup: async () => ({ ok: true }),
      parseRequestBody: async () => ({
        baseHash: 'outdated',
        values: { gatewayBind: 'lan' },
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawConfig({ method: 'POST' }, {});

    expect(responseStatus).toBe(409);
    expect(responseBody).toEqual({
      ok: false,
      error: 'OpenClaw config changed since it was loaded',
      errorCode: 'config_conflict',
    });
  });
});
