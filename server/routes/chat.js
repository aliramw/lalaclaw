function createMockReply(intent = '', clip) {
  return {
    outputText: [
      'OpenClaw command channel is online in mock mode.',
      `Current intent: ${clip(intent || 'No prompt supplied.', 160)}`,
    ].join('\n'),
    usage: null,
  };
}

function createChatHandler({
  appendLocalSessionConversation,
  buildDashboardSnapshot,
  callOpenClawGateway,
  clip,
  config,
  delay,
  dispatchOpenClaw,
  formatTokenBadge,
  getCommandCenterSessionKey,
  getDefaultAgentId,
  getDefaultModelForAgent,
  getMessageAttachments,
  getSessionPreferences,
  normalizeChatMessage,
  normalizeSessionUser,
  parseFastCommand,
  parseRequestBody,
  parseSessionResetCommand,
  parseSlashCommandState,
  resolveCanonicalModelId,
  resolveSessionAgentId,
  resolveSessionFastMode,
  resolveSessionModel,
  resolveSessionThinkMode,
  sendJson,
  setSessionPreferences,
  summarizeMessages,
}) {
  return async function handleChat(req, res) {
    try {
      const body = await parseRequestBody(req);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const fastMode = Boolean(body.fastMode);
      const sessionUser = normalizeSessionUser(body.sessionUser || 'command-center');
      const latestUserMessage = [...messages].reverse().find((message) => message?.role === 'user');
      const latestUserContent = normalizeChatMessage(latestUserMessage);
      const latestUserAttachments = getMessageAttachments(latestUserMessage);
      const resetCommand = parseSessionResetCommand(latestUserContent);
      const fastCommand = parseFastCommand(latestUserContent);
      const commandBody = latestUserContent.startsWith('/') ? latestUserContent : '';
      const slashCommandState = parseSlashCommandState(latestUserMessage?.content);
      const outboundMessages = latestUserMessage
        ? [{ role: 'user', content: latestUserContent, ...(latestUserAttachments.length ? { attachments: latestUserAttachments } : {}) }]
        : [];

      if (body.agentId || body.model) {
        const nextAgentId = String(body.agentId || resolveSessionAgentId(sessionUser)).trim() || getDefaultAgentId();
        const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);
        const requestedModel = typeof body.model === 'string' ? resolveCanonicalModelId(body.model) : '';
        const nextModel = requestedModel || resolveSessionModel(sessionUser, nextAgentId) || defaultModelForNextAgent;
        setSessionPreferences(sessionUser, {
          agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
          model: requestedModel && requestedModel !== defaultModelForNextAgent ? nextModel : undefined,
        });

        if (config.mode === 'openclaw') {
          const sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);
          await callOpenClawGateway('sessions.patch', {
            key: sessionKey,
            model: nextModel,
          });
          await delay(150);
        }
      }

      if (fastCommand) {
        const responseTimestamp = Date.now();
        if (fastCommand.action === 'on' || fastCommand.action === 'off') {
          setSessionPreferences(sessionUser, { fastMode: fastCommand.action === 'on' });
        }

        const fastEnabled = resolveSessionFastMode(sessionUser);
        const outputText =
          fastCommand.action === 'status'
            ? `Fast 当前${fastEnabled ? '已开启' : '已关闭'}。`
            : fastCommand.action === 'on'
              ? '已开启 fast。'
              : fastCommand.action === 'off'
                ? '已关闭 fast。'
                : '用法：/fast status|on|off';

        appendLocalSessionConversation(sessionUser, [
          {
            role: 'user',
            content: latestUserContent,
            timestamp: responseTimestamp - 1,
          },
          {
            role: 'assistant',
            content: outputText,
            timestamp: responseTimestamp,
          },
        ]);

        const snapshot = await buildDashboardSnapshot(sessionUser);
        snapshot.session.status = '已完成 / 标准';

        sendJson(res, 200, {
          ok: true,
          mode: config.mode,
          model: snapshot.session?.model || config.model,
          outputText,
          usage: null,
          tokenBadge: '',
          commandHandled: 'fast',
          metadata: {
            status: snapshot.session.status,
            summary: `fast: ${fastCommand.action}`,
          },
          ...snapshot,
        });
        return;
      }

      if (resetCommand) {
        const nextSessionUser = normalizeSessionUser(`${sessionUser}-${Date.now()}`);
        const currentPreferences = getSessionPreferences(sessionUser);
        setSessionPreferences(nextSessionUser, { ...currentPreferences });

        let outputText = '新会话已开始。直接说你要我干什么。';
        let usage = null;

        if (resetCommand.tail) {
          const resetReply =
            config.mode === 'openclaw'
              ? await dispatchOpenClaw([{ role: 'user', content: resetCommand.tail }], fastMode, nextSessionUser)
              : createMockReply(resetCommand.tail, clip);

          outputText = resetReply.outputText;
          usage = resetReply.usage;
        }

        appendLocalSessionConversation(
          nextSessionUser,
          resetCommand.tail
            ? [
                {
                  role: 'user',
                  content: resetCommand.tail,
                  timestamp: Date.now() - 1,
                },
                {
                  role: 'assistant',
                  content: outputText,
                  timestamp: Date.now(),
                  ...(usage ? { tokenBadge: formatTokenBadge(usage) } : {}),
                },
              ]
            : [
                {
                  role: 'assistant',
                  content: outputText,
                  timestamp: Date.now(),
                },
              ],
        );

        const snapshot = await buildDashboardSnapshot(nextSessionUser);
        snapshot.session.status = fastMode ? '已完成 / 快速' : '已完成 / 标准';

        sendJson(res, 200, {
          ok: true,
          mode: config.mode,
          model: snapshot.session?.model || config.model,
          outputText,
          usage,
          tokenBadge: formatTokenBadge(usage),
          resetSessionUser: nextSessionUser,
          commandHandled: resetCommand.kind,
          metadata: {
            status: snapshot.session.status,
            summary: resetCommand.tail ? `user: ${clip(resetCommand.tail, 72)}` : `${resetCommand.kind}: session reset`,
          },
          ...snapshot,
        });
        return;
      }

      const reply =
        config.mode === 'openclaw'
          ? await dispatchOpenClaw(outboundMessages, fastMode, sessionUser, { commandBody })
          : createMockReply(latestUserContent, clip);

      const nextFastMode = slashCommandState?.kind === 'fastMode' ? slashCommandState.value : fastMode;
      const nextThinkMode = slashCommandState?.kind === 'thinkMode' ? slashCommandState.value : resolveSessionThinkMode(sessionUser);
      setSessionPreferences(sessionUser, { fastMode: nextFastMode, thinkMode: nextThinkMode });

      const snapshot = await buildDashboardSnapshot(sessionUser);
      snapshot.session.status = nextFastMode ? '已完成 / 快速' : '已完成 / 标准';
      const resolvedModel = snapshot.session?.model || config.model;

      sendJson(res, 200, {
        ok: true,
        mode: config.mode,
        model: resolvedModel,
        outputText: reply.outputText,
        usage: reply.usage,
        tokenBadge: formatTokenBadge(reply.usage),
        metadata: {
          status: snapshot.session.status,
          summary: summarizeMessages(messages),
        },
        ...snapshot,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message || 'Unknown server error',
      });
    }
  };
}

module.exports = {
  createChatHandler,
};
