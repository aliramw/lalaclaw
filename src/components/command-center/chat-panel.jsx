import { ArrowDown, ArrowUp, ArrowUpToLine, Check, Copy, Paperclip, RotateCcw, Send, Square, X } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilePreviewOverlay, ImagePreviewOverlay } from "@/components/command-center/file-preview-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { isOfflineStatus } from "@/features/session/status-display";
import { createConversationKey } from "@/features/app/storage";
import { cn, formatShortcutForPlatform } from "@/lib/utils";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import { useI18n } from "@/lib/i18n";

const bubbleBaseClassName =
  "min-w-0 transition-[border-color,background-color,box-shadow,color] duration-200";

const bubbleContentClassName = "px-3 py-2.5";

const userBubbleClassName = "ring-0";

const assistantBubbleClassName = "";
const artifactFocusScrollDurationMs = 320;
const focusHighlightDurationMs = 1400;

const assistantCompactThreshold = 72;
const chatFontSizeClassNames = {
  small: {
    userText: "text-[12px] font-normal leading-5",
    markdown: "text-[11px] leading-[1.15rem]",
    compactMarkdown: "text-[11px] leading-[1.15rem] [&_p]:mb-0 [&_p]:whitespace-nowrap",
    pendingMarkdown: "text-[11px] font-semibold leading-[1.15rem] [&_p]:mb-0 [&_p]:whitespace-nowrap",
    meta: "text-[11px] leading-5",
    label: "text-[11px] leading-4",
    tokenBadge: "text-[10px]",
    queued: "text-[12px] leading-5",
  },
  medium: {
    userText: "text-[13px] font-normal leading-6",
    markdown: "text-[12px] leading-5",
    compactMarkdown: "text-[12px] leading-5 [&_p]:mb-0 [&_p]:whitespace-nowrap",
    pendingMarkdown: "text-[12px] font-semibold leading-5 [&_p]:mb-0 [&_p]:whitespace-nowrap",
    meta: "text-[12px] leading-5",
    label: "text-[12px] leading-5",
    tokenBadge: "text-[11px]",
    queued: "text-[13px] leading-6",
  },
  large: {
    userText: "text-[15px] font-normal leading-7",
    markdown: "text-[14px] leading-6",
    compactMarkdown: "text-[14px] leading-6 [&_p]:mb-0 [&_p]:whitespace-nowrap",
    pendingMarkdown: "text-[14px] font-semibold leading-6 [&_p]:mb-0 [&_p]:whitespace-nowrap",
    meta: "text-[13px] leading-6",
    label: "text-[13px] leading-5",
    tokenBadge: "text-[12px]",
    queued: "text-[14px] leading-6",
  },
};

function resolveChatFontSizeStyles(chatFontSize = "small") {
  return chatFontSizeClassNames[chatFontSize] || chatFontSizeClassNames.small;
}

const chatFontSizeButtonClassNames = {
  small: "text-[12px]",
  medium: "text-[14px]",
  large: "text-[16px]",
};

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

function MessageAttachments({ attachments, mode = "message", onPreviewImage, scrollAnchorBaseId = "" }) {
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
              data-scroll-anchor-id={scrollAnchorBaseId ? `${scrollAnchorBaseId}-image-${attachment.id}` : undefined}
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
            <div
              key={attachment.id}
              data-scroll-anchor-id={scrollAnchorBaseId ? `${scrollAnchorBaseId}-file-${attachment.id}` : undefined}
              className="flex items-center gap-2 rounded-md border border-border/70 bg-background/75 px-2.5 py-2 text-[11px] leading-4"
            >
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
    <div>
      <div className="flex min-h-56 flex-col items-center justify-center gap-4 py-10 text-center">
        <Send className="h-8 w-8 text-foreground/85" />
        <div className="space-y-1">
          <div className="text-sm font-medium">{messages.chat.waitingFirstPrompt}</div>
          <div className="text-sm text-muted-foreground">{messages.chat.conversationWillAppear}</div>
        </div>
      </div>
    </div>
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
      return getConversationMessageId(entry, index);
    }
  }
  return "";
}

function getConversationMessageId(message = {}, index = 0) {
  const explicitId = String(message?.id || "").trim();
  if (explicitId) {
    return explicitId;
  }

  return `${message?.timestamp || "message"}-${index}`;
}

function calculatePinnedLatestBubbleScrollTop(viewport, bubble, ratio = 0.2) {
  if (!viewport || !bubble) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleTop = viewport.scrollTop + (bubbleRect.top - viewportRect.top);
  const targetTop = bubbleTop - viewport.clientHeight * ratio;

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

export function shouldShowBubbleTopJumpButton({ viewportRect, bubbleRect, viewportClientHeight = 0 }) {
  if (!viewportRect || !bubbleRect) {
    return false;
  }

  const bubbleHeight = Number(bubbleRect.height) || Math.max(0, Number(bubbleRect.bottom || 0) - Number(bubbleRect.top || 0));
  const minTallHeight = Math.min(96, Math.max(56, viewportClientHeight * 0.18));
  const bubbleTallEnough = bubbleHeight >= minTallHeight;
  const bubbleTopHidden = bubbleRect.top <= viewportRect.top - 8;
  const bubbleNotFullyVisible = bubbleTopHidden || bubbleRect.bottom >= viewportRect.bottom - 8;
  const bubbleStillVisible = bubbleRect.bottom > viewportRect.top + 24;

  return bubbleTallEnough && bubbleTopHidden && bubbleNotFullyVisible && bubbleStillVisible;
}

function isEditableTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  return Boolean(target.closest("textarea, input, select, [contenteditable='true'], [contenteditable='']"));
}

function isManualScrollKey(event) {
  const key = String(event?.key || "");
  return [
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
    "Spacebar",
  ].includes(key);
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="pointer-events-none inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/75 opacity-0 transition hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100"
          aria-label={copied ? messages.chat.copiedMessage : messages.chat.copyMessage}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? messages.chat.copiedMessageTitle : messages.chat.copyMessageTitle}</TooltipContent>
    </Tooltip>
  );
}

