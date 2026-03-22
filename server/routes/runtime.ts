import { URL } from 'node:url';

type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type RuntimeSnapshot = {
  session?: {
    model?: string;
    sessionUser?: string;
  };
  conversation: unknown[];
  [key: string]: unknown;
};

type RuntimeRequestOptions = {
  agentId?: string;
  model?: string;
  thinkMode?: string;
  fastMode?: boolean;
};

function parseOptionalBoolean(value: string | null): boolean | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['1', 'true', 'on', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'off', 'no'].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function createRuntimeHandler({
  buildDashboardSnapshot,
  config,
  sendJson,
}: {
  buildDashboardSnapshot: (sessionUser: string, options: RuntimeRequestOptions) => Promise<RuntimeSnapshot>;
  config: { mode: string; model: string };
  sendJson: JsonSender;
}) {
  return async function handleRuntime(req: { headers: { host?: string }; url?: string }, res: unknown) {
    try {
      const searchParams = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`).searchParams;
      const sessionUser = String(searchParams.get('sessionUser') || 'command-center').trim() || 'command-center';
      const agentId = String(searchParams.get('agentId') || '').trim();
      const model = String(searchParams.get('model') || '').trim();
      const thinkMode = String(searchParams.get('thinkMode') || '').trim();
      const fastMode = parseOptionalBoolean(searchParams.get('fastMode'));
      const snapshot = await buildDashboardSnapshot(sessionUser, {
        ...(agentId ? { agentId } : {}),
        ...(model ? { model } : {}),
        ...(thinkMode ? { thinkMode } : {}),
        ...(typeof fastMode === 'boolean' ? { fastMode } : {}),
      });
      const resolvedModel = snapshot.session?.model || config.model;
      sendJson(res, 200, {
        ok: true,
        mode: config.mode,
        model: resolvedModel,
        ...snapshot,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'Runtime snapshot failed',
      });
    }
  };
}
