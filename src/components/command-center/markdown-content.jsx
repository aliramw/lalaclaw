import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

const markdownShellClassName =
  "text-[12px] leading-5 [&_a]:no-underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-l-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_h1]:mt-[1.95em] [&_h1]:mb-[0.75em] [&_h1]:text-[1.9em] [&_h1]:font-bold [&_h1]:leading-[1.1] [&_h1:first-child]:mt-0 " +
  "[&_h2]:mt-[1.75em] [&_h2]:mb-[0.65em] [&_h2]:text-[1.5em] [&_h2]:font-semibold [&_h2]:leading-[1.14] [&_h2:first-child]:mt-0 " +
  "[&_h3]:mt-[1.5em] [&_h3]:mb-[0.55em] [&_h3]:text-[1.24em] [&_h3]:font-semibold [&_h3]:leading-[1.2] [&_h3:first-child]:mt-0 " +
  "[&_h4]:mt-[1.35em] [&_h4]:mb-[0.45em] [&_h4]:text-[1.08em] [&_h4]:font-semibold [&_h4]:leading-[1.24] [&_h4:first-child]:mt-0 " +
  "[&_h5]:mt-[1.3em] [&_h5]:mb-[0.45em] [&_h5]:text-[1em] [&_h5]:font-semibold [&_h5]:leading-[1.32] [&_h5:first-child]:mt-0 " +
  "[&_h6]:mt-[1.2em] [&_h6]:mb-[0.4em] [&_h6]:text-[0.9em] [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:tracking-[0.08em] [&_h6]:text-muted-foreground [&_h6]:leading-[1.35] [&_h6:first-child]:mt-0 " +
  "[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_blockquote:last-child]:mb-0 [&_pre:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse " +
  "[&_thead]:bg-muted/40 [&_th]:border [&_th]:border-border " +
  "[&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-border " +
  "[&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_hr]:my-2.5 [&_hr]:border-border";

const LazyMarkdownRenderer = lazy(() => import("@/components/command-center/markdown-renderer"));

export function MarkdownContent({
  content,
  files,
  headingScopeId,
  resolvedTheme = "light",
  className,
  onOpenFilePreview,
  onOpenImagePreview,
}) {
  const text = String(content || "");

  return (
    <Suspense
      fallback={
        <div className={cn(markdownShellClassName, className)}>
          <div className="whitespace-pre-wrap break-words">{text}</div>
        </div>
      }
    >
      <LazyMarkdownRenderer
        content={text}
        files={files}
        headingScopeId={headingScopeId}
        resolvedTheme={resolvedTheme}
        className={className}
        shellClassName={markdownShellClassName}
        onOpenFilePreview={onOpenFilePreview}
        onOpenImagePreview={onOpenImagePreview}
      />
    </Suspense>
  );
}
