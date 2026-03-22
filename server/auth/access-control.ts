import crypto from 'node:crypto';

export const DEFAULT_ACCESS_COOKIE_NAME = 'lalaclaw_access';
export const DEFAULT_ACCESS_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type AccessMode = 'off' | 'token';

type CookieOptions = {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  sameSite?: string;
  secure?: boolean;
};

type AccessSessionRecord = {
  createdAt: number;
  expiresAt: number;
};

type AccessConfig = {
  accessMode?: unknown;
  accessTokensRaw?: unknown;
  accessTokensFile?: unknown;
  accessCookieName?: unknown;
  accessSessionTtlMs?: unknown;
  accessConfigFile?: unknown;
};

type JsonSender = (res: unknown, status: number, body: Record<string, unknown>) => void;

type RequestLike = {
  method?: string;
  headers?: Record<string, string | undefined>;
  socket?: {
    encrypted?: boolean;
  };
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
};

type UpgradeSocketLike = {
  write: (chunk: string) => void;
  destroy: () => void;
};

export function normalizeAccessMode(value = ''): AccessMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'token') {
    return 'token';
  }
  return 'off';
}

export function parseAccessTokens(value = ''): string[] {
  return String(value || '')
    .split(/[\r\n,]+/u)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

export function readCookieValue(cookieHeader = '', key = ''): string {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return '';
  }

  return (
    String(cookieHeader || '')
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex < 0) {
          return ['', ''];
        }
        return [entry.slice(0, separatorIndex).trim(), entry.slice(separatorIndex + 1).trim()];
      })
      .find(([name]) => name === normalizedKey)?.[1] || ''
  );
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAge) || 0))}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function isSecureRequest(req: RequestLike): boolean {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').trim().toLowerCase();
  return forwardedProto === 'https' || Boolean(req?.socket?.encrypted);
}

export function isTrustedOrigin(req: RequestLike): boolean {
  const originHeader = String(req?.headers?.origin || '').trim();
  if (!originHeader) {
    return true;
  }

  try {
    const origin = new URL(originHeader);
    const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim();
    const hostHeader = forwardedHost || String(req?.headers?.host || '').trim();
    return Boolean(hostHeader) && origin.host === hostHeader;
  } catch {
    return false;
  }
}

