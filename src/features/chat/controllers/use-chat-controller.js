import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isImageAttachmentFile,
  isTextAttachmentFile,
  readFileAsDataUrl,
  readFileAsText,
} from "@/features/chat/utils";
import { getLocalizedStatusLabel } from "@/features/session/status-display";

const duplicateSendGuardWindowMs = 1500;

function isNdjsonStreamResponse(response) {
  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  return Boolean(response?.body) && contentType.includes("application/x-ndjson");
}

function shouldSuppressPendingPlaceholder(entry) {
  return /^\s*\//.test(String(entry?.content || ""));
}

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|abort/i.test(String(error?.message || ""));
}

function createEntryFingerprint(entry = {}) {
  const attachmentSignature = (entry.attachments || [])
    .map((attachment) => [
      attachment?.path || attachment?.fullPath || attachment?.name || "",
      attachment?.size || 0,
      attachment?.mimeType || "",
      attachment?.kind || "",
    ].join(":"))
    .sort()
    .join("|");

  return JSON.stringify({
    key: String(entry.key || "").trim(),
    content: String(entry.content || "").replace(/\r\n/g, "\n").trim(),
    attachments: attachmentSignature,
  });
}

function hasVisibleAssistantContent(content = "") {
  let normalized = String(content || "").replace(/\[\[reply_to_current\]\]/gi, " ").trimStart();

  const hasLeadingSmallBlock = /^(?:\*\*|__)?\s*<small>[\s\S]*?<\/small>\s*(?:\*\*|__)?/i.test(normalized);
  if (hasLeadingSmallBlock) {
    normalized = normalized.replace(/^(?:\*\*|__)?\s*<small>[\s\S]*?<\/small>\s*(?:\*\*|__)?/i, "").trimStart();
  } else if (/^(?:\*\*|__)?\s*<small>[\s\S]*$/i.test(normalized)) {
    return false;
  }

  normalized = normalized
    .replace(/<\/?[A-Za-z][^>\n]*>?/g, " ")
    .replace(/[`*_>#~\-]+/g, " ")
    .replace(/\s+/g, "");

  return normalized.length > 0;
}

function createUserMessage(entry = {}) {
  return {
    id: entry.userMessageId || `msg-user-${entry.timestamp}`,
    role: "user",
    content: entry.content || (entry.attachments?.length ? `已发送 ${entry.attachments.length} 个附件` : ""),
    timestamp: entry.timestamp,
    ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
  };
}

function createPendingAssistantMessage(entry = {}, thinkingPlaceholder = "") {
  const pendingTimestamp = entry.pendingTimestamp || Date.now();
  return {
    id: entry.assistantMessageId || `msg-assistant-pending-${pendingTimestamp}`,
    role: "assistant",
    content: thinkingPlaceholder,
    timestamp: pendingTimestamp,
    pending: true,
  };
}

function withOptimisticTurnIds(entry = {}) {
  const pendingTimestamp = Number(entry.pendingTimestamp || 0) || Date.now();
  const entryIdentity = String(entry.id || entry.timestamp || pendingTimestamp).trim();
  const fallbackIdentity = entryIdentity || String(pendingTimestamp);
  const userMessageId =
    typeof entry.userMessageId === "string" && entry.userMessageId.trim()
      ? entry.userMessageId.trim()
      : `msg-user-${fallbackIdentity}`;
  const assistantMessageId =
    typeof entry.assistantMessageId === "string" && entry.assistantMessageId.trim()
      ? entry.assistantMessageId.trim()
      : `msg-assistant-pending-${pendingTimestamp}`;

  return {
    ...entry,
    assistantMessageId,
    pendingTimestamp,
    userMessageId,
  };
}

function hasMessageId(messages = [], messageId = "") {
  const normalizedId = String(messageId || "").trim();
  if (!normalizedId) {
    return false;
  }

  return messages.some((item) => String(item?.id || "").trim() === normalizedId);
}

function ensureOptimisticTurnMessages(
  current = [],
  entry = {},
  thinkingPlaceholder = "",
  { includePendingPlaceholder = true, includeUserMessage = true } = {},
) {
  const next = Array.isArray(current) ? [...current] : [];
  const userMessage = createUserMessage(entry);
  const pendingMessage = createPendingAssistantMessage(entry, thinkingPlaceholder);

  if (includeUserMessage && !hasMessageId(next, userMessage.id)) {
    next.push(userMessage);
  }

  if (includePendingPlaceholder && !hasMessageId(next, pendingMessage.id)) {
    next.push(pendingMessage);
  }

  return next;
}

function replacePendingAssistantMessage(current = [], pendingTimestamp, content, tokenBadge = "", streaming = false, messageId = "") {
  const next = Array.isArray(current) ? [...current] : [];
  const assistantMessage = {
    role: "assistant",
    content,
    timestamp: pendingTimestamp,
    ...(messageId ? { id: messageId } : {}),
    ...(tokenBadge ? { tokenBadge } : {}),
    ...(streaming ? { streaming: true } : {}),
  };

  const messageIdIndex = messageId
    ? next.findIndex((item) => item?.role === "assistant" && String(item?.id || "") === messageId)
    : -1;
  if (messageIdIndex >= 0) {
    next[messageIdIndex] = assistantMessage;
    return next;
  }

  const pendingIndex = next.findIndex((item) => item?.pending && item.timestamp === pendingTimestamp);
  if (pendingIndex >= 0) {
    next[pendingIndex] = assistantMessage;
    return next;
  }

  const existingIndex = next.findIndex((item) => item?.role === "assistant" && !item?.pending && item.timestamp === pendingTimestamp);
  if (existingIndex >= 0) {
    next[existingIndex] = assistantMessage;
    return next;
  }

  next.push(assistantMessage);
  return next;
}

async function consumeChatStream(response, { entry, pendingTimestamp, setMessagesForTab }) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return null;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let payload = null;
  let streamedText = "";
  let tokenBadge = "";
  let assistantMessageId = "";
  let sessionSync = null;

  const pushStreamUpdate = () => {
    if (!hasVisibleAssistantContent(streamedText)) {
      return;
    }
    setMessagesForTab(entry.tabId, (current) =>
      replacePendingAssistantMessage(current, pendingTimestamp, streamedText, tokenBadge, true, assistantMessageId),
    );
  };

  const processLine = (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return;
    }

    const event = JSON.parse(trimmed);

    if (event.type === "message.start") {
      assistantMessageId = typeof event.message?.id === "string" ? event.message.id : assistantMessageId;
      return;
    }

    if (event.type === "message.patch") {
      if (typeof event.messageId === "string" && event.messageId) {
        assistantMessageId = event.messageId;
      }
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) {
        return;
      }
      streamedText += delta;
      pushStreamUpdate();
      return;
    }

    if (event.type === "message.complete") {
      if (typeof event.messageId === "string" && event.messageId) {
        assistantMessageId = event.messageId;
      }
      payload = event.payload || null;
      if (payload?.tokenBadge) {
        tokenBadge = payload.tokenBadge;
      }
      if (typeof payload?.assistantMessageId === "string" && payload.assistantMessageId) {
        assistantMessageId = payload.assistantMessageId;
      }
      if (typeof payload?.outputText === "string") {
        streamedText = payload.outputText;
        pushStreamUpdate();
      }
      return;
    }

    if (event.type === "session.sync") {
      sessionSync = event.session || null;
      return;
    }

    if (event.type === "delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) {
        return;
      }
      streamedText += delta;
      pushStreamUpdate();
      return;
    }

    if (event.type === "done") {
      payload = event.payload || null;
      if (payload?.tokenBadge) {
        tokenBadge = payload.tokenBadge;
      }
      if (typeof payload?.assistantMessageId === "string" && payload.assistantMessageId) {
        assistantMessageId = payload.assistantMessageId;
      }
      if (typeof payload?.outputText === "string") {
        streamedText = payload.outputText;
        pushStreamUpdate();
      }
      return;
    }

    if (event.type === "message.error" || event.type === "error") {
      const streamError = new Error(event.error || "Request failed");
      streamError.partialOutputText = streamedText;
      streamError.tokenBadge = tokenBadge;
      streamError.assistantMessageId = assistantMessageId;
      streamError.sessionSync = sessionSync;
      throw streamError;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      error.partialOutputText = streamedText;
      error.tokenBadge = tokenBadge;
      error.assistantMessageId = assistantMessageId;
    }
    throw error;
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  return payload
    ? {
        ...payload,
        ...(sessionSync ? { sessionSync } : {}),
      }
    : {
        ok: true,
        outputText: streamedText,
        tokenBadge,
        metadata: {},
        ...(sessionSync ? { sessionSync } : {}),
      };
}

export function useChatController({
  activeConversationKey,
  activeChatTabId = "",
  applySnapshot,
  busy = false,
  busyByTabId = {},
  getMessagesForTab: getMessagesForTabProp,
  invalidateRuntimeRequestForTab = () => {},
  i18n,
  isTabActive: isTabActiveProp,
  messagesRef,
  persistOptimisticChatState = () => {},
  setBusy,
  setBusyForTab: setBusyForTabProp,
  setMessagesSynced,
  setMessagesForTab: setMessagesForTabProp,
  setPendingChatTurns,
  setSession,
  updateTabIdentity = () => {},
  updateTabMeta = () => {},
  updateTabSession: updateTabSessionProp,
}) {
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [composerAttachments, setComposerAttachments] = useState([]);
  const lastAcceptedEntryByTabRef = useRef({});
  const inFlightTurnsRef = useRef({});
  const navigationAwayRef = useRef(false);
  const stopRequestedByTabRef = useRef({});
  const resolvedActiveTabId = activeChatTabId || activeConversationKey || "active";
  const getMessagesForTab = useCallback(
    (tabId) => {
      if (typeof getMessagesForTabProp === "function") {
        return getMessagesForTabProp(tabId);
      }
      return messagesRef?.current || [];
    },
    [getMessagesForTabProp, messagesRef],
  );
  const setMessagesForTab = useCallback(
    (tabId, value) => {
      if (typeof setMessagesForTabProp === "function") {
        setMessagesForTabProp(tabId, value);
        return;
      }
      setMessagesSynced?.(value);
    },
    [setMessagesForTabProp, setMessagesSynced],
  );
  const setBusyForTab = useCallback(
    (tabId, value) => {
      if (typeof setBusyForTabProp === "function") {
        setBusyForTabProp(tabId, value);
        return;
      }
      if (typeof setBusy === "function") {
        setBusy(value);
      }
    },
    [setBusy, setBusyForTabProp],
  );
  const updateTabSession = useCallback(
    (tabId, value) => {
      if (typeof updateTabSessionProp === "function") {
        updateTabSessionProp(tabId, value);
        return;
      }
      if (typeof setSession !== "function") {
        return;
      }
      setSession(value);
    },
    [setSession, updateTabSessionProp],
  );
  const isTabActive = useCallback(
    (tabId) => {
      if (typeof isTabActiveProp === "function") {
        return isTabActiveProp(tabId);
      }
      return tabId === resolvedActiveTabId;
    },
    [isTabActiveProp, resolvedActiveTabId],
  );

  const handleStop = useCallback(async (tabId = resolvedActiveTabId) => {
    const activeTurn = inFlightTurnsRef.current[tabId];
    if (!activeTurn) {
      return false;
    }

    stopRequestedByTabRef.current = {
      ...stopRequestedByTabRef.current,
      [tabId]: true,
    };

    activeTurn.abortController?.abort?.();

    try {
      await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeTurn.agentId,
          sessionUser: activeTurn.sessionUser,
        }),
      });
    } catch {}

    return true;
  }, [resolvedActiveTabId]);

  const activeQueuedMessages = useMemo(
    () =>
      queuedMessages.filter((item) => {
        const itemTabId = item.tabId || resolvedActiveTabId;
        return itemTabId === resolvedActiveTabId;
      }),
    [queuedMessages, resolvedActiveTabId],
  );

  useEffect(() => {
    const markNavigationAway = () => {
      navigationAwayRef.current = true;
    };

    window.addEventListener("beforeunload", markNavigationAway);
    window.addEventListener("pagehide", markNavigationAway);

    return () => {
      window.removeEventListener("beforeunload", markNavigationAway);
      window.removeEventListener("pagehide", markNavigationAway);
    };
  }, []);

  const runChatTurn = useCallback(async (entry) => {
    const resolvedEntry = withOptimisticTurnIds(entry);
    const targetTabId = resolvedEntry.tabId || resolvedActiveTabId;
    const currentMessages = getMessagesForTab(targetTabId);
    const suppressPendingPlaceholder = shouldSuppressPendingPlaceholder(resolvedEntry);
    const pendingMessage = createPendingAssistantMessage(resolvedEntry, i18n.chat.thinkingPlaceholder);
    const userMessage = createUserMessage(resolvedEntry);
    const nextPendingEntry = {
      key: resolvedEntry.key,
      startedAt: Date.now(),
      pendingTimestamp: pendingMessage.timestamp,
      assistantMessageId: pendingMessage.id,
      userMessage: {
        id: userMessage.id,
        role: "user",
        content: userMessage.content,
        timestamp: userMessage.timestamp,
        ...(userMessage.attachments?.length ? { attachments: userMessage.attachments } : {}),
      },
      ...(suppressPendingPlaceholder ? { suppressPendingPlaceholder: true } : {}),
    };
    invalidateRuntimeRequestForTab(targetTabId);
    const nextMessages = ensureOptimisticTurnMessages(
      currentMessages,
      {
        ...resolvedEntry,
        pendingTimestamp: pendingMessage.timestamp,
        assistantMessageId: pendingMessage.id,
      },
      i18n.chat.thinkingPlaceholder,
      { includePendingPlaceholder: !suppressPendingPlaceholder },
    );
    setMessagesForTab(targetTabId, nextMessages);
    updateTabSession(targetTabId, (current) => ({ ...current, status: i18n.common.running }));
    setBusyForTab(targetTabId, true);
    setPendingChatTurns((current) => ({
      ...current,
      [resolvedEntry.key]: nextPendingEntry,
    }));
    persistOptimisticChatState({
      tabId: targetTabId,
      nextMessages,
      pendingEntry: nextPendingEntry,
    });
    let turnStopped = false;
    const abortController = new AbortController();
    inFlightTurnsRef.current = {
      ...inFlightTurnsRef.current,
      [targetTabId]: {
        abortController,
        agentId: resolvedEntry.agentId,
        sessionUser: resolvedEntry.sessionUser,
      },
    };
    if (Object.prototype.hasOwnProperty.call(stopRequestedByTabRef.current, targetTabId)) {
      const nextStopRequested = { ...stopRequestedByTabRef.current };
      delete nextStopRequested[targetTabId];
      stopRequestedByTabRef.current = nextStopRequested;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          model: resolvedEntry.model,
          agentId: resolvedEntry.agentId,
          sessionUser: resolvedEntry.sessionUser,
          assistantMessageId: pendingMessage.id,
          fastMode: resolvedEntry.fastMode,
          messages: nextMessages
            .filter((message) => !message.pending)
            .map(({ role, content: messageContent, attachments }) => ({
              role,
              content: messageContent,
              ...(attachments?.length ? { attachments } : {}),
            })),
          stream: true,
        }),
      });
      const streamEntry = { ...resolvedEntry, tabId: targetTabId };
      const payload = isNdjsonStreamResponse(response)
        ? await consumeChatStream(response, {
            entry: streamEntry,
            pendingTimestamp: pendingMessage.timestamp,
            setMessagesForTab,
          })
        : await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Request failed");
      }

      if (payload.resetSessionUser) {
        const nextSessionUser = payload.resetSessionUser;
        const nextAgentId = payload.session?.agentId || resolvedEntry.agentId;
        const nextModel = payload.session?.selectedModel || payload.session?.model || resolvedEntry.model;
        const nextFastMode =
          payload.session?.fastMode === i18n.sessionOverview.fastMode.on ||
          payload.session?.fastMode === "开启" ||
          payload.session?.fastMode === true ||
          payload.fastMode === true;
        const nextThinkMode = payload.session?.thinkMode || resolvedEntry.thinkMode || "off";
        invalidateRuntimeRequestForTab(targetTabId);

        updateTabIdentity(targetTabId, {
          agentId: nextAgentId,
          sessionUser: nextSessionUser,
        });
        updateTabMeta(targetTabId, {
          agentId: nextAgentId,
          fastMode: nextFastMode,
          model: nextModel,
          sessionUser: nextSessionUser,
          thinkMode: nextThinkMode,
        });

        const displayConversation =
          Array.isArray(payload.conversation) && payload.conversation.length
            ? payload.conversation
            : [
                {
                  role: "assistant",
                  content: payload.outputText,
                  timestamp: Date.now(),
                  ...(payload.tokenBadge ? { tokenBadge: payload.tokenBadge } : {}),
                },
              ];

        setMessagesForTab(targetTabId, displayConversation);
        updateTabSession(targetTabId, (current) => ({
          ...current,
          ...(payload.session || {}),
          agentId: nextAgentId,
          selectedAgentId: nextAgentId,
          model: nextModel || current.model,
          selectedModel: nextModel || current.selectedModel,
          sessionUser: nextSessionUser,
          status: getLocalizedStatusLabel(payload.metadata?.status, i18n) || i18n.common.idle,
          thinkMode: nextThinkMode,
        }));

        if (isTabActive(targetTabId)) {
          applySnapshot(payload, { syncConversation: false });
        }
        return;
      }

      setMessagesForTab(targetTabId, (current) =>
        replacePendingAssistantMessage(
          current,
          pendingMessage.timestamp,
          payload.outputText,
          payload.tokenBadge,
          false,
          payload.assistantMessageId || pendingMessage.id,
        ),
      );
      const sessionPatch = payload.sessionSync || payload.sessionPatch || payload.session || {};
      updateTabSession(targetTabId, (current) => ({
        ...current,
        ...sessionPatch,
        status: getLocalizedStatusLabel(payload.metadata?.status, i18n) || i18n.common.idle,
      }));
      updateTabMeta(targetTabId, (current) => ({
        ...current,
        agentId: sessionPatch.agentId || current.agentId || resolvedEntry.agentId,
        model: sessionPatch.selectedModel || sessionPatch.model || current.model || resolvedEntry.model || "",
        sessionUser: sessionPatch.sessionUser || current.sessionUser || resolvedEntry.sessionUser,
        thinkMode: sessionPatch.thinkMode || current.thinkMode || resolvedEntry.thinkMode || "off",
      }));

      if (isTabActive(targetTabId) && payload.session) {
        applySnapshot(payload, { syncConversation: Array.isArray(payload.conversation) });
      }
    } catch (error) {
      if (navigationAwayRef.current) {
        return;
      }
      const stopRequested = Boolean(stopRequestedByTabRef.current[targetTabId]) || isAbortError(error);
      const partialOutputText = String(error?.partialOutputText || "");
      if (stopRequested) {
        turnStopped = true;
        const stoppedContent = partialOutputText.trim() || i18n.chat.stoppedResponse;
        setMessagesForTab(targetTabId, (current) =>
          replacePendingAssistantMessage(
            current,
            pendingMessage.timestamp,
            stoppedContent,
            String(error?.tokenBadge || ""),
            false,
            String(error?.assistantMessageId || pendingMessage.id),
          ),
        );
        updateTabSession(targetTabId, (current) => ({ ...current, status: i18n.common.idle }));
        return;
      }
      const preservedContent = partialOutputText.trim()
        ? partialOutputText
        : `${i18n.common.requestFailed}\n${error.message}`;
      setMessagesForTab(targetTabId, (current) =>
        replacePendingAssistantMessage(
          current,
          pendingMessage.timestamp,
          preservedContent,
          String(error?.tokenBadge || ""),
          false,
          String(error?.assistantMessageId || pendingMessage.id),
        ),
      );
      updateTabSession(targetTabId, (current) => ({ ...current, status: i18n.common.failed }));
    } finally {
      if (navigationAwayRef.current) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(inFlightTurnsRef.current, targetTabId)) {
        const nextInFlightTurns = { ...inFlightTurnsRef.current };
        delete nextInFlightTurns[targetTabId];
        inFlightTurnsRef.current = nextInFlightTurns;
      }
      if (Object.prototype.hasOwnProperty.call(stopRequestedByTabRef.current, targetTabId)) {
        const nextStopRequested = { ...stopRequestedByTabRef.current };
        delete nextStopRequested[targetTabId];
        stopRequestedByTabRef.current = nextStopRequested;
      }
      if (turnStopped) {
        const stoppedEntry = {
          ...nextPendingEntry,
          stopped: true,
          stoppedAt: Date.now(),
          suppressPendingPlaceholder: true,
        };
        setPendingChatTurns((current) => ({
          ...current,
          [resolvedEntry.key]: stoppedEntry,
        }));
        persistOptimisticChatState({
          tabId: targetTabId,
          nextMessages: getMessagesForTab(targetTabId),
          pendingEntry: stoppedEntry,
        });
      } else {
        setPendingChatTurns((current) => {
          if (!current[resolvedEntry.key]) {
            return current;
          }
          const next = { ...current };
          delete next[resolvedEntry.key];
          return next;
        });
        persistOptimisticChatState({
          tabId: targetTabId,
          nextMessages: getMessagesForTab(targetTabId),
          clearPendingKey: resolvedEntry.key,
        });
      }
      setBusyForTab(targetTabId, false);
    }
  }, [
    applySnapshot,
    getMessagesForTab,
    invalidateRuntimeRequestForTab,
    i18n,
    isTabActive,
    persistOptimisticChatState,
    resolvedActiveTabId,
    setBusyForTab,
    setMessagesForTab,
    setPendingChatTurns,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);

  useEffect(() => {
    const nextEntry = queuedMessages.find((item) => {
      const targetTabId = item.tabId || resolvedActiveTabId;
      if (Object.prototype.hasOwnProperty.call(busyByTabId, targetTabId)) {
        return !busyByTabId[targetTabId];
      }
      return !busy;
    });
    if (!nextEntry) {
      return;
    }

    setQueuedMessages((current) => current.filter((item) => item.id !== nextEntry.id));
    runChatTurn(nextEntry).catch(() => {});
  }, [busy, busyByTabId, queuedMessages, resolvedActiveTabId, runChatTurn]);

  const handleAddAttachments = async (fileList) => {
    const selectedFiles = Array.from(fileList || []).filter(Boolean);
    if (!selectedFiles.length) {
      return;
    }

    const nextAttachments = await Promise.all(
      selectedFiles.map(async (file) => {
        const localPath =
          typeof file.path === "string" && file.path.trim()
            ? file.path.trim()
            : typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
              ? file.webkitRelativePath.trim()
              : "";
        const baseAttachment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          ...(localPath ? { path: localPath, fullPath: localPath } : {}),
        };

        if (isImageAttachmentFile(file)) {
          const dataUrl = await readFileAsDataUrl(file);
          return {
            ...baseAttachment,
            kind: "image",
            dataUrl,
            previewUrl: dataUrl,
          };
        }

        if (isTextAttachmentFile(file)) {
          const textContent = await readFileAsText(file);
          return {
            ...baseAttachment,
            kind: "text",
            textContent: textContent.slice(0, 120_000),
            truncated: textContent.length > 120_000,
          };
        }

        return {
          ...baseAttachment,
          kind: "file",
        };
      }),
    );

    setComposerAttachments((current) => [...current, ...nextAttachments]);
  };

  const handleRemoveAttachment = (attachmentId) => {
    setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const enqueueOrRunEntry = async (entry) => {
    const targetTabId = entry.tabId || resolvedActiveTabId;
    const resolvedEntry = withOptimisticTurnIds({ ...entry, tabId: targetTabId });
    const fingerprint = createEntryFingerprint(resolvedEntry);
    const lastAcceptedEntry = lastAcceptedEntryByTabRef.current[targetTabId] || null;
    const entryTimestamp = Number(resolvedEntry.timestamp || Date.now());
    const hasQueuedForTab = queuedMessages.some((item) => (item.tabId || targetTabId) === targetTabId);
    const isBusyForTarget = Object.prototype.hasOwnProperty.call(busyByTabId, targetTabId) ? busyByTabId[targetTabId] : busy;
    const shouldGuardRapidDuplicate = isBusyForTarget || hasQueuedForTab;
    const isRapidDuplicate =
      lastAcceptedEntry
      && lastAcceptedEntry.fingerprint === fingerprint
      && entryTimestamp - lastAcceptedEntry.timestamp <= duplicateSendGuardWindowMs;
    if (shouldGuardRapidDuplicate && isRapidDuplicate) {
      return;
    }

    const hasEquivalentQueuedEntry = queuedMessages.some(
      (item) =>
        (item.tabId || targetTabId) === targetTabId
        && createEntryFingerprint(item) === fingerprint,
    );
    if (hasEquivalentQueuedEntry) {
      return;
    }

    lastAcceptedEntryByTabRef.current = {
      ...lastAcceptedEntryByTabRef.current,
      [targetTabId]: {
        fingerprint,
        timestamp: entryTimestamp,
      },
    };

    if (isBusyForTarget || hasQueuedForTab) {
      const currentMessages = getMessagesForTab(targetTabId);
      const queuedMessagesForTab = ensureOptimisticTurnMessages(
        currentMessages,
        resolvedEntry,
        i18n.chat.thinkingPlaceholder,
        { includePendingPlaceholder: false },
      );
      setMessagesForTab(targetTabId, queuedMessagesForTab);
      persistOptimisticChatState({
        tabId: targetTabId,
        nextMessages: queuedMessagesForTab,
      });
      setQueuedMessages((current) => [...current, resolvedEntry]);
      return;
    }

    await runChatTurn(resolvedEntry);
  };

  return {
    activeQueuedMessages,
    composerAttachments,
    enqueueOrRunEntry,
    handleAddAttachments,
    handleRemoveAttachment,
    handleStop,
    setComposerAttachments,
    setQueuedMessages,
  };
}
