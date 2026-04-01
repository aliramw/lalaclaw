import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";

import { Badge } from "@/components/ui/badge";
import { getLocalizedStatusLabel, normalizeStatusKey } from "@/features/session/status-display";
import { copyTextToClipboard } from "@/components/command-center/clipboard-utils";
import { Prism, usePrismLanguage } from "@/lib/prism-languages";
import { cn } from "@/lib/utils";

const darkToolIoTheme = themes.dracula;
const lightToolIoTheme = themes.vsLight;

type ToolCallTimelineLabels = {
  collapse: string;
  expand: string;
  input: string;
  noOutput: string;
  none: string;
  output: string;
};

type ToolCopyLabels = {
  copy: string;
  copied: string;
};

type ToolIoCodeBlockProps = {
  emptyText?: string;
  label?: string;
  copyLabels: ToolCopyLabels;
  resolvedTheme?: "light" | "dark";
  value?: unknown;
};

type ToolCallCardProps = {
  defaultOpen?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  labels: ToolCallTimelineLabels;
  copyLabels: ToolCopyLabels;
  messages: any;
  resolvedTheme?: "light" | "dark";
  tool: Record<string, any>;
};

type ToolCallTimelineProps = {
  labels: ToolCallTimelineLabels;
  copyLabels: ToolCopyLabels;
  defaultOpen?: boolean;
  messages: any;
  resolvedTheme?: "light" | "dark";
  tools?: Record<string, any>[];
};

function normalizeToolIoValue(value: unknown = "") {
  return String(value ?? "").trim();
}

function resolveToolOutputValue(tool: Record<string, any> = {}) {
  const output = tool.output;
  if (output != null && String(output).length) {
    return output;
  }
  return tool.detail;
}

function getToolStatusBadgeProps(normalizedStatus = "", resolvedTheme: "light" | "dark" = "light") {
  if (normalizedStatus === "completed" || normalizedStatus === "established") {
    return { variant: "success", className: "" };
  }

  if (normalizedStatus === "running" || normalizedStatus === "dispatching") {
    return {
      variant: "default",
      className: resolvedTheme === "dark"
        ? "border-transparent bg-rose-500/15 text-rose-200"
        : "border-transparent bg-rose-50 text-rose-700",
    };
  }

  if (normalizedStatus === "failed") {
    return {
      variant: "default",
      className: "border-transparent bg-destructive/10 text-destructive",
    };
  }

  return {
    variant: "default",
    className: "border-transparent bg-muted text-muted-foreground",
  };
}

