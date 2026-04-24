import type { IncomingMessage, ServerResponse } from 'node:http';

type LooseRecord = Record<string, any>;
type ChatUsage = LooseRecord | null;
type ChatReply = {
  outputText: string;
  progressLabel?: string;
  progressStage?: string;
  progressUpdatedAt?: number;
  sessionId?: string;
  usage: ChatUsage;
};
type ChatMessage = LooseRecord & {
  attachments?: LooseRecord[];
  content?: string;
  role?: string;
  timestamp?: number;
};
type SessionPreferenceState = {
  agentId?: string;
  fastMode?: boolean;
  model?: string;
  thinkMode?: string;
  [key: string]: any;
};
type ParsedCommand = {
  action?: string;
  kind?: string;
  tail?: string;
  value?: any;
} | null;
type ChatRequestBody = {
  agentId?: string;
  assistantMessageId?: string;
  fastMode?: boolean;
  messages?: ChatMessage[];
  model?: string;
  stream?: boolean;
  sessionUser?: string;
  userLabel?: string;
  [key: string]: any;
};
type SendJson = (res: ServerResponse, statusCode: number, payload: LooseRecord) => void;
type ParseRequestBody = (req: IncomingMessage) => Promise<ChatRequestBody>;
type ChatStopHandlerOptions = {
  callOpenClawGateway: (method: string, payload?: LooseRecord) => Promise<unknown>;
  config: LooseRecord;
  getCommandCenterSessionKey: (agentId: string, sessionUser?: string) => string;
  parseRequestBody: ParseRequestBody;
  resolveModeForAgent?: (agentId?: string) => string;
  resolveSessionAgentId: (sessionUser?: string) => string;
  sendJson: SendJson;
};
type ChatHandlerOptions = {
  appendLocalSessionConversation: (sessionUser?: string, entries?: LooseRecord[]) => LooseRecord[];
  appendLocalSessionFileEntries: (sessionUser?: string, entries?: LooseRecord[]) => LooseRecord[];
  buildDashboardSnapshot: (sessionUser?: string, overrides?: LooseRecord) => Promise<LooseRecord>;
  callOpenClawGateway: (method: string, payload?: LooseRecord) => Promise<unknown>;
  clearLocalSessionConversation?: (sessionUser?: string) => void;
  clearLocalSessionFileEntries?: (sessionUser?: string) => void;
  clip: (value: unknown, length?: number) => string;
  config: LooseRecord;
  delay: (ms: number) => Promise<unknown>;
  dispatchHermes?: (messages: LooseRecord[], options?: LooseRecord) => Promise<ChatReply>;
  dispatchOpenClaw: (messages: LooseRecord[], fastMode: boolean, sessionUser?: string, options?: LooseRecord) => Promise<ChatReply>;
  dispatchOpenClawStream: (messages: LooseRecord[], fastMode: boolean, sessionUser?: string, options?: LooseRecord) => Promise<ChatReply>;
  formatTokenBadge: (usage: ChatUsage) => string;
  getCommandCenterSessionKey: (agentId: string, sessionUser?: string) => string;
  getDefaultAgentId: () => string;
  getDefaultModelForAgent: (agentId: string) => string;
  getMessageAttachments: (message?: ChatMessage | null) => LooseRecord[];
  getSessionPreferences: (sessionUser?: string) => SessionPreferenceState;
  mirrorOpenClawUserMessage?: (sessionUser: string, content: string, options?: LooseRecord) => Promise<unknown>;
  materializeMessageAttachments?: (attachments?: LooseRecord[], options?: LooseRecord) => LooseRecord[] | Promise<LooseRecord[]>;
  normalizeChatMessage: (message?: ChatMessage | null) => string;
  normalizeSessionUser: (sessionUser?: string) => string;
  parseFastCommand: (content: string) => ParsedCommand;
  parseModelCommand?: (content: string) => ParsedCommand;
  parseRequestBody: ParseRequestBody;
  parseSessionResetCommand: (content: string) => ParsedCommand;
  parseSlashCommandState: (content?: unknown) => ParsedCommand;
  resolveCanonicalModelId: (value?: string) => string;
  resolveModeForAgent?: (agentId?: string) => string;
  resolveSessionAgentId: (sessionUser?: string) => string;
  resolveSessionFastMode: (sessionUser?: string) => boolean;
  resolveSessionModel: (sessionUser?: string, agentId?: string) => string;
  resolveSessionThinkMode: (sessionUser?: string) => string;
  sendJson: SendJson;
  setSessionPreferences: (sessionUser?: string, preferences?: SessionPreferenceState) => SessionPreferenceState | void;
  summarizeMessages: (messages: ChatMessage[]) => string;
};

