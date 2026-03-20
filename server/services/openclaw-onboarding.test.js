/* global describe, expect, it, vi */
const {
  buildOnboardingArgs,
  createOpenClawOnboardingService,
  parseNoisyJson,
  parseOnboardingHelpCapabilities,
} = require('./openclaw-onboarding');

describe('parseNoisyJson', () => {
  it('extracts trailing JSON from noisy onboarding output', () => {
    expect(parseNoisyJson('[wizard] ready\n{"ok":true,"mode":"local"}\n')).toEqual({
      ok: true,
      mode: 'local',
    });
  });
});

describe('parseOnboardingHelpCapabilities', () => {
  it('intersects official help capabilities with the in-app supported onboarding surface', () => {
    const capabilities = parseOnboardingHelpCapabilities(`
Usage: openclaw onboard [options]

Options:
  --auth-choice <choice>                   Auth: token|openai-codex|openai-api-key|github-copilot|google-gemini-cli|cloudflare-ai-gateway-api-key|skip|claude-cli|codex-cli
  --daemon-runtime <runtime>               Daemon runtime: node
  --flow <flow>                            Wizard flow: advanced|manual
  --gateway-auth <mode>                    Gateway auth: token|password
  --gateway-bind <mode>                    Gateway bind: loopback|tailnet
  --gateway-token <token>                  Gateway token (token auth)
  --gateway-token-ref-env <name>           Gateway token SecretRef env var name
  --secret-input-mode <mode>               API key persistence mode: plaintext|ref (default: plaintext)
`);

    expect(capabilities).toEqual({
      capabilityDetection: {
        source: 'help',
        reason: '',
        detectedAt: '',
        signature: '',
        commandResult: null,
      },
      supportedAuthChoices: ['token', 'github-copilot', 'google-gemini-cli', 'openai-api-key', 'skip'],
      supportedDaemonRuntimes: ['node'],
      supportedFlows: ['advanced', 'manual'],
      supportedGatewayAuthModes: ['off', 'token', 'password'],
      supportedSecretInputModes: ['plaintext', 'ref'],
      supportedGatewayTokenInputModes: ['plaintext', 'ref'],
      supportedGatewayBinds: ['loopback', 'tailnet'],
    });
  });
});

