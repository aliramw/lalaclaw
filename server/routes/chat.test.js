import { describe, expect, it } from 'vitest';
import { createChatHandler } from './chat.ts';

describe('createChatHandler', () => {
  it('passes raw sessionUser values through to OpenClaw dispatch', async () => {
    const rawSessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    let dispatchedSessionUser = '';
    const mirroredMessages = [];
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
      mirrorOpenClawUserMessage: async (sessionUser, messageText) => {
        mirroredMessages.push({ sessionUser, messageText });
        return { ok: true };
      },
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
    expect(mirroredMessages).toEqual([
      {
        sessionUser: rawSessionUser,
        messageText: '你你你',
      },
    ]);
    expect(responseBody.outputText).toBe('收到');
  });

  it('passes the operator name when mirroring Feishu session messages', async () => {
    const feishuSessionKey = 'agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58';
    const mirroredMessages = [];
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
      dispatchOpenClaw: async () => ({ outputText: '收到', usage: null }),
      dispatchOpenClawStream: async () => ({ outputText: '', usage: null }),
      formatTokenBadge: () => '',
      getCommandCenterSessionKey: () => '',
      getDefaultAgentId: () => 'main',
      getDefaultModelForAgent: () => 'openai-codex/gpt-5.4',
      getMessageAttachments: () => [],
      getSessionPreferences: () => ({}),
      mirrorOpenClawUserMessage: async (sessionUser, messageText, options) => {
        mirroredMessages.push({ sessionUser, messageText, options });
        return { ok: true };
      },
      normalizeChatMessage: (message) => String(message?.content || message || '').trim(),
      normalizeSessionUser: (value) => value,
      parseFastCommand: () => null,
      parseModelCommand: () => null,
      parseRequestBody: async () => ({
        sessionUser: feishuSessionKey,
        userLabel: 'marila',
        stream: false,
        messages: [{ role: 'user', content: '测试飞书', timestamp: 1773722986181 }],
      }),
      parseSessionResetCommand: () => null,
      parseSlashCommandState: () => null,
      resolveCanonicalModelId: (value) => value,
      resolveSessionAgentId: () => 'main',
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => 'openai-codex/gpt-5.4',
      resolveSessionThinkMode: () => 'off',
      sendJson: () => {},
      setSessionPreferences: () => ({}),
      summarizeMessages: () => 'summary',
    });

    await handleChat({}, {});

    expect(mirroredMessages).toEqual([
      {
        sessionUser: feishuSessionKey,
        messageText: '测试飞书',
        options: { operatorName: 'marila' },
      },
    ]);
  });
});
