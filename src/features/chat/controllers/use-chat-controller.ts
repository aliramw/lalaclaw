import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment, ChatControllerEntry, ChatMessage, ChatStreamPayload, ConversationPendingMap, PendingChatTurn } from "@/types/chat";
import {
  buildChatRequestBody,
  getQueueState,
  hasEquivalentQueuedEntry,
} from "@/features/chat/controllers/chat-request-helpers";
import {
  consumeChatStream,
  conversationIncludesUserTurn,
  hasVisibleAssistantContent,
  isAbortError,
  isNdjsonStreamResponse,
  shouldSuppressPendingPlaceholder,
} from "@/features/chat/controllers/chat-stream-helpers";
import {
  createEntryFingerprint,
  createPendingAssistantMessage,
  createUserMessage,
  ensureOptimisticTurnMessages,
  removeOptimisticTurnMessages,
  replaceAssistantPreservingTurn,
  withOptimisticTurnIds,
} from "@/features/chat/controllers/chat-turn-helpers";
import {
  isImageAttachmentFile,
  isTextAttachmentFile,
  readFileAsDataUrl,
  readFileAsText,
} from "@/features/chat/utils";
import { getLocalizedStatusLabel } from "@/features/session/status-display";
import { apiFetch } from "@/lib/api-client";
import { pushCcDebugEvent, summarizeCcMessages } from "@/lib/cc-debug-events";

const duplicateSendGuardWindowMs = 1500;

type SessionState = Record<string, unknown>;
type Identity = { agentId?: string; sessionUser?: string } | null;
type SessionUpdater = SessionState | ((current: SessionState) => SessionState);
type MessageUpdater = ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[]);
type PendingUpdater = ConversationPendingMap | ((current: ConversationPendingMap) => ConversationPendingMap);
type TabMutation<T> = T | ((current: T) => T);
type LocalChatFile = File & { path?: string; webkitRelativePath?: string };
type InFlightTurn = {
  abortController: AbortController;
  agentId?: string;
  sessionUser?: string;
};
type PersistOptimisticPayload = {
  tabId: string;
  nextMessages?: ChatMessage[];
  pendingEntry?: PendingChatTurn;
  clearPendingKey?: string;
};

function normalizeAttachmentSignaturePart(value: unknown = "") {
  return String(value || "").trim();
}

function getComposerAttachmentMergeSignatures(attachment: ChatAttachment | null | undefined, index = 0) {
  const normalizedAttachment = attachment && typeof attachment === "object" ? attachment : {};
  const signatures: string[] = [];
  const previewUrl = normalizeAttachmentSignaturePart(normalizedAttachment.previewUrl);
  const dataUrl = normalizeAttachmentSignaturePart(normalizedAttachment.dataUrl);
  const resolvedPath = normalizeAttachmentSignaturePart(normalizedAttachment.fullPath || normalizedAttachment.path);
  const textContent = normalizeAttachmentSignaturePart(normalizedAttachment.textContent);
  const name = normalizeAttachmentSignaturePart(normalizedAttachment.name).toLowerCase();
  const mimeType = normalizeAttachmentSignaturePart(normalizedAttachment.mimeType).toLowerCase();
  const kind = normalizeAttachmentSignaturePart(normalizedAttachment.kind).toLowerCase();
  const size = Number.isFinite(normalizedAttachment.size) ? String(normalizedAttachment.size) : "";

  if (previewUrl) {
    signatures.push(`preview|${previewUrl}`);
  }
  if (dataUrl) {
    signatures.push(`data|${dataUrl}`);
  }
  if (resolvedPath) {
    signatures.push(`path|${resolvedPath}`);
  }
  if (textContent) {
    signatures.push(`text|${name}|${mimeType}|${textContent}`);
  }
  if (name && (mimeType || kind || size)) {
    signatures.push(`named|${name}|${mimeType}|${kind}|${size}`);
  }
  if (!signatures.length) {
    signatures.push(`index|${index}`);
  }

  return signatures;
}

