import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { copyTextToClipboard } from "@/components/command-center/clipboard-utils";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

import { getInspectorItemKey } from "@/components/command-center/inspector-panel-utils";

const ScrollAreaSurface: any = ScrollArea;
const ButtonSurface: any = Button;
const CardSurface: any = Card;
const CardContentSurface: any = CardContent;

type PanelEmptyProps = {
  compact?: boolean;
  text?: ReactNode;
};

type InspectorHintProps = {
  text?: ReactNode;
};

type TabCountBadgeProps = {
  active?: boolean;
  count?: number;
};

type DataListProps<TItem = any> = {
  empty?: ReactNode;
  getItemActionLabel?: (item: TItem) => string;
  headerAction?: ReactNode;
  hint?: ReactNode;
  items?: TItem[];
  onSelect?: (item: TItem) => void;
  render: (item: TItem) => ReactNode;
};

type TimelineDetailCardProps = {
  children?: ReactNode;
  emptyText?: ReactNode;
  title?: ReactNode;
};

type CopyButtonProps = {
  content?: string;
};

type EnvironmentSectionCardProps = {
  children?: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  label?: ReactNode;
  messages: any;
  wrapContent?: boolean;
};

type FileGroupSectionProps = {
  action?: ReactNode;
  children?: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  label?: ReactNode;
  messages: any;
  onToggle?: (open: boolean) => void;
  spacingClassName?: string;
};

type FileFilterInputProps = {
  filterInput?: string;
  messages: {
    clear: string;
    label: string;
    placeholder: string;
  };
  onChange: (value: string) => void;
  onClear: () => void;
};

type SelectOption = {
  label?: string;
  value?: string;
};

type OpenClawOnboardingSelectFieldProps = {
  ariaLabel?: string;
  busy?: boolean;
  description?: string;
  disabled?: boolean;
  fixedHint?: string;
  label?: string;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  value?: string;
};

type OpenClawRemoteNoticeProps = {
  messages: any;
  onOpenGuide?: () => void;
  remoteGuard?: Record<string, any> | null;
};

export function PanelEmpty({ compact = false, text }: PanelEmptyProps) {
  return (
    <div className={cn(compact && "rounded-[16px]")}>
      <div className={cn("flex items-center justify-center text-center text-sm text-muted-foreground", compact ? "px-5 py-5" : "py-8")}>
        {text}
      </div>
    </div>
  );
}

export function InspectorHint({ text }: InspectorHintProps) {
  if (!text) {
    return null;
  }

  return (
    <p className="pr-6 text-[11px] leading-5 text-muted-foreground/80">
      {text}
    </p>
  );
}

export function TabCountBadge({ count, active = false }: TabCountBadgeProps) {
  if (!count) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors",
        active
          ? "border-white/12 bg-black/14 text-white"
          : "border-[var(--inspector-tab-count-border)] bg-[var(--inspector-tab-count-bg)] text-[var(--inspector-tab-count-fg)]",
      )}
    >
      {count}
    </span>
  );
}

export function DataList<TItem = any>({
  empty,
  getItemActionLabel,
  headerAction,
  hint,
  items = [],
  onSelect,
  render,
}: DataListProps<TItem>) {
  return (
    <ScrollAreaSurface className="min-h-0 flex-1">
      <div className="space-y-2 py-1 pr-4">
        {headerAction ? (
          <div className="flex items-start justify-between gap-2">
            <InspectorHint text={hint} />
            {headerAction}
          </div>
        ) : (
          <InspectorHint text={hint} />
        )}
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item, index) => (
              <CardSurface key={getInspectorItemKey(item as any, index)}>
                <CardContentSurface className={cn(onSelect ? "p-0" : "py-4")}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-label={getItemActionLabel?.(item) || (item as any)?.title || (item as any)?.label || "item"}
                      className="block w-full rounded-[inherit] px-6 py-4 text-left transition hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {render(item)}
                    </button>
                  ) : render(item)}
                </CardContentSurface>
              </CardSurface>
            ))}
          </div>
        ) : <PanelEmpty text={empty} />}
      </div>
    </ScrollAreaSurface>
  );
}

export function TimelineDetailCard({ title, children, emptyText }: TimelineDetailCardProps) {
  return (
    <section className="space-y-1.5">
      <div className="text-left text-xs font-medium text-muted-foreground">{title}</div>
      {children || <PanelEmpty text={emptyText} compact />}
    </section>
  );
}

