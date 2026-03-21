import { ArrowDown, ArrowUp, ArrowUpToLine, Check, ChevronLeft, ChevronRight, Copy, Paperclip, Pencil, RotateCcw, Send, Square, Trash2, X } from "lucide-react";
import { lazy, memo, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { shouldShowBubbleTopJumpButton, shouldSuppressComposerReplay } from "@/components/command-center/chat-panel-utils";
import { getImSessionDisplayName, isDingTalkSessionUser, isImSessionUser, resolveImSessionType } from "@/features/session/im-session";
import { isOfflineStatus, normalizeStatusKey } from "@/features/session/status-display";
import { createConversationKey } from "@/features/app/storage";
import { maxPromptRows } from "@/features/chat/utils";
import { cn, formatShortcutForPlatform } from "@/lib/utils";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import { useStaleRunningDetector } from "@/features/session/runtime/use-stale-running-detector";
import { useI18n } from "@/lib/i18n";

const LazyFilePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.FilePreviewOverlay })),
);
const LazyImagePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.ImagePreviewOverlay })),
);

const bubbleBaseClassName =
  "min-w-0 transition-[border-color,background-color,box-shadow,color] duration-200";

const bubbleContentClassName = "px-3 py-2.5";

const userBubbleClassName = "ring-0";

const assistantBubbleClassName = "";
const artifactFocusScrollDurationMs = 320;
const focusHighlightDurationMs = 1400;
const messageOutlineViewportBottomGapPx = 12;
const messageOutlineMinHeightPx = 96;
const chatTabsScrollStepPx = 220;
const chatTabDragActivationDistancePx = 4;
const chatTabReorderSnapThresholdPx = 12;
const chatTabShortcutBandHeightPx = 14;
const chatTabBodyHeightPx = 36;
const chatTabWrapperHeightPx = chatTabShortcutBandHeightPx + chatTabBodyHeightPx;
const streamingTailIndicatorClearDelayMs = 420;

const assistantCompactThreshold = 72;
const chatFontSizeClassNames = {
  small: {
    userText: "text-[12px] font-normal leading-5",
    userMarkdown:
      "text-[12px] font-normal leading-5 text-white " +
      "[&_a]:text-white/95 [&_a]:underline [&_a]:decoration-white/45 [&_a:hover]:text-white " +
      "[&_blockquote]:border-l-white/35 [&_blockquote]:text-white/82 " +
      "[&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_h5]:text-white [&_h6]:text-white/88 " +
      "[&_hr]:border-white/18 [&_thead]:bg-white/8 [&_th]:border-white/18 [&_td]:border-white/18 " +
      "[&_img]:bg-white/4",
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
    userMarkdown:
      "text-[13px] font-normal leading-6 text-white " +
      "[&_a]:text-white/95 [&_a]:underline [&_a]:decoration-white/45 [&_a:hover]:text-white " +
      "[&_blockquote]:border-l-white/35 [&_blockquote]:text-white/82 " +
      "[&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_h5]:text-white [&_h6]:text-white/88 " +
      "[&_hr]:border-white/18 [&_thead]:bg-white/8 [&_th]:border-white/18 [&_td]:border-white/18 " +
      "[&_img]:bg-white/4",
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
    userMarkdown:
      "text-[15px] font-normal leading-7 text-white " +
      "[&_a]:text-white/95 [&_a]:underline [&_a]:decoration-white/45 [&_a:hover]:text-white " +
      "[&_blockquote]:border-l-white/35 [&_blockquote]:text-white/82 " +
      "[&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_h5]:text-white [&_h6]:text-white/88 " +
      "[&_hr]:border-white/18 [&_thead]:bg-white/8 [&_th]:border-white/18 [&_td]:border-white/18 " +
      "[&_img]:bg-white/4",
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

function unwrapAssistantEnvelope(content = "", role = "") {
  const text = String(content || "");
  if (role !== "assistant") {
    return text;
  }

  const match = text.trim().match(/^<final>([\s\S]*?)<\/final>$/i);
  if (!match) {
    return text;
  }

  const unwrapped = match[1].trim();
  return unwrapped || text;
}

function stripDingTalkImagePlaceholderForDisplay(content = "", sessionUser = "") {
  const text = String(content || "");
  if (!isDingTalkSessionUser(sessionUser)) {
    return text;
  }

  return text.replace(/^\[(?:图片|image)\]\s*\n+(?=!\[[^\]]*\]\([^)]+\))/iu, "");
}

