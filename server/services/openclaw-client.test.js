import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOpenClawClient, resolveOpenClawGatewaySdkArtifactsForPackageRoot } from './openclaw-client.ts';
import { buildOpenClawMessageContent, describeAttachmentForModel } from '../formatters/chat-format.ts';
const unavailableGatewaySdk = async () => {
  throw new Error('Gateway SDK unavailable in this test');
};

describe('createOpenClawClient', () => {
  it('does not mirror synthetic empty-response fallbacks back to DingTalk', async () => {
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
        json: async () => ({ ok: true, result: { messageId: 'msg-dingtalk-assistant-empty' } }),
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

          if (method === 'agent') {
            return {
              stdout: JSON.stringify({
                acceptedAt: 1773722999708,
                runId: 'run-dingtalk-empty-1',
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
                messages: [],
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

      const reply = await client.dispatchOpenClaw(
        [{ role: 'user', content: '测试钉钉空回复' }],
        false,
        rawSessionUser,
      );

      expect(reply.outputText).toBe('OpenClaw returned an empty response.');
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toEqual([]);
  });

  it('prefers stable plugin-sdk gateway runtime before legacy hashed reply bundles', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-sdk-stable-'));
    fs.mkdirSync(path.join(packageRoot, 'dist', 'plugin-sdk'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'dist', 'plugin-sdk', 'gateway-runtime.js'), 'export const GatewayClient = class {};\n');
    fs.writeFileSync(path.join(packageRoot, 'dist', 'plugin-sdk', 'cli-runtime.js'), 'export const VERSION = "2026.3.22";\n');
    fs.writeFileSync(path.join(packageRoot, 'dist', 'reply-payload-MXtGsVoh.js'), 'export const ignored = true;\n');

    expect(resolveOpenClawGatewaySdkArtifactsForPackageRoot(packageRoot)).toEqual({
      kind: 'stable',
      gatewayRuntimePath: path.join(packageRoot, 'dist', 'plugin-sdk', 'gateway-runtime.js'),
      cliRuntimePath: path.join(packageRoot, 'dist', 'plugin-sdk', 'cli-runtime.js'),
    });
  });

  it('falls back to the legacy hashed reply bundle when plugin-sdk runtime is unavailable', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-sdk-legacy-'));
    fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'dist', 'reply-AbCd1234.js'), 'export const legacy = true;\n');
    fs.writeFileSync(path.join(packageRoot, 'dist', 'reply-payload-MXtGsVoh.js'), 'export const ignored = true;\n');

    expect(resolveOpenClawGatewaySdkArtifactsForPackageRoot(packageRoot)).toEqual({
      kind: 'legacy',
      replyModulePath: path.join(packageRoot, 'dist', 'reply-AbCd1234.js'),
    });
  });

  it('keeps reset DingTalk sessions isolated from the delivery-routed gateway session', async () => {
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
      }),
    );
    expect(gatewayCalls[0].params.deliver).not.toBe(true);
    expect(gatewayCalls[0].params.channel).not.toBe('dingtalk-connector');
    expect(gatewayCalls[0].params.to).toBeUndefined();
    expect(gatewayCalls[0].params.accountId).toBeUndefined();
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

  it('mirrors final assistant replies back to DingTalk for delivery-routed text sessions', async () => {
    const rawSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
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
        json: async () => ({ ok: true, result: { messageId: 'msg-dingtalk-assistant-1' } }),
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
                runId: 'run-dingtalk-1',
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
                    content: '钉钉收到。',
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
        [{ role: 'user', content: '测试钉钉' }],
        true,
        rawSessionUser,
        { onDelta: () => {} },
      );

      expect(reply.outputText).toBe('钉钉收到。');
    } finally {
      global.fetch = originalFetch;
    }

    expect(gatewayCalls.map((entry) => entry.method)).toEqual(['agent', 'agent.wait', 'chat.history']);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:3000/tools/invoke');
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'dingtalk-connector',
        target: 'user:398058',
        accountId: '__default__',
        message: '钉钉收到。',
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

  it('uses direct multimodal HTTP requests for Feishu sessions with image attachments and mirrors the assistant reply back', async () => {
    const feishuSessionKey = 'agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58';
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      const parsedBody = options.body ? JSON.parse(options.body) : null;
      fetchCalls.push({
        body: parsedBody,
        url: String(url),
      });

      if (String(url) === 'http://127.0.0.1:3000/v1/responses') {
        return {
          ok: true,
          body: null,
          json: async () => ({
            output_text: '我看到一张人物头像插画。',
            usage: { total_tokens: 18 },
          }),
        };
      }

      if (String(url) === 'http://127.0.0.1:3000/tools/invoke') {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { messageId: 'msg-feishu-assistant-1' } }),
        };
      }

      throw new Error(`Unexpected fetch url: ${String(url)}`);
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
          throw new Error('execFileAsync should not be used for direct multimodal Feishu requests');
        },
        PROJECT_ROOT: process.cwd(),
        OPENCLAW_BIN: 'openclaw',
        clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
        normalizeSessionUser: (value) => String(value || '').trim(),
        normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
        getMessageAttachments: (message) => message?.attachments || [],
        describeAttachmentForModel,
        buildOpenClawMessageContent,
        getCommandCenterSessionKey: (_agentId, sessionUser) => String(sessionUser || '').trim(),
        resolveSessionAgentId: () => 'main',
        resolveSessionModel: () => 'openai-codex/gpt-5.4',
        readTextIfExists: () => '',
        tailLines: () => [],
        loadGatewaySdk: unavailableGatewaySdk,
      });

      const reply = await client.dispatchOpenClawStream(
        [
          {
            role: 'user',
            content: '看到啥',
            attachments: [
              {
                kind: 'image',
                name: 'avatar.png',
                dataUrl: 'data:image/png;base64,AAAA',
                fullPath: '/Users/marila/.openclaw/workspace/test/avatar.png',
              },
            ],
          },
        ],
        false,
        feishuSessionKey,
        { onDelta: () => {} },
      );

      expect(reply).toEqual({
        outputText: '我看到一张人物头像插画。',
        usage: { total_tokens: 18 },
      });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:3000/v1/responses');
    expect(fetchCalls[0].body).toMatchObject({
      model: 'openai-codex/gpt-5.4',
      stream: true,
      input: [
        expect.objectContaining({ role: 'system' }),
        {
          role: 'user',
          content: [
            { type: 'input_text', text: '看到啥' },
            {
              type: 'input_text',
              text: '附件 avatar.png 已附加。\n路径: /Users/marila/.openclaw/workspace/test/avatar.png',
            },
            { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
          ],
        },
      ],
    });
    expect(fetchCalls[1].url).toBe('http://127.0.0.1:3000/tools/invoke');
    expect(fetchCalls[1].body).toEqual({
      action: 'send',
      args: {
        channel: 'feishu',
        target: 'user:ou_d249239ddfd11c4c3c4f5f1581c97a58',
        accountId: 'default',
        message: '我看到一张人物头像插画。',
      },
      sessionKey: feishuSessionKey,
      tool: 'message',
    });
  });

  it('delivers native Weixin session messages through the agent gateway route', async () => {
    const weixinSessionKey = 'agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat';
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
              runId: 'run-weixin-1',
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
                  content: '微信收到。',
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
      [{ role: 'user', content: '测试微信' }],
      true,
      weixinSessionKey,
      { onDelta: () => {} },
    );

    expect(reply.outputText).toBe('微信收到。');
    expect(gatewayCalls[0].params).toEqual(
      expect.objectContaining({
        sessionKey: weixinSessionKey,
        deliver: true,
        channel: 'openclaw-weixin',
        to: 'o9cq807-naavqdpr-tmdjv3v8bck@im.wechat',
      }),
    );
    expect(gatewayCalls[0].params.accountId).toBeUndefined();
  });

  it('mirrors user messages to Weixin through the message tool', async () => {
    const weixinSessionKey = 'agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat';
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-weixin-1' } }),
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

      await client.mirrorOpenClawUserMessage(weixinSessionKey, '测试微信', { operatorName: 'marila' });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'openclaw-weixin',
        target: 'o9cq807-naavqdpr-tmdjv3v8bck@im.wechat',
        message: 'marila：测试微信',
      },
      sessionKey: weixinSessionKey,
      tool: 'message',
    });
  });

  it('preserves explicit Weixin account ids when the session identity provides one', async () => {
    const rawSessionUser = JSON.stringify({
      accountid: '2874cd142f52-im-bot',
      channel: 'openclaw-weixin',
      chattype: 'direct',
      peerid: 'o9cq807-naavqdpr-tmdjv3v8bck@im.wechat',
    });
    const originalFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({
        body: options.body ? JSON.parse(options.body) : null,
        url: String(url),
      });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { messageId: 'msg-weixin-explicit-account-1' } }),
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

      await client.mirrorOpenClawUserMessage(rawSessionUser, '测试微信', { operatorName: 'marila' });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toEqual({
      action: 'send',
      args: {
        channel: 'openclaw-weixin',
        target: 'o9cq807-naavqdpr-tmdjv3v8bck@im.wechat',
        accountId: '2874cd142f52-im-bot',
        message: 'marila：测试微信',
      },
      sessionKey: rawSessionUser,
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

  it('tolerates noisy gateway stdout while polling WeCom delivery sessions', async () => {
    const wecomSessionKey = 'agent:main:wecom:direct:marila';
    const gatewayCalls = [];
    const noisyJson = (payload) => `[wecom] v1.0.13 loaded\n${JSON.stringify(payload)}`;
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
            stdout: noisyJson({
              acceptedAt: 1773722999708,
              runId: 'run-wecom-noisy-1',
            }),
          };
        }

        if (method === 'agent.wait') {
          return {
            stdout: noisyJson({
              status: 'completed',
            }),
          };
        }

        if (method === 'chat.history') {
          return {
            stdout: noisyJson({
              messages: [
                {
                  role: 'assistant',
                  content: '企业微信带噪声 JSON 收到。',
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
      [{ role: 'user', content: '测试企业微信带噪声 JSON' }],
      true,
      wecomSessionKey,
      { onDelta: () => {} },
    );

    expect(reply.outputText).toBe('企业微信带噪声 JSON 收到。');
    expect(gatewayCalls.map((entry) => entry.method)).toEqual(['agent', 'agent.wait', 'chat.history']);
  });

  it('uses the gateway agent request for WeCom event streams instead of chat.send delivery params', async () => {
    const wecomSessionKey = 'agent:main:wecom:direct:marila';
    const requestCalls = [];
    const clientLifecycle = [];
    const execCalls = [];

    class MockGatewayClient {
      constructor(options) {
        this.options = options;
      }

      start() {
        clientLifecycle.push('start');
        this.options.onHelloOk?.();
      }

      async request(method, params) {
        requestCalls.push({ method, params });
        if (method !== 'agent') {
          throw new Error(`Unexpected gateway request method: ${method}`);
        }

        const runId = String(params.idempotencyKey || 'run-wecom-event-1');
        this.options.onEvent?.({
          event: 'chat',
          payload: {
            sessionKey: params.sessionKey,
            runId,
            state: 'delta',
            message: { role: 'assistant', content: '企业微信事件流' },
          },
        });
        this.options.onEvent?.({
          event: 'chat',
          payload: {
            sessionKey: params.sessionKey,
            runId,
            state: 'final',
            message: { role: 'assistant', content: '企业微信事件流收到。' },
          },
        });

        return {
          acceptedAt: 1773722999708,
          runId,
        };
      }

      stop() {
        clientLifecycle.push('stop');
      }
    }

    const result = await createOpenClawClient({
      config: {
        apiKey: '',
        apiPath: '/v1/responses',
        apiStyle: 'responses',
        baseUrl: 'http://127.0.0.1:3000',
        mode: 'openclaw',
      },
      execFileAsync: async (_bin, args) => {
        const method = args?.[5];
        execCalls.push(method || 'exec');
        if (method === 'chat.history') {
          return {
            stdout: JSON.stringify({
              messages: [
                {
                  role: 'assistant',
                  content: '企业微信事件流收到。',
                  timestamp: 1773723000000,
                },
              ],
            }),
          };
        }
        throw new Error(`Unexpected CLI fallback method: ${method || 'unknown'}`);
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
      loadGatewaySdk: async () => ({
        GatewayClient: MockGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: 'gateway-client' },
        GATEWAY_CLIENT_MODES: { BACKEND: 'backend' },
        VERSION: 'test',
      }),
    }).dispatchOpenClawStream(
      [{ role: 'user', content: '测试企业微信事件流' }],
      true,
      wecomSessionKey,
      { onDelta: () => {} },
    );

    expect(result.outputText).toBe('企业微信事件流收到。');
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]).toEqual(
      expect.objectContaining({
        method: 'agent',
        params: expect.objectContaining({
          sessionKey: wecomSessionKey,
          deliver: true,
          channel: 'wecom',
          to: 'wecom:marila',
          accountId: 'default',
          lane: 'nested',
        }),
      }),
    );
    expect(clientLifecycle).toEqual(['start', 'stop']);
    expect(execCalls).toEqual(['chat.history']);
  });

  it('marks gateway subscriptions ready only after the hello handshake succeeds', async () => {
    let clientOptions = null;

    class MockGatewayClient {
      constructor(options) {
        clientOptions = options;
      }

      start() {}

      stop() {}
    }

    const readySpy = vi.fn();
    const client = createOpenClawClient({
      config: {
        apiKey: '',
        apiPath: '/v1/responses',
        apiStyle: 'responses',
        baseUrl: 'http://127.0.0.1:3000',
        mode: 'openclaw',
      },
      execFileAsync: async () => {
        throw new Error('execFileAsync should not be used for gateway subscriptions');
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
      loadGatewaySdk: async () => ({
        GatewayClient: MockGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: 'gateway-client' },
        GATEWAY_CLIENT_MODES: { BACKEND: 'backend' },
        VERSION: 'test',
      }),
    });

    const subscription = client.subscribeGatewayEvents({ onReady: readySpy });
    await Promise.resolve();
    await Promise.resolve();

    expect(clientOptions).toBeTruthy();
    expect(readySpy).not.toHaveBeenCalled();

    clientOptions.onHelloOk?.();
    expect(readySpy).toHaveBeenCalledTimes(1);

    clientOptions.onEvent?.({ event: 'chat', payload: { state: 'delta' } });
    expect(readySpy).toHaveBeenCalledTimes(1);

    subscription.stop();
  });
});
