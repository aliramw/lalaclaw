import { ArrowDown, ArrowUpToLine, Check, Copy, Paperclip, RotateCcw, Send, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FilePreviewOverlay, ImagePreviewOverlay } from "@/components/command-center/file-preview-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { cn, formatShortcutForPlatform } from "@/lib/utils";
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

function messageHasVisualMedia(message = {}) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.some(isImageAttachment)) {
    return true;
  }

  const content = String(message?.content || "");
  if (!content) {
    return false;
  }

  if (/!\[[^\]]*]\([^)]+\)/.test(content)) {
    return true;
  }

  return /(^|\n)\s*https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S+)?\s*($|\n)/i.test(content);
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

function getAgentMentionMatch(value = "", caret = 0) {
  const safeValue = String(value || "");
  const safeCaret = Number.isFinite(caret) ? Math.max(0, Math.min(caret, safeValue.length)) : safeValue.length;
  const beforeCaret = safeValue.slice(0, safeCaret);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCaret);

  if (!match) {
    return null;
  }

  return {
    start: beforeCaret.length - match[2].length - 1,
    end: safeCaret,
    query: match[2] || "",
  };
}

function shouldIgnoreMentionKeyUp(key = "") {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Tab" || key === "Escape";
}

function normalizeSkillMention(skill) {
  if (typeof skill === "string") {
    const name = skill.trim();
    return name ? { name, ownerAgentId: "" } : null;
  }

  const name = String(skill?.name || "").trim();
  if (!name) {
    return null;
  }

  return {
    name,
    ownerAgentId: String(skill?.ownerAgentId || "").trim(),
  };
}

function findLatestAssistantMessageId(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (entry?.role === "assistant") {
      return `${entry.timestamp}-${index}`;
    }
  }
  return "";
}

function extractRuntimeBadge(runtimeLabel = "") {
  const segments = String(runtimeLabel || "")
    .split(/·|•/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return "";
  }

  return segments.findLast((segment) => !/^think\s*:/i.test(segment) && !/^direct$/i.test(segment)) || "";
}

