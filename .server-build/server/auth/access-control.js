"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ACCESS_SESSION_TTL_MS = exports.DEFAULT_ACCESS_COOKIE_NAME = void 0;
exports.normalizeAccessMode = normalizeAccessMode;
exports.parseAccessTokens = parseAccessTokens;
exports.readCookieValue = readCookieValue;
exports.serializeCookie = serializeCookie;
exports.isTrustedOrigin = isTrustedOrigin;
exports.loadConfiguredAccessTokens = loadConfiguredAccessTokens;
exports.createAccessController = createAccessController;
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.DEFAULT_ACCESS_COOKIE_NAME = 'lalaclaw_access';
exports.DEFAULT_ACCESS_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
function normalizeAccessMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'token') {
        return 'token';
    }
    return 'off';
}
function parseAccessTokens(value = '') {
    return String(value || '')
        .split(/[\r\n,]+/u)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
}
function readCookieValue(cookieHeader = '', key = '') {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
        return '';
    }
    return (String(cookieHeader || '')
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
        .find(([name]) => name === normalizedKey)?.[1] || '');
}
function serializeCookie(name, value, options = {}) {
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
function isSecureRequest(req) {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').trim().toLowerCase();
    return forwardedProto === 'https' || Boolean(req?.socket?.encrypted);
}
function isTrustedOrigin(req) {
    const originHeader = String(req?.headers?.origin || '').trim();
    if (!originHeader) {
        return true;
    }
    try {
        const origin = new URL(originHeader);
        const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim();
        const hostHeader = forwardedHost || String(req?.headers?.host || '').trim();
        return Boolean(hostHeader) && origin.host === hostHeader;
    }
    catch {
        return false;
    }
}
function constantTimeMatch(candidate = '', expected = '') {
    const left = Buffer.from(String(candidate || ''));
    const right = Buffer.from(String(expected || ''));
    if (!left.length || left.length !== right.length) {
        return false;
    }
    return node_crypto_1.default.timingSafeEqual(left, right);
}
function loadConfiguredAccessTokens(config = {}, readTextIfExists = () => '') {
    const directTokens = parseAccessTokens(config.accessTokensRaw);
    const accessTokensFile = String(config.accessTokensFile || '').trim();
    const fileTokens = accessTokensFile ? parseAccessTokens(readTextIfExists(accessTokensFile)) : [];
    const ordered = [...directTokens, ...fileTokens];
    return ordered.filter((token, index) => ordered.indexOf(token) === index);
}
function createAccessController({ config, parseRequestBody, readTextIfExists = () => '', sendJson, }) {
    const accessMode = normalizeAccessMode(config?.accessMode);
    const configuredTokens = loadConfiguredAccessTokens(config, readTextIfExists);
    if (accessMode === 'token' && !configuredTokens.length) {
        throw new Error('Token access mode requires COMMANDCENTER_ACCESS_TOKENS or COMMANDCENTER_ACCESS_TOKENS_FILE');
    }
    const cookieName = String(config?.accessCookieName || exports.DEFAULT_ACCESS_COOKIE_NAME).trim() || exports.DEFAULT_ACCESS_COOKIE_NAME;
    const sessionTtlMs = Math.max(60_000, Number(config?.accessSessionTtlMs) || exports.DEFAULT_ACCESS_SESSION_TTL_MS);
    const sessions = new Map();
    const accessConfigFile = String(config?.accessConfigFile || '').trim();
    const accessTokensFile = String(config?.accessTokensFile || '').trim();
    function pruneExpiredSessions(now = Date.now()) {
        for (const [sessionId, record] of sessions.entries()) {
            if (!record || record.expiresAt <= now) {
                sessions.delete(sessionId);
            }
        }
    }
    function buildCookie(req, sessionId, maxAgeSeconds) {
        return serializeCookie(cookieName, sessionId, {
            maxAge: maxAgeSeconds,
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
            secure: isSecureRequest(req),
        });
    }
    function readSession(req) {
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
    function isAuthenticated(req) {
        if (accessMode !== 'token') {
            return true;
        }
        return Boolean(readSession(req));
    }
    function sendUnauthorized(res) {
        sendJson(res, 401, {
            ok: false,
            error: 'Unauthorized',
            code: 'ACCESS_TOKEN_REQUIRED',
        });
    }
    function sendForbidden(res) {
        sendJson(res, 403, {
            ok: false,
            error: 'Forbidden',
            code: 'ACCESS_ORIGIN_FORBIDDEN',
        });
    }
    function requireAccess(req, res) {
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
    function handleUpgrade(req, socket) {
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
    function getState(req) {
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
    async function handleState(req, res) {
        sendJson(res, 200, getState(req));
    }
    async function handleToken(req, res) {
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
            const sessionId = node_crypto_1.default.randomBytes(24).toString('base64url');
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
        }
        catch (error) {
            sendJson(res, 400, {
                ok: false,
                error: error?.message || 'Invalid token request',
            });
        }
    }
    async function handleLogout(req, res) {
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
