import { useEffect, useMemo, useState } from "react";
import {
  isImageAttachmentFile,
  isTextAttachmentFile,
  readFileAsDataUrl,
  readFileAsText,
} from "@/features/chat/chat-utils";

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

  const runChatTurn = async (entry) => {
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
        }),
      });
      const payload = await response.json();
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
            status: payload.metadata?.status || i18n.common.idle,
          }));
          return;
        }

        setMessagesSynced((current) => {
          const withoutPending = current.filter((item) => !item.pending);
          return [
            ...withoutPending,
            {
              role: "assistant",
              content: payload.outputText,
              timestamp: Date.now(),
              ...(payload.tokenBadge ? { tokenBadge: payload.tokenBadge } : {}),
            },
          ];
        });
        applySnapshot(payload, { syncConversation: false });
      }
      if (shouldApply) {
        setSession((current) => ({ ...current, status: payload.metadata?.status || i18n.common.idle }));
      }
    } catch (error) {
      const shouldApply =
        activeTargetRef.current.sessionUser === entry.sessionUser &&
        activeTargetRef.current.agentId === entry.agentId;

      if (shouldApply) {
        setMessagesSynced((current) => {
          const withoutPending = current.filter((item) => !item.pending);
          return [
            ...withoutPending,
            {
              role: "assistant",
              content: `${i18n.common.requestFailed}\n${error.message}`,
              timestamp: Date.now(),
            },
          ];
        });
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
  };

  useEffect(() => {
    if (busy || !activeQueuedMessages.length) {
      return;
    }

    const [nextEntry] = activeQueuedMessages;
    setQueuedMessages((current) => current.filter((item) => item.id !== nextEntry.id));
    runChatTurn(nextEntry).catch(() => {});
  }, [activeQueuedMessages, busy]);

  const handleAddAttachments = async (fileList) => {
    const selectedFiles = Array.from(fileList || []).filter(Boolean);
    if (!selectedFiles.length) {
      return;
    }

    const nextAttachments = await Promise.all(
      selectedFiles.map(async (file) => {
        const baseAttachment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
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