function calculateLatestBubbleScrollTop(viewport, bubble) {
  if (!viewport || !bubble) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleTop = viewport.scrollTop + (bubbleRect.top - viewportRect.top);
  const bubbleHeight = bubbleRect.height || 0;
  const middleOffset = viewport.clientHeight * 0.42;
  const topOffset = 8;
  const targetTop = bubbleHeight >= Math.max(140, viewport.clientHeight * 0.3) ? bubbleTop - middleOffset : bubbleTop - topOffset;

  return Math.max(0, Math.min(targetTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
}

function calculateTallLatestBubbleScrollTop(viewport, bubble) {
  if (!viewport || !bubble) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleTop = viewport.scrollTop + (bubbleRect.top - viewportRect.top);
  const targetTop = bubbleTop - viewport.clientHeight * 0.2;

  return Math.max(0, Math.min(targetTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
}

function calculateBubbleTopFocusScrollTop(viewport, bubble) {
  if (!viewport || !bubble) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleTop = viewport.scrollTop + (bubbleRect.top - viewportRect.top);
  const targetTop = bubbleTop - viewport.clientHeight * 0.3;

  return Math.max(0, Math.min(targetTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
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

function BubbleTopJumpButton({ onClick }) {
  const { messages } = useI18n();

  return (
    <div className="pointer-events-none sticky top-2 z-10 -mb-7 flex justify-end px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/92 text-muted-foreground backdrop-blur transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={messages.chat.jumpToMessageTop}
          >
            <ArrowUpToLine className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{messages.chat.jumpToMessageTop}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function SessionKeyInlineCopy({ value }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  if (!value) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="group/sessionkey inline-flex min-w-0 max-w-[26rem] items-center gap-1 text-[11px] font-medium text-muted-foreground/90">
      <button
        type="button"
        onClick={handleCopy}
        className="min-w-0 truncate transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        title={value}
        aria-label={copied ? messages.common.copied : messages.common.copy}
      >
        {value}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          copied ? "opacity-100" : "opacity-0 group-hover/sessionkey:opacity-100",
        )}
        aria-label={copied ? messages.common.copied : messages.common.copy}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
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
              item.level === 2 ? "pl-3 font-semibold text-foreground/95" : "",
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

function areMessageAttachmentsEqual(left = [], right = []) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((attachment, index) => {
    const other = right[index];
    return attachment?.id === other?.id
      && attachment?.name === other?.name
      && attachment?.kind === other?.kind
      && attachment?.mimeType === other?.mimeType
      && attachment?.dataUrl === other?.dataUrl
      && attachment?.previewUrl === other?.previewUrl;
  });
}

const MessageBubble = memo(function MessageBubble({
  agentLabel,
  bubbleAnchorRef,
  files,
  formatTime,
  handleOpenFilePreview,
  handleOpenImagePreview,
  isLatestAssistant,
  message,
  messageId,
  messageViewportRef,
  resolvedTheme,
  separated,
  userLabel,
}) {
  const [showBubbleTopJump, setShowBubbleTopJump] = useState(false);
  const bubbleRef = useRef(null);
  const isUser = message.role === "user";
  const isPending = Boolean(message.pending);
  const supportsBubbleTopJump = !messageHasVisualMedia(message);
  const useCompactAssistantBubble = !isUser && !isPending && shouldUseCompactAssistantBubble(message.content);
  const visualLineCount = estimateVisualLineCount(message.content);
  const compactMeta = visualLineCount <= 1;
  const outlineItems = !isUser && !isPending ? extractHeadingOutline(message.content) : [];
  const shouldShowOutline = outlineItems.length >= 2;
  const headingScopeId = `message-${messageId}`;
  const userBubbleWidthClassName = "w-fit min-w-[3.75rem] max-w-[min(86vw,40rem)]";
  const compactAssistantWidthClassName = "inline-block max-w-[min(80vw,42rem)] shrink-0";
  const longAssistantWidthClassName = "w-[700px] max-w-[calc(100vw-12rem)] shrink-0";
  const messageBubbleAttributes = {
    "data-message-anchor": isLatestAssistant ? "latest-assistant" : undefined,
    "data-message-id": messageId,
    "data-message-role": message.role,
    "data-message-timestamp": String(message.timestamp || ""),
  };

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

  const setBubbleNode = (node) => {
    bubbleRef.current = node;

    if (!bubbleAnchorRef) {
      return;
    }

    if (typeof bubbleAnchorRef === "function") {
      bubbleAnchorRef(node);
      return;
    }

    bubbleAnchorRef.current = node;
  };

  const handleJumpBubbleTop = () => {
    const viewport = messageViewportRef?.current;
    const bubble = bubbleRef.current;
    if (!viewport || !bubble) {
      return;
    }

    const top = calculateBubbleTopFocusScrollTop(viewport, bubble);
    viewport.scrollTo?.({ top, behavior: "smooth" });
    if (typeof viewport.scrollTo !== "function") {
      viewport.scrollTop = top;
    }
  };

  useEffect(() => {
    if (!supportsBubbleTopJump) {
      setShowBubbleTopJump(false);
      return undefined;
    }

    const viewport = messageViewportRef?.current;
    const bubble = bubbleRef.current;
    if (!viewport || !bubble) {
      setShowBubbleTopJump(false);
      return undefined;
    }

    const updateBubbleTopJump = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const bubbleTallEnough = bubbleRect.height >= 150;
      const bubbleTopHidden = bubbleRect.top < viewportRect.top;
      const bubbleNotFullyVisible = bubbleRect.top < viewportRect.top || bubbleRect.bottom > viewportRect.bottom;
      const bubbleStillVisible = bubbleRect.bottom > viewportRect.top + 24;
      setShowBubbleTopJump(bubbleTallEnough && bubbleTopHidden && bubbleNotFullyVisible && bubbleStillVisible);
    };

    updateBubbleTopJump();
    viewport.addEventListener("scroll", updateBubbleTopJump, { passive: true });
    window.addEventListener("resize", updateBubbleTopJump);
    return () => {
      viewport.removeEventListener("scroll", updateBubbleTopJump);
      window.removeEventListener("resize", updateBubbleTopJump);
    };
  }, [messageViewportRef, message.content, message.pending, message.timestamp, supportsBubbleTopJump]);

  if (isUser) {
    return (
      <>
        <div
          ref={setBubbleNode}
          {...messageBubbleAttributes}
          className={cn("group/message flex w-full justify-end", separated && "mt-2")}
        >
          <div className="flex max-w-full flex-col items-end">
            <MessageLabel align="right" value={userLabel} />
            <div className="flex max-w-full items-center gap-2">
              <MessageMeta align="left" content={message.content} formatTime={formatTime} pending={false} compact timestamp={message.timestamp} />
              <Card data-bubble-layout="user" className={cn(bubbleBaseClassName, userBubbleWidthClassName, "cc-user-bubble", userBubbleClassName)}>
                {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
                <CardContent className={cn(bubbleContentClassName, message.attachments?.length && "space-y-2")}>
                  <MessageAttachments attachments={message.attachments} onPreviewImage={handleOpenImagePreview} />
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
      </>
    );
  }

  if (isPending) {
    return (
      <div
        ref={setBubbleNode}
        {...messageBubbleAttributes}
        className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}
      >
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} />
          <div className="inline-flex max-w-full items-center gap-2">
            <Card
              data-bubble-layout="compact"
              className={cn(
                bubbleBaseClassName,
                "cc-thinking-bubble inline-block w-fit max-w-[min(60vw,14rem)] shrink-0 motion-reduce:animate-none",
                "cc-assistant-bubble",
                assistantBubbleClassName,
              )}
            >
              {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
              <CardContent className={bubbleContentClassName}>
                <MarkdownContent
                  content={message.content}
                  files={files}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  onOpenFilePreview={handleOpenFilePreview}
                  className="text-[12px] font-semibold leading-5 [&_p]:mb-0 [&_p]:whitespace-nowrap"
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
      <div
        ref={setBubbleNode}
        {...messageBubbleAttributes}
        className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}
      >
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} />
          <div className="inline-flex max-w-full items-start gap-1.5">
            <div className="inline-flex min-w-0 max-w-full items-start gap-3">
              <Card data-bubble-layout="full" className={cn(bubbleBaseClassName, "w-[700px] max-w-[calc(100vw-20rem)] shrink-0", "cc-assistant-bubble", assistantBubbleClassName)}>
                {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
                <CardContent className={bubbleContentClassName}>
                  <MarkdownContent
                    content={message.content}
                    files={files}
                    headingScopeId={headingScopeId}
                    resolvedTheme={resolvedTheme}
                    onOpenFilePreview={handleOpenFilePreview}
                    className="text-[12px] leading-5"
                  />
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
      <div
        ref={setBubbleNode}
        {...messageBubbleAttributes}
        className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}
      >
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} />
          <div className="inline-flex max-w-full items-center gap-2">
            <Card data-bubble-layout="compact" className={cn(bubbleBaseClassName, compactAssistantWidthClassName, "cc-assistant-bubble", assistantBubbleClassName)}>
              {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
              <CardContent className={bubbleContentClassName}>
                <MarkdownContent
                  content={message.content}
                  files={files}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  onOpenFilePreview={handleOpenFilePreview}
                  className="text-[12px] leading-5 [&_p]:mb-0 [&_p]:whitespace-nowrap"
                />
              </CardContent>
            </Card>
            <MessageMeta align="right" content={message.content} formatTime={formatTime} compact={compactMeta} timestamp={message.timestamp} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setBubbleNode}
      {...messageBubbleAttributes}
      className={cn("group/message flex w-fit max-w-full", separated && "mt-2")}
    >
      <div className="flex max-w-full flex-col items-start">
        <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} />
        <div className="inline-flex max-w-full items-start gap-2">
          <Card data-bubble-layout="full" className={cn(bubbleBaseClassName, longAssistantWidthClassName, "cc-assistant-bubble", assistantBubbleClassName)}>
            {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
            <CardContent className={bubbleContentClassName}>
              <MarkdownContent
                content={message.content}
                files={files}
                headingScopeId={headingScopeId}
                resolvedTheme={resolvedTheme}
                onOpenFilePreview={handleOpenFilePreview}
                className="text-[12px] leading-5"
              />
            </CardContent>
          </Card>
          <MessageMeta align="right" content={message.content} formatTime={formatTime} sticky timestamp={message.timestamp} />
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.agentLabel === nextProps.agentLabel
    && prevProps.isLatestAssistant === nextProps.isLatestAssistant
    && prevProps.formatTime === nextProps.formatTime
    && prevProps.messageId === nextProps.messageId
    && prevProps.messageViewportRef === nextProps.messageViewportRef
    && prevProps.resolvedTheme === nextProps.resolvedTheme
    && prevProps.separated === nextProps.separated
    && prevProps.userLabel === nextProps.userLabel
    && prevProps.message?.role === nextProps.message?.role
    && prevProps.message?.content === nextProps.message?.content
    && prevProps.message?.pending === nextProps.message?.pending
    && prevProps.message?.timestamp === nextProps.message?.timestamp
    && prevProps.message?.tokenBadge === nextProps.message?.tokenBadge
    && areMessageAttachmentsEqual(prevProps.message?.attachments || [], nextProps.message?.attachments || []);
});

function ConnectionStatus({ session }) {
  const { messages } = useI18n();
  const isOffline = session.status === messages.common.offline || session.status === "离线";
  const isOpenClaw = session.mode === "openclaw";
  const toneClassName = isOffline ? "bg-rose-500" : isOpenClaw ? "bg-emerald-500" : "bg-slate-400";
  const label = isOffline || isOpenClaw ? messages.common.openClaw : messages.common.mockMode;

  return (
    <span className="inline-flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("h-2 w-2 rounded-full", toneClassName)} aria-label={messages.chat.openClawStatusTooltip} />
        </TooltipTrigger>
        <TooltipContent>{messages.chat.openClawStatusTooltip}</TooltipContent>
      </Tooltip>
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
  focusMessageRequest,
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
  resolvedTheme,
  session,
  userLabel = "marila",
}) {
  const { messages: i18n } = useI18n();
  const attachmentInputRef = useRef(null);
  const { filePreview, imagePreview, handleOpenPreview, openImagePreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const [agentMention, setAgentMention] = useState(null);
  const [highlightedAgentIndex, setHighlightedAgentIndex] = useState(0);
  const [showLatestReplyButton, setShowLatestReplyButton] = useState(false);
  const latestAssistantBubbleRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  const currentAgentName = session.agentId || agentLabel || "main";
  const runtimeBadge = extractRuntimeBadge(session.runtime);
  const modeLabel = session.mode === "openclaw" ? i18n.common.liveGateway : i18n.common.mockMode;
  const latestAssistantMessageId = useMemo(() => findLatestAssistantMessageId(messages), [messages]);
  const latestAssistantMessage = useMemo(() => {
    if (!latestAssistantMessageId) {
      return null;
    }

    const index = Number.parseInt(latestAssistantMessageId.split("-").at(-1) || "-1", 10);
    return Number.isInteger(index) && index >= 0 ? messages[index] || null : null;
  }, [latestAssistantMessageId, messages]);
  const latestAssistantRenderKey = useMemo(
    () =>
      latestAssistantMessage
        ? [
            latestAssistantMessage.timestamp,
            latestAssistantMessage.pending ? "pending" : "done",
            latestAssistantMessage.content || "",
            latestAssistantMessage.attachments?.length || 0,
          ].join("::")
        : "",
    [latestAssistantMessage],
  );
  const mentionableAgents = (session.availableMentionAgents || []).filter((agent) => agent && agent !== session.agentId);
  const mentionableSkills = (session.availableSkills || []).map(normalizeSkillMention).filter(Boolean);
  const filteredMentionAgents = agentMention
    ? mentionableAgents.filter((agent) => agent.toLowerCase().includes(agentMention.query.toLowerCase()))
    : [];
  const filteredMentionSkills = agentMention
    ? mentionableSkills.filter((skill) => skill.name.toLowerCase().includes(agentMention.query.toLowerCase()))
    : [];
  const mentionOptions = [
    ...filteredMentionAgents.map((agent) => ({ id: `agent:${agent}`, value: agent, type: "agent" })),
    ...filteredMentionSkills.map((skill) => ({
      id: `skill:${skill.name}`,
      value: skill.name,
      type: "skill",
      ownerAgentId: skill.ownerAgentId,
    })),
  ];
  const latestMessageIsAssistant = messages[messages.length - 1]?.role === "assistant";

  const syncAgentMention = (nextPrompt, caret) => {
    if (!mentionableAgents.length && !mentionableSkills.length) {
      setAgentMention(null);
      setHighlightedAgentIndex(0);
      return;
    }

    const match = getAgentMentionMatch(nextPrompt, caret);
    setAgentMention(match);
    setHighlightedAgentIndex(0);
  };

  const applyMention = (value) => {
    if (!agentMention) {
      return;
    }

    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }

    const nextPrompt = `${prompt.slice(0, agentMention.start)}${normalizedValue} ${prompt.slice(agentMention.end)}`;
    const nextCaret = agentMention.start + normalizedValue.length + 1;
    onPromptChange(nextPrompt);
    setAgentMention(null);
    setHighlightedAgentIndex(0);

    window.requestAnimationFrame(() => {
      promptRef?.current?.focus();
      promptRef?.current?.setSelectionRange?.(nextCaret, nextCaret);
    });
  };

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      const textarea = promptRef?.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange?.(end, end);
    });
  }, [promptRef]);

  const addAttachmentsAndFocus = useCallback(async (fileList) => {
    if (!fileList) {
      return;
    }

    await onAddAttachments?.(fileList);
    focusComposer();
  }, [focusComposer, onAddAttachments]);

  useEffect(() => {
    const handleGlobalPaste = (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const pastedFiles = Array.from(clipboardData.files || []).filter(Boolean);
      if (!pastedFiles.length) {
        return;
      }

      event.preventDefault();
      addAttachmentsAndFocus(pastedFiles).catch(() => {});
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [addAttachmentsAndFocus]);

  useEffect(() => {
    if (!agentMention) {
      return;
    }
    if (!mentionOptions.length) {
      setHighlightedAgentIndex(0);
      return;
    }
    setHighlightedAgentIndex((current) => Math.min(current, mentionOptions.length - 1));
  }, [agentMention, mentionOptions.length]);

  useEffect(() => {
    const viewport = messageViewportRef?.current;
    if (!viewport) {
      return undefined;
    }

    const updateWasNearBottom = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      wasNearBottomRef.current = distanceFromBottom <= 48;
    };

    updateWasNearBottom();
    viewport.addEventListener("scroll", updateWasNearBottom, { passive: true });
    return () => viewport.removeEventListener("scroll", updateWasNearBottom);
  }, [messageViewportRef]);

  useEffect(() => {
    const viewport = messageViewportRef?.current;
    const latestBubble = latestAssistantBubbleRef.current;
    if (!viewport || !latestBubble || !latestMessageIsAssistant || !wasNearBottomRef.current) {
      return undefined;
    }

    const bubbleHeight = latestBubble.getBoundingClientRect().height || 0;
    if (bubbleHeight < viewport.clientHeight * 0.8) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const top = calculateTallLatestBubbleScrollTop(viewport, latestBubble);
      viewport.scrollTo?.({ top, behavior: "auto" });
      if (typeof viewport.scrollTo !== "function") {
        viewport.scrollTop = top;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [latestAssistantMessageId, latestAssistantRenderKey, latestMessageIsAssistant, messageViewportRef]);

  useEffect(() => {
    const viewport = messageViewportRef?.current;
    if (!viewport) {
      setShowLatestReplyButton(false);
      return undefined;
    }

    const updateLatestReplyButton = () => {
      if (!latestAssistantMessageId || !latestMessageIsAssistant) {
        setShowLatestReplyButton(false);
        return;
      }

      const latestBubble = latestAssistantBubbleRef.current;
      if (!latestBubble) {
        const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        setShowLatestReplyButton(distanceFromBottom > 72);
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const bubbleRect = latestBubble.getBoundingClientRect();
      const bubbleStartBelowViewport = bubbleRect.top > viewportRect.bottom - 40;
      setShowLatestReplyButton(bubbleStartBelowViewport);
    };

    updateLatestReplyButton();
    viewport.addEventListener("scroll", updateLatestReplyButton, { passive: true });
    return () => viewport.removeEventListener("scroll", updateLatestReplyButton);
  }, [latestAssistantMessageId, latestMessageIsAssistant, messageViewportRef, messages.length]);

  useEffect(() => {
    if (!focusMessageRequest?.id) {
      return undefined;
    }

    const viewport = messageViewportRef?.current;
    if (!viewport) {
      return undefined;
    }

    const selector = focusMessageRequest.messageId
      ? `[data-message-id="${focusMessageRequest.messageId}"]`
      : `[data-message-role="${focusMessageRequest.role || "assistant"}"][data-message-timestamp="${String(focusMessageRequest.timestamp || "")}"]`;

    const frameId = window.requestAnimationFrame(() => {
      const targetBubble = viewport.querySelector(selector);
      if (!targetBubble) {
        return;
      }

      const top = calculateBubbleTopFocusScrollTop(viewport, targetBubble);
      viewport.scrollTo?.({ top, behavior: "smooth" });
      if (typeof viewport.scrollTo !== "function") {
        viewport.scrollTop = top;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusMessageRequest, messageViewportRef]);

  const handleJumpToLatestReply = () => {
    const viewport = messageViewportRef?.current;
    const latestBubble = latestAssistantBubbleRef.current;
    if (!viewport || !latestBubble) {
      return;
    }

    const top = calculateLatestBubbleScrollTop(viewport, latestBubble);
    viewport.scrollTo?.({ top, behavior: "smooth" });
    if (typeof viewport.scrollTo !== "function") {
      viewport.scrollTop = top;
    }
  };

  const handleResetWithConfirm = () => {
    const confirmed = window.confirm(i18n.chat.resetConversationConfirm);
    if (!confirmed) {
      return;
    }
    onReset?.();
  };

  return (
    <>
      <Card className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden">
        <CardHeader className="flex h-12 flex-row items-center justify-between gap-3 border-b border-border/70 bg-card/80 px-3 py-0 backdrop-blur">
          <div className="flex h-full min-w-0 translate-y-[2px] flex-col justify-center gap-1 self-center">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-semibold leading-none tracking-tight">{`${currentAgentName} - ${i18n.chat.title}`}</div>
              {runtimeBadge ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="secondary"
                        className="h-5 shrink-0 cursor-help rounded-full px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                      >
                        {runtimeBadge}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{i18n.chat.runtimeBadgeTooltip}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="secondary"
                        className="h-5 shrink-0 cursor-help rounded-full px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                      >
                        {modeLabel}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{session.mode === "openclaw" ? i18n.common.liveGatewayTooltip : i18n.common.mockModeTooltip}</TooltipContent>
                  </Tooltip>
                </div>
              ) : null}
              <SessionKeyInlineCopy value={session.sessionKey} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={busy ? "success" : "default"} className="h-6 px-2 py-0 text-[10px]">
                  {busy ? i18n.chat.agentBusy : i18n.chat.agentIdle}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{busy ? i18n.chat.agentBusyTooltip : i18n.chat.agentIdleTooltip}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetWithConfirm}
                  className="h-6 w-6 rounded-md"
                  aria-label={i18n.chat.resetConversation}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{formatShortcutForPlatform(i18n.chat.resetConversationHotkey)}</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        <CardContent className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-0">
          <QueuedMessages items={queuedMessages || []} />
          <div className="relative min-h-0">
            <ScrollArea className="h-full" viewportRef={messageViewportRef}>
              <div className="grid gap-2.5 p-3">
                {messages.length
                  ? messages.map((message, index) => {
                      const messageId = `${message.timestamp}-${index}`;
                      const isLatestAssistant = latestAssistantMessageId === messageId;

                      return (
                        <MessageBubble
                          agentLabel={agentLabel}
                          bubbleAnchorRef={isLatestAssistant ? latestAssistantBubbleRef : undefined}
                          handleOpenFilePreview={handleOpenPreview}
                          handleOpenImagePreview={openImagePreview}
                          isLatestAssistant={isLatestAssistant}
                          key={messageId}
                          message={message}
                          messageId={messageId}
                          formatTime={formatTime}
                          files={files}
                          messageViewportRef={messageViewportRef}
                          resolvedTheme={resolvedTheme}
                          separated={index > 0 && messages[index - 1]?.role !== message.role}
                          userLabel={userLabel}
                        />
                      );
                    })
                  : <EmptyConversation />}
              </div>
            </ScrollArea>
            {showLatestReplyButton ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={i18n.chat.jumpToLatestReply}
                      className="pointer-events-auto h-10 w-10 rounded-full border-border/70 bg-background/96 shadow-lg backdrop-blur hover:bg-background"
                      onClick={handleJumpToLatestReply}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{i18n.chat.jumpToLatestReply}</TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </div>
        </CardContent>

        <CardContent className="space-y-3 border-t border-border/70 bg-muted/20 px-4 py-4">
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addAttachmentsAndFocus(event.target.files).catch(() => {});
              event.target.value = "";
            }}
          />
          <div className="relative">
            {agentMention && mentionOptions.length ? (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(28rem,calc(100vw-4rem))]">
                <div className="max-h-[31rem] overflow-y-auto rounded-xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur">
                  {filteredMentionAgents.length ? (
                    <>
                      <div className="mb-1 px-1 text-[10px] font-semibold uppercase text-muted-foreground">{i18n.chat.mentionAgents}</div>
                      <div className="grid gap-0.5">
                        {filteredMentionAgents.map((agent) => {
                          const optionIndex = mentionOptions.findIndex((option) => option.id === `agent:${agent}`);
                          return (
                            <button
                              key={agent}
                              type="button"
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                                optionIndex === highlightedAgentIndex ? "bg-foreground/10 text-foreground" : "text-foreground hover:bg-muted/70",
                              )}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => applyMention(agent)}
                            >
                              <span className="font-medium">{agent}</span>
                              <span className="text-[11px] text-muted-foreground">{i18n.chat.mentionAgentType}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                  {filteredMentionSkills.length ? (
                    <>
                      <div className={cn("px-1 text-[10px] font-semibold uppercase text-muted-foreground", filteredMentionAgents.length ? "mb-1 mt-2" : "mb-1")}>
                        {i18n.chat.mentionSkills}
                      </div>
                      <div className="grid gap-0.5">
                        {filteredMentionSkills.map((skill) => {
                          const optionIndex = mentionOptions.findIndex((option) => option.id === `skill:${skill.name}`);
                          return (
                            <button
                              key={skill.name}
                              type="button"
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                                optionIndex === highlightedAgentIndex ? "bg-foreground/10 text-foreground" : "text-foreground hover:bg-muted/70",
                              )}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => applyMention(skill.name)}
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium">{skill.name}</div>
                                {skill.ownerAgentId ? <div className="truncate text-[11px] text-muted-foreground">{skill.ownerAgentId}</div> : null}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{i18n.chat.mentionSkillType}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
              {composerAttachments?.length ? (
                <>
                  <ComposerAttachments
                    attachments={composerAttachments}
                    onPreviewImage={openImagePreview}
                    onRemoveAttachment={onRemoveAttachment}
                  />
                  <div className="border-t border-border/60" />
                </>
              ) : null}
              <Textarea
                ref={promptRef}
                rows={3}
                value={prompt}
                onChange={(event) => {
                  const nextPrompt = event.target.value;
                  onPromptChange(nextPrompt);
                  syncAgentMention(nextPrompt, event.target.selectionStart ?? nextPrompt.length);
                }}
                onClick={(event) => syncAgentMention(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                onKeyUp={(event) => {
                  if (shouldIgnoreMentionKeyUp(event.key)) {
                    return;
                  }
                  syncAgentMention(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
                }}
                onKeyDown={(event) => {
                  if (agentMention && mentionOptions.length) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setHighlightedAgentIndex((current) => (current + 1) % mentionOptions.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setHighlightedAgentIndex((current) => (current - 1 + mentionOptions.length) % mentionOptions.length);
                      return;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      applyMention(mentionOptions[highlightedAgentIndex]?.value || mentionOptions[0]?.value);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setAgentMention(null);
                      setHighlightedAgentIndex(0);
                      return;
                    }
                  }
                  onPromptKeyDown(event);
                }}
                onSelect={(event) => syncAgentMention(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                placeholder={i18n.chat.promptPlaceholder}
                className="min-h-[7.5rem] resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
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
                    className="h-10 w-10 rounded-xl border-0 bg-transparent p-0 text-muted-foreground shadow-none transition hover:bg-muted/60 hover:text-foreground"
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    <Paperclip className="h-4.5 w-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{i18n.chat.uploadAttachment}</TooltipContent>
              </Tooltip>
              <Button
                onClick={onSend}
                className="cc-send-button h-10 min-w-[7.5rem] rounded-xl px-4 text-sm font-medium"
              >
                <span className="inline-flex w-full -translate-x-[3px] items-center justify-center gap-2 leading-none">
                  <Send className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-center leading-none">{i18n.chat.send}</span>
                </span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <FilePreviewOverlay files={files} preview={filePreview} resolvedTheme={resolvedTheme} onClose={closeFilePreview} onOpenFilePreview={handleOpenPreview} />
      <ImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
    </>
  );
}
