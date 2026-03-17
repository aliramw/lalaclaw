/* global describe, expect, it */
const { createOpenClawClient } = require('./openclaw-client');

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
        gatewayCalls.push({ method, params });

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
  });
});
