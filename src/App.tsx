import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArrowRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AppSplitLayout } from "@/components/app-shell/app-split-layout";
import { DevWorkspaceBadge } from "@/components/app-shell/dev-workspace-badge";
import { getDevWorkspaceInfo } from "@/components/app-shell/dev-workspace-info";
import { SettingsTrigger } from "@/components/app-shell/settings-trigger";
import { AgentSwitchOverlay, ModelSwitchOverlay, SessionNotice } from "@/components/app-shell/session-overlays";
import { useAppSessionOverviews } from "@/components/app-shell/use-app-session-overviews";
import { ChatPanel, ChatTabsStrip } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { SettingsDialog } from "@/components/command-center/settings-dialog";
import { useCommandCenter } from "@/features/app/controllers";
import { AccessGate } from "@/features/auth/access-gate";
import { useAccessGate } from "@/features/auth/access-context";
import { defaultInspectorPanelWidth, maxInspectorPanelWidth, minInspectorPanelWidth } from "@/features/app/state/app-preferences";
import { getLocalizedStatusLabel, getRelationshipStatusBadgeProps, normalizeStatusKey } from "@/features/session/status-display";
import { I18nProvider } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { buildDevWorkspaceLabel } from "@/lib/dev-workspace-label";

const AppCard: any = Card;
const AppCardContent: any = CardContent;

const desktopBreakpointQuery = "(min-width: 1280px)";
const dragHandleWidth = 8;
const minChatPanelWidth = 560;
const compactInspectorPanelMinWidth = 58;
const compactInspectorPanelMaxWidth = 72;
const compactChatPanelMinWidth = 220;
const shouldBypassAccessGate = Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
const pointerFocusDismissSelector = [
  "button",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='option']",
  "[role='switch']",
  "a[href]",
  "summary",
].join(",");

function shouldDismissPointerFocus(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable || element.matches("input, textarea, select, [role='textbox']")) {
    return false;
  }

  return element.matches(pointerFocusDismissSelector);
}

function getRelationshipDisplay(relationship, messages) {
  const fallbackLabel =
    relationship?.type === "session_spawn"
      ? messages.inspector.relationships.sessionSpawn
      : relationship?.targetAgentId || messages.inspector.relationships.childAgent;
  const primaryLabel = relationship?.detail || fallbackLabel;
  const secondaryLabel = relationship?.detail && relationship?.detail !== fallbackLabel ? fallbackLabel : "";

  return {
    primaryLabel,
    secondaryLabel,
  };
}

function isSameCompletedAtMap(current = {}, next = {}) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return currentKeys.every((key) => current[key] === next[key]);
}

function FailedRelationshipContextMenu({ menu, messages, onClose, onDismiss }) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleViewportChange = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={messages.inspector.relationships.menuLabel}
      className="fixed z-50 min-w-40 rounded-md border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDismiss?.(menu.relationshipId);
          onClose();
        }}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{messages.inspector.relationships.close}</span>
      </button>
    </div>
  );
}