function formatAttachmentSize(size = 0) {
  const numeric = Number(size) || 0;
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

function splitImTabTitleForDisplay(title = "", agentId = "", sessionUser = "") {
  const normalizedTitle = String(title || "").trim();
  const normalizedAgentId = String(agentId || "").trim();

  if (!normalizedTitle || !normalizedAgentId || !resolveImSessionType(sessionUser)) {
    return null;
  }

  const agentSuffix = ` ${normalizedAgentId}`;
  if (!normalizedTitle.endsWith(agentSuffix) || normalizedTitle.length <= agentSuffix.length) {
    return null;
  }

  const platformLabel = normalizedTitle.slice(0, -agentSuffix.length).trim();
  if (!platformLabel) {
    return null;
  }

  return {
    platformLabel,
    agentName: normalizedAgentId,
  };
}

function buildCurrentConversationTitle(agentId = "", sessionUser = "", currentConversationLabel = "", locale = "zh") {
  const normalizedAgentId = String(agentId || "").trim();
  const normalizedCurrentConversationLabel = String(currentConversationLabel || "").trim();
  const imLabel = getImSessionDisplayName(sessionUser, { locale, shortWecom: true });

  if (imLabel && normalizedAgentId && normalizedCurrentConversationLabel) {
    return `${imLabel} - ${normalizedAgentId} - ${normalizedCurrentConversationLabel}`;
  }

  if (normalizedAgentId && normalizedCurrentConversationLabel) {
    return `${normalizedAgentId} - ${normalizedCurrentConversationLabel}`;
  }

  return normalizedAgentId || normalizedCurrentConversationLabel;
}

function ResetConversationDialog({ messages, onCancel, onConfirm, open }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-[30rem] rounded-2xl border border-border/80 bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="space-y-2">
          <h2 id={titleId} className="text-lg font-semibold leading-7 text-foreground">
            {messages.title}
          </h2>
          <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
            {messages.description}
          </p>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            {messages.cancel}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={onConfirm}
          >
            {messages.confirm}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function isImageAttachment(attachment) {
  return attachment?.kind === "image" || /^image\//i.test(attachment?.mimeType || "");
}

function buildLocalFilePreviewUrl(filePath = "") {
  const normalizedPath = String(filePath || "").trim();
  return normalizedPath ? `/api/file-preview/content?path=${encodeURIComponent(normalizedPath)}` : "";
}

function getAttachmentImageSource(attachment = {}) {
  return String(
    attachment.previewUrl
    || attachment.dataUrl
    || buildLocalFilePreviewUrl(attachment.fullPath || attachment.path),
  ).trim();
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
                src={getAttachmentImageSource(attachment)}
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
                <img src={getAttachmentImageSource(attachment)} alt={attachment.name} className="h-[22px] w-[22px] object-cover" />
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
            className="pointer-events-none inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/92 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-background hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100"
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

function StreamingTailDots() {
  return (
    <span
      aria-hidden="true"
      data-streaming-tail-dots="true"
      className="cc-streaming-tail-dots ml-1.5 inline-flex items-center gap-1 align-middle text-foreground/70"
    >
      <span className="cc-streaming-tail-dot" />
      <span className="cc-streaming-tail-dot cc-streaming-tail-dot-2" />
      <span className="cc-streaming-tail-dot cc-streaming-tail-dot-3" />
    </span>
  );
}

function MessageOutline({ headingScopeId, items, onSelect, messageViewportRef }) {
  const { messages } = useI18n();
  const outlineRef = useRef(null);
  const appliedMaxHeightRef = useRef(0);

  useLayoutEffect(() => {
    const outline = outlineRef.current;
    if (!outline) {
      appliedMaxHeightRef.current = 0;
      return undefined;
    }

    const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
    let frameId = 0;
    let resizeObserver = null;
    let attachRetryTimeoutId = 0;
    let attachRetryCount = 0;

    const cleanupListeners = () => {
      window.removeEventListener("resize", scheduleOutlineMaxHeightUpdate);
      resizeObserver?.disconnect?.();
      resizeObserver = null;
    };

    const updateOutlineMaxHeight = () => {
      const latestViewport = messageViewportRef?.current;
      const latestOutline = outlineRef.current;
      if (!latestViewport || !latestOutline) {
        return;
      }

      const viewportRect = latestViewport.getBoundingClientRect();
      const outlineRect = latestOutline.getBoundingClientRect();
      const availableHeight = Math.floor(viewportRect.bottom - outlineRect.top - messageOutlineViewportBottomGapPx);
      const nextMaxHeight = Math.max(messageOutlineMinHeightPx, availableHeight);
      if (nextMaxHeight === appliedMaxHeightRef.current) {
        return;
      }

      latestOutline.style.maxHeight = `${nextMaxHeight}px`;
      appliedMaxHeightRef.current = nextMaxHeight;
    };

    const scheduleOutlineMaxHeightUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateOutlineMaxHeight);
    };

    const attachViewportObservers = () => {
      const latestViewport = messageViewportRef?.current;
      const latestOutline = outlineRef.current;
      if (!latestViewport || !latestOutline) {
        if (attachRetryCount < 12) {
          attachRetryCount += 1;
          attachRetryTimeoutId = window.setTimeout(attachViewportObservers, 0);
        }
        return;
      }

      updateOutlineMaxHeight();
      window.addEventListener("resize", scheduleOutlineMaxHeightUpdate);

      if (ResizeObserverCtor) {
        resizeObserver = new ResizeObserverCtor(() => {
          scheduleOutlineMaxHeightUpdate();
        });

        // The outline height only depends on the viewport bounds and the meta stack's top position.
        // Observing the whole scroll content tree makes this update fire too often during message growth.
        [latestViewport, latestOutline.parentElement]
          .filter(Boolean)
          .forEach((node) => resizeObserver.observe(node));
      }
    };

    attachViewportObservers();

    return () => {
      cleanupListeners();
      window.clearTimeout(attachRetryTimeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [items.length, messageViewportRef]);

  return (
    <aside ref={outlineRef} className="flex max-h-[calc(100vh-6rem)] w-40 shrink-0 self-start flex-col overflow-hidden rounded-[5px] border border-border/70 bg-muted/20 p-2">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{messages.chat.outline}</div>
      <div data-message-outline-scroll-area className="cc-scroll-region min-h-0 overflow-x-hidden overflow-y-auto pr-1">
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

function areMessageBubblePropsEqual(previous, next) {
  if (previous === next) {
    return true;
  }

  return previous.agentLabel === next.agentLabel
    && previous.animateViewportScroll === next.animateViewportScroll
    && previous.bubbleAnchorRef === next.bubbleAnchorRef
    && previous.files === next.files
    && previous.formatTime === next.formatTime
    && previous.handleOpenFilePreview === next.handleOpenFilePreview
    && previous.handleOpenImagePreview === next.handleOpenImagePreview
    && previous.isHighlighted === next.isHighlighted
    && previous.isLatestAssistant === next.isLatestAssistant
    && previous.isStreamingAssistant === next.isStreamingAssistant
    && previous.showStreamingTail === next.showStreamingTail
    && previous.markUserScrollTakeover === next.markUserScrollTakeover
    && previous.messageId === next.messageId
    && previous.messageViewportRef === next.messageViewportRef
    && previous.onJumpPreviousMessage === next.onJumpPreviousMessage
    && previous.previousMessageId === next.previousMessageId
    && previous.resolvedTheme === next.resolvedTheme
    && previous.sessionUser === next.sessionUser
    && previous.staleWarning === next.staleWarning
    && previous.chatFontSize === next.chatFontSize
    && previous.userLabel === next.userLabel
    && previous.message?.role === next.message?.role
    && previous.message?.content === next.message?.content
    && previous.message?.timestamp === next.message?.timestamp
    && Boolean(previous.message?.pending) === Boolean(next.message?.pending)
    && Boolean(previous.message?.streaming) === Boolean(next.message?.streaming)
    && String(previous.message?.tokenBadge || "") === String(next.message?.tokenBadge || "")
    && areMessageAttachmentsEqual(previous.message?.attachments || [], next.message?.attachments || []);
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
  showStreamingTail,
  markUserScrollTakeover,
  message,
  messageId,
  messageViewportRef,
  onJumpPreviousMessage,
  previousMessageId,
  resolvedTheme,
  sessionUser,
  staleWarning,
  chatFontSize,
  userLabel,
}) {
  const [showBubbleTopJump, setShowBubbleTopJump] = useState(false);
  const bubbleRef = useRef(null);
  const bubbleSurfaceRef = useRef(null);
  const bubbleTopSentinelRef = useRef(null);
  const isUser = message.role === "user";
  const isPending = Boolean(message.pending);
  const renderedContent = useMemo(
    () => stripDingTalkImagePlaceholderForDisplay(
      unwrapAssistantEnvelope(message.content, message.role),
      sessionUser,
    ),
    [message.content, message.role, sessionUser],
  );
  const supportsBubbleTopJump = !messageHasVisualMedia(message);
  const assistantTurnInProgress = !isUser && !isPending && (isStreamingAssistant || showStreamingTail);
  const useCompactAssistantBubble = useMemo(
    () => !isUser && !isPending && !assistantTurnInProgress && shouldUseCompactAssistantBubble(renderedContent),
    [assistantTurnInProgress, isPending, isUser, renderedContent],
  );
  const visualLineCount = estimateVisualLineCount(renderedContent);
  const compactMeta = visualLineCount <= 1;
  const outlineItems = useMemo(
    () => (!isUser && !isPending && !assistantTurnInProgress ? extractHeadingOutline(renderedContent) : []),
    [assistantTurnInProgress, isPending, isUser, renderedContent],
  );
  const shouldShowOutline = outlineItems.length >= 2;
  const headingScopeId = `message-${messageId}`;
  const fontSizeStyles = resolveChatFontSizeStyles(chatFontSize);
  const userBubbleWidthClassName = "w-fit min-w-[3.75rem] max-w-[min(86vw,40rem)]";
  const compactAssistantWidthClassName = "inline-block max-w-[min(80vw,42rem)] shrink-0";
  const longAssistantWidthClassName = "w-[700px] max-w-[calc(100vw-12rem)] shrink-0";
  const streamingAssistantBubbleClassName = assistantTurnInProgress ? "cc-streaming-bubble transition-none motion-reduce:animate-none" : "";
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

  const setBubbleSurfaceNode = (node) => {
    bubbleSurfaceRef.current = node;
  };

  const setBubbleTopSentinelNode = (node) => {
    bubbleTopSentinelRef.current = node;
  };

  const handleJumpBubbleTop = () => {
    const viewport = messageViewportRef?.current;
    const bubble = bubbleSurfaceRef.current || bubbleRef.current;
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
    const bubble = bubbleSurfaceRef.current || bubbleRef.current;
    const bubbleTopSentinel = bubbleTopSentinelRef.current;
    if (!viewport || !bubble) {
      setShowBubbleTopJump(false);
      return undefined;
    }

    const updateBubbleTopJump = (viewportRect, bubbleRect, viewportClientHeight) => {
      setShowBubbleTopJump(
        shouldShowBubbleTopJumpButton({
          viewportRect,
          bubbleRect,
          viewportClientHeight,
        }),
      );
    };

    const IntersectionObserverCtor = window.IntersectionObserver || globalThis.IntersectionObserver;
    if (IntersectionObserverCtor && bubbleTopSentinel) {
      const observer = new IntersectionObserverCtor(
        (entries) => {
          const entry = entries[0];
          const rootBounds = entry?.rootBounds;
          if (!entry || !rootBounds) {
            setShowBubbleTopJump(false);
            return;
          }

          updateBubbleTopJump(
            rootBounds,
            {
              top: entry.boundingClientRect.top,
              bottom: bubble.getBoundingClientRect().bottom,
              height: bubble.getBoundingClientRect().height,
            },
            rootBounds.height || viewport.clientHeight,
          );
        },
        {
          root: viewport,
          threshold: [0, 1],
        },
      );

      observer.observe(bubbleTopSentinel);
      return () => observer.disconnect();
    }

    const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
    let resizeObserver = null;
    let frameId = 0;

    const measureBubbleTopJump = () => {
      updateBubbleTopJump(
        viewport.getBoundingClientRect(),
        bubble.getBoundingClientRect(),
        viewport.clientHeight,
      );
    };

    measureBubbleTopJump();
    viewport.addEventListener("scroll", measureBubbleTopJump, { passive: true });
    window.addEventListener("resize", measureBubbleTopJump);

    if (ResizeObserverCtor) {
      resizeObserver = new ResizeObserverCtor(() => {
        window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(measureBubbleTopJump);
      });

      [viewport, bubble, viewport.firstElementChild].filter(Boolean).forEach((node) => resizeObserver.observe(node));
    }

    return () => {
      viewport.removeEventListener("scroll", measureBubbleTopJump);
      window.removeEventListener("resize", measureBubbleTopJump);
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect?.();
    };
  }, [isPending, isUser, messageViewportRef, message.pending, message.timestamp, renderedContent, supportsBubbleTopJump, useCompactAssistantBubble]);

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
                streaming={false}
                compact
                textClassName={fontSizeStyles.meta}
                timestamp={message.timestamp}
              />
              <Card ref={setBubbleSurfaceNode} data-bubble-layout="user" className={cn(bubbleBaseClassName, userBubbleWidthClassName, "cc-user-bubble", userBubbleClassName, focusBubbleClassName)}>
                {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
                <CardContent className={cn(bubbleContentClassName, message.attachments?.length && "space-y-2")}>
                  <MessageAttachments
                    attachments={message.attachments}
                    onPreviewImage={handleOpenImagePreview}
                    scrollAnchorBaseId={`${headingScopeId}-attachment`}
                  />
                  {message.content ? (
                    <MarkdownContent
                      content={renderedContent}
                      files={files}
                      fontSize={chatFontSize}
                      headingScopeId={headingScopeId}
                      resolvedTheme={resolvedTheme}
                      streaming={false}
                      onOpenFilePreview={handleOpenFilePreview}
                      onOpenImagePreview={handleOpenImagePreview}
                      className={fontSizeStyles.userMarkdown}
                    />
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
              ref={setBubbleSurfaceNode}
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
                  content={renderedContent}
                  files={files}
                  fontSize={chatFontSize}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  streaming={isStreamingAssistant}
                  onOpenFilePreview={handleOpenFilePreview}
                  onOpenImagePreview={handleOpenImagePreview}
                  className={fontSizeStyles.pendingMarkdown}
                />
              </CardContent>
            </Card>
            <MessageMeta align="right" content={renderedContent} formatTime={formatTime} pending compact textClassName={fontSizeStyles.meta} timestamp={message.timestamp} />
          </div>
          {staleWarning ? (
            <p className="mt-1 text-xs text-muted-foreground/80">{staleWarning}</p>
          ) : null}
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
                ref={setBubbleSurfaceNode}
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
                <span
                  ref={setBubbleTopSentinelNode}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 h-px w-px opacity-0"
                />
                <MarkdownContent
                  content={renderedContent}
                  files={files}
                  fontSize={chatFontSize}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  streaming={isStreamingAssistant}
                  onOpenFilePreview={handleOpenFilePreview}
                  onOpenImagePreview={handleOpenImagePreview}
                  className={fontSizeStyles.markdown}
                />
                {showStreamingTail ? <StreamingTailDots /> : null}
                </CardContent>
              </Card>
              </div>
              <div data-message-outline-meta-stack className="sticky top-1 hidden w-40 shrink-0 self-start xl:flex xl:flex-col xl:gap-2">
                <MessageMeta
                  align="left"
                  content={renderedContent}
                  formatTime={formatTime}
                  onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
                  streaming={isStreamingAssistant}
                  textClassName={fontSizeStyles.meta}
                  timestamp={message.timestamp}
                />
                <MessageOutline
                  headingScopeId={headingScopeId}
                  items={outlineItems}
                  onSelect={handleSelectHeading}
                  messageViewportRef={messageViewportRef}
                />
              </div>
            </div>
            <div className="xl:hidden">
              <MessageMeta
                align="right"
                content={renderedContent}
                formatTime={formatTime}
                onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
                streaming={isStreamingAssistant}
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
              ref={setBubbleSurfaceNode}
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
                  content={renderedContent}
                  files={files}
                  fontSize={chatFontSize}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  streaming={isStreamingAssistant}
                  onOpenFilePreview={handleOpenFilePreview}
                  onOpenImagePreview={handleOpenImagePreview}
                  className={fontSizeStyles.compactMarkdown}
                />
                {showStreamingTail ? <StreamingTailDots /> : null}
              </CardContent>
            </Card>
            </div>
            <MessageMeta
              align="right"
              content={renderedContent}
              formatTime={formatTime}
              onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
              compact={compactMeta}
              streaming={isStreamingAssistant}
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
            ref={setBubbleSurfaceNode}
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
              <span
                ref={setBubbleTopSentinelNode}
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 h-px w-px opacity-0"
              />
              <MarkdownContent
                content={renderedContent}
                files={files}
                fontSize={chatFontSize}
                headingScopeId={headingScopeId}
                resolvedTheme={resolvedTheme}
                streaming={isStreamingAssistant}
                onOpenFilePreview={handleOpenFilePreview}
                onOpenImagePreview={handleOpenImagePreview}
                className={fontSizeStyles.markdown}
              />
              {showStreamingTail ? <StreamingTailDots /> : null}
            </CardContent>
          </Card>
          </div>
          <MessageMeta
            align="right"
            content={renderedContent}
            formatTime={formatTime}
            onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
            streaming={isStreamingAssistant}
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
    && prevProps.showStreamingTail === nextProps.showStreamingTail
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
    && areMessageAttachmentsEqual(prevProps.message?.attachments || [], nextProps.message?.attachments || [])
    && prevProps.staleWarning === nextProps.staleWarning;
}, areMessageBubblePropsEqual);

function ConnectionStatus({ composerSendMode = "enter-send", onToggleComposerSendMode, resolvedTheme = "dark", session }) {
  const { messages } = useI18n();
  const isOffline = isOfflineStatus(session.status);
  const isOpenClaw = session.mode === "openclaw";
  const toneClassName = isOffline ? "bg-rose-500" : isOpenClaw ? "bg-emerald-500" : "bg-slate-400";
  const statusLabel = isOffline
    ? (messages.chat.connectionStatusDisconnectedDisplay || messages.chat.connectionStatusDisconnected)
    : isOpenClaw
      ? (messages.chat.connectionStatusConnectedDisplay || messages.chat.connectionStatusConnected)
      : (messages.chat.connectionStatusLocalDisplay || messages.chat.connectionStatusLocal);
  const statusHint = isOffline
    ? messages.chat.disconnectedPlaceholder
    : composerSendMode === "enter-send"
      ? messages.chat.composerEnterToSendHint
      : messages.chat.composerDoubleEnterHint;
  const toggleLabel = composerSendMode === "enter-send"
    ? messages.chat.composerSwitchToShiftEnterSend
    : messages.chat.composerSwitchToEnterSend;
  const tooltipDetail = isOffline
    ? messages.chat.connectionStatusDisconnected
    : isOpenClaw
      ? messages.chat.connectionStatusConnected
      : messages.chat.connectionStatusLocal;
  const composerSendModeTooltipTitle = messages.chat.composerSendModeTooltipTitle || toggleLabel;
  const composerSendModeTooltipDescription = messages.chat.composerSendModeTooltipDescription || statusHint;
  const toggleClassName = resolvedTheme === "dark"
    ? "border-b border-current text-[#78b7ff] transition-colors hover:text-[#a8d0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#78b7ff]/35"
    : "border-b border-current text-[#6b7280] transition-colors hover:text-[#4b5563] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]/35";

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span data-connection-status-label className="inline-flex min-w-[6ch] items-center gap-2">
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
      <span data-connection-status-hint className="inline-flex min-w-0 items-center gap-1.5 md:min-w-[22rem]">
        <span className="min-w-0 truncate">{statusHint}</span>
        {!isOffline ? (
          <>
            <span aria-hidden="true">-</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleComposerSendMode}
                  className={cn(toggleClassName, "shrink-0")}
                >
                  {toggleLabel}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 px-2.5 py-2">
                <div className="space-y-0.5">
                  <div>{composerSendModeTooltipTitle}</div>
                  <div className="text-[11px] text-muted-foreground">{composerSendModeTooltipDescription}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </span>
    </span>
  );
}

function QueuedMessages({ items, onClearAll, onEditItem, onRemoveItem, textClassName }) {
  const { messages } = useI18n();

  if (!items.length) {
    return null;
  }

  return (
    <div data-testid="queued-messages-panel" className="rounded-xl border border-border/70 bg-background/85 px-2.5 py-2 shadow-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="default" className="h-5 shrink-0 px-1.5 py-0 text-[10px]">
            {messages.chat.queuedCount(items.length)}
          </Badge>
          <span className="truncate">{messages.chat.queuedHint}</span>
        </div>
        {onClearAll ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={messages.chat.clearQueuedMessages}
                onClick={() => onClearAll()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{messages.chat.clearQueuedMessages}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="cc-scroll-region grid max-h-32 gap-1 overflow-y-auto pr-0.5">
        {items.map((item, index) => {
          const contentText = String(item?.content || "");
          const displayText = contentText.trim() || (item?.attachments?.length ? messages.chat.queuedAttachmentOnly : "");

          return (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/65 bg-muted/25 px-2 py-1.5">
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground/90">#{index + 1}</span>
              <span className={cn("min-w-0 flex-1 truncate text-foreground/95", textClassName)} title={displayText || contentText}>
                {displayText}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                {onEditItem ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={messages.chat.editQueuedMessage(index + 1)}
                        onClick={() => onEditItem(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{messages.chat.editQueuedMessage(index + 1)}</TooltipContent>
                  </Tooltip>
                ) : null}
                {onRemoveItem ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={messages.chat.removeQueuedMessage(index + 1)}
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{messages.chat.removeQueuedMessage(index + 1)}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          );
        })}
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
  const [dragSession, setDragSession] = useState(null);
  const [tabScrollState, setTabScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  });
  const tabNodeMapRef = useRef(new Map());
  const previousTabRectsRef = useRef(new Map());
  const previousOrderSignatureRef = useRef("");
  const draggingTabIdRef = useRef("");
  const lastReorderIntentRef = useRef("");
  const suppressTabClickRef = useRef(false);
  const scrollViewportRef = useRef(null);
  const scrollContentRef = useRef(null);
  const dragSessionRef = useRef(null);
  const dragOverlayRef = useRef(null);
  const cachedTabRectsRef = useRef(new Map());
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);

  itemsRef.current = items;
  onReorderRef.current = onReorder;

  const updateTabScrollState = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      setTabScrollState((current) => (
        current.canScrollLeft || current.canScrollRight || current.hasOverflow
          ? {
              canScrollLeft: false,
              canScrollRight: false,
              hasOverflow: false,
            }
          : current
      ));
      return;
    }

    const { clientWidth, scrollLeft, scrollWidth } = viewport;
    const hasOverflow = (scrollWidth - clientWidth) > 1;
    const canScrollLeft = scrollLeft > 1;
    const canScrollRight = hasOverflow && (scrollLeft + clientWidth) < (scrollWidth - 1);

    setTabScrollState((current) => (
      current.canScrollLeft === canScrollLeft
      && current.canScrollRight === canScrollRight
      && current.hasOverflow === hasOverflow
        ? current
        : {
            canScrollLeft,
            canScrollRight,
            hasOverflow,
          }
    ));
  }, []);

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

    const shouldAnimateReorder =
      previousOrderSignatureRef.current
      && previousOrderSignatureRef.current !== currentOrderSignature;

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
            duration: 180,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        );
      });
    }

    previousTabRectsRef.current = nextRects;
    previousOrderSignatureRef.current = currentOrderSignature;
  }, [dragSession?.active, draggingTabId, items]);

  useLayoutEffect(() => {
    updateTabScrollState();
  }, [items, updateTabScrollState]);

  useLayoutEffect(() => {
    const activeItem = items.find((item) => item.active);
    if (!activeItem) {
      return;
    }

    const viewport = scrollViewportRef.current;
    const activeNode = tabNodeMapRef.current.get(activeItem.id);
    if (!viewport || !activeNode) {
      return;
    }

    const nodeLeft = activeNode.offsetLeft;
    const nodeRight = nodeLeft + activeNode.offsetWidth;
    const viewLeft = viewport.scrollLeft;
    const viewRight = viewLeft + viewport.clientWidth;

    if (nodeLeft >= viewLeft && nodeRight <= viewRight) {
      return;
    }

    activeNode.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [items]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    updateTabScrollState();

    const handleScroll = () => updateTabScrollState();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(() => updateTabScrollState()) : null;

    resizeObserver?.observe(viewport);
    if (scrollContentRef.current) {
      resizeObserver?.observe(scrollContentRef.current);
    }

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      resizeObserver?.disconnect?.();
    };
  }, [items.length, updateTabScrollState]);

  useEffect(() => {
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    const finishDrag = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      draggingTabIdRef.current = "";
      lastReorderIntentRef.current = "";
      cachedTabRectsRef.current.clear();
      dragSessionRef.current = null;
      setDraggingTabId("");
      setDragSession(null);
    };

    const snapshotTabRects = () => {
      cachedTabRectsRef.current.clear();
      const currentItems = itemsRef.current;
      for (const item of currentItems) {
        if (!item?.id) {
          continue;
        }
        const node = tabNodeMapRef.current.get(item.id);
        if (node) {
          cachedTabRectsRef.current.set(item.id, node.getBoundingClientRect());
        }
      }
    };

    const maybeAutoScrollTabs = (clientX) => {
      const viewport = scrollViewportRef.current;
      if (!viewport) {
        return false;
      }

      const bounds = viewport.getBoundingClientRect();
      const edgeThreshold = 40;
      if (clientX < bounds.left + edgeThreshold) {
        viewport.scrollLeft -= 20;
        return true;
      } else if (clientX > bounds.right - edgeThreshold) {
        viewport.scrollLeft += 20;
        return true;
      }
      return false;
    };

    const updateDragOverlayPosition = (left) => {
      if (!dragOverlayRef.current) {
        return;
      }

      dragOverlayRef.current.style.left = `${left}px`;
    };

    const handlePointerMove = (event) => {
      const currentSession = dragSessionRef.current;
      if (!currentSession || event.pointerId !== currentSession.pointerId) {
        return;
      }

      const deltaX = event.clientX - currentSession.startX;
      const deltaY = event.clientY - currentSession.startY;
      const distance = Math.hypot(deltaX, deltaY);
      const wasActive = currentSession.active;
      const active = wasActive || distance >= chatTabDragActivationDistancePx;

      const viewportBounds = scrollViewportRef.current?.getBoundingClientRect();
      const unclampedLeft = event.clientX - currentSession.xOffset;
      const minLeft = viewportBounds?.left ?? unclampedLeft;
      const maxLeft = viewportBounds ? Math.max(minLeft, viewportBounds.right - currentSession.width) : unclampedLeft;
      const clampedLeft = Math.min(Math.max(unclampedLeft, minLeft), maxLeft);

      currentSession.active = active;
      currentSession.currentLeft = clampedLeft;

      if (!active) {
        return;
      }

      if (!wasActive) {
        draggingTabIdRef.current = currentSession.tabId;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        snapshotTabRects();
        setDraggingTabId(currentSession.tabId);
        setDragSession({ ...currentSession });
      } else {
        updateDragOverlayPosition(clampedLeft);
      }

      const didScroll = maybeAutoScrollTabs(event.clientX);
      if (didScroll) {
        snapshotTabRects();
      }

      const currentItems = itemsRef.current;
      for (const item of currentItems) {
        if (!item?.id || item.id === currentSession.tabId) {
          continue;
        }

        const rect = cachedTabRectsRef.current.get(item.id);
        if (!rect) {
          continue;
        }

        if (event.clientX < rect.left || event.clientX > rect.right) {
          continue;
        }

        const midpoint = rect.left + (rect.width / 2);
        if (Math.abs(event.clientX - midpoint) < chatTabReorderSnapThresholdPx) {
          continue;
        }

        const placeAfter = event.clientX > midpoint;
        const intentKey = `${currentSession.tabId}:${item.id}:${placeAfter ? "after" : "before"}`;
        if (lastReorderIntentRef.current === intentKey) {
          return;
        }

        lastReorderIntentRef.current = intentKey;
        onReorderRef.current?.(currentSession.tabId, item.id, placeAfter ? "after" : "before");
        requestAnimationFrame(() => snapshotTabRects());
        return;
      }
    };

    const handlePointerUp = (event) => {
      const currentSession = dragSessionRef.current;
      if (!currentSession || event.pointerId !== currentSession.pointerId) {
        return;
      }
      suppressTabClickRef.current = Boolean(currentSession.active);
      finishDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  if (!items.length && !leadingControl && !trailingControl) {
    return null;
  }

  const closable = items.length > 1;
  const scrollTabsBy = (direction) => {
    const viewport = scrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const delta = Math.max(chatTabsScrollStepPx, Math.round(viewport.clientWidth * 0.72)) * direction;
    if (typeof viewport.scrollBy === "function") {
      viewport.scrollBy({ left: delta, behavior: "smooth" });
    } else {
      viewport.scrollLeft += delta;
    }

    window.requestAnimationFrame(() => updateTabScrollState());
  };

  const scrollButtonClassName = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground/85 transition hover:border-foreground/25 hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:border-border/45 disabled:bg-muted/28 disabled:text-muted-foreground/45 disabled:opacity-100";
  const handlePrimaryPress = (event) => {
    const button = typeof event.button === "number" ? event.button : 0;
    return button === 0;
  };
  const handleTabActivatePointerDown = (event, tabId, active) => {
    if (!handlePrimaryPress(event) || active) {
      return;
    }
    onActivate?.(tabId);
  };
  const handleTabActivateClick = (event, tabId, active) => {
    if (event.detail !== 0 || active) {
      return;
    }
    onActivate?.(tabId);
  };
  const handleTabClosePointerDown = (event, tabId) => {
    event.stopPropagation();
    if (!handlePrimaryPress(event)) {
      return;
    }
    onClose?.(tabId);
  };
  const handleTabCloseClick = (event, tabId) => {
    event.stopPropagation();
    if (event.detail !== 0) {
      return;
    }
    onClose?.(tabId);
  };
  const handleScrollPointerDown = (event, direction) => {
    if (!handlePrimaryPress(event)) {
      return;
    }
    scrollTabsBy(direction);
  };
  const handleScrollClick = (event, direction) => {
    if (event.detail !== 0) {
      return;
    }
    scrollTabsBy(direction);
  };

  return (
    <div className={cn("flex h-full min-w-0 min-h-[54px] items-center gap-1 pt-0 pb-0", className)}>
      {leadingControl ? <div className="shrink-0">{leadingControl}</div> : null}
      {tabScrollState.hasOverflow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={scrollButtonClassName}
              aria-label={messages.chat.scrollTabsLeft}
              disabled={!tabScrollState.canScrollLeft}
              onPointerDown={(event) => handleScrollPointerDown(event, -1)}
              onClick={(event) => handleScrollClick(event, -1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{messages.chat.scrollTabsLeft}</TooltipContent>
        </Tooltip>
      ) : null}
      {items.length ? (
        <div className="min-w-0 flex-1">
          <div
            ref={scrollViewportRef}
            className="cc-chat-tabs-viewport cc-tab-scrollbar-hidden min-h-[54px] min-w-0 overflow-x-auto overflow-y-hidden"
          >
            <div ref={scrollContentRef} className="inline-flex min-w-max items-end gap-1 px-1 pt-0 pb-1">
              {items.map((item, index) => {
                const shortcutNumber = index < 9 ? String(index + 1) : null;
                const isClosableActiveTab = closable && item.active;
                const tabTitle = item.title || item.agentId;
                const imTitleParts = splitImTabTitleForDisplay(tabTitle, item.agentId, item.sessionUser);

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
                    onPointerDown={(event) => {
                      if (items.length <= 1 || event.button !== 0) {
                        return;
                      }
                      if (event.target.closest("[data-tab-close-button='true']")) {
                        return;
                      }

                      suppressTabClickRef.current = false;
                      const rect = event.currentTarget.getBoundingClientRect();
                      draggingTabIdRef.current = item.id;
                      lastReorderIntentRef.current = "";
                      dragSessionRef.current = {
                        active: false,
                        currentLeft: rect.left,
                        height: rect.height,
                        pointerId: event.pointerId,
                        rectLeft: rect.left,
                        rectTop: rect.top,
                        startX: event.clientX,
                        startY: event.clientY,
                        tabId: item.id,
                        width: rect.width,
                        xOffset: event.clientX - rect.left,
                      };
                    }}
                    className={cn(
                      "group relative inline-flex box-border h-[50px] max-w-[13rem] pt-[14px]",
                      draggingTabId === item.id ? "cursor-grabbing" : "cursor-grab",
                    )}
                    style={dragSession?.tabId === item.id && dragSession?.active
                      ? { height: `${chatTabWrapperHeightPx}px`, opacity: 0, width: `${dragSession.width}px` }
                      : undefined}
                  >
	                    {shortcutNumber ? (
	                      <Tooltip>
	                        <TooltipTrigger asChild>
	                          <button
	                            type="button"
	                            draggable={false}
	                            className={cn(
	                              "absolute left-[0.8125rem] top-0 z-10 inline-flex min-w-3 -translate-x-1/2 items-center justify-center px-0.5 text-[12px] font-bold leading-none tabular-nums",
	                              item.active ? "text-primary/22" : "text-muted-foreground/22",
	                            )}
	                            onPointerDown={(event) => {
	                              event.stopPropagation();
	                              handleTabActivatePointerDown(event, item.id, item.active);
	                            }}
	                            onClick={(event) => {
	                              event.stopPropagation();
	                              handleTabActivateClick(event, item.id, item.active);
	                            }}
	                          >
	                            {shortcutNumber}
	                          </button>
	                        </TooltipTrigger>
	                        <TooltipContent side="bottom">
	                          {formatShortcutForPlatform(messages.chat.tabSwitchTooltip(shortcutNumber))}
	                        </TooltipContent>
	                      </Tooltip>
	                    ) : null}
	                    <div
	                      className={cn(
	                        "inline-flex h-9 items-center overflow-visible rounded-md border transition",
	                        item.active
	                          ? resolvedTheme === "dark"
	                            ? "border-transparent bg-[#0f3e6a] text-white shadow-sm hover:bg-[#0f3e6a]"
	                            : "border-transparent bg-[#1677eb] text-white shadow-sm hover:bg-[#0f6fe0]"
	                          : "border-border/45 bg-muted/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-border/70 hover:bg-muted/88",
	                      )}
	                    >
	                      <button
	                        type="button"
	                        draggable={false}
	                        className="relative inline-flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-sm outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                        onPointerDown={(event) => {
                          if (suppressTabClickRef.current) {
                            suppressTabClickRef.current = false;
                            return;
                          }
                          handleTabActivatePointerDown(event, item.id, item.active);
                        }}
                        onClick={(event) => {
                          if (suppressTabClickRef.current) {
                            suppressTabClickRef.current = false;
                            return;
                          }
                          handleTabActivateClick(event, item.id, item.active);
                        }}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            item.busy
                              ? "cc-chat-tab-busy-dot bg-emerald-500"
                              : item.active ? "bg-white/65" : "bg-muted-foreground/35",
                          )}
                        />
                        <span className={cn("min-w-0 flex-1 truncate font-medium", item.active ? "text-white" : "text-inherit")}>
                          {imTitleParts ? (
                            <>
                              <span>{imTitleParts.platformLabel}</span>
                              {" "}
                              <span className={cn("text-[11px]", item.active ? "text-white/70" : "text-muted-foreground")}>{imTitleParts.agentName}</span>
                            </>
                          ) : tabTitle}
                        </span>
                        {item.unreadCount > 0 && !item.active ? (
                          <span
                            aria-hidden="true"
                            className="cc-chat-tab-unread-badge inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
                          >
                            {item.unreadCount > 99 ? "99+" : item.unreadCount}
                          </span>
                        ) : null}
	                      </button>
                      {shortcutNumber ? (
                        isClosableActiveTab ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                draggable={false}
                                data-tab-close-button="true"
                                className={cn(
                                  "mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold leading-none transition",
                                  item.active
                                    ? "text-white/90 hover:bg-white/14 hover:text-white"
                                    : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                                )}
                                onPointerDown={(event) => handleTabClosePointerDown(event, item.id)}
                                onClick={(event) => handleTabCloseClick(event, item.id)}
                                aria-label={messages.chat.closeTabAriaLabel(tabTitle)}
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
                  </div>
                );
              })}
              {trailingControl ? <div className="shrink-0 pl-1">{trailingControl}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
      {dragSession?.active && (() => {
        const draggedItem = items.find((item) => item.id === dragSession.tabId) || null;
        if (!draggedItem || typeof document === "undefined") {
          return null;
        }
        const draggedItemIndex = items.findIndex((item) => item.id === draggedItem.id);
        const draggedShortcutNumber = draggedItemIndex >= 0 && draggedItemIndex < 9
          ? String(draggedItemIndex + 1)
          : null;
        const tabTitle = draggedItem.title || draggedItem.agentId;
        const imTitleParts = splitImTabTitleForDisplay(tabTitle, draggedItem.agentId, draggedItem.sessionUser);

        return createPortal(
          <div
            ref={dragOverlayRef}
            data-dragging-tab-overlay="true"
            className="pointer-events-none fixed z-40 inline-flex box-border h-[50px] max-w-[13rem] pt-[14px] will-change-[left]"
            style={{
              left: `${typeof dragSession.currentLeft === "number" ? dragSession.currentLeft : dragSession.rectLeft}px`,
              top: `${dragSession.rectTop}px`,
              width: `${dragSession.width}px`,
            }}
          >
            {draggedShortcutNumber ? (
              <div
                className={cn(
                  "absolute left-[0.8125rem] top-0 z-10 inline-flex min-w-3 -translate-x-1/2 items-center justify-center px-0.5 text-[12px] font-bold leading-none tabular-nums",
                  draggedItem.active ? "text-primary/22" : "text-muted-foreground/22",
                )}
              >
                {draggedShortcutNumber}
              </div>
            ) : null}
            <div
              className={cn(
                "inline-flex h-9 items-center overflow-visible rounded-md border transition",
                draggedItem.active
                  ? resolvedTheme === "dark"
                    ? "border-transparent bg-[#0f3e6a] text-white shadow-sm"
                    : "border-transparent bg-[#1677eb] text-white shadow-sm"
                  : "border-border/45 bg-muted/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
              )}
            >
              <div className="relative inline-flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-sm">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    draggedItem.busy
                      ? "cc-chat-tab-busy-dot bg-emerald-500"
                      : draggedItem.active ? "bg-white/65" : "bg-muted-foreground/35",
                  )}
                />
                <span className={cn("min-w-0 flex-1 truncate font-medium", draggedItem.active ? "text-white" : "text-inherit")}>
                  {imTitleParts ? (
                    <>
                      <span>{imTitleParts.platformLabel}</span>
                      {" "}
                      <span className={cn("text-[11px]", draggedItem.active ? "text-white/70" : "text-muted-foreground")}>{imTitleParts.agentName}</span>
                    </>
                  ) : tabTitle}
                </span>
                {draggedItem.unreadCount > 0 && !draggedItem.active ? (
                  <span
                    aria-hidden="true"
                    className="cc-chat-tab-unread-badge inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
                  >
                    {draggedItem.unreadCount > 99 ? "99+" : draggedItem.unreadCount}
                  </span>
                ) : null}
              </div>
              {closable && draggedItem.active ? (
                <div
                  className={cn(
                    "mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold leading-none",
                    draggedItem.active ? "text-white/90" : "text-foreground/80",
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        );
      })()}
      {tabScrollState.hasOverflow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={scrollButtonClassName}
              aria-label={messages.chat.scrollTabsRight}
              disabled={!tabScrollState.canScrollRight}
              onPointerDown={(event) => handleScrollPointerDown(event, 1)}
              onClick={(event) => handleScrollClick(event, 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{messages.chat.scrollTabsRight}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  agentLabel = "main",
  activeChatTabId,
  busy,
  chatFontSize = "small",
  chatTabs = [],
  composerSendMode = "enter-send",
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
  onComposerSendModeToggle,
  onReorderChatTab,
  onRemoveAttachment,
  onEditQueuedMessage,
  onPromptChange,
  onPromptKeyDown,
  onClearQueuedMessages,
  onRemoveQueuedMessage,
  onReset,
  onSend,
  onStop,
  prompt,
  promptSyncVersion = 0,
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
  const { intlLocale, messages: i18n } = useI18n();
  const attachmentInputRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const composerCompositionActiveRef = useRef(false);
  const composerCompositionGuardTimeoutRef = useRef(0);
  const composerCompositionGuardArmedAtRef = useRef(0);
  const composerLastCompositionAtRef = useRef(0);
  const ignoreNextComposerCompositionCommitRef = useRef(false);
  const guardedComposerReplaySourceRef = useRef("");
  const { filePreview, imagePreview, handleOpenPreview, openImagePreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const [agentMention, setAgentMention] = useState(null);
  const [manualMention, setManualMention] = useState(null);
  const [mentionAnchor, setMentionAnchor] = useState("composer");
  const [messageViewportNode, setMessageViewportNode] = useState(null);
  const [highlightedAgentIndex, setHighlightedAgentIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [showLatestReplyButton, setShowLatestReplyButton] = useState(false);
  const [composerPrompt, setComposerPrompt] = useState(prompt);
  const [latchedStreamingTailMessageId, setLatchedStreamingTailMessageId] = useState("");
  const mentionMenuRef = useRef(null);
  const latestAssistantBubbleRef = useRef(null);
  const bottomSentinelRef = useRef(null);
  const streamingTailIndicatorClearTimeoutRef = useRef(0);
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
  const pendingAutoFollowResumeOnBottomRef = useRef(false);
  const manualScrollLockMovedAwayFromBottomRef = useRef(false);
  const pointerScrollIntentRef = useRef(false);
  const scrollModeRef = useRef("follow-bottom");
  const programmaticScrollRef = useRef(false);
  const programmaticScrollResetRef = useRef(0);
  const animatedScrollFrameRef = useRef(0);
  const restoredScrollKeyRef = useRef("");
  const restoredScrollRetryRef = useRef(0);
  const restoredScrollStabilizerRefs = useRef([]);
  const restoreStabilizingRef = useRef(false);
  const suppressRestoredBottomButtonRef = useRef(false);
  const suppressedBottomButtonAssistantKeyRef = useRef("");
  const focusHighlightStartTimeoutRef = useRef(0);
  const focusHighlightTimeoutRef = useRef(0);
  const previousConversationKeyRef = useRef("");
  const previousLatestMessageCardKeyRef = useRef("");
  const previousLatestUserMessageKeyRef = useRef("");
  const pinTopAllowedForTurnRef = useRef(false);
  const currentAgentName = session.agentId || agentLabel || "main";
  const currentConversationTitle = buildCurrentConversationTitle(currentAgentName, session.sessionUser, i18n.chat.title, intlLocale);
  const promptPlaceholder = useMemo(() => {
    if (typeof i18n.chat.promptPlaceholder === "function") {
      return i18n.chat.promptPlaceholder(currentAgentName);
    }
    return i18n.chat.promptPlaceholder;
  }, [currentAgentName, i18n.chat]);
  const promptPlaceholderVisual = useMemo(
    () => String(promptPlaceholder || "").replace(/^\s*💡\s*/, ""),
    [promptPlaceholder],
  );
  const promptPlaceholderSegments = useMemo(() => {
    const placeholderText = String(promptPlaceholderVisual || "");
    const agentName = String(currentAgentName || "");
    if (!agentName) {
      return { before: placeholderText, agent: "", after: "" };
    }
    const agentIndex = placeholderText.indexOf(agentName);
    if (agentIndex < 0) {
      return { before: placeholderText, agent: "", after: "" };
    }
    return {
      before: placeholderText.slice(0, agentIndex),
      agent: agentName,
      after: placeholderText.slice(agentIndex + agentName.length),
    };
  }, [currentAgentName, promptPlaceholderVisual]);
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
  const showBusyBadge = busy
    || hasActiveAssistantReply
    || (
      isImSessionUser(session.sessionUser)
      && ["running", "dispatching"].includes(normalizeStatusKey(session.status))
    );
  const showStopButton = Boolean(onStop) && showBusyBadge;
  const { isStaleRunning, staleSeconds } = useStaleRunningDetector({ busy: showBusyBadge, messages });
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
  const latestAssistantCanShowStreamingTail = useMemo(
    () => Boolean(
      latestAssistantMessageId
        && latestAssistantMessage?.role === "assistant"
        && !latestAssistantMessage?.pending
        && String(latestAssistantMessage?.content || "").trim()
        && (showBusyBadge || hasActiveAssistantReply),
    ),
    [hasActiveAssistantReply, latestAssistantMessage, latestAssistantMessageId, showBusyBadge],
  );
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

  useEffect(() => {
    window.clearTimeout(streamingTailIndicatorClearTimeoutRef.current);

    if (latestAssistantCanShowStreamingTail && latestAssistantMessageId) {
      setLatchedStreamingTailMessageId((current) => (
        current === latestAssistantMessageId ? current : latestAssistantMessageId
      ));
      return () => {
        window.clearTimeout(streamingTailIndicatorClearTimeoutRef.current);
      };
    }

    if (latchedStreamingTailMessageId) {
      streamingTailIndicatorClearTimeoutRef.current = window.setTimeout(() => {
        setLatchedStreamingTailMessageId("");
        streamingTailIndicatorClearTimeoutRef.current = 0;
      }, streamingTailIndicatorClearDelayMs);
    }

    return () => {
      window.clearTimeout(streamingTailIndicatorClearTimeoutRef.current);
    };
  }, [latchedStreamingTailMessageId, latestAssistantCanShowStreamingTail, latestAssistantMessageId]);
  const disarmComposerCompositionGuard = useCallback(() => {
    ignoreNextComposerCompositionCommitRef.current = false;
    composerCompositionGuardArmedAtRef.current = 0;
    guardedComposerReplaySourceRef.current = "";
    window.clearTimeout(composerCompositionGuardTimeoutRef.current);
    composerCompositionGuardTimeoutRef.current = 0;
  }, []);
  const clearComposerInput = useCallback((syncExternal = true) => {
    setComposerPrompt("");
    setAgentMention(null);
    setManualMention(null);
    setMentionAnchor("composer");
    setHighlightedAgentIndex(0);
    if (composerTextareaRef.current && String(composerTextareaRef.current.value || "")) {
      composerTextareaRef.current.value = "";
    }
    if (syncExternal) {
      onPromptChange("");
    }
  }, [onPromptChange]);
  const armComposerCompositionGuard = useCallback(() => {
    const replaySource = String(composerTextareaRef.current?.value || composerPrompt || "").trim();
    const recentlyComposed = composerCompositionActiveRef.current || Date.now() - composerLastCompositionAtRef.current <= 320;
    if (!recentlyComposed) {
      disarmComposerCompositionGuard();
      return;
    }

    ignoreNextComposerCompositionCommitRef.current = true;
    composerCompositionGuardArmedAtRef.current = Date.now();
    guardedComposerReplaySourceRef.current = replaySource;
    window.clearTimeout(composerCompositionGuardTimeoutRef.current);
    composerCompositionGuardTimeoutRef.current = window.setTimeout(() => {
      ignoreNextComposerCompositionCommitRef.current = false;
      guardedComposerReplaySourceRef.current = "";
      composerCompositionGuardTimeoutRef.current = 0;
    }, 320);
  }, [composerPrompt, disarmComposerCompositionGuard]);
  const shouldIgnoreComposerCompositionReplay = useCallback((event, nextPrompt = "") => {
    const nativeEvent = event?.nativeEvent || {};
    return shouldSuppressComposerReplay({
      armed: ignoreNextComposerCompositionCommitRef.current,
      armedAt: composerCompositionGuardArmedAtRef.current,
      eventType: event?.type,
      inputType: nativeEvent.inputType,
      isNativeComposing: nativeEvent.isComposing,
      nextPrompt,
      replaySource: guardedComposerReplaySourceRef.current,
    });
  }, []);
  const handleComposerSend = useCallback(() => {
    armComposerCompositionGuard();
    onSend?.();
    clearComposerInput();
  }, [armComposerCompositionGuard, clearComposerInput, onSend]);
  const focusComposerAtEnd = useCallback(() => {
    window.requestAnimationFrame(() => {
      const node = composerTextareaRef.current;
      if (!node) {
        return;
      }
      node.focus();
      const selectionEnd = node.value.length;
      node.setSelectionRange?.(selectionEnd, selectionEnd);
    });
  }, []);
  const handleEditQueuedMessage = useCallback((item) => {
    if (!item) {
      return;
    }

    const nextPrompt = String(item.content || "");
    disarmComposerCompositionGuard();
    const handled = typeof onEditQueuedMessage === "function"
      ? onEditQueuedMessage(item.id)
      : (() => {
      onPromptChange(nextPrompt);
      onRemoveQueuedMessage?.(item.id);
      return true;
    })();

    if (handled === false) {
      return;
    }

    setComposerPrompt(nextPrompt);
    setAgentMention(null);
    setManualMention(null);
    setMentionAnchor("composer");
    setHighlightedAgentIndex(0);

    focusComposerAtEnd();
  }, [disarmComposerCompositionGuard, focusComposerAtEnd, onEditQueuedMessage, onPromptChange, onRemoveQueuedMessage]);
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
  const resolvedMessageViewport = messageViewportNode || messageViewportRef?.current || null;
  const handleMessageViewportRef = useCallback((node) => {
    setMessageViewportNode((current) => (current === node ? current : node));
    if (typeof messageViewportRef === "function") {
      messageViewportRef(node);
      return;
    }
    if (messageViewportRef && typeof messageViewportRef === "object") {
      messageViewportRef.current = node;
    }
  }, [messageViewportRef]);

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

  useEffect(() => {
    setComposerPrompt((current) => (current === prompt ? current : prompt));
  }, [prompt, promptSyncVersion]);

  useEffect(() => () => {
    window.clearTimeout(composerCompositionGuardTimeoutRef.current);
  }, []);

  useLayoutEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }

    if (!String(textarea.value || "")) {
      textarea.style.height = "";
      textarea.style.overflowY = "hidden";
      return;
    }

    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const maxHeight = lineHeight * maxPromptRows + paddingTop + paddingBottom + borderTop + borderBottom;

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }, [composerPrompt]);

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

  const applyMention = useCallback((value) => {
    if (!activeMention) {
      return;
    }

    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }

    const nextPrompt = `${composerPrompt.slice(0, activeMention.start)}${normalizedValue} ${composerPrompt.slice(activeMention.end)}`;
    const nextCaret = activeMention.start + normalizedValue.length + 1;
    setComposerPrompt(nextPrompt);
    onPromptChange(nextPrompt);
    setAgentMention(null);
    setManualMention(null);
    setMentionAnchor("composer");
    setHighlightedAgentIndex(0);

    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange?.(nextCaret, nextCaret);
    });
  }, [activeMention, composerPrompt, onPromptChange]);

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
    suppressRestoredBottomButtonRef.current = false;
    suppressedBottomButtonAssistantKeyRef.current = "";
    if (force || !programmaticScrollRef.current) {
      const wasManualLocked =
        manualScrollLockRef.current
        || persistentManualScrollLockRef.current
        || pendingAutoFollowResumeOnBottomRef.current;
      pinTopAllowedForTurnRef.current = false;
      autoScrollSuppressedRef.current = true;
      scrollModeRef.current = "manual";
      if (lockAutoFollow) {
        manualScrollLockRef.current = true;
        persistentManualScrollLockRef.current = true;
        pendingAutoFollowResumeOnBottomRef.current = true;
        if (!wasManualLocked) {
          manualScrollLockMovedAwayFromBottomRef.current = false;
        }
      }
      if (restoredScrollKey) {
        restoredScrollKeyRef.current = `${restoredScrollKey}:${restoredScrollRevision}`;
      }
    }
  }, [cancelAnimatedViewportScroll, restoredScrollKey, restoredScrollRevision]);

  const resumeAutomaticLatestReplyFollow = useCallback((nextMode = "follow-bottom") => {
    manualScrollLockRef.current = false;
    persistentManualScrollLockRef.current = false;
    pendingAutoFollowResumeOnBottomRef.current = false;
    manualScrollLockMovedAwayFromBottomRef.current = false;
    autoScrollSuppressedRef.current = false;
    scrollModeRef.current = nextMode;
    suppressRestoredBottomButtonRef.current = false;
    suppressedBottomButtonAssistantKeyRef.current = "";
  }, []);

  const updateViewportBottomState = useCallback((isNearBottom, { markManual = false, viewport } = {}) => {
    const resolvedViewport = viewport || resolvedMessageViewport;
    wasNearBottomRef.current = isNearBottom;
    if (markManual) {
      if (!programmaticScrollRef.current) {
        pinTopAllowedForTurnRef.current = false;
      }
      suppressRestoredBottomButtonRef.current = false;
      suppressedBottomButtonAssistantKeyRef.current = "";
    }

    if (isNearBottom) {
      if (manualScrollLockRef.current && programmaticScrollRef.current) {
        return;
      }

      if (
        (pendingAutoFollowResumeOnBottomRef.current && manualScrollLockMovedAwayFromBottomRef.current)
        || ((manualScrollLockRef.current || persistentManualScrollLockRef.current) && !programmaticScrollRef.current)
      ) {
        pendingAutoFollowResumeOnBottomRef.current = false;
        persistentManualScrollLockRef.current = false;
        manualScrollLockRef.current = false;
        manualScrollLockMovedAwayFromBottomRef.current = false;
        autoScrollSuppressedRef.current = false;
        scrollModeRef.current = "follow-bottom";
      } else if (persistentManualScrollLockRef.current) {
        autoScrollSuppressedRef.current = true;
        scrollModeRef.current = "manual";
      } else {
        manualScrollLockRef.current = false;
        autoScrollSuppressedRef.current = false;
        if (scrollModeRef.current === "manual" || scrollModeRef.current === "pin-top") {
          scrollModeRef.current = "follow-bottom";
        }
      }
    } else {
      if ((manualScrollLockRef.current || persistentManualScrollLockRef.current) && !programmaticScrollRef.current) {
        manualScrollLockMovedAwayFromBottomRef.current = true;
      }
      if (markManual && !programmaticScrollRef.current) {
        autoScrollSuppressedRef.current = true;
        scrollModeRef.current = "manual";
      }
    }

    const maxTop = resolvedViewport
      ? Math.max(0, resolvedViewport.scrollHeight - resolvedViewport.clientHeight)
      : 0;
    const shouldSuppressRestoredButton = suppressRestoredBottomButtonRef.current && !markManual;
    setShowLatestReplyButton(
      !shouldSuppressRestoredButton
      && messages.length > 0
      && maxTop > 48
      && (scrollModeRef.current === "pin-top" || !isNearBottom),
    );
  }, [messages.length, resolvedMessageViewport]);

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

    const targetTop = Number.isFinite(top) ? top : Number(viewport.scrollTop) || 0;
    scrollViewport(viewport, targetTop, duration > 0 ? "smooth" : "auto", duration);
  }, [scrollViewport]);

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
      const viewport = resolvedMessageViewport;
      previousConversationKeyRef.current = visibleConversationKey;
      previousLatestMessageCardKeyRef.current = latestMessageCardKey;
      previousLatestUserMessageKeyRef.current = latestUserMessageKey;
      pinTopAllowedForTurnRef.current = false;
      manualScrollLockRef.current = false;
      persistentManualScrollLockRef.current = false;
      pendingAutoFollowResumeOnBottomRef.current = false;
      manualScrollLockMovedAwayFromBottomRef.current = false;
      autoScrollSuppressedRef.current = false;
      scrollModeRef.current = "follow-bottom";
      wasNearBottomRef.current = true;
      restoredScrollKeyRef.current = "";
      suppressRestoredBottomButtonRef.current = messages.length > 0;
      suppressedBottomButtonAssistantKeyRef.current = messages.length > 0 ? latestAssistantRenderKey : "";
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
    if (latestUserMessageKey && latestUserMessageKey !== previousLatestUserMessageKey) {
      pinTopAllowedForTurnRef.current = true;
      resumeAutomaticLatestReplyFollow("force-bottom");
    }

    if (!latestMessage || latestMessage.role !== "user" || latestMessageCardKey === previousLatestMessageCardKey) {
      return;
    }

    const viewport = resolvedMessageViewport;
    resumeAutomaticLatestReplyFollow("force-bottom");
    if (viewport) {
      const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      scrollViewport(viewport, top, "auto");
      wasNearBottomRef.current = true;
      setShowLatestReplyButton(false);
    }
  }, [
    latestMessageCardKey,
    latestAssistantRenderKey,
    latestUserMessageKey,
    messages,
    resolvedMessageViewport,
    resumeAutomaticLatestReplyFollow,
    scrollViewport,
    visibleConversationKey,
  ]);

  useLayoutEffect(() => {
    const viewport = resolvedMessageViewport;
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
      const latestViewport = resolvedMessageViewport;
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
      if (restoreToBottom) {
        pinTopAllowedForTurnRef.current = false;
      }
      wasNearBottomRef.current = isNearBottom;
      autoScrollSuppressedRef.current = restoreToBottom ? false : !isNearBottom;
      scrollModeRef.current = restoreToBottom
        ? "force-bottom"
        : isNearBottom
          ? "follow-bottom"
          : "manual";
      suppressRestoredBottomButtonRef.current = !restoreToBottom && !isNearBottom;
      suppressedBottomButtonAssistantKeyRef.current = !restoreToBottom && !isNearBottom ? latestAssistantRenderKey : "";
      return usedAnchor;
    };

    window.clearTimeout(restoredScrollRetryRef.current);
    restoredScrollStabilizerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    restoredScrollStabilizerRefs.current = [];
    const usedAnchor = applyRestoredScroll();
    restoredScrollKeyRef.current = restoreSignature;
    restoreStabilizingRef.current = true;
    setShowLatestReplyButton(false);
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

    resizeFrameId = window.requestAnimationFrame(() => {
      if (restoredScrollKeyRef.current !== restoreSignature || !restoreStabilizingRef.current) {
        return;
      }
      applyRestoredScroll();
    });
    restoredScrollStabilizerRefs.current = [40, 120, 240, 480].map(scheduleRestoreStabilizer);

    const latestViewport = resolvedMessageViewport;
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
  }, [latestAssistantRenderKey, messages, resolvedMessageViewport, restoredScrollKey, restoredScrollRevision, restoredScrollState, session?.agentId, session?.sessionUser, visibleConversationKey]);

  useEffect(() => {
    if (!suppressRestoredBottomButtonRef.current) {
      return;
    }

    if (!latestAssistantRenderKey || latestAssistantRenderKey === suppressedBottomButtonAssistantKeyRef.current) {
      return;
    }

    suppressRestoredBottomButtonRef.current = false;
    suppressedBottomButtonAssistantKeyRef.current = "";

    const viewport = resolvedMessageViewport;
    if (!viewport || !messages.length) {
      return;
    }

    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const isNearBottom = maxTop <= 48
      ? true
      : viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
    updateViewportBottomState(isNearBottom, { viewport });
  }, [latestAssistantRenderKey, messages.length, resolvedMessageViewport, updateViewportBottomState]);

  useEffect(() => {
    const viewport = resolvedMessageViewport;
    if (!viewport) {
      return undefined;
    }

    const sentinel = bottomSentinelRef.current;
    const IntersectionObserverCtor = window.IntersectionObserver || globalThis.IntersectionObserver;
    const ResizeObserverCtor = window.ResizeObserver || globalThis.ResizeObserver;
    const updateWasNearBottom = (markManual = false) => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      updateViewportBottomState(distanceFromBottom <= 48, { markManual, viewport });
    };
    const scheduleBottomStateRefresh = () => {
      window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId = window.requestAnimationFrame(() => {
        updateWasNearBottom(false);
      });
    };

    let manualIntentTimeoutId = 0;
    const markManualTakeover = () => {
      pointerScrollIntentRef.current = true;
      window.clearTimeout(manualIntentTimeoutId);
      manualIntentTimeoutId = window.setTimeout(() => {
        pointerScrollIntentRef.current = false;
      }, 180);
      markUserScrollTakeover({ lockAutoFollow: true });
    };
    const handlePointerDown = () => {
      pointerScrollIntentRef.current = true;
    };
    const clearPointerIntent = () => {
      pointerScrollIntentRef.current = false;
    };

    updateWasNearBottom(false);
    let removeViewportScrollListener = null;
    let bottomObserver = null;
    let resizeObserver = null;
    let resizeFrameId = 0;
    const delayedRefreshIds = [0, 120, 320].map((delay) =>
      window.setTimeout(() => {
        scheduleBottomStateRefresh();
      }, delay),
    );
    const handleViewportScroll = () => updateWasNearBottom(pointerScrollIntentRef.current);
    viewport.addEventListener("scroll", handleViewportScroll, { passive: true });
    removeViewportScrollListener = () => viewport.removeEventListener("scroll", handleViewportScroll);

    if (IntersectionObserverCtor && sentinel) {
      bottomObserver = new IntersectionObserverCtor(
        (entries) => {
          const entry = entries.find((candidate) => candidate.target === sentinel) || entries[0];
          updateViewportBottomState(Boolean(entry?.isIntersecting || entry?.intersectionRatio > 0), {
            markManual: pointerScrollIntentRef.current,
            viewport,
          });
        },
        {
          root: viewport,
          rootMargin: "0px 0px 48px 0px",
          threshold: 0,
        },
      );
      bottomObserver.observe(sentinel);
    }
    if (ResizeObserverCtor) {
      resizeObserver = new ResizeObserverCtor(() => {
        scheduleBottomStateRefresh();
      });
      [viewport, viewport.firstElementChild].filter(Boolean).forEach((node) => resizeObserver.observe(node));
    }
    viewport.addEventListener("wheel", markManualTakeover, { passive: true });
    viewport.addEventListener("touchmove", markManualTakeover, { passive: true });
    viewport.addEventListener("pointerdown", handlePointerDown, { passive: true });
    const handleAnchorClick = (event) => {
      const target = event.target;
      if (target?.closest?.('a[href^="#"]')) {
        markUserScrollTakeover({ lockAutoFollow: true });
      }
    };
    viewport.addEventListener("click", handleAnchorClick, { passive: true, capture: true });
    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target) || !isManualScrollKey(event)) {
        return;
      }
      markUserScrollTakeover({ lockAutoFollow: true });
    };
    const doc = viewport.ownerDocument || document;
    window.addEventListener("keydown", handleKeyDown, { passive: true });
    doc.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("pointerup", clearPointerIntent, { passive: true });
    window.addEventListener("pointercancel", clearPointerIntent, { passive: true });
    return () => {
      delayedRefreshIds.forEach((timerId) => window.clearTimeout(timerId));
      window.clearTimeout(manualIntentTimeoutId);
      window.cancelAnimationFrame(resizeFrameId);
      resizeObserver?.disconnect?.();
      bottomObserver?.disconnect?.();
      removeViewportScrollListener?.();
      viewport.removeEventListener("wheel", markManualTakeover);
      viewport.removeEventListener("touchmove", markManualTakeover);
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("click", handleAnchorClick, true);
      window.removeEventListener("keydown", handleKeyDown);
      doc.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerup", clearPointerIntent);
      window.removeEventListener("pointercancel", clearPointerIntent);
    };
  }, [markUserScrollTakeover, resolvedMessageViewport, updateViewportBottomState]);

  const alignLatestAssistantReply = useCallback(() => {
    const viewport = resolvedMessageViewport;
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
      scrollModeRef.current = "follow-bottom";
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
  }, [latestAssistantIsCompactIntro, latestMessageIsAssistant, resolvedMessageViewport, scrollViewport]);

  useLayoutEffect(() => {
    alignLatestAssistantReply();
  }, [alignLatestAssistantReply, latestAssistantMessage?.streaming, latestAssistantMessageId, latestAssistantRenderKey]);

  useEffect(() => {
    const viewport = resolvedMessageViewport;
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
  }, [alignLatestAssistantReply, latestAssistantIsCompactIntro, latestAssistantMessageId, latestAssistantRenderKey, latestMessageIsAssistant, resolvedMessageViewport]);

  useEffect(() => {
    const viewport = resolvedMessageViewport;
    if (!viewport || !messages.length) {
      setShowLatestReplyButton(false);
      return undefined;
    }

    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const isNearBottom = maxTop <= 48
      ? true
      : viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
    updateViewportBottomState(isNearBottom, { viewport });
    return undefined;
  }, [latestAssistantRenderKey, messages.length, resolvedMessageViewport, updateViewportBottomState, visibleConversationKey]);

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
  }, [animateViewportScroll, focusMessageRequest, markUserScrollTakeover, messageViewportRef, queueFocusHighlight, resolvedMessageViewport, scrollViewport]);

  const handleJumpToLatestReply = () => {
    const viewport = resolvedMessageViewport;
    if (!viewport) {
      return;
    }

    pinTopAllowedForTurnRef.current = false;
    resumeAutomaticLatestReplyFollow("force-bottom");
    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    animateViewportScroll(viewport, top, artifactFocusScrollDurationMs);
    wasNearBottomRef.current = true;
    setShowLatestReplyButton(false);
  };

  const handleJumpToUserMessage = useCallback((targetMessageId) => {
    const viewport = resolvedMessageViewport;
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
  }, [animateViewportScroll, markUserScrollTakeover, queueFocusHighlight, resolvedMessageViewport]);

  const renderedMessageBubbles = useMemo(() => {
    if (!messages.length) {
      return <EmptyConversation />;
    }

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
      const showStreamingTail = Boolean(
        message.role === "assistant"
          && !message.pending
          && isLatestAssistant
          && latchedStreamingTailMessageId
          && latchedStreamingTailMessageId === messageId
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
          showStreamingTail={showStreamingTail}
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
          sessionUser={session?.sessionUser}
          staleWarning={message.pending && isStaleRunning ? i18n.chat.staleRunningWarning(staleSeconds) : null}
          separated={index > 0 && messages[index - 1]?.role !== message.role}
          chatFontSize={chatFontSize}
          userLabel={userLabel}
        />
      );
    });
  }, [
    agentLabel,
    animateViewportScroll,
    chatFontSize,
    files,
    formatTime,
    handleJumpToUserMessage,
    handleOpenPreview,
    highlightedMessageId,
    latestAssistantMessageId,
    latestMessageIsAssistant,
    markUserScrollTakeover,
    messages,
    messageViewportRef,
    openImagePreview,
    latchedStreamingTailMessageId,
    resolvedTheme,
    session?.sessionUser,
    userLabel,
  ]);

  const handleResetWithConfirm = () => {
    setShowResetDialog(true);
  };
  const [showResetDialog, setShowResetDialog] = useState(false);

  return (
    <>
      <ResetConversationDialog
        open={showResetDialog}
        messages={i18n.chat.resetConversationDialog}
        onCancel={() => setShowResetDialog(false)}
        onConfirm={() => {
          setShowResetDialog(false);
          onReset?.();
        }}
      />
      <div className={cn("grid h-full min-h-0", showTabsStrip ? "grid-rows-[54px_minmax(0,1fr)] gap-2" : "grid-rows-[minmax(0,1fr)] gap-0")}>
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
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="truncate text-sm font-semibold leading-none tracking-tight">{currentConversationTitle}</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={isStaleRunning ? "outline" : showBusyBadge ? "success" : "default"} className="h-6 shrink-0 px-2 py-0 text-[10px]">
                      {isStaleRunning ? i18n.chat.agentStaleRunning : showBusyBadge ? i18n.chat.agentBusy : i18n.chat.agentIdle}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{isStaleRunning ? i18n.chat.staleRunningWarning(staleSeconds) : showBusyBadge ? i18n.chat.agentBusyTooltip : i18n.chat.agentIdleTooltip}</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 self-start">
                <div className="flex items-center gap-0.5 rounded-md border border-border/70 bg-background/70 px-1 py-0.5">
                  {chatFontSizeOptions.map((item) => {
                    const active = item.value === chatFontSize;
                    return (
                      <Tooltip key={item.value}>
                        <TooltipTrigger asChild>
                          <button
                          type="button"
                          className={cn(
                              "inline-flex h-[1.375rem] w-6 items-center justify-center rounded-sm text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                      className="h-6 w-6 rounded-md text-muted-foreground/70 hover:text-foreground"
                      aria-label={i18n.chat.resetConversation}
                      disabled={interactionLocked || !openClawConnected}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="px-2.5 py-2 text-left">
                    <div className="text-xs font-medium leading-4">{formatShortcutForPlatform(i18n.chat.resetConversationHotkey)}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{i18n.chat.resetConversationTooltipHint}</div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {sessionOverview ? <div className="mt-2">{sessionOverview}</div> : null}
          </div>
          <CardContent className="grid min-h-0 grid-rows-[minmax(0,1fr)] p-0">
            <div className="relative min-h-0">
              <ScrollArea
                className="h-full"
                viewportRef={handleMessageViewportRef}
                onWheelCapture={() => markUserScrollTakeover({ lockAutoFollow: true })}
                onTouchMoveCapture={() => markUserScrollTakeover({ lockAutoFollow: true })}
              >
                <div className="grid gap-2 px-3 pt-2 pb-6">
                  {renderedMessageBubbles}
                  <div ref={bottomSentinelRef} aria-hidden="true" data-message-bottom-sentinel className="h-px w-full" />
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
            <QueuedMessages
              items={queuedMessages || []}
              onClearAll={onClearQueuedMessages}
              onEditItem={handleEditQueuedMessage}
              onRemoveItem={onRemoveQueuedMessage}
              textClassName={fontSizeStyles.queued}
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
                    ? "border-[#4d88c7] ring-2 ring-[#4d88c7]/20 focus-within:border-[#4d88c7] focus-within:ring-2 focus-within:ring-[#4d88c7]/20"
                    : "border-[#1677eb] ring-2 ring-[#1677eb]/35 focus-within:border-[#1677eb] focus-within:ring-2 focus-within:ring-[#1677eb]/35",
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
              <div className="relative">
                {openClawConnected && !composerPrompt ? (
                  <div
                    aria-hidden="true"
                    data-testid="composer-placeholder-overlay"
                    className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-1 px-3 py-2 text-muted-foreground/75"
                  >
                    <div className="text-sm">
                      <span>{promptPlaceholderSegments.before}</span>
                      {promptPlaceholderSegments.agent ? (
                        <span className="font-medium text-muted-foreground/75">
                          {promptPlaceholderSegments.agent}
                        </span>
                      ) : null}
                      <span>{promptPlaceholderSegments.after}</span>
                      <span className="ml-1 text-inherit">💡</span>
                    </div>
                    {i18n.chat.composerFocusHint ? (
                      <div className="text-xs leading-4 text-[#6b7280] dark:text-[#9ca3af]">
                        {i18n.chat.composerFocusHint}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Textarea
                  ref={setComposerTextareaNode}
                  rows={2}
                  value={composerPrompt}
                  onChange={(event) => {
                    const nextPrompt = event.target.value;
                    if (shouldIgnoreComposerCompositionReplay(event, nextPrompt)) {
                      disarmComposerCompositionGuard();
                      clearComposerInput();
                      return;
                    }
                    setComposerPrompt(nextPrompt);
                    onPromptChange(nextPrompt);
                    syncAgentMention(nextPrompt, event.target.selectionStart ?? nextPrompt.length);
                  }}
                  onCompositionStart={() => {
                    composerCompositionActiveRef.current = true;
                    composerLastCompositionAtRef.current = Date.now();
                  }}
                  onCompositionEnd={(event) => {
                    composerCompositionActiveRef.current = false;
                    composerLastCompositionAtRef.current = Date.now();
                    const nextPrompt = event.currentTarget.value;
                    if (shouldIgnoreComposerCompositionReplay(event, nextPrompt)) {
                      disarmComposerCompositionGuard();
                      clearComposerInput();
                      return;
                    }
                    syncAgentMention(nextPrompt, event.currentTarget.selectionStart ?? nextPrompt.length);
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
                  placeholder={openClawConnected ? promptPlaceholder : i18n.chat.disconnectedPlaceholder}
                  disabled={composerLocked}
                  className={cn(
                    "min-h-[4.6rem] resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0",
                    openClawConnected ? "placeholder:text-transparent" : "",
                  )}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ConnectionStatus
                composerSendMode={composerSendMode}
                onToggleComposerSendMode={onComposerSendModeToggle}
                resolvedTheme={resolvedTheme}
                session={session}
              />
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
                onMouseDown={(event) => {
                  if (!showStopButton) {
                    event.preventDefault();
                  }
                }}
                onClick={showStopButton ? onStop : handleComposerSend}
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
      {filePreview ? (
        <Suspense fallback={null}>
          <LazyFilePreviewOverlay
            files={files}
            preview={filePreview}
            resolvedTheme={resolvedTheme}
            onClose={closeFilePreview}
            onOpenFilePreview={handleOpenPreview}
          />
        </Suspense>
      ) : null}
      {imagePreview ? (
        <Suspense fallback={null}>
          <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
        </Suspense>
      ) : null}
    </>
  );
}
