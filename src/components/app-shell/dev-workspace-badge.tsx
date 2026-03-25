import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getDevWorkspaceInfo } from "@/components/app-shell/dev-workspace-info";
import { buildDevWorkspaceLabel } from "@/lib/dev-workspace-label";
import { devWorkspacePageReloader } from "@/lib/dev-workspace-page-reloader";
import { cn } from "@/lib/utils";

const devWorkspaceBadgeStorageKey = "lalaclaw-dev-workspace-badge-collapsed";

function formatDetachedWorkspaceLabel(commit = "") {
  const normalizedCommit = String(commit || "").trim();
  return normalizedCommit ? `detached@${normalizedCommit}` : "detached";
}

function resolveCurrentWorkspaceBranchLabel({ branch = "", commit = "", detached = false } = {}) {
  const normalizedBranch = String(branch || "").trim();
  if (normalizedBranch) {
    return normalizedBranch;
  }

  return detached ? formatDetachedWorkspaceLabel(commit) : "";
}

function getWorktreePathSuffix(worktreePath = "") {
  const normalizedPath = String(worktreePath || "").trim().replace(/\\/g, "/");
  if (!normalizedPath) {
    return "";
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return segments.slice(-2).join("/");
  }
  return segments[0] || normalizedPath;
}

function buildWorktreeOptionLabel(worktree, duplicateLabelCounts = new Map()) {
  const branchLabel = resolveCurrentWorkspaceBranchLabel({
    branch: worktree?.branch,
    detached: worktree?.detached,
  });
  const baseLabel = [worktree?.name || worktree?.path || "", branchLabel].filter(Boolean).join(" · ");
  if (!baseLabel) {
    return getWorktreePathSuffix(worktree?.path);
  }

  if ((duplicateLabelCounts.get(baseLabel) || 0) < 2) {
    return baseLabel;
  }

  const pathSuffix = getWorktreePathSuffix(worktree?.path);
  return pathSuffix ? `${baseLabel} · ${pathSuffix}` : baseLabel;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function DevWorkspaceBadge() {
  const { messages } = useI18n();
  const devWorkspaceInfo = getDevWorkspaceInfo();
  const fallbackCurrentBranch = resolveCurrentWorkspaceBranchLabel({
    branch: devWorkspaceInfo?.branch,
    commit: devWorkspaceInfo?.commit,
    detached: String(devWorkspaceInfo?.branch || "").trim().startsWith("detached@"),
  });
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
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState(() => fallbackCurrentBranch);
  const [targetBranch, setTargetBranch] = useState("");
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
  const worktreeOptionLabelCounts = useMemo(() => {
    const counts = new Map();
    availableWorktrees.forEach((worktree) => {
      const baseLabel = [worktree.name || worktree.path || "", resolveCurrentWorkspaceBranchLabel({
        branch: worktree.branch,
        detached: worktree.detached,
      })].filter(Boolean).join(" · ");
      counts.set(baseLabel, (counts.get(baseLabel) || 0) + 1);
    });
    return counts;
  }, [availableWorktrees]);
  const currentWorktreeName = availableWorktrees.find((entry) => entry.path === currentWorktreePath)?.name
    || devWorkspaceInfo?.worktree
    || "";
  const label = buildDevWorkspaceLabel({
    branch: currentBranch || fallbackCurrentBranch || devWorkspaceInfo?.commit || "",
    worktree: currentWorktreeName,
  }, port);
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
        const nextCurrentWorktreePath = String(payload?.currentWorktreePath || "").trim() || String(devWorkspaceInfo?.cwd || "").trim();
        const currentWorktreeEntry = nextWorktrees.find((entry) => entry.path === nextCurrentWorktreePath);
        const nextCurrentBranch = resolveCurrentWorkspaceBranchLabel({
          branch: String(payload?.currentBranch || "").trim() || currentWorktreeEntry?.branch || "",
          commit: devWorkspaceInfo?.commit,
          detached: Boolean(currentWorktreeEntry?.detached),
        }) || fallbackCurrentBranch;

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
          if (current && nextBranches.includes(current)) {
            return current;
          }
          const normalizedPayloadBranch = String(payload?.currentBranch || "").trim();
          if (normalizedPayloadBranch && nextBranches.includes(normalizedPayloadBranch)) {
            return normalizedPayloadBranch;
          }
          return "";
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
  }, [collapsed, devWorkspaceInfo?.branch, devWorkspaceInfo?.commit, devWorkspaceInfo?.cwd, fallbackCurrentBranch]);

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
                      {buildWorktreeOptionLabel(worktree, worktreeOptionLabelCounts)}
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
