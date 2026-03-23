import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleUserRound, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LalaClawPanel } from "@/components/command-center/inspector-panel";
import { isLalaClawEnvironmentItem } from "@/components/command-center/inspector-panel-utils";
import { useOpenClawInspector } from "@/features/app/controllers/use-openclaw-inspector";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SettingsDialogSection = "profile" | "about";

type SettingsDialogProps = {
  currentAgentId?: string;
  environmentItems?: Array<{ label?: string; value?: unknown }>;
  onClose?: () => void;
  onRefreshEnvironment?: () => Promise<unknown> | unknown;
  onUserLabelChange?: (value: string) => void;
  open?: boolean;
  userLabel?: string;
};

export function SettingsDialog({
  currentAgentId = "",
  environmentItems = [],
  onClose,
  onRefreshEnvironment,
  onUserLabelChange,
  open = false,
  userLabel = "",
}: SettingsDialogProps) {
  const { messages } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsDialogSection>("profile");

  const {
    handleLoadLalaClawUpdate,
    handleRunLalaClawUpdate,
    lalaclawUpdateBusy,
    lalaclawUpdateError,
    lalaclawUpdateLoading,
    lalaclawUpdateState,
  } = useOpenClawInspector({
    activeTab: "settings",
    currentAgentId,
    environmentItems,
    messages,
    onRefreshEnvironment,
  });

  const metadataItems = useMemo(
    () => environmentItems.filter((item) => isLalaClawEnvironmentItem(item)),
    [environmentItems],
  );
  const resolvedUserLabel = String(userLabel || "").trim() || messages.chat.userFallbackName;

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveSection("profile");
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const sections = [
    {
      key: "profile" as const,
      icon: CircleUserRound,
      label: messages.settingsDialog.sections.profile,
    },
    {
      key: "about" as const,
      icon: Info,
      label: messages.settingsDialog.sections.about,
    },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 z-[140] bg-background/56 backdrop-blur-[4px]" onClick={() => onClose?.()} />
      <div className="fixed inset-0 z-[141] flex items-center justify-center px-4 py-6">
        <Card
          role="dialog"
          aria-modal="true"
          aria-label={messages.settingsDialog.title}
          className="flex h-[min(44rem,calc(100vh-3rem))] w-full max-w-[56rem] min-h-0 flex-col overflow-hidden rounded-[1.75rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="border-b border-border/70 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg leading-7">{messages.settingsDialog.title}</CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">
                  {messages.settingsDialog.description}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={messages.settingsDialog.close}
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => onClose?.()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 px-0 py-0">
            <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[12rem_minmax(0,1fr)]">
              <aside className="border-b border-border/70 bg-muted/15 px-3 py-3 md:border-b-0 md:border-r md:px-3.5 md:py-4">
                <nav className="flex gap-2 md:flex-col" aria-label={messages.settingsDialog.title}>
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const active = section.key === activeSection;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setActiveSection(section.key)}
                        className={cn(
                          "inline-flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          active
                            ? "bg-[#1677eb] text-white shadow-sm"
                            : "text-foreground/80 hover:bg-accent/70 hover:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{section.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </aside>
              <div className="min-h-0 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
                {activeSection === "profile" ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-base font-semibold text-foreground">{messages.settingsDialog.profile.title}</div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        {messages.settingsDialog.profile.description}
                      </div>
                    </div>
                    <div className="rounded-[1.5rem] border border-border/70 bg-card/70 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      <label className="block">
                        <div className="text-sm font-medium text-foreground">{messages.chat.userLabel}</div>
                        <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{messages.chat.userLabelTooltip}</div>
                        <input
                          type="text"
                          aria-label={messages.chat.userLabel}
                          className="mt-3 h-10 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          placeholder={messages.chat.userLabelPlaceholder}
                          value={userLabel}
                          onChange={(event) => onUserLabelChange?.(event.target.value)}
                        />
                      </label>
                      <div className="mt-4 rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          {messages.settingsDialog.profile.previewLabel}
                        </div>
                        <div className="mt-1 text-sm font-medium text-foreground">{resolvedUserLabel}</div>
                        <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                          {messages.settingsDialog.profile.nameHint}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="text-base font-semibold text-foreground">{messages.settingsDialog.about.title}</div>
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">
                        {messages.settingsDialog.about.description}
                      </div>
                    </div>
                    <LalaClawPanel
                      busy={lalaclawUpdateBusy || Boolean(lalaclawUpdateState?.job?.active)}
                      error={lalaclawUpdateError}
                      loading={lalaclawUpdateLoading}
                      messages={messages}
                      metadataItems={metadataItems}
                      onReload={handleLoadLalaClawUpdate}
                      onRunUpdate={handleRunLalaClawUpdate}
                      showTitle={false}
                      state={lalaclawUpdateState}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>,
    document.body,
  );
}
