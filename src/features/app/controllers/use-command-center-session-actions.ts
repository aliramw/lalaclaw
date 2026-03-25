import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AppSession } from "@/types/runtime";
import type { ChatTab } from "@/types/chat";
import { createAgentSessionUser, defaultSessionUser } from "@/features/app/storage";
import { resolveAgentIdFromTabId } from "@/features/app/controllers/use-command-center-helpers";

type SessionActionsI18n = {
  common: {
    failed: string;
    modelSwitchFailed: (model: string, errorMessage: string) => string;
    modelSwitchSucceeded: (model: string) => string;
  };
};

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
  model?: string;
};

type SwitchingAgentOverlay = {
  agentLabel: string;
  mode: string;
} | null;

type SwitchingModelOverlay = {
  modelLabel: string;
} | null;

type ModelSwitchNotice = {
  type: "success" | "error";
  message: string;
} | null;

type UseCommandCenterSessionActionsOptions = {
  activeChatTab: ChatTab | undefined;
  applyOpenAgentTab: (nextAgent: string) => Promise<{ created: boolean; tabId: string | null }>;
  i18n: SessionActionsI18n;
  loadRuntime: (sessionUser: string, options?: { agentId?: string }) => Promise<unknown>;
  model: string;
  openOrActivateAgentTab: (nextAgent: string) => Promise<{ created: boolean; tabId: string | null }>;
  session: AppSession;
  sessionByTabIdRef: MutableRefObject<Record<string, AppSession>>;
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  setModelSwitchNotice: Dispatch<SetStateAction<ModelSwitchNotice>>;
  setSession: Dispatch<SetStateAction<AppSession>>;
  setSwitchingAgentOverlay: Dispatch<SetStateAction<SwitchingAgentOverlay>>;
  setSwitchingModelOverlay: Dispatch<SetStateAction<SwitchingModelOverlay>>;
  tabMetaByIdRef: MutableRefObject<Record<string, { sessionUser?: string }>>;
  updateSessionSettings: (payload: Record<string, unknown>) => Promise<any>;
  updateTabIdentity: (tabId: string, value: { agentId?: string; sessionUser?: string }) => void;
  updateTabMeta: (tabId: string, value: Record<string, unknown>) => void;
  updateTabSession: (tabId: string, value: (current: AppSession) => AppSession) => void;
};

