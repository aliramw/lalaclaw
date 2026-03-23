"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenClawOnboardingHandler = createOpenClawOnboardingHandler;
function readBooleanQueryFlag(req, key) {
    const url = String(req?.url || '').trim();
    if (!url) {
        return false;
    }
    try {
        const value = new URL(url, 'http://127.0.0.1').searchParams.get(key);
        return value === '1' || value === 'true';
    }
    catch {
        return false;
    }
}
function createOpenClawOnboardingHandler({ getOpenClawOnboardingState, parseRequestBody, runOpenClawOnboarding, sendJson, }) {
    return async function handleOpenClawOnboarding(req, res) {
        try {
            if (req.method === 'GET') {
                const result = await getOpenClawOnboardingState({
                    refreshCapabilities: readBooleanQueryFlag(req, 'refreshCapabilities'),
                });
                sendJson(res, 200, result);
                return;
            }
            if (req.method === 'POST') {
                const body = await parseRequestBody(req);
                const result = await runOpenClawOnboarding({
                    authChoice: body?.authChoice,
                    apiKey: body?.apiKey,
                    customBaseUrl: body?.customBaseUrl,
                    customCompatibility: body?.customCompatibility,
                    customModelId: body?.customModelId,
                    customProviderId: body?.customProviderId,
                    daemonRuntime: body?.daemonRuntime,
                    flow: body?.flow,
                    gatewayAuth: body?.gatewayAuth,
                    gatewayBind: body?.gatewayBind,
                    gatewayPassword: body?.gatewayPassword,
                    gatewayToken: body?.gatewayToken,
                    gatewayTokenInputMode: body?.gatewayTokenInputMode,
                    gatewayTokenRefEnv: body?.gatewayTokenRefEnv,
                    installDaemon: body?.installDaemon,
                    secretInputMode: body?.secretInputMode,
                    skipHealthCheck: body?.skipHealthCheck,
                    token: body?.token,
                    tokenExpiresIn: body?.tokenExpiresIn,
                    tokenProfileId: body?.tokenProfileId,
                    tokenProvider: body?.tokenProvider,
                    workspace: body?.workspace,
                });
                sendJson(res, 200, result);
                return;
            }
            sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        }
        catch (error) {
            const statusCode = Number.isInteger(error?.statusCode)
                ? Number(error.statusCode)
                : 500;
            sendJson(res, statusCode, {
                ok: false,
                error: error?.message || 'OpenClaw onboarding request failed',
                errorCode: error?.errorCode || 'openclaw_onboarding_failed',
            });
        }
    };
}
