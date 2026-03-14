import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

const markdownShellClassName =
  "text-[13px] leading-6 [&_a]:no-underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-l-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_li]:leading-6 [&_ol]:my-2 [&_ol]:list-decimal " +
  "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0 [&_blockquote:last-child]:mb-0 [&_pre:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse " +
  "[&_thead]:bg-muted/40 [&_th]:border [&_th]:border-border " +
  "[&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-border " +
  "[&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_hr]:my-3 [&_hr]:border-border";

const LazyMarkdownRenderer = lazy(() => import("@/components/command-center/markdown-renderer"));

export function MarkdownContent({ content, files, headingScopeId, className }) {
  const text = String(content || "");

  return (
    <Suspense
      fallback={
        <div className={cn(markdownShellClassName, className)}>
          <div className="whitespace-pre-wrap break-words">{text}</div>
        </div>
      }
    >
      <LazyMarkdownRenderer content={text} files={files} headingScopeId={headingScopeId} className={className} shellClassName={markdownShellClassName} />
    </Suspense>
  );
}