export function TaskRelationshipsPanel({ onDismissRelationship, relationships, sessionAgentId = "main", visible }) {
  const { messages } = useI18n();
  const [completedAtById, setCompletedAtById] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const nowRef = useRef(now);
  const previousStatusesRef = useRef<Record<string, string>>({});
  const seenActiveIdsRef = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ relationshipId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    nowRef.current = now;
  }, [now]);

  useEffect(() => {
    let startedCountdown = false;

    setCompletedAtById((current) => {
      const next: Record<string, number> = {};
      const previousStatuses = previousStatusesRef.current || {};
      const nextStatuses: Record<string, string> = {};
      const nextSeenActiveIds = new Set(seenActiveIdsRef.current);

      for (const relationship of relationships || []) {
        const relationshipId = relationship?.id;
        const status = normalizeStatusKey(relationship?.status);
        if (!relationshipId) {
          continue;
        }

        nextStatuses[relationshipId] = status;

        if (status && status !== "completed") {
          nextSeenActiveIds.add(relationshipId);
        }

        if (status === "completed") {
          if (relationship.completedAt) {
            next[relationshipId] = relationship.completedAt;
            continue;
          }

          if (current[relationshipId]) {
            next[relationshipId] = current[relationshipId];
            continue;
          }

          const previousStatus = normalizeStatusKey(previousStatuses[relationshipId] || "");
          const shouldStartCountdown =
            nextSeenActiveIds.has(relationshipId) || (previousStatus && previousStatus !== "completed");

          if (shouldStartCountdown) {
            next[relationshipId] = Date.now();
            startedCountdown = true;
          }
        }
      }

      previousStatusesRef.current = nextStatuses;
      seenActiveIdsRef.current = nextSeenActiveIds;
      return isSameCompletedAtMap(current, next) ? current : next;
    });

    if (startedCountdown) {
      setNow(Date.now());
    }
  }, [relationships]);

  const hasActiveCountdown = useMemo(
    () =>
      (relationships || []).some((relationship) => normalizeStatusKey(relationship?.status) === "completed" && (relationship.completedAt || completedAtById[relationship.id])),
    [completedAtById, relationships],
  );

  useEffect(() => {
    if (!hasActiveCountdown) {
      return undefined;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveCountdown]);

  const visibleRelationships = useMemo(
    () =>
      (relationships || []).filter((relationship) => {
        if (normalizeStatusKey(relationship?.status) !== "completed") {
          return true;
        }

        const completedAt = relationship.completedAt || completedAtById[relationship.id];
        if (!completedAt) {
          return false;
        }

        return Math.max(0, 60 - Math.floor((now - completedAt) / 1000)) > 0;
      }),
    [completedAtById, now, relationships],
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const stillVisible = visibleRelationships.some((relationship) => relationship.id === contextMenu.relationshipId && normalizeStatusKey(relationship.status) === "failed");
    if (!stillVisible) {
      setContextMenu(null);
    }
  }, [contextMenu, visibleRelationships]);

  if (!visible || !visibleRelationships.length) {
    return null;
  }

  return (
    <>
      <AppCard className="flex max-h-[50vh] flex-col overflow-hidden">
        <div className="flex h-12 items-center border-b border-border/70 bg-card/80 px-3 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <div className="truncate text-sm font-semibold leading-none tracking-tight">{messages.inspector.relationships.title}</div>
            <div className="truncate text-[11px] leading-none text-muted-foreground">{messages.inspector.relationships.subtitle}</div>
          </div>
        </div>
        <AppCardContent className="grid gap-2.5 overflow-y-auto px-3 py-3">
          {visibleRelationships.map((relationship) => {
            const { primaryLabel, secondaryLabel } = getRelationshipDisplay(relationship, messages);
            const statusLabel = getLocalizedStatusLabel(relationship.status, messages);
            const statusBadgeProps = getRelationshipStatusBadgeProps(relationship.status);
            const completedAt = relationship.completedAt || completedAtById[relationship.id] || now;
            const hideCountdownSeconds =
              normalizeStatusKey(relationship.status) === "completed"
                ? Math.max(0, Math.ceil((completedAt + 60000 - now) / 1000))
                : 0;
            const canDismiss = normalizeStatusKey(relationship.status) === "failed";

            return (
              <div
                key={relationship.id}
                onContextMenu={(event) => {
                  if (!canDismiss) {
                    return;
                  }
                  event.preventDefault();
                  setContextMenu({
                    relationshipId: relationship.id,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                className="grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-2"
              >
                <Badge variant="secondary" className="h-7 justify-center rounded-full px-2.5 text-[11px] font-medium">
                  {relationship.sourceAgentId || sessionAgentId}
                </Badge>
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  {normalizeStatusKey(relationship.status) === "completed" ? (
                    <div className="shrink-0 text-[11px] leading-none text-muted-foreground">
                      {messages.inspector.relationships.hideCountdown(hideCountdownSeconds)}
                    </div>
                  ) : (
                    <div className="h-[11px]" aria-hidden="true" />
                  )}
                  <div className="flex w-full items-center gap-2">
                    <div className="h-px flex-1 bg-border/70" />
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    <div className="h-px flex-1 bg-border/70" />
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0 text-left">
                    <div className="truncate text-sm font-medium text-foreground">{primaryLabel}</div>
                    {secondaryLabel ? <div className="truncate text-[11px] text-muted-foreground">{secondaryLabel}</div> : null}
                  </div>
                  {statusLabel ? (
                    <Badge
                      variant={statusBadgeProps.variant}
                      className={`shrink-0 self-center whitespace-nowrap px-2 py-0.5 text-[11px] leading-5 ${statusBadgeProps.className}`}
                    >
                      {statusLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </AppCardContent>
      </AppCard>
      <FailedRelationshipContextMenu
        menu={contextMenu}
        messages={messages}
        onClose={() => setContextMenu(null)}
        onDismiss={onDismissRelationship}
      />
    </>
  );
}

function AppContent() {
  const { messages: i18nMessages } = useI18n();
  const { accessMode, loggingOut, logout } = useAccessGate();
  const {
    activeChatTabId,
    activeChatRun,
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    imChannelConfigs,
    availableModels,
    busy,
    chatFontSize,
    chatTabs,
    composerSendMode,
    composerAttachments,
    files,
    fastMode,
    focusMessageRequest,
    formatCompactK,
    handleActivateChatTab,
    handleAddAttachments,
    handleAgentChange,
    handleArtifactSelect,
    handleChatFontSizeChange,
    handleComposerSendModeToggle,
    handleCloseChatTab,
    handleOpenImSession,
    handleReorderChatTabs,
    handleFastModeChange,
    handleRefreshEnvironment,
    handleInspectorPanelWidthChange,
    handleModelChange,
    loadImChannelConfigs,
    handleSyncCurrentSessionModel,
    handleSearchSessions,
    handlePromptChange,
    handlePromptKeyDown,
    handleClearQueuedMessages,
    handleEditQueuedMessage,
    handleRemoveAttachment,
    handleRemoveQueuedMessage,
    handleReset,
    handleSend,
    handleSelectSearchedSession,
    handleStop,
    handleTrackSessionFiles,
    handleThinkModeChange,
    handleUserLabelChange,
    handleWorkspaceFilesOpenChange,
    dismissTaskRelationship,
    localizedFormatTime,
    messageViewportRef,
    messages,
    model,
    modelSwitchNotice,
    inspectorPanelWidth,
    peeks,
    prompt,
    promptSyncVersion,
    promptRef,
    renderPeek,
    resolvedTheme,
    restoredChatScrollKey,
    restoredChatScrollRevision,
    restoredChatScrollState,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    sessionOverviewPending,
    setActiveTab,
    setTheme,
    snapshots,
    switchingAgentOverlay,
    switchingModelOverlay,
    taskRelationships,
    taskTimeline,
    theme,
    userLabel,
    workspaceFilesOpen,
  } = useCommandCenter();
  const splitLayoutRef = useRef<HTMLElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [isWideLayout, setIsWideLayout] = useState(
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(desktopBreakpointQuery).matches : false),
  );
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [splitLayoutWidth, setSplitLayoutWidth] = useState(0);

  useEffect(() => {
    const devWorkspaceInfo = getDevWorkspaceInfo();

    if (!(import.meta.env?.DEV || import.meta.env?.MODE === "test" || import.meta.env?.VITEST) || !devWorkspaceInfo || typeof document === "undefined") {
      return;
    }

    const port = typeof window !== "undefined" ? window.location.port : "";
    const baseTitle = i18nMessages?.app?.documentTitle || i18nMessages?.app?.title || document.title;
    const label = buildDevWorkspaceLabel(devWorkspaceInfo, port);
    document.title = i18nMessages?.app?.devDocumentTitle
      ? i18nMessages.app.devDocumentTitle(baseTitle, label)
      : `${baseTitle} [${label}]`;
  }, [i18nMessages]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const handlePointerUp = (event) => {
      const activeElement = document.activeElement;
      if (!shouldDismissPointerFocus(activeElement)) {
        return;
      }

      const pointerTarget = event.target instanceof Element
        ? event.target.closest(pointerFocusDismissSelector)
        : null;
      if (!pointerTarget) {
        return;
      }

      if (activeElement !== pointerTarget && !pointerTarget.contains(activeElement)) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (document.activeElement === activeElement) {
          (activeElement as HTMLElement).blur();
        }
      });
    };

    window.addEventListener("pointerup", handlePointerUp, true);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, []);

  const getInspectorPanelWidthBounds = useCallback((containerWidth = splitLayoutWidth) => {
    const minimumWidth = minInspectorPanelWidth;
    if (!isWideLayout || !Number.isFinite(containerWidth) || containerWidth <= 0) {
      return {
        minimumWidth,
        maximumWidth: maxInspectorPanelWidth,
      };
    }

    const maximumWidth = Math.max(
      minimumWidth,
      Math.min(maxInspectorPanelWidth, containerWidth - dragHandleWidth - minChatPanelWidth),
    );

    return {
      minimumWidth,
      maximumWidth,
    };
  }, [isWideLayout, splitLayoutWidth]);

  const getClampedInspectorPanelWidth = useCallback((requestedWidth, containerWidth = splitLayoutWidth) => {
    const { minimumWidth, maximumWidth } = getInspectorPanelWidthBounds(containerWidth);
    const numericWidth = Number(requestedWidth);
    const fallbackWidth = defaultInspectorPanelWidth;
    const nextWidth = Number.isFinite(numericWidth) ? numericWidth : fallbackWidth;
    return Math.round(Math.min(maximumWidth, Math.max(minimumWidth, nextWidth)));
  }, [getInspectorPanelWidthBounds, splitLayoutWidth]);

  const getCompactInspectorPanelWidth = useCallback((containerWidth = splitLayoutWidth) => {
    if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
      return 64;
    }

    const desiredWidth = 64;
    const maximumWidth = Math.max(
      compactInspectorPanelMinWidth,
      Math.min(compactInspectorPanelMaxWidth, containerWidth - compactChatPanelMinWidth),
    );

    return Math.max(
      compactInspectorPanelMinWidth,
      Math.min(maximumWidth, desiredWidth),
    );
  }, [splitLayoutWidth]);

  const stopPanelResize = () => {
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(desktopBreakpointQuery);
    const updateMatches = () => {
      setIsWideLayout(mediaQuery.matches);
    };

    updateMatches();
    mediaQuery.addEventListener?.("change", updateMatches);
    mediaQuery.addListener?.(updateMatches);

    return () => {
      mediaQuery.removeEventListener?.("change", updateMatches);
      mediaQuery.removeListener?.(updateMatches);
    };
  }, []);

  useEffect(() => {
    const node = splitLayoutRef.current;
    if (!node || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const updateWidth = (nextWidth) => {
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
        return;
      }
      setSplitLayoutWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    handleInspectorPanelWidthChange(getClampedInspectorPanelWidth(inspectorPanelWidth));
  }, [getClampedInspectorPanelWidth, handleInspectorPanelWidthChange, inspectorPanelWidth]);

  useEffect(() => () => stopPanelResize(), []);

  const handleResizeStart = (event) => {
    if (!isWideLayout || !splitLayoutRef.current) {
      return;
    }

    event.preventDefault();
    stopPanelResize();
    setIsResizingPanels(true);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const updateWidthFromPointer = (clientX) => {
      const bounds = splitLayoutRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      const nextWidth = getClampedInspectorPanelWidth(bounds.right - clientX, bounds.width);
      handleInspectorPanelWidthChange(nextWidth);
    };

    const handlePointerMove = (moveEvent) => {
      updateWidthFromPointer(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingPanels(false);
      stopPanelResize();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    resizeCleanupRef.current = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingPanels(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  };

  const resolvedInspectorPanelWidth = useMemo(
    () => getClampedInspectorPanelWidth(inspectorPanelWidth),
    [getClampedInspectorPanelWidth, inspectorPanelWidth],
  );
  const compactInspectorPanelWidth = useMemo(
    () => getCompactInspectorPanelWidth(splitLayoutWidth),
    [getCompactInspectorPanelWidth, splitLayoutWidth],
  );
  const environmentPeek = peeks?.environment && typeof peeks.environment === "object"
    ? peeks.environment as { items?: Array<{ label?: string; value?: string }> }
    : null;
  const workspacePeek = peeks?.workspace && typeof peeks.workspace === "object"
    ? peeks.workspace as { entries?: Record<string, unknown>[]; totalCount?: number }
    : null;
  const settingsEnvironmentItems = useMemo(() => [
    {
      label: i18nMessages.inspector.environment.runtimeTransport,
      value: i18nMessages.sessionOverview.runtimeTransport?.[runtimeTransport] || runtimeTransport,
    },
    {
      label: i18nMessages.inspector.environment.runtimeSocket,
      value: i18nMessages.sessionOverview.runtimeSocket?.[runtimeSocketStatus] || runtimeSocketStatus,
    },
    ...(runtimeReconnectAttempts > 0
      ? [{
          label: i18nMessages.inspector.environment.runtimeReconnectAttempts,
          value: String(runtimeReconnectAttempts),
        }]
      : []),
    ...(runtimeFallbackReason
      ? [{
          label: i18nMessages.inspector.environment.runtimeFallbackReason,
          value: runtimeFallbackReason,
        }]
      : []),
    ...(environmentPeek?.items || []),
  ], [
    environmentPeek?.items,
    i18nMessages,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
  ]);
  const settingsTrigger = useMemo(() => (
    <SettingsTrigger
      label={i18nMessages.settingsDialog.openLabel}
      onOpen={() => setSettingsDialogOpen(true)}
    />
  ), [i18nMessages.settingsDialog.openLabel]);
  const splitLayoutStyle = useMemo(
    () => (isWideLayout
        ? {
          gridTemplateColumns: `minmax(0, 1fr) ${dragHandleWidth}px ${resolvedInspectorPanelWidth}px`,
        }
        : {
          gridTemplateColumns: `minmax(0, 1fr) ${compactInspectorPanelWidth}px`,
        }),
    [compactInspectorPanelWidth, isWideLayout, resolvedInspectorPanelWidth],
  );
  const {
    agentTabOverview,
    controlsOverview,
    statusOverview,
    tabBrandOverview,
  } = useAppSessionOverviews({
    accessLoggingOut: loggingOut,
    accessMode,
    availableAgents,
    availableImChannels: imChannelConfigs,
    availableModels,
    chatTabs,
    composerSendMode,
    extraControls: settingsTrigger,
    fastMode,
    formatCompactK,
    model,
    onAccessLogout: logout,
    onAgentChange: handleAgentChange,
    onFastModeChange: handleFastModeChange,
    onLoadImChannels: loadImChannelConfigs,
    onModelChange: handleModelChange,
    onOpenImSession: handleOpenImSession,
    onSearchSessions: handleSearchSessions,
    onSelectSearchedSession: handleSelectSearchedSession,
    onThinkModeChange: handleThinkModeChange,
    onThemeChange: setTheme,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    sessionOverviewPending,
    theme,
  });
  const taskRelationshipsPanel = useMemo(() => (
    <TaskRelationshipsPanel
      onDismissRelationship={dismissTaskRelationship}
      relationships={taskRelationships}
      sessionAgentId={session.agentId || "main"}
      visible={taskRelationships.length > 0}
    />
  ), [dismissTaskRelationship, session.agentId, taskRelationships]);
  const inspectorPanel = useMemo(() => (
    <InspectorPanel
      activeTab={activeTab}
      agents={agents}
      artifacts={artifacts}
      compact={!isWideLayout}
      currentAgentId={session.agentId}
      currentSessionUser={session.sessionUser}
      currentWorkspaceRoot={typeof session.workspaceRoot === "string" ? session.workspaceRoot : undefined}
      files={files}
      onSelectArtifact={handleArtifactSelect}
      onRefreshEnvironment={handleRefreshEnvironment}
      onTrackSessionFiles={handleTrackSessionFiles}
      onSyncCurrentSessionModel={handleSyncCurrentSessionModel}
      onWorkspaceFilesOpenChange={handleWorkspaceFilesOpenChange}
      peeks={peeks}
      renderPeek={renderPeek}
      resolvedTheme={resolvedTheme}
      runtimeFallbackReason={runtimeFallbackReason}
      runtimeReconnectAttempts={runtimeReconnectAttempts}
      runtimeSocketStatus={runtimeSocketStatus}
      runtimeTransport={runtimeTransport}
      setActiveTab={setActiveTab}
      snapshots={snapshots}
      taskTimeline={taskTimeline}
      workspaceFilesOpen={workspaceFilesOpen}
    />
  ), [
    activeTab,
    agents,
    artifacts,
    files,
    handleArtifactSelect,
    handleRefreshEnvironment,
    handleTrackSessionFiles,
    handleSyncCurrentSessionModel,
    handleWorkspaceFilesOpenChange,
    isWideLayout,
    peeks,
    renderPeek,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session.agentId,
    session.sessionUser,
    session.workspaceRoot,
    setActiveTab,
    snapshots,
    taskTimeline,
    workspaceFilesOpen,
  ]);
  const chatWorkspaceFiles = workspacePeek?.entries || [];
  const chatWorkspaceCount = Number(workspacePeek?.totalCount);
  const chatWorkspaceLoaded = Array.isArray(workspacePeek?.entries);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="h-dvh overflow-hidden bg-background text-foreground"
        aria-busy={switchingAgentOverlay || switchingModelOverlay ? "true" : "false"}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] flex-col gap-1 overflow-hidden px-3 py-2">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ChatTabsStrip
                activeChatTabId={activeChatTabId}
                className="min-w-0 pt-0 pb-0 pr-0"
                items={chatTabs}
                leadingControl={tabBrandOverview}
                onActivate={handleActivateChatTab}
                onClose={handleCloseChatTab}
                onReorder={handleReorderChatTabs}
                resolvedTheme={resolvedTheme}
                trailingControl={agentTabOverview}
              />
            </div>

            {controlsOverview}
          </div>

          <AppSplitLayout
            chatPanel={(
              <ChatPanel
                agentLabel={session.agentLabel || session.agentId || "main"}
                activeChatTabId={activeChatTabId}
                busy={busy}
                chatFontSize={chatFontSize}
                chatTabs={chatTabs}
                composerSendMode={composerSendMode}
                composerAttachments={composerAttachments}
                files={files}
                focusMessageRequest={focusMessageRequest}
                formatTime={localizedFormatTime}
                messageViewportRef={messageViewportRef}
                messages={messages}
                onActivateChatTab={handleActivateChatTab}
                onAddAttachments={handleAddAttachments}
                onChatFontSizeChange={handleChatFontSizeChange}
                onCloseChatTab={handleCloseChatTab}
                onComposerSendModeToggle={handleComposerSendModeToggle}
                onReorderChatTab={handleReorderChatTabs}
                interactionLocked={Boolean(switchingAgentOverlay || switchingModelOverlay)}
                queuedMessages={activeQueuedMessages}
                onRemoveAttachment={handleRemoveAttachment}
                onPromptChange={handlePromptChange}
                onPromptKeyDown={handlePromptKeyDown}
                onClearQueuedMessages={handleClearQueuedMessages}
                onEditQueuedMessage={handleEditQueuedMessage}
                onRemoveQueuedMessage={handleRemoveQueuedMessage}
                onReset={() => handleReset().catch(() => {})}
                onSend={handleSend}
                onStop={() => handleStop().catch(() => {})}
                prompt={prompt}
                promptSyncVersion={promptSyncVersion}
                promptRef={promptRef}
                resolvedTheme={resolvedTheme}
                run={activeChatRun}
                restoredScrollKey={restoredChatScrollKey}
                restoredScrollRevision={restoredChatScrollRevision}
                restoredScrollState={restoredChatScrollState}
                session={session}
                taskTimeline={taskTimeline}
                sessionOverview={statusOverview}
                showTabsStrip={false}
                userLabel={userLabel}
                workspaceCount={chatWorkspaceCount}
                workspaceFiles={chatWorkspaceFiles}
                workspaceLoaded={chatWorkspaceLoaded}
              />
            )}
            inspectorPanel={inspectorPanel}
            isResizingPanels={isResizingPanels}
            isWideLayout={isWideLayout}
            onResizeStart={handleResizeStart}
            resizeLabel={i18nMessages.common.resizePanels}
            splitLayoutRef={splitLayoutRef}
            splitLayoutStyle={splitLayoutStyle}
            taskRelationshipsPanel={taskRelationshipsPanel}
          />
        </div>
        <SettingsDialog
          currentAgentId={session.agentId}
          environmentItems={settingsEnvironmentItems}
          onClose={() => setSettingsDialogOpen(false)}
          onRefreshEnvironment={handleRefreshEnvironment}
          onUserLabelChange={handleUserLabelChange}
          open={settingsDialogOpen}
          userLabel={userLabel}
        />
        <AgentSwitchOverlay
          agentLabel={switchingAgentOverlay?.agentLabel || ""}
          mode={switchingAgentOverlay?.mode || "switching"}
        />
        <ModelSwitchOverlay modelLabel={switchingModelOverlay?.modelLabel || ""} />
        <SessionNotice notice={modelSwitchNotice} />
        <DevWorkspaceBadge />
      </div>
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      {shouldBypassAccessGate ? (
        <AppContent />
      ) : (
        <AccessGate>
          <AppContent />
        </AccessGate>
      )}
    </I18nProvider>
  );
}
