"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenClawFacade = createOpenClawFacade;
const openclaw_operations_1 = require("./openclaw-operations");
function createOpenClawFacade({ config, openClawOperationHistory, getOpenClawConfigState, applyLocalOpenClawConfigPatch, restoreLocalOpenClawConfigBackup, getOpenClawOnboardingState, getOpenClawUpdateState, runLocalOpenClawOnboarding, runLocalOpenClawAction, runLocalOpenClawInstall, runLocalOpenClawUpdate, now = () => Date.now(), }) {
    if (!config || typeof config !== 'object') {
        throw new Error('config is required');
    }
    if (!openClawOperationHistory || typeof openClawOperationHistory.record !== 'function' || typeof openClawOperationHistory.list !== 'function') {
        throw new Error('openClawOperationHistory is required');
    }
    function recordOpenClawOperation(entry = {}) {
        return openClawOperationHistory.record({
            target: config.remoteOpenClawTarget ? 'remote' : 'local',
            ...entry,
        });
    }
    function listOpenClawOperationHistory() {
        return {
            ok: true,
            entries: openClawOperationHistory.list(),
            remoteTarget: Boolean(config.remoteOpenClawTarget),
        };
    }
    function assertRemoteMutationAllowed(scope = '', action = '', options = {}) {
        if (!config.remoteOpenClawTarget) {
            return;
        }
        const allowRemote = Boolean(options?.allowRemote);
        const authorizationConfirmed = Boolean(options?.remoteAuthorization?.confirmed);
        const error = (allowRemote
            ? authorizationConfirmed
                ? null
                : (0, openclaw_operations_1.createRemoteAuthorizationRequiredError)(action || scope)
            : (0, openclaw_operations_1.createRemoteMutationError)(action || scope));
        if (!error) {
            return;
        }
        recordOpenClawOperation({
            scope,
            action,
            blocked: true,
            ok: false,
            outcome: 'blocked',
            errorCode: error.errorCode,
            error: error.message,
            summary: allowRemote
                ? 'Remote OpenClaw mutation requires explicit authorization before it can run.'
                : 'Blocked a local-only OpenClaw mutation because the active gateway target is remote.',
        });
        throw error;
    }
    function requireLocalConfigPatch() {
        if (typeof applyLocalOpenClawConfigPatch !== 'function') {
            throw new Error('applyLocalOpenClawConfigPatch is required');
        }
        return applyLocalOpenClawConfigPatch;
    }
    function requireLocalConfigRollback() {
        if (typeof restoreLocalOpenClawConfigBackup !== 'function') {
            throw new Error('restoreLocalOpenClawConfigBackup is required');
        }
        return restoreLocalOpenClawConfigBackup;
    }
    function requireLocalAction() {
        if (typeof runLocalOpenClawAction !== 'function') {
            throw new Error('runLocalOpenClawAction is required');
        }
        return runLocalOpenClawAction;
    }
    function requireLocalInstall() {
        if (typeof runLocalOpenClawInstall !== 'function') {
            throw new Error('runLocalOpenClawInstall is required');
        }
        return runLocalOpenClawInstall;
    }
    function requireLocalUpdate() {
        if (typeof runLocalOpenClawUpdate !== 'function') {
            throw new Error('runLocalOpenClawUpdate is required');
        }
        return runLocalOpenClawUpdate;
    }
    function requireLocalOnboarding() {
        if (typeof runLocalOpenClawOnboarding !== 'function') {
            throw new Error('runLocalOpenClawOnboarding is required');
        }
        return runLocalOpenClawOnboarding;
    }
    async function runOpenClawAction(action) {
        if (String(action || '').trim() !== 'status') {
            assertRemoteMutationAllowed('management', action);
        }
        else if (config.remoteOpenClawTarget) {
            const error = (0, openclaw_operations_1.createRemoteMutationError)(action);
            recordOpenClawOperation({
                scope: 'management',
                action,
                blocked: true,
                ok: false,
                outcome: 'blocked',
                errorCode: error.errorCode,
                error: error.message,
                summary: 'Blocked local-only OpenClaw management status while connected to a remote gateway target.',
            });
            throw error;
        }
        const startedAt = now();
        try {
            const result = await requireLocalAction()(action);
            recordOpenClawOperation({
                scope: 'management',
                action,
                ok: Boolean(result?.ok),
                outcome: result?.ok ? 'success' : 'warning',
                startedAt,
                finishedAt: now(),
                error: result?.error || '',
                summary: result?.guidance?.[0] || '',
            });
            return result;
        }
        catch (error) {
            const nextError = error;
            recordOpenClawOperation({
                scope: 'management',
                action,
                ok: false,
                outcome: 'error',
                startedAt,
                finishedAt: now(),
                errorCode: nextError?.errorCode || '',
                error: nextError?.message || '',
            });
            throw nextError;
        }
    }
    async function applyOpenClawConfigPatch(options = {}) {
        assertRemoteMutationAllowed('config', 'apply', {
            allowRemote: true,
            remoteAuthorization: options?.remoteAuthorization || null,
        });
        const startedAt = now();
        try {
            const result = await requireLocalConfigPatch()(options);
            recordOpenClawOperation({
                scope: 'config',
                action: options?.restartGateway ? 'apply+restart' : 'apply',
                ok: Boolean(result?.ok),
                outcome: result?.ok ? 'success' : 'warning',
                startedAt,
                finishedAt: now(),
                backupPath: result?.backupPath || '',
                backupId: result?.backupReference?.id || '',
                backupLabel: result?.backupReference?.label || '',
                rolledBack: Boolean(result?.rolledBack),
                errorCode: result?.errorCode || '',
                error: result?.error || '',
                summary: result?.rolledBack
                    ? 'Configuration patch rolled back after validation or health failure.'
                    : (result?.backupReference?.label
                        ? `Stored ${config.remoteOpenClawTarget ? 'remote' : 'local'} rollback point ${result.backupReference.label}.`
                        : ''),
                targetKey: result?.backupReference?.targetKey || '',
            });
            return result;
        }
        catch (error) {
            const nextError = error;
            recordOpenClawOperation({
                scope: 'config',
                action: options?.restartGateway ? 'apply+restart' : 'apply',
                ok: false,
                outcome: 'error',
                startedAt,
                finishedAt: now(),
                errorCode: nextError?.errorCode || '',
                error: nextError?.message || '',
            });
            throw nextError;
        }
    }
    async function restoreRemoteOpenClawConfigBackup(options = {}) {
        assertRemoteMutationAllowed('config', 'rollback', {
            allowRemote: true,
            remoteAuthorization: options?.remoteAuthorization || null,
        });
        const startedAt = now();
        try {
            const result = await requireLocalConfigRollback()(options);
            recordOpenClawOperation({
                scope: 'config',
                action: 'rollback',
                ok: Boolean(result?.ok),
                outcome: result?.ok ? 'success' : 'warning',
                startedAt,
                finishedAt: now(),
                backupId: result?.backupReference?.id || String(options?.backupId || '').trim(),
                backupLabel: result?.backupReference?.label || '',
                rolledBack: true,
                errorCode: result?.errorCode || '',
                error: result?.error || '',
                backupPath: result?.backupPath || '',
                summary: result?.backupReference?.label
                    ? `Restored ${config.remoteOpenClawTarget ? 'remote' : 'local'} rollback point ${result.backupReference.label}.`
                    : `Restored a ${config.remoteOpenClawTarget ? 'remote' : 'local'} OpenClaw config rollback point.`,
                targetKey: result?.backupReference?.targetKey || '',
            });
            return result;
        }
        catch (error) {
            const nextError = error;
            recordOpenClawOperation({
                scope: 'config',
                action: 'rollback',
                ok: false,
                outcome: 'error',
                startedAt,
                finishedAt: now(),
                backupId: String(options?.backupId || '').trim(),
                errorCode: nextError?.errorCode || '',
                error: nextError?.message || '',
            });
            throw nextError;
        }
    }
    async function runOpenClawUpdate(options = {}) {
        assertRemoteMutationAllowed('update', 'update');
        const startedAt = now();
        try {
            const result = await requireLocalUpdate()(options);
            recordOpenClawOperation({
                scope: 'update',
                action: 'update',
                ok: Boolean(result?.ok),
                outcome: result?.ok ? 'success' : 'warning',
                startedAt,
                finishedAt: now(),
                errorCode: result?.errorCode || '',
                error: result?.error || '',
                summary: result?.healthCheck?.status && result.healthCheck.status !== 'healthy'
                    ? `Health check ended in ${result.healthCheck.status}.`
                    : '',
            });
            return result;
        }
        catch (error) {
            const nextError = error;
            recordOpenClawOperation({
                scope: 'update',
                action: 'update',
                ok: false,
                outcome: 'error',
                startedAt,
                finishedAt: now(),
                errorCode: nextError?.errorCode || '',
                error: nextError?.message || '',
            });
            throw nextError;
        }
    }
    async function runOpenClawInstall() {
        assertRemoteMutationAllowed('update', 'install');
        const startedAt = now();
        try {
            const result = await requireLocalInstall()();
            recordOpenClawOperation({
                scope: 'update',
                action: 'install',
                ok: Boolean(result?.ok),
                outcome: result?.ok ? 'success' : 'warning',
                startedAt,
                finishedAt: now(),
                errorCode: result?.errorCode || '',
                error: result?.error || '',
            });
            return result;
        }
        catch (error) {
            const nextError = error;
            recordOpenClawOperation({
                scope: 'update',
                action: 'install',
                ok: false,
                outcome: 'error',
                startedAt,
                finishedAt: now(),
                errorCode: nextError?.errorCode || '',
                error: nextError?.message || '',
            });
            throw nextError;
        }
    }
    async function runOpenClawOnboarding(options = {}) {
        assertRemoteMutationAllowed('onboarding', 'onboard');
        const startedAt = now();
        try {
            const result = await requireLocalOnboarding()(options);
            recordOpenClawOperation({
                scope: 'onboarding',
                action: 'onboard',
                ok: Boolean(result?.ok),
                outcome: result?.ok ? 'success' : 'warning',
                startedAt,
                finishedAt: now(),
                errorCode: result?.errorCode || '',
                error: result?.error || '',
                summary: result?.healthCheck?.status && result.healthCheck.status !== 'healthy'
                    ? `Onboarding finished with health status ${result.healthCheck.status}.`
                    : '',
            });
            return result;
        }
        catch (error) {
            const nextError = error;
            recordOpenClawOperation({
                scope: 'onboarding',
                action: 'onboard',
                ok: false,
                outcome: 'error',
                startedAt,
                finishedAt: now(),
                errorCode: nextError?.errorCode || '',
                error: nextError?.message || '',
            });
            throw nextError;
        }
    }
    return {
        getOpenClawConfigState,
        getOpenClawOnboardingState,
        applyOpenClawConfigPatch,
        restoreRemoteOpenClawConfigBackup,
        listOpenClawOperationHistory,
        getOpenClawUpdateState,
        runOpenClawOnboarding,
        runOpenClawAction,
        runOpenClawInstall,
        runOpenClawUpdate,
    };
}