describe('buildOnboardingArgs', () => {
  it('builds a managed-login onboarding command without extra credentials', () => {
    expect(buildOnboardingArgs({
      authChoice: 'github-copilot',
      gatewayBind: 'loopback',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'github-copilot',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
    ]);
  });

  it('supports switching the official onboarding flow', () => {
    expect(buildOnboardingArgs({
      authChoice: 'skip',
      flow: 'manual',
      gatewayBind: 'loopback',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'manual',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'skip',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
    ]);
  });

  it('builds the token-based quickstart onboarding command', () => {
    expect(buildOnboardingArgs({
      authChoice: 'token',
      gatewayBind: 'loopback',
      token: 'provider-token',
      tokenExpiresIn: '30d',
      tokenProfileId: 'openai:manual',
      tokenProvider: 'openai',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'token',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
      '--token-provider',
      'openai',
      '--token',
      'provider-token',
      '--token-profile-id',
      'openai:manual',
      '--token-expires-in',
      '30d',
    ]);
  });

  it('builds the quickstart custom provider onboarding command', () => {
    expect(buildOnboardingArgs({
      authChoice: 'custom-api-key',
      apiKey: 'secret-key',
      customBaseUrl: 'https://api.example.com/v1',
      customCompatibility: 'anthropic',
      customModelId: 'openai/gpt-5.4',
      customProviderId: 'acme-openai',
      gatewayBind: 'loopback',
      workspace: '/tmp/openclaw-workspace',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'custom-api-key',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--workspace',
      '/tmp/openclaw-workspace',
      '--install-daemon',
      '--daemon-runtime',
      'node',
      '--custom-base-url',
      'https://api.example.com/v1',
      '--custom-model-id',
      'openai/gpt-5.4',
      '--custom-compatibility',
      'anthropic',
      '--custom-provider-id',
      'acme-openai',
      '--custom-api-key',
      'secret-key',
    ]);
  });

  it('supports env SecretRef mode without an inline provider key', () => {
    expect(buildOnboardingArgs({
      authChoice: 'openai-api-key',
      secretInputMode: 'ref',
      gatewayBind: 'loopback',
      workspace: '/tmp/openclaw-workspace',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'ref',
      '--auth-choice',
      'openai-api-key',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--workspace',
      '/tmp/openclaw-workspace',
      '--install-daemon',
      '--daemon-runtime',
      'node',
    ]);
  });

  it('supports ollama onboarding without requiring an API key', () => {
    expect(buildOnboardingArgs({
      authChoice: 'ollama',
      customBaseUrl: 'http://127.0.0.1:11434',
      customModelId: 'qwen3.5:27b',
      gatewayBind: 'loopback',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'ollama',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
      '--custom-base-url',
      'http://127.0.0.1:11434',
      '--custom-model-id',
      'qwen3.5:27b',
    ]);
  });

  it('supports skip mode without provider credentials', () => {
    expect(buildOnboardingArgs({
      authChoice: 'skip',
      gatewayBind: 'loopback',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'skip',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
    ]);
  });

  it('supports gateway token auth with env SecretRef storage', () => {
    expect(buildOnboardingArgs({
      authChoice: 'skip',
      gatewayAuth: 'token',
      gatewayBind: 'loopback',
      gatewayTokenInputMode: 'ref',
      gatewayTokenRefEnv: 'OPENCLAW_GATEWAY_TOKEN',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'skip',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
      '--gateway-auth',
      'token',
      '--gateway-token-ref-env',
      'OPENCLAW_GATEWAY_TOKEN',
    ]);
  });

  it('supports gateway password auth', () => {
    expect(buildOnboardingArgs({
      authChoice: 'skip',
      gatewayAuth: 'password',
      gatewayBind: 'loopback',
      gatewayPassword: 'super-secret',
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'skip',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--install-daemon',
      '--daemon-runtime',
      'node',
      '--gateway-auth',
      'password',
      '--gateway-password',
      'super-secret',
    ]);
  });

  it('supports skipping daemon install and the official onboarding health check', () => {
    expect(buildOnboardingArgs({
      authChoice: 'skip',
      daemonRuntime: 'bun',
      gatewayBind: 'loopback',
      installDaemon: false,
      skipHealthCheck: true,
    })).toEqual([
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--mode',
      'local',
      '--flow',
      'quickstart',
      '--secret-input-mode',
      'plaintext',
      '--auth-choice',
      'skip',
      '--gateway-bind',
      'loopback',
      '--skip-channels',
      '--json',
      '--no-install-daemon',
      '--skip-health',
    ]);
  });
});

describe('createOpenClawOnboardingService', () => {
  it('reports onboarding as unavailable when the OpenClaw binary is missing', async () => {
    const service = createOpenClawOnboardingService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async () => {
        const error = new Error('spawn openclaw ENOENT');
        error.code = 'ENOENT';
        throw error;
      },
    });

    const result = await service.getOpenClawOnboardingState();

    expect(result.ok).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.needsOnboarding).toBe(false);
    expect(result.capabilityDetection).toMatchObject({
      source: 'static-fallback',
      reason: 'binary-missing',
    });
  });

  it('keeps the real config path when plugin logs are mixed into config file output', async () => {
    const service = createOpenClawOnboardingService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async (_command, args) => {
        const normalizedArgs = args.join(' ');
        if (normalizedArgs === 'update status --json') {
          return {
            stdout: '{"update":{"installKind":"package"},"channel":{"value":"stable"},"availability":{"available":false}}',
            stderr: '',
          };
        }
        if (normalizedArgs === 'config file') {
          return {
            stdout: [
              '~/.openclaw/openclaw.json',
              '[plugins] feishu_chat: Registered feishu_chat tool',
              '[wecom] v1.0.13 loaded',
            ].join('\n'),
            stderr: '',
          };
        }
        if (normalizedArgs === 'onboard --help') {
          return {
            stdout: [
              'Usage: openclaw onboard [options]',
              '  --auth-choice <choice>                   Auth: github-copilot|skip',
              '  --daemon-runtime <runtime>               Daemon runtime: node',
              '  --flow <flow>                            Wizard flow: manual',
              '  --gateway-auth <mode>                    Gateway auth: token|password',
              '  --gateway-bind <mode>                    Gateway bind: loopback|tailnet',
              '  --gateway-token <token>                  Gateway token (token auth)',
              '  --gateway-token-ref-env <name>           Gateway token SecretRef env var name',
              '  --secret-input-mode <mode>               API key persistence mode: plaintext|ref (default: plaintext)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (normalizedArgs === 'config validate --json') {
          return {
            stdout: '{"valid":true,"path":"/Users/marila/.openclaw/openclaw.json"}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${normalizedArgs}`);
      },
    });

    const result = await service.getOpenClawOnboardingState();

    expect(result.configPath).toBe('~/.openclaw/openclaw.json');
    expect(result.ready).toBe(true);
    expect(result.supportedAuthChoices).toEqual(['github-copilot', 'skip']);
    expect(result.supportedFlows).toEqual(['manual']);
    expect(result.defaults.authChoice).toBe('skip');
    expect(result.defaults.flow).toBe('manual');
    expect(result.capabilityDetection).toMatchObject({
      source: 'help',
      reason: '',
    });
  });

  it('runs official quickstart onboarding and reports the refreshed ready state', async () => {
    let onboardExecuted = false;
    const service = createOpenClawOnboardingService({
      config: {
        openclawBin: 'openclaw',
        baseUrl: 'http://127.0.0.1:18789',
      },
      execFileAsync: async (_command, args) => {
        const normalizedArgs = args.join(' ');
        if (normalizedArgs === 'update status --json') {
          return {
            stdout: '{"update":{"installKind":"package"},"channel":{"value":"stable"},"availability":{"available":false}}',
            stderr: '',
          };
        }
        if (normalizedArgs === 'config file') {
          return {
            stdout: '/Users/marila/.openclaw/openclaw.json\n',
            stderr: '',
          };
        }
        if (normalizedArgs === 'onboard --help') {
          return {
            stdout: [
              'Usage: openclaw onboard [options]',
              '  --auth-choice <choice>                   Auth: openai-api-key|skip',
              '  --daemon-runtime <runtime>               Daemon runtime: node|bun',
              '  --flow <flow>                            Wizard flow: quickstart|advanced|manual',
              '  --gateway-auth <mode>                    Gateway auth: token|password',
              '  --gateway-bind <mode>                    Gateway bind: loopback|tailnet|lan|auto|custom',
              '  --gateway-token <token>                  Gateway token (token auth)',
              '  --gateway-token-ref-env <name>           Gateway token SecretRef env var name',
              '  --secret-input-mode <mode>               API key persistence mode: plaintext|ref (default: plaintext)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (normalizedArgs === 'config validate --json') {
          return {
            stdout: onboardExecuted
              ? '{"valid":true,"path":"/Users/marila/.openclaw/openclaw.json"}'
              : '{"valid":false,"path":"/Users/marila/.openclaw/openclaw.json"}',
            stderr: '',
          };
        }
        if (args[0] === 'onboard') {
          onboardExecuted = true;
          expect(args).toEqual(expect.arrayContaining([
            '--auth-choice',
            'openai-api-key',
            '--openai-api-key',
            'sk-test',
          ]));
          return {
            stdout: '{"ok":true,"mode":"local","flow":"quickstart"}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${normalizedArgs}`);
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => 'ok',
      }),
    });

    const result = await service.runOpenClawOnboarding({
      authChoice: 'openai-api-key',
      apiKey: 'sk-test',
      gatewayBind: 'loopback',
    });

    expect(result.ok).toBe(true);
    expect(result.commandResult.command.display).toContain('openclaw onboard --non-interactive');
    expect(result.healthCheck).toMatchObject({ status: 'healthy' });
    expect(result.capabilityDetection).toMatchObject({
      source: 'help-cache',
      reason: '',
    });
    expect(result.state).toMatchObject({
      installed: true,
      ready: true,
      needsOnboarding: false,
    });
  });

  it('reuses the cached help capability snapshot when the OpenClaw version signature stays the same', async () => {
    let helpCallCount = 0;
    const service = createOpenClawOnboardingService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async (_command, args) => {
        const normalizedArgs = args.join(' ');
        if (normalizedArgs === 'update status --json') {
          return {
            stdout: '{"update":{"installKind":"package","registry":{"currentVersion":"2026.3.13"}},"channel":{"value":"stable"},"availability":{"available":false}}',
            stderr: '',
          };
        }
        if (normalizedArgs === 'onboard --help') {
          helpCallCount += 1;
          return {
            stdout: [
              'Usage: openclaw onboard [options]',
              '  --auth-choice <choice>                   Auth: github-copilot|skip',
              '  --daemon-runtime <runtime>               Daemon runtime: node',
              '  --flow <flow>                            Wizard flow: manual',
              '  --gateway-auth <mode>                    Gateway auth: token|password',
              '  --gateway-bind <mode>                    Gateway bind: loopback',
              '  --gateway-token <token>                  Gateway token (token auth)',
              '  --gateway-token-ref-env <name>           Gateway token SecretRef env var name',
              '  --secret-input-mode <mode>               API key persistence mode: plaintext|ref (default: plaintext)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (normalizedArgs === 'config file') {
          return {
            stdout: '/Users/marila/.openclaw/openclaw.json\n',
            stderr: '',
          };
        }
        if (normalizedArgs === 'config validate --json') {
          return {
            stdout: '{"valid":true,"path":"/Users/marila/.openclaw/openclaw.json"}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${normalizedArgs}`);
      },
    });

    const firstState = await service.getOpenClawOnboardingState();
    const secondState = await service.getOpenClawOnboardingState();

    expect(helpCallCount).toBe(1);
    expect(firstState.capabilityDetection).toMatchObject({
      source: 'help',
      signature: 'openclaw@2026.3.13@package@stable',
    });
    expect(secondState.capabilityDetection).toMatchObject({
      source: 'help-cache',
      signature: 'openclaw@2026.3.13@package@stable',
    });
  });

  it('can force-refresh the help capability snapshot even when the version signature is unchanged', async () => {
    vi.useFakeTimers();
    let helpCallCount = 0;
    const service = createOpenClawOnboardingService({
      config: { openclawBin: 'openclaw' },
      execFileAsync: async (_command, args) => {
        const normalizedArgs = args.join(' ');
        if (normalizedArgs === 'update status --json') {
          return {
            stdout: '{"update":{"installKind":"package","registry":{"currentVersion":"2026.3.13"}},"channel":{"value":"stable"},"availability":{"available":false}}',
            stderr: '',
          };
        }
        if (normalizedArgs === 'onboard --help') {
          helpCallCount += 1;
          return {
            stdout: [
              'Usage: openclaw onboard [options]',
              '  --auth-choice <choice>                   Auth: github-copilot|skip',
              '  --daemon-runtime <runtime>               Daemon runtime: node',
              '  --flow <flow>                            Wizard flow: manual',
              '  --gateway-auth <mode>                    Gateway auth: token|password',
              '  --gateway-bind <mode>                    Gateway bind: loopback',
              '  --gateway-token <token>                  Gateway token (token auth)',
              '  --gateway-token-ref-env <name>           Gateway token SecretRef env var name',
              '  --secret-input-mode <mode>               API key persistence mode: plaintext|ref (default: plaintext)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (normalizedArgs === 'config file') {
          return {
            stdout: '/Users/marila/.openclaw/openclaw.json\n',
            stderr: '',
          };
        }
        if (normalizedArgs === 'config validate --json') {
          return {
            stdout: '{"valid":true,"path":"/Users/marila/.openclaw/openclaw.json"}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${normalizedArgs}`);
      },
    });

    vi.setSystemTime(new Date('2026-03-21T02:50:00.000Z'));
    const firstState = await service.getOpenClawOnboardingState();
    vi.setSystemTime(new Date('2026-03-21T02:55:00.000Z'));
    const refreshedState = await service.getOpenClawOnboardingState({ refreshCapabilities: true });

    expect(helpCallCount).toBe(2);
    expect(firstState.capabilityDetection).toMatchObject({
      source: 'help',
      detectedAt: '2026-03-21T02:50:00.000Z',
      signature: 'openclaw@2026.3.13@package@stable',
    });
    expect(refreshedState.capabilityDetection).toMatchObject({
      source: 'help',
      detectedAt: '2026-03-21T02:55:00.000Z',
      signature: 'openclaw@2026.3.13@package@stable',
    });
  });

  it('does not fail onboarding just because the gateway stays offline when daemon install is disabled', async () => {
    let onboardExecuted = false;
    const service = createOpenClawOnboardingService({
      config: {
        openclawBin: 'openclaw',
        baseUrl: 'http://127.0.0.1:18789',
      },
      execFileAsync: async (_command, args) => {
        const normalizedArgs = args.join(' ');
        if (normalizedArgs === 'update status --json') {
          return {
            stdout: '{"update":{"installKind":"package"},"channel":{"value":"stable"},"availability":{"available":false}}',
            stderr: '',
          };
        }
        if (normalizedArgs === 'config file') {
          return {
            stdout: '/Users/marila/.openclaw/openclaw.json\n',
            stderr: '',
          };
        }
        if (normalizedArgs === 'onboard --help') {
          return {
            stdout: [
              'Usage: openclaw onboard [options]',
              '  --auth-choice <choice>                   Auth: skip',
              '  --flow <flow>                            Wizard flow: quickstart|manual',
              '  --gateway-auth <mode>                    Gateway auth: token|password',
              '  --gateway-bind <mode>                    Gateway bind: loopback|tailnet|lan|auto|custom',
              '  --gateway-token <token>                  Gateway token (token auth)',
              '  --gateway-token-ref-env <name>           Gateway token SecretRef env var name',
              '  --secret-input-mode <mode>               API key persistence mode: plaintext|ref (default: plaintext)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (normalizedArgs === 'config validate --json') {
          return {
            stdout: onboardExecuted
              ? '{"valid":true,"path":"/Users/marila/.openclaw/openclaw.json"}'
              : '{"valid":false,"path":"/Users/marila/.openclaw/openclaw.json"}',
            stderr: '',
          };
        }
        if (args[0] === 'onboard') {
          onboardExecuted = true;
          expect(args).toEqual(expect.arrayContaining([
            '--no-install-daemon',
            '--skip-health',
          ]));
          return {
            stdout: '{"ok":true,"mode":"local","flow":"quickstart"}',
            stderr: '',
          };
        }
        throw new Error(`Unexpected command: ${normalizedArgs}`);
      },
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:18789');
      },
    });

    const result = await service.runOpenClawOnboarding({
      authChoice: 'skip',
      gatewayBind: 'loopback',
      installDaemon: false,
      skipHealthCheck: true,
    });

    expect(result.ok).toBe(true);
    expect(result.healthCheck).toMatchObject({ status: 'unreachable' });
    expect(result.capabilityDetection).toMatchObject({
      source: 'help-cache',
      reason: '',
    });
    expect(result.state).toMatchObject({
      installed: true,
      ready: true,
      needsOnboarding: false,
    });
  });
});
