type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type OpenClawUpdateResult = Record<string, unknown>;

export function createOpenClawUpdateHandler({
  getOpenClawUpdateState,
  parseRequestBody,
  runOpenClawInstall,
  runOpenClawUpdate,
  sendJson,
}: {
  getOpenClawUpdateState: () => Promise<Record<string, unknown>>;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  runOpenClawInstall: () => Promise<OpenClawUpdateResult>;
  runOpenClawUpdate: (options: { restartGateway: boolean }) => Promise<OpenClawUpdateResult>;
  sendJson: JsonSender;
}) {
  return async function handleOpenClawUpdate(req: { method?: string }, res: unknown) {
    try {
      if (req.method === 'GET') {
        const result = await getOpenClawUpdateState();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST') {
        const body = await parseRequestBody(req);
        const action = String(body?.action || 'update').trim() || 'update';
        const result =
          action === 'install'
            ? await runOpenClawInstall()
            : await runOpenClawUpdate({
                restartGateway: body?.restartGateway !== false,
              });
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
        error: (error as { message?: string } | null)?.message || 'OpenClaw update request failed',
        errorCode: (error as { errorCode?: string } | null)?.errorCode || 'openclaw_update_failed',
      });
    }
  };
}