function PreviousUserMessageButton({ onClick }) {
  const { messages } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-none inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/75 opacity-0 transition hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100"
          aria-label={messages.chat.jumpToPreviousUserMessage}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{messages.chat.jumpToPreviousUserMessage}</TooltipContent>
    </Tooltip>
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

function MessageMeta({
  content,
  copyFirst = false,
  formatTime,
  onJumpPreviousUserMessage,
  pending,
  sticky,
  compact,
  timestamp,
  textClassName,
}) {
  const baseClassName = cn(
    "flex items-center gap-1 text-muted-foreground tabular-nums",
    textClassName,
    sticky ? "sticky top-0" : "",
    compact ? "self-center" : "self-start pt-2.5",
  );

  if (copyFirst) {
    return (
      <div className={baseClassName}>
        {onJumpPreviousUserMessage ? <PreviousUserMessageButton onClick={onJumpPreviousUserMessage} /> : null}
        {pending ? null : <CopyMessageButton content={content} />}
        <time>{formatTime(timestamp)}</time>
      </div>
    );
  }

  return (
    <div className={baseClassName}>
      <time>{formatTime(timestamp)}</time>
      {pending ? null : <CopyMessageButton content={content} />}
      {onJumpPreviousUserMessage ? <PreviousUserMessageButton onClick={onJumpPreviousUserMessage} /> : null}
    </div>
  );
}

function MessageOutline({ headingScopeId, items, onSelect }) {
  const { messages } = useI18n();

  return (
    <aside className="w-40 shrink-0 self-start rounded-[5px] border border-border/70 bg-muted/20 p-2">
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

function MessageLabel({ align = "left", value, textClassName }) {
  return (
    <div
      className={cn(
        "mb-1 max-w-full truncate px-1 text-muted-foreground/85",
        textClassName,
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {value}
    </div>
  );
}

function AgentLabel({ tokenBadge, value, textClassName, tokenBadgeClassName }) {
  return (
    <div className={cn("mb-1 flex max-w-full items-center gap-2 px-1 text-muted-foreground/85", textClassName)}>
      <span className="truncate">
        {value}
      </span>
      {tokenBadge ? <span className={cn("shrink-0 text-muted-foreground/70", tokenBadgeClassName)}>{tokenBadge}</span> : null}
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
  animateViewportScroll,
  bubbleAnchorRef,
  files,
  formatTime,
  handleOpenFilePreview,
  handleOpenImagePreview,
  isHighlighted,
  isLatestAssistant,
  isStreamingAssistant,
  markUserScrollTakeover,
  message,
  messageId,
  messageViewportRef,
  onJumpPreviousMessage,
  previousMessageId,
  resolvedTheme,
  chatFontSize,
  userLabel,
}) {
  const [showBubbleTopJump, setShowBubbleTopJump] = useState(false);
  const bubbleRef = useRef(null);
  const isUser = message.role === "user";
  const isPending = Boolean(message.pending);
  const supportsBubbleTopJump = !messageHasVisualMedia(message);
  const useCompactAssistantBubble = useMemo(
    () => !isUser && !isPending && shouldUseCompactAssistantBubble(message.content),
    [isPending, isUser, message.content],
  );
  const visualLineCount = estimateVisualLineCount(message.content);
  const compactMeta = visualLineCount <= 1;
  const outlineItems = useMemo(
    () => (!isUser && !isPending && !isStreamingAssistant ? extractHeadingOutline(message.content) : []),
    [isPending, isStreamingAssistant, isUser, message.content],
  );
  const shouldShowOutline = outlineItems.length >= 2;
  const headingScopeId = `message-${messageId}`;
  const fontSizeStyles = resolveChatFontSizeStyles(chatFontSize);
  const userBubbleWidthClassName = "w-fit min-w-[3.75rem] max-w-[min(86vw,40rem)]";
  const compactAssistantWidthClassName = "inline-block max-w-[min(80vw,42rem)] shrink-0";
  const longAssistantWidthClassName = "w-[700px] max-w-[calc(100vw-12rem)] shrink-0";
  const streamingAssistantBubbleClassName = isStreamingAssistant ? "cc-streaming-bubble motion-reduce:animate-none" : "";
  const focusBubbleClassName = isHighlighted ? "cc-focus-highlight" : "";
  const messageBubbleAttributes = {
    "data-message-anchor": isLatestAssistant ? "latest-assistant" : undefined,
    "data-message-highlighted": isHighlighted ? "true" : undefined,
    "data-message-id": messageId,
    "data-message-role": message.role,
    "data-message-timestamp": String(message.timestamp || ""),
  };

  const handleSelectHeading = (anchorId) => {
    const element = document.getElementById(anchorId);
    if (!element) {
      return;
    }
    markUserScrollTakeover();
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

    markUserScrollTakeover({ force: true, lockAutoFollow: true });
    const top = calculateBubbleTopFocusScrollTop(viewport, bubble);
    animateViewportScroll?.(viewport, top, artifactFocusScrollDurationMs);
  };

  const handleJumpPreviousMessage = () => {
    if (!previousMessageId) {
      return;
    }
    onJumpPreviousMessage?.(previousMessageId);
  };

  const bubbleTopJumpButton = supportsBubbleTopJump && showBubbleTopJump
    ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} />
    : null;

  useEffect(() => {
    const eligibleForBubbleTopJump = supportsBubbleTopJump && !isUser && !isPending && !useCompactAssistantBubble;
    if (!eligibleForBubbleTopJump) {
      setShowBubbleTopJump(false);
      return undefined;
    }

    const viewport = messageViewportRef?.current;
    const bubble = bubbleRef.current;
    if (!viewport || !bubble) {
      setShowBubbleTopJump(false);
      return undefined;
    }

    const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
    let resizeObserver = null;
    let frameId = 0;

    const updateBubbleTopJump = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      setShowBubbleTopJump(
        shouldShowBubbleTopJumpButton({
          viewportRect,
          bubbleRect,
          viewportClientHeight: viewport.clientHeight,
        }),
      );
    };

    updateBubbleTopJump();
    viewport.addEventListener("scroll", updateBubbleTopJump, { passive: true });
    window.addEventListener("resize", updateBubbleTopJump);

    if (ResizeObserverCtor) {
      resizeObserver = new ResizeObserverCtor(() => {
        window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(updateBubbleTopJump);
      });

      [viewport, bubble, viewport.firstElementChild].filter(Boolean).forEach((node) => resizeObserver.observe(node));
    }

    return () => {
      viewport.removeEventListener("scroll", updateBubbleTopJump);
      window.removeEventListener("resize", updateBubbleTopJump);
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect?.();
    };
  }, [isPending, isUser, messageViewportRef, message.content, message.pending, message.timestamp, supportsBubbleTopJump, useCompactAssistantBubble]);

  if (isUser) {
    return (
      <>
        <div
          ref={setBubbleNode}
          {...messageBubbleAttributes}
          className="group/message flex w-full justify-end"
        >
          <div className="flex max-w-full flex-col items-end">
            <MessageLabel align="right" value={userLabel} textClassName={fontSizeStyles.label} />
            <div className="flex max-w-full items-center gap-2">
              <MessageMeta
                align="left"
                content={message.content}
                copyFirst
                formatTime={formatTime}
                onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
                pending={false}
                compact
                textClassName={fontSizeStyles.meta}
                timestamp={message.timestamp}
              />
              <Card data-bubble-layout="user" className={cn(bubbleBaseClassName, userBubbleWidthClassName, "cc-user-bubble", userBubbleClassName, focusBubbleClassName)}>
                {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
                <CardContent className={cn(bubbleContentClassName, message.attachments?.length && "space-y-2")}>
                  <MessageAttachments
                    attachments={message.attachments}
                    onPreviewImage={handleOpenImagePreview}
                    scrollAnchorBaseId={`${headingScopeId}-attachment`}
                  />
                  {message.content ? (
                    <div
                      data-scroll-anchor-id={`${headingScopeId}-text`}
                      className={cn("whitespace-pre-wrap", fontSizeStyles.userText)}
                      style={{ color: "#ffffff" }}
                    >
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
        className="group/message flex w-fit max-w-full"
      >
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} textClassName={fontSizeStyles.label} tokenBadgeClassName={fontSizeStyles.tokenBadge} />
          <div className="inline-flex max-w-full items-center gap-2">
            <Card
              data-bubble-layout="compact"
              className={cn(
                bubbleBaseClassName,
                "cc-thinking-bubble inline-block w-fit max-w-[min(60vw,14rem)] shrink-0 motion-reduce:animate-none",
                "cc-assistant-bubble",
                assistantBubbleClassName,
                focusBubbleClassName,
              )}
            >
              {bubbleTopJumpButton}
              <CardContent className={bubbleContentClassName}>
                <MarkdownContent
                  content={message.content}
                  files={files}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  onOpenFilePreview={handleOpenFilePreview}
                  onOpenImagePreview={handleOpenImagePreview}
                  className={fontSizeStyles.pendingMarkdown}
                />
              </CardContent>
            </Card>
            <MessageMeta align="right" content={message.content} formatTime={formatTime} pending compact textClassName={fontSizeStyles.meta} timestamp={message.timestamp} />
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
        className="group/message flex w-fit max-w-full"
      >
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} textClassName={fontSizeStyles.label} tokenBadgeClassName={fontSizeStyles.tokenBadge} />
          <div className="inline-flex max-w-full items-start gap-1.5">
          <div className="inline-flex min-w-0 max-w-full items-start gap-3">
              <div className="min-w-0 shrink-0">
                {bubbleTopJumpButton}
              <Card
                data-bubble-layout="full"
              className={cn(
                bubbleBaseClassName,
                "w-[700px] max-w-[calc(100vw-20rem)] shrink-0",
                "relative overflow-hidden",
                "cc-assistant-bubble",
                streamingAssistantBubbleClassName,
                assistantBubbleClassName,
                focusBubbleClassName,
                )}
              >
                <CardContent className={bubbleContentClassName}>
                <MarkdownContent
                  content={message.content}
                  files={files}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  onOpenFilePreview={handleOpenFilePreview}
                  onOpenImagePreview={handleOpenImagePreview}
                  className={fontSizeStyles.markdown}
                />
                </CardContent>
              </Card>
              </div>
              <div data-message-outline-meta-stack className="sticky top-1 hidden w-40 shrink-0 self-start xl:flex xl:flex-col xl:gap-2">
                <MessageMeta
                  align="left"
                  content={message.content}
                  formatTime={formatTime}
                  onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
                  textClassName={fontSizeStyles.meta}
                  timestamp={message.timestamp}
                />
                <MessageOutline headingScopeId={headingScopeId} items={outlineItems} onSelect={handleSelectHeading} />
              </div>
            </div>
            <div className="xl:hidden">
              <MessageMeta
                align="right"
                content={message.content}
                formatTime={formatTime}
                onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
                sticky
                textClassName={fontSizeStyles.meta}
                timestamp={message.timestamp}
              />
            </div>
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
        className="group/message flex w-fit max-w-full"
      >
        <div className="flex max-w-full flex-col items-start">
          <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} textClassName={fontSizeStyles.label} tokenBadgeClassName={fontSizeStyles.tokenBadge} />
          <div className="inline-flex max-w-full items-center gap-2">
            <div className="min-w-0 shrink-0">
              {bubbleTopJumpButton}
            <Card
              data-bubble-layout="compact"
              className={cn(
                bubbleBaseClassName,
                compactAssistantWidthClassName,
                "relative overflow-hidden",
                "cc-assistant-bubble",
                streamingAssistantBubbleClassName,
                assistantBubbleClassName,
                focusBubbleClassName,
              )}
            >
              <CardContent className={bubbleContentClassName}>
                  <MarkdownContent
                    content={message.content}
                    files={files}
                    headingScopeId={headingScopeId}
                    resolvedTheme={resolvedTheme}
                    onOpenFilePreview={handleOpenFilePreview}
                    onOpenImagePreview={handleOpenImagePreview}
                    className={fontSizeStyles.compactMarkdown}
                  />
                </CardContent>
              </Card>
            </div>
            <MessageMeta
              align="right"
              content={message.content}
              formatTime={formatTime}
              onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
              compact={compactMeta}
              textClassName={fontSizeStyles.meta}
              timestamp={message.timestamp}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setBubbleNode}
      {...messageBubbleAttributes}
      className="group/message flex w-fit max-w-full"
    >
      <div className="flex max-w-full flex-col items-start">
        <AgentLabel value={agentLabel} tokenBadge={message.tokenBadge} textClassName={fontSizeStyles.label} tokenBadgeClassName={fontSizeStyles.tokenBadge} />
        <div className="inline-flex max-w-full items-start gap-2">
          <div className="min-w-0 shrink-0">
            {bubbleTopJumpButton}
          <Card
            data-bubble-layout="full"
            className={cn(
              bubbleBaseClassName,
              longAssistantWidthClassName,
              "relative overflow-hidden",
              "cc-assistant-bubble",
              streamingAssistantBubbleClassName,
              assistantBubbleClassName,
              focusBubbleClassName,
            )}
          >
            <CardContent className={bubbleContentClassName}>
              <MarkdownContent
                content={message.content}
                files={files}
                headingScopeId={headingScopeId}
                resolvedTheme={resolvedTheme}
                onOpenFilePreview={handleOpenFilePreview}
                onOpenImagePreview={handleOpenImagePreview}
                className={fontSizeStyles.markdown}
              />
            </CardContent>
          </Card>
          </div>
          <MessageMeta
            align="right"
            content={message.content}
            formatTime={formatTime}
            onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
            sticky
            textClassName={fontSizeStyles.meta}
            timestamp={message.timestamp}
          />
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.agentLabel === nextProps.agentLabel
    && prevProps.isHighlighted === nextProps.isHighlighted
    && prevProps.isLatestAssistant === nextProps.isLatestAssistant
    && prevProps.isStreamingAssistant === nextProps.isStreamingAssistant
    && prevProps.markUserScrollTakeover === nextProps.markUserScrollTakeover
    && prevProps.formatTime === nextProps.formatTime
    && prevProps.messageId === nextProps.messageId
    && prevProps.messageViewportRef === nextProps.messageViewportRef
    && prevProps.onJumpPreviousMessage === nextProps.onJumpPreviousMessage
    && prevProps.previousMessageId === nextProps.previousMessageId
    && prevProps.resolvedTheme === nextProps.resolvedTheme
    && prevProps.separated === nextProps.separated
    && prevProps.chatFontSize === nextProps.chatFontSize
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
  const isOffline = isOfflineStatus(session.status);
  const isOpenClaw = session.mode === "openclaw";
  const toneClassName = isOffline ? "bg-rose-500" : isOpenClaw ? "bg-emerald-500" : "bg-slate-400";
  const statusLabel = isOffline
    ? messages.chat.connectionStatusDisconnected
    : isOpenClaw
      ? messages.chat.connectionStatusConnected
      : messages.chat.connectionStatusLocal;
  const statusHint = isOffline ? messages.chat.disconnectedPlaceholder : messages.chat.composerHint;
  const tooltipDetail = isOffline
    ? messages.chat.connectionStatusDisconnected
    : isOpenClaw
      ? messages.chat.connectionStatusConnected
      : messages.chat.connectionStatusLocal;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-2">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", toneClassName)} aria-hidden="true" />
            <span>{statusLabel}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="px-2.5 py-2">
          <div className="space-y-0.5">
            <div>{messages.chat.openClawStatusTooltip}</div>
            <div className="text-[11px] text-muted-foreground">{tooltipDetail}</div>
          </div>
        </TooltipContent>
      </Tooltip>
      <span aria-hidden="true">-</span>
      <span>{statusHint}</span>
    </span>
  );
}

function QueuedMessages({ items, textClassName }) {
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
          <div key={item.id} className={cn("rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5", textClassName)}>
            <span className="mr-2 text-[10px] text-muted-foreground">#{index + 1}</span>
            <span className="line-clamp-2 whitespace-pre-wrap">{item.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatTabsStrip({
  className = "",
  items = [],
  leadingControl = null,
  onActivate,
  onClose,
  onReorder,
  resolvedTheme = "light",
  trailingControl = null,
}) {
  const { messages } = useI18n();
  const [draggingTabId, setDraggingTabId] = useState("");
  const tabNodeMapRef = useRef(new Map());
  const previousTabRectsRef = useRef(new Map());
  const previousOrderSignatureRef = useRef("");
  const draggingTabIdRef = useRef("");
  const lastReorderIntentRef = useRef("");

  useLayoutEffect(() => {
    const currentOrderSignature = items.map((item) => item.id).join("|");
    const nextRects = new Map();

    items.forEach((item) => {
      const node = tabNodeMapRef.current.get(item.id);
      if (!node) {
        return;
      }
      nextRects.set(item.id, node.getBoundingClientRect());
    });

    const shouldAnimateReorder = previousOrderSignatureRef.current && previousOrderSignatureRef.current !== currentOrderSignature;

    if (shouldAnimateReorder) {
      nextRects.forEach((rect, id) => {
        const previousRect = previousTabRectsRef.current.get(id);
        const node = tabNodeMapRef.current.get(id);
        if (!previousRect || !node) {
          return;
        }
        if (draggingTabId && id === draggingTabId) {
          return;
        }

        const deltaX = previousRect.left - rect.left;
        const deltaY = previousRect.top - rect.top;
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          return;
        }

        node.getAnimations?.().forEach((animation) => animation.cancel());
        node.animate?.(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: "translate(0px, 0px)" },
          ],
          {
            duration: 120,
            easing: "linear",
          },
        );
      });
    }

    previousTabRectsRef.current = nextRects;
    previousOrderSignatureRef.current = currentOrderSignature;
  }, [draggingTabId, items]);

  if (!items.length && !leadingControl && !trailingControl) {
    return null;
  }

  const closable = items.length > 1;

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto overflow-y-hidden pt-1 pb-0 pr-3", className)}>
      {leadingControl ? <div className="shrink-0">{leadingControl}</div> : null}
      {items.map((item, index) => {
        const shortcutNumber = index < 9 ? String(index + 1) : null;
        const isClosableActiveTab = closable && item.active;

        return (
          <div
            key={item.id}
            ref={(node) => {
              if (node) {
                tabNodeMapRef.current.set(item.id, node);
                return;
              }
              tabNodeMapRef.current.delete(item.id);
            }}
            draggable={items.length > 1}
            onDragStart={(event) => {
              draggingTabIdRef.current = item.id;
              setDraggingTabId(item.id);
              lastReorderIntentRef.current = "";
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const currentDraggingTabId = draggingTabIdRef.current || draggingTabId;
              if (!currentDraggingTabId || currentDraggingTabId === item.id) {
                return;
              }

              const sourceIndex = items.findIndex((entry) => entry.id === currentDraggingTabId);
              const targetIndex = items.findIndex((entry) => entry.id === item.id);
              if (sourceIndex === -1 || targetIndex === -1) {
                return;
              }

              const rect = event.currentTarget.getBoundingClientRect();
              const placeAfter = event.clientX > rect.left + rect.width / 2;
              const currentIntentKey = `${currentDraggingTabId}:${item.id}:${placeAfter ? "after" : "before"}`;
              if (lastReorderIntentRef.current === currentIntentKey) {
                return;
              }

              if ((placeAfter && sourceIndex === targetIndex + 1) || (!placeAfter && sourceIndex === targetIndex - 1)) {
                return;
              }

              lastReorderIntentRef.current = currentIntentKey;
              onReorder?.(currentDraggingTabId, item.id, placeAfter ? "after" : "before");
            }}
            onDrop={(event) => {
              event.preventDefault();
              draggingTabIdRef.current = "";
              setDraggingTabId("");
              lastReorderIntentRef.current = "";
            }}
            onDragEnd={() => {
              draggingTabIdRef.current = "";
              setDraggingTabId("");
              lastReorderIntentRef.current = "";
            }}
            className={cn(
              "group inline-flex h-9 max-w-[13rem] items-center rounded-md border transition",
              item.active
                ? resolvedTheme === "dark"
                  ? "border-transparent bg-[#0f3e6a] text-white shadow-sm hover:bg-[#0f3e6a]"
                  : "border-transparent bg-[#1677eb] text-white shadow-sm hover:bg-[#0f6fe0]"
                : "border-border/45 bg-muted/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-border/70 hover:bg-muted/88",
              draggingTabId === item.id ? "cursor-grabbing opacity-75" : "cursor-grab",
            )}
          >
            <button
              type="button"
              draggable={false}
              className="inline-flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-sm outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
              onClick={() => onActivate?.(item.id)}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  item.busy
                    ? "cc-chat-tab-busy-dot bg-emerald-500"
                    : item.active ? "bg-white/65" : "bg-muted-foreground/35",
                )}
              />
              <span className={cn("min-w-0 flex-1 truncate font-medium", item.active ? "text-white" : "text-inherit")}>{item.agentId}</span>
              {shortcutNumber && !isClosableActiveTab ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] border text-[11px] font-semibold leading-none tabular-nums",
                        item.active
                          ? "border-white/20 bg-white/12 text-white"
                          : "border-border/60 bg-background/80 text-foreground/80",
                      )}
                    >
                      {shortcutNumber}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {formatShortcutForPlatform(messages.chat.tabSwitchTooltip(shortcutNumber))}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </button>
          {shortcutNumber ? (
            isClosableActiveTab ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    draggable={false}
                    className={cn(
                      "mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold leading-none transition",
                      item.active
                        ? "text-white/90 hover:bg-white/14 hover:text-white"
                        : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose?.(item.id);
                    }}
                    aria-label={messages.chat.closeTabAriaLabel(item.agentId)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[16rem] px-2.5 py-2 text-left">
                  <div className="text-xs font-medium leading-4">{messages.chat.closeTab}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{messages.chat.closeTabHint}</div>
                </TooltipContent>
              </Tooltip>
            ) : null
          ) : null}
          </div>
        );
      })}
      {trailingControl ? <div className="shrink-0">{trailingControl}</div> : null}
    </div>
  );
}

