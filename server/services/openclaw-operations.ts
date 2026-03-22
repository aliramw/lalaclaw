import fs from 'node:fs';
import path from 'node:path';

const SNAPSHOT_DIRECTORY_NAME = 'openclaw-backup-snapshots';

type OpenClawConfig = {
  mode?: string;
  baseUrl?: string;
  localDetected?: boolean;
};

type OpenClawOperationEntry = {
  id?: string;
  scope?: string;
  action?: string;
  target?: string;
  ok?: boolean;
  outcome?: string;
  blocked?: boolean;
  startedAt?: number;
  finishedAt?: number;
  errorCode?: string;
  error?: string;
  summary?: string;
  backupPath?: string;
  backupId?: string;
  backupLabel?: string;
  rolledBack?: boolean;
  targetKey?: string;
};

type OpenClawBackupEntry = {
  id?: string;
  scope?: string;
  target?: string;
  createdAt?: number;
  label?: string;
  summary?: string;
  hash?: string;
  raw?: string;
  backupPath?: string;
  targetKey?: string;
  snapshotPath?: string;
};

type OpenClawOperationHistoryOptions = {
  limit?: number;
  now?: () => number;
  storageFile?: string;
};

type OpenClawBackupStoreOptions = {
  limit?: number;
  now?: () => number;
  storageFile?: string;
};

type OpenClawServiceError = Error & {
  statusCode?: number;
  errorCode?: string;
};

type StoredOperationEntry = {
  id: string;
  scope: string;
  action: string;
  target: string;
  ok: boolean;
  outcome: string;
  blocked: boolean;
  startedAt: number;
  finishedAt: number;
  errorCode: string;
  error: string;
  summary: string;
  backupPath: string;
  backupId: string;
  backupLabel: string;
  rolledBack: boolean;
  targetKey: string;
};

type StoredBackupEntry = {
  id: string;
  scope: string;
  target: string;
  createdAt: number;
  label: string;
  summary: string;
  hash: string;
  backupPath: string;
  targetKey: string;
  snapshotPath: string;
  raw?: string;
};

function applyPrivateFileMode(filePath = '') {
  try {
    if (filePath) {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {}
}

function isLoopbackHostname(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]';
}

export function isRemoteOpenClawTarget(config: OpenClawConfig = {}) {
  if (config?.mode !== 'openclaw' || !config?.baseUrl) {
    return false;
  }

  if (config?.localDetected) {
    return false;
  }

  try {
    const parsed = new URL(String(config.baseUrl));
    return !isLoopbackHostname(parsed.hostname);
  } catch {
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
    fs.mkdirSync(path.dirname(normalized), { recursive: true });
  } catch {}
}

function loadStoredEntries(storageFile = '') {
  const normalized = String(storageFile || '').trim();
  if (!normalized) {
    return [];
  }

  try {
    if (!fs.existsSync(normalized)) {
      return [];
    }
    const payload = JSON.parse(fs.readFileSync(normalized, 'utf8'));
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function persistStoredEntries(storageFile = '', entries: unknown[] = []) {
  const normalized = String(storageFile || '').trim();
  if (!normalized) {
    return;
  }

  try {
    ensureStorageDirectory(normalized);
    const tempFile = `${normalized}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    applyPrivateFileMode(tempFile);
    fs.renameSync(tempFile, normalized);
    applyPrivateFileMode(normalized);
  } catch {}
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

  return path.join(path.dirname(normalizedStorageFile), SNAPSHOT_DIRECTORY_NAME, `${normalizedBackupId}.json`);
}

function persistBackupSnapshot(storageFile = '', backupId = '', raw = '') {
  const snapshotPath = buildBackupSnapshotPath(storageFile, backupId);
  if (!snapshotPath) {
    return '';
  }

  try {
    ensureStorageDirectory(snapshotPath);
    const tempFile = `${snapshotPath}.tmp`;
    fs.writeFileSync(tempFile, String(raw || ''), { encoding: 'utf8', mode: 0o600 });
    applyPrivateFileMode(tempFile);
    fs.renameSync(tempFile, snapshotPath);
    applyPrivateFileMode(snapshotPath);
    return snapshotPath;
  } catch {
    return '';
  }
}

function loadBackupSnapshot(snapshotPath = '') {
  const normalized = String(snapshotPath || '').trim();
  if (!normalized) {
    return '';
  }

  try {
    if (!fs.existsSync(normalized)) {
      return '';
    }
    return fs.readFileSync(normalized, 'utf8');
  } catch {
    return '';
  }
}

export function createOpenClawOperationHistory({
  limit = 50,
  now = () => Date.now(),
  storageFile = '',
}: OpenClawOperationHistoryOptions = {}) {
  const entries: StoredOperationEntry[] = loadStoredEntries(storageFile)
    .slice(0, limit)
    .map((entry: OpenClawOperationEntry = {}) => ({
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

  function record(entry: OpenClawOperationEntry = {}) {
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

export function createRemoteMutationError(action = '') {
  const normalizedAction = String(action || '').trim() || 'mutation';
  const error = new Error(`Remote OpenClaw ${normalizedAction} is currently blocked. Use a local gateway or wait for the remote-operations flow.`) as OpenClawServiceError;
  error.statusCode = 403;
  error.errorCode = 'remote_openclaw_mutation_blocked';
  return error;
}

export function createRemoteAuthorizationRequiredError(action = '') {
  const normalizedAction = String(action || '').trim() || 'mutation';
  const error = new Error(`Remote OpenClaw ${normalizedAction} requires explicit authorization before it can run.`) as OpenClawServiceError;
  error.statusCode = 403;
  error.errorCode = 'remote_openclaw_authorization_required';
  return error;
}

export function createOpenClawBackupStore({
  limit = 20,
  now = () => Date.now(),
  storageFile = '',
}: OpenClawBackupStoreOptions = {}) {
  const entries: StoredBackupEntry[] = loadStoredEntries(storageFile)
    .slice(0, limit)
    .map((entry: OpenClawBackupEntry = {}) => ({
      id: String(entry?.id || '').trim(),
      scope: String(entry?.scope || 'unknown').trim() || 'unknown',
      target: String(entry?.target || 'local').trim() || 'local',
      createdAt: Number(entry?.createdAt || 0),
      label: String(entry?.label || entry?.id || '').trim() || String(entry?.id || '').trim(),
      summary: clipOperationValue(entry?.summary || ''),
      hash: String(entry?.hash || '').trim(),
      raw: String(entry?.raw || ''),
      backupPath: String(entry?.backupPath || '').trim(),
      targetKey: normalizeTargetKey(
        entry?.targetKey
          || (String(entry?.target || '').trim() === 'local' ? deriveLocalConfigPathFromBackupPath(entry?.backupPath || '') : ''),
      ),
      snapshotPath: String(entry?.snapshotPath || '').trim(),
    }));

  function save(entry: OpenClawBackupEntry = {}) {
    const createdAt = Number(entry?.createdAt || now());
    const id = String(entry?.id || `backup-${createdAt}-${entries.length + 1}`);
    const raw = String(entry?.raw || '');
    const snapshotPath = raw ? persistBackupSnapshot(storageFile, id, raw) : '';
    const nextEntry: StoredBackupEntry = {
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
