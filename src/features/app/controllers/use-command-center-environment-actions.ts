import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMessage, ChatTabMeta, StoredUiState } from "@/types/chat";
import { mergeRuntimeFiles } from "@/features/session/runtime/use-runtime-snapshot";
import { mergeSessionFileRewrites } from "@/features/app/controllers/use-command-center-helpers";

type FocusMessageRequest = {
  id: string;
  messageId?: string;
  role?: string;
  source?: string;
  timestamp?: number;
} | null;

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
};

type UseCommandCenterEnvironmentActionsOptions = {
  activeConversationKey: string;
  activeChatTabIdRef: MutableRefObject<string>;
  loadImChannelConfigs: ({ force }?: { force?: boolean }) => Promise<unknown>;
  loadRuntime: (sessionUser: string, options?: { agentId?: string }) => Promise<unknown>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  persistCurrentUiStateSnapshot: (overrides?: { workspaceFilesOpenByConversation?: StoredUiState["workspaceFilesOpenByConversation"] }) => void;
  session: { agentId?: string };
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  setFocusMessageRequest: Dispatch<SetStateAction<FocusMessageRequest>>;
  setWorkspaceFilesOpenByConversation: Dispatch<SetStateAction<Record<string, boolean>>>;
  updateTabMeta: (tabId: string, value: Record<string, unknown> | ((current: ChatTabMeta) => ChatTabMeta)) => void;
  workspaceFilesOpenByConversationRef: MutableRefObject<Record<string, boolean>>;
};

export function useCommandCenterEnvironmentActions({
  activeConversationKey,
  activeChatTabIdRef,
  loadImChannelConfigs,
  loadRuntime,
  messagesRef,
  persistCurrentUiStateSnapshot,
  session,
  sessionStateRef,
  setFocusMessageRequest,
  setWorkspaceFilesOpenByConversation,
  updateTabMeta,
  workspaceFilesOpenByConversationRef,
}: UseCommandCenterEnvironmentActionsOptions) {
  const handleTrackSessionFiles = useCallback(({ files: nextFiles = [], rewrites = [] } = {}) => {
    const activeTabId = activeChatTabIdRef.current;
    if (!activeTabId) {
      return;
    }

    updateTabMeta(activeTabId, (current) => ({
      ...current,
      sessionFiles: mergeRuntimeFiles(current?.sessionFiles || [], nextFiles || []),
      sessionFileRewrites: mergeSessionFileRewrites(current?.sessionFileRewrites || [], rewrites || []),
    }));
  }, [activeChatTabIdRef, updateTabMeta]);

  const renderPeek = useCallback((section, fallback) => {
    if (!section) return fallback;
    return [section.summary, ...(section.items || []).map((item) => `${item.label}: ${item.value}`)].filter(Boolean).join("\n");
  }, []);

  const handleArtifactSelect = useCallback((artifact) => {
    const normalizedDetail = String(artifact?.detail || "")
      .replace(/\.\.\.$/, "")
      .replace(/…$/, "")
      .trim();
    const assistantMessages = messagesRef.current.filter((message) => message?.role === "assistant");

    if (!assistantMessages.length) {
      return;
    }

    const matchedMessage =
      (artifact?.messageTimestamp
        ? assistantMessages.find((message) => Number(message?.timestamp || 0) === Number(artifact.messageTimestamp))
        : null)
      || (artifact?.timestamp
        ? assistantMessages.find((message) => Number(message?.timestamp || 0) === Number(artifact.timestamp))
        : null)
      || (normalizedDetail
        ? assistantMessages.find((message) => String(message?.content || "").includes(normalizedDetail))
        : null)
      || assistantMessages.at(-1);

    if (!matchedMessage?.timestamp) {
      return;
    }

    setFocusMessageRequest({
      id: `${matchedMessage.timestamp}-${Date.now()}`,
      messageId: matchedMessage.id || "",
      role: matchedMessage.role || artifact?.messageRole || "assistant",
      source: "artifact",
      timestamp: matchedMessage.timestamp,
    });
  }, [messagesRef, setFocusMessageRequest]);

  const handleRefreshEnvironment = useCallback(async () => {
    await Promise.all([
      loadRuntime(sessionStateRef.current.sessionUser || "", {
        agentId: sessionStateRef.current.agentId || session.agentId || "main",
      }),
      loadImChannelConfigs({ force: true }),
    ]);
  }, [loadImChannelConfigs, loadRuntime, session.agentId, sessionStateRef]);

  const handleWorkspaceFilesOpenChange = useCallback((open) => {
    const normalizedConversationKey = String(activeConversationKey || "").trim();
    if (!normalizedConversationKey) {
      return;
    }

    const nextOpen = Boolean(open);
    if (workspaceFilesOpenByConversationRef.current[normalizedConversationKey] === nextOpen) {
      return;
    }

    const nextWorkspaceFilesOpenByConversation = {
      ...workspaceFilesOpenByConversationRef.current,
      [normalizedConversationKey]: nextOpen,
    };
    workspaceFilesOpenByConversationRef.current = nextWorkspaceFilesOpenByConversation;
    setWorkspaceFilesOpenByConversation(nextWorkspaceFilesOpenByConversation);
    persistCurrentUiStateSnapshot({
      workspaceFilesOpenByConversation: nextWorkspaceFilesOpenByConversation,
    });
  }, [
    activeConversationKey,
    persistCurrentUiStateSnapshot,
    setWorkspaceFilesOpenByConversation,
    workspaceFilesOpenByConversationRef,
  ]);

  return {
    handleArtifactSelect,
    handleRefreshEnvironment,
    handleTrackSessionFiles,
    handleWorkspaceFilesOpenChange,
    renderPeek,
  };
}
