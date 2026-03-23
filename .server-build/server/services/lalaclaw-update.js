"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEV_MOCK_STATE_FILENAME = exports.UPDATE_STATUS_FILENAME = void 0;
exports.clipOutput = clipOutput;
exports.parseCalendarVersion = parseCalendarVersion;
exports.compareCalendarVersions = compareCalendarVersions;
exports.hasStableUpdate = hasStableUpdate;
exports.buildReleaseInfo = buildReleaseInfo;
exports.buildDevMockControlState = buildDevMockControlState;
exports.normalizeJob = normalizeJob;
exports.detectCapability = detectCapability;
exports.createLalaClawUpdateService = createLalaClawUpdateService;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const package_json_1 = __importDefault(require("../../package.json"));
const DEFAULT_REGISTRY_BASE_URL = 'https://registry.npmjs.org';
exports.UPDATE_STATUS_FILENAME = 'lalaclaw-update-state.json';
exports.DEV_MOCK_STATE_FILENAME = 'lalaclaw-update-dev-mock.json';
const PACKAGE_NAME = 'lalaclaw';
const PACKAGE_VERSION = String(package_json_1.default?.version || '').trim() || '0.0.0';
const WINDOWS_BACKGROUND_SERVICE_STATE_FILE = 'lalaclaw-background-service.json';
const RUNNER_PATH = node_path_1.default.join(__dirname, 'lalaclaw-update-runner.js');
function isSourceCheckout(projectRoot = node_path_1.default.resolve(__dirname, '..', '..')) {
    if (node_fs_1.default.existsSync(node_path_1.default.join(projectRoot, '.git'))) {
        return true;
    }
    const sourceMarkers = [
        node_path_1.default.join(projectRoot, 'src', 'main.jsx'),
        node_path_1.default.join(projectRoot, 'vite.config.mjs'),
        node_path_1.default.join(projectRoot, 'src', 'main.tsx'),
    ];
    return sourceMarkers.every((filePath) => node_fs_1.default.existsSync(filePath));
}
function resolveLaunchdPlistPath(homeDir = node_os_1.default.homedir()) {
    return node_path_1.default.join(homeDir, 'Library', 'LaunchAgents', 'ai.lalaclaw.app.plist');
}
function resolveWindowsBackgroundServiceStatePath(envFilePath = '') {
    return node_path_1.default.join(node_path_1.default.dirname(envFilePath), WINDOWS_BACKGROUND_SERVICE_STATE_FILE);
}
function clipOutput(value = '', maxLength = 10_000) {
    const normalized = String(value || '');
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...[truncated]` : normalized;
}
function ensureDirectory(targetPath = '') {
    const normalized = String(targetPath || '').trim();
    if (!normalized) {
        return;
    }
    try {
        node_fs_1.default.mkdirSync(normalized, { recursive: true });
    }
    catch { }
}
function readJsonFile(filePath = '') {
    const normalized = String(filePath || '').trim();
    if (!normalized || !node_fs_1.default.existsSync(normalized)) {
        return null;
    }
    try {
        return JSON.parse(node_fs_1.default.readFileSync(normalized, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJsonFile(filePath = '', payload = {}) {
    const normalized = String(filePath || '').trim();
    if (!normalized) {
        return;
    }
    try {
        ensureDirectory(node_path_1.default.dirname(normalized));
        const tempFile = `${normalized}.tmp`;
        node_fs_1.default.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        node_fs_1.default.renameSync(tempFile, normalized);
    }
    catch { }
}
function deleteFile(filePath = '') {
    const normalized = String(filePath || '').trim();
    if (!normalized) {
        return;
    }
    try {
        node_fs_1.default.rmSync(normalized, { force: true });
    }
    catch { }
}
function parseCalendarVersion(value = '') {
    const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/);
    if (!match) {
        return null;
    }
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        sequence: Number(match[4] || 0),
    };
}
function compareCalendarVersions(left = '', right = '') {
    const parsedLeft = parseCalendarVersion(left);
    const parsedRight = parseCalendarVersion(right);
    if (!parsedLeft || !parsedRight) {
        return null;
    }
    if (parsedLeft.year !== parsedRight.year) {
        return parsedLeft.year - parsedRight.year;
    }
    if (parsedLeft.month !== parsedRight.month) {
        return parsedLeft.month - parsedRight.month;
    }
    if (parsedLeft.day !== parsedRight.day) {
        return parsedLeft.day - parsedRight.day;
    }
    return parsedLeft.sequence - parsedRight.sequence;
}
function hasStableUpdate(currentVersion = '', stableVersion = '') {
    const normalizedCurrent = String(currentVersion || '').trim();
    const normalizedStable = String(stableVersion || '').trim();
    if (!normalizedCurrent || !normalizedStable || normalizedCurrent === normalizedStable) {
        return false;
    }
    const comparison = compareCalendarVersions(normalizedCurrent, normalizedStable);
    return comparison == null ? normalizedCurrent !== normalizedStable : comparison < 0;
}
function buildReleaseInfo(version = '', stableVersion = '') {
    const normalizedVersion = String(version || '').trim();
    const normalizedStableVersion = String(stableVersion || '').trim();
    return {
        version: normalizedVersion,
        stable: Boolean(normalizedVersion && normalizedVersion === normalizedStableVersion),
    };
}
function normalizeDevMockState(rawState = null) {
    if (!rawState || typeof rawState !== 'object') {
        return {
            enabled: false,
            stableVersion: '',
            updatedAt: 0,
        };
    }
    const enabled = rawState.enabled === true;
    const stableVersion = enabled ? String(rawState.stableVersion || '').trim() : '';
    return {
        enabled: enabled && Boolean(stableVersion),
        stableVersion: enabled ? stableVersion : '',
        updatedAt: Number(rawState.updatedAt || 0),
    };
}
function buildDevMockControlState({ available = false, fileState = null, } = {}) {
    const normalizedFileState = normalizeDevMockState(fileState);
    const enabled = normalizedFileState.enabled;
    const stableVersion = normalizedFileState.stableVersion;
    return {
        ok: true,
        available: Boolean(available),
        enabled,
        stableVersion,
        source: normalizedFileState.enabled ? 'devtools' : 'none',
        updatedAt: normalizedFileState.updatedAt || 0,
    };
}
function normalizeJob(rawJob = null) {
    if (!rawJob || typeof rawJob !== 'object') {
        return {
            active: false,
            status: 'idle',
            targetVersion: '',
            currentVersionAtStart: '',
            startedAt: 0,
            finishedAt: 0,
            errorCode: '',
            error: '',
            commandResult: null,
            restartResult: null,
        };
    }
    const status = String(rawJob.status || 'idle').trim() || 'idle';
    return {
        active: ['scheduled', 'updating', 'restarting'].includes(status),
        status,
        targetVersion: String(rawJob.targetVersion || '').trim(),
        currentVersionAtStart: String(rawJob.currentVersionAtStart || '').trim(),
        startedAt: Number(rawJob.startedAt || 0),
        finishedAt: Number(rawJob.finishedAt || 0),
        errorCode: String(rawJob.errorCode || '').trim(),
        error: String(rawJob.error || '').trim(),
        commandResult: rawJob.commandResult || null,
        restartResult: rawJob.restartResult || null,
    };
}
async function fetchRegistryMetadata({ fetchImpl, packageName, registryBaseUrl = DEFAULT_REGISTRY_BASE_URL, }) {
    if (typeof fetchImpl !== 'function') {
        return {
            ok: false,
            errorCode: 'lalaclaw_update_check_failed',
            error: 'Registry fetch is unavailable in this runtime.',
            metadata: null,
        };
    }
    const encodedPackageName = encodeURIComponent(String(packageName || '').trim());
    const registryUrl = `${String(registryBaseUrl || DEFAULT_REGISTRY_BASE_URL).replace(/\/+$/, '')}/${encodedPackageName}`;
    try {
        const response = await fetchImpl(registryUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });
        if (!response.ok) {
            return {
                ok: false,
                errorCode: 'lalaclaw_update_check_failed',
                error: `Registry request failed with ${response.status}.`,
                metadata: null,
            };
        }
        const payload = await response.json();
        const metadata = payload && typeof payload === 'object' ? payload : null;
        return {
            ok: true,
            errorCode: '',
            error: '',
            metadata,
        };
    }
    catch (error) {
        const nextError = error;
        return {
            ok: false,
            errorCode: 'lalaclaw_update_check_failed',
            error: String(nextError?.message || 'Registry request failed'),
            metadata: null,
        };
    }
}
function detectCapability({ accessConfigFile = '', mockStableVersion = '', platform = process.platform, projectRoot = node_path_1.default.resolve(__dirname, '..', '..'), }) {
    const sourceCheckout = isSourceCheckout(projectRoot);
    const launchdInstalled = platform === 'darwin' && node_fs_1.default.existsSync(resolveLaunchdPlistPath(node_os_1.default.homedir()));
    const windowsBackgroundInstalled = platform === 'win32'
        && node_fs_1.default.existsSync(resolveWindowsBackgroundServiceStatePath(accessConfigFile || ''));
    const mockPreviewEnabled = Boolean(String(mockStableVersion || '').trim());
    return {
        installKind: mockPreviewEnabled ? 'npm-package' : (sourceCheckout ? 'source-checkout' : 'npm-package'),
        restartMode: launchdInstalled ? 'launchd' : (windowsBackgroundInstalled ? 'windows-background' : 'manual'),
        updateSupported: mockPreviewEnabled ? true : !sourceCheckout,
        reason: mockPreviewEnabled ? '' : (sourceCheckout ? 'lalaclaw_update_source_checkout_unsupported' : ''),
    };
}
function buildMockCheckResult(stableVersion = '') {
    const normalizedStableVersion = String(stableVersion || '').trim();
    return {
        ok: Boolean(normalizedStableVersion),
        errorCode: normalizedStableVersion ? '' : 'lalaclaw_update_check_failed',
        error: normalizedStableVersion ? '' : 'Mock stable version is empty.',
        metadata: normalizedStableVersion
            ? {
                'dist-tags': {
                    latest: normalizedStableVersion,
                    stable: normalizedStableVersion,
                },
            }
            : null,
    };
}
function maybeCompleteMockJob({ currentJob = null, currentVersion = '', mockStableVersion = '', now = () => Date.now(), writeJobState = () => { }, } = {}) {
    const normalizedJob = normalizeJob(currentJob);
    const normalizedMockStableVersion = String(mockStableVersion || '').trim();
    const normalizedCurrentVersion = String(currentVersion || '').trim();
    if (!normalizedMockStableVersion
        || normalizedJob.status !== 'scheduled'
        || normalizedJob.targetVersion !== normalizedMockStableVersion
        || normalizedCurrentVersion === normalizedMockStableVersion) {
        return normalizedJob;
    }
    const completedJob = normalizeJob({
        ...normalizedJob,
        active: false,
        status: 'completed',
        finishedAt: normalizedJob.finishedAt || now(),
        errorCode: '',
        error: '',
    });
    writeJobState(completedJob);
    return completedJob;
}
function buildUpdateState({ checkResult, checkedAt, currentVersion, workspaceVersion = '', job, capability, }) {
    const distTags = checkResult?.metadata?.['dist-tags'] || {};
    const stableVersion = String(distTags.stable || distTags.latest || '').trim();
    const normalizedWorkspaceVersion = String(workspaceVersion || '').trim();
    const currentRelease = buildReleaseInfo(currentVersion, stableVersion);
    const targetRelease = buildReleaseInfo(stableVersion, stableVersion);
    return {
        ok: true,
        packageName: PACKAGE_NAME,
        currentVersion,
        workspaceVersion: normalizedWorkspaceVersion,
        currentRelease,
        targetRelease,
        stableTag: String(distTags.stable ? 'stable' : 'latest'),
        updateAvailable: capability.updateSupported && checkResult?.ok && hasStableUpdate(currentVersion, stableVersion),
        capability,
        check: {
            ok: Boolean(checkResult?.ok),
            scope: 'stable',
            checkedAt,
            errorCode: checkResult?.errorCode || '',
            error: checkResult?.error || '',
        },
        job: normalizeJob(job),
    };
}
function createLalaClawUpdateService({ config = {}, currentVersion = PACKAGE_VERSION, fetchImpl = global.fetch, now = () => Date.now(), platform = process.platform, processPid = process.pid, projectRoot = node_path_1.default.resolve(__dirname, '..', '..'), runnerPath = RUNNER_PATH, spawnImpl = node_child_process_1.spawn, } = {}) {
    const stateDir = String(config?.stateDir || '').trim() || node_path_1.default.join(node_os_1.default.tmpdir(), 'lalaclaw');
    const statusFile = node_path_1.default.join(stateDir, exports.UPDATE_STATUS_FILENAME);
    const devMockStateFile = node_path_1.default.join(stateDir, exports.DEV_MOCK_STATE_FILENAME);
    const sourceCheckout = isSourceCheckout(projectRoot);
    function readJobState() {
        return normalizeJob(readJsonFile(statusFile));
    }
    function writeJobState(job) {
        writeJsonFile(statusFile, normalizeJob(job));
    }
    function clearJobState() {
        deleteFile(statusFile);
    }
    function readDevMockControlState() {
        return buildDevMockControlState({
            available: sourceCheckout,
            fileState: readJsonFile(devMockStateFile),
        });
    }
    function resolveMockStableVersion() {
        const controlState = readDevMockControlState();
        return String(controlState.available && controlState.enabled ? controlState.stableVersion : '').trim();
    }
    function assertDevMockRouteAvailable() {
        if (sourceCheckout) {
            return;
        }
        const error = new Error('The dev-only LalaClaw update mock route is unavailable outside a source checkout.');
        error.statusCode = 404;
        error.errorCode = 'lalaclaw_update_dev_mock_unavailable';
        throw error;
    }
    function getLalaClawUpdateDevMockState() {
        assertDevMockRouteAvailable();
        return readDevMockControlState();
    }
    function setLalaClawUpdateDevMockState({ enabled = false, stableVersion = '' } = {}) {
        assertDevMockRouteAvailable();
        if (!enabled) {
            deleteFile(devMockStateFile);
            clearJobState();
            return readDevMockControlState();
        }
        const normalizedStableVersion = String(stableVersion || '').trim();
        if (!parseCalendarVersion(normalizedStableVersion)) {
            const error = new Error('The mock stable version must use the LalaClaw calendar version format.');
            error.statusCode = 400;
            error.errorCode = 'lalaclaw_update_invalid_mock_version';
            throw error;
        }
        writeJsonFile(devMockStateFile, {
            enabled: true,
            stableVersion: normalizedStableVersion,
            updatedAt: now(),
        });
        clearJobState();
        return readDevMockControlState();
    }
    async function getLalaClawUpdateState() {
        const mockStableVersion = resolveMockStableVersion();
        const capability = detectCapability({
            accessConfigFile: config?.accessConfigFile || '',
            mockStableVersion,
            platform,
            projectRoot,
        });
        const currentJob = maybeCompleteMockJob({
            currentJob: readJobState(),
            currentVersion,
            mockStableVersion,
            now,
            writeJobState,
        });
        const checkResult = mockStableVersion
            ? buildMockCheckResult(mockStableVersion)
            : await fetchRegistryMetadata({
                fetchImpl,
                packageName: PACKAGE_NAME,
            });
        const effectiveCurrentVersion = mockStableVersion && currentJob.status === 'completed' && currentJob.targetVersion
            ? currentJob.targetVersion
            : String(currentVersion || '').trim();
        let nextJob = currentJob;
        if (currentJob.active
            && currentJob.targetVersion
            && String(currentVersion || '').trim() === currentJob.targetVersion) {
            nextJob = {
                ...currentJob,
                active: false,
                status: 'completed',
                finishedAt: currentJob.finishedAt || now(),
                errorCode: '',
                error: '',
            };
            writeJobState(nextJob);
        }
        return buildUpdateState({
            checkResult,
            checkedAt: now(),
            currentVersion: effectiveCurrentVersion,
            workspaceVersion: PACKAGE_VERSION,
            job: nextJob,
            capability,
        });
    }
    async function runLalaClawUpdate() {
        const mockStableVersion = resolveMockStableVersion();
        const state = await getLalaClawUpdateState();
        if (!state.capability.updateSupported) {
            const error = new Error('In-app LalaClaw updates are not supported from a source checkout.');
            error.statusCode = 400;
            error.errorCode = state.capability.reason || 'lalaclaw_update_source_checkout_unsupported';
            throw error;
        }
        if (!state.check.ok || !state.targetRelease.version) {
            const error = new Error('The latest stable LalaClaw version could not be checked right now.');
            error.statusCode = 503;
            error.errorCode = state.check.errorCode || 'lalaclaw_update_check_failed';
            throw error;
        }
        if (!state.updateAvailable) {
            return {
                ok: true,
                accepted: false,
                state,
            };
        }
        if (state.job.active) {
            return {
                ok: true,
                accepted: true,
                state,
            };
        }
        const nextJob = normalizeJob({
            status: 'scheduled',
            targetVersion: state.targetRelease.version,
            currentVersionAtStart: state.currentVersion,
            startedAt: now(),
            finishedAt: 0,
            errorCode: '',
            error: '',
            commandResult: null,
            restartResult: null,
        });
        writeJobState(nextJob);
        if (mockStableVersion) {
            return {
                ok: true,
                accepted: true,
                state: {
                    ...state,
                    job: nextJob,
                },
            };
        }
        try {
            const child = spawnImpl(process.execPath, [
                runnerPath,
                '--status-file', statusFile,
                '--target-version', state.targetRelease.version,
                '--current-version', state.currentVersion,
                '--restart-mode', state.capability.restartMode,
                '--config-file', String(config?.accessConfigFile || '').trim(),
                '--host', String(process.env.HOST || '127.0.0.1').trim(),
                '--port', String(process.env.PORT || '3000').trim(),
                '--server-pid', String(processPid),
                '--project-root', projectRoot,
            ], {
                cwd: projectRoot,
                detached: true,
                env: process.env,
                stdio: 'ignore',
            });
            if (typeof child?.unref === 'function') {
                child.unref();
            }
        }
        catch (error) {
            const nextError = error;
            const failedJob = normalizeJob({
                ...nextJob,
                active: false,
                status: 'failed',
                finishedAt: now(),
                errorCode: 'lalaclaw_update_spawn_failed',
                error: String(nextError?.message || 'Failed to launch the update worker'),
            });
            writeJobState(failedJob);
            return {
                ok: false,
                accepted: false,
                errorCode: failedJob.errorCode,
                error: failedJob.error,
                state: await getLalaClawUpdateState(),
            };
        }
        return {
            ok: true,
            accepted: true,
            state: await getLalaClawUpdateState(),
        };
    }
    return {
        getLalaClawUpdateDevMockState,
        getLalaClawUpdateState,
        runLalaClawUpdate,
        setLalaClawUpdateDevMockState,
    };
}
