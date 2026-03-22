type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type OpenClawActionResult = Record<string, unknown>;

export function createOpenClawManagementHandler({
  parseRequestBody,
  runOpenClawAction,
  sendJson,
}: {
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  runOpenClawAction: (action: string) => Promise<OpenClawActionResult>;
  sendJson: JsonSender;
}) {
  return async function handleOpenClawManagement(req: unknown, res: unknown) {
    try {
      const body = await parseRequestBody(req);
      const action = String(body?.action || '').trim();
      if (!action) {
        sendJson(res, 400, { ok: false, error: 'OpenClaw action is required' });
        return;
      }

      const result = await runOpenClawAction(action);
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = Number.isInteger((error as { statusCode?: number } | null)?.statusCode)
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'OpenClaw action failed',
        errorCode: (error as { errorCode?: string } | null)?.errorCode || 'openclaw_action_failed',
      });
    }
  };
}
