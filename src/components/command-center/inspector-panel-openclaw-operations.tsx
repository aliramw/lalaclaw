import { ScrollText, SquareArrowOutUpRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  compactHomePath,
  formatOperationTimestamp,
  getOfficialOpenClawDocUrl,
  OFFICIAL_OPENCLAW_DOC_URLS,
} from "@/components/command-center/inspector-panel-utils";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardDescriptionSurface as CardDescription,
  CardHeaderSurface as CardHeader,
  CardSurface as Card,
  CardTitleSurface as CardTitle,
} from "@/components/command-center/inspector-panel-surfaces";
import { useI18n } from "@/lib/i18n";

type InspectorRecord = Record<string, any>;
type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorRemoteGuard = InspectorRecord | null;
type InspectorHistoryEntry = Record<string, any>;
type InspectorAuthorizationState = Record<string, any> | null;
type InspectorRollbackIntent = Record<string, any> | null;

export function OpenClawOperationHistoryPanel({
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

export function OpenClawRemoteRecoveryDialog({
  locale = "en",
  messages,
  onClose,
  open = false,
}: {
  locale?: string;
  messages: InspectorMessages;
  onClose: () => void;
  open?: boolean;
}) {
  if (!open) {
    return null;
  }

  const docs = [
    { key: "install", href: getOfficialOpenClawDocUrl("install", locale), label: messages.inspector.remoteOperations.docs.install },
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

export function OpenClawRollbackConfirmDialog({
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

export function OpenClawManagementConfirmDialog({
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