function createMockReply(intent = '', clip: (value: unknown, length?: number) => string): ChatReply {
  return {
    outputText: [
      'OpenClaw command channel is online in mock mode.',
      `Current intent: ${clip(intent || 'No prompt supplied.', 160)}`,
    ].join('\n'),
    usage: null as ChatUsage,
  };
}

function parseRequestedSessionUser(value: unknown): string {
  return String(value || 'command-center').trim() || 'command-center';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { message?: string } | null)?.message || '').trim() || 'Unknown server error';
}

function sanitizeChatErrorMessage(error: unknown): string {
  const message = getErrorMessage(error).replace(/\r\n?/g, '\n').trim();
  if (!message) {
    return 'Unknown server error';
  }

  const sensitivePatterns = [
    /^Command failed:/i,
    /\b--token\b/i,
    /\bGateway target:\b/i,
    /\bSource:\s*cli\b/i,
    /\bConfig:\s*[/~]/i,
    /\bspawn openclaw\b/i,
    /\/Users\//,
  ];

  const gatewayUnavailablePatterns = [
    /\bgateway closed\b/i,
    /\babnormal closure\b/i,
    /\bhandshake timeout\b/i,
    /\bECONNREFUSED\b/i,
    /\bECONNRESET\b/i,
    /\bEPIPE\b/i,
    /\bsocket hang up\b/i,
  ];

  const hasSensitiveDetails = sensitivePatterns.some((pattern) => pattern.test(message));
  if (!hasSensitiveDetails) {
    return message;
  }

  if (gatewayUnavailablePatterns.some((pattern) => pattern.test(message))) {
    return 'OpenClaw gateway unavailable.';
  }

  return 'OpenClaw request failed.';
}

function getReplyProgressPayload(reply: ChatReply): LooseRecord {
  const progressUpdatedAt = Number(reply?.progressUpdatedAt || 0) || 0;

  return {
    ...(typeof reply?.progressStage === 'string' && reply.progressStage.trim()
      ? { progressStage: reply.progressStage.trim() }
      : {}),
    ...(typeof reply?.progressLabel === 'string' && reply.progressLabel.trim()
      ? { progressLabel: reply.progressLabel.trim() }
      : {}),
    ...(progressUpdatedAt ? { progressUpdatedAt } : {}),
  };
}

