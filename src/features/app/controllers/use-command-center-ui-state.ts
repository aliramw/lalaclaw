import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatScrollState } from "@/types/chat";
import { createConversationKey } from "@/features/app/state/app-session-identity";
import { maxPromptRows } from "@/features/chat/utils";
import {
  areEquivalentChatScrollState,
  buildChatScrollStateSnapshot,
} from "@/features/app/controllers/use-command-center-helpers";

export type PromptConversationOptions = {
  flushDrafts?: boolean;
  syncVisible?: boolean;
};

type PromptHeightMetrics = {
  node: HTMLTextAreaElement | null;
  maxHeight: number;
};

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
};

type UseCommandCenterUiStateOptions = {
  activeConversationKey: string;
  prompt: string;
  promptRef: MutableRefObject<HTMLTextAreaElement | null>;
  promptValueRef: MutableRefObject<string>;
  promptDraftFlushTimeoutRef: MutableRefObject<number>;
  promptDraftsByConversationRef: MutableRefObject<Record<string, string>>;
  promptHeightMetricsRef: MutableRefObject<PromptHeightMetrics>;
  promptHeightFrameRef: MutableRefObject<number>;
  messageViewportRef: MutableRefObject<HTMLDivElement | null>;
  chatScrollTopByConversationRef: MutableRefObject<Record<string, ChatScrollState>>;
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  setPrompt: Dispatch<SetStateAction<string>>;
  setPromptDraftsByConversation: Dispatch<SetStateAction<Record<string, string>>>;
  setPromptSyncVersion: Dispatch<SetStateAction<number>>;
  schedulePersistedChatScrollTops: () => void;
};

