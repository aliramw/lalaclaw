import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SelectionMenu } from "@/components/command-center/selection-menu";
import { useI18n } from "@/lib/i18n";

const thinkModeOptions = ["off", "minimal", "low", "medium", "high", "xhigh", "adaptive"];

function splitModeLabel(rawLabel = "") {
  const [value, description] = String(rawLabel || "").split(/\s+-\s+/, 2);
  return {
    value: value || rawLabel,
    description: description || value || rawLabel,
  };
}

function SelectStatusPill({
  emptyText,
  getItemDescription,
  getItemLabel,
  items,
  label,
  menuLabel,
  onSelect,
  selectedValue,
  triggerLabel,
  value,
  valueClassName,
  valueStyle,
}) {
  return (
    <SelectionMenu
      label={menuLabel || label}
      triggerLabel={triggerLabel || menuLabel || label}
      items={items}
      value={selectedValue}
      onSelect={onSelect}
      emptyText={emptyText}
      getItemLabel={getItemLabel}
      getItemDescription={getItemDescription}
    >
      <button
        type="button"
        aria-label={triggerLabel || menuLabel || label}
        className="inline-flex h-14 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left transition-[background-color,border-color,box-shadow] hover:bg-accent/40 focus-visible:outline-none focus-visible:border-border focus-visible:bg-accent/30 focus-visible:ring-1 focus-visible:ring-border/70"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <div className={cn("truncate text-sm font-semibold", valueClassName)} style={valueStyle}>
            {value}
          </div>
        </div>
        <div className="shrink-0">
          <DropdownIcon />
        </div>
      </button>
    </SelectionMenu>
  );
}

function StatusPill({ label, value, action, valueClassName, valueStyle, children }) {
  return (
    <div className="inline-flex h-14 min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={cn("truncate text-sm font-semibold", valueClassName)} style={valueStyle}>
          {value}
        </div>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function MetaChip({ label, value }) {
  if (!value) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
      <span className="uppercase tracking-[0.12em]">{label}</span>
      <span className="max-w-[28rem] truncate text-foreground/80">{value}</span>
    </div>
  );
}

function formatUpdatedBadge(updatedLabel, updatedAt, intlLocale, messages) {
  const timestamp = Number(updatedAt) || 0;
  if (timestamp > 0) {
    const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
    const absoluteSeconds = Math.abs(diffSeconds);

    if (absoluteSeconds < 45) {
      return messages.common.justNow;
    }

    if (absoluteSeconds < 3600) {
      return new Intl.RelativeTimeFormat(intlLocale, { numeric: "always" }).format(
        Math.round(diffSeconds / 60),
        "minute",
      );
    }

    if (absoluteSeconds < 86400) {
      return new Intl.RelativeTimeFormat(intlLocale, { numeric: "always" }).format(
        Math.round(diffSeconds / 3600),
        "hour",
      );
    }

    if (absoluteSeconds < 604800) {
      return new Intl.RelativeTimeFormat(intlLocale, { numeric: "always" }).format(
        Math.round(diffSeconds / 86400),
        "day",
      );
    }

    return new Intl.DateTimeFormat(intlLocale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }

  const normalized = String(updatedLabel || "").trim();
  if (!normalized) {
    return messages.common.noUpdates;
  }

  if (/^(updated\s+)?just now$/i.test(normalized) || normalized === "刚刚" || normalized === "刚刚更新") {
    return messages.common.justNow;
  }

  const minuteMatch = normalized.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)\s+ago$/i) || normalized.match(/^(\d+)\s*分钟前$/);
  if (minuteMatch) {
    return new Intl.RelativeTimeFormat(intlLocale, { numeric: "always" }).format(-Number(minuteMatch[1]), "minute");
  }

  const hourMatch = normalized.match(/^(\d+)\s*(?:h|hr|hrs|hour|hours)\s+ago$/i) || normalized.match(/^(\d+)\s*小时前$/);
  if (hourMatch) {
    return new Intl.RelativeTimeFormat(intlLocale, { numeric: "always" }).format(-Number(hourMatch[1]), "hour");
  }

  return normalized;
}

