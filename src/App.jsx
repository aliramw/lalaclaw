import { useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArrowRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { useCommandCenter } from "@/features/app/controllers";
import { I18nProvider } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

function getRelationshipStatusLabel(status, messages) {
  return messages.inspector.relationships.statuses?.[status] || status || "";
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

function getRelationshipStatusBadgeProps(status) {
  if (status === "completed" || status === "established") {
    return { variant: "success", className: "" };
  }

  if (status === "running") {
    return { variant: "active", className: "" };
  }

  if (status === "failed") {
    return {
      variant: "default",
      className: "border-transparent bg-destructive/10 text-destructive",
    };
  }

  return { variant: "default", className: "border-transparent bg-muted text-muted-foreground" };
}

function isSameCompletedAtMap(current = {}, next = {}) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return currentKeys.every((key) => current[key] === next[key]);
}

function AgentSwitchOverlay({ agentLabel }) {
  const { messages } = useI18n();

  if (!agentLabel) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/78 backdrop-blur-[6px]">
      <div className="cc-agent-switch-card flex w-[min(26rem,calc(100vw-2rem))] flex-col items-center gap-4 rounded-[1.75rem] border border-border/70 bg-card/94 px-7 py-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="cc-agent-switch-orbit" aria-hidden="true">
          <span className="cc-agent-switch-dot cc-agent-switch-dot-1" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-2" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-3" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {messages.sessionOverview.labels.agent}
          </div>
          <div className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            {messages.common.switchingToAgent(agentLabel)}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {messages.common.switchingAgentWait}
        </div>
      </div>
    </div>
  );
}

function FailedRelationshipContextMenu({ menu, messages, onClose, onDismiss }) {
  const menuRef = useRef(null);

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
  const [completedAtById, setCompletedAtById] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const nowRef = useRef(now);
  const previousStatusesRef = useRef({});
  const seenActiveIdsRef = useRef(new Set());
  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    nowRef.current = now;
  }, [now]);

  useEffect(() => {
    let startedCountdown = false;

    setCompletedAtById((current) => {
      const next = {};
      const previousStatuses = previousStatusesRef.current || {};
      const nextStatuses = {};
      const nextSeenActiveIds = new Set(seenActiveIdsRef.current);

      for (const relationship of relationships || []) {
        const relationshipId = relationship?.id;
        const status = relationship?.status || "";
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

          const previousStatus = previousStatuses[relationshipId] || "";
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
      (relationships || []).some((relationship) => relationship?.status === "completed" && (relationship.completedAt || completedAtById[relationship.id])),
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
        if (relationship?.status !== "completed") {
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

    const stillVisible = visibleRelationships.some((relationship) => relationship.id === contextMenu.relationshipId && relationship.status === "failed");
    if (!stillVisible) {
      setContextMenu(null);
    }
  }, [contextMenu, visibleRelationships]);

  if (!visible || !visibleRelationships.length) {
    return null;
  }

  return (
    <>
      <Card className="flex max-h-[50vh] flex-col overflow-hidden">
        <CardHeader className="flex h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-none">{messages.inspector.relationships.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-none">{messages.inspector.relationships.subtitle}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2.5 overflow-y-auto px-3 py-3">
          {visibleRelationships.map((relationship) => {
            const { primaryLabel, secondaryLabel } = getRelationshipDisplay(relationship, messages);
            const statusLabel = getRelationshipStatusLabel(relationship.status, messages);
            const statusBadgeProps = getRelationshipStatusBadgeProps(relationship.status);
            const completedAt = relationship.completedAt || completedAtById[relationship.id] || now;
            const hideCountdownSeconds =
              relationship.status === "completed"
                ? Math.max(0, Math.ceil((completedAt + 60000 - now) / 1000))
                : 0;
            const canDismiss = relationship.status === "failed";

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
                  {relationship.status === "completed" ? (
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
        </CardContent>
      </Card>
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
  const {
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    availableModels,
    busy,
    composerAttachments,
    files,
    fastMode,
    focusMessageRequest,
    formatCompactK,
    handleAddAttachments,
    handleAgentChange,
    handleArtifactSelect,
    handleFastModeChange,
    handleModelChange,
    handlePromptChange,
    handlePromptKeyDown,
    handleRemoveAttachment,
    handleReset,
    handleSend,
    handleThinkModeChange,
    dismissTaskRelationship,
    localizedFormatTime,
    messageViewportRef,
    messages,
    model,
    peeks,
    prompt,
    promptRef,
    renderPeek,
    resolvedTheme,
    session,
    setActiveTab,
    setTheme,
    snapshots,
    switchingAgentLabel,
    taskRelationships,
    taskTimeline,
    theme,
  } = useCommandCenter();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-dvh bg-background text-foreground xl:h-dvh xl:overflow-hidden" aria-busy={switchingAgentLabel ? "true" : "false"}>
        <div className="mx-auto flex min-h-dvh w-full max-w-[1760px] flex-col gap-3 overflow-y-auto px-3 py-3 xl:h-full xl:min-h-0 xl:overflow-hidden">
          <SessionOverview
            availableAgents={availableAgents}
            availableModels={availableModels}
            fastMode={fastMode}
            formatCompactK={formatCompactK}
            model={model}
            onAgentChange={handleAgentChange}
            onFastModeChange={handleFastModeChange}
            onModelChange={handleModelChange}
            onThinkModeChange={handleThinkModeChange}
            onThemeChange={setTheme}
            resolvedTheme={resolvedTheme}
            session={session}
            theme={theme}
          />

          <main className="grid content-start gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
            <ChatPanel
              agentLabel={session.agentLabel || session.agentId || "main"}
              busy={busy}
              composerAttachments={composerAttachments}
              files={files}
              focusMessageRequest={focusMessageRequest}
              formatTime={localizedFormatTime}
              messageViewportRef={messageViewportRef}
              messages={messages}
              onAddAttachments={handleAddAttachments}
              queuedMessages={activeQueuedMessages}
              onRemoveAttachment={handleRemoveAttachment}
              onPromptChange={handlePromptChange}
              onPromptKeyDown={handlePromptKeyDown}
              onReset={() => handleReset().catch(() => {})}
              onSend={handleSend}
              prompt={prompt}
              promptRef={promptRef}
              resolvedTheme={resolvedTheme}
              session={session}
              userLabel="marila"
            />

            <div className="flex flex-col gap-3 xl:h-full xl:min-h-0 xl:overflow-hidden">
              <TaskRelationshipsPanel
                onDismissRelationship={dismissTaskRelationship}
                relationships={taskRelationships}
                sessionAgentId={session.agentId || "main"}
                visible={taskRelationships.length > 0}
              />
              <div className="xl:min-h-0 xl:flex-1">
                <InspectorPanel
                  activeTab={activeTab}
                  agents={agents}
                  artifacts={artifacts}
                  currentWorkspaceRoot={session.workspaceRoot}
                  files={files}
                  onSelectArtifact={handleArtifactSelect}
                  peeks={peeks}
                  renderPeek={renderPeek}
                  resolvedTheme={resolvedTheme}
                  setActiveTab={setActiveTab}
                  snapshots={snapshots}
                  taskTimeline={taskTimeline}
                />
              </div>
            </div>
          </main>
        </div>
        <AgentSwitchOverlay agentLabel={switchingAgentLabel} />
      </div>
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
