/* global describe, expect, it */
import { createOpenClawOnboardingHandler } from './openclaw-onboarding.ts';

describe('createOpenClawOnboardingHandler', () => {
  it('returns onboarding state for GET requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    let receivedOptions = null;
    const handler = createOpenClawOnboardingHandler({
      getOpenClawOnboardingState: async (options) => {
        receivedOptions = options;
        return {
        ok: true,
        installed: true,
        ready: false,
        needsOnboarding: true,
        };
      },
      parseRequestBody: async () => ({}),
      runOpenClawOnboarding: async () => ({ ok: true }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handler({ method: 'GET' }, {});

    expect(responseStatus).toBe(200);
    expect(receivedOptions).toEqual({ refreshCapabilities: false });
    expect(responseBody).toMatchObject({
      ok: true,
      installed: true,
      ready: false,
      needsOnboarding: true,
    });
  });

  it('lets GET requests force a capability refresh', async () => {
    let receivedOptions = null;
    const handler = createOpenClawOnboardingHandler({
      getOpenClawOnboardingState: async (options) => {
        receivedOptions = options;
        return { ok: true, installed: true, ready: false, needsOnboarding: true };
      },
      parseRequestBody: async () => ({}),
      runOpenClawOnboarding: async () => ({ ok: true }),
      sendJson: () => {},
    });

    await handler({ method: 'GET', url: '/api/openclaw/onboarding?refreshCapabilities=1' }, {});

    expect(receivedOptions).toEqual({ refreshCapabilities: true });
  });

  it('runs controlled onboarding for POST requests', async () => {
    let responseStatus = null;
    let responseBody = null;
    const handler = createOpenClawOnboardingHandler({
      getOpenClawOnboardingState: async () => ({ ok: true }),
      parseRequestBody: async () => ({
        authChoice: 'openai-api-key',
        apiKey: 'sk-test',
        customCompatibility: 'openai',
        daemonRuntime: 'node',
        flow: 'quickstart',
        gatewayAuth: 'off',
        gatewayBind: 'loopback',
        gatewayPassword: '',
        gatewayToken: '',
        gatewayTokenInputMode: 'plaintext',
        gatewayTokenRefEnv: '',
        installDaemon: true,
        secretInputMode: 'plaintext',
        skipHealthCheck: false,
      }),
      runOpenClawOnboarding: async (payload) => ({
        ok: true,
        payload,
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handler({ method: 'POST' }, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      payload: {
        authChoice: 'openai-api-key',
        apiKey: 'sk-test',
        customBaseUrl: undefined,
        customCompatibility: 'openai',
        customModelId: undefined,
        customProviderId: undefined,
        daemonRuntime: 'node',
        flow: 'quickstart',
        gatewayAuth: 'off',
        gatewayBind: 'loopback',
        gatewayPassword: '',
        gatewayToken: '',
        gatewayTokenInputMode: 'plaintext',
        gatewayTokenRefEnv: '',
        installDaemon: true,
        secretInputMode: 'plaintext',
        skipHealthCheck: false,
        token: undefined,
        tokenExpiresIn: undefined,
        tokenProfileId: undefined,
        tokenProvider: undefined,
        workspace: undefined,
      },
    });
  });
});
