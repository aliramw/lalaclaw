import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArrowRight, RotateCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel, ChatTabsStrip } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { useCommandCenter } from "@/features/app/controllers";
import { AccessGate } from "@/features/auth/access-gate";
import { useAccessGate } from "@/features/auth/access-context";
import { defaultInspectorPanelWidth, maxInspectorPanelWidth, minInspectorPanelWidth } from "@/features/app/storage";
import { getLocalizedStatusLabel, getRelationshipStatusBadgeProps, normalizeStatusKey } from "@/features/session/status-display";
import { I18nProvider } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const desktopBreakpointQuery = "(min-width: 1280px)";
const dragHandleWidth = 8;
const resizeHandleDots = Array.from({ length: 12 });
const minChatPanelWidth = 560;
const compactInspectorPanelMinWidth = 58;
const compactInspectorPanelMaxWidth = 72;
const compactChatPanelMinWidth = 220;
const shouldBypassAccessGate = Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
const devWorkspaceBadgeStorageKey = "lalaclaw-dev-workspace-badge-collapsed";
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

function buildDevWorkspaceLabel(info, port = "") {
  return [info?.branch || info?.commit || "", info?.worktree || "", port ? `:${port}` : ""].filter(Boolean).join(" · ");
}

function getDevWorkspaceInfo() {
  const info = globalThis.__LALACLAW_DEV_INFO__;
  return info && typeof info === "object" ? info : null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export const devWorkspacePageReloader = {
  reload() {
    window.location.reload();
  },
};

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

function AgentSwitchOverlay({ agentLabel, mode = "switching" }) {
  const { messages } = useI18n();

  if (!agentLabel) {
    return null;
  }

  const title = mode === "opening-session"
    ? messages.common.openingAgentSession(agentLabel)
    : messages.common.switchingToAgent(agentLabel);

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
            {title}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {messages.common.switchingAgentWait}
        </div>
      </div>
    </div>
  );
}

function ModelSwitchOverlay({ modelLabel }) {
  const { messages } = useI18n();

  if (!modelLabel) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/78 backdrop-blur-[6px]">
      <div className="cc-agent-switch-card flex w-[min(30rem,calc(100vw-2rem))] flex-col items-center gap-4 rounded-[1.75rem] border border-border/70 bg-card/94 px-7 py-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="cc-agent-switch-orbit" aria-hidden="true">
          <span className="cc-agent-switch-dot cc-agent-switch-dot-1" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-2" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-3" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {messages.sessionOverview.labels.model}
          </div>
          <div className="space-y-2">
            <div className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              {messages.common.switchingModelTo}
            </div>
            <div className="break-all text-xl font-semibold tracking-[-0.02em] text-foreground">
              {modelLabel}
            </div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {messages.common.switchingModelWait}
        </div>
      </div>
    </div>
  );
}