export function useCommandCenterUiState({
  activeConversationKey,
  prompt,
  promptRef,
  promptValueRef,
  promptDraftFlushTimeoutRef,
  promptDraftsByConversationRef,
  promptHeightMetricsRef,
  promptHeightFrameRef,
  messageViewportRef,
  chatScrollTopByConversationRef,
  sessionStateRef,
  setPrompt,
  setPromptDraftsByConversation,
  setPromptSyncVersion,
  schedulePersistedChatScrollTops,
}: UseCommandCenterUiStateOptions) {
  const focusPrompt = useCallback(() => {
    window.requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;
      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      const end = textarea.value.length;
      if (
        end > 0 &&
        (textarea.selectionStart !== end || textarea.selectionEnd !== end)
      ) {
        textarea.setSelectionRange(end, end);
      }
    });
  }, [promptRef]);

  const resolvePromptMaxHeight = useCallback((textarea: HTMLTextAreaElement) => {
    const cached = promptHeightMetricsRef.current;
    if (cached.node === textarea && cached.maxHeight > 0) {
      return cached.maxHeight;
    }

    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const maxHeight = lineHeight * maxPromptRows + paddingTop + paddingBottom + borderTop + borderBottom;

    promptHeightMetricsRef.current = { node: textarea, maxHeight };
    return maxHeight;
  }, [promptHeightMetricsRef]);

  const adjustPromptHeight = useCallback(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    if (!String(textarea.value || "")) {
      textarea.style.height = "";
      textarea.style.overflowY = "hidden";
      return;
    }
    const maxHeight = resolvePromptMaxHeight(textarea);

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }, [promptRef, resolvePromptMaxHeight]);

  const schedulePromptHeightAdjustment = useCallback(() => {
    window.cancelAnimationFrame(promptHeightFrameRef.current);
    promptHeightFrameRef.current = window.requestAnimationFrame(() => {
      promptHeightFrameRef.current = 0;
      adjustPromptHeight();
    });
  }, [adjustPromptHeight, promptHeightFrameRef]);

  const flushPromptDraftsState = useCallback(() => {
    window.clearTimeout(promptDraftFlushTimeoutRef.current);
    promptDraftFlushTimeoutRef.current = 0;
    setPromptDraftsByConversation((current) => (
      current === promptDraftsByConversationRef.current ? current : promptDraftsByConversationRef.current
    ));
  }, [promptDraftFlushTimeoutRef, promptDraftsByConversationRef, setPromptDraftsByConversation]);

  const schedulePromptDraftsStateFlush = useCallback((delayMs = 180) => {
    window.clearTimeout(promptDraftFlushTimeoutRef.current);
    promptDraftFlushTimeoutRef.current = window.setTimeout(() => {
      flushPromptDraftsState();
    }, delayMs);
  }, [flushPromptDraftsState, promptDraftFlushTimeoutRef]);

  const setPromptForConversation = useCallback((value: string | ((current: string) => string), conversationKey = activeConversationKey, options: PromptConversationOptions = {}) => {
    const { flushDrafts = false, syncVisible = true } = options;
    const normalizedConversationKey = String(conversationKey || activeConversationKey || "").trim();
    const currentPromptValue =
      normalizedConversationKey === activeConversationKey
        ? promptValueRef.current
        : (promptDraftsByConversationRef.current[normalizedConversationKey] || "");
    const next = typeof value === "function" ? value(currentPromptValue) : value;
    const normalized = typeof next === "string" ? next : String(next || "");

    if (normalizedConversationKey === activeConversationKey) {
      promptValueRef.current = normalized;
      if (syncVisible) {
        setPrompt((current) => (current === normalized ? current : normalized));
        if (prompt === normalized) {
          setPromptSyncVersion((current) => current + 1);
        }
      }
    }

    const drafts = promptDraftsByConversationRef.current;
    let nextDrafts = drafts;

    if (!normalized) {
      if (Object.prototype.hasOwnProperty.call(drafts, normalizedConversationKey)) {
        nextDrafts = { ...drafts };
        delete nextDrafts[normalizedConversationKey];
      }
    } else if (drafts[normalizedConversationKey] !== normalized) {
      nextDrafts = {
        ...drafts,
        [normalizedConversationKey]: normalized,
      };
    }

    if (nextDrafts !== drafts) {
      promptDraftsByConversationRef.current = nextDrafts;
      if (flushDrafts) {
        flushPromptDraftsState();
      } else {
        schedulePromptDraftsStateFlush();
      }
    }

    return normalized;
  }, [
    activeConversationKey,
    flushPromptDraftsState,
    prompt,
    promptDraftsByConversationRef,
    promptValueRef,
    schedulePromptDraftsStateFlush,
    setPrompt,
    setPromptSyncVersion,
  ]);

  const persistConversationScrollTop = useCallback((conversationKey, scrollTop) => {
    const normalizedKey = String(conversationKey || "").trim();
    if (!normalizedKey) {
      return;
    }

    const viewport = messageViewportRef.current;
    const nextState = buildChatScrollStateSnapshot({ viewport, scrollTop });

    const current = chatScrollTopByConversationRef.current;
    if (areEquivalentChatScrollState(current[normalizedKey] || null, nextState)) {
      return;
    }

    chatScrollTopByConversationRef.current = {
      ...current,
      [normalizedKey]: nextState,
    };
    schedulePersistedChatScrollTops();
  }, [chatScrollTopByConversationRef, messageViewportRef, schedulePersistedChatScrollTops]);

  const flushVisibleConversationScrollTop = useCallback(() => {
    const viewport = messageViewportRef.current;
    const currentSessionUser = String(sessionStateRef.current.sessionUser || "").trim();
    const currentAgentId = String(sessionStateRef.current.agentId || "main").trim() || "main";

    if (!viewport || !currentSessionUser) {
      return;
    }

    persistConversationScrollTop(
      createConversationKey(currentSessionUser, currentAgentId),
      viewport.scrollTop,
    );
  }, [messageViewportRef, persistConversationScrollTop, sessionStateRef]);

  return {
    adjustPromptHeight,
    flushPromptDraftsState,
    flushVisibleConversationScrollTop,
    focusPrompt,
    persistConversationScrollTop,
    schedulePromptDraftsStateFlush,
    schedulePromptHeightAdjustment,
    setPromptForConversation,
  };
}
