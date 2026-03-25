import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OpenClawRemoteNotice } from "@/components/command-center/inspector-panel-primitives";
import { FileLink } from "@/components/command-center/inspector-panel-files";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardSurface as Card,
  SwitchSurface as Switch,
} from "@/components/command-center/inspector-panel-surfaces";
import {
  compactHomePath,
  getOpenClawConfigFieldMeta,
  getOpenClawConfigFieldValueLabel,
  getOpenClawConfigFormState,
  getOpenClawConfigOutcome,
  getOpenClawConfigOutcomeBadgeProps,
  isAbsoluteFileSystemPath,
} from "@/components/command-center/inspector-panel-utils";
import { buildOpenClawConfigFormValues } from "@/features/app/controllers/use-openclaw-inspector";
import { useI18n } from "@/lib/i18n";

type InspectorRecord = Record<string, any>;
type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorRemoteGuard = InspectorRecord | null;
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorPreviewHandler = (item: any, options?: any) => void;
type InspectorRevealHandler = (item: any) => Promise<void>;
type InspectorFormValues = Record<string, unknown>;
type InspectorAuthorizationState = Record<string, any> | null;

export function OpenClawConfigPanel({
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
