import { describe, expect, it } from 'vitest';
import { createOpenClawFacade } from './openclaw-facade.ts';

describe('createOpenClawFacade', () => {
  it('blocks remote management mutations and records a blocked history entry', async () => {
    const recordedEntries = [];
    const facade = createOpenClawFacade({
      config: {
        remoteOpenClawTarget: true,
      },
      openClawOperationHistory: {
        record(entry) {
          recordedEntries.push(entry);
          return entry;
        },
        list() {
          return recordedEntries.slice();
        },
      },
      getOpenClawConfigState: async () => ({ ok: true }),
      applyLocalOpenClawConfigPatch: async () => ({ ok: true }),
      restoreLocalOpenClawConfigBackup: async () => ({ ok: true }),
      getOpenClawUpdateState: async () => ({ ok: true }),
      runLocalOpenClawAction: async () => ({ ok: true }),
      runLocalOpenClawInstall: async () => ({ ok: true }),
      runLocalOpenClawUpdate: async () => ({ ok: true }),
    });

    await expect(facade.runOpenClawAction('restart')).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'remote_openclaw_mutation_blocked',
    });

    expect(recordedEntries).toEqual([
      expect.objectContaining({
        target: 'remote',
        scope: 'management',
        action: 'restart',
        blocked: true,
        outcome: 'blocked',
      }),
    ]);
  });

  it('requires explicit authorization for remote config changes and records the block', async () => {
    const recordedEntries = [];
    const facade = createOpenClawFacade({
      config: {
        remoteOpenClawTarget: true,
      },
      openClawOperationHistory: {
        record(entry) {
          recordedEntries.push(entry);
          return entry;
        },
        list() {
          return recordedEntries.slice();
        },
      },
      getOpenClawConfigState: async () => ({ ok: true }),
      applyLocalOpenClawConfigPatch: async () => ({ ok: true }),
      restoreLocalOpenClawConfigBackup: async () => ({ ok: true }),
      getOpenClawUpdateState: async () => ({ ok: true }),
      runLocalOpenClawAction: async () => ({ ok: true }),
      runLocalOpenClawInstall: async () => ({ ok: true }),
      runLocalOpenClawUpdate: async () => ({ ok: true }),
    });

    await expect(facade.applyOpenClawConfigPatch({
      values: { modelPrimary: 'openai/gpt-5.4' },
    })).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'remote_openclaw_authorization_required',
    });

    expect(recordedEntries).toEqual([
      expect.objectContaining({
        target: 'remote',
        scope: 'config',
        action: 'apply',
        blocked: true,
        outcome: 'blocked',
      }),
    ]);
  });

  it('records successful authorized remote rollback entries with rollback metadata', async () => {
    const recordedEntries = [];
    const facade = createOpenClawFacade({
      config: {
        remoteOpenClawTarget: true,
      },
      openClawOperationHistory: {
        record(entry) {
          recordedEntries.push(entry);
          return entry;
        },
        list() {
          return recordedEntries.slice();
        },
      },
      getOpenClawConfigState: async () => ({ ok: true }),
      applyLocalOpenClawConfigPatch: async () => ({ ok: true }),
      restoreLocalOpenClawConfigBackup: async () => ({
        ok: true,
        backupPath: '',
        backupReference: {
          id: 'backup-1',
          label: 'remote-config-backup-1',
          targetKey: 'remote:https://gateway.example.test',
        },
      }),
      getOpenClawUpdateState: async () => ({ ok: true }),
      runLocalOpenClawAction: async () => ({ ok: true }),
      runLocalOpenClawInstall: async () => ({ ok: true }),
      runLocalOpenClawUpdate: async () => ({ ok: true }),
      now: () => 1773912000000,
    });

    const result = await facade.restoreRemoteOpenClawConfigBackup({
      backupId: 'backup-1',
      remoteAuthorization: {
        confirmed: true,
        note: 'Restore remote config',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      backupReference: {
        id: 'backup-1',
        label: 'remote-config-backup-1',
      },
    });
    expect(recordedEntries).toEqual([
      expect.objectContaining({
        target: 'remote',
        scope: 'config',
        action: 'rollback',
        outcome: 'success',
        backupId: 'backup-1',
        backupLabel: 'remote-config-backup-1',
        rolledBack: true,
        targetKey: 'remote:https://gateway.example.test',
      }),
    ]);
  });

  it('reports persisted history together with the remote target flag', async () => {
    const facade = createOpenClawFacade({
      config: {
        remoteOpenClawTarget: false,
      },
      openClawOperationHistory: {
        record(entry) {
          return entry;
        },
        list() {
          return [
            {
              id: '1',
              scope: 'update',
              action: 'install',
              target: 'local',
            },
          ];
        },
      },
      getOpenClawConfigState: async () => ({ ok: true }),
      applyLocalOpenClawConfigPatch: async () => ({ ok: true }),
      restoreLocalOpenClawConfigBackup: async () => ({ ok: true }),
      getOpenClawUpdateState: async () => ({ ok: true }),
      runLocalOpenClawAction: async () => ({ ok: true }),
      runLocalOpenClawInstall: async () => ({ ok: true }),
      runLocalOpenClawUpdate: async () => ({ ok: true }),
    });

    expect(facade.listOpenClawOperationHistory()).toMatchObject({
      ok: true,
      remoteTarget: false,
      entries: [
        expect.objectContaining({
          scope: 'update',
          action: 'install',
          target: 'local',
        }),
      ],
    });
  });
});
