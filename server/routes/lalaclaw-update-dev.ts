type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

export function createLalaClawUpdateDevHandler({
  getLalaClawUpdateDevMockState,
  parseRequestBody,
  sendJson,
  setLalaClawUpdateDevMockState,
}: {
  getLalaClawUpdateDevMockState: () => Promise<Record<string, unknown>>;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  sendJson: JsonSender;
  setLalaClawUpdateDevMockState: (payload: { enabled: boolean; stableVersion?: unknown }) => Promise<Record<string, unknown>>;
}) {
  return async function handleLalaClawUpdateDev(req: { method?: string }, res: unknown) {
    try {
      if (req.method === 'GET') {
        const result = await getLalaClawUpdateDevMockState();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST') {
        const body = await parseRequestBody(req);
        const enabled = body?.enabled !== false;
        const result = await setLalaClawUpdateDevMockState({
          enabled,
          stableVersion: body?.stableVersion,
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'DELETE') {
        const result = await setLalaClawUpdateDevMockState({ enabled: false });
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      const statusCode = Number.isInteger((error as { statusCode?: number } | null)?.statusCode)
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'LalaClaw update dev mock request failed',
        errorCode: (error as { errorCode?: string } | null)?.errorCode || 'lalaclaw_update_dev_mock_failed',
      });
    }
  };
}
