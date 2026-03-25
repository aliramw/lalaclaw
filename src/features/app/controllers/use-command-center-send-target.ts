import type { MutableRefObject } from "react";
import type { ChatTab, ChatTabMeta } from "@/types/chat";
import type { AppSession } from "@/types/runtime";
import { createAgentSessionUser, defaultSessionUser } from "@/features/app/storage";

type SessionStateSnapshot = {
  sessionUser?: string;
  agentId?: string;
  model?: string;
  fastMode?: boolean;
  thinkMode?: string;
};

type ResolveCommandCenterSendTargetOptions = {
  activeChatTab: ChatTab | undefined;
  activeChatTabId: string;
  activeChatTabIdRef: MutableRefObject<string>;
  chatTabsRef: MutableRefObject<ChatTab[]>;
  fastMode: boolean;
  model: string;
  session: AppSession;
  sessionByTabIdRef: MutableRefObject<Record<string, AppSession>>;
  sessionStateRef: MutableRefObject<SessionStateSnapshot>;
  tabMetaByIdRef: MutableRefObject<Record<string, ChatTabMeta>>;
  targetTabId?: string;
};

export function resolveCommandCenterSendTarget({
  activeChatTab,
  activeChatTabId,
  activeChatTabIdRef,
  chatTabsRef,
  fastMode,
  model,
  session,
  sessionByTabIdRef,
  sessionStateRef,
  tabMetaByIdRef,
  targetTabId,
}: ResolveCommandCenterSendTargetOptions) {
  const resolvedTargetTabId = targetTabId || activeChatTab?.id || activeChatTabId || activeChatTabIdRef.current;
  const targetTab = chatTabsRef.current.find((tab) => tab.id === resolvedTargetTabId) || activeChatTab;
  const targetMeta = (resolvedTargetTabId && tabMetaByIdRef.current[resolvedTargetTabId]) || null;
  const targetSession = (resolvedTargetTabId && sessionByTabIdRef.current[resolvedTargetTabId]) || null;
  const isActiveTargetTab = resolvedTargetTabId === activeChatTabIdRef.current;
  const targetAgentId =
    targetMeta?.agentId
    || targetSession?.agentId
    || targetTab?.agentId
    || (isActiveTargetTab ? session.agentId : "")
    || sessionStateRef.current.agentId
    || "main";
  const rawTargetSessionUser =
    targetMeta?.sessionUser
    || targetSession?.sessionUser
    || targetTab?.sessionUser
    || (isActiveTargetTab ? session.sessionUser : "")
    || sessionStateRef.current.sessionUser
    || defaultSessionUser;
  const targetSessionUser =
    targetAgentId !== "main" && rawTargetSessionUser === defaultSessionUser
      ? createAgentSessionUser(targetAgentId)
      : rawTargetSessionUser;
  const targetModel =
    targetMeta?.model
    || targetSession?.selectedModel
    || targetSession?.model
    || (isActiveTargetTab ? model : "")
    || sessionStateRef.current.model
    || "";
  const targetFastMode =
    typeof targetMeta?.fastMode === "boolean"
      ? targetMeta.fastMode
      : isActiveTargetTab
        ? fastMode
        : Boolean(sessionStateRef.current.fastMode);
  const targetThinkMode =
    targetMeta?.thinkMode
    || targetSession?.thinkMode
    || (isActiveTargetTab ? session.thinkMode || "off" : "")
    || sessionStateRef.current.thinkMode
    || "off";

  return {
    isActiveTargetTab,
    targetAgentId,
    targetFastMode,
    targetMeta,
    targetModel,
    targetSession,
    targetSessionUser,
    targetTab,
    targetTabId: resolvedTargetTabId,
    targetThinkMode,
  };
}