function constantTimeMatch(candidate = '', expected = ''): boolean {
  const left = Buffer.from(String(candidate || ''));
  const right = Buffer.from(String(expected || ''));
  if (!left.length || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function loadConfiguredAccessTokens(
  config: AccessConfig = {},
  readTextIfExists: (filePath: string) => string = () => '',
): string[] {
  const directTokens = parseAccessTokens(config.accessTokensRaw as string);
  const accessTokensFile = String(config.accessTokensFile || '').trim();
  const fileTokens = accessTokensFile ? parseAccessTokens(readTextIfExists(accessTokensFile)) : [];
  const ordered = [...directTokens, ...fileTokens];
  return ordered.filter((token, index) => ordered.indexOf(token) === index);
}

export function createAccessController({
  config,
  parseRequestBody,
  readTextIfExists = () => '',
  sendJson,
}: {
  config: AccessConfig;
  parseRequestBody: (req: unknown) => Promise<Record<string, unknown>>;
  readTextIfExists?: (filePath: string) => string;
  sendJson: JsonSender;
}) {
  const accessMode = normalizeAccessMode(config?.accessMode as string);
  const configuredTokens = loadConfiguredAccessTokens(config, readTextIfExists);
  if (accessMode === 'token' && !configuredTokens.length) {
    throw new Error('Token access mode requires COMMANDCENTER_ACCESS_TOKENS or COMMANDCENTER_ACCESS_TOKENS_FILE');
  }

  const cookieName = String(config?.accessCookieName || DEFAULT_ACCESS_COOKIE_NAME).trim() || DEFAULT_ACCESS_COOKIE_NAME;
  const sessionTtlMs = Math.max(60_000, Number(config?.accessSessionTtlMs) || DEFAULT_ACCESS_SESSION_TTL_MS);
  const sessions = new Map<string, AccessSessionRecord>();
  const accessConfigFile = String(config?.accessConfigFile || '').trim();
  const accessTokensFile = String(config?.accessTokensFile || '').trim();

  function pruneExpiredSessions(now = Date.now()) {
    for (const [sessionId, record] of sessions.entries()) {
      if (!record || record.expiresAt <= now) {
        sessions.delete(sessionId);
      }
    }
  }

  function buildCookie(req: RequestLike, sessionId: string, maxAgeSeconds: number) {
    return serializeCookie(cookieName, sessionId, {
      maxAge: maxAgeSeconds,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureRequest(req),
    });
  }

  function readSession(req: RequestLike) {
    pruneExpiredSessions();
    const sessionId = readCookieValue(req?.headers?.cookie || '', cookieName);
    if (!sessionId) {
      return null;
    }

    const record = sessions.get(sessionId);
    if (!record) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      return null;
    }

    return {
      id: sessionId,
      ...record,
    };
  }

  function isAuthenticated(req: RequestLike) {
    if (accessMode !== 'token') {
      return true;
    }

    return Boolean(readSession(req));
  }

  function sendUnauthorized(res: unknown) {
    sendJson(res, 401, {
      ok: false,
      error: 'Unauthorized',
      code: 'ACCESS_TOKEN_REQUIRED',
    });
  }

  function sendForbidden(res: unknown) {
    sendJson(res, 403, {
      ok: false,
      error: 'Forbidden',
      code: 'ACCESS_ORIGIN_FORBIDDEN',
    });
  }

  function requireAccess(req: RequestLike, res: unknown) {
    if (accessMode !== 'token') {
      return true;
    }

    if (!isAuthenticated(req)) {
      sendUnauthorized(res);
      return false;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && !isTrustedOrigin(req)) {
      sendForbidden(res);
      return false;
    }

    return true;
  }

  function handleUpgrade(req: RequestLike, socket: UpgradeSocketLike) {
    if (accessMode !== 'token') {
      return true;
    }

    if (!isAuthenticated(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return false;
    }

    if (!isTrustedOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return false;
    }

    return true;
  }

  function getState(req: RequestLike) {
    return {
      ok: true,
      accessMode,
      authenticated: isAuthenticated(req),
      hints: {
        ...(accessConfigFile ? { configFile: accessConfigFile } : {}),
        ...(accessTokensFile ? { tokensFile: accessTokensFile } : {}),
      },
    };
  }

  async function handleState(req: RequestLike, res: unknown) {
    sendJson(res, 200, getState(req));
  }

  async function handleToken(req: RequestLike, res: ResponseLike) {
    if (!isTrustedOrigin(req)) {
      sendForbidden(res);
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const token = String(body?.token || '').trim();
      if (!token || !configuredTokens.some((expectedToken) => constantTimeMatch(token, expectedToken))) {
        sendJson(res, 401, {
          ok: false,
          error: 'Invalid access token',
          code: 'ACCESS_TOKEN_INVALID',
        });
        return;
      }

      pruneExpiredSessions();
      const sessionId = crypto.randomBytes(24).toString('base64url');
      const now = Date.now();
      sessions.set(sessionId, {
        createdAt: now,
        expiresAt: now + sessionTtlMs,
      });
      res.setHeader('Set-Cookie', buildCookie(req, sessionId, Math.floor(sessionTtlMs / 1000)));
      sendJson(res, 200, {
        ok: true,
        accessMode,
        authenticated: true,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: (error as { message?: string } | null)?.message || 'Invalid token request',
      });
    }
  }

  async function handleLogout(req: RequestLike, res: ResponseLike) {
    const session = readSession(req);
    if (session?.id) {
      sessions.delete(session.id);
    }
    res.setHeader('Set-Cookie', buildCookie(req, '', 0));
    sendJson(res, 200, {
      ok: true,
      accessMode,
      authenticated: false,
    });
  }

  return {
    accessMode,
    getState,
    handleLogout,
    handleState,
    handleToken,
    handleUpgrade,
    isAuthenticated,
    requireAccess,
  };
}
