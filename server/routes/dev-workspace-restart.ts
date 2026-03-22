type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

export function createDevWorkspaceRestartHandler({
  getDevWorkspaceRestartState,
  parseRequestBody,
  scheduleDevWorkspaceRestart,
  sendJson,
}: {
  getDevWorkspaceRestartState: () => Promise<Record<string, unknown>>;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  scheduleDevWorkspaceRestart: (payload: {
    frontendHost?: unknown;
    frontendPort?: unknown;
    targetBranch?: unknown;
    targetWorktreePath?: unknown;
  }) => Promise<Record<string, unknown>>;
  sendJson: JsonSender;
}) {
  return async function handleDevWorkspaceRestart(req: { method?: string }, res: unknown) {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, await getDevWorkspaceRestartState());
        return;
      }

      if (req.method === 'POST') {
        const body = await parseRequestBody(req);
        const result = await scheduleDevWorkspaceRestart({
          frontendHost: body?.frontendHost,
          frontendPort: body?.frontendPort,
          targetBranch: body?.targetBranch,
          targetWorktreePath: body?.targetWorktreePath,
        });
        sendJson(res, 202, result);
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      const statusCode = Number.isInteger((error as { statusCode?: number } | null)?.statusCode)
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'Dev workspace restart failed',
        errorCode: (error as { errorCode?: string } | null)?.errorCode || 'dev_workspace_restart_failed',
      });
    }
  };
}
