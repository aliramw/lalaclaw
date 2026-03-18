/* global describe, expect, it */
const { createOpenClawClient } = require('./openclaw-client');
const unavailableGatewaySdk = async () => {
  throw new Error('Gateway SDK unavailable in this test');
};

describe('createOpenClawClient', () => {
  it('delivers DingTalk session messages through the agent gateway route', async () => {
    const rawSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058:reset:1773319871765","sendername":"马锐拉"}';
    const gatewayCalls = [];
    const client = createOpenClawClient({
      config: {
        apiKey: '',
        apiPath: '/v1/responses',
        apiStyle: 'responses',
        baseUrl: 'http://127.0.0.1:3000',
        mode: 'openclaw',
      },
      execFileAsync: async (_bin, args) => {
        const method = args[5];
        const params = JSON.parse(args[10]);
        const timeout = Number(args[12]);
        gatewayCalls.push({ method, params, timeout });

        if (method === 'agent') {
          return {
            stdout: JSON.stringify({
              acceptedAt: 1773722999708,
              runId: 'run-1',
            }),
          };
        }

        if (method === 'agent.wait') {
          return {
            stdout: JSON.stringify({
              status: 'completed',
            }),
          };
        }

        if (method === 'chat.history') {
          return {
            stdout: JSON.stringify({
              messages: [
                {
                  role: 'assistant',
                  content: '在。你说。',
                  timestamp: 1773723000000,
                },
              ],
            }),
          };
        }

        throw new Error(`Unexpected gateway method: ${method}`);
      },
      PROJECT_ROOT: process.cwd(),
      OPENCLAW_BIN: 'openclaw',
      clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
      normalizeSessionUser: (value) => String(value || '').trim(),
      normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
      getMessageAttachments: () => [],
      describeAttachmentForModel: () => '',
      buildOpenClawMessageContent: () => [],
      getCommandCenterSessionKey: (agentId, sessionUser) => `agent:${agentId}:openai-user:${sessionUser}`,
      resolveSessionAgentId: () => 'main',
      resolveSessionModel: () => 'openai-codex/gpt-5.4',
      readTextIfExists: () => '',
      tailLines: () => [],
      loadGatewaySdk: unavailableGatewaySdk,
    });

    const reply = await client.dispatchOpenClawStream(
      [{ role: 'user', content: '你你你' }],
      true,
      rawSessionUser,
      { onDelta: () => {} },
    );

    expect(reply.outputText).toBe('在。你说。');
    expect(gatewayCalls.map((entry) => entry.method)).toEqual(['agent', 'agent.wait', 'chat.history']);
    expect(gatewayCalls[0].params).toEqual(
      expect.objectContaining({
        sessionKey: `agent:main:openai-user:${rawSessionUser}`,
        deliver: true,
        channel: 'dingtalk-connector',
        to: 'user:398058',
        accountId: '__default__',
      }),
    );
    expect(gatewayCalls[1]).toEqual(
      expect.objectContaining({
        method: 'agent.wait',
        params: expect.objectContaining({
          runId: 'run-1',
          timeoutMs: 900,
        }),
        timeout: 10000,
      }),
    );
  });

  it('mirrors user messages to DingTalk through the message tool', async () => {
    const rawSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-1' } }),
      };
    };

    try {
      const client = createOpenClawClient({
        config: {
          apiKey: '',
          apiPath: '/v1/responses',
          apiStyle: 'responses',
          baseUrl: 'http://127.0.0.1:3000',
          mode: 'openclaw',
        },
        execFileAsync: async () => {
          throw new Error('execFileAsync should not be used for mirrored user messages');
        },
        PROJECT_ROOT: process.cwd(),
        OPENCLAW_BIN: 'openclaw',
        clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
        normalizeSessionUser: (value) => String(value || '').trim(),
        normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
        getMessageAttachments: () => [],
        describeAttachmentForModel: () => '',
        buildOpenClawMessageContent: () => [],
        getCommandCenterSessionKey: (agentId, sessionUser) => `agent:${agentId}:openai-user:${sessionUser}`,
        resolveSessionAgentId: () => 'main',
        resolveSessionModel: () => 'openai-codex/gpt-5.4',
        readTextIfExists: () => '',
        tailLines: () => [],
        loadGatewaySdk: unavailableGatewaySdk,
      });

      await client.mirrorOpenClawUserMessage(rawSessionUser, '你你你');
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:3000/tools/invoke');
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'dingtalk-connector',
        target: 'user:398058',
        accountId: '__default__',
        message: '马锐拉：你你你',
      },
      sessionKey: `agent:main:openai-user:${rawSessionUser}`,
      tool: 'message',
    });
  });

  it('delivers native Feishu session messages through the agent gateway route', async () => {
    const feishuSessionKey = 'agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58';
    const gatewayCalls = [];
    const client = createOpenClawClient({
      config: {
        apiKey: '',
        apiPath: '/v1/responses',
        apiStyle: 'responses',
        baseUrl: 'http://127.0.0.1:3000',
        mode: 'openclaw',
      },
      execFileAsync: async (_bin, args) => {
        const method = args[5];
        const params = JSON.parse(args[10]);
        gatewayCalls.push({ method, params });

        if (method === 'agent') {
          return {
            stdout: JSON.stringify({
              acceptedAt: 1773722999708,
              runId: 'run-feishu-1',
            }),
          };
        }

        if (method === 'agent.wait') {
          return {
            stdout: JSON.stringify({
              status: 'completed',
            }),
          };
        }

        if (method === 'chat.history') {
          return {
            stdout: JSON.stringify({
              messages: [
                {
                  role: 'assistant',
                  content: '飞书收到。',
                  timestamp: 1773723000000,
                },
              ],
            }),
          };
        }

        throw new Error(`Unexpected gateway method: ${method}`);
      },
      PROJECT_ROOT: process.cwd(),
      OPENCLAW_BIN: 'openclaw',
      clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
      normalizeSessionUser: (value) => String(value || '').trim(),
      normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
      getMessageAttachments: () => [],
      describeAttachmentForModel: () => '',
      buildOpenClawMessageContent: () => [],
      getCommandCenterSessionKey: (_agentId, sessionUser) => String(sessionUser || '').trim(),
      resolveSessionAgentId: () => 'main',
      resolveSessionModel: () => 'openai-codex/gpt-5.4',
      readTextIfExists: () => '',
      tailLines: () => [],
      loadGatewaySdk: unavailableGatewaySdk,
    });

    const reply = await client.dispatchOpenClawStream(
      [{ role: 'user', content: '测试飞书' }],
      true,
      feishuSessionKey,
      { onDelta: () => {} },
    );

    expect(reply.outputText).toBe('飞书收到。');
    expect(gatewayCalls[0].params).toEqual(
      expect.objectContaining({
        sessionKey: feishuSessionKey,
        deliver: true,
        channel: 'feishu',
        to: 'user:ou_d249239ddfd11c4c3c4f5f1581c97a58',
        accountId: 'default',
      }),
    );
  });

  it('mirrors user messages to Feishu through the message tool', async () => {
    const feishuSessionKey = 'agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58';
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-feishu-1' } }),
      };
    };

    try {
      const client = createOpenClawClient({
        config: {
          apiKey: '',
          apiPath: '/v1/responses',
          apiStyle: 'responses',
          baseUrl: 'http://127.0.0.1:3000',
          mode: 'openclaw',
        },
        execFileAsync: async () => {
          throw new Error('execFileAsync should not be used for mirrored user messages');
        },
        PROJECT_ROOT: process.cwd(),
        OPENCLAW_BIN: 'openclaw',
        clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
        normalizeSessionUser: (value) => String(value || '').trim(),
        normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
        getMessageAttachments: () => [],
        describeAttachmentForModel: () => '',
        buildOpenClawMessageContent: () => [],
        getCommandCenterSessionKey: (_agentId, sessionUser) => String(sessionUser || '').trim(),
        resolveSessionAgentId: () => 'main',
        resolveSessionModel: () => 'openai-codex/gpt-5.4',
        readTextIfExists: () => '',
        tailLines: () => [],
        loadGatewaySdk: unavailableGatewaySdk,
      });

      await client.mirrorOpenClawUserMessage(feishuSessionKey, '测试飞书', { operatorName: 'marila' });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'feishu',
        target: 'user:ou_d249239ddfd11c4c3c4f5f1581c97a58',
        accountId: 'default',
        message: 'marila：测试飞书',
      },
      sessionKey: feishuSessionKey,
      tool: 'message',
    });
  });

  it('keeps reset Feishu sessions isolated while still delivering to the original peer', async () => {
    const resetFeishuSessionUser = 'feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58:reset:1773737000000';
    const gatewayCalls = [];
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-feishu-reset-1' } }),
      };
    };

    try {
      const client = createOpenClawClient({
        config: {
          apiKey: '',
          apiPath: '/v1/responses',
          apiStyle: 'responses',
          baseUrl: 'http://127.0.0.1:3000',
          mode: 'openclaw',
        },
        execFileAsync: async (_bin, args) => {
          const method = args[5];
          const params = JSON.parse(args[10]);
          gatewayCalls.push({ method, params });

          if (method === 'agent') {
            return {
              stdout: JSON.stringify({
                acceptedAt: 1773722999708,
                runId: 'run-feishu-reset-1',
              }),
            };
          }

          if (method === 'agent.wait') {
            return {
              stdout: JSON.stringify({
                status: 'completed',
              }),
            };
          }

          if (method === 'chat.history') {
            return {
              stdout: JSON.stringify({
                messages: [
                  {
                    role: 'assistant',
                    content: '新的飞书会话收到。',
                    timestamp: 1773723000000,
                  },
                ],
              }),
            };
          }

          throw new Error(`Unexpected gateway method: ${method}`);
        },
        PROJECT_ROOT: process.cwd(),
        OPENCLAW_BIN: 'openclaw',
        clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
        normalizeSessionUser: (value) => String(value || '').trim(),
        normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
        getMessageAttachments: () => [],
        describeAttachmentForModel: () => '',
        buildOpenClawMessageContent: () => [],
        getCommandCenterSessionKey: (agentId, sessionUser) => `agent:${agentId}:openai-user:${sessionUser}`,
        resolveSessionAgentId: () => 'main',
        resolveSessionModel: () => 'openai-codex/gpt-5.4',
        readTextIfExists: () => '',
        tailLines: () => [],
        loadGatewaySdk: unavailableGatewaySdk,
      });

      const reply = await client.dispatchOpenClawStream(
        [{ role: 'user', content: '飞书新会话测试' }],
        true,
        resetFeishuSessionUser,
        { onDelta: () => {} },
      );

      await client.mirrorOpenClawUserMessage(resetFeishuSessionUser, '飞书新会话测试', { operatorName: 'marila' });

      expect(reply.outputText).toBe('新的飞书会话收到。');
    } finally {
      global.fetch = originalFetch;
    }

    expect(gatewayCalls[0].params).toEqual(
      expect.objectContaining({
        sessionKey: `agent:main:openai-user:${resetFeishuSessionUser}`,
        deliver: true,
        channel: 'feishu',
        to: 'user:ou_d249239ddfd11c4c3c4f5f1581c97a58',
        accountId: 'default',
      }),
    );
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'feishu',
        target: 'user:ou_d249239ddfd11c4c3c4f5f1581c97a58',
        accountId: 'default',
        message: 'marila：飞书新会话测试',
      },
      sessionKey: `agent:main:openai-user:${resetFeishuSessionUser}`,
      tool: 'message',
    });
  });

  it('delivers native WeCom session messages through the agent gateway route', async () => {
    const wecomSessionKey = 'agent:main:wecom:direct:marila';
    const gatewayCalls = [];
    const client = createOpenClawClient({
      config: {
        apiKey: '',
        apiPath: '/v1/responses',
        apiStyle: 'responses',
        baseUrl: 'http://127.0.0.1:3000',
        mode: 'openclaw',
      },
      execFileAsync: async (_bin, args) => {
        const method = args[5];
        const params = JSON.parse(args[10]);
        gatewayCalls.push({ method, params });

        if (method === 'agent') {
          return {
            stdout: JSON.stringify({
              acceptedAt: 1773722999708,
              runId: 'run-wecom-1',
            }),
          };
        }

        if (method === 'agent.wait') {
          return {
            stdout: JSON.stringify({
              status: 'completed',
            }),
          };
        }

        if (method === 'chat.history') {
          return {
            stdout: JSON.stringify({
              messages: [
                {
                  role: 'assistant',
                  content: '企业微信收到。',
                  timestamp: 1773723000000,
                },
              ],
            }),
          };
        }

        throw new Error(`Unexpected gateway method: ${method}`);
      },
      PROJECT_ROOT: process.cwd(),
      OPENCLAW_BIN: 'openclaw',
      clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
      normalizeSessionUser: (value) => String(value || '').trim(),
      normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
      getMessageAttachments: () => [],
      describeAttachmentForModel: () => '',
      buildOpenClawMessageContent: () => [],
      getCommandCenterSessionKey: (_agentId, sessionUser) => String(sessionUser || '').trim(),
      resolveSessionAgentId: () => 'main',
      resolveSessionModel: () => 'openai-codex/gpt-5.4',
      readTextIfExists: () => '',
      tailLines: () => [],
      loadGatewaySdk: unavailableGatewaySdk,
    });

    const reply = await client.dispatchOpenClawStream(
      [{ role: 'user', content: '测试企业微信' }],
      true,
      wecomSessionKey,
      { onDelta: () => {} },
    );

    expect(reply.outputText).toBe('企业微信收到。');
    expect(gatewayCalls[0].params).toEqual(
      expect.objectContaining({
        sessionKey: wecomSessionKey,
        deliver: true,
        channel: 'wecom',
        to: 'wecom:marila',
        accountId: 'default',
      }),
    );
  });

  it('mirrors user messages to WeCom through the message tool', async () => {
    const wecomSessionKey = 'agent:main:wecom:direct:marila';
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-wecom-1' } }),
      };
    };

    try {
      const client = createOpenClawClient({
        config: {
          apiKey: '',
          apiPath: '/v1/responses',
          apiStyle: 'responses',
          baseUrl: 'http://127.0.0.1:3000',
          mode: 'openclaw',
        },
        execFileAsync: async () => {
          throw new Error('execFileAsync should not be used for mirrored user messages');
        },
        PROJECT_ROOT: process.cwd(),
        OPENCLAW_BIN: 'openclaw',
        clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
        normalizeSessionUser: (value) => String(value || '').trim(),
        normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
        getMessageAttachments: () => [],
        describeAttachmentForModel: () => '',
        buildOpenClawMessageContent: () => [],
        getCommandCenterSessionKey: (_agentId, sessionUser) => String(sessionUser || '').trim(),
        resolveSessionAgentId: () => 'main',
        resolveSessionModel: () => 'openai-codex/gpt-5.4',
        readTextIfExists: () => '',
        tailLines: () => [],
        loadGatewaySdk: unavailableGatewaySdk,
      });

      await client.mirrorOpenClawUserMessage(wecomSessionKey, '测试企业微信', { operatorName: 'marila' });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'wecom',
        target: 'wecom:marila',
        accountId: 'default',
        message: 'marila：测试企业微信',
      },
      sessionKey: wecomSessionKey,
      tool: 'message',
    });
  });

  it('keeps reset WeCom sessions isolated while still delivering to the original peer', async () => {
    const resetWecomSessionUser = 'wecom:direct:marila:reset:1773737000000';
    const gatewayCalls = [];
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-wecom-reset-1' } }),
      };
    };

    try {
      const client = createOpenClawClient({
        config: {
          apiKey: '',
          apiPath: '/v1/responses',
          apiStyle: 'responses',
          baseUrl: 'http://127.0.0.1:3000',
          mode: 'openclaw',
        },
        execFileAsync: async (_bin, args) => {
          const method = args[5];
          const params = JSON.parse(args[10]);
          gatewayCalls.push({ method, params });

          if (method === 'agent') {
            return {
              stdout: JSON.stringify({
                acceptedAt: 1773722999708,
                runId: 'run-wecom-reset-1',
              }),
            };
          }

          if (method === 'agent.wait') {
            return {
              stdout: JSON.stringify({
                status: 'completed',
              }),
            };
          }

          if (method === 'chat.history') {
            return {
              stdout: JSON.stringify({
                messages: [
                  {
                    role: 'assistant',
                    content: '新的企业微信会话收到。',
                    timestamp: 1773723000000,
                  },
                ],
              }),
            };
          }

          throw new Error(`Unexpected gateway method: ${method}`);
        },
        PROJECT_ROOT: process.cwd(),
        OPENCLAW_BIN: 'openclaw',
        clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
        normalizeSessionUser: (value) => String(value || '').trim(),
        normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
        getMessageAttachments: () => [],
        describeAttachmentForModel: () => '',
        buildOpenClawMessageContent: () => [],
        getCommandCenterSessionKey: (agentId, sessionUser) => `agent:${agentId}:openai-user:${sessionUser}`,
        resolveSessionAgentId: () => 'main',
        resolveSessionModel: () => 'openai-codex/gpt-5.4',
        readTextIfExists: () => '',
        tailLines: () => [],
        loadGatewaySdk: unavailableGatewaySdk,
      });

      const reply = await client.dispatchOpenClawStream(
        [{ role: 'user', content: '企业微信新会话测试' }],
        true,
        resetWecomSessionUser,
        { onDelta: () => {} },
      );

      await client.mirrorOpenClawUserMessage(resetWecomSessionUser, '企业微信新会话测试', { operatorName: 'marila' });

      expect(reply.outputText).toBe('新的企业微信会话收到。');
    } finally {
      global.fetch = originalFetch;
    }

    expect(gatewayCalls[0].params).toEqual(
      expect.objectContaining({
        sessionKey: `agent:main:openai-user:${resetWecomSessionUser}`,
        deliver: true,
        channel: 'wecom',
        to: 'wecom:marila',
        accountId: 'default',
      }),
    );
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'wecom',
        target: 'wecom:marila',
        accountId: 'default',
        message: 'marila：企业微信新会话测试',
      },
      sessionKey: `agent:main:openai-user:${resetWecomSessionUser}`,
      tool: 'message',
    });
  });
});