export function CopyCodeButton({ content = "" }: CopyButtonProps) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/75 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function HoverCopyValueButton({ content = "" }: CopyButtonProps) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function EnvironmentSectionCard({
  children,
  count = 0,
  defaultOpen = false,
  forceOpen = false,
  label,
  messages,
  wrapContent = true,
}: EnvironmentSectionCardProps) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const shouldShowCount = Number.isFinite(count) && count > 0;

  useEffect(() => {
    if (forceOpen) {
      setCollapsed(false);
    }
  }, [forceOpen]);

  return (
    <section className="space-y-1.5">
      <div className="px-1 py-0.5">
        <button
          type="button"
          className={cn(
            "grid min-h-9 w-full items-center gap-2 text-left",
            shouldShowCount ? "grid-cols-[1rem_minmax(0,1fr)_auto]" : "grid-cols-[1rem_minmax(0,1fr)]",
          )}
          aria-expanded={!collapsed}
          aria-label={`${label} ${collapsed ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
          onClick={() => {
            setCollapsed((current) => !current);
          }}
        >
          <span
            aria-hidden="true"
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsed ? "-rotate-90" : "rotate-0")}
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-full w-full">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0 text-[13px] font-semibold leading-5 text-foreground">{label}</div>
          {shouldShowCount ? (
            <Badge variant="secondary" className="h-6 min-w-6 justify-center rounded-full border border-border/70 bg-background px-1.5 py-0 text-[10px] font-medium text-foreground">
              {count}
            </Badge>
          ) : null}
        </button>
      </div>
      {!collapsed ? (
        wrapContent ? (
          <CardSurface className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContentSurface className="space-y-2 px-3.5 py-3">
              {children}
            </CardContentSurface>
          </CardSurface>
        ) : (
          <div className="space-y-2">{children}</div>
        )
      ) : null}
    </section>
  );
}

export function FileGroupSection({
  action,
  children,
  count = 0,
  defaultOpen = true,
  label,
  messages,
  onToggle,
  spacingClassName = "space-y-2",
}: FileGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  return (
    <section className={cn(spacingClassName)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="grid min-w-0 flex-1 grid-cols-[1rem_auto_auto_1fr] items-center gap-2 rounded-md py-0.5 text-left transition hover:bg-muted/20"
          aria-expanded={!collapsed}
          aria-label={`${label} ${collapsed ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
          onClick={() => setCollapsed((current) => {
            const nextCollapsed = !current;
            onToggle?.(!nextCollapsed);
            return nextCollapsed;
          })}
        >
          <span
            aria-hidden="true"
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsed ? "-rotate-90" : "rotate-0")}
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-full w-full">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
          <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
            {count}
          </Badge>
        </button>
        {action ? <div className="min-w-0 w-[10.5rem] max-w-[44%] shrink">{action}</div> : null}
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

export function FileFilterInput({ filterInput = "", messages, onChange, onClear }: FileFilterInputProps) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{messages.label}</span>
      <input
        type="text"
        value={filterInput}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={messages.placeholder}
        aria-label={messages.label}
        className="flex h-7 w-full rounded-md border border-input bg-background px-2.5 py-1 pr-8 text-[12px] leading-none shadow-xs transition-[color,box-shadow] outline-none placeholder:text-[12px] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {filterInput ? (
        <button
          type="button"
          aria-label={messages.clear}
          onClick={onClear}
          className="absolute inset-y-0 right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className="text-sm leading-none">x</span>
        </button>
      ) : null}
    </label>
  );
}

export function OpenClawOnboardingSelectField({
  ariaLabel = "",
  busy = false,
  description = "",
  disabled = false,
  fixedHint = "",
  label = "",
  onChange,
  options = [],
  value = "",
}: OpenClawOnboardingSelectFieldProps) {
  const normalizedOptions = Array.isArray(options) ? options.filter((option) => option && option.value) : [];
  const isFixed = normalizedOptions.length <= 1;
  const resolvedLabel = normalizedOptions.find((option) => option.value === value)?.label || normalizedOptions[0]?.label || value || "";

  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-[12px] leading-5 text-muted-foreground">{description}</div>
      {isFixed ? (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
          <div className="text-sm text-foreground">{resolvedLabel}</div>
          {fixedHint ? (
            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{fixedHint}</div>
          ) : null}
        </div>
      ) : (
        <div className="relative mt-3">
          <select
            aria-label={ariaLabel || label}
            className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
            disabled={disabled || busy}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
          >
            {normalizedOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
            <span aria-hidden="true" className="h-4 w-4">
              <svg viewBox="0 0 16 16" fill="none" className="h-full w-full">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

export function OpenClawRemoteNotice({ messages, onOpenGuide, remoteGuard = null }: OpenClawRemoteNoticeProps) {
  if (!remoteGuard?.blocked) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/6 px-3 py-2.5">
      <div className="text-[12px] font-medium text-foreground">{messages.inspector.remoteOperations.blockedTitle}</div>
      <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{messages.inspector.remoteOperations.blockedDescription}</div>
      <div className="mt-2">
        <ButtonSurface
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-2.5 text-[11px]"
          onClick={() => onOpenGuide?.()}
        >
          <ScrollText className="mr-1 h-3.5 w-3.5" />
          {messages.inspector.remoteOperations.openGuide}
        </ButtonSurface>
      </div>
    </div>
  );
}