function getComposerAttachmentPayloadScore(attachment: ChatAttachment | null | undefined) {
  const normalizedAttachment = attachment && typeof attachment === "object" ? attachment : {};
  let score = 0;

  if (normalizeAttachmentSignaturePart(normalizedAttachment.previewUrl)) {
    score += 64;
  }
  if (normalizeAttachmentSignaturePart(normalizedAttachment.dataUrl)) {
    score += 32;
  }
  if (normalizeAttachmentSignaturePart(normalizedAttachment.fullPath)) {
    score += 16;
  }
  if (normalizeAttachmentSignaturePart(normalizedAttachment.path)) {
    score += 8;
  }
  if (normalizeAttachmentSignaturePart(normalizedAttachment.textContent)) {
    score += 4;
  }
  if (normalizeAttachmentSignaturePart(normalizedAttachment.mimeType)) {
    score += 2;
  }
  if (normalizeAttachmentSignaturePart(normalizedAttachment.name)) {
    score += 1;
  }

  return score;
}

function mergeComposerAttachmentRecords(
  left: ChatAttachment | null | undefined,
  right: ChatAttachment | null | undefined,
): ChatAttachment {
  const leftAttachment = left && typeof left === "object" ? left : {};
  const rightAttachment = right && typeof right === "object" ? right : {};
  const preferredAttachment =
    getComposerAttachmentPayloadScore(rightAttachment) >= getComposerAttachmentPayloadScore(leftAttachment)
      ? rightAttachment
      : leftAttachment;
  const fallbackAttachment = preferredAttachment === rightAttachment ? leftAttachment : rightAttachment;

  return {
    ...fallbackAttachment,
    ...preferredAttachment,
    id: preferredAttachment.id || fallbackAttachment.id,
    kind: preferredAttachment.kind || fallbackAttachment.kind,
    name: preferredAttachment.name || fallbackAttachment.name,
    mimeType: preferredAttachment.mimeType || fallbackAttachment.mimeType,
    size: preferredAttachment.size ?? fallbackAttachment.size,
    path: preferredAttachment.path || fallbackAttachment.path,
    fullPath: preferredAttachment.fullPath || fallbackAttachment.fullPath,
    dataUrl: preferredAttachment.dataUrl || fallbackAttachment.dataUrl,
    previewUrl: preferredAttachment.previewUrl || fallbackAttachment.previewUrl,
    textContent: preferredAttachment.textContent || fallbackAttachment.textContent,
    truncated: preferredAttachment.truncated ?? fallbackAttachment.truncated,
  };
}

function dedupeComposerAttachments(attachments: ChatAttachment[] = []) {
  const dedupedAttachments: ChatAttachment[] = [];

  attachments.forEach((attachment, index) => {
    const signatures = new Set(getComposerAttachmentMergeSignatures(attachment, index));
    const existingIndex = dedupedAttachments.findIndex((candidate, candidateIndex) =>
      getComposerAttachmentMergeSignatures(candidate, candidateIndex).some((signature) => signatures.has(signature)));

    if (existingIndex === -1) {
      dedupedAttachments.push(attachment);
      return;
    }

    dedupedAttachments[existingIndex] = mergeComposerAttachmentRecords(dedupedAttachments[existingIndex], attachment);
  });

  return dedupedAttachments;
}

type UseChatControllerInput = {
  activateStopOverride?: () => void;
  activeConversationKey?: string;
  activeChatTabId?: string;
  applySnapshot?: (payload: ChatStreamPayload, options?: { syncConversation?: boolean }) => void;
  busy?: boolean;
  busyByTabId?: Record<string, boolean>;
  getActiveIdentity?: () => Identity;
  getMessagesForTab?: (tabId: string) => ChatMessage[];
  invalidateRuntimeRequestForTab?: (tabId: string) => void;
  i18n: {
    chat: { thinkingPlaceholder: string; stoppedResponse: string };
    common: { idle: string; failed: string; running: string; requestFailed: string };
    sessionOverview: { fastMode: { on: string } };
  };
  isTabActive?: (tabId: string) => boolean;
  messagesRef?: { current: ChatMessage[] };
  persistOptimisticChatState?: (payload: PersistOptimisticPayload) => void;
  setBusy?: (value: boolean) => void;
  setBusyForTab?: (tabId: string, value: boolean) => void;
  setMessagesSynced?: (value: MessageUpdater) => void;
  setMessagesForTab?: (tabId: string, value: MessageUpdater) => void;
  setPendingChatTurns: (value: PendingUpdater) => void;
  setSession?: (value: SessionUpdater) => void;
  userLabel?: string;
  updateTabIdentity?: (tabId: string, value: TabMutation<Record<string, unknown>>) => void;
  updateTabMeta?: (tabId: string, value: TabMutation<Record<string, unknown>>) => void;
  updateTabSession?: (tabId: string, value: SessionUpdater) => void;
};

