import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createOpenClawBackupStore,
  createOpenClawOperationHistory,
  createRemoteAuthorizationRequiredError,
  createRemoteMutationError,
  isRemoteOpenClawTarget,
} from './openclaw-operations.ts';

describe('isRemoteOpenClawTarget', () => {
  it('treats loopback gateways as local when auto-detected', () => {
    expect(isRemoteOpenClawTarget({
      mode: 'openclaw',
      baseUrl: 'http://127.0.0.1:18789',
      localDetected: true,
    })).toBe(false);
  });

  it('treats non-loopback gateways as remote when local detection is absent', () => {
    expect(isRemoteOpenClawTarget({
      mode: 'openclaw',
      baseUrl: 'https://gateway.example.com',
      localDetected: false,
    })).toBe(true);
  });
});

describe('createOpenClawOperationHistory', () => {
  it('records recent operations and returns a summary', () => {
    const history = createOpenClawOperationHistory({
      now: () => 1773912000000,
    });

    history.record({
      scope: 'config',
      action: 'apply',
      target: 'remote',
      blocked: true,
      ok: false,
      outcome: 'blocked',
      summary: 'Blocked because the target is remote.',
    });

    expect(history.list()).toHaveLength(1);
    expect(history.getSummary()).toMatchObject({
      count: 1,
      lastEntry: {
        scope: 'config',
        action: 'apply',
        target: 'remote',
        blocked: true,
        outcome: 'blocked',
      },
    });
  });

  it('persists operation history entries to disk', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-openclaw-history-'));
    const storageFile = path.join(tempDir, 'openclaw-operation-history.json');
    const history = createOpenClawOperationHistory({
      now: () => 1773912000000,
      storageFile,
    });

    history.record({
      scope: 'config',
      action: 'apply',
      target: 'local',
      ok: true,
      outcome: 'success',
      backupPath: '/Users/example/.openclaw/openclaw.json.backup.20260319T101112Z',
      backupId: 'backup-local-1',
      backupLabel: 'local-config-backup-1',
      summary: 'Stored local rollback point local-config-backup-1.',
    });

    const reloadedHistory = createOpenClawOperationHistory({ storageFile });
    expect(reloadedHistory.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'config',
        action: 'apply',
        target: 'local',
        backupId: 'backup-local-1',
        backupLabel: 'local-config-backup-1',
      }),
    ]));
  });
});

describe('createRemoteMutationError', () => {
  it('marks remote write attempts with a stable status code and error code', () => {
    const error = createRemoteMutationError('install');

    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe('remote_openclaw_mutation_blocked');
    expect(error.message).toMatch(/remote/i);
  });
});

describe('createRemoteAuthorizationRequiredError', () => {
  it('marks remote write attempts that need explicit authorization', () => {
    const error = createRemoteAuthorizationRequiredError('config.apply');

    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe('remote_openclaw_authorization_required');
    expect(error.message).toMatch(/authorization/i);
  });
});

describe('createOpenClawBackupStore', () => {
  it('stores remote rollback points with stable ids', () => {
    const store = createOpenClawBackupStore({
      now: () => 1773912000000,
    });

    const saved = store.save({
      scope: 'config',
      target: 'remote',
      targetKey: 'remote:https://gateway.example.test',
      label: 'remote-config-2026-03-19T10:00:00Z',
      summary: 'Saved before remote config.patch',
      hash: 'hash-1',
      raw: '{"gateway":{"bind":"loopback"}}',
    });

    expect(saved).toMatchObject({
      id: expect.any(String),
      target: 'remote',
      targetKey: 'remote:https://gateway.example.test',
      hash: 'hash-1',
      label: 'remote-config-2026-03-19T10:00:00Z',
    });
    expect(store.get(saved.id)).toMatchObject({
      id: saved.id,
      raw: '{"gateway":{"bind":"loopback"}}',
    });
  });

  it('persists both local and remote rollback material to disk', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lalaclaw-openclaw-backups-'));
    const storageFile = path.join(tempDir, 'openclaw-backups.json');
    const store = createOpenClawBackupStore({
      storageFile,
      now: () => 1773912000000,
    });

    const localSaved = store.save({
      scope: 'config',
      target: 'local',
      targetKey: 'local:/Users/example/.openclaw/openclaw.json',
      label: 'local-config-2026-03-19T10:00:00Z',
      summary: 'Saved before local config.apply',
      hash: 'hash-local-1',
      backupPath: '/Users/example/.openclaw/openclaw.json.backup.20260319T100000Z',
    });

    const persistedPayload = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
    expect(persistedPayload[0]).toMatchObject({
      id: localSaved.id,
      target: 'local',
      targetKey: 'local:/Users/example/.openclaw/openclaw.json',
      backupPath: '/Users/example/.openclaw/openclaw.json.backup.20260319T100000Z',
    });
    expect(persistedPayload[0].raw).toBeUndefined();

    const reloadedStore = createOpenClawBackupStore({ storageFile });
    expect(reloadedStore.get(localSaved.id)).toMatchObject({
      id: localSaved.id,
      target: 'local',
      targetKey: 'local:/Users/example/.openclaw/openclaw.json',
      backupPath: '/Users/example/.openclaw/openclaw.json.backup.20260319T100000Z',
      raw: '',
    });
  });
});
