import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

type ContextPreviewUsageLike = {
  completion?: unknown;
  completion_tokens?: unknown;
  input?: unknown;
  input_tokens?: unknown;
  output?: unknown;
  output_tokens?: unknown;
  prompt?: unknown;
  prompt_tokens?: unknown;
  total?: unknown;
  total_tokens?: unknown;
};

type ContextPreviewMessageLike = {
  arguments?: string;
  author?: { role?: string };
  content?: unknown;
  input_text?: string;
  json?: unknown;
  message?: ContextPreviewMessageLike;
  output?: string;
  output_text?: string;
  partialJson?: string;
  result?: unknown;
  role?: string;
  sender?: { role?: string };
  summary?: unknown[];
  text?: string;
  timestamp?: string | number | null;
  ts?: string | number | null;
  type?: string;
  usage?: ContextPreviewUsageLike | null;
};

type ContextPreviewPartLike = Record<string, unknown> & {
  arguments?: string;
  content?: unknown;
  input_text?: string;
  json?: unknown;
  name?: string;
  output?: string;
  output_text?: string;
  partialJson?: string;
  result?: unknown;
  summary?: unknown[];
  text?: string;
  type?: string;
};

type NormalizedUsage = {
  input: unknown;
  output: unknown;
  total: unknown;
};

type NormalizedContextMessage = {
  role: string;
  text: string;
  timestamp: string | number | null;
  unknownRoleHint: string;
  usage: NormalizedUsage | null;
};

type ContextPreviewResponse = {
  error?: string;
  fastMode?: boolean;
  messages?: ContextPreviewMessageLike[];
  ok?: boolean;
  sessionKey?: string;
  thinkingLevel?: string;
};

type ContextPreviewDialogProps = {
  onClose?: () => void;
  open?: boolean;
  sessionUser?: string;
};

const ContextButton = Button as any;

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

function extractTextFromPart(part: unknown): string {
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

  const partRecord = part as ContextPreviewPartLike;

  if (typeof partRecord.text === "string" && partRecord.text.trim()) {
    return partRecord.text;
  }
  if (typeof partRecord.output_text === "string" && partRecord.output_text.trim()) {
    return partRecord.output_text;
  }
  if (typeof partRecord.input_text === "string" && partRecord.input_text.trim()) {
    return partRecord.input_text;
  }
  if (typeof partRecord.content === "string" && partRecord.content.trim()) {
    return partRecord.content;
  }
  if (Array.isArray(partRecord.content) && partRecord.content.length) {
    return extractTextFromPart(partRecord.content);
  }
  if (Array.isArray(partRecord.summary) && partRecord.summary.length) {
    return extractTextFromPart(partRecord.summary);
  }
  if (typeof partRecord.arguments === "string" && partRecord.arguments.trim()) {
    return partRecord.arguments;
  }
  if (typeof partRecord.partialJson === "string" && partRecord.partialJson.trim()) {
    return partRecord.partialJson;
  }
  if (typeof partRecord.output === "string" && partRecord.output.trim()) {
    return partRecord.output;
  }
  if (partRecord.json != null) {
    return stringifyForPreview(partRecord.json);
  }

  const type = String(partRecord.type || "").trim().toLowerCase();
  if (type === "image_url" || type === "image") {
    return "[image]";
  }
  if (type === "tool_use" || type === "toolcall") {
    return `[tool_use: ${partRecord.name || "unknown"}]`;
  }
  if (type === "tool_result" || type === "toolresult") {
    return extractTextFromPart(partRecord.result ?? partRecord.content ?? partRecord.output ?? partRecord.text);
  }

  return stringifyForPreview(partRecord);
}

function extractTextContent(content: unknown) {
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

function normalizeMessageRole(rawMessage: ContextPreviewMessageLike | null | undefined) {
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
    if (explicitRole === "tooluse" || explicitRole === "tool_use") {
      return "toolUse";
    }
    if (explicitRole === "toolresult" || explicitRole === "tool_result") {
      return "toolResult";
    }
    if (explicitRole === "developer") {
      return "developer";
    }
    if (["system", "assistant", "user"].includes(explicitRole)) {
      return explicitRole;
    }
  }

  const type = String(message?.type || rawMessage?.type || "").trim().toLowerCase();
  if (type === "tool_result") {
    return "toolResult";
  }
  if (type === "tool_use") {
    return "toolUse";
  }
  if (["tool", "tool_use", "function"].includes(type)) {
    return "tool";
  }
  if (type === "developer") {
    return "developer";
  }

  return "unknown";
}

