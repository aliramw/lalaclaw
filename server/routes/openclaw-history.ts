type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type OpenClawHistoryEntry = Record<string, unknown>;

type OpenClawHistoryResult = {
  ok: boolean;
  entries: OpenClawHistoryEntry[];
};

export function createOpenClawHistoryHandler({
  listOpenClawOperationHistory,
  sendJson,
}: {
  listOpenClawOperationHistory: () => Promise<OpenClawHistoryResult>;
  sendJson: JsonSender;
}) {
  return async function handleOpenClawHistory(req: { method?: string }, res: unknown) {
    try {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      const result = await listOpenClawOperationHistory();
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = Number.isInteger((error as { statusCode?: number } | null)?.statusCode)
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'OpenClaw operation history request failed',
      });
    }
  };
}
