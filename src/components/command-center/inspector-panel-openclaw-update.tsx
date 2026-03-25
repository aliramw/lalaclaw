import { ScrollText, SquareArrowOutUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OpenClawRemoteNotice } from "@/components/command-center/inspector-panel-primitives";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardSurface as Card,
} from "@/components/command-center/inspector-panel-surfaces";
import {
  buildOpenClawUpdateTroubleshootingEntries,
  getOfficialOpenClawDocUrl,
  getOpenClawUpdateOutcome,
  getOpenClawUpdateOutcomeBadgeProps,
} from "@/components/command-center/inspector-panel-utils";
import { useI18n } from "@/lib/i18n";

type InspectorRecord = Record<string, any>;
type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorRemoteGuard = InspectorRecord | null;
type InspectorTroubleshootingEntry = {
  key: string;
  title: string;
  summary: string;
  steps: string[];
  commands: string[];
  docs: Array<{ key: string; href: string; label: string }>;
  canPreview?: boolean;
} | null;

export function OpenClawUpdatePanel({
  busy = false,
  error = "",
  loading = false,
  locale = "en",
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
  locale?: string;
  messages: InspectorMessages;
  onOpenRemoteGuide?: () => void;
  onOpenTroubleshooting?: (entry: InspectorTroubleshootingEntry) => void;
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
  const actionableTargetVersion = String(state?.targetVersion || "").trim();
  const hasActionableUpdate = Boolean(actionableTargetVersion);
  const shouldShowRunAction = Boolean(state) && (!installed || hasActionableUpdate);
  const previewActions = Array.isArray(state?.preview?.actions) ? state.preview.actions : [];
  const runButtonLabel = installed ? messages.inspector.openClawUpdate.runUpdate : messages.inspector.openClawUpdate.runInstall;
  const runningLabel = installed ? messages.inspector.openClawUpdate.running : messages.inspector.openClawUpdate.installing;
  const troubleshootingEntries = buildOpenClawUpdateTroubleshootingEntries(result, messages, locale) as InspectorTroubleshootingEntry[];

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
                  <Badge variant={hasActionableUpdate ? "secondary" : "success"} className="px-2 py-0.5 text-[11px] leading-5">
                    {hasActionableUpdate ? messages.inspector.openClawUpdate.statuses.updateAvailable : messages.inspector.openClawUpdate.statuses.upToDate}
                  </Badge>
                  <span className="text-muted-foreground">
                    {messages.inspector.openClawUpdate.labels.currentVersion}: {state.currentVersion || messages.inspector.openClawUpdate.emptyValue}
                  </span>
                  {hasActionableUpdate ? (
                    <span className="text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.targetVersion}: {actionableTargetVersion}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-1 text-muted-foreground">
                  <div>{messages.inspector.openClawUpdate.labels.installKind}: {state.update?.installKind || messages.inspector.openClawUpdate.emptyValue}</div>
                  <div>{messages.inspector.openClawUpdate.labels.channel}: {state.channel?.label || state.channel?.value || messages.inspector.openClawUpdate.emptyValue}</div>
                  <div>{messages.inspector.openClawUpdate.labels.packageManager}: {state.update?.packageManager || messages.inspector.openClawUpdate.emptyValue}</div>
                </div>
                {hasActionableUpdate && previewActions.length ? (
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
                    href={getOfficialOpenClawDocUrl("install", locale)}
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
