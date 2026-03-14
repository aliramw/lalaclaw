import { Check, Copy, LoaderCircle, Paperclip, RotateCcw, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import { useI18n } from "@/lib/i18n";

const bubbleBaseClassName =
  "min-w-0 transition-[border-color,background-color,box-shadow,color] duration-200";

const bubbleContentClassName = "px-3 py-2.5";

const userBubbleClassName = "ring-0";

const assistantBubbleClassName = "";

const assistantCompactThreshold = 72;

function formatAttachmentSize(size = 0) {
  const numeric = Number(size) || 0;
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

function isImageAttachment(attachment) {
  return attachment?.kind === "image" || /^image\//i.test(attachment?.mimeType || "");
}

function ImageLightbox({ image, onClose }) {
  const { messages } = useI18n();

  useEffect(() => {
    if (!image?.src) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image?.src, onClose]);

  if (!image?.src) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-6" onClick={onClose}>
      <button
        type="button"
        className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
        aria-label={messages.common.closePreview}
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </button>
      <img
        src={image.src}
        alt={image.alt || ""}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function MessageAttachments({ attachments, mode = "message", onPreviewImage }) {
  if (!attachments?.length) {
    return null;
  }

  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter((attachment) => !isImageAttachment(attachment));
  const imageSizeClassName = mode === "composer" ? "h-16 w-16" : "h-[72px] w-[72px]";

  return (
    <div className="space-y-2">
      {imageAttachments.length ? (
        <div className="flex flex-wrap gap-2">
          {imageAttachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              className="overflow-hidden rounded-md border border-border/70 bg-background/80"
              onClick={() => onPreviewImage?.(attachment)}
            >
              <img
                src={attachment.previewUrl || attachment.dataUrl}
                alt={attachment.name}
                className={cn(imageSizeClassName, "object-cover")}
              />
            </button>
          ))}
        </div>
      ) : null}
      {fileAttachments.length ? (
        <div className="grid gap-2">
          {fileAttachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-2 rounded-md border border-border/70 bg-background/75 px-2.5 py-2 text-[11px] leading-4">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-medium">{attachment.name}</div>
                <div className="text-muted-foreground">{formatAttachmentSize(attachment.size)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComposerAttachments({ attachments, onPreviewImage, onRemoveAttachment }) {
  const { messages } = useI18n();

  if (!attachments?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
      <div className="mr-1 text-[10px] text-muted-foreground">{messages.common.attachment}</div>
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="group relative">
            {isImageAttachment(attachment) ? (
              <button
                type="button"
                className="overflow-hidden rounded-sm border border-border/60 bg-background"
                onClick={() => onPreviewImage?.(attachment)}
              >
                <img src={attachment.previewUrl || attachment.dataUrl} alt={attachment.name} className="h-[22px] w-[22px] object-cover" />
              </button>
            ) : (
              <div className="flex w-20 items-center gap-1 rounded-sm border border-border/60 bg-background px-1.5 py-1 text-[9px] leading-3">
                <Paperclip className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{attachment.name}</div>
                  <div className="truncate text-muted-foreground">{formatAttachmentSize(attachment.size)}</div>
                </div>
              </div>
            )}
            <button
              type="button"
              className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
              aria-label={`${messages.common.removeAttachment} ${attachment.name}`}
              onClick={() => onRemoveAttachment?.(attachment.id)}
            >
              <X className="h-2 w-2" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function slugifyHeading(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function stripInlineMarkdown(value = "") {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function extractHeadingOutline(content = "") {
  const seen = new Map();
  return String(content || "")
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
      if (!match) {
        return null;
      }
      const text = stripInlineMarkdown(match[2].replace(/\s+#+\s*$/, ""));
      if (!text) {
        return null;
      }
      const baseSlug = slugifyHeading(text);
      const currentCount = (seen.get(baseSlug) || 0) + 1;
      seen.set(baseSlug, currentCount);
      return {
        id: currentCount === 1 ? baseSlug : `${baseSlug}-${currentCount}`,
        level: match[1].length,
        text,
      };
    })
    .filter(Boolean);
}

function measureMessageDensity(content = "") {
  return Array.from(content).reduce((total, char) => {
    if (/\p{Script=Han}/u.test(char)) {
      return total + 1.7;
    }
    if (/\s/.test(char)) {
      return total + 0.35;
    }
    return total + 1;
  }, 0);
}

function shouldUseCompactAssistantBubble(content = "") {
  const text = String(content || "").trim();

  if (!text) {
    return true;
  }

  const hasBlockStructure =
    text.includes("\n\n") ||
    /```/.test(text) ||
    /(^|\s)([-*+]|\d+\.)\s/.test(text) ||
    /^#{1,6}\s/m.test(text) ||
    /^\|.*\|$/m.test(text) ||
    /^>\s/m.test(text);
  const hasLongLink = /https?:\/\/\S{24,}/i.test(text);
  const normalized = text.replace(/[*_`~[\]()#>|-]/g, " ").replace(/\s+/g, " ").trim();

  return !hasBlockStructure && !hasLongLink && measureMessageDensity(normalized) <= assistantCompactThreshold;
}

function estimateVisualLineCount(content = "") {
  const lines = String(content || "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  return Math.max(lines.length, 1);
}

function EmptyConversation() {
  const { messages } = useI18n();

  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
          <Send className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">{messages.chat.waitingFirstPrompt}</div>
          <div className="text-sm text-muted-foreground">{messages.chat.conversationWillAppear}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyMessageButton({ content }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(String(content || ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="pointer-events-none inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/75 opacity-0 transition hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100"
      aria-label={copied ? messages.chat.copiedMessage : messages.chat.copyMessage}
      title={copied ? messages.chat.copiedMessageTitle : messages.chat.copyMessageTitle}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function MessageMeta({ align = "left", content, formatTime, pending, sticky, compact, timestamp }) {
  const baseClassName = cn(
    "flex items-center gap-1 text-[11px] leading-5 text-muted-foreground tabular-nums",
    sticky ? "sticky top-0" : "",
    compact ? "self-center" : "self-start pt-2.5",
  );

  if (align === "right") {
    return (
      <div className={baseClassName}>
        <time>{formatTime(timestamp)}</time>
        {pending ? null : <CopyMessageButton content={content} />}
      </div>
    );
  }

  return (
    <div className={baseClassName}>
      {pending ? null : <CopyMessageButton content={content} />}
      <time>{formatTime(timestamp)}</time>
    </div>
  );
}

function MessageOutline({ headingScopeId, items, onSelect }) {
  const { messages } = useI18n();

  return (
    <aside className="sticky top-3 hidden w-40 shrink-0 self-start rounded-[5px] border border-border/70 bg-muted/20 p-2 xl:block">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{messages.chat.outline}</div>
      <div className="grid gap-px">
        {items.map((item) => (
          <button
            key={`${headingScopeId}-${item.id}`}
            type="button"
            onClick={() => onSelect(`${headingScopeId}-${item.id}`)}
            className={cn(
              "cursor-pointer rounded-[4px] px-2 py-0.5 text-left text-[11px] leading-[1.05rem] text-muted-foreground transition hover:bg-accent/45 hover:text-foreground",
              item.level === 1 ? "font-medium text-foreground/90" : "",
              item.level === 2 ? "pl-3" : "",
              item.level >= 3 ? "pl-4 text-[10px]" : "",
            )}
          >
            <span className="line-clamp-2">{item.text}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function MessageLabel({ align = "left", value }) {
  return (
    <div
      className={cn(
        "mb-1 max-w-full truncate px-1 text-[11px] leading-4 text-muted-foreground/85",
        align === "right" ? "text-right" : "text-left",
      )}
      title={value}
    >
      {value}
    </div>
  );
}

function AgentLabel({ tokenBadge, value }) {
  return (
    <div className="mb-1 flex max-w-full items-center gap-2 px-1 text-[11px] leading-4 text-muted-foreground/85">
      <span className="truncate" title={value}>
        {value}
      </span>
      {tokenBadge ? <span className="shrink-0 text-[10px] text-muted-foreground/70">{tokenBadge}</span> : null}
    </div>
  );
}

function MessageBubble({ agentLabel, formatTime, files, message, messageId, separated, userLabel }) {
  const [previewImage, setPreviewImage] = useState(null);
  const isUser = message.role === "user";
  const isPending = Boolean(message.pending);
  const useCompactAssistantBubble = !isUser && !isPending && shouldUseCompactAssistantBubble(message.content);
  const visualLineCount = estimateVisualLineCount(message.content);
  const compactMeta = visualLineCount <= 1;
  const outlineItems = !isUser && !isPending ? extractHeadingOutline(message.content) : [];
  const shouldShowOutline = outlineItems.length >= 2;
  const headingScopeId = `message-${messageId}`;
  const userBubbleWidthClassName = "w-fit min-w-[3.75rem] max-w-[min(86vw,40rem)]";
  const compactAssistantWidthClassName = "inline-block max-w-[min(80vw,42rem)] shrink-0";
  const longAssistantWidthClassName = "w-[700px] max-w-[calc(100vw-12rem)] shrink-0";

  const handleSelectHeading = (anchorId) => {
    const element = document.getElementById(anchorId);
    if (!element) {
      return;
    }
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  };

  if (isUser) {
    return (
      <>
        <div className={cn("group/message flex w-full justify-end", separated && "mt-2")}>
          <div className="flex max-w-full flex-col items-end">
            <MessageLabel align="right" value={userLabel} />
            <div className="flex max-w-full items-center gap-2">
              <MessageMeta align="left" content={message.content} formatTime={formatTime} pending={false} compact timestamp={message.timestamp} />
              <Card data-bubble-layout="user" className={cn(bubbleBaseClassName, userBubbleWidthClassName, "cc-user-bubble", userBubbleClassName)}>
                <CardContent className={cn(bubbleContentClassName, message.attachments?.length && "space-y-2")}>
                  <MessageAttachments attachments={message.attachments} onPreviewImage={(attachment) => setPreviewImage({ src: attachment.dataUrl || attachment.previewUrl, alt: attachment.name })} />
                  {message.content ? (
                    <div className="whitespace-pre-wrap text-[12px] font-medium leading-5" style={{ color: "#ffffff" }}>
                      {message.content}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <ImageLightbox image={previewImage} onClose={() => setPreviewImage(null)} />
      </>
    );
  }

  if (isPending) {
    return (
      <div className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}>
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} />
          <div className="inline-flex max-w-full items-center gap-2">
            <Card
              data-bubble-layout="compact"
              className={cn(
                bubbleBaseClassName,
                "inline-block w-fit max-w-[min(60vw,14rem)] shrink-0 animate-pulse",
                "cc-assistant-bubble",
                assistantBubbleClassName,
              )}
            >
              <CardContent className={bubbleContentClassName}>
                <MarkdownContent
                  content={message.content}
                  files={files}
                  headingScopeId={headingScopeId}
                  className="text-[12px] leading-5 [&_p]:mb-0 [&_p]:whitespace-nowrap"
                />
              </CardContent>
            </Card>
            <MessageMeta align="right" content={message.content} formatTime={formatTime} pending compact timestamp={message.timestamp} />
          </div>
        </div>
      </div>
    );
  }

  if (shouldShowOutline) {
    return (
      <div className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}>
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} />
          <div className="inline-flex max-w-full items-start gap-1.5">
            <div className="inline-flex min-w-0 max-w-full items-start gap-3">
              <Card data-bubble-layout="full" className={cn(bubbleBaseClassName, "w-[700px] max-w-[calc(100vw-20rem)] shrink-0", "cc-assistant-bubble", assistantBubbleClassName)}>
                <CardContent className={bubbleContentClassName}>
                  <MarkdownContent content={message.content} files={files} headingScopeId={headingScopeId} className="text-[12px] leading-5" />
                </CardContent>
              </Card>
              <MessageOutline headingScopeId={headingScopeId} items={outlineItems} onSelect={handleSelectHeading} />
            </div>
            <MessageMeta align="right" content={message.content} formatTime={formatTime} sticky timestamp={message.timestamp} />
          </div>
        </div>
      </div>
    );
  }

  if (useCompactAssistantBubble) {
    return (
      <div className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}>
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} />
          <div className="inline-flex max-w-full items-center gap-2">
            <Card data-bubble-layout="compact" className={cn(bubbleBaseClassName, compactAssistantWidthClassName, "cc-assistant-bubble", assistantBubbleClassName)}>
              <CardContent className={bubbleContentClassName}>
                <MarkdownContent content={message.content} files={files} headingScopeId={headingScopeId} className="text-[12px] leading-5 [&_p]:mb-0 [&_p]:whitespace-nowrap" />
              </CardContent>
            </Card>
            <MessageMeta align="right" content={message.content} formatTime={formatTime} compact={compactMeta} timestamp={message.timestamp} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}>
      <div className="flex max-w-full flex-col items-start">
        <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} />
        <div className="inline-flex max-w-full items-start gap-2">
          <Card data-bubble-layout="full" className={cn(bubbleBaseClassName, longAssistantWidthClassName, "cc-assistant-bubble", assistantBubbleClassName)}>
            <CardContent className={bubbleContentClassName}>
              <MarkdownContent content={message.content} files={files} headingScopeId={headingScopeId} className="text-[12px] leading-5" />
            </CardContent>
          </Card>
          <MessageMeta align="right" content={message.content} formatTime={formatTime} sticky timestamp={message.timestamp} />
        </div>
      </div>
    </div>
  );
}

function ConnectionStatus({ session }) {
  const { messages } = useI18n();
  const isOffline = session.status === messages.common.offline || session.status === "离线";
  const isOpenClaw = session.mode === "openclaw";
  const toneClassName = isOffline ? "bg-rose-500" : isOpenClaw ? "bg-emerald-500" : "bg-slate-400";
  const label = isOffline ? messages.common.offline : isOpenClaw ? messages.common.online : messages.common.mockMode;

  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", toneClassName)} aria-hidden="true" />
      <span>{label}</span>
      {session.version ? <span className="text-[11px] text-muted-foreground">{session.version}</span> : null}
    </span>
  );
}

function QueuedMessages({ items }) {
  const { messages } = useI18n();

  if (!items.length) {
    return null;
  }

  return (
    <div className="border-b border-border/70 bg-muted/20 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
          {messages.chat.queuedCount(items.length)}
        </Badge>
        <span>{messages.chat.queuedHint}</span>
      </div>
      <div className="grid gap-1.5">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-[12px] leading-5">
            <span className="mr-2 text-[10px] text-muted-foreground">#{index + 1}</span>
            <span className="line-clamp-2 whitespace-pre-wrap">{item.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  agentLabel = "main",
  busy,
  composerAttachments,
  files,
  formatTime,
  messageViewportRef,
  messages,
  onAddAttachments,
  onRemoveAttachment,
  onPromptChange,
  onPromptKeyDown,
  onReset,
  onSend,
  prompt,
  promptRef,
  queuedMessages,
  session,
  userLabel = "marila",
}) {
  const { messages: i18n } = useI18n();
  const attachmentInputRef = useRef(null);
  const [composerPreviewImage, setComposerPreviewImage] = useState(null);

  return (
    <>
      <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden">
        <CardHeader className="flex h-12 flex-row items-center justify-between gap-3 border-b border-border/70 bg-card/80 px-3 py-2 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="truncate text-sm leading-none">{i18n.chat.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-none">{i18n.chat.subtitle}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onReset} className="h-6 w-6 rounded-md" aria-label={i18n.chat.resetConversation}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{i18n.chat.resetConversationHotkey}</TooltipContent>
            </Tooltip>
            <Badge variant="default" className="h-6 px-2 py-0 text-[10px]">
              {session.agentId || "main"}
            </Badge>
            <Badge variant={busy ? "success" : "default"} className="h-6 px-2 py-0 text-[10px]">
              {busy ? i18n.chat.agentBusy : i18n.chat.agentIdle}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-0">
          <QueuedMessages items={queuedMessages || []} />
          <ScrollArea className="h-full" viewportRef={messageViewportRef}>
            <div className="grid gap-2.5 p-3">
              {messages.length
                ? messages.map((message, index) => (
                    <MessageBubble
                      agentLabel={agentLabel}
                      key={`${message.timestamp}-${index}`}
                      message={message}
                      messageId={`${message.timestamp}-${index}`}
                      formatTime={formatTime}
                      files={files}
                      separated={index > 0 && messages[index - 1]?.role !== message.role}
                      userLabel={userLabel}
                    />
                  ))
                : <EmptyConversation />}
            </div>
          </ScrollArea>
        </CardContent>

        <CardContent className="space-y-3 border-t border-border/70 bg-muted/20 px-4 py-4">
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              onAddAttachments?.(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
            {composerAttachments?.length ? (
              <>
                <ComposerAttachments
                  attachments={composerAttachments}
                  onPreviewImage={(attachment) => setComposerPreviewImage({ src: attachment.dataUrl || attachment.previewUrl, alt: attachment.name })}
                  onRemoveAttachment={onRemoveAttachment}
                />
                <div className="border-t border-border/60" />
              </>
            ) : null}
            <Textarea
              ref={promptRef}
              rows={3}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={onPromptKeyDown}
              placeholder={i18n.chat.promptPlaceholder}
              className="min-h-[7.5rem] resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ConnectionStatus session={session} />
              <span>{i18n.chat.composerHint}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-3"
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {i18n.common.attachment}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{i18n.chat.uploadAttachment}</TooltipContent>
              </Tooltip>
              <Button
                onClick={onSend}
                className="cc-send-button md:min-w-28 px-5"
              >
                <span className="grid w-full grid-cols-[0.875rem_1fr_0.875rem] items-center gap-2">
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    <Send className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-center">{i18n.chat.send}</span>
                  <span className="flex h-3.5 w-3.5 items-center justify-center opacity-0" aria-hidden="true">
                    <Send className="h-3.5 w-3.5" />
                  </span>
                </span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <ImageLightbox image={composerPreviewImage} onClose={() => setComposerPreviewImage(null)} />
    </>
  );
}