export function useCommandCenterSessionActions({
  activeChatTab,
  i18n,
  loadRuntime,
  model,
  openOrActivateAgentTab,
  session,
  sessionByTabIdRef,
  sessionStateRef,
  setModelSwitchNotice,
  setSession,
  setSwitchingAgentOverlay,
  setSwitchingModelOverlay,
  tabMetaByIdRef,
  updateSessionSettings,
  updateTabIdentity,
  updateTabMeta,
  updateTabSession,
}: UseCommandCenterSessionActionsOptions) {
  const applySessionUpdate = useCallback(async (payload) => {
    try {
      return await updateSessionSettings(payload);
    } catch {
      await loadRuntime(sessionStateRef.current.sessionUser || "", {
        agentId: sessionStateRef.current.agentId,
      }).catch(() => {
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      });
      return null;
    }
  }, [i18n.common.failed, loadRuntime, sessionStateRef, setSession, updateSessionSettings]);

  const handleSyncCurrentSessionModel = useCallback(async (nextModel) => {
    const normalizedModel = String(nextModel || "").trim();
    if (!normalizedModel || normalizedModel === String(sessionStateRef.current.model || model || "").trim()) {
      return null;
    }
    return await applySessionUpdate({ model: normalizedModel });
  }, [applySessionUpdate, model, sessionStateRef]);

  const handleModelChange = useCallback(async (nextModel) => {
    if (!nextModel || nextModel === model) return;

    setSwitchingModelOverlay({ modelLabel: nextModel });
    try {
      await updateSessionSettings({ model: nextModel });
      setModelSwitchNotice({
        type: "success",
        message: i18n.common.modelSwitchSucceeded(nextModel),
      });
    } catch (error) {
      await loadRuntime(sessionStateRef.current.sessionUser || "", {
        agentId: sessionStateRef.current.agentId,
      }).catch(() => {
        setSession((current) => ({ ...current, status: i18n.common.failed }));
      });
      setModelSwitchNotice({
        type: "error",
        message: i18n.common.modelSwitchFailed(nextModel, error?.message || ""),
      });
    } finally {
      setSwitchingModelOverlay(null);
    }
  }, [
    i18n.common,
    loadRuntime,
    model,
    sessionStateRef,
    setModelSwitchNotice,
    setSession,
    setSwitchingModelOverlay,
    updateSessionSettings,
  ]);

  const handleAgentChange = useCallback(async (nextAgent) => {
    if (!nextAgent) return;
    if (nextAgent === session.agentId && resolveAgentIdFromTabId(activeChatTab?.id) === nextAgent) return;

    let shouldShowOverlay = false;
    try {
      const { created, tabId: targetTabId } = await openOrActivateAgentTab(nextAgent);
      shouldShowOverlay = created;
      if (created) {
        setSwitchingAgentOverlay({
          agentLabel: nextAgent,
          mode: "opening-session",
        });
      }

      const targetTab = targetTabId
        ? sessionByTabIdRef.current[targetTabId]
        : null;
      const targetMeta = (targetTabId && tabMetaByIdRef.current[targetTabId]) || null;
      const existingTargetSessionUser =
        targetMeta?.sessionUser
        || targetTab?.sessionUser
        || "";
      const targetSessionUser =
        nextAgent !== "main" && (!existingTargetSessionUser || existingTargetSessionUser === defaultSessionUser)
          ? createAgentSessionUser(nextAgent)
          : existingTargetSessionUser || createAgentSessionUser(nextAgent);

      if (targetTabId) {
        updateTabIdentity(targetTabId, { sessionUser: targetSessionUser });
        updateTabMeta(targetTabId, {
          agentId: nextAgent,
          sessionUser: targetSessionUser,
        });
        updateTabSession(targetTabId, (current) => ({
          ...current,
          agentId: nextAgent,
          selectedAgentId: nextAgent,
          sessionUser: targetSessionUser,
        }));
      }

      const sessionUpdate = await applySessionUpdate({
        agentId: nextAgent,
        sessionUser: targetSessionUser,
      });
      const resolvedSession = sessionUpdate?.session || null;

      if (targetTabId && resolvedSession) {
        updateTabMeta(targetTabId, {
          agentId: resolvedSession.agentId || nextAgent,
          sessionUser: resolvedSession.sessionUser || targetSessionUser,
          model: resolvedSession.selectedModel || resolvedSession.model || "",
        });
        updateTabSession(targetTabId, (current) => ({
          ...current,
          ...(resolvedSession || {}),
          agentId: resolvedSession.agentId || nextAgent,
          selectedAgentId: resolvedSession.selectedAgentId || resolvedSession.agentId || nextAgent,
          sessionUser: resolvedSession.sessionUser || targetSessionUser,
          model: resolvedSession.model || current.model,
          selectedModel: resolvedSession.selectedModel || resolvedSession.model || current.selectedModel,
        }));
      }
    } finally {
      if (shouldShowOverlay) {
        setSwitchingAgentOverlay(null);
      }
    }
  }, [
    activeChatTab?.id,
    applySessionUpdate,
    openOrActivateAgentTab,
    session.agentId,
    sessionByTabIdRef,
    setSwitchingAgentOverlay,
    tabMetaByIdRef,
    updateTabIdentity,
    updateTabMeta,
    updateTabSession,
  ]);

  const handleFastModeChange = useCallback(async (nextFastMode) => {
    const resolvedFastMode = Boolean(nextFastMode);
    await applySessionUpdate({ fastMode: resolvedFastMode });
  }, [applySessionUpdate]);

  const handleThinkModeChange = useCallback(async (nextThinkMode) => {
    if (!nextThinkMode || nextThinkMode === session.thinkMode) return;
    await applySessionUpdate({ thinkMode: nextThinkMode });
  }, [applySessionUpdate, session.thinkMode]);

  return {
    applySessionUpdate,
    handleAgentChange,
    handleFastModeChange,
    handleModelChange,
    handleSyncCurrentSessionModel,
    handleThinkModeChange,
  };
}
