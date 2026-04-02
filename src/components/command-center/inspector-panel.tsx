import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderOpen, Hammer, Monitor, ScrollText, X } from "lucide-react";
import {
  buildFileFilterMatcher,
  compareFileItemsByPath,
  countWorkspaceFiles,
  normalizeWorkspaceNodes,
  renameSessionItems,
  resolveItemPath,
} from "@/components/command-center/inspector-files-panel-utils";
import {
  collectEnvironmentGroups,
  collectOpenClawDiagnostics,
  getInspectorItemKey,
  isOpenClawDiagnosticItem,
  isLalaClawEnvironmentItem,
  localizeArtifactTitle,
  mergeSessionFileItems,
} from "@/components/command-center/inspector-panel-utils";
import {
  DataList,
  EnvironmentSectionCard,
  InspectorHint,
  PanelEmpty,
  TabCountBadge,
} from "@/components/command-center/inspector-panel-primitives";
import { EnvironmentDiagnosticsSections } from "@/components/command-center/inspector-panel-environment-sections";
import {
  bootstrapWorkspaceTree,
  buildRenameDialogState,
  commitRenameChange,
  fetchWorkspaceDirectoryContents,
  handleSelectedDirectoryPaste,
  loadWorkspaceRootTree,
  pasteClipboardEntriesFromMenu,
  pasteClipboardEntriesIntoDirectory,
  reloadFilteredWorkspaceTree,
  resetFilesTabStateForWorkspaceRootChange,
  submitRenameChange,
  syncWorkspaceNodesFromIncomingSnapshot,
  toggleWorkspaceDirectoryOpen,
  type InspectorRenameExtensionState,
  type InspectorRenameState,
  type InspectorRewrite,
} from "@/components/command-center/inspector-panel-file-actions";
import { FilesTabOverlays } from "@/components/command-center/inspector-panel-files-overlays";
import {
  OpenClawUpdateTroubleshootingDialog,
} from "@/components/command-center/inspector-panel-dialogs";
import {
  LalaClawPanel,
  OpenClawManagementPanel,
} from "@/components/command-center/inspector-panel-openclaw-panels";
import {
  OpenClawManagementConfirmDialog,
  OpenClawOperationHistoryPanel,
  OpenClawRemoteRecoveryDialog,
  OpenClawRollbackConfirmDialog,
} from "@/components/command-center/inspector-panel-openclaw-operations";
import { OpenClawOnboardingPanel } from "@/components/command-center/inspector-panel-openclaw-onboarding";
import { OpenClawConfigPanel } from "@/components/command-center/inspector-panel-openclaw-config";
import { OpenClawUpdatePanel } from "@/components/command-center/inspector-panel-openclaw-update";
import { TimelineTab } from "@/components/command-center/inspector-panel-timeline";
import {
  FileLink,
} from "@/components/command-center/inspector-panel-files";
import {
  SessionFilesSection,
  WorkspaceFilesSection,
} from "@/components/command-center/inspector-panel-file-sections";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardDescriptionSurface as CardDescription,
  CardHeaderSurface as CardHeader,
  CardSurface as Card,
  CardTitleSurface as CardTitle,
  ScrollAreaSurface as ScrollArea,
  TabsContentSurface as TabsContent,
  TabsListSurface as TabsList,
  TabsSurface as Tabs,
  TabsTriggerSurface as TabsTrigger,
  TooltipContentSurface as TooltipContent,
  TooltipSurface as Tooltip,
  TooltipTriggerSurface as TooltipTrigger,
} from "@/components/command-center/inspector-panel-surfaces";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { buildOpenClawRemoteGuard, useOpenClawInspector } from "@/features/app/controllers/use-openclaw-inspector";
import { apiFetch } from "@/lib/api-client";
import { cn, stripMarkdownForDisplay } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export { LalaClawPanel } from "@/components/command-center/inspector-panel-openclaw-panels";

const LazyFilePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.FilePreviewOverlay })),
);
const LazyImagePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.ImagePreviewOverlay })),
);
const LazyContextPreviewDialog = lazy(() =>
  import("@/components/command-center/context-preview-dialog").then((module) => ({ default: module.ContextPreviewDialog })),
);

const inspectorTabKeys = ["files", "artifacts", "timeline", "environment"];
const WORKSPACE_FILTER_DEBOUNCE_MS = 150;

type InspectorRecord = Record<string, any>;
type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorPanelItem = InspectorRecord;
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorPreviewHandler = (item: any, options?: any) => void;
type InspectorRevealHandler = (item: any) => Promise<void>;
type InspectorFormValues = Record<string, unknown>;
type InspectorPasteFeedback = {
  kind: "success" | "error";
  text: string;
} | null;
type InspectorAuthorizationState = Record<string, any> | null;
type InspectorHistoryEntry = Record<string, any>;
type InspectorWorkspaceState = {
  loaded: boolean;
  loading: boolean;
  error: string;
};
type InspectorEnvironmentFlow = {
  enabled: boolean;
  busy?: boolean;
  defaultOpen?: boolean;
  error?: string;
  forceOpen?: boolean;
  loading?: boolean;
  onReload?: InspectorFlowHandler;
  onRunUpdate?: InspectorFlowHandler;
  state?: InspectorRecord | null;
} | null;
type InspectorUpdateFlow = {
  enabled: boolean;
  busy?: boolean;
  error?: string;
  loading?: boolean;
  onOpenTroubleshooting?: (entry: InspectorTroubleshootingEntry) => void;
  onReload?: InspectorFlowHandler;
  onRunUpdate?: InspectorFlowHandler;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
} | null;
type InspectorOnboardingFlow = {
  enabled: boolean;
  busy?: boolean;
  defaultOpen?: boolean;
  error?: string;
  forceOpen?: boolean;
  loading?: boolean;
  onChange?: (fieldKey: any, value: any) => void;
  onRefreshCapabilities?: InspectorFlowHandler;
  onReload?: InspectorFlowHandler;
  onSubmit?: InspectorFlowHandler;
  refreshResult?: InspectorRecord | null;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
  values?: InspectorFormValues;
} | null;
type InspectorHistoryFlow = {
  enabled: boolean;
  entries?: InspectorHistoryEntry[];
  error?: string;
  loading?: boolean;
  onRequestRollback?: (entry: InspectorHistoryEntry) => void;
  onReload?: InspectorFlowHandler;
  rollbackBusy?: boolean;
} | null;
type InspectorConfigEditorFlow = {
  enabled: boolean;
  busy?: boolean;
  error?: string;
  loading?: boolean;
  onChange?: (fieldKey: any, value: any) => void;
  onChangeRemoteAuthorization?: (fieldKey: any, value: any) => void;
  onReload?: InspectorFlowHandler;
  onSubmit?: InspectorFlowHandler;
  remoteAuthorization?: InspectorAuthorizationState;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
  values?: InspectorFormValues;
} | null;
type InspectorManagementFlow = {
  enabled: boolean;
  actionIntent?: InspectorRecord | null;
  busyActionKey?: string;
  onRefresh?: InspectorFlowHandler;
  onRequestAction?: (action: any) => void;
  refreshing?: boolean;
  result?: InspectorRecord | null;
} | null;
type InspectorTroubleshootingEntry = {
  key: string;
  title: string;
  summary: string;
  steps: string[];
  commands: string[];
  docs: Array<{ key: string; href: string; label: string }>;
  canPreview?: boolean;
} | null;

