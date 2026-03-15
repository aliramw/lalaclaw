import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isImageAttachmentFile,
  isTextAttachmentFile,
  readFileAsDataUrl,
  readFileAsText,
} from "@/features/chat/utils";
import { getLocalizedStatusLabel } from "@/features/session/status-display";

function isNdjsonStreamResponse(response) {
  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  return Boolean(response?.body) && contentType.includes("application/x-ndjson");
}

function replacePendingAssistantMessage(current = [], pendingTimestamp, content, tokenBadge = "") {
  const next = Array.isArray(current) ? [...current] : [];
  const assistantMessage = {
    role: "assistant",
    content,
    timestamp: pendingTimestamp,
    ...(tokenBadge ? { tokenBadge } : {}),
  };

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

async function consumeChatStream(response, { entry, pendingTimestamp, activeTargetRef, setMessagesSynced }) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return null;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let payload = null;
  let streamedText = "";
  let tokenBadge = "";

  const shouldApply = () =>
    activeTargetRef.current.sessionUser === entry.sessionUser &&
    activeTargetRef.current.agentId === entry.agentId;

  const pushStreamUpdate = () => {
    if (!shouldApply()) {
      return;
    }
    setMessagesSynced((current) => replacePendingAssistantMessage(current, pendingTimestamp, streamedText, tokenBadge));
  };

  const processLine = (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return;
    }

    const event = JSON.parse(trimmed);
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
      if (typeof payload?.outputText === "string") {
        streamedText = payload.outputText;
        pushStreamUpdate();
      }
      return;
    }

    if (event.type === "error") {
      throw new Error(event.error || "Request failed");
    }
  };

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

  if (buffer.trim()) {
    processLine(buffer);
  }

  return payload || {
    ok: true,
    outputText: streamedText,
    tokenBadge,
    metadata: {},
  };
}

export function useChatController({
  activeConversationKey,
  activeTargetRef,
  applySnapshot,
  busy,
  i18n,
  messagesRef,
  setBusy,
  setMessagesSynced,
  setPendingChatTurns,
  setSession,
}) {
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [composerAttachments, setComposerAttachments] = useState([]);

  const activeQueuedMessages = useMemo(
    () => queuedMessages.filter((item) => item.key === activeConversationKey),
    [activeConversationKey, queuedMessages],
  );

  const runChatTurn = useCallback(async (entry) => {
    const userMessage = {
      role: "user",
      content: entry.content || (entry.attachments?.length ? `已发送 ${entry.attachments.length} 个附件` : ""),
      timestamp: entry.timestamp,
      ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
    };
    const pendingMessage = { role: "assistant", content: i18n.chat.thinkingPlaceholder, timestamp: Date.now(), pending: true };
    const nextMessages = [...messagesRef.current, userMessage, pendingMessage];
    const isStillActive =
      activeTargetRef.current.sessionUser === entry.sessionUser &&
      activeTargetRef.current.agentId === entry.agentId;

    if (isStillActive) {
      setMessagesSynced(nextMessages);
      setSession((current) => ({ ...current, status: i18n.common.running }));
    }

    setBusy(true);
    setPendingChatTurns((current) => ({
      ...current,
      [entry.key]: {
        key: entry.key,
        startedAt: Date.now(),
        pendingTimestamp: pendingMessage.timestamp,
        userMessage: {
          role: "user",
          content: userMessage.content,
          timestamp: userMessage.timestamp,
          ...(userMessage.attachments?.length ? { attachments: userMessage.attachments } : {}),
        },
      },
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: entry.model,
          agentId: entry.agentId,
          sessionUser: entry.sessionUser,
          fastMode: entry.fastMode,
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
      const payload = isNdjsonStreamResponse(response)
        ? await consumeChatStream(response, {
            entry,
            pendingTimestamp: pendingMessage.timestamp,
            activeTargetRef,
            setMessagesSynced,
          })
        : await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Request failed");
      }

      const shouldApply =
        activeTargetRef.current.sessionUser === entry.sessionUser &&
        activeTargetRef.current.agentId === entry.agentId;

      if (shouldApply) {
        if (payload.resetSessionUser) {
          const nextSessionUser = payload.resetSessionUser;
          const nextAgentId = payload.session?.agentId || entry.agentId;
          const nextModel = payload.session?.selectedModel || payload.session?.model || entry.model;
          const nextFastMode =
            payload.session?.fastMode === i18n.sessionOverview.fastMode.on ||
            payload.session?.fastMode === "开启" ||
            payload.session?.fastMode === true ||
            payload.fastMode === true;

          entry.onSessionStateChange?.({
            agentId: nextAgentId,
            fastMode: nextFastMode,
            model: nextModel,
            sessionUser: nextSessionUser,
          });

          setQueuedMessages((current) =>
            current.filter((item) => item.key !== `${entry.sessionUser}:${entry.agentId}`),
          );

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

          setMessagesSynced(displayConversation);
          applySnapshot(payload, { syncConversation: false });
          setSession((current) => ({
            ...current,
            status: getLocalizedStatusLabel(payload.metadata?.status, i18n) || i18n.common.idle,
          }));
          return;
        }

        setMessagesSynced((current) =>
          replacePendingAssistantMessage(current, pendingMessage.timestamp, payload.outputText, payload.tokenBadge),
        );
        applySnapshot(payload, { syncConversation: false });
      }
      if (shouldApply) {
        setSession((current) => ({
          ...current,
          status: getLocalizedStatusLabel(payload.metadata?.status, i18n) || i18n.common.idle,
        }));
      }
    } catch (error) {
      const shouldApply =
        activeTargetRef.current.sessionUser === entry.sessionUser &&
        activeTargetRef.current.agentId === entry.agentId;

      if (shouldApply) {
        setMessagesSynced((current) =>
          replacePendingAssistantMessage(
            current,
            pendingMessage.timestamp,
            `${i18n.common.requestFailed}\n${error.message}`,
          ),
        );
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      }
    } finally {
      setPendingChatTurns((current) => {
        if (!current[entry.key]) {
          return current;
        }
        const next = { ...current };
        delete next[entry.key];
        return next;
      });
      setBusy(false);
    }
  }, [activeTargetRef, applySnapshot, i18n, messagesRef, setBusy, setMessagesSynced, setPendingChatTurns, setSession]);

  useEffect(() => {
    if (busy || !activeQueuedMessages.length) {
      return;
    }

    const [nextEntry] = activeQueuedMessages;
    setQueuedMessages((current) => current.filter((item) => item.id !== nextEntry.id));
    runChatTurn(nextEntry).catch(() => {});
  }, [activeQueuedMessages, busy, runChatTurn]);

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
    if (busy || activeQueuedMessages.length) {
      setQueuedMessages((current) => [...current, entry]);
      return;
    }

    await runChatTurn(entry);
  };

  return {
    activeQueuedMessages,
    busy,
    composerAttachments,
    enqueueOrRunEntry,
    handleAddAttachments,
    handleRemoveAttachment,
    setComposerAttachments,
    setQueuedMessages,
  };
}
