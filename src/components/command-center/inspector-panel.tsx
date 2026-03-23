import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, FolderOpen, Hammer, Monitor, ScrollText, SquareArrowOutUpRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  buildFileFilterMatcher,
  compareFileItemsByPath,
  countWorkspaceFiles,
  doesFileExtensionChange,
  formatDisplayPath,
  getPathExtension,
  getPathName,
  joinPathSegments,
  mergeWorkspaceNodes,
  normalizeWorkspaceNodes,
  replacePathPrefix,
  renameSessionItems,
  renameWorkspaceNodes,
  resolveItemPath,
  updateWorkspaceNode,
} from "@/components/command-center/inspector-files-panel-utils";
import {
  buildEnvironmentPathItem,
  buildOpenClawUpdateTroubleshootingEntries,
  buildUserSessionItemsFromPaths,
  compactHomePath,
  collectEnvironmentGroups,
  collectOpenClawDiagnostics,
  findWorkspaceNodeByPath,
  formatOperationTimestamp,
  getInspectorItemKey,
  getOpenClawCapabilityDetectionText,
  getOpenClawConfigFieldMeta,
  getOpenClawConfigFieldValueLabel,
  getOpenClawConfigFormState,
  getOpenClawConfigOutcome,
  getOpenClawConfigOutcomeBadgeProps,
  getOpenClawDiagnosticBadgeProps,
  getOpenClawManagementActions,
  getOpenClawManagementOutcome,
  getOpenClawManagementOutcomeBadgeProps,
  getOpenClawOnboardingFormState,
  getLalaClawUpdateBadgeVariant,
  getOpenClawOnboardingAuthOptions,
  getOpenClawOnboardingDaemonRuntimeOptions,
  getOpenClawOnboardingFlowOptions,
  getOpenClawOnboardingGatewayAuthOptions,
  getOpenClawOnboardingGatewayTokenModeOptions,
  getOpenClawOnboardingOptionLabels,
  getOpenClawOnboardingSecretModeOptions,
  getOpenClawUpdateOutcome,
  getOpenClawUpdateOutcomeBadgeProps,
  isOpenClawDiagnosticItem,
  isAbsoluteFileSystemPath,
  isLalaClawEnvironmentItem,
  localizeArtifactTitle,
  localizeEnvironmentItemLabel,
  localizeEnvironmentItemValue,
  localizeOpenClawDiagnosticLabel,
  localizeOpenClawDiagnosticValue,
  OFFICIAL_OPENCLAW_DOC_URLS,
  mergeSessionFileItems,
  shouldRenderEnvironmentPathLink,
  shouldRenderOpenClawDiagnosticBadge,
} from "@/components/command-center/inspector-panel-utils";
import {
  DataList,
  EnvironmentSectionCard,
  HoverCopyValueButton,
  InspectorHint,
  OpenClawOnboardingSelectField,
  OpenClawRemoteNotice,
  PanelEmpty,
  TabCountBadge,
} from "@/components/command-center/inspector-panel-primitives";
import { TimelineTab } from "@/components/command-center/inspector-panel-timeline";
import {
  FileLink,
} from "@/components/command-center/inspector-panel-files";
import { FileContextMenu } from "@/components/command-center/inspector-panel-file-menu";
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
  SwitchSurface as Switch,
  TabsContentSurface as TabsContent,
  TabsListSurface as TabsList,
  TabsSurface as Tabs,
  TabsTriggerSurface as TabsTrigger,
  TooltipContentSurface as TooltipContent,
  TooltipSurface as Tooltip,
  TooltipTriggerSurface as TooltipTrigger,
} from "@/components/command-center/inspector-panel-surfaces";
import {
  buildClipboardPasteRequestEntries,
  createClipboardUploadEntriesFromFiles,
  readClipboardFileEntries,
} from "@/components/command-center/clipboard-utils";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { buildOpenClawConfigFormValues, buildOpenClawRemoteGuard, useOpenClawInspector } from "@/features/app/controllers/use-openclaw-inspector";
import { apiFetch } from "@/lib/api-client";
import { cn, stripMarkdownForDisplay } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

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
type InspectorRemoteGuard = InspectorRecord | null;
type InspectorPanelItem = InspectorRecord;
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorPreviewHandler = (item: any, options?: any) => void;
type InspectorRevealHandler = (item: any) => Promise<void>;
type InspectorFormValues = Record<string, unknown>;
type InspectorRewrite = {
  previousPath: string;
  nextPath: string;
};
type InspectorRenameState = {
  source: string;
  item: any;
  value: string;
  submitting: boolean;
  error: string;
} | null;
type InspectorRenameExtensionState = {
  fromExtension: string;
  toExtension: string;
} | null;
type InspectorPasteFeedback = {
  kind: "success" | "error";
  text: string;
} | null;
type LalaClawFlowState = InspectorRecord | null;
type OpenClawUpdateHelpEntry = InspectorRecord | null;
type InspectorAuthorizationState = Record<string, any> | null;
type InspectorRollbackIntent = Record<string, any> | null;
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

