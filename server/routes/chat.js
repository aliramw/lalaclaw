function createMockReply(intent = '', clip) {
  return {
    outputText: [
      'OpenClaw command channel is online in mock mode.',
      `Current intent: ${clip(intent || 'No prompt supplied.', 160)}`,
    ].join('\n'),
    usage: null,
  };
}

function parseRequestedSessionUser(value) {
  return String(value || 'command-center').trim() || 'command-center';
}

function createChatStopHandler({
  callOpenClawGateway,
  config,
  getCommandCenterSessionKey,
  parseRequestBody,
  resolveSessionAgentId,
  sendJson,
}) {
  return async function handleChatStop(req, res) {
    try {
      const body = await parseRequestBody(req);
      const sessionUser = parseRequestedSessionUser(body.sessionUser);
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
  clearLocalSessionConversation,
  clearLocalSessionFileEntries,
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
  parseModelCommand,
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

  function formatModelStatusText(currentModel = '') {
    return currentModel ? `当前模型：${currentModel}。` : '当前模型未设置。';
  }

  function formatModelListText(currentModel = '', availableModels = []) {
    const currentLine = formatModelStatusText(currentModel);
    const normalizedModels = Array.isArray(availableModels)
      ? availableModels.filter((modelId, index, items) => modelId && items.indexOf(modelId) === index)
      : [];
    if (!normalizedModels.length) {
      return `${currentLine}\n暂无可用模型列表。`;
    }

    return [
      currentLine,
      '可用模型：',
      ...normalizedModels.map((modelId) => `- ${modelId}${modelId === currentModel ? ' (当前)' : ''}`),
    ].join('\n');
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
    let clientDisconnected = false;
    let assistantMessageId = '';
    const markClientDisconnected = () => {
      clientDisconnected = true;
    };

    req.once?.('aborted', markClientDisconnected);
    res.once?.('close', markClientDisconnected);

    try {
      const body = await parseRequestBody(req);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const shouldStream = body.stream !== false;
      const usesGatewayNativeCommands = config.mode === 'openclaw';
      const fastMode = Boolean(body.fastMode);
      const sessionUser = parseRequestedSessionUser(body.sessionUser);
      assistantMessageId = typeof body.assistantMessageId === 'string' && body.assistantMessageId.trim()
        ? body.assistantMessageId.trim()
        : `msg-assistant-${Date.now()}`;
      const latestUserMessage = [...messages].reverse().find((message) => message?.role === 'user');
      const latestUserContent = normalizeChatMessage(latestUserMessage);
      const latestUserAttachments = getMessageAttachments(latestUserMessage);
      const resetCommand = parseSessionResetCommand(latestUserContent);
      const fastCommand = parseFastCommand(latestUserContent);
      const modelCommand = parseModelCommand?.(latestUserContent) || null;
      const commandBody = usesGatewayNativeCommands ? latestUserContent : (latestUserContent.startsWith('/') ? latestUserContent : '');
      const slashCommandState = usesGatewayNativeCommands ? null : parseSlashCommandState(latestUserMessage?.content);
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

      if (!usesGatewayNativeCommands && fastCommand) {
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

      if (!usesGatewayNativeCommands && modelCommand) {
        const responseTimestamp = requestTimestamp || Date.now();
        const currentPreferences = getSessionPreferences(sessionUser);
        const currentAgentId = resolveSessionAgentId(sessionUser);
        const defaultModelForCurrentAgent = getDefaultModelForAgent(currentAgentId);
        const currentModel = resolveSessionModel(sessionUser, currentAgentId);
        let nextModel = currentModel;

        if (modelCommand.action === 'set') {
          const requestedModel = resolveCanonicalModelId(modelCommand.value);
          nextModel = requestedModel || defaultModelForCurrentAgent;
          const shouldPersistModel = Boolean(requestedModel) && requestedModel !== defaultModelForCurrentAgent;
          const shouldPatchModel = nextModel !== currentModel;

          if (config.mode === 'openclaw' && shouldPatchModel) {
            await patchOpenClawSession(
              callOpenClawGateway,
              delay,
              getCommandCenterSessionKey(currentAgentId, sessionUser),
              { model: nextModel },
            );
          }

          setSessionPreferences(sessionUser, {
            ...currentPreferences,
            model: shouldPersistModel ? nextModel : undefined,
          });
        }

        const snapshot = await buildDashboardSnapshot(sessionUser);
        const selectedModel = snapshot.session?.selectedModel || snapshot.session?.model || nextModel || currentModel || '';
        const availableModels = Array.isArray(snapshot.session?.availableModels) && snapshot.session.availableModels.length
          ? snapshot.session.availableModels
          : [selectedModel].filter(Boolean);
        const outputText =
          modelCommand.action === 'list'
            ? formatModelListText(selectedModel, availableModels)
            : modelCommand.action === 'set'
              ? `已切换到模型 ${selectedModel}。`
              : formatModelStatusText(selectedModel);

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

        snapshot.session.status = '已完成 / 标准';

        sendJson(res, 200, {
          ok: true,
          mode: config.mode,
          model: selectedModel || config.model,
          outputText,
          usage: null,
          tokenBadge: '',
          commandHandled: modelCommand.action === 'list' ? 'models' : 'model',
          metadata: {
            status: snapshot.session.status,
            summary:
              modelCommand.action === 'set'
                ? `model: ${selectedModel}`
                : `model: ${modelCommand.action}`,
          },
          ...snapshot,
        });
        return;
      }

      if (!usesGatewayNativeCommands && resetCommand) {
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

      const nativeFastCommand = usesGatewayNativeCommands ? parseFastCommand(latestUserContent) : null;
      const nativeModelCommand = usesGatewayNativeCommands ? parseModelCommand?.(latestUserContent) || null : null;
      const nativeResetCommand = usesGatewayNativeCommands ? parseSessionResetCommand(latestUserContent) : null;
      const nativeDirectiveState = usesGatewayNativeCommands ? parseSlashCommandState(latestUserMessage?.content) : null;

      if (usesGatewayNativeCommands && nativeResetCommand) {
        clearLocalSessionConversation?.(sessionUser);
        clearLocalSessionFileEntries?.(sessionUser);
      }

      if (usesGatewayNativeCommands && (nativeFastCommand?.action === 'on' || nativeFastCommand?.action === 'off')) {
        setSessionPreferences(sessionUser, {
          ...getSessionPreferences(sessionUser),
          fastMode: nativeFastCommand.action === 'on',
        });
      } else if (usesGatewayNativeCommands && nativeDirectiveState?.kind === 'thinkMode') {
        setSessionPreferences(sessionUser, {
          ...getSessionPreferences(sessionUser),
          thinkMode: nativeDirectiveState.value,
        });
      }

      appendLocalSessionConversation(sessionUser, [
        ...(latestUserMessage
          ? [
              {
                role: 'user',
                content: latestUserContent,
                timestamp: requestTimestamp,
              },
            ]
          : []),
        ...(reply.outputText
          ? [
              {
                role: 'assistant',
                content: reply.outputText,
                timestamp: Math.max(Date.now(), requestTimestamp + 1),
                ...(reply.usage ? { tokenBadge: formatTokenBadge(reply.usage) } : {}),
              },
            ]
          : []),
      ]);

      const snapshot = await buildDashboardSnapshot(sessionUser);
      if (usesGatewayNativeCommands && (nativeModelCommand || nativeResetCommand)) {
        const authoritativeModel = snapshot.session?.model || snapshot.model || '';
        if (authoritativeModel) {
          const defaultModelForCurrentAgent = getDefaultModelForAgent(resolveSessionAgentId(sessionUser));
          const shouldPersistModel = authoritativeModel !== defaultModelForCurrentAgent;
          setSessionPreferences(sessionUser, {
            ...getSessionPreferences(sessionUser),
            model: shouldPersistModel ? authoritativeModel : undefined,
          });
          snapshot.session = {
            ...(snapshot.session || {}),
            selectedModel: authoritativeModel,
          };
        }
      }
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

      sendJson(res, 200, responsePayload);
    } catch (error) {
      if (res.headersSent) {
        if (!clientDisconnected && !res.destroyed && !res.writableEnded) {
          writeChatStreamEvent(res, {
            type: 'message.error',
            messageId: typeof assistantMessageId === 'string' ? assistantMessageId : '',
            error: error.message || 'Unknown server error',
          });
          res.end();
        }
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