function FilesTab({
  active = false,
  currentAgentId = "",
  currentWorkspaceRoot = "",
  currentSessionUser = "",
  items,
  messages,
  onOpenEdit,
  onOpenPreview,
  onTrackSessionFiles,
  onWorkspaceFilesOpenChange,
  workspaceFilesOpen = true,
  workspaceCount,
  workspaceItems = [],
  workspaceLoaded = false,
}: {
  active?: boolean;
  currentAgentId?: string;
  currentWorkspaceRoot?: string;
  currentSessionUser?: string;
  items: any[];
  messages: InspectorMessages;
  onOpenEdit?: InspectorPreviewHandler;
  onOpenPreview?: InspectorPreviewHandler;
  onTrackSessionFiles?: (payload: { files: any[]; rewrites?: InspectorRewrite[] }) => void;
  onWorkspaceFilesOpenChange?: (open: boolean) => void;
  workspaceFilesOpen?: boolean;
  workspaceCount?: number;
  workspaceItems?: any[];
  workspaceLoaded?: boolean;
}) {
  const [contextMenu, setContextMenu] = useState<any>(null);
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [pasteFeedback, setPasteFeedback] = useState<InspectorPasteFeedback>(null);
  const [sessionFilterInput, setSessionFilterInput] = useState("");
  const [workspaceFilterInput, setWorkspaceFilterInput] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [localSessionItems, setLocalSessionItems] = useState<any[]>([]);
  const [sessionPathRewrites, setSessionPathRewrites] = useState<InspectorRewrite[]>([]);
  const [renameState, setRenameState] = useState<InspectorRenameState>(null);
  const [renameExtensionState, setRenameExtensionState] = useState<InspectorRenameExtensionState>(null);
  const fileActionSections = [
    { key: "created", label: messages.inspector.fileActions.created },
    { key: "modified", label: messages.inspector.fileActions.modified },
    { key: "viewed", label: messages.inspector.fileActions.viewed },
  ];
  const runtimeSessionItems = useMemo(
    () => sessionPathRewrites.reduce(
      (current, rewrite) => renameSessionItems(current, rewrite.previousPath, rewrite.nextPath),
      items,
    ),
    [items, sessionPathRewrites],
  );
  const sessionItems = useMemo(
    () => mergeSessionFileItems(runtimeSessionItems, localSessionItems),
    [localSessionItems, runtimeSessionItems],
  );
  const sessionFilterMatcher = buildFileFilterMatcher(sessionFilterInput);
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: sessionItems
        .filter((item) => item.primaryAction === section.key)
        .filter((item) => (sessionFilterMatcher ? sessionFilterMatcher(item, currentWorkspaceRoot) : true))
        .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot)),
    }))
    .filter((section) => section.items.length);
  const [workspaceNodes, setWorkspaceNodes] = useState<any[]>(() => normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
  const [workspaceState, setWorkspaceState] = useState<InspectorWorkspaceState>({
    loaded: workspaceLoaded,
    loading: false,
    error: "",
  });
  const previousWorkspaceRootRef = useRef<string>(currentWorkspaceRoot);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedSessionDirectories, setExpandedSessionDirectories] = useState<Record<string, boolean>>({});
  const hasSessionFiles = sessionItems.length > 0;
  const hasSessionFilter = Boolean(String(sessionFilterInput || "").trim());
  const visibleSessionCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hasWorkspaceFilter = Boolean(String(workspaceFilter || "").trim());
  const visibleWorkspaceCount = hasWorkspaceFilter
    ? countWorkspaceFiles(workspaceNodes)
    : (Number.isFinite(workspaceCount) ? workspaceCount : (workspaceState.loaded ? workspaceNodes.length : "--"));
  const pasteUnavailableMessage = messages.inspector.workspaceTree.pasteUnavailable || messages.inspector.workspaceTree.loadFailed;

  useEffect(() => {
    if (!pasteFeedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setPasteFeedback(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pasteFeedback]);

  useEffect(() => {
    setLocalSessionItems([]);
    setSessionPathRewrites([]);
  }, [currentAgentId, currentSessionUser]);

  const fetchWorkspaceDirectory = useCallback(async (node, { preserveExpanded }: { preserveExpanded?: boolean } = {}) => {
    await fetchWorkspaceDirectoryContents({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      node,
      preserveExpanded,
      setWorkspaceNodes,
    });
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot, messages.inspector.workspaceTree.loadFailed]);

  useEffect(() => {
    const workspaceRootChanged = previousWorkspaceRootRef.current !== currentWorkspaceRoot;
    previousWorkspaceRootRef.current = currentWorkspaceRoot;

    if (workspaceRootChanged) {
      resetFilesTabStateForWorkspaceRootChange({
        currentWorkspaceRoot,
        setContextMenu,
        setExpandedSessionDirectories,
        setLocalSessionItems,
        setPasteFeedback,
        setRenameExtensionState,
        setRenameState,
        setSelectedDirectoryPath,
        setSessionFilterInput,
        setSessionPathRewrites,
        setWorkspaceFilter,
        setWorkspaceFilterInput,
        setWorkspaceNodes,
        setWorkspaceState,
        workspaceItems,
        workspaceLoaded,
      });
      return;
    }

    syncWorkspaceNodesFromIncomingSnapshot({
      currentWorkspaceRoot,
      hasWorkspaceFilter,
      setWorkspaceNodes,
      setWorkspaceState,
      workspaceItems,
      workspaceLoaded,
    });
  }, [currentWorkspaceRoot, hasWorkspaceFilter, items, workspaceItems, workspaceLoaded]);

  useEffect(() => {
    const nextFilter = String(workspaceFilterInput || "");
    if (!nextFilter.trim()) {
      setWorkspaceFilter("");
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setWorkspaceFilter(nextFilter);
    }, WORKSPACE_FILTER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspaceFilterInput]);

  useEffect(() => {
    if (!active) {
      setContextMenu(null);
    }
  }, [active]);

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = {};
      let changed = false;

      for (const group of groups) {
        if (Object.prototype.hasOwnProperty.call(current, group.key)) {
          next[group.key] = current[group.key];
        } else {
          next[group.key] = false;
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }

      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!hasWorkspaceFilter || !currentWorkspaceRoot) {
      return undefined;
    }

    let cancelled = false;
    reloadFilteredWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      setWorkspaceNodes,
      setWorkspaceState,
      workspaceFilter,
    })
      .then(() => {
        if (cancelled) {
          return;
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot, hasWorkspaceFilter, messages.inspector.workspaceTree.loadFailed, workspaceFilter]);

  const loadWorkspaceRoot = useCallback(async () => {
    await loadWorkspaceRootTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      hasWorkspaceFilter,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      setWorkspaceNodes,
      setWorkspaceState,
      workspaceFilter,
      workspaceState,
    });
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree.loadFailed,
    workspaceFilter,
    workspaceState,
  ]);

  useEffect(() => {
    if (hasWorkspaceFilter || workspaceLoaded || workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    bootstrapWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      setWorkspaceNodes,
      setWorkspaceState,
    })
      .then(() => {})
      .catch((error) => {
        console.error(error);
      });
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree.loadFailed,
    workspaceLoaded,
    workspaceState.loaded,
    workspaceState.loading,
  ]);

  const handleWorkspaceDirectoryOpen = useCallback(async (node) => {
    await toggleWorkspaceDirectoryOpen({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      node,
      setWorkspaceNodes,
    });
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot, messages.inspector.workspaceTree.loadFailed]);

  const handleRefreshWorkspaceDirectory = useCallback(async (node) => {
    await fetchWorkspaceDirectory(node);
  }, [fetchWorkspaceDirectory]);

  const pasteClipboardEntriesToDirectoryRef = useCallback(async (directoryItem, clipboardEntries) => {
    await pasteClipboardEntriesIntoDirectory({
      clipboardEntries,
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      directoryItem,
      fetchWorkspaceDirectory,
      hasWorkspaceFilter,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      onTrackSessionFiles,
      pasteFailedMessage: (targetLabel, error) => typeof messages.inspector.workspaceTree.pasteFailed === "function"
        ? messages.inspector.workspaceTree.pasteFailed(targetLabel, error)
        : (error || messages.inspector.workspaceTree.loadFailed),
      pasteSucceededMessage: (savedCount, targetLabel) => typeof messages.inspector.workspaceTree.pasteSucceeded === "function"
        ? messages.inspector.workspaceTree.pasteSucceeded(savedCount, targetLabel)
        : messages.inspector.workspaceTree.loadFailed,
      pasteUnavailableMessage,
      setLocalSessionItems,
      setPasteFeedback,
      setSelectedDirectoryPath,
      setWorkspaceNodes,
      setWorkspaceState,
      workspaceFilter,
      workspaceNodes,
    });
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    fetchWorkspaceDirectory,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree,
    onTrackSessionFiles,
    pasteUnavailableMessage,
    workspaceFilter,
    workspaceNodes,
  ]);

  const handlePasteDirectoryFromMenu = useCallback(async (directoryItem) => {
    await pasteClipboardEntriesFromMenu({
      directoryItem,
      pasteClipboardEntries: pasteClipboardEntriesToDirectoryRef,
    });
  }, [pasteClipboardEntriesToDirectoryRef]);

  const commitRename = useCallback(async ({ item, nextName }) => {
    await commitRenameChange({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      hasWorkspaceFilter,
      item,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      nextName,
      onTrackSessionFiles,
      renameDefaultErrorMessage: messages.common.requestFailed,
      renameFailedMessage: (name, error) => typeof messages.inspector.workspaceTree.renameFailed === "function"
        ? messages.inspector.workspaceTree.renameFailed(name, error)
        : error,
      setLocalSessionItems,
      setSelectedDirectoryPath,
      setSessionPathRewrites,
      setWorkspaceNodes,
      setWorkspaceState,
      workspaceFilter,
    });
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree,
    onTrackSessionFiles,
    workspaceFilter,
  ]);

  const openRenameDialog = useCallback((item, source = "session") => {
    const nextState = buildRenameDialogState(item, source);
    if (!nextState) {
      return;
    }
    setRenameExtensionState(null);
    setRenameState(nextState);
  }, []);

  const submitRename = useCallback(async (forceExtensionChange = false) => {
    await submitRenameChange({
      commitRename,
      forceExtensionChange,
      loadFailedMessage: messages.inspector.workspaceTree.loadFailed,
      renameState,
      setRenameExtensionState,
      setRenameState,
    });
  }, [commitRename, messages.inspector.workspaceTree, renameState]);

  useEffect(() => {
    if (!active || !selectedDirectoryPath) {
      return undefined;
    }

    const handleDirectoryPaste = (event) => {
      handleSelectedDirectoryPaste({
        event,
        selectedDirectoryPath,
        pasteClipboardEntries: pasteClipboardEntriesToDirectoryRef,
      });
    };

    window.addEventListener("paste", handleDirectoryPaste, true);
    return () => {
      window.removeEventListener("paste", handleDirectoryPaste, true);
    };
  }, [active, pasteClipboardEntriesToDirectoryRef, selectedDirectoryPath]);

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1 pr-4">
          <InspectorHint text={messages.inspector.filesHint} />
          {pasteFeedback ? (
            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-[12px] leading-5",
                pasteFeedback.kind === "success"
                  ? "border-emerald-500/25 bg-emerald-500/6 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              {pasteFeedback.text}
            </div>
          ) : null}
          {hasSessionFiles ? (
            <SessionFilesSection
              collapsedGroups={collapsedGroups}
              currentWorkspaceRoot={currentWorkspaceRoot}
              expandedSessionDirectories={expandedSessionDirectories}
              groups={groups}
              hasSessionFilter={hasSessionFilter}
              messages={messages}
              onOpenPreview={onOpenPreview}
              onSessionFilterChange={setSessionFilterInput}
              onSetCollapsedGroups={setCollapsedGroups}
              onSetContextMenu={setContextMenu}
              onSetExpandedSessionDirectories={setExpandedSessionDirectories}
              onSetSelectedDirectoryPath={setSelectedDirectoryPath}
              selectedDirectoryPath={selectedDirectoryPath}
              sessionFilterInput={sessionFilterInput}
              visibleSessionCount={hasSessionFilter ? visibleSessionCount : sessionItems.length}
            />
          ) : null}

          <WorkspaceFilesSection
            currentWorkspaceRoot={currentWorkspaceRoot}
            hasWorkspaceFilter={hasWorkspaceFilter}
            messages={messages}
            onOpenPreview={onOpenPreview}
            onOpenWorkspaceDirectory={handleWorkspaceDirectoryOpen}
            open={workspaceFilesOpen}
            onOpenChange={onWorkspaceFilesOpenChange}
            onSetContextMenu={setContextMenu}
            onSetSelectedDirectoryPath={setSelectedDirectoryPath}
            onToggleOpen={() => {
              loadWorkspaceRoot().catch(() => {});
            }}
            selectedDirectoryPath={selectedDirectoryPath}
            visibleWorkspaceCount={visibleWorkspaceCount ?? 0}
            workspaceFilterInput={workspaceFilterInput}
            workspaceNodes={workspaceNodes}
            workspaceState={workspaceState}
            onWorkspaceFilterChange={setWorkspaceFilterInput}
            onWorkspaceFilterClear={() => {
              setWorkspaceFilterInput("");
              setWorkspaceFilter("");
            }}
          />
        </div>
      </ScrollArea>
      <FilesTabOverlays
        hasWorkspaceFilter={hasWorkspaceFilter}
        menu={contextMenu}
        messages={messages}
        onCloseMenu={() => setContextMenu(null)}
        onOpenEdit={onOpenEdit}
        onOpenPreview={onOpenPreview}
        onPasteDirectory={handlePasteDirectoryFromMenu}
        onRefreshDirectory={handleRefreshWorkspaceDirectory}
        onRename={openRenameDialog}
        onRenameCancel={() => {
          if (renameState?.submitting) {
            return;
          }
          setRenameState(null);
          setRenameExtensionState(null);
        }}
        onRenameChange={(value) => {
          setRenameState((current) => current ? { ...current, value, error: "" } : current);
        }}
        onRenameConfirm={() => {
          submitRename(false).catch(() => {});
        }}
        onRenameExtensionCancel={() => {
          if (renameState?.submitting) {
            return;
          }
          setRenameExtensionState(null);
        }}
        onRenameExtensionConfirm={() => {
          submitRename(true).catch(() => {});
        }}
        renameExtensionState={renameExtensionState}
        renameState={renameState}
      />
    </>
  );
}