export function createChatStopHandler({
  callOpenClawGateway,
  config,
  getCommandCenterSessionKey,
  parseRequestBody,
  resolveModeForAgent,
  resolveSessionAgentId,
  sendJson,
}: ChatStopHandlerOptions) {
  return async function handleChatStop(req: IncomingMessage, res: ServerResponse) {
    try {
      const body = await parseRequestBody(req);
      const sessionUser = parseRequestedSessionUser(body.sessionUser);
      const requestedAgentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
      const agentId = requestedAgentId || resolveSessionAgentId(sessionUser);
      const mode = typeof resolveModeForAgent === 'function' ? resolveModeForAgent(agentId) : config.mode;

      if (mode === 'openclaw') {
        await callOpenClawGateway('chat.abort', {
          sessionKey: getCommandCenterSessionKey(agentId, sessionUser),
        });
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      const stopError = error as Error;
      sendJson(res, 500, {
        ok: false,
        error: sanitizeChatErrorMessage(stopError),
      });
    }
  };
}

export function createChatHandler({
  appendLocalSessionFileEntries,
  appendLocalSessionConversation,
  buildDashboardSnapshot,
  callOpenClawGateway,
  clearLocalSessionConversation,
  clearLocalSessionFileEntries,
  clip,
  config,
  delay,
  dispatchHermes,
  dispatchOpenClaw,
  dispatchOpenClawStream,
  formatTokenBadge,
  getCommandCenterSessionKey,
  getDefaultAgentId,
  getDefaultModelForAgent,
  getMessageAttachments,
  getSessionPreferences,
  mirrorOpenClawUserMessage,
  materializeMessageAttachments,
  normalizeChatMessage,
  normalizeSessionUser,
  parseFastCommand,
  parseModelCommand,
  parseRequestBody,
  parseSessionResetCommand,
  parseSlashCommandState,
  resolveCanonicalModelId,
  resolveModeForAgent,
  resolveSessionAgentId,
  resolveSessionFastMode,
  resolveSessionModel,
  resolveSessionThinkMode,
  sendJson,
  setSessionPreferences,
  summarizeMessages,
}: ChatHandlerOptions) {
  function startChatStream(res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  function writeChatStreamEvent(res: ServerResponse, payload: LooseRecord) {
    res.write(`${JSON.stringify(payload)}\n`);
  }

  function formatModelStatusText(currentModel = '') {
    return currentModel ? `当前模型：${currentModel}。` : '当前模型未设置。';
  }

  function formatModelListText(currentModel = '', availableModels: string[] = []) {
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

  async function patchOpenClawSession(
    callOpenClawGateway: ChatStopHandlerOptions['callOpenClawGateway'],
    delay: ChatHandlerOptions['delay'],
    sessionKey: string,
    updates: { model?: string; thinkingLevel?: string } = {},
  ) {
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

  return async function handleChat(req: IncomingMessage, res: ServerResponse) {
    let clientDisconnected = false;
    let assistantMessageId = '';
    const markClientDisconnected = () => {
      clientDisconnected = true;
    };

    req.once?.('aborted', markClientDisconnected);
    res.once?.('close', markClientDisconnected);

    try {
      const body = await parseRequestBody(req);
      const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
      const shouldStream = body.stream !== false;
      const fastMode = Boolean(body.fastMode);
      const sessionUser = parseRequestedSessionUser(body.sessionUser);
      const requestedAgentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
      const sessionAgentId = requestedAgentId || resolveSessionAgentId(sessionUser);
      const activeMode = typeof resolveModeForAgent === 'function' ? resolveModeForAgent(sessionAgentId) : config.mode;
      const usesGatewayNativeCommands = activeMode === 'openclaw';
      assistantMessageId = typeof body.assistantMessageId === 'string' && body.assistantMessageId.trim()
        ? body.assistantMessageId.trim()
        : `msg-assistant-${Date.now()}`;
      const latestUserMessage = [...messages].reverse().find((message: ChatMessage) => message?.role === 'user');
      const latestUserContent = normalizeChatMessage(latestUserMessage);
      const latestUserAttachments = await Promise.resolve(
        typeof materializeMessageAttachments === 'function'
          ? materializeMessageAttachments(
              getMessageAttachments(latestUserMessage),
              { sessionUser },
            )
          : getMessageAttachments(latestUserMessage),
      );
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
            ...(latestUserAttachments.length ? { attachments: latestUserAttachments } : {}),
          },
          {
            role: 'assistant',
            content: outputText,
            timestamp: responseTimestamp,
          },
        ]);

        const snapshot = await buildDashboardSnapshot(sessionUser, { agentId: sessionAgentId });
        snapshot.session.status = '已完成 / 标准';

        sendJson(res, 200, {
          ok: true,
          mode: snapshot.session?.mode || activeMode,
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
        const currentAgentId = activeMode === 'openclaw' ? resolveSessionAgentId(sessionUser) : sessionAgentId;
        const defaultModelForCurrentAgent = getDefaultModelForAgent(currentAgentId);
        const currentModel = resolveSessionModel(sessionUser, currentAgentId);
        let nextModel = currentModel;

        if (modelCommand.action === 'set') {
          const requestedModel = resolveCanonicalModelId(modelCommand.value);
          nextModel = requestedModel || defaultModelForCurrentAgent;
          const shouldPersistModel = Boolean(requestedModel) && requestedModel !== defaultModelForCurrentAgent;
          const shouldPatchModel = nextModel !== currentModel;

          if (activeMode === 'openclaw' && shouldPatchModel) {
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

        const snapshot = await buildDashboardSnapshot(sessionUser, { agentId: sessionAgentId });
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
            ...(latestUserAttachments.length ? { attachments: latestUserAttachments } : {}),
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
          mode: snapshot.session?.mode || activeMode,
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
        const nextSessionPreferences = { ...currentPreferences };
        delete nextSessionPreferences.hermesSessionId;
        setSessionPreferences(nextSessionUser, nextSessionPreferences);

        let outputText = '新会话已开始。直接说你要我干什么。';
        let usage: ChatUsage = null;
        let nextHermesSessionId = '';

        if (resetCommand.tail) {
          const resetReply =
            activeMode === 'openclaw'
              ? await dispatchOpenClaw([{ role: 'user', content: resetCommand.tail }], fastMode, nextSessionUser)
              : activeMode === 'hermes' && typeof dispatchHermes === 'function'
                ? await dispatchHermes([{ role: 'user', content: resetCommand.tail }], {
                    model: resolveSessionModel(nextSessionUser, sessionAgentId),
                    sessionUser: nextSessionUser,
                  })
              : createMockReply(resetCommand.tail, clip);

          outputText = resetReply.outputText;
          usage = resetReply.usage;
          nextHermesSessionId = String(resetReply.sessionId || '').trim();
        }

        if (activeMode === 'hermes' && nextHermesSessionId) {
          setSessionPreferences(nextSessionUser, {
            ...getSessionPreferences(nextSessionUser),
            hermesSessionId: nextHermesSessionId,
          });
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

        const snapshot = await buildDashboardSnapshot(nextSessionUser, { agentId: sessionAgentId });
        snapshot.session.status = fastMode ? '已完成 / 快速' : '已完成 / 标准';

        sendJson(res, 200, {
          ok: true,
          mode: snapshot.session?.mode || activeMode,
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
      const currentAgentId = activeMode === 'openclaw' ? resolveSessionAgentId(sessionUser) : sessionAgentId;
      const nextAgentId = body.agentId ? String(body.agentId).trim() || currentAgentId : currentAgentId;
      const defaultModelForNextAgent = getDefaultModelForAgent(nextAgentId);
      const nextFastMode = slashCommandState?.kind === 'fastMode' ? slashCommandState.value : fastMode;
      const nextThinkMode = slashCommandState?.kind === 'thinkMode' ? slashCommandState.value : resolveSessionThinkMode(sessionUser);
      const requestedModel = typeof body.model === 'string' ? resolveCanonicalModelId(body.model) : '';
      const requestedHermesSessionId = typeof body.hermesSessionId === 'string' ? String(body.hermesSessionId || '').trim() : '';
      const hermesSessionId = requestedHermesSessionId || String(currentPreferences?.hermesSessionId || '').trim();

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

      if (activeMode === 'openclaw' && (shouldPatchModel || shouldPatchThinkMode)) {
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

      const operatorName =
        typeof body.userLabel === 'string' && body.userLabel.trim()
          ? body.userLabel.trim()
          : '';

      if (activeMode === 'openclaw' && latestUserContent && !latestUserContent.startsWith('/')) {
        try {
          await mirrorOpenClawUserMessage?.(sessionUser, latestUserContent, { operatorName });
        } catch (error) {
          console.warn('[chat] mirrorOpenClawUserMessage failed', {
            error: error instanceof Error ? error.message : String(error || ''),
            sessionUser,
          });
        }
      }

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
        activeMode === 'openclaw'
          ? shouldStream
            ? await dispatchOpenClawStream(outboundMessages, nextFastMode, sessionUser, {
                commandBody,
                thinkMode: nextThinkMode,
                assistantMessageId,
                onDelta: (delta: unknown) => {
                  if (!shouldStream || !delta || clientDisconnected || res.destroyed || res.writableEnded) {
                    return;
                  }
                  writeChatStreamEvent(res, { type: 'message.patch', messageId: assistantMessageId, delta });
                },
              })
            : await dispatchOpenClaw(outboundMessages, nextFastMode, sessionUser, { commandBody, thinkMode: nextThinkMode })
          : activeMode === 'hermes' && typeof dispatchHermes === 'function'
            ? await dispatchHermes(outboundMessages, {
                assistantMessageId,
                model: nextModel,
                onProgress: (progress: LooseRecord = {}) => {
                  if (!shouldStream || clientDisconnected || res.destroyed || res.writableEnded) {
                    return;
                  }

                  const progressPayload = getReplyProgressPayload(progress as ChatReply);
                  if (!Object.keys(progressPayload).length) {
                    return;
                  }

                  writeChatStreamEvent(res, {
                    type: 'message.progress',
                    messageId: assistantMessageId,
                    ...progressPayload,
                  });
                },
                sessionId: hermesSessionId,
                sessionUser,
              })
          : createMockReply(latestUserContent, clip);

      if (activeMode === 'hermes' && reply.sessionId) {
        setSessionPreferences(sessionUser, {
          ...getSessionPreferences(sessionUser),
          hermesSessionId: reply.sessionId,
        });
      }

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
                ...(latestUserAttachments.length ? { attachments: latestUserAttachments } : {}),
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

      const snapshot = await buildDashboardSnapshot(sessionUser, {
        agentId: nextAgentId,
        ...(activeMode === 'hermes' && (reply.sessionId || hermesSessionId)
          ? { hermesSessionId: String(reply.sessionId || hermesSessionId || '').trim() }
          : {}),
      });
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
      const replyProgress = getReplyProgressPayload(reply);
      const responsePayload = {
        ok: true,
        mode: snapshot.session?.mode || activeMode,
        model: resolvedModel,
        assistantMessageId,
        outputText: reply.outputText,
        usage: reply.usage,
        tokenBadge: formatTokenBadge(reply.usage),
        ...replyProgress,
        metadata: {
          status: snapshot.session.status,
          summary: summarizeMessages(messages),
        },
        ...snapshot,
      };

      if (shouldStream) {
        if (!clientDisconnected && !res.destroyed && !res.writableEnded) {
          if (Object.keys(replyProgress).length) {
            writeChatStreamEvent(res, {
              type: 'message.progress',
              messageId: assistantMessageId,
              ...replyProgress,
            });
          }
          writeChatStreamEvent(res, {
            type: 'message.complete',
            messageId: assistantMessageId,
            payload: {
              ok: true,
              mode: snapshot.session?.mode || activeMode,
              model: resolvedModel,
              assistantMessageId,
              outputText: reply.outputText,
              usage: reply.usage,
              tokenBadge: formatTokenBadge(reply.usage),
              ...replyProgress,
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
      const chatError = error as Error;
      const safeErrorMessage = sanitizeChatErrorMessage(chatError);
      if (res.headersSent) {
        if (!clientDisconnected && !res.destroyed && !res.writableEnded) {
          writeChatStreamEvent(res, {
            type: 'message.error',
            messageId: typeof assistantMessageId === 'string' ? assistantMessageId : '',
            error: safeErrorMessage,
          });
          res.end();
        }
        return;
      }
      sendJson(res, 500, {
        ok: false,
        error: safeErrorMessage,
      });
    }
  };
}
