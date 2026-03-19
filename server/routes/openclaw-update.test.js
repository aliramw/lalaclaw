/* global describe, expect, it */
const { createOpenClawUpdateHandler } = require('./openclaw-update');

describe('createOpenClawUpdateHandler', () => {
  it('returns install/update state for GET requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawUpdate = createOpenClawUpdateHandler({
      getOpenClawUpdateState: async () => ({
        ok: true,
        installed: true,
        availability: { available: false },
      }),
      parseRequestBody: async () => ({}),
      runOpenClawUpdate: async () => ({ ok: true }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawUpdate({ method: 'GET' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      installed: true,
      availability: { available: false },
    });
  });

  it('runs a controlled update for POST requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawUpdate = createOpenClawUpdateHandler({
      getOpenClawUpdateState: async () => ({ ok: true }),
      parseRequestBody: async () => ({ restartGateway: false }),
      runOpenClawInstall: async () => ({ ok: true, action: 'install' }),
      runOpenClawUpdate: async ({ restartGateway }) => ({
        ok: true,
        restartGateway,
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawUpdate({ method: 'POST' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      restartGateway: false,
    });
  });

  it('runs the official install flow when requested', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawUpdate = createOpenClawUpdateHandler({
      getOpenClawUpdateState: async () => ({ ok: true }),
      parseRequestBody: async () => ({ action: 'install' }),
      runOpenClawInstall: async () => ({
        ok: true,
        action: 'install',
      }),
      runOpenClawUpdate: async () => ({ ok: true, action: 'update' }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawUpdate({ method: 'POST' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      action: 'install',
    });
  });
});
