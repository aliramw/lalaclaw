import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { AppSession } from "@/types/runtime";
import { apiFetch } from "@/lib/api-client";
import {
  isImBootstrapSessionUser,
  isImSessionUser,
  resolveImSessionType,
} from "@/features/session/im-session";
import { buildChatTabTitle } from "@/features/app/controllers/use-command-center-helpers";

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
};

type ActiveTarget = {
  sessionUser?: string;
  agentId?: string;
};

type UseCommandCenterImSessionOptions = {
  activeChatTabIdRef: MutableRefObject<string>;
  intlLocale: string;
  loadRuntime: (sessionUser: string, options?: { agentId?: string }) => Promise<any>;
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  setActiveTarget: (value: ActiveTarget) => void;
  updateTabIdentity: (tabId: string, value: { agentId?: string; sessionUser?: string }) => void;
  updateTabMeta: (tabId: string, value: Record<string, unknown>) => void;
  updateTabSession: (tabId: string, value: (current: AppSession) => AppSession) => void;
};

export function useCommandCenterImSession({
  activeChatTabIdRef,
  intlLocale,
  loadRuntime,
  sessionStateRef,
  setActiveTarget,
  updateTabIdentity,
  updateTabMeta,
  updateTabSession,
}: UseCommandCenterImSessionOptions) {
  const syncResolvedImTabIdentity = useCallback((tabId, agentId, previousSessionUser, nextSessionUser) => {
    const normalizedTabId = String(tabId || "").trim();
    const normalizedAgentId = String(agentId || "main").trim() || "main";
    const normalizedPreviousSessionUser = String(previousSessionUser || "").trim();
    const normalizedNextSessionUser = String(nextSessionUser || "").trim();

    if (
      !normalizedTabId
      || !normalizedNextSessionUser
      || normalizedNextSessionUser === normalizedPreviousSessionUser
    ) {
      return;
    }

    updateTabIdentity(normalizedTabId, {
      agentId: normalizedAgentId,
      sessionUser: normalizedNextSessionUser,
    });
    updateTabMeta(normalizedTabId, {
      agentId: normalizedAgentId,
      sessionUser: normalizedNextSessionUser,
      title: buildChatTabTitle(normalizedAgentId, normalizedNextSessionUser, { locale: intlLocale }),
    });
    updateTabSession(normalizedTabId, (current) => ({
      ...current,
      agentId: normalizedAgentId,
      selectedAgentId: normalizedAgentId,
      sessionUser: normalizedNextSessionUser,
    }));

    if (normalizedTabId === activeChatTabIdRef.current) {
      sessionStateRef.current = {
        ...sessionStateRef.current,
        agentId: normalizedAgentId,
        sessionUser: normalizedNextSessionUser,
      };
      setActiveTarget({
        agentId: normalizedAgentId,
        sessionUser: normalizedNextSessionUser,
      });
    }
  }, [
    activeChatTabIdRef,
    intlLocale,
    sessionStateRef,
    setActiveTarget,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);

  const resolveImSessionUserForSend = useCallback(async ({ agentId = "main", sessionUser = "", tabId = "" } = {}) => {
    const normalizedAgentId = String(agentId || "main").trim() || "main";
    const normalizedSessionUser = String(sessionUser || "").trim();
    const normalizedTabId = String(tabId || "").trim();

    if (!isImBootstrapSessionUser(normalizedSessionUser)) {
      return normalizedSessionUser;
    }

    let resolvedSessionUser = normalizedSessionUser;

    try {
      const runtimePayload = await loadRuntime(normalizedSessionUser, { agentId: normalizedAgentId });
      const runtimeResolvedSessionUser = String(runtimePayload?.session?.sessionUser || "").trim();
      if (
        runtimeResolvedSessionUser
        && runtimeResolvedSessionUser !== normalizedSessionUser
        && isImSessionUser(runtimeResolvedSessionUser)
        && !isImBootstrapSessionUser(runtimeResolvedSessionUser)
      ) {
        resolvedSessionUser = runtimeResolvedSessionUser;
      }
    } catch {
      // Fall through to the session search fallback.
    }

    if (resolvedSessionUser === normalizedSessionUser) {
      const imType = resolveImSessionType(normalizedSessionUser);
      const channel = imType === "dingtalk"
        ? "dingtalk-connector"
        : imType === "weixin"
          ? "openclaw-weixin"
          : imType;

      if (channel) {
        try {
          const params = new URLSearchParams({
            agentId: normalizedAgentId,
            channel,
            limit: "12",
          });
          const response = await apiFetch(`/api/session/search?${params.toString()}`);
          const data = await response.json();
          if (response.ok && data.ok) {
            const matchedSession = (Array.isArray(data.sessions) ? data.sessions : []).find((item) => {
              const candidateSessionUser = String(item?.sessionUser || "").trim();
              return (
                candidateSessionUser
                && String(item?.agentId || normalizedAgentId).trim() === normalizedAgentId
                && resolveImSessionType(candidateSessionUser) === imType
                && !isImBootstrapSessionUser(candidateSessionUser)
              );
            });

            if (matchedSession?.sessionUser) {
              resolvedSessionUser = String(matchedSession.sessionUser).trim();
            }
          }
        } catch {
          // Keep the bootstrap value and let the chat request surface the error if resolution still fails.
        }
      }
    }

    if (resolvedSessionUser !== normalizedSessionUser) {
      syncResolvedImTabIdentity(normalizedTabId, normalizedAgentId, normalizedSessionUser, resolvedSessionUser);
    }

    return resolvedSessionUser;
  }, [loadRuntime, syncResolvedImTabIdentity]);

  return {
    resolveImSessionUserForSend,
    syncResolvedImTabIdentity,
  };
}