function describeUnknownRole(rawMessage: ContextPreviewMessageLike | null | undefined) {
  const message = rawMessage?.message && typeof rawMessage.message === "object"
    ? rawMessage.message
    : rawMessage;
  const roleHint = String(
    message?.role
      || message?.author?.role
      || message?.sender?.role
      || rawMessage?.role
      || rawMessage?.author?.role
      || rawMessage?.sender?.role
      || "",
  ).trim();
  if (roleHint) {
    return roleHint;
  }

  const typeHint = String(message?.type || rawMessage?.type || "").trim();
  if (typeHint) {
    return `type:${typeHint}`;
  }

  return "";
}

function normalizeMessageUsage(rawMessage: ContextPreviewMessageLike | null | undefined): NormalizedUsage | null {
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

function formatUsageSummary(usage: NormalizedUsage | null, intlLocale) {
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

function normalizeContextMessage(rawMessage: ContextPreviewMessageLike): NormalizedContextMessage {
  const message = rawMessage?.message && typeof rawMessage.message === "object"
    ? rawMessage.message
    : rawMessage;
  const role = normalizeMessageRole(rawMessage);
  const unknownRoleHint = role === "unknown" ? describeUnknownRole(rawMessage) : "";
  const usage = normalizeMessageUsage(rawMessage);
  const text = extractTextContent(message?.content ?? rawMessage?.content ?? "");
  const timestamp = message?.timestamp ?? rawMessage?.timestamp ?? rawMessage?.ts ?? message?.ts ?? null;

  return {
    role,
    text,
    timestamp,
    unknownRoleHint,
    usage,
  };
}

function MessageCard({ intlLocale, message }: { intlLocale: string; message: NormalizedContextMessage }) {
  const { messages } = useI18n();
  const contextMessages = messages.inspector.contextPreview;
  const role = message.role || "unknown";
  const text = message.text || "";
  const timestamp = message.timestamp;
  const maxPreviewChars = 2000;
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > maxPreviewChars;
  const displayText = expanded ? text : text.slice(0, maxPreviewChars);
  const defaultUnknownRoleLabel = contextMessages.unknownRoleLabel || contextMessages.roles?.unknown || role;
  const roleLabel = role === "unknown" && message.unknownRoleHint
    ? `${defaultUnknownRoleLabel} (${message.unknownRoleHint})`
    : (contextMessages.roles?.[role] || defaultUnknownRoleLabel || role);
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
        <ContextButton
          variant="ghost"
          size="sm"
          className="mt-1 h-6 px-1 text-[11px] text-muted-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? contextMessages.collapse : contextMessages.showAll(text.length)}
        </ContextButton>
      ) : null}
    </div>
  );
}

export function ContextPreviewDialog({ onClose, open = false, sessionUser = "" }: ContextPreviewDialogProps) {
  const { intlLocale, messages } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ContextPreviewResponse | null>(null);
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
      const json = await response.json() as ContextPreviewResponse;
      if (!json.ok) {
        throw new Error(json.error || contextMessages.unknownError);
      }
      setData(json);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? (fetchError.message || contextMessages.error) : contextMessages.error);
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

    const handleKeyDown = (event: KeyboardEvent) => {
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
          <ContextButton
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={onClose}
            aria-label={contextMessages.close}
          >
            <X className="h-4 w-4" />
          </ContextButton>
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 pt-4 sm:p-6 sm:pt-4">
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
            <div
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1"
              data-testid="context-preview-scroll-area"
            >
              <div className="space-y-2 pr-4">
                {messageList.map((message, index) => (
                  <MessageCard key={`${message.role}-${message.timestamp || index}`} intlLocale={intlLocale} message={message} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
