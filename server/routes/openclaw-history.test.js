/* global describe, expect, it */
const { createOpenClawHistoryHandler } = require('./openclaw-history');

describe('createOpenClawHistoryHandler', () => {
  it('returns the current operation history on GET', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawHistory = createOpenClawHistoryHandler({
      listOpenClawOperationHistory: async () => ({
        ok: true,
        entries: [{ id: 'entry-1', scope: 'config', action: 'apply' }],
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawHistory({ method: 'GET' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      entries: [{ id: 'entry-1', scope: 'config', action: 'apply' }],
    });
  });

  it('rejects non-GET methods', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawHistory = createOpenClawHistoryHandler({
      listOpenClawOperationHistory: async () => ({ ok: true, entries: [] }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawHistory({ method: 'POST' }, {});

    expect(responseStatus).toBe(405);
    expect(responseBody).toEqual({ ok: false, error: 'Method not allowed' });
  });
});
