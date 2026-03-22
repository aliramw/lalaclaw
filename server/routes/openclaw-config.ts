import { URL } from 'node:url';

type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type RemoteAuthorization = Record<string, unknown> | null;

export function createOpenClawConfigHandler({
  applyOpenClawConfigPatch,
  getOpenClawConfigState,
  restoreRemoteOpenClawConfigBackup,
  parseRequestBody,
  sendJson,
}: {
  applyOpenClawConfigPatch: (payload: {
    agentId: string;
    baseHash: unknown;
    remoteAuthorization: RemoteAuthorization;
    restartGateway: boolean;
    values: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  getOpenClawConfigState: (payload: { agentId: string }) => Promise<Record<string, unknown>>;
  restoreRemoteOpenClawConfigBackup: (payload: {
    agentId: string;
    backupId: string;
    remoteAuthorization: RemoteAuthorization;
  }) => Promise<Record<string, unknown>>;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  sendJson: JsonSender;
}) {
  return async function handleOpenClawConfig(
    req: { method?: string; url?: string; headers?: { host?: string } },
    res: unknown,
  ) {
    try {
      if (req.method === 'GET') {
        const url = new URL(req.url || '/', `http://${req.headers?.host || '127.0.0.1'}`);
        const result = await getOpenClawConfigState({
          agentId: String(url.searchParams.get('agentId') || '').trim(),
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (String(body?.action || '').trim() === 'rollback') {
          const result = await restoreRemoteOpenClawConfigBackup({
            agentId: String(body?.agentId || '').trim(),
            backupId: String(body?.backupId || '').trim(),
            remoteAuthorization: (body?.remoteAuthorization as RemoteAuthorization) || null,
          });
          sendJson(res, 200, result);
          return;
        }

        const result = await applyOpenClawConfigPatch({
          agentId: String(body?.agentId || '').trim(),
          baseHash: body?.baseHash,
          remoteAuthorization: (body?.remoteAuthorization as RemoteAuthorization) || null,
          restartGateway: Boolean(body?.restartGateway),
          values: (body?.values as Record<string, unknown>) || {},
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
        error: (error as { message?: string } | null)?.message || 'OpenClaw config request failed',
        errorCode: (error as { errorCode?: string } | null)?.errorCode || 'openclaw_config_failed',
      });
    }
  };
}
