/* global describe, expect, it */
const { createLalaClawUpdateHandler } = require('./lalaclaw-update');

describe('createLalaClawUpdateHandler', () => {
  it('returns the stable update state for GET requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleLalaClawUpdate = createLalaClawUpdateHandler({
      getLalaClawUpdateState: async () => ({
        ok: true,
        updateAvailable: true,
        targetRelease: { version: '2026.3.21-1', stable: true },
      }),
      parseRequestBody: async () => ({}),
      runLalaClawUpdate: async () => ({ ok: true, accepted: true }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleLalaClawUpdate({ method: 'GET' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      updateAvailable: true,
      targetRelease: { version: '2026.3.21-1', stable: true },
    });
  });

  it('starts the background update flow for POST requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleLalaClawUpdate = createLalaClawUpdateHandler({
      getLalaClawUpdateState: async () => ({ ok: true }),
      parseRequestBody: async () => ({}),
      runLalaClawUpdate: async () => ({
        ok: true,
        accepted: true,
        state: {
          job: {
            status: 'scheduled',
          },
        },
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleLalaClawUpdate({ method: 'POST' }, {});

    expect(responseStatus).toBe(202);
    expect(responseBody).toEqual({
      ok: true,
      accepted: true,
      state: {
        job: {
          status: 'scheduled',
        },
      },
    });
  });
});
