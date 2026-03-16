function createMockReply(intent = '', clip) {
  return {
    outputText: [
      'OpenClaw command channel is online in mock mode.',
      `Current intent: ${clip(intent || 'No prompt supplied.', 160)}`,
    ].join('\n'),
    usage: null,
  };
}

function createChatStopHandler({
  callOpenClawGateway,
  config,
  getCommandCenterSessionKey,
  normalizeSessionUser,
  parseRequestBody,
  resolveSessionAgentId,
  sendJson,
}) {
  return async function handleChatStop(req, res) {
    try {
      const body = await parseRequestBody(req);
      const sessionUser = normalizeSessionUser(body.sessionUser || 'command-center');
      const requestedAgentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
      const agentId = requestedAgentId || resolveSessionAgentId(sessionUser);

      if (config.mode === 'openclaw') {
        await callOpenClawGateway('chat.abort', {
          sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
        });
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message || 'Unknown server error',
      });
    }
  };
}

function createChatHandler({
  appendLocalSessionFileEntries,
  appendLocalSessionConversation,
  buildDashboardSnapshot,
  callOpenClawGateway,
  clip,
  config,
  delay,
  dispatchOpenClaw,
  dispatchOpenClawStream,
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
  function startChatStream(res) {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  function writeChatStreamEvent(res, payload) {
    res.write(`${JSON.stringify(payload)}\n`);
  }

  async function patchOpenClawSession(callOpenClawGateway, delay, sessionKey, updates = {}) {
    if (updates.model) {
      await callOpenClawGateway('sessions.patch', {
        key: sessionKey,
        model: updates.model,
      });
      await delay(150);
    }

    if (updates.thinkingLevel) {
      await callOpenClawGateway('sessions.patch', {
        key: sessionKey,
        thinkingLevel: updates.thinkingLevel,
      });
      await delay(150);
    }
  }

  return async function handleChat(req, res) {
    let sessionKey = '';
    let replySettled = false;
    let clientDisconnected = false;
    const markClientDisconnected = () => {
      clientDisconnected = true;
    };

    req.once?.('aborted', markClientDisconnected);
    res.once?.('close', markClientDisconnected);

    try {
      const body = await parseRequestBody(req);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const shouldStream = body.stream !== false;
      const fastMode = Boolean(body.fastMode);
      const sessionUser = normalizeSessionUser(body.sessionUser || 'command-center');
      const assistantMessageId = typeof body.assistantMessageId === 'string' && body.assistantMessageId.trim()
        ? body.assistantMessageId.trim()
        : `msg-assistant-${Date.now()}`;
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
      const requestTimestamp = Number(latestUserMessage?.timestamp) || Date.now();

      if (latestUserMessage) {
        appendLocalSessionFileEntries(sessionUser, [
          {
            role: 'user',
            content: latestUserContent,
            timestamp: requestTimestamp,
            attachments: latestUserAttachments,
          },
        ]);
      }

      if (fastCommand) {
        const responseTimestamp = requestTimestamp || Date.now();
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

      const currentPreferences = getSessionPreferences(sessionUser);
      const currentAgentId = resolveSessionAgentId(sessionUser);
      const nextAgentId = body.agentId ? String(body.agentId).trim() || currentAgentId : currentAgentId;
      sessionKey = getCommandCenterSessionKey(nextAgentId, sessionUser);
      const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);
      const nextFastMode = slashCommandState?.kind === 'fastMode' ? slashCommandState.value : fastMode;
      const nextThinkMode = slashCommandState?.kind === 'thinkMode' ? slashCommandState.value : resolveSessionThinkMode(sessionUser);
      const requestedModel = typeof body.model === 'string' ? resolveCanonicalModelId(body.model) : '';

      let nextModel = resolveSessionModel(sessionUser, currentAgentId);
      let shouldPersistModel = Boolean(currentPreferences.model);

      if (nextAgentId !== currentAgentId && !body.model) {
        nextModel = defaultModelForNextAgent;
        shouldPersistModel = false;
      }

      if (body.model) {
        nextModel = requestedModel || defaultModelForNextAgent;
        shouldPersistModel = Boolean(requestedModel) && requestedModel !== defaultModelForNextAgent;
      }

      const shouldPatchModel = nextAgentId !== currentAgentId || nextModel !== resolveSessionModel(sessionUser, currentAgentId);
      const shouldPatchThinkMode = slashCommandState?.kind === 'thinkMode' && nextThinkMode !== resolveSessionThinkMode(sessionUser);
      const nextPreferences = {
        agentId: nextAgentId === getDefaultAgentId() ? undefined : nextAgentId,
        model: shouldPersistModel ? nextModel : undefined,
        fastMode: nextFastMode,
        thinkMode: nextThinkMode,
      };

      if (config.mode === 'openclaw' && (shouldPatchModel || shouldPatchThinkMode)) {
        await patchOpenClawSession(
          callOpenClawGateway,
          delay,
          getCommandCenterSessionKey(nextAgentId, sessionUser),
          {
            ...(shouldPatchModel ? { model: nextModel } : {}),
            ...(shouldPatchThinkMode ? { thinkingLevel: nextThinkMode } : {}),
          },
        );
      }

      setSessionPreferences(sessionUser, nextPreferences);

      if (shouldStream) {
        startChatStream(res);
        if (!clientDisconnected) {
          writeChatStreamEvent(res, {
            type: 'message.start',
            message: {
              id: assistantMessageId,
              role: 'assistant',
              kind: 'text',
              streamState: 'streaming',
            },
          });
        }
      }

      const reply =
        config.mode === 'openclaw'
          ? shouldStream
            ? await dispatchOpenClawStream(outboundMessages, nextFastMode, sessionUser, {
                commandBody,
                thinkMode: nextThinkMode,
                assistantMessageId,
                onDelta: (delta) => {
                  if (!shouldStream || !delta || clientDisconnected || res.destroyed || res.writableEnded) {
                    return;
                  }
                  writeChatStreamEvent(res, { type: 'message.patch', messageId: assistantMessageId, delta });
                },
              })
            : await dispatchOpenClaw(outboundMessages, nextFastMode, sessionUser, { commandBody, thinkMode: nextThinkMode })
          : createMockReply(latestUserContent, clip);

      const snapshot = await buildDashboardSnapshot(sessionUser);
      snapshot.session.status = nextFastMode ? '已完成 / 快速' : '已完成 / 标准';
      const resolvedModel = snapshot.session?.model || config.model;
      const responsePayload = {
        ok: true,
        mode: config.mode,
        model: resolvedModel,
        assistantMessageId,
        outputText: reply.outputText,
        usage: reply.usage,
        tokenBadge: formatTokenBadge(reply.usage),
        metadata: {
          status: snapshot.session.status,
          summary: summarizeMessages(messages),
        },
        ...snapshot,
      };

      if (shouldStream) {
        replySettled = true;
        if (!clientDisconnected && !res.destroyed && !res.writableEnded) {
          writeChatStreamEvent(res, {
            type: 'message.complete',
            messageId: assistantMessageId,
            payload: {
              ok: true,
              mode: config.mode,
              model: resolvedModel,
              assistantMessageId,
              outputText: reply.outputText,
              usage: reply.usage,
              tokenBadge: formatTokenBadge(reply.usage),
              session: {
                ...(snapshot.session || {}),
                status: snapshot.session.status,
              },
              conversation: snapshot.conversation || [],
              metadata: {
                status: snapshot.session.status,
                summary: summarizeMessages(messages),
              },
            },
          });
          writeChatStreamEvent(res, {
            type: 'session.sync',
            session: {
              ...(snapshot.session || {}),
              status: snapshot.session.status,
            },
          });
          res.end();
        }
        return;
      }

      replySettled = true;
      sendJson(res, 200, responsePayload);
    } catch (error) {
      replySettled = true;
      if (res.headersSent && !clientDisconnected && !res.destroyed && !res.writableEnded) {
        writeChatStreamEvent(res, {
          type: 'message.error',
          messageId: typeof assistantMessageId === 'string' ? assistantMessageId : '',
          error: error.message || 'Unknown server error',
        });
        res.end();
        return;
      }
      sendJson(res, 500, {
        ok: false,
        error: error.message || 'Unknown server error',
      });
    }
  };
}

module.exports = {
  createChatHandler,
  createChatStopHandler,
};