function ThemeToggle({ onChange, resolvedTheme, value }) {
  const { messages } = useI18n();
  const options = [
    { id: "system", icon: Monitor, label: messages.theme.system, shortcutLabel: messages.theme.shortcuts.system },
    { id: "light", icon: Sun, label: messages.theme.light, shortcutLabel: messages.theme.shortcuts.light },
    { id: "dark", icon: Moon, label: messages.theme.dark, shortcutLabel: messages.theme.shortcuts.dark },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border p-0.5",
        resolvedTheme === "light"
          ? "border-slate-200 bg-slate-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
          : "border-border/70 bg-background/90",
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <Tooltip key={option.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(option.id)}
                aria-label={option.label}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-[background-color,color,box-shadow,border-color] duration-200",
                  active
                    ? resolvedTheme === "light"
                      ? "border-transparent bg-white text-[#0f6fd6] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_16px_rgba(15,111,214,0.12)]"
                      : "border-sky-400/30 bg-sky-400/10 text-sky-300"
                    : resolvedTheme === "light"
                      ? "border-transparent text-slate-500 hover:bg-white/80 hover:text-slate-700"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="px-2.5 py-2">
              <div className="space-y-0.5">
                <div>{option.label}</div>
                <div className="text-[11px] text-background/70">{option.shortcutLabel}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function LanguageToggle() {
  const { locale, localeOptions, messages, setLocale } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={messages.locale.switchLabel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          <Languages className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{messages.locale.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {localeOptions.map((option) => (
          <DropdownMenuCheckboxItem key={option.value} checked={option.value === locale} onCheckedChange={() => setLocale(option.value)}>
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SessionOverview({
  availableAgents,
  availableModels,
  fastMode,
  formatCompactK,
  model,
  onAgentChange,
  onFastModeChange,
  onModelChange,
  onThinkModeChange,
  onThemeChange,
  resolvedTheme,
  session,
  theme,
}) {
  const { intlLocale, messages } = useI18n();
  const thinkModeLabels = messages.thinkModes;
  const updatedBadgeLabel = formatUpdatedBadge(session.updatedLabel, session.updatedAt, intlLocale, messages);
  const getThinkModeLabel = (mode) => splitModeLabel(thinkModeLabels[mode] || mode).value;
  const getThinkModeDescription = (mode) => splitModeLabel(thinkModeLabels[mode] || mode).description;
  const isThinkModeEnabled = (session.thinkMode || "off") !== "off";
  const displayedModel = model || session.selectedModel || session.model || messages.common.unknown;

  return (
    <section>
      <Card className="overflow-hidden">
        <CardContent className="space-y-1.5 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-2">
                <div className="mr-1 inline-flex h-14 min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                  <h1 className="truncate text-sm font-semibold tracking-tight">{messages.app.title}</h1>
                  <span className="truncate text-xs text-muted-foreground">{messages.app.subtitle}</span>
                </div>

                <SelectStatusPill
                  label={messages.sessionOverview.labels.agent}
                  value={session.agentId || "main"}
                  items={availableAgents}
                  onSelect={onAgentChange}
                  selectedValue={session.agentId}
                  emptyText={messages.sessionOverview.menus.noAgents}
                  menuLabel={messages.sessionOverview.menus.switchAgent}
                />

                <SelectStatusPill
                  label={messages.sessionOverview.labels.model}
                  value={displayedModel}
                  items={availableModels}
                  onSelect={onModelChange}
                  selectedValue={displayedModel}
                  emptyText={messages.sessionOverview.menus.noModels}
                  menuLabel={messages.sessionOverview.menus.switchModel}
                />

                <button
                  type="button"
                  aria-pressed={fastMode}
                  title={fastMode ? messages.sessionOverview.fastMode.disableTitle : messages.sessionOverview.fastMode.enableTitle}
                  onClick={() => onFastModeChange(!fastMode)}
                  className="inline-flex h-14 min-w-[7.5rem] cursor-pointer items-center gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{messages.sessionOverview.labels.fastMode}</div>
                    <div
                      className={cn("text-sm font-semibold", fastMode && "dark:text-emerald-400")}
                      style={fastMode && resolvedTheme === "light" ? { color: "#009559" } : undefined}
                    >
                      {fastMode ? messages.sessionOverview.fastMode.on : messages.sessionOverview.fastMode.off}
                    </div>
                  </div>
                </button>

                <SelectStatusPill
                  label={messages.sessionOverview.labels.thinkMode}
                  value={getThinkModeDescription(session.thinkMode || "off")}
                  valueClassName={cn(isThinkModeEnabled && "dark:text-emerald-400")}
                  valueStyle={isThinkModeEnabled && resolvedTheme === "light" ? { color: "#009559" } : undefined}
                  items={thinkModeOptions}
                  onSelect={onThinkModeChange}
                  selectedValue={session.thinkMode || "off"}
                  emptyText={messages.sessionOverview.menus.noThinkModes}
                  getItemLabel={getThinkModeLabel}
                  getItemDescription={getThinkModeDescription}
                  menuLabel={messages.sessionOverview.menus.switchThinkMode}
                />

                <StatusPill label={messages.sessionOverview.labels.context} value={`${formatCompactK(session.contextUsed)} / ${formatCompactK(session.contextMax)}`} />

                <StatusPill label={messages.sessionOverview.labels.queue} value={session.queue || messages.common.none}>
                  <Badge variant="default">{updatedBadgeLabel}</Badge>
                </StatusPill>
              </div>
            </div>

            <div className="shrink-0 pt-1">
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <ThemeToggle value={theme} resolvedTheme={resolvedTheme} onChange={onThemeChange} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              <MetaChip label={messages.sessionOverview.labels.auth} value={session.auth} />
              <MetaChip label={messages.sessionOverview.labels.runtime} value={session.runtime} />
              <MetaChip label={messages.sessionOverview.labels.time} value={session.time} />
              <MetaChip label={messages.sessionOverview.labels.session} value={session.sessionKey} />
              <MetaChip label={messages.sessionOverview.labels.mode} value={session.mode === "openclaw" ? messages.common.liveGateway : messages.common.mockMode} />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
