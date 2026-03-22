type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type LalaClawUpdateResult = Record<string, unknown> & {
  accepted?: boolean;
};

export function createLalaClawUpdateHandler({
  getLalaClawUpdateState,
  parseRequestBody,
  runLalaClawUpdate,
  sendJson,
}: {
  getLalaClawUpdateState: () => Promise<Record<string, unknown>>;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  runLalaClawUpdate: () => Promise<LalaClawUpdateResult>;
  sendJson: JsonSender;
}) {
  return async function handleLalaClawUpdate(req: { method?: string }, res: unknown) {
    try {
      if (req.method === 'GET') {
        const result = await getLalaClawUpdateState();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST') {
        await parseRequestBody(req);
        const result = await runLalaClawUpdate();
        sendJson(res, result?.accepted ? 202 : 200, result);
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      const statusCode = Number.isInteger((error as { statusCode?: number } | null)?.statusCode)
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'LalaClaw update request failed',
        errorCode: (error as { errorCode?: string } | null)?.errorCode || 'lalaclaw_update_failed',
      });
    }
  };
}
