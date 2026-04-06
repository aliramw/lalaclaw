import { lazy, memo, Suspense } from "react";
import type { ComponentProps } from "react";
import type { SessionFile } from "@/types/chat";
import { contentNeedsMarkdownRenderer } from "@/components/command-center/markdown-content-utils";
import type { MarkdownAnnotationHighlightRange } from "@/components/command-center/markdown-annotation-utils";
import { cn } from "@/lib/utils";

const markdownShellBaseClassName =
  "min-w-0 max-w-full break-words [overflow-wrap:anywhere] " +
  "[&_a]:no-underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-l-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_h1]:mt-[1.95em] [&_h1]:mb-[0.75em] [&_h1]:text-[1.9em] [&_h1]:font-bold [&_h1]:leading-[1.1] [&_h1:first-child]:mt-0 " +
  "[&_h2]:mt-[1.75em] [&_h2]:mb-[0.65em] [&_h2]:text-[1.5em] [&_h2]:font-semibold [&_h2]:leading-[1.14] [&_h2:first-child]:mt-0 " +
  "[&_h3]:mt-[1.5em] [&_h3]:mb-[0.55em] [&_h3]:text-[1.24em] [&_h3]:font-semibold [&_h3]:leading-[1.2] [&_h3:first-child]:mt-0 " +
  "[&_h4]:mt-[1.35em] [&_h4]:mb-[0.45em] [&_h4]:text-[1.08em] [&_h4]:font-semibold [&_h4]:leading-[1.24] [&_h4:first-child]:mt-0 " +
  "[&_h5]:mt-[1.3em] [&_h5]:mb-[0.45em] [&_h5]:text-[1em] [&_h5]:font-semibold [&_h5]:leading-[1.32] [&_h5:first-child]:mt-0 " +
  "[&_h6]:mt-[1.2em] [&_h6]:mb-[0.4em] [&_h6]:text-[0.9em] [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-[0.08em] [&_h6]:text-muted-foreground [&_h6]:leading-[1.35] [&_h6:first-child]:mt-0 " +
  "[&_blockquote:last-child]:mb-0 [&_pre:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse " +
  "[&_thead]:bg-muted/40 [&_th]:border [&_th]:border-border " +
  "[&_th]:px-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-border " +
  "[&_td]:px-2 [&_td]:align-top [&_hr]:border-border";

const markdownShellTypographyClassNames = {
  small:
    "text-[11px] leading-[1.15rem] " +
    "[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_li]:leading-[1.15rem] [&_ul]:my-1.5 [&_ol]:my-1.5 " +
    "[&_th]:py-1 [&_td]:py-1 [&_hr]:my-2",
  medium:
    "text-[12px] leading-5 " +
    "[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_li]:leading-5 [&_ul]:my-1.5 [&_ol]:my-1.5 " +
    "[&_th]:py-1.5 [&_td]:py-1.5 [&_hr]:my-2.5",
  large:
    "text-[14px] leading-6 " +
    "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_li]:leading-6 [&_ul]:my-2 [&_ol]:my-2 " +
    "[&_th]:py-2 [&_td]:py-2 [&_hr]:my-3",
};

type MarkdownFontSize = "small" | "medium" | "large";

function getMarkdownShellClassName(fontSize: MarkdownFontSize = "medium") {
  return cn(markdownShellBaseClassName, markdownShellTypographyClassNames[fontSize] || markdownShellTypographyClassNames.medium);
}

function normalizeSourceOffset(value: unknown): number | null {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue)) {
    return null;
  }

  return Math.max(0, Math.floor(nextValue));
}

function resolveHighlightTone(
  highlightRanges: MarkdownAnnotationHighlightRange[] = [],
  segmentStart: number,
  segmentEnd: number,
) {
  let fallbackTone: "annotation" | "selection" = "annotation";

  for (const range of highlightRanges) {
    const start = normalizeSourceOffset(range?.start);
    const end = normalizeSourceOffset(range?.end);

    if (start === null || end === null || end <= start || start >= segmentEnd || end <= segmentStart) {
      continue;
    }

    if (range?.tone === "selection") {
      return "selection";
    }

    fallbackTone = "annotation";
  }

  return fallbackTone;
}

function buildPlainTextHighlightSegments(text = "", highlightRanges: MarkdownAnnotationHighlightRange[] = []) {
  if (!text) {
    return [{ highlighted: false, text }];
  }

  const splitOffsets = new Set([0, text.length]);

  highlightRanges.forEach((range) => {
    const start = Math.max(0, normalizeSourceOffset(range?.start) ?? 0);
    const end = Math.min(text.length, normalizeSourceOffset(range?.end) ?? text.length);

    if (end <= start) {
      return;
    }

    splitOffsets.add(start);
    splitOffsets.add(end);
  });

  const orderedOffsets = Array.from(splitOffsets).sort((left, right) => left - right);

  return orderedOffsets.slice(0, -1).map((offset, index) => {
    const nextOffset = orderedOffsets[index + 1];
    const segmentText = text.slice(offset, nextOffset);
    const highlighted = highlightRanges.some((range) => {
      const start = normalizeSourceOffset(range?.start);
      const end = normalizeSourceOffset(range?.end);

      if (start === null || end === null || end <= start) {
        return false;
      }

      return start < nextOffset && end > offset;
    });

    return {
      highlighted,
      tone: highlighted ? resolveHighlightTone(highlightRanges, offset, nextOffset) : undefined,
      text: segmentText,
    };
  });
}