function DevWorkspaceBadge() {
  const { messages } = useI18n();
  const devWorkspaceInfo = getDevWorkspaceInfo();
  const showDevWorkspaceBadge = Boolean(
    (import.meta.env?.DEV || import.meta.env?.MODE === "test" || import.meta.env?.VITEST) && devWorkspaceInfo,
  );
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem(devWorkspaceBadgeStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const [restartError, setRestartError] = useState("");
  const [restarting, setRestarting] = useState(false);
  const [availableBranches, setAvailableBranches] = useState(() => {
    const currentBranch = String(devWorkspaceInfo?.branch || "").trim();
    return currentBranch ? [currentBranch] : [];
  });
  const [currentBranch, setCurrentBranch] = useState(() => String(devWorkspaceInfo?.branch || "").trim());
  const [targetBranch, setTargetBranch] = useState(() => String(devWorkspaceInfo?.branch || "").trim());
  const [availableWorktrees, setAvailableWorktrees] = useState(() => {
    const currentPath = String(devWorkspaceInfo?.cwd || "").trim();
    if (!currentPath) {
      return [];
    }
    return [{
      path: currentPath,
      name: String(devWorkspaceInfo?.worktree || "").trim(),
      branch: String(devWorkspaceInfo?.branch || "").trim(),
      detached: String(devWorkspaceInfo?.branch || "").trim().startsWith("detached@"),
    }];
  });
  const [currentWorktreePath, setCurrentWorktreePath] = useState(() => String(devWorkspaceInfo?.cwd || "").trim());
  const [targetWorktreePath, setTargetWorktreePath] = useState(() => String(devWorkspaceInfo?.cwd || "").trim());
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(devWorkspaceBadgeStorageKey, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  const port = typeof window !== "undefined" ? window.location.port : "";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const label = buildDevWorkspaceLabel(devWorkspaceInfo, port);
  const toggleLabel = collapsed ? messages.common.devWorkspaceExpand : messages.common.devWorkspaceCollapse;
  const isSwitchingBranch = Boolean(targetBranch) && targetBranch !== currentBranch;
  const restartButtonLabel = restarting
    ? messages.common.devWorkspaceRestarting
    : isSwitchingBranch
      ? messages.common.devWorkspaceSwitchRestart
      : messages.common.devWorkspaceRestart;

  useEffect(() => {
    if (collapsed) {
      return undefined;
    }

    let cancelled = false;

    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const response = await fetch("/api/dev/workspace-restart", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false || cancelled) {
          return;
        }

        const nextBranches = Array.isArray(payload?.branches)
          ? payload.branches.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        const nextWorktrees = Array.isArray(payload?.worktrees)
          ? payload.worktrees.map((entry) => ({
            path: String(entry?.path || "").trim(),
            name: String(entry?.name || "").trim(),
            branch: String(entry?.branch || "").trim(),
            detached: Boolean(entry?.detached),
          })).filter((entry) => entry.path)
          : [];
        const nextCurrentBranch = String(payload?.currentBranch || "").trim() || String(devWorkspaceInfo?.branch || "").trim();
        const nextCurrentWorktreePath = String(payload?.currentWorktreePath || "").trim() || String(devWorkspaceInfo?.cwd || "").trim();

        setAvailableBranches(nextBranches);
        setAvailableWorktrees(nextWorktrees);
        setCurrentBranch(nextCurrentBranch);
        setCurrentWorktreePath(nextCurrentWorktreePath);
        setTargetWorktreePath((current) => {
          if (current && nextWorktrees.some((entry) => entry.path === current)) {
            return current;
          }
          return nextCurrentWorktreePath || current;
        });
        setTargetBranch((current) => {
          if (nextBranches.includes("main")) {
            return "main";
          }
          if (current && nextBranches.includes(current)) {
            return current;
          }
          if (nextCurrentBranch && nextBranches.includes(nextCurrentBranch)) {
            return nextCurrentBranch;
          }
          return nextBranches[0] || nextCurrentBranch || current;
        });
      } finally {
        if (!cancelled) {
          setLoadingBranches(false);
        }
      }
    };

    loadBranches().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [collapsed, devWorkspaceInfo?.branch]);

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((current) => !current);
  }, []);

  const handleToggleKeyDown = useCallback((event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handleToggleCollapsed();
  }, [handleToggleCollapsed]);

  const pollForRestartReady = useCallback(async (restartId) => {
    const timeoutMs = 90_000;
    const startedAt = Date.now();

    await sleep(600);

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch("/api/dev/workspace-restart", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => null);
          if (response.ok && payload?.restartId === restartId) {
            if (payload.status === "ready") {
              devWorkspacePageReloader.reload();
              return;
            }
          if (payload.status === "failed") {
            throw new Error(payload.error || messages.common.devWorkspaceRestartFailed);
          }
        }
      } catch {}

      await sleep(1000);
    }

    throw new Error(messages.common.devWorkspaceRestartFailed);
  }, [messages]);

  const handleRestartServices = useCallback(async (event) => {
    event.stopPropagation();
    if (restarting) {
      return;
    }

    setRestartError("");
    setRestarting(true);

    try {
      const response = await fetch("/api/dev/workspace-restart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          frontendHost: host || "127.0.0.1",
          frontendPort: Number(port || 0),
          targetBranch: isSwitchingBranch ? targetBranch : "",
          targetWorktreePath,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false || !payload?.restartId) {
        throw new Error(payload?.error || messages.common.devWorkspaceRestartFailed);
      }

      await pollForRestartReady(payload.restartId);
    } catch (error) {
      setRestarting(false);
      setRestartError(error?.message || messages.common.devWorkspaceRestartFailed);
    }
  }, [host, isSwitchingBranch, messages, pollForRestartReady, port, restarting, targetBranch, targetWorktreePath]);

  if (!showDevWorkspaceBadge) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[140]">
      <section
        aria-expanded={collapsed ? "false" : "true"}
        aria-label={toggleLabel}
        data-testid="dev-workspace-badge"
        onClick={handleToggleCollapsed}
        onKeyDown={handleToggleKeyDown}
        role="button"
        tabIndex={0}
        className={cn(
          "pointer-events-auto rounded-2xl border border-border/70 bg-background/92 text-left shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur transition hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          collapsed
            ? "max-w-[min(24rem,calc(100vw-1.5rem))] px-3 py-2"
            : "min-w-[15rem] max-w-[min(24rem,calc(100vw-1.5rem))] px-3 py-2.5",
        )}
      >
        {collapsed ? (
          <div className="text-[12px] font-semibold leading-5 text-foreground">
            <code>{label}</code>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="inline-flex h-7 items-center rounded-full border border-amber-500/35 bg-amber-500/12 px-2 text-[10px] font-semibold tracking-[0.14em] text-amber-700 uppercase">
                {messages.common.devWorkspace}
              </div>
              <button
                type="button"
                data-testid="dev-workspace-restart-button"
                onClick={handleRestartServices}
                disabled={restarting}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 text-[11px] font-medium text-foreground transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70"
              >
                <RotateCw className={cn("h-3.5 w-3.5", restarting ? "animate-spin" : "")} aria-hidden="true" />
                <span>{restartButtonLabel}</span>
              </button>
            </div>
            <div className="text-[12px] font-semibold leading-5 text-foreground">
              <code>{label}</code>
            </div>
            <div className="mt-2 grid gap-1">
              <label htmlFor="dev-workspace-worktree-select" className="text-[11px] font-medium leading-4 text-muted-foreground">
                {messages.common.devWorkspaceTargetWorktree}
              </label>
              <select
                id="dev-workspace-worktree-select"
                data-testid="dev-workspace-worktree-select"
                value={targetWorktreePath}
                disabled={restarting || loadingBranches || !availableWorktrees.length}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  setTargetWorktreePath(event.target.value);
                }}
                className="h-8 rounded-md border border-border/70 bg-background px-2 text-[12px] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={messages.common.devWorkspaceTargetWorktree}
              >
                {loadingBranches ? (
                  <option value={targetWorktreePath || ""}>{messages.common.devWorkspaceWorktreeLoading}</option>
                ) : availableWorktrees.length ? (
                  availableWorktrees.map((worktree) => (
                    <option key={worktree.path} value={worktree.path}>
                      {[worktree.name || worktree.path, worktree.branch || (worktree.detached ? "detached" : "")]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))
                ) : (
                  <option value="">{messages.common.devWorkspaceWorktreeUnavailable}</option>
                )}
              </select>
            </div>
            <div className="mt-2 grid gap-1">
              <label htmlFor="dev-workspace-branch-select" className="text-[11px] font-medium leading-4 text-muted-foreground">
                {messages.common.devWorkspaceTargetBranch}
              </label>
              <select
                id="dev-workspace-branch-select"
                data-testid="dev-workspace-branch-select"
                value={targetBranch}
                disabled={restarting || loadingBranches || !availableBranches.length}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  setTargetBranch(event.target.value);
                }}
                className="h-8 rounded-md border border-border/70 bg-background px-2 text-[12px] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={messages.common.devWorkspaceTargetBranch}
              >
                {loadingBranches ? (
                  <option value={targetBranch || ""}>{messages.common.devWorkspaceBranchLoading}</option>
                ) : availableBranches.length ? (
                  availableBranches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))
                ) : (
                  <option value="">{messages.common.devWorkspaceBranchUnavailable}</option>
                )}
              </select>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
              <dt>{messages.common.devWorkspaceBranch}</dt>
              <dd className="min-w-0 truncate">
                <code>{currentBranch || devWorkspaceInfo.branch || devWorkspaceInfo.commit || messages.common.unknown}</code>
              </dd>
              <dt>{messages.common.devWorkspaceWorktree}</dt>
              <dd className="min-w-0 truncate">
                <code>{availableWorktrees.find((entry) => entry.path === currentWorktreePath)?.name || devWorkspaceInfo.worktree || messages.common.unknown}</code>
              </dd>
              <dt>{messages.common.devWorkspacePort}</dt>
              <dd>
                <code>{port || messages.common.unknown}</code>
              </dd>
              <dt>{messages.common.devWorkspacePath}</dt>
              <dd className="min-w-0 truncate">
                <code>{currentWorktreePath || devWorkspaceInfo.cwd || messages.common.unknown}</code>
              </dd>
            </dl>
            {restartError ? (
              <div className="mt-2 text-[11px] leading-4 text-red-600 dark:text-red-300">
                {restartError}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function SessionNotice({ notice }) {
  if (!notice?.message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[130] flex justify-center px-4">
      <div
        className={cn(
          "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur",
          notice.type === "error"
            ? "border-rose-200/70 bg-rose-50/95 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/80 dark:text-rose-100"
            : "border-sky-200/80 bg-white/96 text-slate-800 dark:border-sky-500/25 dark:bg-slate-900/88 dark:text-slate-100",
        )}
      >
        {notice.message}
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
      <Card className="flex max-h-[50vh] flex-col overflow-hidden">
        <div className="flex h-12 items-center border-b border-border/70 bg-card/80 px-3 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <div className="truncate text-sm font-semibold leading-none tracking-tight">{messages.inspector.relationships.title}</div>
            <div className="truncate text-[11px] leading-none text-muted-foreground">{messages.inspector.relationships.subtitle}</div>
          </div>
        </div>
        <CardContent className="grid gap-2.5 overflow-y-auto px-3 py-3">
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
  const { messages: i18nMessages } = useI18n();
  const { accessMode, loggingOut, logout } = useAccessGate();
  const {
    activeChatTabId,
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
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
    setActiveTab,
    setTheme,
    snapshots,
    switchingAgentOverlay,
    switchingModelOverlay,
    taskRelationships,
    taskTimeline,
    theme,
    userLabel,
  } = useCommandCenter();
  const splitLayoutRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const [isWideLayout, setIsWideLayout] = useState(
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(desktopBreakpointQuery).matches : false),
  );
  const [isResizingPanels, setIsResizingPanels] = useState(false);
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
          activeElement.blur();
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
  const openAgentIds = useMemo(() => chatTabs.map((tab) => tab.agentId), [chatTabs]);
  const openSessionUsers = useMemo(() => chatTabs.map((tab) => tab.sessionUser), [chatTabs]);
  const tabBrandOverview = useMemo(() => (
    <SessionOverview
      layout="tab-brand"
      accessLoggingOut={loggingOut}
      accessMode={accessMode}
      availableAgents={availableAgents}
      availableModels={availableModels}
      composerSendMode={composerSendMode}
      fastMode={fastMode}
      formatCompactK={formatCompactK}
      model={model}
      onAgentChange={handleAgentChange}
      onAccessLogout={logout}
      onFastModeChange={handleFastModeChange}
      onModelChange={handleModelChange}
      onSearchSessions={handleSearchSessions}
      onSelectSearchedSession={handleSelectSearchedSession}
      onThinkModeChange={handleThinkModeChange}
      onThemeChange={setTheme}
      resolvedTheme={resolvedTheme}
      runtimeFallbackReason={runtimeFallbackReason}
      runtimeReconnectAttempts={runtimeReconnectAttempts}
      runtimeSocketStatus={runtimeSocketStatus}
      runtimeTransport={runtimeTransport}
      session={session}
      theme={theme}
    />
  ), [
    accessMode,
    availableAgents,
    availableModels,
    composerSendMode,
    fastMode,
    formatCompactK,
    handleAgentChange,
    loggingOut,
    logout,
    handleFastModeChange,
    handleModelChange,
    handleSearchSessions,
    handleSelectSearchedSession,
    handleThinkModeChange,
    model,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    setTheme,
    theme,
  ]);
  const agentTabOverview = useMemo(() => (
    <SessionOverview
      layout="agent-tab"
      accessLoggingOut={loggingOut}
      accessMode={accessMode}
      availableAgents={availableAgents}
      availableModels={availableModels}
      composerSendMode={composerSendMode}
      fastMode={fastMode}
      formatCompactK={formatCompactK}
      model={model}
      onAgentChange={handleAgentChange}
      onAccessLogout={logout}
      onFastModeChange={handleFastModeChange}
      onModelChange={handleModelChange}
      onOpenImSession={handleOpenImSession}
      onSearchSessions={handleSearchSessions}
      onSelectSearchedSession={handleSelectSearchedSession}
      onThinkModeChange={handleThinkModeChange}
      onThemeChange={setTheme}
      openAgentIds={openAgentIds}
      openSessionUsers={openSessionUsers}
      resolvedTheme={resolvedTheme}
      runtimeFallbackReason={runtimeFallbackReason}
      runtimeReconnectAttempts={runtimeReconnectAttempts}
      runtimeSocketStatus={runtimeSocketStatus}
      runtimeTransport={runtimeTransport}
      session={session}
      theme={theme}
    />
  ), [
    accessMode,
    availableAgents,
    availableModels,
    composerSendMode,
    fastMode,
    formatCompactK,
    handleAgentChange,
    loggingOut,
    logout,
    handleFastModeChange,
    handleModelChange,
    handleOpenImSession,
    handleSearchSessions,
    handleSelectSearchedSession,
    handleThinkModeChange,
    model,
    openAgentIds,
    openSessionUsers,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    setTheme,
    theme,
  ]);
  const controlsOverview = useMemo(() => (
    <SessionOverview
      layout="controls"
      accessLoggingOut={loggingOut}
      accessMode={accessMode}
      availableAgents={availableAgents}
      availableModels={availableModels}
      composerSendMode={composerSendMode}
      fastMode={fastMode}
      formatCompactK={formatCompactK}
      model={model}
      onAgentChange={handleAgentChange}
      onAccessLogout={logout}
      onFastModeChange={handleFastModeChange}
      onModelChange={handleModelChange}
      onSearchSessions={handleSearchSessions}
      onSelectSearchedSession={handleSelectSearchedSession}
      onThinkModeChange={handleThinkModeChange}
      onThemeChange={setTheme}
      resolvedTheme={resolvedTheme}
      runtimeFallbackReason={runtimeFallbackReason}
      runtimeReconnectAttempts={runtimeReconnectAttempts}
      runtimeSocketStatus={runtimeSocketStatus}
      runtimeTransport={runtimeTransport}
      session={session}
      theme={theme}
    />
  ), [
    accessMode,
    availableAgents,
    availableModels,
    composerSendMode,
    fastMode,
    formatCompactK,
    handleAgentChange,
    loggingOut,
    logout,
    handleFastModeChange,
    handleModelChange,
    handleSearchSessions,
    handleSelectSearchedSession,
    handleThinkModeChange,
    model,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    setTheme,
    theme,
  ]);
  const statusOverview = useMemo(() => (
    <SessionOverview
      layout="status"
      accessLoggingOut={loggingOut}
      accessMode={accessMode}
      availableAgents={availableAgents}
      availableModels={availableModels}
      composerSendMode={composerSendMode}
      fastMode={fastMode}
      formatCompactK={formatCompactK}
      model={model}
      onAgentChange={handleAgentChange}
      onAccessLogout={logout}
      onFastModeChange={handleFastModeChange}
      onModelChange={handleModelChange}
      onSearchSessions={handleSearchSessions}
      onSelectSearchedSession={handleSelectSearchedSession}
      onThinkModeChange={handleThinkModeChange}
      onThemeChange={setTheme}
      resolvedTheme={resolvedTheme}
      runtimeFallbackReason={runtimeFallbackReason}
      runtimeReconnectAttempts={runtimeReconnectAttempts}
      runtimeSocketStatus={runtimeSocketStatus}
      runtimeTransport={runtimeTransport}
      session={session}
      theme={theme}
    />
  ), [
    accessMode,
    availableAgents,
    availableModels,
    composerSendMode,
    fastMode,
    formatCompactK,
    handleAgentChange,
    loggingOut,
    logout,
    handleFastModeChange,
    handleModelChange,
    handleSearchSessions,
    handleSelectSearchedSession,
    handleThinkModeChange,
    model,
    resolvedTheme,
    runtimeFallbackReason,
    runtimeReconnectAttempts,
    runtimeSocketStatus,
    runtimeTransport,
    session,
    setTheme,
    theme,
  ]);
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
      currentWorkspaceRoot={session.workspaceRoot}
      files={files}
      onSelectArtifact={handleArtifactSelect}
      onRefreshEnvironment={handleRefreshEnvironment}
      onTrackSessionFiles={handleTrackSessionFiles}
      onSyncCurrentSessionModel={handleSyncCurrentSessionModel}
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
  ]);

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

          <main
            ref={splitLayoutRef}
            className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden"
            style={splitLayoutStyle}
          >
            <div className="min-h-0 min-w-0 pr-1.5 xl:pr-0.5">
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
                onUserLabelChange={handleUserLabelChange}
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
                restoredScrollKey={restoredChatScrollKey}
                restoredScrollRevision={restoredChatScrollRevision}
                restoredScrollState={restoredChatScrollState}
                session={session}
                sessionOverview={statusOverview}
                showTabsStrip={false}
                userLabel={userLabel}
              />
            </div>

            {isWideLayout ? (
              <div className="xl:flex xl:min-h-0 xl:items-stretch xl:justify-center">
                <button
                  type="button"
                  aria-label={i18nMessages.common.resizePanels}
                  onPointerDown={handleResizeStart}
                  className="group relative h-full w-full cursor-col-resize touch-none select-none"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-1/2 top-1/2 inline-grid h-[22px] w-[6.8px] -translate-x-1/2 -translate-y-1/2 grid-cols-2 grid-rows-6 gap-x-[2px] gap-y-[2px] transition-colors",
                      isResizingPanels
                        ? "bg-transparent"
                        : "bg-transparent",
                    )}
                  >
                    {resizeHandleDots.map((_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-[2.4px] w-[2.4px] rounded-full transition-colors",
                          isResizingPanels ? "bg-primary/80" : "bg-muted-foreground/45 group-hover:bg-foreground/55",
                        )}
                      />
                    ))}
                  </span>
                </button>
              </div>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden pl-1.5 xl:min-w-[300px] xl:pl-0.5">
              {taskRelationshipsPanel}
              <div className="min-h-0 min-w-0 flex-1">
                {inspectorPanel}
              </div>
            </div>
          </main>
        </div>
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
