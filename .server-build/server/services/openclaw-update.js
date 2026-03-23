"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OFFICIAL_INSTALL_DOCS_URL = exports.OFFICIAL_INSTALL_COMMAND = void 0;
exports.parseNoisyJson = parseNoisyJson;
exports.createOpenClawUpdateService = createOpenClawUpdateService;
const openclaw_management_1 = require("./openclaw-management");
const DEFAULT_UPDATE_TIMEOUT_MS = 20 * 60 * 1000;
const OFFICIAL_INSTALL_DOCS_URL = 'https://docs.openclaw.ai/install';
exports.OFFICIAL_INSTALL_DOCS_URL = OFFICIAL_INSTALL_DOCS_URL;
const OFFICIAL_INSTALL_COMMAND = 'curl -fsSL https://openclaw.ai/install.sh | bash';
exports.OFFICIAL_INSTALL_COMMAND = OFFICIAL_INSTALL_COMMAND;
function clipOutput(value = '', maxLength = 10_000) {
    const normalized = String(value || '');
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}
function parseNoisyJson(text = '') {
    const normalized = String(text || '').trim();
    if (!normalized) {
        return null;
    }
    const firstBraceIndex = normalized.indexOf('{');
    const lastBraceIndex = normalized.lastIndexOf('}');
    if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
        return null;
    }
    try {
        return JSON.parse(normalized.slice(firstBraceIndex, lastBraceIndex + 1));
    }
    catch {
        return null;
    }
}
function createCommandSummary(command, args = [], response = {}) {
    const exitCode = typeof response?.exitCode === 'number' && Number.isInteger(response.exitCode)
        ? response.exitCode
        : (response?.ok ? 0 : null);
    return {
        ok: Boolean(response?.ok),
        timedOut: Boolean(response?.timedOut),
        exitCode,
        signal: response?.signal || '',
        stdout: clipOutput(response?.stdout || ''),
        stderr: clipOutput(response?.stderr || ''),
        error: response?.error || '',
        systemErrorCode: response?.systemErrorCode || '',
        command: {
            bin: command,
            args,
            display: [command, ...args].join(' '),
        },
    };
}
function summarizeCommandError(command, args = [], error) {
    const message = String(error?.message || 'OpenClaw update command failed');
    const timedOut = Boolean(error?.killed) && /timed out/i.test(message);
    return createCommandSummary(command, args, {
        ok: false,
        timedOut,
        exitCode: typeof error?.code === 'number' && Number.isInteger(error.code) ? error.code : null,
        signal: error?.signal || '',
        stdout: error?.stdout || '',
        stderr: error?.stderr || '',
        error: message,
        systemErrorCode: typeof error?.code === 'string' ? error.code : '',
    });
}
function buildInstallGuidance() {
    return {
        docsUrl: OFFICIAL_INSTALL_DOCS_URL,
        command: OFFICIAL_INSTALL_COMMAND,
    };
}
function buildStateFromStatus(status = {}, preview = null) {
    return {
        ok: true,
        installed: true,
        installGuidance: buildInstallGuidance(),
        status,
        preview,
        availability: status?.availability || preview?.availability || null,
        channel: status?.channel || null,
        update: status?.update || null,
        currentVersion: preview?.currentVersion || status?.update?.registry?.currentVersion || null,
        targetVersion: preview?.targetVersion || String(status?.availability?.latestVersion || '').trim() || null,
    };
}
function buildUnsupportedPlatformError() {
    const error = new Error('The local OpenClaw install flow is not supported on this platform yet');
    error.statusCode = 400;
    error.errorCode = 'install_platform_unsupported';
    return error;
}
function createOpenClawUpdateService({ config, execFileAsync, fetchImpl = global.fetch, }) {
    if (typeof execFileAsync !== 'function') {
        throw new Error('execFileAsync is required');
    }
    const execFile = execFileAsync;
    const runtimeConfig = config ?? {};
    const openclawBin = String(runtimeConfig.openclawBin || 'openclaw').trim() || 'openclaw';
    async function runOpenClawCommand(args = []) {
        try {
            const response = await execFile(openclawBin, args, {
                timeout: DEFAULT_UPDATE_TIMEOUT_MS,
                maxBuffer: 8 * 1024 * 1024,
                env: process.env,
            });
            return createCommandSummary(openclawBin, args, {
                ok: true,
                stdout: response?.stdout || '',
                stderr: response?.stderr || '',
            });
        }
        catch (error) {
            return summarizeCommandError(openclawBin, args, error);
        }
    }
    async function runShellCommand(commandString = '') {
        try {
            const response = await execFile('bash', ['-lc', commandString], {
                timeout: DEFAULT_UPDATE_TIMEOUT_MS,
                maxBuffer: 8 * 1024 * 1024,
                env: process.env,
            });
            return createCommandSummary('bash', ['-lc', commandString], {
                ok: true,
                stdout: response?.stdout || '',
                stderr: response?.stderr || '',
            });
        }
        catch (error) {
            return summarizeCommandError('bash', ['-lc', commandString], error);
        }
    }
    async function getOpenClawUpdateState() {
        const statusCommandResult = await runOpenClawCommand(['update', 'status', '--json']);
        if (!statusCommandResult.ok && statusCommandResult.systemErrorCode === 'ENOENT') {
            return {
                ok: true,
                installed: false,
                installGuidance: buildInstallGuidance(),
                status: null,
                preview: null,
                availability: null,
                channel: null,
                update: null,
                currentVersion: null,
                targetVersion: null,
            };
        }
        const statusPayload = parseNoisyJson(statusCommandResult.stdout) || parseNoisyJson(statusCommandResult.stderr);
        if (!statusCommandResult.ok || !statusPayload) {
            const error = new Error('Failed to inspect OpenClaw update status');
            error.statusCode = 500;
            error.errorCode = 'update_status_failed';
            throw error;
        }
        const previewCommandResult = await runOpenClawCommand(['update', '--dry-run', '--json']);
        const previewPayload = parseNoisyJson(previewCommandResult.stdout) || parseNoisyJson(previewCommandResult.stderr);
        return {
            ...buildStateFromStatus(statusPayload, previewPayload),
            statusCommandResult,
            previewCommandResult,
        };
    }
    async function loadNextStateAfterCommand() {
        try {
            const state = await getOpenClawUpdateState();
            return {
                state,
                stateError: null,
            };
        }
        catch (error) {
            const nextError = error;
            return {
                state: null,
                stateError: {
                    errorCode: nextError?.errorCode || 'update_status_failed',
                    message: String(nextError?.message || 'Failed to inspect OpenClaw update state'),
                },
            };
        }
    }
    async function runOpenClawUpdate({ restartGateway = true } = {}) {
        const currentState = await getOpenClawUpdateState();
        if (!currentState.installed) {
            const error = new Error('OpenClaw is not installed on this machine');
            error.statusCode = 400;
            error.errorCode = 'openclaw_not_installed';
            throw error;
        }
        const args = ['update', '--yes', '--json'];
        if (!restartGateway) {
            args.push('--no-restart');
        }
        const commandResult = await runOpenClawCommand(args);
        const resultPayload = parseNoisyJson(commandResult.stdout) || parseNoisyJson(commandResult.stderr);
        const healthCheck = restartGateway ? await (0, openclaw_management_1.performHealthCheck)(runtimeConfig, { fetchImpl }) : null;
        const { state: nextState, stateError } = await loadNextStateAfterCommand();
        const ok = Boolean(commandResult.ok)
            && (!restartGateway || healthCheck?.status === 'healthy')
            && !stateError;
        return {
            ok,
            action: 'update',
            restartGateway: Boolean(restartGateway),
            commandResult,
            result: resultPayload,
            healthCheck,
            state: nextState,
            errorCode: stateError?.errorCode || '',
            error: stateError?.message || '',
        };
    }
    async function runOpenClawInstall() {
        if (process.platform === 'win32') {
            throw buildUnsupportedPlatformError();
        }
        const currentState = await getOpenClawUpdateState();
        if (currentState.installed) {
            const error = new Error('OpenClaw is already installed on this machine');
            error.statusCode = 400;
            error.errorCode = 'openclaw_already_installed';
            throw error;
        }
        const commandResult = await runShellCommand(OFFICIAL_INSTALL_COMMAND);
        const { state: nextState, stateError } = await loadNextStateAfterCommand();
        const ok = Boolean(commandResult.ok) && Boolean(nextState?.installed) && !stateError;
        return {
            ok,
            action: 'install',
            commandResult,
            healthCheck: null,
            state: nextState,
            installGuidance: buildInstallGuidance(),
            errorCode: stateError?.errorCode || '',
            error: stateError?.message || '',
        };
    }
    return {
        getOpenClawUpdateState,
        runOpenClawInstall,
        runOpenClawUpdate,
    };
}