export function ChatPanel({
  agentLabel = "main",
  activeChatTabId,
  busy,
  chatFontSize = "small",
  chatTabs = [],
  composerAttachments,
  files,
  focusMessageRequest,
  formatTime,
  interactionLocked = false,
  messageViewportRef,
  messages,
  onAddAttachments,
  onActivateChatTab,
  onChatFontSizeChange,
  onCloseChatTab,
  onReorderChatTab,
  onRemoveAttachment,
  onPromptChange,
  onPromptKeyDown,
  onReset,
  onSend,
  onStop,
  prompt,
  promptRef,
  queuedMessages,
  resolvedTheme,
  restoredScrollKey = "",
  restoredScrollRevision = 0,
  restoredScrollState = null,
  session,
  agentSwitcher = null,
  brandControl = null,
  sessionOverview = null,
  showTabsStrip = true,
  userLabel = "marila",
}) {
  const { messages: i18n } = useI18n();
  const attachmentInputRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const { filePreview, imagePreview, handleOpenPreview, openImagePreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const [agentMention, setAgentMention] = useState(null);
  const [manualMention, setManualMention] = useState(null);
  const [mentionAnchor, setMentionAnchor] = useState("composer");
  const [highlightedAgentIndex, setHighlightedAgentIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [showLatestReplyButton, setShowLatestReplyButton] = useState(false);
  const mentionMenuRef = useRef(null);
  const latestAssistantBubbleRef = useRef(null);
  const fontSizeStyles = resolveChatFontSizeStyles(chatFontSize);
  const mentionOptionStateClassName = resolvedTheme === "dark" ? "bg-[#373737] text-foreground" : "bg-[#e5e5e5] text-foreground";
  const mentionOptionHoverClassName = resolvedTheme === "dark" ? "text-foreground hover:bg-[#373737]/85" : "text-foreground hover:bg-[#e5e5e5]/85";
  const chatFontSizeOptions = [
    { value: "small", label: i18n.chat.fontSizes.small, glyphClassName: chatFontSizeButtonClassNames.small },
    { value: "medium", label: i18n.chat.fontSizes.medium, glyphClassName: chatFontSizeButtonClassNames.medium },
    { value: "large", label: i18n.chat.fontSizes.large, glyphClassName: chatFontSizeButtonClassNames.large },
  ];
  const wasNearBottomRef = useRef(true);
  const autoScrollSuppressedRef = useRef(false);
  const manualScrollLockRef = useRef(false);
  const persistentManualScrollLockRef = useRef(false);
  const pointerScrollIntentRef = useRef(false);
  const scrollModeRef = useRef("follow-bottom");
  const programmaticScrollRef = useRef(false);
  const programmaticScrollResetRef = useRef(0);
  const animatedScrollFrameRef = useRef(0);
  const restoredScrollKeyRef = useRef("");
  const restoredScrollRetryRef = useRef(0);
  const restoredScrollStabilizerRefs = useRef([]);
  const restoreStabilizingRef = useRef(false);
  const focusHighlightStartTimeoutRef = useRef(0);
  const focusHighlightTimeoutRef = useRef(0);
  const previousConversationKeyRef = useRef("");
  const previousLatestMessageCardKeyRef = useRef("");
  const previousLatestUserMessageKeyRef = useRef("");
  const pinTopAllowedForTurnRef = useRef(true);
  const currentAgentName = session.agentId || agentLabel || "main";
  const latestMessageCardKey = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      return "";
    }

    return [lastMessage.role || "", lastMessage.timestamp || "", lastMessage.pending ? "pending" : "done"].join("::");
  }, [messages]);
  const latestUserMessageKey = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role !== "user") {
        continue;
      }

      return getConversationMessageId(candidate, index);
    }

    return "";
  }, [messages]);
  const latestAssistantMessageId = useMemo(() => findLatestAssistantMessageId(messages), [messages]);
  const hasActiveAssistantReply = useMemo(
    () => messages.some((message) => message?.role === "assistant" && (message?.pending || message?.streaming)),
    [messages],
  );
  const showBusyBadge = busy || hasActiveAssistantReply;
  const showStopButton = Boolean(onStop) && showBusyBadge;
  const latestAssistantMessage = useMemo(() => {
    if (!latestAssistantMessageId) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role !== "assistant") {
        continue;
      }
      if (getConversationMessageId(candidate, index) === latestAssistantMessageId) {
        return candidate;
      }
    }

    return null;
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
  const setComposerTextareaNode = useCallback((node) => {
    composerTextareaRef.current = node;
    if (typeof promptRef === "function") {
      promptRef(node);
      return;
    }
    if (promptRef && typeof promptRef === "object") {
      promptRef.current = node;
    }
  }, [promptRef]);

  const mentionableAgents = (session.availableMentionAgents || []).filter((agent) => agent && agent !== session.agentId);
  const mentionableSkills = (session.availableSkills || []).map(normalizeSkillMention).filter(Boolean);
  const activeMention = manualMention || agentMention;
  const filteredMentionAgents = activeMention
    ? mentionableAgents.filter((agent) => agent.toLowerCase().includes(activeMention.query.toLowerCase()))
    : [];
  const filteredMentionSkills = activeMention
    ? mentionableSkills.filter((skill) => skill.name.toLowerCase().includes(activeMention.query.toLowerCase()))
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
  const latestAssistantIsCompactIntro = useMemo(
    () =>
      Boolean(
        latestMessageIsAssistant
        && messages.length === 1
        && latestAssistantMessage
        && shouldUseCompactAssistantBubble(latestAssistantMessage.content),
      ),
    [latestAssistantMessage, latestMessageIsAssistant, messages.length],
  );
  const openClawConnected = session.mode === "openclaw" && !isOfflineStatus(session.status);
  const composerLocked = interactionLocked || !openClawConnected;
  const visibleConversationKey = session?.sessionUser
    ? createConversationKey(session.sessionUser, session.agentId)
    : restoredScrollKey;

  const syncAgentMention = (nextPrompt, caret) => {
    setManualMention(null);
    setMentionAnchor("composer");
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
    if (!activeMention) {
      return;
    }

    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }

    const nextPrompt = `${prompt.slice(0, activeMention.start)}${normalizedValue} ${prompt.slice(activeMention.end)}`;
    const nextCaret = activeMention.start + normalizedValue.length + 1;
    onPromptChange(nextPrompt);
    setAgentMention(null);
    setManualMention(null);
    setMentionAnchor("composer");
    setHighlightedAgentIndex(0);

    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange?.(nextCaret, nextCaret);
    });
  };

  const handleMentionPointerSelect = useCallback((event, value) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    applyMention(value);
  }, [applyMention]);

  const handleMentionClick = useCallback((event, value) => {
    if (event.detail !== 0) {
      return;
    }
    applyMention(value);
  }, [applyMention]);

  const focusComposer = useCallback(() => {
    const focusTextarea = () => {
      const textarea = composerTextareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange?.(end, end);
    };

    focusTextarea();
    window.requestAnimationFrame(focusTextarea);
  }, []);

  const openMentionMenu = useCallback(() => {
    if (!mentionableAgents.length && !mentionableSkills.length) {
      return;
    }

    window.requestAnimationFrame(() => {
      const textarea = composerTextareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      const selectionStart = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
      const selectionEnd = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : selectionStart;
      setManualMention({
        start: selectionStart,
        end: selectionEnd,
        query: "",
      });
      setMentionAnchor("actions");
      setAgentMention(null);
      setHighlightedAgentIndex(0);
    });
  }, [mentionableAgents.length, mentionableSkills.length]);

  const addAttachmentsAndFocus = useCallback(async (fileList) => {
    if (!fileList) {
      return;
    }

    await onAddAttachments?.(fileList);
    focusComposer();
  }, [focusComposer, onAddAttachments]);

  const cancelAnimatedViewportScroll = useCallback(() => {
    window.cancelAnimationFrame(animatedScrollFrameRef.current);
    animatedScrollFrameRef.current = 0;
    window.clearTimeout(programmaticScrollResetRef.current);
    programmaticScrollRef.current = false;
  }, []);

  const markUserScrollTakeover = useCallback(({ force = false, lockAutoFollow = false } = {}) => {
    cancelAnimatedViewportScroll();
    window.clearTimeout(restoredScrollRetryRef.current);
    restoredScrollStabilizerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    restoredScrollStabilizerRefs.current = [];
    restoreStabilizingRef.current = false;
    if (force || !programmaticScrollRef.current) {
      pinTopAllowedForTurnRef.current = false;
      autoScrollSuppressedRef.current = true;
      scrollModeRef.current = "manual";
      if (lockAutoFollow) {
        manualScrollLockRef.current = true;
        persistentManualScrollLockRef.current = true;
      }
      if (restoredScrollKey) {
        restoredScrollKeyRef.current = `${restoredScrollKey}:${restoredScrollRevision}`;
      }
    }
  }, [cancelAnimatedViewportScroll, restoredScrollKey, restoredScrollRevision]);

  const resumeAutomaticLatestReplyFollow = useCallback((nextMode = "follow-bottom") => {
    manualScrollLockRef.current = false;
    persistentManualScrollLockRef.current = false;
    autoScrollSuppressedRef.current = false;
    scrollModeRef.current = nextMode;
  }, []);

  const scrollViewport = useCallback((viewport, top, behavior = "auto", holdMs = 0) => {
    if (!viewport) {
      return;
    }

    cancelAnimatedViewportScroll();
    programmaticScrollRef.current = true;
    window.clearTimeout(programmaticScrollResetRef.current);
    viewport.scrollTo?.({ top, behavior });
    if (typeof viewport.scrollTo !== "function") {
      viewport.scrollTop = top;
    }
    programmaticScrollResetRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, Math.max(0, Number(holdMs) || 0));
  }, [cancelAnimatedViewportScroll]);

  const animateViewportScroll = useCallback((viewport, top, duration = 320) => {
    if (!viewport) {
      return;
    }

    cancelAnimatedViewportScroll();
    const startTop = Number(viewport.scrollTop) || 0;
    const targetTop = Number.isFinite(top) ? top : startTop;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 1 || duration <= 0) {
      viewport.scrollTop = targetTop;
      return;
    }

    const startedAt = window.performance?.now?.() ?? 0;
    programmaticScrollRef.current = true;

    const finish = () => {
      viewport.scrollTop = targetTop;
      animatedScrollFrameRef.current = 0;
      programmaticScrollResetRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 0);
    };

    const step = (frameTime) => {
      if (!Number.isFinite(frameTime)) {
        finish();
        return;
      }

      const progress = Math.min(1, (frameTime - startedAt) / duration);
      const easedProgress = 1 - ((1 - progress) ** 3);
      viewport.scrollTop = startTop + distance * easedProgress;

      if (progress >= 1) {
        finish();
        return;
      }

      animatedScrollFrameRef.current = window.requestAnimationFrame(step);
    };

    animatedScrollFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelAnimatedViewportScroll]);

  const queueFocusHighlight = useCallback((messageId, delayMs = 0) => {
    const resolvedMessageId = String(messageId || "").trim();
    if (!resolvedMessageId) {
      return;
    }

    window.clearTimeout(focusHighlightStartTimeoutRef.current);
    window.clearTimeout(focusHighlightTimeoutRef.current);
    setHighlightedMessageId("");

    focusHighlightStartTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId(resolvedMessageId);
      focusHighlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === resolvedMessageId ? "" : current));
      }, focusHighlightDurationMs);
    }, Math.max(0, Number(delayMs) || 0));
  }, []);

  useEffect(() => () => {
    window.clearTimeout(focusHighlightStartTimeoutRef.current);
    window.clearTimeout(focusHighlightTimeoutRef.current);
    cancelAnimatedViewportScroll();
  }, [cancelAnimatedViewportScroll]);

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
    if (!activeMention) {
      return;
    }
    if (!mentionOptions.length) {
      setHighlightedAgentIndex(0);
      return;
    }
    setHighlightedAgentIndex((current) => Math.min(current, mentionOptions.length - 1));
  }, [activeMention, mentionOptions.length]);

  useEffect(() => {
    if (!activeMention || !mentionOptions.length) {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const target = event.target;
      if (mentionMenuRef.current?.contains(target)) {
        return;
      }
      setAgentMention(null);
      setManualMention(null);
      setMentionAnchor("composer");
      setHighlightedAgentIndex(0);
    };

    window.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDownOutside, true);
    };
  }, [activeMention, mentionOptions.length]);

  useLayoutEffect(() => {
    if (previousConversationKeyRef.current !== visibleConversationKey) {
      const viewport = messageViewportRef?.current;
      previousConversationKeyRef.current = visibleConversationKey;
      previousLatestMessageCardKeyRef.current = latestMessageCardKey;
      previousLatestUserMessageKeyRef.current = latestUserMessageKey;
      manualScrollLockRef.current = false;
      persistentManualScrollLockRef.current = false;
      autoScrollSuppressedRef.current = false;
      scrollModeRef.current = "follow-bottom";
      wasNearBottomRef.current = true;
      restoredScrollKeyRef.current = "";
      if (viewport) {
        const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop = top;
      }
      setShowLatestReplyButton(false);
      return;
    }

    const latestMessage = messages[messages.length - 1];
    const previousLatestMessageCardKey = previousLatestMessageCardKeyRef.current;
    previousLatestMessageCardKeyRef.current = latestMessageCardKey;
    const previousLatestUserMessageKey = previousLatestUserMessageKeyRef.current;
    previousLatestUserMessageKeyRef.current = latestUserMessageKey;
    const shouldPreserveManualViewport = manualScrollLockRef.current
      || autoScrollSuppressedRef.current
      || !wasNearBottomRef.current;

    if (latestUserMessageKey && latestUserMessageKey !== previousLatestUserMessageKey) {
      if (shouldPreserveManualViewport) {
        pinTopAllowedForTurnRef.current = false;
      } else {
        pinTopAllowedForTurnRef.current = true;
        resumeAutomaticLatestReplyFollow("follow-bottom");
      }
    }

    if (!latestMessage || latestMessage.role !== "user" || latestMessageCardKey === previousLatestMessageCardKey) {
      return;
    }

    if (shouldPreserveManualViewport) {
      return;
    }

    const viewport = messageViewportRef?.current;
    resumeAutomaticLatestReplyFollow("follow-bottom");
    if (viewport) {
      const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      scrollViewport(viewport, top, "auto");
      wasNearBottomRef.current = true;
      setShowLatestReplyButton(false);
    }
  }, [
    latestMessageCardKey,
    latestUserMessageKey,
    messageViewportRef,
    messages,
    resumeAutomaticLatestReplyFollow,
    scrollViewport,
    visibleConversationKey,
  ]);

  useLayoutEffect(() => {
    const viewport = messageViewportRef?.current;
    const restoreSignature = `${restoredScrollKey}:${restoredScrollRevision}`;
    const restoreToBottom = Boolean(restoredScrollState?.atBottom);
    const fallbackTop = Number(restoredScrollState?.scrollTop);
    const anchorNodeId = String(restoredScrollState?.anchorNodeId || "").trim();
    const anchorMessageId = String(restoredScrollState?.anchorMessageId || "").trim();
    const anchorOffset = Number(restoredScrollState?.anchorOffset || 0);
    if (
      !viewport
      || !messages.length
      || manualScrollLockRef.current
      || !restoredScrollKey
      || visibleConversationKey !== restoredScrollKey
      || restoredScrollKeyRef.current === restoreSignature
    ) {
      return;
    }

    const applyRestoredScroll = () => {
      const latestViewport = messageViewportRef?.current;
      if (!latestViewport) {
        return false;
      }

      let nextTop = restoreToBottom
        ? Math.max(0, latestViewport.scrollHeight - latestViewport.clientHeight)
        : Number.isFinite(fallbackTop) ? fallbackTop : latestViewport.scrollTop;
      let usedAnchor = false;

      const anchorSelector = restoreToBottom
        ? ""
        : anchorNodeId
          ? `[data-scroll-anchor-id="${anchorNodeId}"]`
          : anchorMessageId
            ? `[data-message-id="${anchorMessageId}"]`
            : "";

      if (anchorSelector) {
        const anchorNode = latestViewport.querySelector(anchorSelector);
        if (anchorNode) {
          const viewportRect = latestViewport.getBoundingClientRect();
          const anchorRect = anchorNode.getBoundingClientRect();
          nextTop = latestViewport.scrollTop + (anchorRect.top - viewportRect.top) - (Number.isFinite(anchorOffset) ? anchorOffset : 0);
          usedAnchor = true;
        }
      }

      const maxTop = Math.max(0, latestViewport.scrollHeight - latestViewport.clientHeight);
      const resolvedTop = Math.max(0, Math.min(nextTop, maxTop));
      latestViewport.scrollTop = resolvedTop;
      const isNearBottom = maxTop - resolvedTop <= 48;
      wasNearBottomRef.current = isNearBottom;
      autoScrollSuppressedRef.current = restoreToBottom ? false : !isNearBottom;
      scrollModeRef.current = restoreToBottom
        ? "force-bottom"
        : isNearBottom
          ? "follow-bottom"
          : "manual";
      return usedAnchor;
    };

    window.clearTimeout(restoredScrollRetryRef.current);
    restoredScrollStabilizerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    restoredScrollStabilizerRefs.current = [];
    const usedAnchor = applyRestoredScroll();
    restoredScrollKeyRef.current = restoreSignature;
    restoreStabilizingRef.current = true;
    const cleanupImageListeners = [];
    let resizeObserver = null;
    let resizeFrameId = 0;

    if (!restoreToBottom && (anchorNodeId || anchorMessageId) && !usedAnchor) {
      restoredScrollRetryRef.current = window.setTimeout(() => {
        if (restoredScrollKeyRef.current !== restoreSignature) {
          return;
        }
        applyRestoredScroll();
      }, 80);
    }

    const scheduleRestoreStabilizer = (delay) =>
      window.setTimeout(() => {
        if (restoredScrollKeyRef.current !== restoreSignature || !restoreStabilizingRef.current) {
          return;
        }
        applyRestoredScroll();
      }, delay);

    restoredScrollStabilizerRefs.current = [40, 120, 240, 480].map(scheduleRestoreStabilizer);

    const latestViewport = messageViewportRef?.current;
    if (latestViewport) {
      latestViewport.querySelectorAll("img").forEach((imageNode) => {
        if (imageNode.complete) {
          return;
        }

        const handleImageLoad = () => {
      if (restoredScrollKeyRef.current !== restoreSignature || !restoreStabilizingRef.current) {
        return;
      }
          applyRestoredScroll();
        };

        imageNode.addEventListener("load", handleImageLoad, { once: true });
        cleanupImageListeners.push(() => imageNode.removeEventListener("load", handleImageLoad));
      });

      const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
      const anchorSelector = restoreToBottom
        ? ""
        : anchorNodeId
          ? `[data-scroll-anchor-id="${anchorNodeId}"]`
          : anchorMessageId
            ? `[data-message-id="${anchorMessageId}"]`
            : "";
      const observedNodes = [
        latestViewport.firstElementChild,
        anchorSelector ? latestViewport.querySelector(anchorSelector) : null,
      ].filter(Boolean);

      if (ResizeObserverCtor && observedNodes.length) {
        resizeObserver = new ResizeObserverCtor(() => {
          if (restoredScrollKeyRef.current !== restoreSignature || !restoreStabilizingRef.current) {
            return;
          }
          window.cancelAnimationFrame(resizeFrameId);
          resizeFrameId = window.requestAnimationFrame(() => {
            applyRestoredScroll();
          });
        });

        observedNodes.forEach((node) => resizeObserver.observe(node));
      }
    }

    return () => {
      window.clearTimeout(restoredScrollRetryRef.current);
      restoredScrollStabilizerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
      restoredScrollStabilizerRefs.current = [];
      restoreStabilizingRef.current = false;
      window.cancelAnimationFrame(resizeFrameId);
      resizeObserver?.disconnect?.();
      cleanupImageListeners.forEach((cleanup) => cleanup());
    };
  }, [messageViewportRef, messages, restoredScrollKey, restoredScrollRevision, restoredScrollState, session?.agentId, session?.sessionUser]);

  useEffect(() => {
    const viewport = messageViewportRef?.current;
    if (!viewport) {
      return undefined;
    }

    const updateWasNearBottom = (markManual = false) => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const isNearBottom = distanceFromBottom <= 48;
      wasNearBottomRef.current = isNearBottom;
      if (isNearBottom) {
        if (manualScrollLockRef.current && programmaticScrollRef.current) {
          return;
        }
        if (persistentManualScrollLockRef.current && !markManual) {
          autoScrollSuppressedRef.current = true;
          scrollModeRef.current = "manual";
          return;
        }
        persistentManualScrollLockRef.current = false;
        manualScrollLockRef.current = false;
        autoScrollSuppressedRef.current = false;
        if (scrollModeRef.current === "manual") {
          scrollModeRef.current = "follow-bottom";
        }
        return;
      }
      if (markManual && !programmaticScrollRef.current) {
        autoScrollSuppressedRef.current = true;
        scrollModeRef.current = "manual";
      }
    };

    const handleViewportScroll = () => updateWasNearBottom(pointerScrollIntentRef.current);
    const markManualTakeover = () => {
      markUserScrollTakeover();
    };
    const handlePointerDown = () => {
      pointerScrollIntentRef.current = true;
    };
    const clearPointerIntent = () => {
      pointerScrollIntentRef.current = false;
    };

    updateWasNearBottom(false);
    viewport.addEventListener("scroll", handleViewportScroll, { passive: true });
    viewport.addEventListener("wheel", markManualTakeover, { passive: true });
    viewport.addEventListener("touchmove", markManualTakeover, { passive: true });
    viewport.addEventListener("pointerdown", handlePointerDown, { passive: true });
    const handleAnchorClick = (event) => {
      const target = event.target;
      if (target?.closest?.('a[href^="#"]')) {
        markManualTakeover();
      }
    };
    viewport.addEventListener("click", handleAnchorClick, { passive: true, capture: true });
    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target) || !isManualScrollKey(event)) {
        return;
      }
      markManualTakeover();
    };
    const doc = viewport.ownerDocument || document;
    window.addEventListener("keydown", handleKeyDown, { passive: true });
    doc.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("pointerup", clearPointerIntent, { passive: true });
    window.addEventListener("pointercancel", clearPointerIntent, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleViewportScroll);
      viewport.removeEventListener("wheel", markManualTakeover);
      viewport.removeEventListener("touchmove", markManualTakeover);
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("click", handleAnchorClick, true);
      window.removeEventListener("keydown", handleKeyDown);
      doc.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerup", clearPointerIntent);
      window.removeEventListener("pointercancel", clearPointerIntent);
    };
  }, [markUserScrollTakeover, messageViewportRef]);

  const alignLatestAssistantReply = useCallback(() => {
    const viewport = messageViewportRef?.current;
    const latestBubble = latestAssistantBubbleRef.current;
    if (
      !viewport
      || !latestBubble
      || !latestMessageIsAssistant
      || latestAssistantIsCompactIntro
      || manualScrollLockRef.current
      || autoScrollSuppressedRef.current
    ) {
      if (latestAssistantIsCompactIntro) {
        scrollModeRef.current = "follow-bottom";
        wasNearBottomRef.current = true;
        setShowLatestReplyButton(false);
      }
      return false;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const bubbleRect = latestBubble.getBoundingClientRect();
    const pinTop = viewportRect.top + viewport.clientHeight * 0.2;
    const bubbleTop = bubbleRect.top;
    const reachedPinZone = bubbleTop <= pinTop + 4;

    if (scrollModeRef.current === "force-bottom") {
      const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      scrollViewport(viewport, top, "auto");
      wasNearBottomRef.current = true;
      setShowLatestReplyButton(false);
      return true;
    }

    if (pinTopAllowedForTurnRef.current && (scrollModeRef.current === "pin-top" || reachedPinZone)) {
      scrollModeRef.current = "pin-top";
      const top = calculatePinnedLatestBubbleScrollTop(viewport, latestBubble, 0.2);
      scrollViewport(viewport, top, "auto");
      wasNearBottomRef.current = false;
      setShowLatestReplyButton(true);
      return true;
    }

    scrollModeRef.current = "follow-bottom";
    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    scrollViewport(viewport, top, "auto");
    wasNearBottomRef.current = true;
    setShowLatestReplyButton(false);
    return true;
  }, [latestAssistantIsCompactIntro, latestMessageIsAssistant, messageViewportRef, scrollViewport]);

  useLayoutEffect(() => {
    alignLatestAssistantReply();
  }, [alignLatestAssistantReply, latestAssistantMessage?.streaming, latestAssistantMessageId, latestAssistantRenderKey]);

  useEffect(() => {
    const viewport = messageViewportRef?.current;
    const latestBubble = latestAssistantBubbleRef.current;
    const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
    if (!viewport || !latestBubble || !latestMessageIsAssistant || latestAssistantIsCompactIntro || !ResizeObserverCtor) {
      return undefined;
    }

    let frameId = 0;
    const resizeObserver = new ResizeObserverCtor(() => {
      if (manualScrollLockRef.current || autoScrollSuppressedRef.current) {
        return;
      }
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        alignLatestAssistantReply();
      });
    });

    [latestBubble, viewport.firstElementChild].filter(Boolean).forEach((node) => resizeObserver.observe(node));

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect?.();
    };
  }, [alignLatestAssistantReply, latestAssistantIsCompactIntro, latestAssistantMessageId, latestAssistantRenderKey, latestMessageIsAssistant, messageViewportRef]);

  useEffect(() => {
    const viewport = messageViewportRef?.current;
    if (!viewport || !messages.length) {
      setShowLatestReplyButton(false);
      return undefined;
    }

    const updateLatestReplyButton = () => {
      if (!messages.length) {
        setShowLatestReplyButton(false);
        return;
      }
      const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (maxTop <= 48) {
        setShowLatestReplyButton(false);
        return;
      }
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowLatestReplyButton(scrollModeRef.current === "pin-top" || distanceFromBottom > 48);
    };

    updateLatestReplyButton();
    viewport.addEventListener("scroll", updateLatestReplyButton, { passive: true });
    return () => viewport.removeEventListener("scroll", updateLatestReplyButton);
  }, [messageViewportRef, messages.length, visibleConversationKey]);

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

    const tryScrollToTarget = () => {
      const targetBubble = viewport.querySelector(selector);
      if (!targetBubble) {
        return false;
      }

      markUserScrollTakeover({
        force: focusMessageRequest?.source === "artifact",
        lockAutoFollow: focusMessageRequest?.source === "artifact",
      });
      const top = calculateBubbleTopFocusScrollTop(viewport, targetBubble);
      const resolvedMessageId = String(targetBubble.getAttribute("data-message-id") || focusMessageRequest?.messageId || "").trim();
      const isArtifactFocus = focusMessageRequest?.source === "artifact";
      if (isArtifactFocus) {
        animateViewportScroll(viewport, top, artifactFocusScrollDurationMs);
        queueFocusHighlight(resolvedMessageId, artifactFocusScrollDurationMs);
      } else {
        scrollViewport(viewport, top, "smooth");
        queueFocusHighlight(resolvedMessageId);
      }
      return true;
    };

    if (tryScrollToTarget()) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      tryScrollToTarget();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [animateViewportScroll, focusMessageRequest, markUserScrollTakeover, messageViewportRef, queueFocusHighlight, scrollViewport]);

  const handleJumpToLatestReply = () => {
    const viewport = messageViewportRef?.current;
    if (!viewport) {
      return;
    }

    resumeAutomaticLatestReplyFollow("force-bottom");
    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    scrollViewport(viewport, top, "smooth");
    wasNearBottomRef.current = true;
    setShowLatestReplyButton(false);
  };

  const handleJumpToUserMessage = useCallback((targetMessageId) => {
    const viewport = messageViewportRef?.current;
    const resolvedMessageId = String(targetMessageId || "").trim();
    if (!viewport || !resolvedMessageId) {
      return;
    }

    const targetBubble = viewport.querySelector(`[data-message-id="${resolvedMessageId}"]`);
    if (!targetBubble) {
      return;
    }

    markUserScrollTakeover({ force: true, lockAutoFollow: true });
    const top = calculateBubbleTopFocusScrollTop(viewport, targetBubble);
    animateViewportScroll(viewport, top, artifactFocusScrollDurationMs);
    queueFocusHighlight(resolvedMessageId, artifactFocusScrollDurationMs);
  }, [animateViewportScroll, markUserScrollTakeover, messageViewportRef, queueFocusHighlight]);

  const handleResetWithConfirm = () => {
    const confirmed = window.confirm(i18n.chat.resetConversationConfirm);
    if (!confirmed) {
      return;
    }
    onReset?.();
  };

  return (
    <>
      <div className={cn("grid h-full min-h-0", showTabsStrip ? "grid-rows-[auto_minmax(0,1fr)] gap-2" : "grid-rows-[minmax(0,1fr)] gap-0")}>
        {showTabsStrip ? (
          <ChatTabsStrip
            items={chatTabs}
            activeChatTabId={activeChatTabId}
            leadingControl={brandControl}
            onActivate={onActivateChatTab}
            onClose={onCloseChatTab}
            onReorder={onReorderChatTab}
            resolvedTheme={resolvedTheme}
            trailingControl={agentSwitcher}
          />
        ) : null}
        <Card className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden">
          <div className="relative border-b border-border/70 bg-card/80 px-3 pt-2 pb-2 backdrop-blur">
            <div className="flex min-w-0 items-center gap-2 pr-28">
              <div className="truncate text-sm font-semibold leading-none tracking-tight">{`${currentAgentName} - ${i18n.chat.title}`}</div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={showBusyBadge ? "success" : "default"} className="h-6 shrink-0 px-2 py-0 text-[10px]">
                    {showBusyBadge ? i18n.chat.agentBusy : i18n.chat.agentIdle}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{showBusyBadge ? i18n.chat.agentBusyTooltip : i18n.chat.agentIdleTooltip}</TooltipContent>
              </Tooltip>
            </div>

            <div className="absolute right-3 top-2 z-10 flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-1 py-1">
                {chatFontSizeOptions.map((item) => {
                  const active = item.value === chatFontSize;
                  return (
                    <Tooltip key={item.value}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            active && "bg-muted text-foreground",
                          )}
                          aria-label={i18n.chat.fontSizeOptionTooltip(item.label)}
                          disabled={interactionLocked}
                          onClick={() => onChatFontSizeChange?.(item.value)}
                        >
                          <span className={cn("font-semibold leading-none", item.glyphClassName)}>A</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{i18n.chat.fontSizeOptionTooltip(item.label)}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleResetWithConfirm}
                    className="h-6 w-6 rounded-md"
                    aria-label={i18n.chat.resetConversation}
                    disabled={interactionLocked}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="px-2.5 py-2 text-left">
                  <div className="text-xs font-medium leading-4">{formatShortcutForPlatform(i18n.chat.resetConversationHotkey)}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{i18n.chat.resetConversationTooltipHint}</div>
                </TooltipContent>
              </Tooltip>
            </div>

            {sessionOverview ? <div className="mt-2">{sessionOverview}</div> : null}
          </div>
          <CardContent className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-0">
            <QueuedMessages items={queuedMessages || []} textClassName={fontSizeStyles.queued} />
            <div className="relative min-h-0">
              <ScrollArea
                className="h-full"
                viewportRef={messageViewportRef}
                onWheelCapture={markUserScrollTakeover}
                onTouchMoveCapture={markUserScrollTakeover}
              >
                <div className="grid gap-2 px-3 pt-2 pb-6">
                  {messages.length
                    ? (() => {
                        let lastUserMessageId = "";
                        let lastAssistantMessageId = "";
                        return messages.map((message, index) => {
                        const messageId = getConversationMessageId(message, index);
                        const previousMessageId = message.role === "assistant" ? lastAssistantMessageId : lastUserMessageId;
                        const isLatestAssistant = latestAssistantMessageId === messageId;
                        const isStreamingAssistant = Boolean(
                          isLatestAssistant
                            && latestMessageIsAssistant
                            && message.role === "assistant"
                            && !message.pending
                            && message.streaming
                            && String(message.content || "").trim(),
                        );

                        if (message.role === "user") {
                          lastUserMessageId = messageId;
                        } else if (message.role === "assistant") {
                          lastAssistantMessageId = messageId;
                        }

                        return (
                          <MessageBubble
                            agentLabel={agentLabel}
                            animateViewportScroll={animateViewportScroll}
                            bubbleAnchorRef={isLatestAssistant ? latestAssistantBubbleRef : undefined}
                            handleOpenFilePreview={handleOpenPreview}
                            handleOpenImagePreview={openImagePreview}
                            isHighlighted={highlightedMessageId === messageId}
                            isLatestAssistant={isLatestAssistant}
                            isStreamingAssistant={isStreamingAssistant}
                            markUserScrollTakeover={markUserScrollTakeover}
                            key={messageId}
                            message={message}
                            messageId={messageId}
                            formatTime={formatTime}
                            files={files}
                            messageViewportRef={messageViewportRef}
                            onJumpPreviousMessage={handleJumpToUserMessage}
                            previousMessageId={previousMessageId}
                            resolvedTheme={resolvedTheme}
                            separated={index > 0 && messages[index - 1]?.role !== message.role}
                            chatFontSize={chatFontSize}
                            userLabel={userLabel}
                          />
                        );
                      });
                    })()
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

          <CardContent className="space-y-2 border-t border-border/70 bg-muted/20 px-4 py-3">
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
            {activeMention && mentionOptions.length && mentionAnchor === "composer" ? (
              <div ref={mentionMenuRef} data-testid="mention-menu-composer" className="absolute bottom-full left-0 z-20 mb-2 w-[min(28rem,calc(100vw-4rem))]">
                <div className="max-h-[31rem] overflow-y-auto rounded-xl border border-border/70 bg-background/95 p-2 pr-3 shadow-lg backdrop-blur cc-scroll-region">
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
                                optionIndex === highlightedAgentIndex ? mentionOptionStateClassName : mentionOptionHoverClassName,
                              )}
                              onMouseDown={(event) => handleMentionPointerSelect(event, agent)}
                              onClick={(event) => handleMentionClick(event, agent)}
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
                                optionIndex === highlightedAgentIndex ? mentionOptionStateClassName : mentionOptionHoverClassName,
                              )}
                              onMouseDown={(event) => handleMentionPointerSelect(event, skill.name)}
                              onClick={(event) => handleMentionClick(event, skill.name)}
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
            <div
              className={cn(
                "overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow]",
                resolvedTheme === "dark"
                  ? "focus-within:border-[#4d88c7] focus-within:ring-2 focus-within:ring-[#4d88c7]/20"
                  : "focus-within:border-[#1677eb] focus-within:ring-2 focus-within:ring-[#1677eb]/35",
              )}
            >
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
                ref={setComposerTextareaNode}
                rows={2}
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
                  if (activeMention && mentionOptions.length) {
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
                      setManualMention(null);
                      setHighlightedAgentIndex(0);
                      return;
                    }
                  }
                  onPromptKeyDown(event);
                }}
                onSelect={(event) => syncAgentMention(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                placeholder={openClawConnected ? i18n.chat.promptPlaceholder : i18n.chat.disconnectedPlaceholder}
                disabled={composerLocked}
                className="min-h-[3.35rem] resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ConnectionStatus session={session} />
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <div className="relative flex items-center gap-px">
                {activeMention && mentionOptions.length && mentionAnchor === "actions" ? (
                  <div ref={mentionMenuRef} data-testid="mention-menu-actions" className="absolute bottom-full right-0 z-20 mb-2 w-[min(28rem,calc(100vw-4rem))]">
                    <div className="max-h-[31rem] overflow-y-auto rounded-xl border border-border/70 bg-background/95 p-2 pr-3 shadow-lg backdrop-blur cc-scroll-region">
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
                                    optionIndex === highlightedAgentIndex ? mentionOptionStateClassName : mentionOptionHoverClassName,
                                  )}
                                  onMouseDown={(event) => handleMentionPointerSelect(event, agent)}
                                  onClick={(event) => handleMentionClick(event, agent)}
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
                                    optionIndex === highlightedAgentIndex ? mentionOptionStateClassName : mentionOptionHoverClassName,
                                  )}
                                  onMouseDown={(event) => handleMentionPointerSelect(event, skill.name)}
                                  onClick={(event) => handleMentionClick(event, skill.name)}
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 rounded-lg border-0 bg-transparent p-0 text-muted-foreground shadow-none transition hover:bg-muted/60 hover:text-foreground"
                      disabled={composerLocked || (!mentionableAgents.length && !mentionableSkills.length)}
                      aria-label={i18n.chat.openMentionMenu}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={openMentionMenu}
                    >
                      <span className="text-[1.05rem] font-semibold leading-none">@</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{i18n.chat.openMentionMenuTooltip || i18n.chat.openMentionMenu}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 rounded-lg border-0 bg-transparent p-0 text-muted-foreground shadow-none transition hover:bg-muted/60 hover:text-foreground"
                      disabled={interactionLocked}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      <Paperclip className="h-4.5 w-4.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{i18n.chat.uploadAttachment}</TooltipContent>
                </Tooltip>
              </div>
              <Button
                onClick={showStopButton ? onStop : onSend}
                disabled={showStopButton ? interactionLocked : composerLocked}
                className="cc-send-button h-9 min-w-[6.25rem] rounded-md px-3 text-sm font-medium"
              >
                <span className="inline-flex w-full -translate-x-[3px] items-center justify-center gap-2 leading-none">
                  {showStopButton ? <Square className="h-3.5 w-3.5 shrink-0 fill-current" /> : <Send className="h-3.5 w-3.5 shrink-0" />}
                  <span className="text-center leading-none">{showStopButton ? i18n.chat.stop : i18n.chat.send}</span>
                </span>
              </Button>
            </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <FilePreviewOverlay files={files} preview={filePreview} resolvedTheme={resolvedTheme} onClose={closeFilePreview} onOpenFilePreview={handleOpenPreview} />
      <ImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
    </>
  );
}
