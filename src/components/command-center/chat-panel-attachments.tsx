import { Paperclip, X } from "lucide-react";
import { memo } from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type AttachmentLike = {
  dataUrl?: string;
  fullPath?: string;
  id?: string;
  kind?: string;
  mimeType?: string;
  name?: string;
  path?: string;
  previewUrl?: string;
  size?: number;
};

function isImageAttachment(attachment: AttachmentLike = {}) {
  return attachment?.kind === "image" || /^image\//i.test(attachment?.mimeType || "");
}

function formatAttachmentSize(size = 0) {
  const numeric = Number(size) || 0;
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

function buildLocalFilePreviewUrl(filePath = "") {
  const normalizedPath = String(filePath || "").trim();
  return normalizedPath ? `/api/file-preview/content?path=${encodeURIComponent(normalizedPath)}` : "";
}

function getAttachmentImageSource(attachment: AttachmentLike = {}) {
  return String(
    attachment.previewUrl
    || attachment.dataUrl
    || buildLocalFilePreviewUrl(attachment.fullPath || attachment.path),
  ).trim();
}

function normalizeAttachmentSignaturePart(value = "") {
  return String(value || "").trim();
}

function getAttachmentRenderSignatures(attachment: AttachmentLike = {}, index = 0) {
  const signatures: string[] = [];
  const previewUrl = normalizeAttachmentSignaturePart(attachment.previewUrl);
  const dataUrl = normalizeAttachmentSignaturePart(attachment.dataUrl);
  const resolvedPath = normalizeAttachmentSignaturePart(attachment.fullPath || attachment.path);
  const name = normalizeAttachmentSignaturePart(attachment.name).toLowerCase();
  const mimeType = normalizeAttachmentSignaturePart(attachment.mimeType).toLowerCase();
  const kind = normalizeAttachmentSignaturePart(attachment.kind).toLowerCase();
  const size = Number.isFinite(attachment.size) ? String(attachment.size) : "";
  const id = normalizeAttachmentSignaturePart(attachment.id);

  if (previewUrl) {
    signatures.push(`preview|${previewUrl}`);
  }
  if (dataUrl) {
    signatures.push(`data|${dataUrl}`);
  }
  if (resolvedPath) {
    signatures.push(`path|${resolvedPath}`);
  }
  if (name && (mimeType || kind || size)) {
    signatures.push(`named|${name}|${mimeType}|${kind}|${size}`);
  }
  if (id) {
    signatures.push(`id|${id}`);
  }
  if (!signatures.length) {
    signatures.push(`index|${index}`);
  }

  return signatures;
}

function getAttachmentRenderRichness(attachment: AttachmentLike = {}) {
  let score = 0;

  if (attachment.previewUrl) {
    score += 32;
  }
  if (attachment.dataUrl) {
    score += 24;
  }
  if (attachment.fullPath || attachment.path) {
    score += 16;
  }
  if (attachment.mimeType) {
    score += 8;
  }
  if (attachment.kind) {
    score += 4;
  }
  if (attachment.size) {
    score += 2;
  }
  if (attachment.name) {
    score += 1;
  }

  return score;
}

function mergeRenderableAttachment(left: AttachmentLike = {}, right: AttachmentLike = {}) {
  const preferred = getAttachmentRenderRichness(right) >= getAttachmentRenderRichness(left) ? right : left;
  const fallback = preferred === right ? left : right;

  return {
    ...fallback,
    ...preferred,
    id: preferred.id || fallback.id,
    kind: preferred.kind || fallback.kind,
    name: preferred.name || fallback.name,
    mimeType: preferred.mimeType || fallback.mimeType,
    size: preferred.size ?? fallback.size,
    path: preferred.path || fallback.path,
    fullPath: preferred.fullPath || fallback.fullPath,
    dataUrl: preferred.dataUrl || fallback.dataUrl,
    previewUrl: preferred.previewUrl || fallback.previewUrl,
  };
}

function dedupeRenderableAttachments(attachments: AttachmentLike[] = []) {
  const dedupedAttachments: AttachmentLike[] = [];

  attachments.forEach((attachment, index) => {
    const signatures = new Set(getAttachmentRenderSignatures(attachment, index));
    const existingIndex = dedupedAttachments.findIndex((candidate, candidateIndex) =>
      getAttachmentRenderSignatures(candidate, candidateIndex).some((signature) => signatures.has(signature)));

    if (existingIndex === -1) {
      dedupedAttachments.push(attachment);
      return;
    }

    dedupedAttachments[existingIndex] = mergeRenderableAttachment(dedupedAttachments[existingIndex], attachment);
  });

  return dedupedAttachments;
}

export const MessageAttachments = memo(function MessageAttachments({
  attachments,
  mode = "message",
  onPreviewImage,
  scrollAnchorBaseId = "",
}: {
  attachments?: AttachmentLike[];
  mode?: "composer" | "message";
  onPreviewImage?: (attachment: AttachmentLike) => void;
  scrollAnchorBaseId?: string;
}) {
  if (!attachments?.length) {
    return null;
  }

  const dedupedAttachments = dedupeRenderableAttachments(attachments);
  const imageAttachments = dedupedAttachments.filter(isImageAttachment);
  const fileAttachments = dedupedAttachments.filter((attachment) => !isImageAttachment(attachment));
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
});

export const ComposerAttachments = memo(function ComposerAttachments({
  attachments,
  onPreviewImage,
  onRemoveAttachment,
}: {
  attachments?: AttachmentLike[];
  onPreviewImage?: (attachment: AttachmentLike) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
}) {
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
              onClick={() => attachment.id && onRemoveAttachment?.(attachment.id)}
            >
              <X className="h-2 w-2" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
