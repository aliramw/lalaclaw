import { X } from "lucide-react";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardDescriptionSurface as CardDescription,
  CardHeaderSurface as CardHeader,
  CardSurface as Card,
  CardTitleSurface as CardTitle,
} from "@/components/command-center/inspector-panel-surfaces";
import { useI18n } from "@/lib/i18n";

type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type OpenClawUpdateHelpEntry = Record<string, any> | null;

export function RenameDialog({
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

export function RenameExtensionConfirmDialog({
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

export function OpenClawUpdateTroubleshootingDialog({
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
