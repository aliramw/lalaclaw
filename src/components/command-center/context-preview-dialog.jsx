import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

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

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        if (part.type === "text" || part.type === "input_text") {
          return part.text || "";
        }
        if (part.type === "image_url" || part.type === "image") {
          return "[image]";
        }
        if (part.type === "tool_use") {
          return `[tool_use: ${part.name || "unknown"}]`;
        }
        if (part.type === "tool_result") {
          return `[tool_result: ${part.tool_use_id || ""}]`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return JSON.stringify(content, null, 2);
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

function MessageCard({ intlLocale, message }) {
  const { messages } = useI18n();
  const contextMessages = messages.inspector.contextPreview;
  const role = message.role || "unknown";
  const text = extractTextContent(message.content);
  const timestamp = message.timestamp || message.ts;
  const maxPreviewChars = 2000;
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > maxPreviewChars;
  const displayText = expanded ? text : text.slice(0, maxPreviewChars);
  const roleLabel = contextMessages.roles?.[role] || contextMessages.roles?.unknown || role;
  const inputTokens = message.usage?.input_tokens ?? message.usage?.prompt_tokens ?? "?";
  const outputTokens = message.usage?.output_tokens ?? message.usage?.completion_tokens ?? "?";

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={roleBadgeVariant(role)} className="px-2 py-0.5 text-[11px] leading-5">
          {roleLabel}
        </Badge>
        {timestamp ? (
          <span className="text-[11px] text-muted-foreground">{formatTimestamp(timestamp, intlLocale)}</span>
        ) : null}
        {message.usage ? (
          <span className="text-[11px] text-muted-foreground">
            {contextMessages.tokenUsage}: {inputTokens}/{outputTokens}
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

  const messageList = data?.messages || [];

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[85vh] w-full max-w-[52rem] flex-col rounded-2xl border border-border/80 bg-card shadow-2xl"
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

        <Separator className="mx-5 mt-4 sm:mx-6" />

        <div className="min-h-0 flex-1 overflow-hidden p-5 pt-3 sm:p-6 sm:pt-3">
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
            <ScrollArea className="h-full max-h-[calc(85vh-14rem)]" viewportClassName="min-w-0">
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
