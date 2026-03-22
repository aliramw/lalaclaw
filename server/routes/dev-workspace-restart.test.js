/* global describe, expect, it */
import { createDevWorkspaceRestartHandler } from './dev-workspace-restart.ts';

describe('createDevWorkspaceRestartHandler', () => {
  it('returns the current dev workspace restart state for GET requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleDevWorkspaceRestart = createDevWorkspaceRestartHandler({
      getDevWorkspaceRestartState: async () => ({
        ok: true,
        available: true,
        active: false,
        restartId: '',
        status: 'idle',
      }),
      parseRequestBody: async () => ({}),
      scheduleDevWorkspaceRestart: async () => ({ ok: true }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleDevWorkspaceRestart({ method: 'GET' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      available: true,
      active: false,
      restartId: '',
      status: 'idle',
    });
  });

  it('schedules a dev workspace restart for POST requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let receivedPayload = null;
    const handleDevWorkspaceRestart = createDevWorkspaceRestartHandler({
      getDevWorkspaceRestartState: async () => ({ ok: true }),
      parseRequestBody: async () => ({
        frontendHost: '127.0.0.1',
        frontendPort: 5173,
        targetBranch: 'main',
        targetWorktreePath: '/tmp/lalaclaw-worktree',
      }),
      scheduleDevWorkspaceRestart: async (payload) => {
        receivedPayload = payload;
        return {
          ok: true,
          available: true,
          accepted: true,
          active: true,
          restartId: 'restart-1',
          status: 'scheduled',
        };
      },
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleDevWorkspaceRestart({ method: 'POST' }, {});

    expect(receivedPayload).toEqual({
      frontendHost: '127.0.0.1',
      frontendPort: 5173,
      targetBranch: 'main',
      targetWorktreePath: '/tmp/lalaclaw-worktree',
    });
    expect(responseStatus).toBe(202);
    expect(responseBody).toEqual({
      ok: true,
      available: true,
      accepted: true,
      active: true,
      restartId: 'restart-1',
      status: 'scheduled',
    });
  });
});