function RenameDialog({
  confirmLabel,
  description,
  error,
  inputLabel,
  messages,
  onCancel,
  onChange,
  onConfirm,
  placeholder,
  submitting = false,
  title,
  value,
}: {
  confirmLabel: string;
  description: string;
  error?: string;
  inputLabel: string;
  messages: InspectorMessages;
  onCancel: () => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
  placeholder?: string;
  submitting?: boolean;
  title: string;
  value: string;
}) {
  return (
    <div className="fixed inset-0 z-[41] flex items-center justify-center bg-background/55 px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-[24px] border border-border/70 bg-card shadow-2xl">
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{inputLabel}</span>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onConfirm();
                }
              }}
              placeholder={placeholder}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          {error ? <p className="text-sm leading-6 text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              {messages.inspector.workspaceTree.renameCancel}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={submitting || !String(value || "").trim()}>
              {submitting ? messages.inspector.workspaceTree.renameConfirming : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenameExtensionConfirmDialog({
  description,
  messages,
  onCancel,
  onConfirm,
  submitting = false,
  title,
}: {
  description: string;
  messages: InspectorMessages;
  onCancel: () => void;
  onConfirm: () => void;
  submitting?: boolean;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[42] flex items-center justify-center bg-background/55 px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-[24px] border border-border/70 bg-card shadow-2xl">
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              {messages.inspector.workspaceTree.renameCancel}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={submitting}>
              {messages.inspector.workspaceTree.renameExtensionChangeConfirm}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function requestWorkspaceTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  errorMessage = "",
  filter = "",
  targetPath = "",
}) {
  const params = new URLSearchParams();
  if (currentSessionUser) {
    params.set("sessionUser", currentSessionUser);
  }
  if (currentAgentId) {
    params.set("agentId", currentAgentId);
  }
  if (targetPath) {
    params.set("path", targetPath);
  }
  if (filter && !targetPath) {
    params.set("filter", filter);
  }

  const response = await apiFetch(`/api/workspace-tree?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || errorMessage);
  }
  return normalizeWorkspaceNodes(payload.items || [], currentWorkspaceRoot);
}

const OPENCLAW_MANAGED_AUTH_CHOICES = new Set([
  "github-copilot",
  "google-gemini-cli",
]);

export function LalaClawPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  metadataItems = [],
  onReload,
  onRunUpdate,
  showTitle = true,
  state = null,
}: {
  busy?: boolean;
  error?: string;
  loading?: boolean;
  messages: InspectorMessages;
  metadataItems?: InspectorPanelItem[];
  onReload?: InspectorFlowHandler;
  onRunUpdate?: InspectorFlowHandler;
  showTitle?: boolean;
  state?: LalaClawFlowState;
}) {
  const metadata = metadataItems.filter((item) => item?.value);
  const badgeVariant = getLalaClawUpdateBadgeVariant(state);
  const installedVersion = state?.currentRelease?.version || state?.currentVersion || "";
  const workspaceVersion = String(state?.workspaceVersion || "").trim();
  const shouldPreferWorkspaceVersion = Boolean(
    workspaceVersion
    && installedVersion
    && workspaceVersion !== installedVersion
  );
  const currentVersion = shouldPreferWorkspaceVersion
    ? workspaceVersion
    : (installedVersion || messages.inspector.lalaclawUpdate.emptyValue);
  const targetVersion = state?.targetRelease?.version || "";
  const currentStable = !shouldPreferWorkspaceVersion && Boolean(state?.currentRelease?.stable);
  const targetStable = Boolean(state?.targetRelease?.stable);
  const updateAvailable = Boolean(state?.updateAvailable);
  const jobActive = Boolean(state?.job?.active);
  const capabilitySupported = state?.capability?.updateSupported !== false;
  const panelError = error || (state?.job?.status === "failed" ? state?.job?.error : "") || (!state?.check?.ok ? state?.check?.error : "");
  const shouldShowRunAction = Boolean(updateAvailable) && capabilitySupported && !jobActive;
  const statusLabel = jobActive
    ? messages.inspector.lalaclawUpdate.statuses.updating
    : updateAvailable
      ? messages.inspector.lalaclawUpdate.statuses.updateAvailable
      : messages.inspector.lalaclawUpdate.statuses.upToDate;

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.lalaclawUpdate.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.lalaclawUpdate.description}
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {shouldPreferWorkspaceVersion
                    ? messages.inspector.lalaclawUpdate.labels.workspaceVersion
                    : messages.inspector.lalaclawUpdate.labels.currentVersion}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <span>{currentVersion}</span>
                  {currentStable ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[10px] leading-5">
                      {messages.inspector.lalaclawUpdate.stableBadge}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {updateAvailable ? (
                <div className="flex flex-wrap items-center justify-end gap-2 text-[12px] leading-5">
                  <span className="font-medium text-foreground">
                    {statusLabel}
                  </span>
                  {shouldShowRunAction ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={loading || busy}
                      className="cc-send-button h-7 rounded-full px-2.5 text-[12px] shadow-none"
                      onClick={() => onRunUpdate?.()}
                    >
                      {busy ? messages.inspector.lalaclawUpdate.running : messages.inspector.lalaclawUpdate.runUpdate}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Badge variant={badgeVariant} className="px-2 py-0.5 text-[11px] leading-5">
                  {statusLabel}
                </Badge>
              )}
            </div>
            {targetVersion ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.lalaclawUpdate.labels.targetVersion}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-medium text-foreground">
                  <span>{targetVersion}</span>
                  {targetStable ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[10px] leading-5">
                      {messages.inspector.lalaclawUpdate.stableBadge}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
            {metadata.length ? (
              <div className="mt-3 grid gap-2 text-[12px] leading-5 text-foreground">
                {metadata.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="grid gap-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {localizeEnvironmentItemLabel(item.label, messages)}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {localizeEnvironmentItemValue(item.value, messages)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {state?.capability?.reason ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.lalaclawUpdate.errors[state.capability.reason] || messages.inspector.lalaclawUpdate.errors.requestFailed}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading || busy}
              aria-label={messages.inspector.lalaclawUpdate.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.lalaclawUpdate.reloading : messages.inspector.lalaclawUpdate.reload}
            </Button>
          </div>
          {panelError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {panelError}
            </div>
          ) : null}
          {state?.job?.status === "failed" && state?.job?.commandResult?.stderr ? (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {messages.inspector.lalaclawUpdate.labels.stderr}
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{state.job.commandResult.stderr}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawManagementPanel({
  actionIntent,
  busyActionKey = "",
  messages,
  onOpenRemoteGuide,
  onRefresh,
  onRequestAction,
  refreshing = false,
  remoteGuard = null,
  result = null,
  showTitle = true,
}: {
  actionIntent?: InspectorRecord | null;
  busyActionKey?: string;
  messages: InspectorMessages;
  onOpenRemoteGuide?: () => void;
  onRefresh?: InspectorFlowHandler;
  onRequestAction?: (action: any) => void;
  refreshing?: boolean;
  remoteGuard?: InspectorRemoteGuard;
  result?: InspectorRecord | null;
  showTitle?: boolean;
}) {
  const actions = getOpenClawManagementActions(messages);
  const outcome = getOpenClawManagementOutcome(result || undefined);
  const outcomeBadge = getOpenClawManagementOutcomeBadgeProps(outcome);
  const activeActionLabel = actions.find((action) => action.key === busyActionKey)?.label || "";

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawManagement.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawManagement.description}
          </div>
          <OpenClawRemoteNotice messages={messages} onOpenGuide={onOpenRemoteGuide} remoteGuard={remoteGuard} />
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const pending = busyActionKey === action.key;
              return (
                <Button
                  key={action.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(busyActionKey) || remoteGuard?.blocked}
                  aria-label={action.label}
                  className="h-8 rounded-full px-3"
                  onClick={() => onRequestAction?.(action)}
                >
                  {pending ? messages.inspector.openClawManagement.running(activeActionLabel || action.label) : action.label}
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={Boolean(busyActionKey) || refreshing}
              aria-label={messages.inspector.openClawManagement.refresh}
              className="h-8 rounded-full px-3"
              onClick={() => onRefresh?.()}
            >
              {refreshing ? messages.inspector.openClawManagement.refreshing : messages.inspector.openClawManagement.refresh}
            </Button>
          </div>
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawManagement.resultTitle}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {messages.inspector.openClawManagement.actions?.[result.action] || result.action}
                  </div>
                </div>
                <Badge variant={outcomeBadge.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${outcomeBadge.className}`}>
                  {messages.inspector.openClawManagement.outcomes[outcome]}
                </Badge>
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-foreground">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawManagement.labels.command}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.command?.display || ""}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawManagement.labels.health}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">
                    {messages.inspector.openClawManagement.healthStatuses?.[result.healthCheck?.status] || result.healthCheck?.status || messages.inspector.openClawManagement.healthStatuses.unknown}
                    {result.healthCheck?.url ? ` · ${result.healthCheck.url}` : ""}
                  </div>
                </div>
                {Array.isArray(result.guidance) && result.guidance.length ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawManagement.labels.guidance}
                    </div>
                    <div className="space-y-1 text-[12px] leading-5 text-foreground">
                      {result.guidance.map((item, index) => (
                        <div key={`${item}-${index}`}>• {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {result.commandResult?.stdout ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawManagement.labels.stdout}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                  </div>
                ) : null}
                {result.commandResult?.stderr ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawManagement.labels.stderr}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                  </div>
                ) : null}
                {!result.ok && result.error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
                    {result.error}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {actionIntent ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.openClawManagement.pendingConfirmation(messages.inspector.openClawManagement.actions?.[actionIntent.key] || actionIntent.label)}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawConfigPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onChange,
  onOpenPreview,
  onChangeRemoteAuthorization,
  onOpenRemoteGuide,
  onRevealInFileManager,
  onReload,
  onSubmit,
  remoteAuthorization = null,
  remoteGuard = null,
  result = null,
  state = null,
  values = {},
  showTitle = true,
}: {
  busy?: boolean;
  error?: string;
  loading?: boolean;
  messages: InspectorMessages;
  onChange?: (fieldKey: any, value: any) => void;
  onOpenPreview?: InspectorPreviewHandler;
  onChangeRemoteAuthorization?: (fieldKey: any, value: any) => void;
  onOpenRemoteGuide?: () => void;
  onRevealInFileManager?: InspectorRevealHandler;
  onReload?: InspectorFlowHandler;
  onSubmit?: (withRestart?: boolean) => void;
  remoteAuthorization?: InspectorAuthorizationState;
  remoteGuard?: InspectorRemoteGuard;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
  values?: InspectorFormValues;
  showTitle?: boolean;
}) {
  const fieldMeta = getOpenClawConfigFieldMeta(messages, state);
  const outcome = getOpenClawConfigOutcome(result || undefined);
  const outcomeBadge = getOpenClawConfigOutcomeBadgeProps(outcome);
  const initialValues = buildOpenClawConfigFormValues(state);
  const configFormState = getOpenClawConfigFormState(values, state, remoteAuthorization);
  const modelOptions = configFormState.modelOptions;
  const normalizedValues = configFormState.values;
  const hasPendingChanges = fieldMeta.some((field) => {
    const nextValue = normalizedValues?.[field.key];
    const initialValue = initialValues?.[field.key];
    return nextValue !== initialValue;
  });
  const remoteConfigFlow = Boolean(remoteGuard?.blocked);
  const remoteAuthorized = configFormState.remoteAuthorized;

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawConfig.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawConfig.description}
          </div>
          <OpenClawRemoteNotice messages={messages} onOpenGuide={onOpenRemoteGuide} remoteGuard={remoteGuard} />
          {remoteConfigFlow ? (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawConfig.remote.title}</div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawConfig.remote.description}</div>
              <label className="mt-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border border-border/70"
                  checked={remoteAuthorized}
                  aria-label={messages.inspector.openClawConfig.remote.confirm}
                  disabled={loading || busy}
                  onChange={(event) => onChangeRemoteAuthorization?.("confirmed", event.target.checked)}
                />
                <span className="min-w-0 text-[12px] leading-5 text-foreground">{messages.inspector.openClawConfig.remote.confirm}</span>
              </label>
              <div className="mt-3 grid gap-1.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.openClawConfig.remote.noteLabel}
                </div>
                <input
                  type="text"
                  aria-label={messages.inspector.openClawConfig.remote.noteLabel}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawConfig.remote.notePlaceholder}
                  value={configFormState.remoteNote}
                  onChange={(event) => onChangeRemoteAuthorization?.("note", event.target.value)}
                />
              </div>
              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {messages.inspector.openClawConfig.remote.restartNotice}
              </div>
            </div>
          ) : null}
          {state?.validation ? (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {messages.inspector.openClawConfig.labels.validation}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={state.validation.ok ? "success" : "default"} className="px-2 py-0.5 text-[11px] leading-5">
                  {state.validation.ok ? messages.inspector.openClawConfig.validation.valid : messages.inspector.openClawConfig.validation.invalid}
                </Badge>
                {state.configPath ? (
                  <div className="min-w-0 overflow-hidden">
                    {!state.remoteTarget && isAbsoluteFileSystemPath(state.configPath) ? (
                      <FileLink
                        item={{ path: state.configPath, fullPath: state.configPath, kind: "文件" }}
                        compact
                        currentWorkspaceRoot=""
                        label={compactHomePath(state.configPath)}
                        onOpenPreview={onOpenPreview}
                        onRevealInFileManager={(targetItem) => {
                          onRevealInFileManager?.(targetItem).catch(() => {});
                        }}
                      />
                    ) : (
                      <div className="break-all font-mono text-[12px] text-foreground">{state.configPath}</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3">
            {fieldMeta.map((field) => {
              const fieldValue = normalizedValues?.[field.key];
              return (
                <div key={field.key} className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{field.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{field.description}</div>
                    </div>
                    {field.restartRequired ? (
                      <Badge variant="secondary" className="whitespace-nowrap px-2 py-0.5 text-[10px] leading-5">
                        {messages.inspector.openClawConfig.restartBadge}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    {field.type === "boolean" ? (
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[12px] text-foreground">
                          {getOpenClawConfigFieldValueLabel(field.key, fieldValue, messages)}
                        </span>
                        <Switch
                          checked={Boolean(fieldValue)}
                          aria-label={field.label}
                          disabled={loading || busy}
                          onCheckedChange={(checked) => onChange?.(field.key, checked)}
                        />
                      </label>
                    ) : field.type === "enum" ? (
                      <div className="relative">
                        <select
                          aria-label={field.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={String(fieldValue || "")}
                          onChange={(event) => onChange?.(field.key, event.target.value)}
                        >
                          {(field.options || []).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    ) : field.key === "modelPrimary" || field.key === "agentModel" ? (
                      <div className="relative">
                        <select
                          aria-label={field.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={String(fieldValue ?? "")}
                          onChange={(event) => onChange?.(field.key, event.target.value)}
                        >
                          <option value="">{messages.inspector.openClawConfig.emptyValue}</option>
                          {modelOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        aria-label={field.label}
                        className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                        disabled={loading || busy}
                        placeholder={
                          field.key === "agentModel"
                            ? messages.inspector.openClawConfig.fields.agentModel.placeholder
                            : messages.inspector.openClawConfig.fields.modelPrimary.placeholder
                        }
                        value={String(fieldValue ?? "")}
                        onChange={(event) => onChange?.(field.key, event.target.value)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              variant="ghost"
              aria-label={messages.inspector.openClawConfig.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawConfig.reloading : messages.inspector.openClawConfig.reload}
            </Button>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {!remoteConfigFlow ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || busy || !hasPendingChanges}
                  className="h-8 rounded-full px-3"
                  onClick={() => onSubmit?.(false)}
                >
                  {busy ? messages.inspector.openClawConfig.applying : messages.inspector.openClawConfig.apply}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={loading || busy || !hasPendingChanges || (remoteConfigFlow && !remoteAuthorized)}
                className="h-8 rounded-full px-3"
                onClick={() => onSubmit?.(true)}
              >
                {busy
                  ? messages.inspector.openClawConfig.applying
                  : (remoteConfigFlow ? messages.inspector.openClawConfig.applyRemote : messages.inspector.openClawConfig.applyAndRestart)}
              </Button>
            </div>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawConfig.resultTitle}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {result.noChanges ? messages.inspector.openClawConfig.noChanges : messages.inspector.openClawConfig.appliedChanges}
                  </div>
                </div>
                <Badge variant={outcomeBadge.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${outcomeBadge.className}`}>
                  {messages.inspector.openClawConfig.outcomes[outcome]}
                </Badge>
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-foreground">
                {result.validation ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.validation}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {result.validation.ok ? messages.inspector.openClawConfig.validation.valid : messages.inspector.openClawConfig.validation.invalid}
                    </div>
                  </div>
                ) : null}
                {result.healthCheck ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.health}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {messages.inspector.openClawConfig.healthStatuses?.[result.healthCheck.status] || result.healthCheck.status}
                      {result.healthCheck?.url ? ` · ${result.healthCheck.url}` : ""}
                    </div>
                  </div>
                ) : null}
                {result.backupPath ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.backup}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <FileLink
                        item={{ path: result.backupPath, fullPath: result.backupPath, kind: "文件" }}
                        compact
                        currentWorkspaceRoot=""
                        label={compactHomePath(result.backupPath)}
                        onOpenPreview={onOpenPreview}
                        onRevealInFileManager={(targetItem) => {
                          onRevealInFileManager?.(targetItem).catch(() => {});
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {!result.backupPath && result.backupReference?.label ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.rollbackPoint}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.backupReference.label}</div>
                  </div>
                ) : null}
                {Array.isArray(result.changedFields) && result.changedFields.length ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.changedFields}
                    </div>
                    <div className="space-y-2">
                      {result.changedFields.map((field) => {
                        const meta = fieldMeta.find((item) => item.key === field.key);
                        return (
                          <div key={field.key} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="text-[12px] font-medium text-foreground">{meta?.label || field.key}</div>
                            <div className="grid gap-1 text-[11px] leading-5 text-muted-foreground">
                              <div>
                                {messages.inspector.openClawConfig.labels.before}: {getOpenClawConfigFieldValueLabel(field.key, field.before, messages)}
                              </div>
                              <div>
                                {messages.inspector.openClawConfig.labels.after}: {getOpenClawConfigFieldValueLabel(field.key, field.after, messages)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawOnboardingPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onChange,
  onRefreshCapabilities,
  onReload,
  onSubmit,
  refreshResult = null,
  result = null,
  state = null,
  values = {},
  showTitle = true,
}: {
  busy?: boolean;
  error?: string;
  loading?: boolean;
  messages: InspectorMessages;
  onChange?: (fieldKey: any, value: any) => void;
  onRefreshCapabilities?: InspectorFlowHandler;
  onReload?: InspectorFlowHandler;
  onSubmit?: InspectorFlowHandler;
  refreshResult?: InspectorRecord | null;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
  values?: InspectorFormValues;
  showTitle?: boolean;
}) {
  const onboardingFormState = getOpenClawOnboardingFormState(values, state);
  const authChoice = onboardingFormState.authChoice;
  const daemonRuntime = onboardingFormState.daemonRuntime;
  const flow = onboardingFormState.flow;
  const gatewayAuth = onboardingFormState.gatewayAuth;
  const secretInputMode = onboardingFormState.secretInputMode;
  const gatewayTokenInputMode = onboardingFormState.gatewayTokenInputMode;
  const gatewayBind = onboardingFormState.gatewayBind;
  const installDaemon = onboardingFormState.installDaemon;
  const skipHealthCheck = onboardingFormState.skipHealthCheck;
  const supportedGatewayBinds = onboardingFormState.supportedGatewayBinds;
  const normalizedValues = onboardingFormState.values;
  const authOptions = getOpenClawOnboardingAuthOptions(messages, state);
  const daemonRuntimeOptions = getOpenClawOnboardingDaemonRuntimeOptions(messages, state);
  const flowOptions = getOpenClawOnboardingFlowOptions(messages, state);
  const gatewayAuthOptions = getOpenClawOnboardingGatewayAuthOptions(messages, state);
  const gatewayTokenModeOptions = getOpenClawOnboardingGatewayTokenModeOptions(messages, state);
  const secretModeOptions = getOpenClawOnboardingSecretModeOptions(messages, state);
  const gatewayBindOptions = supportedGatewayBinds.map((value) => ({
    value,
    label: messages.inspector.openClawConfig.fields.gatewayBind.options?.[value] || value,
  }));
  const usesManagedAuth = OPENCLAW_MANAGED_AUTH_CHOICES.has(authChoice);
  const showCustomProviderFields = authChoice === "custom-api-key";
  const showProviderEndpointFields = authChoice === "custom-api-key" || authChoice === "ollama";
  const showTokenAuthFields = authChoice === "token";
  const supportsApiKey = authChoice !== "skip" && authChoice !== "ollama" && authChoice !== "token" && !usesManagedAuth;
  const showGatewayPasswordInput = gatewayAuth === "password";
  const showGatewayTokenFields = gatewayAuth === "token";
  const showPlaintextApiKeyInput = supportsApiKey && secretInputMode === "plaintext";
  const showPlaintextGatewayTokenInput = showGatewayTokenFields && gatewayTokenInputMode === "plaintext";
  const capabilityRows = [
    {
      label: messages.inspector.openClawOnboarding.capabilities.flows,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedFlows) ? state.supportedFlows : [],
        flowOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.providers,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedAuthChoices) ? state.supportedAuthChoices : [],
        authOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.gatewayBinds,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedGatewayBinds) ? state.supportedGatewayBinds : [],
        gatewayBindOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.daemonRuntimes,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedDaemonRuntimes) ? state.supportedDaemonRuntimes : [],
        daemonRuntimeOptions,
      ),
    },
  ].filter((row) => row.values.length);
  const fixedCapabilityHint = messages.inspector.openClawOnboarding.capabilities.lockedHint;
  const capabilityDetection = getOpenClawCapabilityDetectionText(messages, state?.capabilityDetection);
  const refreshCapabilityDetection = getOpenClawCapabilityDetectionText(messages, refreshResult?.capabilityDetection);
  const resultCapabilityDetection = getOpenClawCapabilityDetectionText(messages, result?.capabilityDetection);

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawOnboarding.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawOnboarding.description}
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={state?.ready ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                {state?.ready ? messages.inspector.openClawOnboarding.statuses.ready : messages.inspector.openClawOnboarding.statuses.required}
              </Badge>
              {state?.configPath ? (
                <div className="min-w-0 break-all font-mono text-[12px] text-foreground">{state.configPath}</div>
              ) : null}
            </div>
            {state?.validation ? (
              <div className="mt-2 text-muted-foreground">
                {messages.inspector.openClawOnboarding.labels.validation}:{" "}
                {state.validation.ok ? messages.inspector.openClawOnboarding.validation.valid : messages.inspector.openClawOnboarding.validation.invalid}
              </div>
            ) : null}
            {state?.service ? (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.title}</span>
                  {": "}
                  <span>
                    {state.service.installed
                      ? (state.service.running
                        ? messages.inspector.openClawOnboarding.service.installedRunning
                        : messages.inspector.openClawOnboarding.service.installedStopped)
                      : messages.inspector.openClawOnboarding.service.notInstalled}
                  </span>
                </div>
                {state.service.label ? (
                  <div>
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.label}</span>
                    {": "}
                    <span className="font-mono">{state.service.label}</span>
                  </div>
                ) : null}
                {state.service.plistPath ? (
                  <div className="break-all">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.launchAgent}</span>
                    {": "}
                    <span className="font-mono">{state.service.plistPath}</span>
                  </div>
                ) : null}
                {state.service.logDir ? (
                  <div className="break-all">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.logs}</span>
                    {": "}
                    <span className="font-mono">{state.service.logDir}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {capabilityRows.length ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.openClawOnboarding.capabilities.title}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.capabilities.detectedBy}</span>
                    {": "}
                    <span>{capabilityDetection.sourceLabel}</span>
                    {capabilityDetection.reasonLabel ? (
                      <>
                        {" · "}
                        <span>{capabilityDetection.reasonLabel}</span>
                      </>
                    ) : null}
                    {capabilityDetection.signature ? (
                      <>
                        {" · "}
                        <span>{messages.inspector.openClawOnboarding.capabilities.signature}: {capabilityDetection.signature}</span>
                      </>
                    ) : null}
                    {capabilityDetection.detectedAt ? (
                      <>
                        {" · "}
                        <span>{messages.inspector.openClawOnboarding.capabilities.detectedAt}: {capabilityDetection.detectedAt}</span>
                      </>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-[11px]"
                    disabled={loading || busy}
                    onClick={() => onRefreshCapabilities?.()}
                  >
                    {loading ? messages.inspector.openClawOnboarding.refreshingCapabilities : messages.inspector.openClawOnboarding.refreshCapabilities}
                  </Button>
                </div>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-muted-foreground">
                  {capabilityRows.map((row) => (
                    <div key={row.label}>
                      <span className="font-medium text-foreground">{row.label}</span>
                      {": "}
                      <span>{row.values.join(" / ") || messages.inspector.openClawOnboarding.capabilities.empty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3">
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.flow.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.flow.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.flow.label}
              options={flowOptions}
              value={flow}
              onChange={(nextValue) => onChange?.("flow", nextValue)}
            />
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.authChoice.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.authChoice.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.authChoice.label}
              options={authOptions}
              value={authChoice}
              onChange={(nextValue) => onChange?.("authChoice", nextValue)}
            />
            {showTokenAuthFields ? (
              <>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenProvider.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenProvider.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenProvider.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenProvider.placeholder}
                    value={normalizedValues.tokenProvider}
                    onChange={(event) => onChange?.("tokenProvider", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.token.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.token.description}</div>
                  <input
                    type="password"
                    aria-label={messages.inspector.openClawOnboarding.fields.token.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.token.placeholder}
                    value={normalizedValues.token}
                    onChange={(event) => onChange?.("token", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenProfileId.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenProfileId.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenProfileId.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenProfileId.placeholder}
                    value={normalizedValues.tokenProfileId}
                    onChange={(event) => onChange?.("tokenProfileId", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenExpiresIn.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenExpiresIn.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenExpiresIn.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenExpiresIn.placeholder}
                    value={normalizedValues.tokenExpiresIn}
                    onChange={(event) => onChange?.("tokenExpiresIn", event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {usesManagedAuth ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.managedAuth.title}</div>
                <div className="mt-1">{messages.inspector.openClawOnboarding.managedAuth.description}</div>
              </div>
            ) : null}
            {supportsApiKey ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.secretInputMode.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.secretInputMode.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.secretInputMode.label}
                options={secretModeOptions}
                value={secretInputMode}
                onChange={(nextValue) => onChange?.("secretInputMode", nextValue)}
              />
            ) : null}
            {showPlaintextApiKeyInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.apiKey.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.apiKey.placeholder}
                  value={normalizedValues.apiKey}
                  onChange={(event) => onChange?.("apiKey", event.target.value)}
                />
              </div>
            ) : null}
            {supportsApiKey && secretInputMode === "ref" ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.label}</div>
                <div className="mt-1">{messages.inspector.openClawOnboarding.fields.secretInputMode.refHint}</div>
              </div>
            ) : null}
            {showProviderEndpointFields ? (
              <>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customBaseUrl.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customBaseUrl.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.customBaseUrl.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.customBaseUrl.placeholder}
                    value={normalizedValues.customBaseUrl}
                    onChange={(event) => onChange?.("customBaseUrl", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customModelId.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customModelId.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.customModelId.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.customModelId.placeholder}
                    value={normalizedValues.customModelId}
                    onChange={(event) => onChange?.("customModelId", event.target.value)}
                  />
                </div>
                {showCustomProviderFields ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                      <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customProviderId.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customProviderId.description}</div>
                      <input
                        type="text"
                        aria-label={messages.inspector.openClawOnboarding.fields.customProviderId.label}
                        className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                        disabled={loading || busy}
                        placeholder={messages.inspector.openClawOnboarding.fields.customProviderId.placeholder}
                        value={normalizedValues.customProviderId}
                        onChange={(event) => onChange?.("customProviderId", event.target.value)}
                      />
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                      <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customCompatibility.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customCompatibility.description}</div>
                      <div className="relative mt-3">
                        <select
                          aria-label={messages.inspector.openClawOnboarding.fields.customCompatibility.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={normalizedValues.customCompatibility}
                          onChange={(event) => onChange?.("customCompatibility", event.target.value)}
                        >
                          {Object.entries(messages.inspector.openClawOnboarding.fields.customCompatibility.options || {}).map(([value, label]) => (
                            <option key={value} value={value}>{String(label)}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayBind.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.gatewayBind.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.gatewayBind.label}
              options={gatewayBindOptions}
              value={gatewayBind}
              onChange={(nextValue) => onChange?.("gatewayBind", nextValue)}
            />
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayAuth.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.gatewayAuth.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.gatewayAuth.label}
              options={gatewayAuthOptions}
              value={gatewayAuth}
              onChange={(nextValue) => onChange?.("gatewayAuth", nextValue)}
            />
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.installDaemon.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.installDaemon.description}</div>
                </div>
                <Switch
                  checked={installDaemon}
                  aria-label={messages.inspector.openClawOnboarding.fields.installDaemon.label}
                  disabled={loading || busy}
                  onCheckedChange={(checked) => onChange?.("installDaemon", checked)}
                />
              </label>
              <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {installDaemon
                  ? messages.inspector.openClawOnboarding.fields.installDaemon.enabledHint
                  : messages.inspector.openClawOnboarding.fields.installDaemon.disabledHint}
              </div>
            </div>
            {installDaemon ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.daemonRuntime.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.daemonRuntime.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.daemonRuntime.label}
                options={daemonRuntimeOptions}
                value={daemonRuntime}
                onChange={(nextValue) => onChange?.("daemonRuntime", nextValue)}
              />
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.skipHealthCheck.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.skipHealthCheck.description}</div>
                </div>
                <Switch
                  checked={skipHealthCheck}
                  aria-label={messages.inspector.openClawOnboarding.fields.skipHealthCheck.label}
                  disabled={loading || busy}
                  onCheckedChange={(checked) => onChange?.("skipHealthCheck", checked)}
                />
              </label>
              <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {messages.inspector.openClawOnboarding.fields.skipHealthCheck.hint}
              </div>
            </div>
            {showGatewayTokenFields ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.label}
                options={gatewayTokenModeOptions}
                value={gatewayTokenInputMode}
                onChange={(nextValue) => onChange?.("gatewayTokenInputMode", nextValue)}
              />
            ) : null}
            {showPlaintextGatewayTokenInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayToken.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayToken.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayToken.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayToken.placeholder}
                  value={normalizedValues.gatewayToken}
                  onChange={(event) => onChange?.("gatewayToken", event.target.value)}
                />
              </div>
            ) : null}
            {showGatewayTokenFields && gatewayTokenInputMode === "ref" ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.description}</div>
                <input
                  type="text"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.placeholder}
                  value={normalizedValues.gatewayTokenRefEnv}
                  onChange={(event) => onChange?.("gatewayTokenRefEnv", event.target.value)}
                />
              </div>
            ) : null}
            {showGatewayPasswordInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayPassword.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayPassword.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayPassword.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayPassword.placeholder}
                  value={normalizedValues.gatewayPassword}
                  onChange={(event) => onChange?.("gatewayPassword", event.target.value)}
                />
              </div>
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.workspace.label}</div>
              <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.workspace.description}</div>
              <input
                type="text"
                aria-label={messages.inspector.openClawOnboarding.fields.workspace.label}
                className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                disabled={loading || busy}
                placeholder={messages.inspector.openClawOnboarding.fields.workspace.placeholder}
                value={normalizedValues.workspace}
                onChange={(event) => onChange?.("workspace", event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              variant="ghost"
              aria-label={messages.inspector.openClawOnboarding.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawOnboarding.reloading : messages.inspector.openClawOnboarding.reload}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              className="h-8 rounded-full px-3"
              onClick={() => onSubmit?.()}
            >
              {busy ? messages.inspector.openClawOnboarding.running : messages.inspector.openClawOnboarding.run}
            </Button>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {refreshResult ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.refreshResultTitle}</div>
                <Badge variant={refreshResult.ok ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                  {refreshResult.ok
                    ? messages.inspector.openClawOnboarding.refreshStatuses.success
                    : messages.inspector.openClawOnboarding.refreshStatuses.failed}
                </Badge>
              </div>
              {refreshResult.requestedAt ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.refreshRequestedAt}
                  </div>
                  <div className="text-[12px] text-foreground">{refreshResult.requestedAt}</div>
                </div>
              ) : null}
              {refreshResult.capabilityDetection ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.capabilityDetection}
                  </div>
                  <div className="text-[12px] text-foreground">
                    {refreshCapabilityDetection.sourceLabel}
                    {refreshCapabilityDetection.reasonLabel ? ` · ${refreshCapabilityDetection.reasonLabel}` : ""}
                    {refreshCapabilityDetection.signature ? ` · ${messages.inspector.openClawOnboarding.capabilities.signature}: ${refreshCapabilityDetection.signature}` : ""}
                    {refreshCapabilityDetection.detectedAt ? ` · ${messages.inspector.openClawOnboarding.capabilities.detectedAt}: ${refreshCapabilityDetection.detectedAt}` : ""}
                  </div>
                </div>
              ) : null}
              {refreshResult.error ? (
                <div className="text-[12px] leading-5 text-destructive">
                  {refreshResult.error}
                </div>
              ) : null}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.resultTitle}</div>
                <Badge variant={result.ok ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                  {result.ok ? messages.inspector.openClawOnboarding.statuses.ready : messages.inspector.openClawOnboarding.statuses.required}
                </Badge>
              </div>
              {result.commandResult?.command?.display ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.command}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.commandResult.command.display}</div>
                </div>
              ) : null}
              {result.capabilityDetection ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.capabilityDetection}
                  </div>
                  <div className="text-[12px] text-foreground">
                    {resultCapabilityDetection.sourceLabel}
                    {resultCapabilityDetection.reasonLabel ? ` · ${resultCapabilityDetection.reasonLabel}` : ""}
                    {resultCapabilityDetection.signature ? ` · ${messages.inspector.openClawOnboarding.capabilities.signature}: ${resultCapabilityDetection.signature}` : ""}
                    {resultCapabilityDetection.detectedAt ? ` · ${messages.inspector.openClawOnboarding.capabilities.detectedAt}: ${resultCapabilityDetection.detectedAt}` : ""}
                  </div>
                </div>
              ) : null}
              {result.healthCheck ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.health}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.healthCheck.status}</div>
                </div>
              ) : null}
              {result.commandResult?.stdout ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.stdout}
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                </div>
              ) : null}
              {result.commandResult?.stderr ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.stderr}
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawUpdatePanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onOpenRemoteGuide,
  onOpenTroubleshooting,
  onReload,
  onRunUpdate,
  remoteGuard = null,
  result = null,
  state = null,
  showTitle = true,
}: {
  busy?: boolean;
  error?: string;
  loading?: boolean;
  messages: InspectorMessages;
  onOpenRemoteGuide?: () => void;
  onOpenTroubleshooting?: (entry: OpenClawUpdateHelpEntry) => void;
  onReload?: InspectorFlowHandler;
  onRunUpdate?: InspectorFlowHandler;
  remoteGuard?: InspectorRemoteGuard;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
  showTitle?: boolean;
}) {
  const outcome = result ? getOpenClawUpdateOutcome(result) : "";
  const outcomeBadge = getOpenClawUpdateOutcomeBadgeProps(outcome);
  const installed = Boolean(state?.installed);
  const availability = state?.availability;
  const shouldShowRunAction = Boolean(state) && (!installed || Boolean(availability?.available));
  const previewActions = Array.isArray(state?.preview?.actions) ? state.preview.actions : [];
  const runButtonLabel = installed ? messages.inspector.openClawUpdate.runUpdate : messages.inspector.openClawUpdate.runInstall;
  const runningLabel = installed ? messages.inspector.openClawUpdate.running : messages.inspector.openClawUpdate.installing;
  const troubleshootingEntries = buildOpenClawUpdateTroubleshootingEntries(result, messages) as InspectorTroubleshootingEntry[];

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawUpdate.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawUpdate.description}
          </div>
          <OpenClawRemoteNotice messages={messages} onOpenGuide={onOpenRemoteGuide} remoteGuard={remoteGuard} />
          {state ? (
            installed ? (
              <div className="grid gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={availability?.available ? "secondary" : "success"} className="px-2 py-0.5 text-[11px] leading-5">
                    {availability?.available ? messages.inspector.openClawUpdate.statuses.updateAvailable : messages.inspector.openClawUpdate.statuses.upToDate}
                  </Badge>
                  <span className="text-muted-foreground">
                    {messages.inspector.openClawUpdate.labels.currentVersion}: {state.currentVersion || messages.inspector.openClawUpdate.emptyValue}
                  </span>
                  {state.targetVersion ? (
                    <span className="text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.targetVersion}: {state.targetVersion}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-1 text-muted-foreground">
                  <div>{messages.inspector.openClawUpdate.labels.installKind}: {state.update?.installKind || messages.inspector.openClawUpdate.emptyValue}</div>
                  <div>{messages.inspector.openClawUpdate.labels.channel}: {state.channel?.label || state.channel?.value || messages.inspector.openClawUpdate.emptyValue}</div>
                  <div>{messages.inspector.openClawUpdate.labels.packageManager}: {state.update?.packageManager || messages.inspector.openClawUpdate.emptyValue}</div>
                </div>
                {previewActions.length ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.preview}
                    </div>
                    <div className="space-y-1 text-[12px] leading-5 text-foreground">
                      {previewActions.map((item, index) => (
                        <div key={`${item}-${index}`}>• {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="px-2 py-0.5 text-[11px] leading-5">
                    {messages.inspector.openClawUpdate.statuses.notInstalled}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{messages.inspector.openClawUpdate.notInstalledDescription}</div>
                {state.installGuidance?.docsUrl ? (
                  <a
                    href={state.installGuidance.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                    {messages.inspector.openClawUpdate.installDocs}
                  </a>
                ) : null}
                {state.installGuidance?.command ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.installCommand}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{state.installGuidance.command}</pre>
                  </div>
                ) : null}
              </div>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading || busy || remoteGuard?.blocked}
              aria-label={messages.inspector.openClawUpdate.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawUpdate.reloading : messages.inspector.openClawUpdate.reload}
            </Button>
            {shouldShowRunAction ? (
              <Button
                type="button"
                size="sm"
                disabled={loading || busy || remoteGuard?.blocked}
                className="h-8 rounded-full px-3"
                onClick={() => onRunUpdate?.()}
              >
                {busy ? runningLabel : runButtonLabel}
              </Button>
            ) : null}
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">
                  {messages.inspector.openClawUpdate.resultTitle}
                </div>
                <Badge variant={outcomeBadge.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${outcomeBadge.className}`}>
                  {messages.inspector.openClawUpdate.outcomes[outcome || "warning"]}
                </Badge>
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-foreground">
                {result.commandResult?.command?.display ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.command}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.commandResult.command.display}</div>
                  </div>
                ) : null}
                {result.result?.targetVersion ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.targetVersion}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.result.targetVersion}</div>
                  </div>
                ) : null}
                {result.healthCheck ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.health}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {messages.inspector.openClawUpdate.healthStatuses?.[result.healthCheck.status] || result.healthCheck.status}
                      {result.healthCheck?.url ? ` · ${result.healthCheck.url}` : ""}
                    </div>
                  </div>
                ) : null}
                {typeof result.commandResult?.exitCode === "number" ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.exitCode}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.commandResult.exitCode}</div>
                  </div>
                ) : null}
                {typeof result.commandResult?.timedOut === "boolean" ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.timedOut}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {result.commandResult.timedOut ? messages.inspector.openClawUpdate.flags.yes : messages.inspector.openClawUpdate.flags.no}
                    </div>
                  </div>
                ) : null}
                {result.commandResult?.stdout ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.stdout}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                  </div>
                ) : null}
                {result.commandResult?.stderr ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.stderr}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                  </div>
                ) : null}
                {troubleshootingEntries.length ? (
                  <div className="space-y-2">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.troubleshooting}
                    </div>
                    <div className="space-y-2">
                      {troubleshootingEntries
                        .filter((entry): entry is NonNullable<InspectorTroubleshootingEntry> => Boolean(entry))
                        .map((entry) => (
                        <div key={entry.key} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                          <div className="text-[12px] font-medium text-foreground">{entry.title}</div>
                          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{entry.summary}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {entry.docs.map((doc) => (
                              <a
                                key={doc.key}
                                href={doc.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-border hover:bg-accent/20"
                              >
                                <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                                {doc.label}
                              </a>
                            ))}
                            {entry.canPreview ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-2.5 text-[11px]"
                                onClick={() => onOpenTroubleshooting?.(entry)}
                              >
                                <ScrollText className="mr-1 h-3.5 w-3.5" />
                                {messages.inspector.openClawUpdate.guidance.viewFix}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawUpdateTroubleshootingDialog({
  entry = null,
  messages,
  onClose,
}: {
  entry?: OpenClawUpdateHelpEntry;
  messages: InspectorMessages;
  onClose: () => void;
}) {
  if (!entry) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="dialog"
          aria-modal="true"
          aria-label={entry.title}
          className="flex w-full max-w-2xl max-h-[min(80vh,48rem)] min-h-0 flex-col overflow-hidden rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base leading-6">{entry.title}</CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">{entry.summary}</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={messages.inspector.openClawUpdate.guidance.closeFix}
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="space-y-4">
              {entry.steps.length ? (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawUpdate.guidance.solutionTitle}
                  </div>
                  <div className="mt-2 space-y-2">
                    {entry.steps.map((step, index) => (
                      <div key={`${entry.key}-step-${index}`} className="flex gap-2 text-sm leading-6 text-foreground">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{index + 1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {entry.commands.length ? (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawUpdate.guidance.commandsTitle}
                  </div>
                  <div className="mt-2 space-y-2">
                    {entry.commands.map((command, index) => (
                      <pre key={`${entry.key}-command-${index}`} className="overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{command}</pre>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function OpenClawOperationHistoryPanel({
  entries = [],
  error = "",
  loading = false,
  messages,
  onOpenGuide,
  onRequestRollback,
  onReload,
  rollbackBusy = false,
  remoteGuard = null,
  showTitle = true,
}: {
  entries?: InspectorHistoryEntry[];
  error?: string;
  loading?: boolean;
  messages: InspectorMessages;
  onOpenGuide?: () => void;
  onRequestRollback?: (entry: InspectorHistoryEntry) => void;
  onReload?: InspectorFlowHandler;
  rollbackBusy?: boolean;
  remoteGuard?: InspectorRemoteGuard;
  showTitle?: boolean;
}) {
  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.remoteOperations.historyTitle}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.remoteOperations.historyDescription}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              aria-label={messages.inspector.remoteOperations.reloadHistory}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.remoteOperations.reloadingHistory : messages.inspector.remoteOperations.reloadHistory}
            </Button>
          </div>
          {remoteGuard?.blocked ? (
            <div className="flex justify-start">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => onOpenGuide?.()}
              >
                <ScrollText className="mr-1 h-3.5 w-3.5" />
                {messages.inspector.remoteOperations.openGuide}
              </Button>
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {entries.length ? (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{`${entry.scope}.${entry.action}`}</div>
                      <div className="text-[11px] leading-5 text-muted-foreground">{formatOperationTimestamp(entry.finishedAt || entry.startedAt)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={entry.outcome === "success" ? "success" : entry.outcome === "warning" ? "secondary" : "default"} className="px-2 py-0.5 text-[10px] leading-5">
                        {messages.inspector.remoteOperations.outcomes?.[entry.outcome] || entry.outcome}
                      </Badge>
                      <Badge variant="outline" className="px-2 py-0.5 text-[10px] leading-5">
                        {messages.inspector.remoteOperations.targets?.[entry.target] || entry.target}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] leading-5 text-muted-foreground">
                    {entry.blocked ? <div>{messages.inspector.remoteOperations.blockedBadge}</div> : null}
                    {entry.summary ? <div>{entry.summary}</div> : null}
                    {entry.error ? <div>{entry.error}</div> : null}
                    {entry.backupPath ? <div>{messages.inspector.remoteOperations.backupLabel}: {compactHomePath(entry.backupPath)}</div> : null}
                    {entry.backupLabel ? <div>{messages.inspector.remoteOperations.rollbackPointLabel}: {entry.backupLabel}</div> : null}
                    {entry.rolledBack ? <div>{messages.inspector.remoteOperations.rollbackLabel}</div> : null}
                  </div>
                  {entry.backupId && !entry.rolledBack ? (
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={rollbackBusy}
                        className="h-7 rounded-full px-2.5 text-[11px]"
                        onClick={() => onRequestRollback?.(entry)}
                      >
                        {rollbackBusy ? messages.inspector.remoteOperations.restoringAction : messages.inspector.remoteOperations.restoreAction}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.remoteOperations.emptyHistory}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawRemoteRecoveryDialog({
  messages,
  onClose,
  open = false,
}: {
  messages: InspectorMessages;
  onClose: () => void;
  open?: boolean;
}) {
  if (!open) {
    return null;
  }

  const docs = [
    { key: "install", href: OFFICIAL_OPENCLAW_DOC_URLS.install, label: messages.inspector.remoteOperations.docs.install },
    { key: "doctor", href: OFFICIAL_OPENCLAW_DOC_URLS.doctor, label: messages.inspector.remoteOperations.docs.doctor },
    { key: "troubleshooting", href: OFFICIAL_OPENCLAW_DOC_URLS.troubleshooting, label: messages.inspector.remoteOperations.docs.troubleshooting },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="dialog"
          aria-modal="true"
          aria-label={messages.inspector.remoteOperations.guideTitle}
          className="flex w-full max-w-2xl max-h-[min(80vh,48rem)] min-h-0 flex-col overflow-hidden rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base leading-6">{messages.inspector.remoteOperations.guideTitle}</CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">{messages.inspector.remoteOperations.guideSummary}</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={messages.inspector.remoteOperations.closeGuide}
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.remoteOperations.solutionTitle}
                </div>
                <div className="mt-2 space-y-2">
                  {messages.inspector.remoteOperations.guideSteps.map((step, index) => (
                    <div key={`remote-guide-step-${index}`} className="flex gap-2 text-sm leading-6 text-foreground">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{index + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.remoteOperations.docsTitle}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {docs.map((doc) => (
                    <a
                      key={doc.key}
                      href={doc.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-border hover:bg-accent/20"
                    >
                      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                      {doc.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function OpenClawRollbackConfirmDialog({
  authorization = null,
  busy = false,
  entry = null,
  messages,
  onCancel,
  onChange,
  onConfirm,
}: {
  authorization?: InspectorAuthorizationState;
  busy?: boolean;
  entry?: InspectorRollbackIntent;
  messages: InspectorMessages;
  onCancel: () => void;
  onChange?: (fieldKey: any, value: any) => void;
  onConfirm: () => void;
}) {
  if (!entry) {
    return null;
  }

  const label = entry.backupLabel || entry.backupId || messages.inspector.remoteOperations.rollbackPointLabel;
  const targetLabel = messages.inspector.remoteOperations.targets?.[entry.target] || entry.target || "";
  const dialogTitle = typeof messages.inspector.remoteOperations.restoreDialogTitle === "function"
    ? messages.inspector.remoteOperations.restoreDialogTitle(targetLabel)
    : messages.inspector.remoteOperations.restoreDialogTitle;
  const dialogDescription = typeof messages.inspector.remoteOperations.restoreDialogDescription === "function"
    ? messages.inspector.remoteOperations.restoreDialogDescription(label, targetLabel)
    : messages.inspector.remoteOperations.restoreDialogDescription;
  const dialogConfirm = typeof messages.inspector.remoteOperations.restoreDialogConfirm === "function"
    ? messages.inspector.remoteOperations.restoreDialogConfirm(targetLabel)
    : messages.inspector.remoteOperations.restoreDialogConfirm;
  const dialogNotePlaceholder = typeof messages.inspector.remoteOperations.restoreDialogNotePlaceholder === "function"
    ? messages.inspector.remoteOperations.restoreDialogNotePlaceholder(targetLabel)
    : messages.inspector.remoteOperations.restoreDialogNotePlaceholder;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={() => !busy && onCancel()} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="alertdialog"
          aria-modal="true"
          aria-label={dialogTitle}
          className="w-full max-w-md rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <CardTitle className="text-base">{dialogTitle}</CardTitle>
            <CardDescription className="text-sm leading-6">
              {dialogDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 py-4">
            <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <input
                type="checkbox"
                checked={Boolean(authorization?.confirmed)}
                aria-label={dialogConfirm}
                disabled={busy}
                className="mt-1 h-4 w-4 shrink-0 rounded border border-border/70 accent-primary"
                onChange={(event) => onChange?.("confirmed", event.target.checked)}
              />
              <span className="text-sm leading-6 text-foreground">{dialogConfirm}</span>
            </label>
            <div className="grid gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {messages.inspector.remoteOperations.restoreDialogNoteLabel}
              </label>
              <input
                type="text"
                aria-label={messages.inspector.remoteOperations.restoreDialogNoteLabel}
                className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                disabled={busy}
                placeholder={dialogNotePlaceholder}
                value={String(authorization?.note || "")}
                onChange={(event) => onChange?.("note", event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
                {messages.inspector.remoteOperations.restoreDialogCancel}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !authorization?.confirmed}
                onClick={onConfirm}
              >
                {busy ? messages.inspector.remoteOperations.restoreDialogRunning : messages.inspector.remoteOperations.restoreDialogRun}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function OpenClawManagementConfirmDialog({
  action,
  busy = false,
  messages,
  onCancel,
  onConfirm,
}: {
  action?: InspectorRecord | null;
  busy?: boolean;
  messages: InspectorMessages;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!action) {
    return null;
  }

  const actionLabel = messages.inspector.openClawManagement.actions?.[action.key] || action.label;
  const dialogTitle = messages.inspector.openClawManagement.confirmation.title(actionLabel);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={() => !busy && onCancel()} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="alertdialog"
          aria-modal="true"
          aria-label={dialogTitle}
          className="w-full max-w-md rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <CardTitle className="text-base">{dialogTitle}</CardTitle>
            <CardDescription className="text-sm leading-6">
              {messages.inspector.openClawManagement.confirmation.description(actionLabel)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end gap-2 px-5 py-4">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
              {messages.inspector.openClawManagement.confirmation.cancel}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
              {busy ? messages.inspector.openClawManagement.confirmation.confirming : messages.inspector.openClawManagement.confirmation.confirm}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

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

  const loadWorkspaceDirectoryChildren = useCallback(async (targetPath) => {
    const directChildren = await requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      targetPath,
    });

    if (directChildren.length === 1 && directChildren[0]?.kind === "目录" && directChildren[0].hasChildren) {
      const onlyChild = directChildren[0];
      const nestedChildren = await loadWorkspaceDirectoryChildren(resolveItemPath(onlyChild));
      return [
        {
          ...onlyChild,
          children: nestedChildren,
          loaded: true,
          expanded: true,
          loading: false,
          error: "",
          hasChildren: nestedChildren.length > 0,
        },
      ];
    }

    return directChildren;
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot]);

  const fetchWorkspaceDirectory = useCallback(async (node, { preserveExpanded }: { preserveExpanded?: boolean } = {}) => {
    const nodePath = resolveItemPath(node);
    if (!nodePath) {
      return;
    }

    setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
      ...currentNode,
      expanded: preserveExpanded ?? currentNode.expanded,
      loading: true,
      error: "",
    })));

    try {
      const children = await loadWorkspaceDirectoryChildren(nodePath);
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
        ...currentNode,
        children,
        expanded: preserveExpanded ?? currentNode.expanded,
        loaded: true,
        loading: false,
        error: "",
        hasChildren: children.length > 0,
      })));
    } catch (error) {
      console.error(error);
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
        ...currentNode,
        expanded: preserveExpanded ?? currentNode.expanded,
        loading: false,
        error: messages.inspector.workspaceTree.loadFailed,
      })));
    }
  }, [loadWorkspaceDirectoryChildren, messages.inspector.workspaceTree.loadFailed]);

  useEffect(() => {
    const workspaceRootChanged = previousWorkspaceRootRef.current !== currentWorkspaceRoot;
    previousWorkspaceRootRef.current = currentWorkspaceRoot;

    if (workspaceRootChanged) {
      setContextMenu(null);
      setSelectedDirectoryPath("");
      setPasteFeedback(null);
      setRenameState(null);
      setRenameExtensionState(null);
      setExpandedSessionDirectories({});
      setSessionFilterInput("");
      setWorkspaceFilterInput("");
      setWorkspaceFilter("");
      setLocalSessionItems([]);
      setSessionPathRewrites([]);
      setWorkspaceNodes(normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
      setWorkspaceState({
        loaded: workspaceLoaded,
        loading: false,
        error: "",
      });
      return;
    }

    if (!hasWorkspaceFilter) {
      const nextNodes = normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot);
      const hasFreshWorkspaceSnapshot = workspaceLoaded || nextNodes.length > 0;

      if (hasFreshWorkspaceSnapshot) {
        setWorkspaceNodes((current) => (workspaceLoaded ? mergeWorkspaceNodes(current, nextNodes) : nextNodes));
        setWorkspaceState((current) => ({
          ...current,
          loaded: workspaceLoaded,
          loading: false,
          error: "",
        }));
      }
    }
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
    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));

    requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      filter: workspaceFilter.trim(),
    })
      .then((nextNodes) => {
        if (cancelled) {
          return;
        }
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setWorkspaceNodes([]);
        setWorkspaceState({
          loaded: false,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot, hasWorkspaceFilter, messages.inspector.workspaceTree.loadFailed, workspaceFilter]);

  const loadWorkspaceRoot = async () => {
    if (workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const nextNodes = await requestWorkspaceTree({
        currentAgentId,
        currentSessionUser,
        currentWorkspaceRoot,
        filter: hasWorkspaceFilter ? workspaceFilter.trim() : "",
      });
      setWorkspaceNodes(nextNodes);
      setWorkspaceState({ loaded: true, loading: false, error: "" });
    } catch (error) {
      console.error(error);
      setWorkspaceState({
        loaded: false,
        loading: false,
        error: messages.inspector.workspaceTree.loadFailed,
      });
    }
  };

  useEffect(() => {
    if (hasWorkspaceFilter || workspaceLoaded || workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
    })
      .then((nextNodes) => {
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      })
      .catch((error) => {
        console.error(error);
        setWorkspaceState({
          loaded: false,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        });
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

  const handleWorkspaceDirectoryOpen = async (node) => {
    const nodePath = resolveItemPath(node);

    if (!nodePath || node.loading) {
      return;
    }

    if (node.expanded) {
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({ ...currentNode, expanded: false })));
      return;
    }

    if (node.loaded) {
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({ ...currentNode, expanded: true })));
      return;
    }

    await fetchWorkspaceDirectory(node, { preserveExpanded: true });
  };

  const handleRefreshWorkspaceDirectory = useCallback(async (node) => {
    await fetchWorkspaceDirectory(node);
  }, [fetchWorkspaceDirectory]);

  const getPasteTargetLabel = useCallback((targetPath = "") => {
    const displayPath = formatDisplayPath({ path: targetPath, fullPath: targetPath }, currentWorkspaceRoot);
    return displayPath || compactHomePath(targetPath) || targetPath;
  }, [currentWorkspaceRoot]);

  const refreshWorkspaceAfterPaste = useCallback(async (targetPath) => {
    if (!targetPath || !currentWorkspaceRoot) {
      return;
    }

    if (hasWorkspaceFilter) {
      setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const nextNodes = await requestWorkspaceTree({
          currentAgentId,
          currentSessionUser,
          currentWorkspaceRoot,
          filter: workspaceFilter.trim(),
        });
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      } catch (error) {
        console.error(error);
        setWorkspaceState((current) => ({
          ...current,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        }));
      }
      return;
    }

    const targetNode = findWorkspaceNodeByPath(workspaceNodes, targetPath);
    if (targetNode) {
      await fetchWorkspaceDirectory(targetNode, { preserveExpanded: targetNode.expanded });
      return;
    }

    if (targetPath === currentWorkspaceRoot) {
      try {
        const nextNodes = await requestWorkspaceTree({
          currentAgentId,
          currentSessionUser,
          currentWorkspaceRoot,
        });
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      } catch (error) {
        console.error(error);
        setWorkspaceState((current) => ({
          ...current,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        }));
      }
    }
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    fetchWorkspaceDirectory,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree.loadFailed,
    workspaceFilter,
    workspaceNodes,
  ]);

  const pasteClipboardEntriesIntoDirectory = useCallback(async (directoryItem, clipboardEntries) => {
    const targetPath = resolveItemPath(directoryItem);
    if (!targetPath) {
      return;
    }

    const targetLabel = getPasteTargetLabel(targetPath);

    try {
      const requestEntries = await buildClipboardPasteRequestEntries(clipboardEntries);
      if (!requestEntries.length) {
        throw new Error(pasteUnavailableMessage);
      }

      const response = await apiFetch("/api/file-manager/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: targetPath,
          entries: requestEntries,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || pasteUnavailableMessage);
      }

      setSelectedDirectoryPath(targetPath);
      const savedPaths = Array.isArray(payload.items)
        ? payload.items
            .map((item) => String(item?.fullPath || item?.path || "").trim())
            .filter(Boolean)
        : [];
      const fallbackPaths = requestEntries
        .map((entry) => String(entry?.name || "").trim())
        .filter(Boolean)
        .map((name) => joinPathSegments(targetPath, [name]));
      onTrackSessionFiles?.({
        files: buildUserSessionItemsFromPaths(savedPaths.length ? savedPaths : fallbackPaths, "created"),
      });
      setLocalSessionItems((current) =>
        mergeSessionFileItems(
          current,
          buildUserSessionItemsFromPaths(savedPaths.length ? savedPaths : fallbackPaths, "created"),
        )
      );
      await refreshWorkspaceAfterPaste(targetPath);

      const savedCount = Array.isArray(payload.items) && payload.items.length
        ? payload.items.length
        : requestEntries.length;
      const successText = typeof messages.inspector.workspaceTree.pasteSucceeded === "function"
        ? messages.inspector.workspaceTree.pasteSucceeded(savedCount, targetLabel)
        : messages.inspector.workspaceTree.loadFailed;
      setPasteFeedback({
        kind: "success",
        text: successText,
      });
    } catch (error) {
      console.error(error);
      const failureText = typeof messages.inspector.workspaceTree.pasteFailed === "function"
        ? messages.inspector.workspaceTree.pasteFailed(targetLabel, error.message || pasteUnavailableMessage)
        : (error.message || messages.inspector.workspaceTree.loadFailed);
      setPasteFeedback({
        kind: "error",
        text: failureText,
      });
    }
  }, [
    getPasteTargetLabel,
    messages.inspector.workspaceTree,
    onTrackSessionFiles,
    pasteUnavailableMessage,
    refreshWorkspaceAfterPaste,
  ]);

  const handlePasteDirectoryFromMenu = useCallback(async (directoryItem) => {
    const clipboardEntries = await readClipboardFileEntries();
    await pasteClipboardEntriesIntoDirectory(directoryItem, clipboardEntries);
  }, [pasteClipboardEntriesIntoDirectory]);

  const commitRename = useCallback(async ({ item, nextName }) => {
    const currentPath = resolveItemPath(item);
    if (!currentPath) {
      return;
    }

    const response = await apiFetch("/api/file-manager/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath, nextName }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(
        typeof messages.inspector.workspaceTree.renameFailed === "function"
          ? messages.inspector.workspaceTree.renameFailed(item.name || getPathName(currentPath), payload.error || "Rename failed")
          : (payload.error || "Rename failed"),
      );
    }

    const nextPath = String(payload.nextPath || "").trim() || replacePathPrefix(currentPath, currentPath, currentPath);
    onTrackSessionFiles?.({
      files: item?.kind === "目录" ? [] : buildUserSessionItemsFromPaths([nextPath], "modified"),
      rewrites: [{ previousPath: currentPath, nextPath }],
    });
    setSessionPathRewrites((current) => [...current, { previousPath: currentPath, nextPath }]);
    setLocalSessionItems((current) => {
      const renamedItems = renameSessionItems(current, currentPath, nextPath);
      if (item?.kind === "目录") {
        return renamedItems;
      }
      return mergeSessionFileItems(
        renamedItems,
        buildUserSessionItemsFromPaths([nextPath], "modified"),
      );
    });
    setSelectedDirectoryPath((current) => replacePathPrefix(current, currentPath, nextPath));

    if (hasWorkspaceFilter && currentWorkspaceRoot) {
      try {
        const nextNodes = await requestWorkspaceTree({
          currentAgentId,
          currentSessionUser,
          currentWorkspaceRoot,
          filter: workspaceFilter.trim(),
        });
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      } catch (error) {
        console.error(error);
        setWorkspaceState((current) => ({
          ...current,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        }));
      }
    } else {
      setWorkspaceNodes((current) => renameWorkspaceNodes(current, currentPath, nextPath));
    }
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
    const resolvedPath = resolveItemPath(item);
    const fallbackName = String(item?.name || getPathName(resolvedPath) || "").trim();
    if (!fallbackName) {
      return;
    }
    setRenameExtensionState(null);
    setRenameState({
      source,
      item,
      value: fallbackName,
      submitting: false,
      error: "",
    });
  }, []);

  const submitRename = useCallback(async (forceExtensionChange = false) => {
    if (!renameState) {
      return;
    }

    const nextName = String(renameState.value || "").trim();
    const currentName = String(renameState.item?.name || getPathName(resolveItemPath(renameState.item)) || "").trim();
    if (!nextName) {
      setRenameState((current) => current ? { ...current, error: messages.inspector.workspaceTree.loadFailed } : current);
      return;
    }

    if (!forceExtensionChange && doesFileExtensionChange(renameState.item, nextName)) {
      setRenameExtensionState({
        fromExtension: getPathExtension(currentName).replace(/^\./, ""),
        toExtension: getPathExtension(nextName).replace(/^\./, ""),
      });
      return;
    }

    setRenameState((current) => current ? { ...current, submitting: true, error: "" } : current);

    try {
      await commitRename({ item: renameState.item, nextName });
      setRenameState(null);
      setRenameExtensionState(null);
    } catch (error) {
      console.error(error);
      setRenameState((current) => current ? { ...current, submitting: false, error: error.message || messages.inspector.workspaceTree.loadFailed } : current);
      setRenameExtensionState(null);
      return;
    }
  }, [commitRename, messages.inspector.workspaceTree, renameState]);

  useEffect(() => {
    if (!active || !selectedDirectoryPath) {
      return undefined;
    }

    const handleDirectoryPaste = (event) => {
      const pastedFiles = Array.from(event.clipboardData?.files || []).filter(Boolean);
      if (!pastedFiles.length) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      pasteClipboardEntriesIntoDirectory(
        { path: selectedDirectoryPath, fullPath: selectedDirectoryPath, kind: "目录" },
        createClipboardUploadEntriesFromFiles(pastedFiles as File[]),
      ).catch((error) => {
        console.error(error);
      });
    };

    window.addEventListener("paste", handleDirectoryPaste, true);
    return () => {
      window.removeEventListener("paste", handleDirectoryPaste, true);
    };
  }, [active, pasteClipboardEntriesIntoDirectory, selectedDirectoryPath]);

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
            visibleWorkspaceCount={visibleWorkspaceCount}
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
      <FileContextMenu
        menu={contextMenu}
        messages={messages}
        onClose={() => setContextMenu(null)}
        onOpenEdit={onOpenEdit}
        onOpenPreview={onOpenPreview}
        onPasteDirectory={handlePasteDirectoryFromMenu}
        onRename={openRenameDialog}
        onRefreshDirectory={!hasWorkspaceFilter ? handleRefreshWorkspaceDirectory : undefined}
      />
      {renameState ? (
        <RenameDialog
          confirmLabel={messages.inspector.workspaceTree.renameConfirm}
          description={messages.inspector.workspaceTree.renameDescription(renameState.item?.name || getPathName(resolveItemPath(renameState.item)))}
          error={renameState.error}
          inputLabel={messages.inspector.workspaceTree.renameLabel}
          messages={messages}
          onCancel={() => {
            if (renameState.submitting) {
              return;
            }
            setRenameState(null);
            setRenameExtensionState(null);
          }}
          onChange={(value) => {
            setRenameState((current) => current ? { ...current, value, error: "" } : current);
          }}
          onConfirm={() => {
            submitRename(false).catch(() => {});
          }}
          placeholder={messages.inspector.workspaceTree.renamePlaceholder}
          submitting={renameState.submitting}
          title={messages.inspector.workspaceTree.renameTitle}
          value={renameState.value}
        />
      ) : null}
      {renameState && renameExtensionState ? (
        <RenameExtensionConfirmDialog
          description={messages.inspector.workspaceTree.renameExtensionChangeDescription(
            renameExtensionState.fromExtension,
            renameExtensionState.toExtension,
          )}
          messages={messages}
          onCancel={() => {
            if (renameState.submitting) {
              return;
            }
            setRenameExtensionState(null);
          }}
          onConfirm={() => {
            submitRename(true).catch(() => {});
          }}
          submitting={renameState.submitting}
          title={messages.inspector.workspaceTree.renameExtensionChangeTitle}
        />
      ) : null}
    </>
  );
}

function EnvironmentTab({
  configEditor = null,
  history = null,
  items = [],
  lalaclawFlow = null,
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
            label={messages.inspector.openClawUpdate.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawUpdatePanel
              busy={updateFlow.busy}
              error={updateFlow.error}
              loading={updateFlow.loading}
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
        {openClawDiagnostics.length ? (
          <div className="grid gap-2">
            {openClawDiagnostics.map((section) => (
              <EnvironmentSectionCard
                key={section.key}
                count={section.items.length}
                label={messages.inspector.openClawDiagnostics.sections?.[section.key] || section.key}
                messages={messages}
              >
                  {section.items.map((item, index) => {
                    if (!item) {
                      return null;
                    }
                    const badgeProps = getOpenClawDiagnosticBadgeProps(item.value);
                    return (
                      <div
                        key={`${item.label}-${index}`}
                        className="group grid gap-0.5 overflow-hidden border-b border-border/55 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            {localizeOpenClawDiagnosticLabel(item.label, messages)}
                          </div>
                          <HoverCopyValueButton content={localizeOpenClawDiagnosticValue(item.value, messages)} />
                        </div>
                        {shouldRenderOpenClawDiagnosticBadge(item.label) ? (
                          <div>
                            <Badge variant={badgeProps.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${badgeProps.className}`}>
                              {localizeOpenClawDiagnosticValue(item.value, messages)}
                            </Badge>
                          </div>
                        ) : shouldRenderEnvironmentPathLink(item) ? (
                          <div className="min-w-0 overflow-hidden">
                            <FileLink
                              item={buildEnvironmentPathItem(item)}
                              compact
                              currentWorkspaceRoot=""
                              label={localizeOpenClawDiagnosticValue(item.value, messages)}
                              onOpenPreview={onOpenPreview}
                              onRevealInFileManager={(targetItem) => {
                                onRevealInFileManager?.(targetItem).catch(() => {});
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word] font-mono text-[12px] leading-5 text-foreground">
                            {localizeOpenClawDiagnosticValue(item.value, messages)}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </EnvironmentSectionCard>
            ))}
          </div>
        ) : null}
        {groupedEnvironmentItems.map((group) => (
          <EnvironmentSectionCard
            key={group.key}
            count={group.items.length}
            label={group.label}
            messages={messages}
          >
            {group.items.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="group w-full min-w-0 max-w-full overflow-hidden border-b border-border/55 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 space-y-0.5 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {localizeEnvironmentItemLabel(item.label, messages)}
                    </div>
                    <HoverCopyValueButton content={localizeEnvironmentItemValue(item.value, messages)} />
                  </div>
                  {shouldRenderEnvironmentPathLink(item) ? (
                    <div className="min-w-0 overflow-hidden">
                      <FileLink
                        item={buildEnvironmentPathItem(item)}
                        compact
                        currentWorkspaceRoot=""
                        label={localizeEnvironmentItemValue(item.value, messages)}
                        onOpenPreview={onOpenPreview}
                        onRevealInFileManager={(targetItem) => {
                          onRevealInFileManager?.(targetItem).catch(() => {});
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word] font-mono text-[12px] leading-5 text-foreground">
                      {localizeEnvironmentItemValue(item.value, messages)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </EnvironmentSectionCard>
        ))}
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
  const { messages } = useI18n();
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
    { key: "environment", icon: Monitor, label: messages.inspector.tabs.environment, alertDot: Boolean(lalaclawUpdateState?.updateAvailable) },
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
      <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader className="flex min-h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-[1.15]">{messages.inspector.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-5">{messages.inspector.subtitle}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabsList ref={tabsListRef} className="grid h-auto w-full shrink-0 grid-cols-2 gap-1 p-1 md:grid-cols-4">
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

            <TabsContent value="files" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {filesTabContent}
            </TabsContent>

            <TabsContent value="artifacts" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {artifactsTabContent}
            </TabsContent>

            <TabsContent value="timeline" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {timelineTabContent}
            </TabsContent>

            <TabsContent value="environment" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {environmentTabContent}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
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
