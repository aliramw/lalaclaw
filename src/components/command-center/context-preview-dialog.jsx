import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

function formatCompactNumber(value, intlLocale) {
  if (value == null || value === "") {
    return "";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  return new Intl.NumberFormat(intlLocale).format(numeric);
}

function formatTimestamp(value, intlLocale) {
  if (!value) {
    return "";
  }

  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(intlLocale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function stringifyForPreview(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractTextFromPart(part) {
  if (part == null) {
    return "";
  }

  if (typeof part === "string") {
    return part;
  }

  if (typeof part === "number" || typeof part === "boolean") {
    return String(part);
  }

  if (Array.isArray(part)) {
    const segments = part.map(extractTextFromPart).filter(Boolean);
    return segments.join("\n");
  }

  if (typeof part !== "object") {
    return "";
  }

  if (typeof part.text === "string" && part.text.trim()) {
    return part.text;
  }
  if (typeof part.output_text === "string" && part.output_text.trim()) {
    return part.output_text;
  }
  if (typeof part.input_text === "string" && part.input_text.trim()) {
    return part.input_text;
  }
  if (typeof part.content === "string" && part.content.trim()) {
    return part.content;
  }
  if (Array.isArray(part.content) && part.content.length) {
    return extractTextFromPart(part.content);
  }
  if (Array.isArray(part.summary) && part.summary.length) {
    return extractTextFromPart(part.summary);
  }
  if (typeof part.arguments === "string" && part.arguments.trim()) {
    return part.arguments;
  }
  if (typeof part.partialJson === "string" && part.partialJson.trim()) {
    return part.partialJson;
  }
  if (typeof part.output === "string" && part.output.trim()) {
    return part.output;
  }
  if (part.json != null) {
    return stringifyForPreview(part.json);
  }

  const type = String(part.type || "").trim().toLowerCase();
  if (type === "image_url" || type === "image") {
    return "[image]";
  }
  if (type === "tool_use" || type === "toolcall") {
    return `[tool_use: ${part.name || "unknown"}]`;
  }
  if (type === "tool_result" || type === "toolresult") {
    return extractTextFromPart(part.result ?? part.content ?? part.output ?? part.text);
  }

  return stringifyForPreview(part);
}

function extractTextContent(content) {
  return extractTextFromPart(content).trim();
}

function roleBadgeVariant(role) {
  if (role === "system") {
    return "default";
  }
  if (role === "assistant") {
    return "success";
  }
  if (role === "user") {
    return "active";
  }
  return "default";
}

function normalizeMessageRole(rawMessage) {
  const message = rawMessage?.message && typeof rawMessage.message === "object"
    ? rawMessage.message
    : rawMessage;
  const explicitRole = String(
    message?.role
      || message?.author?.role
      || message?.sender?.role
      || rawMessage?.role
      || rawMessage?.author?.role
      || rawMessage?.sender?.role
      || "",
  ).trim().toLowerCase();

  if (explicitRole) {
    if (explicitRole === "function" || explicitRole === "tool") {
      return "tool";
    }
    if (explicitRole === "developer") {
      return "developer";
    }
    return explicitRole;
  }

  const type = String(message?.type || rawMessage?.type || "").trim().toLowerCase();
  if (["tool", "tool_result", "tool_use", "function"].includes(type)) {
    return "tool";
  }
  if (type === "developer") {
    return "developer";
  }

  return "unknown";
}

function normalizeMessageUsage(rawMessage) {
  const usage = rawMessage?.message?.usage ?? rawMessage?.usage ?? null;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input ?? usage.prompt ?? null;
  const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output ?? usage.completion ?? null;
  const total = usage.total_tokens ?? usage.total ?? null;
  if (input == null && output == null && total == null) {
    return null;
  }

  return { input, output, total };
}

function formatUsageSummary(usage, intlLocale) {
  if (!usage) {
    return "";
  }

  const parts = [];
  const input = formatCompactNumber(usage.input, intlLocale);
  const output = formatCompactNumber(usage.output, intlLocale);
  const total = formatCompactNumber(usage.total, intlLocale);

  if (input) {
    parts.push(`↑${input}`);
  }
  if (output) {
    parts.push(`↓${output}`);
  }

  if (parts.length) {
    return parts.join(" ");
  }

  return total;
}

function normalizeContextMessage(rawMessage) {
  const message = rawMessage?.message && typeof rawMessage.message === "object"
    ? rawMessage.message
    : rawMessage;
  const role = normalizeMessageRole(rawMessage);
  const usage = normalizeMessageUsage(rawMessage);
  const text = extractTextContent(message?.content ?? rawMessage?.content ?? "");
  const timestamp = message?.timestamp ?? rawMessage?.timestamp ?? rawMessage?.ts ?? message?.ts ?? null;

  return {
    role,
    text,
    timestamp,
    usage,
  };
}

function MessageCard({ intlLocale, message }) {
  const { messages } = useI18n();
  const contextMessages = messages.inspector.contextPreview;
  const role = message.role || "unknown";
  const text = message.text || "";
  const timestamp = message.timestamp;
  const maxPreviewChars = 2000;
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > maxPreviewChars;
  const displayText = expanded ? text : text.slice(0, maxPreviewChars);
  const roleLabel = contextMessages.roles?.[role] || contextMessages.roles?.unknown || role;
  const usageSummary = formatUsageSummary(message.usage, intlLocale);

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={roleBadgeVariant(role)} className="px-2 py-0.5 text-[11px] leading-5">
          {roleLabel}
        </Badge>
        {timestamp ? (
          <span className="text-[11px] text-muted-foreground">{formatTimestamp(timestamp, intlLocale)}</span>
        ) : null}
        {usageSummary ? (
          <span className="text-[11px] text-muted-foreground">
            {contextMessages.tokenUsage}: {usageSummary}
          </span>
        ) : null}
      </div>
      <pre className="max-h-[20rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
        {displayText}
        {truncated && !expanded ? "…" : ""}
      </pre>
      {truncated ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-6 px-1 text-[11px] text-muted-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? contextMessages.collapse : contextMessages.showAll(text.length)}
        </Button>
      ) : null}
    </div>
  );
}

export function ContextPreviewDialog({ onClose, open, sessionUser }) {
  const { intlLocale, messages } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const contextMessages = messages.inspector.contextPreview;

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (sessionUser) {
        params.set("sessionUser", sessionUser);
      }
      const response = await apiFetch(`/api/session/context?${params}`);
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || contextMessages.unknownError);
      }
      setData(json);
    } catch (fetchError) {
      setError(fetchError.message || contextMessages.error);
    } finally {
      setLoading(false);
    }
  }, [contextMessages.error, contextMessages.unknownError, sessionUser]);

  useEffect(() => {
    if (open) {
      fetchContext();
    } else {
      setData(null);
      setError("");
    }
  }, [fetchContext, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const messageList = (data?.messages || [])
    .map(normalizeContextMessage)
    .filter((message) => message.text || formatUsageSummary(message.usage, intlLocale));

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[85vh] w-full max-w-[52rem] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold leading-7 text-foreground">
              {contextMessages.title}
            </h2>
            <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
              {contextMessages.description}
            </p>
          </div>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={onClose}
            aria-label={contextMessages.close}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {data ? (
          <div className="mx-5 mt-4 flex flex-wrap gap-3 sm:mx-6">
            {data.sessionKey ? (
              <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{contextMessages.sessionKey}</div>
                <div className="max-w-[20rem] truncate font-mono text-xs text-foreground">{data.sessionKey}</div>
              </div>
            ) : null}
            {data.thinkingLevel ? (
              <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{contextMessages.thinkingLevel}</div>
                <div className="text-xs text-foreground">{data.thinkingLevel}</div>
              </div>
            ) : null}
            {typeof data.fastMode === "boolean" ? (
              <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{contextMessages.fastMode}</div>
                <div className="text-xs text-foreground">
                  {data.fastMode ? contextMessages.fastModeValues.on : contextMessages.fastModeValues.off}
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{contextMessages.messageCount}</div>
              <div className="text-xs text-foreground">{messageList.length}</div>
            </div>
          </div>
        ) : null}

        <div className="px-5 pt-4 sm:px-6">
          <Separator />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 pt-3 sm:p-6 sm:pt-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{contextMessages.loading}</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-destructive">{error}</div>
          ) : messageList.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{contextMessages.empty}</div>
          ) : (
            <ScrollArea
              className="min-h-0 flex-1"
              data-testid="context-preview-scroll-area"
              viewportClassName="h-full min-w-0"
            >
              <div className="space-y-2 pr-4">
                {messageList.map((message, index) => (
                  <MessageCard key={`${message.role}-${message.timestamp || index}`} intlLocale={intlLocale} message={message} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
