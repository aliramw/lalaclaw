import { useMemo } from "react";
import type { ComponentProps, ReactNode } from "react";
import { SessionOverview } from "@/components/command-center/session-overview";
import { isImSessionUser } from "@/features/session/im-session";

type SessionOverviewProps = ComponentProps<typeof SessionOverview>;

type SessionTabLike = {
  agentId?: string;
  sessionUser?: string;
};

type UseAppSessionOverviewsOptions = {
  accessLoggingOut?: SessionOverviewProps["accessLoggingOut"];
  accessMode?: SessionOverviewProps["accessMode"];
  availableAgents?: SessionOverviewProps["availableAgents"];
  availableImChannels?: SessionOverviewProps["availableImChannels"];
  availableModels?: SessionOverviewProps["availableModels"];
  chatTabs?: SessionTabLike[];
  composerSendMode?: SessionOverviewProps["composerSendMode"];
  extraControls?: ReactNode;
  fastMode?: SessionOverviewProps["fastMode"];
  formatCompactK: SessionOverviewProps["formatCompactK"];
  model?: SessionOverviewProps["model"];
  onAccessLogout?: SessionOverviewProps["onAccessLogout"];
  onAgentChange?: SessionOverviewProps["onAgentChange"];
  onFastModeChange?: SessionOverviewProps["onFastModeChange"];
  onLoadImChannels?: SessionOverviewProps["onLoadImChannels"];
  onModelChange?: SessionOverviewProps["onModelChange"];
  onOpenImSession?: SessionOverviewProps["onOpenImSession"];
  onSearchSessions?: SessionOverviewProps["onSearchSessions"];
  onSelectSearchedSession?: SessionOverviewProps["onSelectSearchedSession"];
  onThinkModeChange?: SessionOverviewProps["onThinkModeChange"];
  onThemeChange?: SessionOverviewProps["onThemeChange"];
  resolvedTheme?: SessionOverviewProps["resolvedTheme"];
  runtimeFallbackReason?: SessionOverviewProps["runtimeFallbackReason"];
  runtimeReconnectAttempts?: SessionOverviewProps["runtimeReconnectAttempts"];
  runtimeSocketStatus?: SessionOverviewProps["runtimeSocketStatus"];
  runtimeTransport?: SessionOverviewProps["runtimeTransport"];
  session: SessionOverviewProps["session"];
  sessionOverviewPending?: SessionOverviewProps["sessionOverviewPending"];
  theme?: SessionOverviewProps["theme"];
};

export function useAppSessionOverviews({
  accessLoggingOut,
  accessMode,
  availableAgents,
  availableImChannels,
  availableModels,
  chatTabs = [],
  composerSendMode,
  extraControls,
  fastMode,
  formatCompactK,
  model,
  onAccessLogout,
  onAgentChange,
  onFastModeChange,
  onLoadImChannels,
  onModelChange,
  onOpenImSession,
  onSearchSessions,
  onSelectSearchedSession,
  onThinkModeChange,
  onThemeChange,
  resolvedTheme,
  runtimeFallbackReason,
  runtimeReconnectAttempts,
  runtimeSocketStatus,
  runtimeTransport,
  session,
  sessionOverviewPending,
  theme,
}: UseAppSessionOverviewsOptions) {
  const openAgentIds = useMemo(
    () => chatTabs
      .filter((tab) => !isImSessionUser(tab.sessionUser))
      .map((tab) => tab.agentId)
      .filter((agentId): agentId is string => Boolean(agentId)),
    [chatTabs],
  );
  const openSessionUsers = useMemo(
    () => chatTabs
      .map((tab) => tab.sessionUser)
      .filter((sessionUser): sessionUser is string => Boolean(sessionUser)),
    [chatTabs],
  );

  const sharedOverviewProps = useMemo<Partial<SessionOverviewProps>>(() => ({
    accessLoggingOut,
    accessMode,
    availableAgents,
    availableModels,
    composerSendMode,
    fastMode,
    formatCompactK,
    model,
    onAccessLogout,
    onAgentChange,
    onFastModeChange,
    onModelChange,
    onSearchSessions,
    onSelectSearchedSession,
    onThinkModeChange,
    onThemeChange,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    sessionOverviewPending,
    theme,
  }), [
    accessLoggingOut,
    accessMode,
    availableAgents,
    availableModels,
    composerSendMode,
    fastMode,
    formatCompactK,
    model,
    onAccessLogout,
    onAgentChange,
    onFastModeChange,
    onModelChange,
    onSearchSessions,
    onSelectSearchedSession,
    onThinkModeChange,
    onThemeChange,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    sessionOverviewPending,
    theme,
  ]);

  const richOverviewProps = useMemo<Partial<SessionOverviewProps>>(() => ({
    ...sharedOverviewProps,
    availableImChannels,
    extraControls,
    onLoadImChannels,
  }), [
    availableImChannels,
    extraControls,
    onLoadImChannels,
    sharedOverviewProps,
  ]);

  const tabBrandOverview = useMemo(() => (
    <SessionOverview
      {...richOverviewProps}
      layout="tab-brand"
      formatCompactK={formatCompactK}
      session={session}
    />
  ), [formatCompactK, richOverviewProps, session]);

  const agentTabOverview = useMemo(() => (
    <SessionOverview
      {...richOverviewProps}
      layout="agent-tab"
      formatCompactK={formatCompactK}
      session={session}
      onOpenImSession={onOpenImSession}
      openAgentIds={openAgentIds}
      openSessionUsers={openSessionUsers}
    />
  ), [formatCompactK, onOpenImSession, openAgentIds, openSessionUsers, richOverviewProps, session]);

  const controlsOverview = useMemo(() => (
    <SessionOverview
      {...richOverviewProps}
      layout="controls"
      formatCompactK={formatCompactK}
      session={session}
    />
  ), [formatCompactK, richOverviewProps, session]);

  const statusOverview = useMemo(() => (
    <SessionOverview
      {...sharedOverviewProps}
      layout="status"
      formatCompactK={formatCompactK}
      session={session}
    />
  ), [formatCompactK, session, sharedOverviewProps]);

  return {
    agentTabOverview,
    controlsOverview,
    statusOverview,
    tabBrandOverview,
  };
}