const LazyMarkdownRenderer = lazy(() => import("@/components/command-center/markdown-renderer"));

function areTrackedFilesEqual(previousFiles: SessionFile[] = [], nextFiles: SessionFile[] = []) {
  if (previousFiles === nextFiles) {
    return true;
  }

  if (!Array.isArray(previousFiles) || !Array.isArray(nextFiles) || previousFiles.length !== nextFiles.length) {
    return false;
  }

  return previousFiles.every((file, index) => {
    const nextFile = nextFiles[index];
    return file?.path === nextFile?.path
      && file?.fullPath === nextFile?.fullPath
      && file?.name === nextFile?.name;
  });
}

type MarkdownRendererProps = ComponentProps<typeof LazyMarkdownRenderer>;

type MarkdownContentProps = {
  content?: string;
  files?: SessionFile[];
  fontSize?: MarkdownFontSize;
  headingScopeId?: string;
  highlightRanges?: MarkdownAnnotationHighlightRange[];
  resolvedTheme?: string;
  sourceTextMapping?: boolean;
  streaming?: boolean;
  className?: string;
  onOpenFilePreview?: MarkdownRendererProps["onOpenFilePreview"];
  onOpenImagePreview?: MarkdownRendererProps["onOpenImagePreview"];
};

export const MarkdownContent = memo(function MarkdownContent({
  content,
  files,
  fontSize = "medium",
  headingScopeId,
  highlightRanges,
  resolvedTheme = "light",
  sourceTextMapping = false,
  streaming = false,
  className,
  onOpenFilePreview,
  onOpenImagePreview,
}: MarkdownContentProps) {
  const text = String(content || "");
  const needsMarkdownRenderer = contentNeedsMarkdownRenderer(text);
  const shellClassName = getMarkdownShellClassName(fontSize);

  if (!needsMarkdownRenderer) {
    const segments = buildPlainTextHighlightSegments(text, highlightRanges || []);

    return (
      <div className={cn("max-w-full", shellClassName, className)}>
        <div
          className="min-w-0 max-w-full whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word]"
          data-source-end={sourceTextMapping ? String(text.length) : undefined}
          data-source-start={sourceTextMapping ? "0" : undefined}
          data-source-text={sourceTextMapping ? "true" : undefined}
        >
          {segments.map((segment, index) => (
            segment.highlighted ? (
              <mark
                key={`plain-highlight-${index}`}
                className={cn(
                  "box-decoration-clone rounded-[2px] py-px text-inherit",
                  segment.tone === "selection"
                    ? "bg-sky-200/88 shadow-[inset_0_0_0_1px_rgba(2,132,199,0.18)]"
                    : "bg-yellow-200/85 shadow-[inset_0_0_0_1px_rgba(120,53,15,0.12)]",
                )}
                data-markdown-annotation-highlight="true"
                data-markdown-annotation-highlight-tone={segment.tone || "annotation"}
              >
                {segment.text}
              </mark>
            ) : segment.text
          ))}
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className={cn("max-w-full", shellClassName, className)}>
          <div className="min-w-0 max-w-full whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word]">{text}</div>
        </div>
      }
    >
      <LazyMarkdownRenderer
        content={text}
        files={files}
        headingScopeId={headingScopeId}
        highlightRanges={highlightRanges}
        resolvedTheme={resolvedTheme}
        sourceTextMapping={sourceTextMapping}
        streaming={streaming}
        className={className}
        shellClassName={shellClassName}
        onOpenFilePreview={onOpenFilePreview}
        onOpenImagePreview={onOpenImagePreview}
      />
    </Suspense>
  );
}, (previousProps, nextProps) => {
  return previousProps.content === nextProps.content
    && previousProps.fontSize === nextProps.fontSize
    && previousProps.headingScopeId === nextProps.headingScopeId
    && previousProps.highlightRanges === nextProps.highlightRanges
    && previousProps.resolvedTheme === nextProps.resolvedTheme
    && previousProps.sourceTextMapping === nextProps.sourceTextMapping
    && previousProps.streaming === nextProps.streaming
    && previousProps.className === nextProps.className
    && previousProps.onOpenFilePreview === nextProps.onOpenFilePreview
    && previousProps.onOpenImagePreview === nextProps.onOpenImagePreview
    && areTrackedFilesEqual(previousProps.files || [], nextProps.files || []);
});
