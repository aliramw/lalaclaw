import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { cn, formatShortcutForPlatform } from "@/lib/utils";
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

function formatModelLabel(modelId = "") {
  const normalized = String(modelId || "").trim();
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) || normalized;
}

function BlockTooltipContent({ label, value }) {
  return (
    <TooltipContent side="bottom" className="px-2.5 py-2">
      <div className="space-y-0.5">
        <div className="text-[10px] uppercase text-background/70">{label}</div>
        <div className="max-w-[28rem] break-words">{value}</div>
      </div>
    </TooltipContent>
  );
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
  tooltipContent,
  value,
  valueClassName,
  valueStyle,
  resolvedTheme,
}) {
  const isLightTheme = resolvedTheme === "light";
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
      tooltipContent={tooltipContent}
    >
      <button
        type="button"
        aria-label={triggerLabel || menuLabel || label}
        className={cn(
          "inline-flex h-14 min-w-[88px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-1",
          isLightTheme
            ? "border-border/70 bg-white hover:bg-accent/40 focus-visible:border-border focus-visible:bg-accent/30 focus-visible:ring-border/70"
            : "border-border/70 bg-background/80 hover:bg-accent/40 focus-visible:border-border focus-visible:bg-accent/30 focus-visible:ring-border/70",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
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

function StatusPill({ label, value, action, tooltipContent, valueClassName, valueStyle, children, resolvedTheme }) {
  const isLightTheme = resolvedTheme === "light";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex h-14 min-w-[88px] items-center gap-2 rounded-lg border border-border/70 px-3 py-2",
            isLightTheme ? "bg-white" : "bg-background/80",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
            <div className={cn("truncate text-sm font-semibold", valueClassName)} style={valueStyle}>
              {value}
            </div>
          </div>
          {children ? <div className="shrink-0">{children}</div> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </TooltipTrigger>
      {tooltipContent ? <TooltipContent side="bottom">{tooltipContent}</TooltipContent> : <BlockTooltipContent label={label} value={value} />}
    </Tooltip>
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
    {
      id: "system",
      icon: Monitor,
      label: messages.theme.system,
      description: messages.theme.descriptions.system,
      shortcutLabel: formatShortcutForPlatform(messages.theme.shortcuts.system),
    },
    {
      id: "light",
      icon: Sun,
      label: messages.theme.light,
      description: messages.theme.descriptions.light,
      shortcutLabel: formatShortcutForPlatform(messages.theme.shortcuts.light),
    },
    {
      id: "dark",
      icon: Moon,
      label: messages.theme.dark,
      description: messages.theme.descriptions.dark,
      shortcutLabel: formatShortcutForPlatform(messages.theme.shortcuts.dark),
    },
  ];

  return (
    <div
      className={cn(
        "inline-flex h-8 items-center rounded-full border p-0.5",
        resolvedTheme === "light"
          ? "border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
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
                  "inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-full border px-2 transition-[background-color,color,box-shadow,border-color] duration-200",
                  active
                    ? resolvedTheme === "light"
                      ? "border-transparent bg-slate-200 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                      : "border-transparent bg-slate-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : resolvedTheme === "light"
                      ? "border-transparent bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      : "border-transparent bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="px-2.5 py-2">
              <div className="space-y-0.5">
                <div>{option.label}</div>
                <div className="text-[11px] text-background/70">{option.description}</div>
                <div className="text-[11px] text-background/70">{messages.theme.shortcutHint(option.shortcutLabel)}</div>
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
  const activeLocale = localeOptions.find((option) => option.value === locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={messages.locale.switchLabel}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-medium text-foreground">{activeLocale?.label || locale.toUpperCase()}</span>
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
  const isLightTheme = resolvedTheme === "light";
  const selectedModel = model || session.selectedModel || session.model || "";
  const displayedModel = formatModelLabel(selectedModel) || messages.common.unknown;
  return (
    <section className="pt-2.5 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-2">
                <div className="mr-1 inline-flex h-14 min-w-0 items-center gap-2">
                  <span className="flex h-full items-center text-[1.5rem] leading-none" aria-hidden="true">🦞</span>
                  <div className="flex min-w-0 flex-col justify-center">
                    <h1 className="max-w-full truncate text-sm font-semibold leading-[1.1] tracking-tight">LalaClaw.ai</h1>
                    <span className="mt-1 max-w-full truncate text-[11px] leading-4 text-muted-foreground">{messages.app.subtitle}</span>
                  </div>
                </div>

                <SelectStatusPill
                  label={messages.sessionOverview.labels.agent}
                  value={session.agentId || "main"}
                  resolvedTheme={resolvedTheme}
                  items={availableAgents}
                  onSelect={onAgentChange}
                  selectedValue={session.agentId}
                  emptyText={messages.sessionOverview.menus.noAgents}
                  menuLabel={messages.sessionOverview.menus.switchAgent}
                  tooltipContent={messages.sessionOverview.tooltips.switchAgentSession}
                />

                <SelectStatusPill
                  label={messages.sessionOverview.labels.model}
                  value={displayedModel}
                  resolvedTheme={resolvedTheme}
                  items={availableModels}
                  onSelect={onModelChange}
                  selectedValue={selectedModel}
                  emptyText={messages.sessionOverview.menus.noModels}
                  menuLabel={messages.sessionOverview.menus.switchModel}
                  tooltipContent={messages.sessionOverview.tooltips.switchModel}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-pressed={fastMode}
                      title={fastMode ? messages.sessionOverview.fastMode.disableTitle : messages.sessionOverview.fastMode.enableTitle}
                      onClick={() => onFastModeChange(!fastMode)}
                      className={cn(
                        "inline-flex h-14 min-w-[88px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        isLightTheme ? "border-border/70 bg-white hover:bg-accent/40" : "border-border/70 bg-background/80 hover:bg-accent/40",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] font-medium uppercase text-muted-foreground">{messages.sessionOverview.labels.fastMode}</div>
                        <div
                          className={cn("text-sm font-semibold", fastMode && "dark:text-emerald-400")}
                          style={fastMode && resolvedTheme === "light" ? { color: "#009559" } : undefined}
                        >
                          {fastMode ? messages.sessionOverview.fastMode.on : messages.sessionOverview.fastMode.off}
                        </div>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{messages.sessionOverview.tooltips.fastMode}</TooltipContent>
                </Tooltip>

                <SelectStatusPill
                  label={messages.sessionOverview.labels.thinkMode}
                  value={getThinkModeDescription(session.thinkMode || "off")}
                  resolvedTheme={resolvedTheme}
                  valueClassName={cn(isThinkModeEnabled && "dark:text-emerald-400")}
                  valueStyle={isThinkModeEnabled && resolvedTheme === "light" ? { color: "#009559" } : undefined}
                  items={thinkModeOptions}
                  onSelect={onThinkModeChange}
                  selectedValue={session.thinkMode || "off"}
                  emptyText={messages.sessionOverview.menus.noThinkModes}
                  getItemLabel={getThinkModeLabel}
                  getItemDescription={getThinkModeDescription}
                  menuLabel={messages.sessionOverview.menus.switchThinkMode}
                  tooltipContent={messages.sessionOverview.tooltips.thinkMode}
                />

                <StatusPill
                  label={messages.sessionOverview.labels.context}
                  value={`${formatCompactK(session.contextUsed)} / ${formatCompactK(session.contextMax)}`}
                  resolvedTheme={resolvedTheme}
                  tooltipContent={messages.sessionOverview.tooltips.context}
                />

                <StatusPill
                  label={messages.sessionOverview.labels.queue}
                  value={session.queue || messages.common.unknown}
                  resolvedTheme={resolvedTheme}
                  tooltipContent={messages.sessionOverview.tooltips.queue}
                >
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

    </section>
  );
}