function EnvironmentTab({
  configEditor = null,
  history = null,
  items = [],
  lalaclawFlow = null,
  locale = "en",
  management = null,
  messages,
  onboarding = null,
  onOpenPreview,
  onOpenRemoteGuide,
  onRevealInFileManager,
  updateFlow = null,
}: {
  configEditor?: InspectorConfigEditorFlow;
  history?: InspectorHistoryFlow;
  items?: InspectorPanelItem[];
  lalaclawFlow?: InspectorEnvironmentFlow;
  locale?: string;
  management?: InspectorManagementFlow;
  messages: InspectorMessages;
  onboarding?: InspectorOnboardingFlow;
  onOpenPreview?: InspectorPreviewHandler;
  onOpenRemoteGuide?: () => void;
  onRevealInFileManager?: InspectorRevealHandler;
  updateFlow?: InspectorUpdateFlow;
}) {
  if (!items.length) {
    return <PanelEmpty text={messages.inspector.empty.noEnvironment} />;
  }

  const { sections: openClawDiagnostics, remainingItems } = collectOpenClawDiagnostics(items);
  const lalaclawItems = remainingItems.filter((item) => isLalaClawEnvironmentItem(item));
  const groupedEnvironmentItems = collectEnvironmentGroups(
    remainingItems.filter((item) => !isLalaClawEnvironmentItem(item)),
    messages,
  );
  const remoteGuard = buildOpenClawRemoteGuard(items, messages);

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="min-w-0">
      <div className="min-w-0 max-w-full space-y-2 overflow-hidden py-1 pr-4">
        <InspectorHint text={messages.inspector.empty.environment} />
        {lalaclawFlow?.enabled ? (
          <EnvironmentSectionCard
            alertDot={Boolean(lalaclawFlow.state?.updateAvailable)}
            alertTestId="environment-section-alert-lalaclaw-update"
            defaultOpen={Boolean(lalaclawFlow.defaultOpen)}
            forceOpen={Boolean(lalaclawFlow.forceOpen)}
            label={messages.inspector.lalaclawUpdate.title}
            messages={messages}
            wrapContent={false}
          >
            <LalaClawPanel
              busy={lalaclawFlow.busy}
              error={lalaclawFlow.error}
              loading={lalaclawFlow.loading}
              messages={messages}
              metadataItems={lalaclawItems}
              onReload={lalaclawFlow.onReload}
              onRunUpdate={lalaclawFlow.onRunUpdate}
              showTitle={false}
              state={lalaclawFlow.state}
            />
          </EnvironmentSectionCard>
        ) : null}
        {onboarding?.enabled ? (
          <EnvironmentSectionCard
            defaultOpen={Boolean(onboarding.defaultOpen)}
            forceOpen={Boolean(onboarding.forceOpen)}
            label={messages.inspector.openClawOnboarding.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawOnboardingPanel
              busy={onboarding.busy}
              error={onboarding.error}
              loading={onboarding.loading}
              messages={messages}
              onChange={onboarding.onChange}
              onRefreshCapabilities={onboarding.onRefreshCapabilities}
              onReload={onboarding.onReload}
              onSubmit={onboarding.onSubmit}
              refreshResult={onboarding.refreshResult}
              result={onboarding.result}
              showTitle={false}
              state={onboarding.state}
              values={onboarding.values}
            />
          </EnvironmentSectionCard>
        ) : null}
        {configEditor?.enabled ? (
          <EnvironmentSectionCard
            label={messages.inspector.openClawConfig.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawConfigPanel
              busy={configEditor.busy}
              error={configEditor.error}
              loading={configEditor.loading}
              messages={messages}
              onChange={configEditor.onChange}
              onChangeRemoteAuthorization={configEditor.onChangeRemoteAuthorization}
              onOpenPreview={onOpenPreview}
              onOpenRemoteGuide={onOpenRemoteGuide}
              onReload={configEditor.onReload}
              onRevealInFileManager={onRevealInFileManager}
              onSubmit={configEditor.onSubmit}
              remoteAuthorization={configEditor.remoteAuthorization}
              remoteGuard={remoteGuard}
              result={configEditor.result}
              showTitle={false}
              state={configEditor.state}
              values={configEditor.values}
            />
          </EnvironmentSectionCard>
        ) : null}
        {updateFlow?.enabled ? (
          <EnvironmentSectionCard
            alertDot={Boolean(String(updateFlow.state?.targetVersion || "").trim())}
            alertTestId="environment-section-alert-openclaw-update"
            label={messages.inspector.openClawUpdate.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawUpdatePanel
              busy={updateFlow.busy}
              error={updateFlow.error}
              loading={updateFlow.loading}
              locale={locale}
              messages={messages}
              onOpenRemoteGuide={onOpenRemoteGuide}
              onOpenTroubleshooting={updateFlow.onOpenTroubleshooting}
              onReload={updateFlow.onReload}
              onRunUpdate={updateFlow.onRunUpdate}
              remoteGuard={remoteGuard}
              result={updateFlow.result}
              showTitle={false}
              state={updateFlow.state}
            />
          </EnvironmentSectionCard>
        ) : null}
        {management?.enabled ? (
          <EnvironmentSectionCard
            label={messages.inspector.openClawManagement.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawManagementPanel
              actionIntent={management.actionIntent}
              busyActionKey={management.busyActionKey}
              messages={messages}
              onOpenRemoteGuide={onOpenRemoteGuide}
              onRefresh={management.onRefresh}
              onRequestAction={management.onRequestAction}
              remoteGuard={remoteGuard}
              refreshing={management.refreshing}
              result={management.result}
              showTitle={false}
            />
          </EnvironmentSectionCard>
        ) : null}
        {history?.enabled ? (
          <EnvironmentSectionCard
            count={Array.isArray(history.entries) ? history.entries.length : 0}
            label={messages.inspector.remoteOperations.historyTitle}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawOperationHistoryPanel
              entries={history.entries}
              error={history.error}
              loading={history.loading}
              messages={messages}
              onOpenGuide={onOpenRemoteGuide}
              onRequestRollback={history.onRequestRollback}
              onReload={history.onReload}
              rollbackBusy={history.rollbackBusy}
              remoteGuard={remoteGuard}
              showTitle={false}
            />
          </EnvironmentSectionCard>
        ) : null}
        <EnvironmentDiagnosticsSections
          groupedEnvironmentItems={groupedEnvironmentItems}
          messages={messages}
          onOpenPreview={onOpenPreview}
          onRevealInFileManager={onRevealInFileManager}
          openClawDiagnostics={openClawDiagnostics}
        />
      </div>
    </ScrollArea>
  );
}

export function InspectorPanel({
  activeTab,
  agents,
  artifacts,
  compact = false,
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  files,
  onSelectArtifact,
  onRefreshEnvironment,
  onTrackSessionFiles,
  onSyncCurrentSessionModel,
  onWorkspaceFilesOpenChange,
  peeks,
  renderPeek,
  resolvedTheme = "light",
  runtimeFallbackReason = "",
  runtimeReconnectAttempts = 0,
  runtimeSocketStatus = "disconnected",
  runtimeTransport = "polling",
  setActiveTab,
  snapshots,
  taskTimeline,
  workspaceFilesOpen = true,
}) {
  void agents;
  void renderPeek;
  void snapshots;
  const { locale, messages } = useI18n();
  const { filePreview, imagePreview, handleOpenPreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const [showTabLabels, setShowTabLabels] = useState(true);
  const [tooltipTabKey, setTooltipTabKey] = useState("");
  const [compactSheetOpen, setCompactSheetOpen] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const resolvedActiveTab = inspectorTabKeys.includes(activeTab) ? activeTab : "files";
  const workspaceFiles = peeks?.workspace?.entries || [];
  const workspaceCount = Number(peeks?.workspace?.totalCount);
  const workspaceLoaded = Array.isArray(peeks?.workspace?.entries);
  const previewFiles = [...files, ...workspaceFiles].filter((item, index, collection) => {
    const itemKey = item?.fullPath || item?.path;
    if (!itemKey || item?.kind === "目录") {
      return false;
    }
    return collection.findIndex((candidate) => (candidate?.fullPath || candidate?.path) === itemKey) === index;
  });
  const runtimeEnvironmentItems = [
    {
      label: messages.inspector.environment.runtimeTransport,
      value: messages.sessionOverview.runtimeTransport?.[runtimeTransport] || runtimeTransport,
    },
    {
      label: messages.inspector.environment.runtimeSocket,
      value: messages.sessionOverview.runtimeSocket?.[runtimeSocketStatus] || runtimeSocketStatus,
    },
    ...(runtimeReconnectAttempts > 0
      ? [{
          label: messages.inspector.environment.runtimeReconnectAttempts,
          value: String(runtimeReconnectAttempts),
        }]
      : []),
    ...(runtimeFallbackReason
      ? [{
          label: messages.inspector.environment.runtimeFallbackReason,
          value: runtimeFallbackReason,
        }]
      : []),
  ];
  const handleRevealInFileManager = useCallback(async (item) => {
    const targetPath = resolveItemPath(item);
    if (!targetPath) {
      return;
    }

    const response = await apiFetch("/api/file-manager/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || messages.inspector.previewErrors.revealInFileManagerFailed);
    }
  }, [messages.inspector.previewErrors.revealInFileManagerFailed]);
  const environmentSection = {
    summary: peeks?.environment?.summary || messages.inspector.empty.environment,
    items: [...runtimeEnvironmentItems, ...(peeks?.environment?.items || [])],
  };
  const hasOpenClawDiagnostics = environmentSection.items.some((item) => isOpenClawDiagnosticItem(item));
  const {
    openClawActionBusyKey,
    openClawActionIntent,
    openClawActionResult,
    handleLoadLalaClawUpdate,
    handleRunLalaClawUpdate,
    lalaclawUpdateBusy,
    lalaclawUpdateError,
    lalaclawUpdateLoading,
    lalaclawUpdateState,
    openClawConfigBusy,
    openClawConfigError,
    openClawConfigLoading,
    openClawConfigRemoteAuthorization,
    openClawConfigResult,
    openClawConfigState,
    openClawConfigValues,
    openClawEnvironmentRefreshing,
    openClawHistoryEntries,
    openClawHistoryError,
    openClawHistoryLoading,
    openClawOnboardingBusy,
    openClawOnboardingError,
    openClawOnboardingLoading,
    openClawOnboardingRefreshResult,
    openClawOnboardingResult,
    openClawOnboardingState,
    openClawOnboardingValues,
    openClawRemoteGuideOpen,
    openClawRollbackAuthorization,
    openClawRollbackIntent,
    openClawUpdateBusy,
    openClawUpdateError,
    openClawUpdateHelpEntry,
    openClawUpdateLoading,
    openClawUpdateResult,
    openClawUpdateState,
    setOpenClawActionIntent,
    setOpenClawRemoteGuideOpen,
    setOpenClawRollbackAuthorization,
    setOpenClawRollbackIntent,
    setOpenClawUpdateHelpEntry,
    handleChangeOpenClawConfigRemoteAuthorization,
    handleChangeOpenClawConfigValue,
    handleChangeOpenClawOnboardingValue,
    handleChangeOpenClawRollbackAuthorization,
    handleLoadOpenClawConfig,
    handleLoadOpenClawHistory,
    handleLoadOpenClawOnboarding,
    handleLoadOpenClawUpdate,
    handleRefreshEnvironment,
    handleRequestOpenClawAction,
    handleRunOpenClawAction,
    handleSubmitOpenClawOnboarding,
    handleRunOpenClawUpdate,
    handleSubmitOpenClawConfig,
    handleSubmitOpenClawRollback,
  } = useOpenClawInspector({
    activeTab,
    currentAgentId,
    environmentItems: environmentSection.items,
    hasOpenClawDiagnostics,
    messages,
    onRefreshEnvironment,
    onSyncCurrentSessionModel,
  });
  const tabDefinitions = [
    { key: "files", icon: FolderOpen, label: messages.inspector.tabs.files, count: files.length },
    { key: "artifacts", icon: FileText, label: messages.inspector.tabs.artifacts },
    { key: "timeline", icon: Hammer, label: messages.inspector.tabs.timeline },
    {
      key: "environment",
      icon: Monitor,
      label: messages.inspector.tabs.environment,
      alertDot: Boolean(lalaclawUpdateState?.updateAvailable || String(openClawUpdateState?.targetVersion || "").trim()),
    },
  ];

  useEffect(() => {
    if (activeTab && !inspectorTabKeys.includes(activeTab)) {
      setActiveTab("files");
    }
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    const node = tabsListRef.current;
    if (!node || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const updateLayout = (width) => {
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }
      setShowTabLabels(width >= 430);
    };

    updateLayout(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateLayout(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showTabLabels && tooltipTabKey) {
      setTooltipTabKey("");
    }
  }, [showTabLabels, tooltipTabKey]);

  useEffect(() => {
    if (!compact && compactSheetOpen) {
      setCompactSheetOpen(false);
    }
  }, [compact, compactSheetOpen]);

  useEffect(() => {
    if ((filePreview || imagePreview) && compactSheetOpen) {
      setCompactSheetOpen(false);
    }
  }, [compactSheetOpen, filePreview, imagePreview]);

  useEffect(() => {
    if (!compactSheetOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setCompactSheetOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [compactSheetOpen]);

  const filesTabContent = (
    <FilesTab
      active={resolvedActiveTab === "files"}
      currentAgentId={currentAgentId}
      currentSessionUser={currentSessionUser}
      items={files}
      messages={messages}
      onOpenEdit={(item) => handleOpenPreview(item, { startInEditMode: true })}
      onOpenPreview={handleOpenPreview}
      onTrackSessionFiles={onTrackSessionFiles}
      onWorkspaceFilesOpenChange={onWorkspaceFilesOpenChange}
      currentWorkspaceRoot={currentWorkspaceRoot}
      workspaceFilesOpen={workspaceFilesOpen}
      workspaceCount={workspaceCount}
      workspaceItems={workspaceFiles}
      workspaceLoaded={workspaceLoaded}
    />
  );
  const artifactsTabContent = (
    <DataList
      items={artifacts}
      hint={messages.inspector.artifactsHint}
      empty={messages.inspector.empty.artifacts}
      getItemActionLabel={(item) => `${messages.inspector.artifactJumpTo} ${localizeArtifactTitle(item.title || messages.inspector.tabs.artifacts, messages)}`}
      onSelect={onSelectArtifact}
      headerAction={
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setContextPreviewOpen(true)}
        >
          <ScrollText className="h-3.5 w-3.5" />
          {messages.inspector.contextPreview.button}
        </Button>
      }
      render={(item) => (
        <>
          <div className="text-sm font-medium">{localizeArtifactTitle(item.title, messages)}</div>
          <div className="text-xs text-muted-foreground">{stripMarkdownForDisplay(item.detail)}</div>
        </>
      )}
    />
  );
  const timelineTabContent = (
    <TimelineTab
      items={taskTimeline}
      messages={messages}
      onOpenPreview={handleOpenPreview}
      resolvedTheme={resolvedTheme === "dark" ? "dark" : "light"}
      currentWorkspaceRoot={currentWorkspaceRoot}
      getItemKey={getInspectorItemKey}
      FileLinkComponent={FileLink}
    />
  );
  const environmentTabContent = (
    <EnvironmentTab
      lalaclawFlow={{
        enabled: true,
        busy: lalaclawUpdateBusy || Boolean(lalaclawUpdateState?.job?.active),
        defaultOpen: Boolean(lalaclawUpdateState?.updateAvailable),
        error: lalaclawUpdateError,
        forceOpen: resolvedActiveTab === "environment" && Boolean(lalaclawUpdateState?.updateAvailable),
        loading: lalaclawUpdateLoading,
        onReload: handleLoadLalaClawUpdate,
        onRunUpdate: handleRunLalaClawUpdate,
        state: lalaclawUpdateState,
      }}
      updateFlow={{
        enabled: true,
        busy: openClawUpdateBusy,
        error: openClawUpdateError,
        loading: openClawUpdateLoading,
        onOpenTroubleshooting: setOpenClawUpdateHelpEntry,
        onReload: handleLoadOpenClawUpdate,
        onRunUpdate: handleRunOpenClawUpdate,
        result: openClawUpdateResult,
        state: openClawUpdateState,
      }}
      onboarding={{
        enabled: Boolean(openClawOnboardingResult) || (Boolean(openClawOnboardingState?.installed) && !openClawOnboardingState?.ready),
        busy: openClawOnboardingBusy,
        defaultOpen: Boolean(openClawOnboardingState?.needsOnboarding),
        error: openClawOnboardingError,
        forceOpen: resolvedActiveTab === "environment" && Boolean(openClawOnboardingState?.needsOnboarding),
        loading: openClawOnboardingLoading,
        onChange: handleChangeOpenClawOnboardingValue,
        onRefreshCapabilities: () => handleLoadOpenClawOnboarding({ refreshCapabilities: true }),
        onReload: handleLoadOpenClawOnboarding,
        onSubmit: handleSubmitOpenClawOnboarding,
        refreshResult: openClawOnboardingRefreshResult,
        result: openClawOnboardingResult,
        state: openClawOnboardingState,
        values: openClawOnboardingValues,
      }}
      history={{
        enabled: true,
        entries: openClawHistoryEntries,
        error: openClawHistoryError,
        loading: openClawHistoryLoading,
        onRequestRollback: (entry) => {
          setOpenClawRollbackIntent(entry || null);
          setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
        },
        onReload: handleLoadOpenClawHistory,
        rollbackBusy: openClawConfigBusy,
      }}
      configEditor={{
        enabled: hasOpenClawDiagnostics && !openClawOnboardingState?.needsOnboarding,
        busy: openClawConfigBusy,
        error: openClawConfigError,
        loading: openClawConfigLoading,
        onChange: handleChangeOpenClawConfigValue,
        onChangeRemoteAuthorization: handleChangeOpenClawConfigRemoteAuthorization,
        onReload: handleLoadOpenClawConfig,
        onSubmit: handleSubmitOpenClawConfig,
        remoteAuthorization: openClawConfigRemoteAuthorization,
        result: openClawConfigResult,
        state: openClawConfigState,
        values: openClawConfigValues,
      }}
      items={environmentSection.items}
      locale={locale}
      management={{
        enabled: hasOpenClawDiagnostics,
        actionIntent: openClawActionIntent,
        busyActionKey: openClawActionBusyKey,
        onRefresh: handleRefreshEnvironment,
        onRequestAction: handleRequestOpenClawAction,
        refreshing: openClawEnvironmentRefreshing,
        result: openClawActionResult,
      }}
      messages={messages}
      onOpenPreview={handleOpenPreview}
      onOpenRemoteGuide={() => setOpenClawRemoteGuideOpen(true)}
      onRevealInFileManager={handleRevealInFileManager}
    />
  );
  const tabContentByKey = {
    files: filesTabContent,
    artifacts: artifactsTabContent,
    timeline: timelineTabContent,
    environment: environmentTabContent,
  };
  const activeCompactTab = tabDefinitions.find((tab) => tab.key === resolvedActiveTab) || tabDefinitions[0] || {
    key: "files",
    icon: FolderOpen,
    label: messages.inspector.tabs.files,
  };

  if (compact) {
    return (
      <>
        <div className="flex h-full min-h-0 min-w-0 flex-col items-center gap-2 rounded-[18px] border border-border/70 bg-card/80 px-1.5 py-2 backdrop-blur">
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            const isActive = compactSheetOpen && resolvedActiveTab === tab.key;
            return (
              <Tooltip key={tab.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={tab.label}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setCompactSheetOpen(true);
                    }}
                    className={cn(
                      "relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      isActive
                        ? resolvedTheme === "dark"
                          ? "border-[#0f3e6a] bg-[#0f3e6a] text-white"
                          : "border-[#1677eb] bg-[#1677eb] text-white"
                        : "border-transparent bg-background/75 text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0 stroke-[1.9]" />
                    {tab.alertDot ? (
                      <span
                        data-testid={`inspector-tab-alert-${tab.key}`}
                        aria-hidden="true"
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
                      />
                    ) : null}
                    {tab.count ? (
                      <span
                        className={cn(
                          "absolute -right-1 -top-1 min-w-[1.15rem] rounded-full px-1 py-[1px] text-center text-[10px] font-semibold leading-none",
                          isActive ? "bg-white/22 text-white" : "bg-muted text-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{tab.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {compactSheetOpen ? (
          <>
            <button
              type="button"
              aria-label={messages.inspector.compact.closeSheet}
              className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]"
              onClick={() => setCompactSheetOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 z-[41] w-[min(28rem,calc(100vw-5.5rem))] min-w-[18rem] max-w-[30rem] pl-3">
              <Card
                role="dialog"
                aria-modal="true"
                aria-label={`${messages.inspector.title} - ${activeCompactTab.label}`}
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-none rounded-l-[1.5rem] border-y-0 border-r-0 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
              >
                <CardHeader className="flex min-h-12 flex-row items-start justify-between gap-3 border-b border-border/70 bg-card/92 px-4 py-3 text-left backdrop-blur">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm leading-[1.15]">{activeCompactTab.label}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2 text-[11px] leading-[1.35rem]">
                      {messages.inspector.subtitle}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={messages.inspector.compact.closeSheet}
                    className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => setCompactSheetOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
                  {tabContentByKey[resolvedActiveTab]}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
        {filePreview ? (
          <Suspense fallback={null}>
            <LazyFilePreviewOverlay
              currentAgentId={currentAgentId}
              currentSessionUser={currentSessionUser}
              currentWorkspaceRoot={currentWorkspaceRoot}
              files={previewFiles}
              preview={filePreview}
              resolvedTheme={resolvedTheme}
              sessionFiles={files}
              onClose={closeFilePreview}
              onOpenFilePreview={handleOpenPreview}
              workspaceCount={workspaceCount}
              workspaceFiles={workspaceFiles}
              workspaceLoaded={workspaceLoaded}
            />
          </Suspense>
        ) : null}
        {imagePreview ? (
          <Suspense fallback={null}>
            <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
          </Suspense>
        ) : null}
        {contextPreviewOpen ? (
          <Suspense fallback={null}>
            <LazyContextPreviewDialog open={contextPreviewOpen} onClose={() => setContextPreviewOpen(false)} sessionUser={currentSessionUser} />
          </Suspense>
        ) : null}
        <OpenClawUpdateTroubleshootingDialog
          entry={openClawUpdateHelpEntry}
          messages={messages}
          onClose={() => setOpenClawUpdateHelpEntry(null)}
        />
        <OpenClawRemoteRecoveryDialog
          locale={locale}
          messages={messages}
          onClose={() => setOpenClawRemoteGuideOpen(false)}
          open={openClawRemoteGuideOpen}
        />
        <OpenClawRollbackConfirmDialog
          authorization={openClawRollbackAuthorization}
          busy={openClawConfigBusy}
          entry={openClawRollbackIntent}
          messages={messages}
          onCancel={() => {
            setOpenClawRollbackIntent(null);
            setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
          }}
          onChange={handleChangeOpenClawRollbackAuthorization}
          onConfirm={() => {
            void handleSubmitOpenClawRollback();
          }}
        />
        <OpenClawManagementConfirmDialog
          action={openClawActionIntent}
          busy={Boolean(openClawActionBusyKey)}
          messages={messages}
          onCancel={() => setOpenClawActionIntent(null)}
          onConfirm={() => {
            if (!openClawActionIntent?.key) {
              return;
            }
            void handleRunOpenClawAction(openClawActionIntent.key);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="cc-inspector-shell flex h-full min-h-0 min-w-0 flex-col rounded-[24px] bg-transparent">
        <div className="px-1 pb-3 text-left">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-[1.15] text-foreground/90">{messages.inspector.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-5 text-muted-foreground/90">{messages.inspector.subtitle}</CardDescription>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabsList
              ref={tabsListRef}
              className="cc-inspector-tabs grid h-auto w-full shrink-0 grid-cols-2 gap-1 rounded-[18px] border border-border/70 bg-[var(--panel-muted)] p-1 md:grid-cols-4"
            >
              {tabDefinitions.map((tab) => {
                const Icon = tab.icon;
                const isActive = resolvedActiveTab === tab.key;
                const showCountBadge = Boolean(tab.count) && (showTabLabels || tab.key === "files");
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    aria-label={tab.label}
                    onPointerEnter={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onPointerLeave={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    onFocus={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onBlur={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    className={cn(
                      "group/tab relative text-[13px] data-[state=active]:text-white data-[state=active]:shadow-sm",
                      showTabLabels ? "px-3" : "px-2",
                      isActive ? "text-white shadow-sm" : "",
                      resolvedTheme === "dark"
                        ? cn(
                            "data-[state=active]:bg-[#0f3e6a] data-[state=active]:hover:bg-[#0f3e6a]",
                            isActive ? "bg-[#0f3e6a] hover:bg-[#0f3e6a]" : "",
                          )
                        : cn(
                            "data-[state=active]:bg-[#1677eb] data-[state=active]:hover:bg-[#0f6fe0]",
                            isActive ? "bg-[#1677eb] hover:bg-[#0f6fe0]" : "",
                          ),
                    )}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                      <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.9]" />
                    </span>
                    {tab.alertDot ? (
                      <span
                        data-testid={`inspector-tab-alert-${tab.key}`}
                        aria-hidden="true"
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
                      />
                    ) : null}
                    {showTabLabels ? <span className="truncate">{tab.label}</span> : null}
                    {showCountBadge ? <TabCountBadge count={tab.count} active={resolvedActiveTab === tab.key} /> : null}
                    {!showTabLabels && tooltipTabKey === tab.key ? (
                      <span
                        aria-hidden="true"
                        data-testid={`inspector-tab-tooltip-${tab.key}`}
                        className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background shadow-md"
                      >
                        {tab.label}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent
              value="files"
              className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-border/60 bg-[var(--surface)] px-3 py-3 data-[state=active]:flex data-[state=active]:flex-col"
            >
              {filesTabContent}
            </TabsContent>

            <TabsContent
              value="artifacts"
              className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-border/60 bg-[var(--surface)] px-3 py-3 data-[state=active]:flex data-[state=active]:flex-col"
            >
              {artifactsTabContent}
            </TabsContent>

            <TabsContent
              value="timeline"
              className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-border/60 bg-[var(--surface)] px-3 py-3 data-[state=active]:flex data-[state=active]:flex-col"
            >
              {timelineTabContent}
            </TabsContent>

            <TabsContent
              value="environment"
              className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-border/60 bg-[var(--surface)] px-3 py-3 data-[state=active]:flex data-[state=active]:flex-col"
            >
              {environmentTabContent}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {filePreview ? (
        <Suspense fallback={null}>
          <LazyFilePreviewOverlay
            currentAgentId={currentAgentId}
            currentSessionUser={currentSessionUser}
            currentWorkspaceRoot={currentWorkspaceRoot}
            files={previewFiles}
            preview={filePreview}
            resolvedTheme={resolvedTheme}
            sessionFiles={files}
            onClose={closeFilePreview}
            onOpenFilePreview={handleOpenPreview}
            workspaceCount={workspaceCount}
            workspaceFiles={workspaceFiles}
            workspaceLoaded={workspaceLoaded}
          />
        </Suspense>
      ) : null}
      {imagePreview ? (
        <Suspense fallback={null}>
          <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
        </Suspense>
      ) : null}
      <OpenClawUpdateTroubleshootingDialog
        entry={openClawUpdateHelpEntry}
        messages={messages}
        onClose={() => setOpenClawUpdateHelpEntry(null)}
      />
      <OpenClawRemoteRecoveryDialog
        locale={locale}
        messages={messages}
        onClose={() => setOpenClawRemoteGuideOpen(false)}
        open={openClawRemoteGuideOpen}
      />
      <OpenClawRollbackConfirmDialog
        authorization={openClawRollbackAuthorization}
        busy={openClawConfigBusy}
        entry={openClawRollbackIntent}
        messages={messages}
        onCancel={() => {
          setOpenClawRollbackIntent(null);
          setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
        }}
        onChange={handleChangeOpenClawRollbackAuthorization}
        onConfirm={() => {
          void handleSubmitOpenClawRollback();
        }}
      />
      <OpenClawManagementConfirmDialog
        action={openClawActionIntent}
        busy={Boolean(openClawActionBusyKey)}
        messages={messages}
        onCancel={() => setOpenClawActionIntent(null)}
        onConfirm={() => {
          if (!openClawActionIntent?.key) {
            return;
          }
          void handleRunOpenClawAction(openClawActionIntent.key);
        }}
      />
      {contextPreviewOpen ? (
        <Suspense fallback={null}>
          <LazyContextPreviewDialog open={contextPreviewOpen} onClose={() => setContextPreviewOpen(false)} sessionUser={currentSessionUser} />
        </Suspense>
      ) : null}
    </>
  );
}
