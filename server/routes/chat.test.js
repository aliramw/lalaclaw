/* global describe, expect, it */
const { createChatHandler } = require('./chat');

describe('createChatHandler', () => {
  it('passes raw sessionUser values through to OpenClaw dispatch', async () => {
    const rawSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    let dispatchedSessionUser = '';
    let responseBody = null;
    const handleChat = createChatHandler({
      appendLocalSessionFileEntries: () => [],
      appendLocalSessionConversation: () => [],
      buildDashboardSnapshot: async () => ({
        session: { model: 'openai-codex/gpt-5.4' },
        conversation: [],
      }),
      callOpenClawGateway: async () => ({}),
      clearLocalSessionConversation: () => {},
      clearLocalSessionFileEntries: () => {},
      clip: (text, maxLength = 180) => String(text || '').slice(0, maxLength),
      config: { mode: 'openclaw', model: 'openai-codex/gpt-5.4' },
      delay: async () => {},
      dispatchOpenClaw: async (_messages, _fastMode, sessionUser) => {
        dispatchedSessionUser = sessionUser;
        return { outputText: '收到', usage: null };
      },
      dispatchOpenClawStream: async () => ({ outputText: '', usage: null }),
      formatTokenBadge: () => '',
      getCommandCenterSessionKey: () => '',
      getDefaultAgentId: () => 'main',
      getDefaultModelForAgent: () => 'openai-codex/gpt-5.4',
      getMessageAttachments: () => [],
      getSessionPreferences: () => ({}),
      normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
      normalizeSessionUser: (value) => value,
      parseFastCommand: () => null,
      parseModelCommand: () => null,
      parseRequestBody: async () => ({
        sessionUser: rawSessionUser,
        stream: false,
        messages: [{ role: 'user', content: '你你你', timestamp: 1773722986181 }],
      }),
      parseSessionResetCommand: () => null,
      parseSlashCommandState: () => null,
      resolveCanonicalModelId: (value) => value,
      resolveSessionAgentId: () => 'main',
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => 'openai-codex/gpt-5.4',
      resolveSessionThinkMode: () => 'off',
      sendJson: (_res, _status, body) => {
        responseBody = body;
      },
      setSessionPreferences: () => ({}),
      summarizeMessages: () => 'summary',
    });

    await handleChat({}, {});

    expect(dispatchedSessionUser).toBe(rawSessionUser);
    expect(responseBody.outputText).toBe('收到');
  });
});