export function useChatController({
  activateStopOverride,
  activeConversationKey,
  activeChatTabId = "",
  applySnapshot,
  busy = false,
  busyByTabId = {},
  getActiveIdentity,
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
  userLabel = "",
  updateTabIdentity = () => {},
  updateTabMeta = () => {},
  updateTabSession: updateTabSessionProp,
}: UseChatControllerInput) {
  const [queuedMessages, setQueuedMessages] = useState<ChatControllerEntry[]>([]);
  const [composerAttachments, setComposerAttachments] = useState<ChatAttachment[]>([]);
  const [dispatchReleaseTick, setDispatchReleaseTick] = useState(0);
  const lastAcceptedEntryByTabRef = useRef<Record<string, { fingerprint: string; timestamp: number }>>({});
  const dispatchingTurnByTabRef = useRef<Record<string, string | true>>({});
  const inFlightTurnsRef = useRef<Record<string, InFlightTurn>>({});
  const navigationAwayRef = useRef(false);
  const stopRequestedByTabRef = useRef<Record<string, boolean>>({});
  const resolvedActiveTabId = activeChatTabId || activeConversationKey || "active";
  const getMessagesForTab = useCallback(
    (tabId: string) => {
      if (typeof getMessagesForTabProp === "function") {
        return getMessagesForTabProp(tabId);
      }
      return messagesRef?.current || [];
    },
    [getMessagesForTabProp, messagesRef],
  );
  const setMessagesForTab = useCallback(
    (tabId: string, value: MessageUpdater) => {
      if (typeof setMessagesForTabProp === "function") {
        setMessagesForTabProp(tabId, value);
        return;
      }
      setMessagesSynced?.(value);
    },
    [setMessagesForTabProp, setMessagesSynced],
  );
  const setBusyForTab = useCallback(
    (tabId: string, value: boolean) => {
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
    (tabId: string, value: SessionUpdater) => {
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
    (tabId: string) => {
      if (typeof isTabActiveProp === "function") {
        return isTabActiveProp(tabId);
      }
      return tabId === resolvedActiveTabId;
    },
    [isTabActiveProp, resolvedActiveTabId],
  );

  const handleStop = useCallback(async (tabId = resolvedActiveTabId) => {
    const activeTurn = inFlightTurnsRef.current[tabId];

    const identity = activeTurn
      ? { agentId: activeTurn.agentId, sessionUser: activeTurn.sessionUser }
      : typeof getActiveIdentity === "function" ? getActiveIdentity() : null;

    if (!identity?.agentId) {
      return false;
    }

    stopRequestedByTabRef.current = {
      ...stopRequestedByTabRef.current,
      [tabId]: true,
    };

    activeTurn?.abortController?.abort?.();

    try {
      await apiFetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: identity.agentId,
          sessionUser: identity.sessionUser,
        }),
      });
    } catch {}

    if (!activeTurn) {
      activateStopOverride?.();
      setBusyForTab(tabId, false);
      invalidateRuntimeRequestForTab(tabId);
      setSession?.((current) => ({ ...current, status: i18n.common.idle }));
      setPendingChatTurns((current) => {
        if (!activeConversationKey || !current[activeConversationKey]) {
          return current;
        }
        const next = { ...current };
        delete next[activeConversationKey];
        return next;
      });
      persistOptimisticChatState({
        clearPendingKey: activeConversationKey,
        tabId,
      });
    }

    return true;
  }, [resolvedActiveTabId, getActiveIdentity, activateStopOverride, activeConversationKey, setBusyForTab, invalidateRuntimeRequestForTab, persistOptimisticChatState, setSession, setPendingChatTurns, i18n?.common?.idle]);

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


  const runChatTurn = useCallback(async (entry: ChatControllerEntry) => {
    const resolvedEntry = withOptimisticTurnIds(entry);
    const targetTabId = resolvedEntry.tabId || resolvedActiveTabId;
    pushCcDebugEvent("chat.run.start", {
      tabId: targetTabId,
      entryId: resolvedEntry.id,
      content: resolvedEntry.content,
      queueLength: queuedMessages.length,
    });
    const currentMessages = getMessagesForTab(targetTabId);
    const suppressPendingPlaceholder = shouldSuppressPendingPlaceholder(resolvedEntry);
    const pendingMessage = createPendingAssistantMessage(resolvedEntry, i18n.chat.thinkingPlaceholder);
    const userMessage = createUserMessage(resolvedEntry);
    const resolvedEntryKey = String(
      resolvedEntry.key || resolvedEntry.id || pendingMessage.id || pendingMessage.timestamp || Date.now(),
    ).trim();
    const resolvedPendingTimestamp = Number(
      pendingMessage.timestamp || resolvedEntry.pendingTimestamp || resolvedEntry.timestamp || Date.now(),
    );
    const resolvedPendingAssistantMessageId = String(
      pendingMessage.id || resolvedEntry.assistantMessageId || `msg-assistant-pending-${resolvedPendingTimestamp}`,
    );
    const resolvedUserMessageId = String(
      userMessage.id || resolvedEntry.userMessageId || `msg-user-${resolvedPendingTimestamp}`,
    );
    const resolvedUserMessageContent = String(userMessage.content || "");
    const resolvedUserMessageTimestamp = Number(userMessage.timestamp || resolvedEntry.timestamp || Date.now());
    const nextPendingEntry: PendingChatTurn = {
      key: resolvedEntryKey,
      startedAt: Date.now(),
      pendingTimestamp: resolvedPendingTimestamp,
      assistantMessageId: resolvedPendingAssistantMessageId,
      userMessage: {
        id: resolvedUserMessageId,
        role: "user" as const,
        content: resolvedUserMessageContent,
        timestamp: resolvedUserMessageTimestamp,
        ...(userMessage.attachments?.length ? { attachments: userMessage.attachments } : {}),
      },
      ...(suppressPendingPlaceholder ? { suppressPendingPlaceholder: true } : {}),
    };
    invalidateRuntimeRequestForTab(targetTabId);
    const nextMessages = ensureOptimisticTurnMessages(
      currentMessages,
      resolvedEntry,
      i18n.chat.thinkingPlaceholder,
      {
        includePendingPlaceholder: !suppressPendingPlaceholder,
        includeUserMessage: true,
      },
    );
    setMessagesForTab(targetTabId, nextMessages);
    updateTabSession(targetTabId, (current) => ({ ...current, status: i18n.common.running }));
    setBusyForTab(targetTabId, true);
    setPendingChatTurns((current) => ({
      ...current,
      [resolvedEntryKey]: nextPendingEntry,
    }));
    persistOptimisticChatState({
      tabId: targetTabId,
      nextMessages,
      pendingEntry: nextPendingEntry,
    });
    let turnStopped = false;
    let latestPartialOutputText = "";
    let latestAssistantMessageId = resolvedPendingAssistantMessageId;
    let latestTokenBadge = "";
    let retainPendingUntilRuntimeCatchup = false;
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
      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify(buildChatRequestBody({
          entry: resolvedEntry,
          assistantMessageId: resolvedPendingAssistantMessageId,
          messages: nextMessages,
          userLabel,
        })),
      });
      const streamEntry = { ...resolvedEntry, tabId: targetTabId };
      const payload = isNdjsonStreamResponse(response)
        ? await consumeChatStream(response, {
            entry: streamEntry,
            onProgress: ({ assistantMessageId, lastDeltaAt, streamText, tokenBadge }) => {
              latestPartialOutputText = streamText;
              latestAssistantMessageId = assistantMessageId || latestAssistantMessageId;
              latestTokenBadge = tokenBadge || latestTokenBadge;
              setPendingChatTurns((current) => {
                const currentEntry = current[resolvedEntryKey];
                if (!currentEntry) {
                  return current;
                }

                return {
                  ...current,
                  [resolvedEntryKey]: {
                    ...currentEntry,
                    ...(assistantMessageId ? { assistantMessageId } : {}),
                    lastDeltaAt,
                    streamText,
                    ...(tokenBadge ? { tokenBadge } : {}),
                  },
                };
              });
            },
            pendingTimestamp: resolvedPendingTimestamp,
          })
        : await response.json() as ChatStreamPayload;
      latestPartialOutputText = String(payload.outputText || latestPartialOutputText || "");
      latestAssistantMessageId = String(payload.assistantMessageId || latestAssistantMessageId || resolvedPendingAssistantMessageId);
      latestTokenBadge = String(payload.tokenBadge || latestTokenBadge || "");
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Request failed");
      }
      pushCcDebugEvent("chat.run.response", {
        tabId: targetTabId,
        entryId: resolvedEntry.id,
        hasConversation: Array.isArray(payload.conversation),
        outputText: String(payload.outputText || "").slice(0, 120),
        assistantMessageId: payload.assistantMessageId || resolvedPendingAssistantMessageId,
      });

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
                  content: String(payload.outputText || ""),
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
          applySnapshot?.(payload, { syncConversation: false });
        }
        return;
      }

      setMessagesForTab(targetTabId, (current) => {
        const nextMessages = replaceAssistantPreservingTurn(
          current,
          {
            ...resolvedEntry,
            pendingTimestamp: resolvedPendingTimestamp,
          },
          i18n.chat.thinkingPlaceholder,
          String(payload.outputText || ""),
          String(payload.tokenBadge || ""),
          false,
          payload.assistantMessageId || resolvedPendingAssistantMessageId,
        );
        pushCcDebugEvent("chat.messages.replace-assistant", {
          tabId: targetTabId,
          entryId: resolvedEntry.id,
          before: summarizeCcMessages(current),
          after: summarizeCcMessages(nextMessages),
        });
        return nextMessages;
      });
      const sessionPatch = (
        payload.sessionSync
        || payload.sessionPatch
        || payload.session
        || {}
      ) as Record<string, unknown>;
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

      const isSessionResetCommand = /^\/(?:new|reset)(?:\s|$)/i.test(String(resolvedEntry.content || "").trim());
      const payloadIncludesUserTurn = Array.isArray(payload.conversation)
        && conversationIncludesUserTurn(payload.conversation, resolvedEntry);
      const payloadHasFinalAssistantReply = hasVisibleAssistantContent(String(payload.outputText || ""));
      const canSyncConversationFromPayload = Array.isArray(payload.conversation)
        && (isSessionResetCommand || payloadIncludesUserTurn);
      retainPendingUntilRuntimeCatchup = !isSessionResetCommand && !payloadIncludesUserTurn && !payloadHasFinalAssistantReply;

      if (isTabActive(targetTabId) && payload.session) {
        applySnapshot?.(payload, { syncConversation: canSyncConversationFromPayload });
      }
    } catch (error) {
      pushCcDebugEvent("chat.run.error", {
        tabId: targetTabId,
        entryId: resolvedEntry.id,
        message: String(error?.message || error || ""),
      });
      if (navigationAwayRef.current) {
        return;
      }
      const stopRequested = Boolean(stopRequestedByTabRef.current[targetTabId]) || isAbortError(error);
      const runtimeError = error as Error & {
        partialOutputText?: string;
        tokenBadge?: string;
        assistantMessageId?: string;
      };
      const partialOutputText = String(runtimeError?.partialOutputText || "");
      latestPartialOutputText = partialOutputText || latestPartialOutputText;
      latestAssistantMessageId = String(runtimeError?.assistantMessageId || latestAssistantMessageId || resolvedPendingAssistantMessageId);
      latestTokenBadge = String(runtimeError?.tokenBadge || latestTokenBadge || "");
      if (stopRequested) {
        turnStopped = true;
        const stoppedContent = partialOutputText.trim() || i18n.chat.stoppedResponse;
        setMessagesForTab(targetTabId, (current) =>
          replaceAssistantPreservingTurn(
            current,
            {
              ...resolvedEntry,
              pendingTimestamp: resolvedPendingTimestamp,
            },
            i18n.chat.thinkingPlaceholder,
            stoppedContent,
            latestTokenBadge,
            false,
            latestAssistantMessageId,
          ),
        );
        updateTabSession(targetTabId, (current) => ({ ...current, status: i18n.common.idle }));
        return;
      }
      const preservedContent = partialOutputText.trim()
        ? partialOutputText
        : `${i18n.common.requestFailed}\n${runtimeError.message}`;
      setMessagesForTab(targetTabId, (current) =>
        replaceAssistantPreservingTurn(
          current,
          {
            ...resolvedEntry,
            pendingTimestamp: resolvedPendingTimestamp,
          },
          i18n.chat.thinkingPlaceholder,
          preservedContent,
          latestTokenBadge,
          false,
          latestAssistantMessageId,
        ),
      );
      updateTabSession(targetTabId, (current) => ({ ...current, status: i18n.common.failed }));
    } finally {
      if (!navigationAwayRef.current) {
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
          pushCcDebugEvent("chat.run.finalize.stopped", {
            tabId: targetTabId,
            entryId: resolvedEntry.id,
          });
          const stoppedEntry: PendingChatTurn = {
            ...nextPendingEntry,
            ...(latestAssistantMessageId
              ? { assistantMessageId: String(latestAssistantMessageId) }
              : {}),
            ...(latestPartialOutputText.trim() ? { streamText: latestPartialOutputText } : {}),
            ...(latestTokenBadge ? { tokenBadge: latestTokenBadge } : {}),
            stopped: true,
            stoppedAt: Date.now(),
            suppressPendingPlaceholder: true,
          };
          setPendingChatTurns((current) => ({
            ...current,
            [resolvedEntryKey]: stoppedEntry,
          }));
          persistOptimisticChatState({
            tabId: targetTabId,
            nextMessages: getMessagesForTab(targetTabId),
            pendingEntry: stoppedEntry,
          });
        } else if (retainPendingUntilRuntimeCatchup) {
          pushCcDebugEvent("chat.run.finalize.retained-pending", {
            tabId: targetTabId,
            entryId: resolvedEntry.id,
            assistantMessageId: latestAssistantMessageId || resolvedPendingAssistantMessageId,
          });
          const retainedPendingEntry: PendingChatTurn = {
            ...nextPendingEntry,
            ...(latestAssistantMessageId
              ? { assistantMessageId: String(latestAssistantMessageId) }
              : {}),
            ...(latestTokenBadge ? { tokenBadge: latestTokenBadge } : {}),
            suppressPendingPlaceholder: true,
          };
          setPendingChatTurns((current) => ({
            ...current,
            [resolvedEntryKey]: retainedPendingEntry,
          }));
          persistOptimisticChatState({
            tabId: targetTabId,
            nextMessages: getMessagesForTab(targetTabId),
            pendingEntry: retainedPendingEntry,
          });
        } else {
          pushCcDebugEvent("chat.run.finalize.cleared", {
            tabId: targetTabId,
            entryId: resolvedEntry.id,
          });
          setPendingChatTurns((current) => {
            if (!current[resolvedEntryKey]) {
              return current;
            }
            const next = { ...current };
            delete next[resolvedEntryKey];
            return next;
          });
          persistOptimisticChatState({
            tabId: targetTabId,
            nextMessages: getMessagesForTab(targetTabId),
            clearPendingKey: resolvedEntryKey,
          });
        }
        setBusyForTab(targetTabId, false);
        pushCcDebugEvent("chat.run.finalize.busy-false", {
          tabId: targetTabId,
          entryId: resolvedEntry.id,
        });
        setDispatchReleaseTick((current) => current + 1);
      }
    }
  }, [
    applySnapshot,
    getMessagesForTab,
    invalidateRuntimeRequestForTab,
    i18n,
    isTabActive,
    persistOptimisticChatState,
    queuedMessages.length,
    resolvedActiveTabId,
    setBusyForTab,
    setMessagesForTab,
    setPendingChatTurns,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
    userLabel,
  ]);

  useEffect(() => {
    const nextEntry = queuedMessages.find((item) => {
      const targetTabId = item.tabId || resolvedActiveTabId;
      if (dispatchingTurnByTabRef.current[targetTabId] || inFlightTurnsRef.current[targetTabId]) {
        return false;
      }
      if (Object.prototype.hasOwnProperty.call(busyByTabId, targetTabId)) {
        return !busyByTabId[targetTabId];
      }
      return !busy;
    });
    if (!nextEntry) {
      return;
    }

    pushCcDebugEvent("chat.queue.dequeue", {
      tabId: nextEntry.tabId || resolvedActiveTabId,
      entryId: nextEntry.id,
      content: nextEntry.content,
      queueLength: queuedMessages.length,
    });
    setQueuedMessages((current) => current.filter((item) => item.id !== nextEntry.id));
    runChatTurn(nextEntry).catch(() => {});
  }, [busy, busyByTabId, dispatchReleaseTick, queuedMessages, resolvedActiveTabId, runChatTurn]);

  const handleAddAttachments = async (fileList: ArrayLike<LocalChatFile> | null | undefined) => {
    const selectedFiles = Array.from(fileList || []).filter(Boolean) as LocalChatFile[];
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

    setComposerAttachments((current) => dedupeComposerAttachments([...current, ...nextAttachments]));
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const clearLastAcceptedEntryForTab = useCallback((tabId: string, entry: ChatControllerEntry | null = null) => {
    const normalizedTabId = String(tabId || resolvedActiveTabId || "").trim();
    if (!normalizedTabId) {
      return;
    }

    const lastAcceptedEntry = lastAcceptedEntryByTabRef.current[normalizedTabId];
    if (!lastAcceptedEntry) {
      return;
    }

    if (entry) {
      const entryFingerprint = createEntryFingerprint(entry);
      const entryTimestamp = Number(entry.timestamp || 0);
      if (lastAcceptedEntry.fingerprint !== entryFingerprint || lastAcceptedEntry.timestamp !== entryTimestamp) {
        return;
      }
    }

    const nextAcceptedEntries = { ...lastAcceptedEntryByTabRef.current };
    delete nextAcceptedEntries[normalizedTabId];
    lastAcceptedEntryByTabRef.current = nextAcceptedEntries;
  }, [resolvedActiveTabId]);

  const consumeQueuedEntry = useCallback((entryId: string) => {
    const normalizedEntryId = String(entryId || "").trim();
    if (!normalizedEntryId) {
      return null;
    }

    const queuedEntry = queuedMessages.find((item) => String(item?.id || "").trim() === normalizedEntryId);
    if (!queuedEntry) {
      return null;
    }

    const targetTabId = queuedEntry.tabId || resolvedActiveTabId;
    const nextMessages = removeOptimisticTurnMessages(getMessagesForTab(targetTabId), queuedEntry);
    setQueuedMessages((current) => current.filter((item) => String(item?.id || "").trim() !== normalizedEntryId));
    setMessagesForTab(targetTabId, nextMessages);
    clearLastAcceptedEntryForTab(targetTabId, queuedEntry);
    persistOptimisticChatState({
      tabId: targetTabId,
      nextMessages,
    });
    return queuedEntry;
  }, [clearLastAcceptedEntryForTab, getMessagesForTab, persistOptimisticChatState, queuedMessages, resolvedActiveTabId, setMessagesForTab]);

  const removeQueuedEntry = useCallback((entryId) => Boolean(consumeQueuedEntry(entryId)), [consumeQueuedEntry]);

  const editQueuedEntry = useCallback((entryId) => consumeQueuedEntry(entryId), [consumeQueuedEntry]);

  const clearQueuedEntries = useCallback((tabId = resolvedActiveTabId) => {
    const targetTabId = String(tabId || resolvedActiveTabId || "").trim();
    if (!targetTabId) {
      return 0;
    }

    const entriesToClear = queuedMessages.filter((item) => String(item?.tabId || resolvedActiveTabId || "").trim() === targetTabId);
    if (!entriesToClear.length) {
      return 0;
    }

    const nextMessages = entriesToClear.reduce(
      (current, entry) => removeOptimisticTurnMessages(current, entry),
      getMessagesForTab(targetTabId),
    );

    setQueuedMessages((current) =>
      current.filter((item) => String(item?.tabId || resolvedActiveTabId || "").trim() !== targetTabId),
    );
    setMessagesForTab(targetTabId, nextMessages);
    clearLastAcceptedEntryForTab(targetTabId);
    persistOptimisticChatState({
      tabId: targetTabId,
      nextMessages,
    });
    return entriesToClear.length;
  }, [clearLastAcceptedEntryForTab, getMessagesForTab, persistOptimisticChatState, queuedMessages, resolvedActiveTabId, setMessagesForTab]);

  const enqueueOrRunEntry = async (entry: ChatControllerEntry) => {
    const targetTabId = entry.tabId || resolvedActiveTabId;
    const resolvedEntry = withOptimisticTurnIds({ ...entry, tabId: targetTabId });
    const fingerprint = createEntryFingerprint(resolvedEntry);
    const lastAcceptedEntry = lastAcceptedEntryByTabRef.current[targetTabId] || null;
    const entryTimestamp = Number(resolvedEntry.timestamp || Date.now());
    const {
      hasQueuedForTab,
      isBusyForTarget,
      hasDispatchingTurnForTarget,
      hasInFlightTurnForTarget,
    } = getQueueState({
      targetTabId,
      queuedMessages,
      busy,
      busyByTabId,
      dispatchingTurnByTabId: dispatchingTurnByTabRef.current,
      inFlightTurnByTabId: inFlightTurnsRef.current,
    });
    const shouldGuardRapidDuplicate =
      isBusyForTarget
      || hasQueuedForTab
      || hasDispatchingTurnForTarget
      || hasInFlightTurnForTarget;
    const isRapidDuplicate =
      lastAcceptedEntry
      && lastAcceptedEntry.fingerprint === fingerprint
      && entryTimestamp - lastAcceptedEntry.timestamp <= duplicateSendGuardWindowMs;
    if (shouldGuardRapidDuplicate && isRapidDuplicate) {
      return;
    }

    if (hasEquivalentQueuedEntry({
      queuedMessages,
      targetTabId,
      fingerprint,
      createEntryFingerprint,
    })) {
      return;
    }

    lastAcceptedEntryByTabRef.current = {
      ...lastAcceptedEntryByTabRef.current,
      [targetTabId]: {
        fingerprint,
        timestamp: entryTimestamp,
      },
    };

    if (isBusyForTarget || hasQueuedForTab || hasDispatchingTurnForTarget || hasInFlightTurnForTarget) {
      pushCcDebugEvent("chat.queue.enqueue", {
        tabId: targetTabId,
        entryId: resolvedEntry.id,
        content: resolvedEntry.content,
        isBusyForTarget,
        hasQueuedForTab,
        hasDispatchingTurnForTarget,
        hasInFlightTurnForTarget,
      });
      setQueuedMessages((current) => [...current, resolvedEntry]);
      return;
    }

    dispatchingTurnByTabRef.current = {
      ...dispatchingTurnByTabRef.current,
      [targetTabId]: resolvedEntry.id || true,
    };
    try {
      await runChatTurn(resolvedEntry);
    } finally {
      if (dispatchingTurnByTabRef.current[targetTabId] === (resolvedEntry.id || true)) {
        const nextDispatchingTurns = { ...dispatchingTurnByTabRef.current };
        delete nextDispatchingTurns[targetTabId];
        dispatchingTurnByTabRef.current = nextDispatchingTurns;
        setDispatchReleaseTick((current) => current + 1);
      }
    }
  };

  return {
    activeQueuedMessages,
    composerAttachments,
    enqueueOrRunEntry,
    clearQueuedEntries,
    editQueuedEntry,
    handleAddAttachments,
    handleRemoveAttachment,
    handleStop,
    removeQueuedEntry,
    setComposerAttachments,
    setQueuedMessages,
  };
}
