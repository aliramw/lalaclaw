/* global describe, expect, it */
const { createLalaClawUpdateDevHandler } = require('./lalaclaw-update-dev');

describe('createLalaClawUpdateDevHandler', () => {
  it('returns the current dev mock state for GET requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleLalaClawUpdateDev = createLalaClawUpdateDevHandler({
      getLalaClawUpdateDevMockState: async () => ({
        ok: true,
        available: true,
        enabled: true,
        stableVersion: '2026.3.21-1',
        source: 'devtools',
      }),
      parseRequestBody: async () => ({}),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      setLalaClawUpdateDevMockState: async () => ({ ok: true }),
    });

    await handleLalaClawUpdateDev({ method: 'GET' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      available: true,
      enabled: true,
      stableVersion: '2026.3.21-1',
      source: 'devtools',
    });
  });

  it('updates the dev mock state for POST requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let receivedPayload = null;
    const handleLalaClawUpdateDev = createLalaClawUpdateDevHandler({
      getLalaClawUpdateDevMockState: async () => ({ ok: true }),
      parseRequestBody: async () => ({
        enabled: true,
        stableVersion: '2026.3.22-1',
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      setLalaClawUpdateDevMockState: async (payload) => {
        receivedPayload = payload;
        return {
          ok: true,
          available: true,
          enabled: true,
          stableVersion: '2026.3.22-1',
          source: 'devtools',
        };
      },
    });

    await handleLalaClawUpdateDev({ method: 'POST' }, {});

    expect(receivedPayload).toEqual({
      enabled: true,
      stableVersion: '2026.3.22-1',
    });
    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      available: true,
      enabled: true,
      stableVersion: '2026.3.22-1',
      source: 'devtools',
    });
  });

  it('disables the dev mock state for DELETE requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let receivedPayload = null;
    const handleLalaClawUpdateDev = createLalaClawUpdateDevHandler({
      getLalaClawUpdateDevMockState: async () => ({ ok: true }),
      parseRequestBody: async () => ({}),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
      setLalaClawUpdateDevMockState: async (payload) => {
        receivedPayload = payload;
        return {
          ok: true,
          available: true,
          enabled: false,
          stableVersion: '',
          source: 'none',
        };
      },
    });

    await handleLalaClawUpdateDev({ method: 'DELETE' }, {});

    expect(receivedPayload).toEqual({ enabled: false });
    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      available: true,
      enabled: false,
      stableVersion: '',
      source: 'none',
    });
  });
});
