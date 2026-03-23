"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRemoteOpenClawTarget = isRemoteOpenClawTarget;
exports.createOpenClawOperationHistory = createOpenClawOperationHistory;
exports.createRemoteMutationError = createRemoteMutationError;
exports.createRemoteAuthorizationRequiredError = createRemoteAuthorizationRequiredError;
exports.createOpenClawBackupStore = createOpenClawBackupStore;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const SNAPSHOT_DIRECTORY_NAME = 'openclaw-backup-snapshots';
function applyPrivateFileMode(filePath = '') {
    try {
        if (filePath) {
            node_fs_1.default.chmodSync(filePath, 0o600);
        }
    }
    catch { }
}
function isLoopbackHostname(hostname = '') {
    const normalized = String(hostname || '').trim().toLowerCase();
    return normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '::1'
        || normalized === '[::1]';
}
function isRemoteOpenClawTarget(config = {}) {
    if (config?.mode !== 'openclaw' || !config?.baseUrl) {
        return false;
    }
    if (config?.localDetected) {
        return false;
    }
    try {
        const parsed = new URL(String(config.baseUrl));
        return !isLoopbackHostname(parsed.hostname);
    }
    catch {
        return true;
    }
}
function clipOperationValue(value = '', maxLength = 1_000) {
    const normalized = String(value || '');
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}
function ensureStorageDirectory(storageFile = '') {
    const normalized = String(storageFile || '').trim();
    if (!normalized) {
        return;
    }
    try {
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(normalized), { recursive: true });
    }
    catch { }
}
function loadStoredEntries(storageFile = '') {
    const normalized = String(storageFile || '').trim();
    if (!normalized) {
        return [];
    }
    try {
        if (!node_fs_1.default.existsSync(normalized)) {
            return [];
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(normalized, 'utf8'));
        return Array.isArray(payload) ? payload : [];
    }
    catch {
        return [];
    }
}
function persistStoredEntries(storageFile = '', entries = []) {
    const normalized = String(storageFile || '').trim();
    if (!normalized) {
        return;
    }
    try {
        ensureStorageDirectory(normalized);
        const tempFile = `${normalized}.tmp`;
        node_fs_1.default.writeFileSync(tempFile, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        applyPrivateFileMode(tempFile);
        node_fs_1.default.renameSync(tempFile, normalized);
        applyPrivateFileMode(normalized);
    }
    catch { }
}
function deriveLocalConfigPathFromBackupPath(backupPath = '') {
    const normalized = String(backupPath || '').trim();
    if (!normalized) {
        return '';
    }
    return normalized.replace(/\.backup\.[^.]+$/, '');
}
function normalizeTargetKey(value = '') {
    return String(value || '').trim();
}
function buildBackupSnapshotPath(storageFile = '', backupId = '') {
    const normalizedStorageFile = String(storageFile || '').trim();
    const normalizedBackupId = String(backupId || '').trim();
    if (!normalizedStorageFile || !normalizedBackupId) {
        return '';
    }
    return node_path_1.default.join(node_path_1.default.dirname(normalizedStorageFile), SNAPSHOT_DIRECTORY_NAME, `${normalizedBackupId}.json`);
}
function persistBackupSnapshot(storageFile = '', backupId = '', raw = '') {
    const snapshotPath = buildBackupSnapshotPath(storageFile, backupId);
    if (!snapshotPath) {
        return '';
    }
    try {
        ensureStorageDirectory(snapshotPath);
        const tempFile = `${snapshotPath}.tmp`;
        node_fs_1.default.writeFileSync(tempFile, String(raw || ''), { encoding: 'utf8', mode: 0o600 });
        applyPrivateFileMode(tempFile);
        node_fs_1.default.renameSync(tempFile, snapshotPath);
        applyPrivateFileMode(snapshotPath);
        return snapshotPath;
    }
    catch {
        return '';
    }
}
function loadBackupSnapshot(snapshotPath = '') {
    const normalized = String(snapshotPath || '').trim();
    if (!normalized) {
        return '';
    }
    try {
        if (!node_fs_1.default.existsSync(normalized)) {
            return '';
        }
        return node_fs_1.default.readFileSync(normalized, 'utf8');
    }
    catch {
        return '';
    }
}
function createOpenClawOperationHistory({ limit = 50, now = () => Date.now(), storageFile = '', } = {}) {
    const entries = loadStoredEntries(storageFile)
        .slice(0, limit)
        .map((entry = {}) => ({
        id: String(entry?.id || '').trim(),
        scope: String(entry?.scope || 'unknown').trim() || 'unknown',
        action: String(entry?.action || 'unknown').trim() || 'unknown',
        target: String(entry?.target || 'local').trim() || 'local',
        ok: Boolean(entry?.ok),
        outcome: String(entry?.outcome || (entry?.ok ? 'success' : 'error')).trim() || 'error',
        blocked: Boolean(entry?.blocked),
        startedAt: Number(entry?.startedAt || 0),
        finishedAt: Number(entry?.finishedAt || 0),
        errorCode: String(entry?.errorCode || '').trim(),
        error: clipOperationValue(entry?.error || ''),
        summary: clipOperationValue(entry?.summary || ''),
        backupPath: String(entry?.backupPath || '').trim(),
        backupId: String(entry?.backupId || '').trim(),
        backupLabel: String(entry?.backupLabel || '').trim(),
        rolledBack: Boolean(entry?.rolledBack),
        targetKey: normalizeTargetKey(entry?.targetKey || ''),
    }));
    function record(entry = {}) {
        const startedAt = Number(entry?.startedAt || now());
        const finishedAt = Number(entry?.finishedAt || startedAt);
        const nextEntry = {
            id: `${finishedAt}-${entries.length + 1}`,
            scope: String(entry?.scope || 'unknown').trim() || 'unknown',
            action: String(entry?.action || 'unknown').trim() || 'unknown',
            target: String(entry?.target || 'local').trim() || 'local',
            ok: Boolean(entry?.ok),
            outcome: String(entry?.outcome || (entry?.ok ? 'success' : 'error')).trim() || 'error',
            blocked: Boolean(entry?.blocked),
            startedAt,
            finishedAt,
            errorCode: String(entry?.errorCode || '').trim(),
            error: clipOperationValue(entry?.error || ''),
            summary: clipOperationValue(entry?.summary || ''),
            backupPath: String(entry?.backupPath || '').trim(),
            backupId: String(entry?.backupId || '').trim(),
            backupLabel: String(entry?.backupLabel || '').trim(),
            rolledBack: Boolean(entry?.rolledBack),
            targetKey: normalizeTargetKey(entry?.targetKey || ''),
        };
        entries.unshift(nextEntry);
        if (entries.length > limit) {
            entries.length = limit;
        }
        persistStoredEntries(storageFile, entries);
        return nextEntry;
    }
    function list({ max = limit } = {}) {
        const safeMax = Math.max(1, Math.min(limit, Number(max) || limit));
        return entries.slice(0, safeMax).map((entry) => ({ ...entry }));
    }
    function getSummary() {
        const lastEntry = entries[0] || null;
        return {
            count: entries.length,
            lastEntry: lastEntry ? { ...lastEntry } : null,
        };
    }
    return {
        record,
        list,
        getSummary,
    };
}
function createRemoteMutationError(action = '') {
    const normalizedAction = String(action || '').trim() || 'mutation';
    const error = new Error(`Remote OpenClaw ${normalizedAction} is currently blocked. Use a local gateway or wait for the remote-operations flow.`);
    error.statusCode = 403;
    error.errorCode = 'remote_openclaw_mutation_blocked';
    return error;
}
function createRemoteAuthorizationRequiredError(action = '') {
    const normalizedAction = String(action || '').trim() || 'mutation';
    const error = new Error(`Remote OpenClaw ${normalizedAction} requires explicit authorization before it can run.`);
    error.statusCode = 403;
    error.errorCode = 'remote_openclaw_authorization_required';
    return error;
}
function createOpenClawBackupStore({ limit = 20, now = () => Date.now(), storageFile = '', } = {}) {
    const entries = loadStoredEntries(storageFile)
        .slice(0, limit)
        .map((entry = {}) => ({
        id: String(entry?.id || '').trim(),
        scope: String(entry?.scope || 'unknown').trim() || 'unknown',
        target: String(entry?.target || 'local').trim() || 'local',
        createdAt: Number(entry?.createdAt || 0),
        label: String(entry?.label || entry?.id || '').trim() || String(entry?.id || '').trim(),
        summary: clipOperationValue(entry?.summary || ''),
        hash: String(entry?.hash || '').trim(),
        raw: String(entry?.raw || ''),
        backupPath: String(entry?.backupPath || '').trim(),
        targetKey: normalizeTargetKey(entry?.targetKey
            || (String(entry?.target || '').trim() === 'local' ? deriveLocalConfigPathFromBackupPath(entry?.backupPath || '') : '')),
        snapshotPath: String(entry?.snapshotPath || '').trim(),
    }));
    function save(entry = {}) {
        const createdAt = Number(entry?.createdAt || now());
        const id = String(entry?.id || `backup-${createdAt}-${entries.length + 1}`);
        const raw = String(entry?.raw || '');
        const snapshotPath = raw ? persistBackupSnapshot(storageFile, id, raw) : '';
        const nextEntry = {
            id,
            scope: String(entry?.scope || 'unknown').trim() || 'unknown',
            target: String(entry?.target || 'local').trim() || 'local',
            createdAt,
            label: String(entry?.label || id).trim() || id,
            summary: clipOperationValue(entry?.summary || ''),
            hash: String(entry?.hash || '').trim(),
            backupPath: String(entry?.backupPath || '').trim(),
            targetKey: normalizeTargetKey(entry?.targetKey || ''),
            snapshotPath,
            ...(!snapshotPath && raw ? { raw } : {}),
        };
        entries.unshift(nextEntry);
        if (entries.length > limit) {
            entries.length = limit;
        }
        persistStoredEntries(storageFile, entries);
        return { ...nextEntry };
    }
    function get(id = '') {
        const normalizedId = String(id || '').trim();
        if (!normalizedId) {
            return null;
        }
        const match = entries.find((entry) => entry.id === normalizedId);
        if (!match) {
            return null;
        }
        const raw = match.snapshotPath ? loadBackupSnapshot(match.snapshotPath) : String(match.raw || '');
        return { ...match, raw };
    }
    return {
        save,
        get,
    };
}