function looksLikeJson(value = "") {
  const trimmed = String(value || "").trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
    || (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function ToolCopyButton({ content = "", labels }: { content?: string; labels: ToolCopyLabels }) {
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
      aria-label={copied ? labels.copied : labels.copy}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ToolIoCodeBlock({ emptyText, label, copyLabels, resolvedTheme = "light", value }: ToolIoCodeBlockProps) {
  const content = String(value || emptyText || "").trim() || String(emptyText || "");
  const language = looksLikeJson(content) ? "json" : "text";
  const toolIoTheme = resolvedTheme === "dark" ? darkToolIoTheme : lightToolIoTheme;
  const highlightedLanguage = usePrismLanguage(language);

  return (
    <div
      className={cn(
        "rounded-lg border",
        resolvedTheme === "dark" ? "border-border bg-background/90" : "border-slate-200 bg-[#fbfcfe]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] font-medium",
          resolvedTheme === "dark" ? "border-border/70 text-muted-foreground" : "border-slate-200 text-slate-500",
        )}
      >
        <span>{label}</span>
        <ToolCopyButton content={content} labels={copyLabels} />
      </div>
      <Highlight prism={Prism} theme={toolIoTheme} code={content} language={highlightedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "tool-io-code overflow-x-auto px-0 py-2 whitespace-pre-wrap",
              resolvedTheme === "dark" ? "text-zinc-50" : "text-slate-800",
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className="min-h-5 px-3">
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export function ToolCallCard({ defaultOpen = true, isFirst = false, isLast = false, labels, copyLabels, messages, resolvedTheme = "light", tool }: ToolCallCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const normalizedStatus = normalizeStatusKey(tool.status);
  const localizedStatus = getLocalizedStatusLabel(tool.status, messages);
  const badgeProps = getToolStatusBadgeProps(normalizedStatus, resolvedTheme);
  const inputValue = tool.input;
  const outputValue = resolveToolOutputValue(tool);
  const shouldMergeIoBlocks =
    Boolean(normalizeToolIoValue(inputValue))
    && normalizeToolIoValue(inputValue) === normalizeToolIoValue(outputValue);
  const executionLabel = String(messages?.inspector?.timeline?.runTitle || "").trim() || labels.input;

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <div className="relative flex justify-center">
        {!isFirst ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-0 h-[0.625rem] w-px bg-border/70" /> : null}
        <div
          aria-hidden="true"
          className={cn(
            "relative mt-[0.625rem] h-2.5 w-2.5 rounded-full border",
            normalizedStatus === "failed"
              ? "border-rose-400/60 bg-rose-400/20"
              : resolvedTheme === "dark"
                ? "border-emerald-400/50 bg-emerald-400/20"
                : "border-emerald-500/50 bg-emerald-500/15",
          )}
        />
        {!isLast ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-[calc(0.625rem+0.625rem)] bottom-0 w-px bg-border/70" /> : null}
      </div>
      <div className={cn("min-w-0 space-y-3", !isLast && "pb-4")}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${tool.name} ${open ? labels.collapse : labels.expand}`}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-muted/20"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium">{tool.name}</div>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </div>
          <Badge variant={badgeProps.variant} className={cn("shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5", badgeProps.className)}>
            {localizedStatus}
          </Badge>
        </button>

        {open ? (
          <div className="space-y-2 text-xs leading-6">
            {shouldMergeIoBlocks ? (
              <ToolIoCodeBlock
                copyLabels={copyLabels}
                label={executionLabel}
                value={outputValue}
                emptyText={labels.none}
                resolvedTheme={resolvedTheme}
              />
            ) : (
              <>
                <ToolIoCodeBlock copyLabels={copyLabels} label={labels.input} value={inputValue} emptyText={labels.none} resolvedTheme={resolvedTheme} />
                <ToolIoCodeBlock copyLabels={copyLabels} label={labels.output} value={outputValue} emptyText={labels.noOutput} resolvedTheme={resolvedTheme} />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ToolCallTimeline({
  copyLabels,
  defaultOpen = true,
  labels,
  messages,
  resolvedTheme = "light",
  tools,
}: ToolCallTimelineProps) {
  if (!tools?.length) {
    return null;
  }

  const orderedTools = tools
    .map((tool, index) => ({ tool, index }))
    .sort((left, right) => {
      const leftTimestamp = Number(left.tool?.timestamp || 0);
      const rightTimestamp = Number(right.tool?.timestamp || 0);
      const leftHasTimestamp = Number.isFinite(leftTimestamp) && leftTimestamp > 0;
      const rightHasTimestamp = Number.isFinite(rightTimestamp) && rightTimestamp > 0;

      if (leftHasTimestamp && rightHasTimestamp && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      if (leftHasTimestamp !== rightHasTimestamp) {
        return rightHasTimestamp ? 1 : -1;
      }

      return left.index - right.index;
    })
    .map(({ tool }) => tool);

  return (
    <div className="space-y-0">
      {orderedTools.map((tool, toolIndex) => (
        <ToolCallCard
          key={tool.id || `${tool.name}-${tool.timestamp}`}
          defaultOpen={defaultOpen}
          isFirst={toolIndex === 0}
          isLast={toolIndex === orderedTools.length - 1}
          labels={labels}
          copyLabels={copyLabels}
          tool={tool}
          messages={messages}
          resolvedTheme={resolvedTheme}
        />
      ))}
    </div>
  );
}
