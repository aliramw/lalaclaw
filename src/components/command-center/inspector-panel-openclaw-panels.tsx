import { Badge } from "@/components/ui/badge";
import { OpenClawRemoteNotice } from "@/components/command-center/inspector-panel-primitives";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardSurface as Card,
} from "@/components/command-center/inspector-panel-surfaces";
import {
  getLalaClawUpdateBadgeVariant,
  getOpenClawManagementActions,
  getOpenClawManagementOutcome,
  getOpenClawManagementOutcomeBadgeProps,
  localizeEnvironmentItemLabel,
  localizeEnvironmentItemValue,
} from "@/components/command-center/inspector-panel-utils";
import { useI18n } from "@/lib/i18n";

type InspectorRecord = Record<string, any>;
type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorRemoteGuard = InspectorRecord | null;
type LalaClawFlowState = InspectorRecord | null;

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
  metadataItems?: InspectorRecord[];
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
    && workspaceVersion !== installedVersion,
  );
  const currentVersion = shouldPreferWorkspaceVersion
    ? workspaceVersion
    : (installedVersion || messages.inspector.lalaclawUpdate.emptyValue);
  const targetVersion = String(state?.availability?.latestVersion || state?.targetRelease?.version || "").trim();
  const currentStable = !shouldPreferWorkspaceVersion && Boolean(state?.currentRelease?.stable);
  const targetStable = Boolean(state?.targetRelease?.stable);
  const updateAvailable = state?.availability?.available === true || Boolean(state?.updateAvailable);
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
              <div className="mt-3 grid gap-0.5">
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

export function OpenClawManagementPanel({
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
