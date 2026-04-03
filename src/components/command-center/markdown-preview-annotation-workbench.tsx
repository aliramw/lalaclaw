import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { SessionFile } from "@/types/chat";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import {
  buildMarkdownAnnotationInstructionLine,
  buildMarkdownAnnotationInstructionLines,
  buildMarkdownAnnotationPrompt,
  createReplaceAllAnnotation,
  createReplaceAnnotation,
  type MarkdownAnnotation,
  type MarkdownAnnotationRange,
} from "@/components/command-center/markdown-annotation-utils";

type MarkdownPreviewAnnotationWorkbenchLabels = {
  empty?: string;
  instructions?: string;
  replace?: string;
  replaceAll?: string;
  submit?: string;
  title?: string;
};

type MarkdownPreviewAnnotationWorkbenchSubmitPayload = {
  annotationLines: string[];
  annotations: MarkdownAnnotation[];
  editorValue: string;
  prompt: string;
};

type MarkdownPreviewAnnotationWorkbenchProps = {
  content?: string;
  filePath?: string;
  files?: SessionFile[];
  headingScopeId?: string;
  labels?: MarkdownPreviewAnnotationWorkbenchLabels;
  onSubmit?: (payload: MarkdownPreviewAnnotationWorkbenchSubmitPayload) => void | Promise<void>;
  resolvedTheme?: string;
  submitPending?: boolean;
};

type PendingSelection = {
  selectedText: string;
  selectionRange: MarkdownAnnotationRange;
};

function normalizeAnnotationLines(value = ""): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function annotationHasReplacement(annotation: MarkdownAnnotation | null | undefined): boolean {
  if (!annotation) {
    return false;
  }

  if (annotation.kind !== "replace" && annotation.kind !== "replaceAll") {
    return true;
  }

  return String(annotation.replacementText || "").trim().length > 0;
}

function clearDomSelection() {
  window.getSelection?.()?.removeAllRanges();
}

function normalizeSourceOffset(value: string | null | undefined): number | null {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue)) {
    return null;
  }

  return Math.max(0, Math.floor(nextValue));
}

function resolveSourceAnchor(node: Node | null, root: HTMLElement) {
  let currentNode: Node | null = node;

  while (currentNode && currentNode !== root) {
    if (
      currentNode instanceof HTMLElement
      && currentNode.dataset.sourceText === "true"
      && currentNode.dataset.sourceStart
      && currentNode.dataset.sourceEnd
    ) {
      return currentNode;
    }

    currentNode = currentNode.parentNode;
  }

  return null;
}

function resolveSourceOffsetWithinAnchor(anchor: HTMLElement, targetNode: Node, targetOffset: number) {
  const sourceStart = normalizeSourceOffset(anchor.dataset.sourceStart);

  if (sourceStart === null) {
    return null;
  }

  const range = anchor.ownerDocument.createRange();
  range.setStart(anchor, 0);
  range.setEnd(targetNode, targetOffset);

  return sourceStart + range.toString().length;
}

function resolveSelectionBoundaryOffset(root: HTMLElement, targetNode: Node, targetOffset: number) {
  const anchor = resolveSourceAnchor(targetNode, root);

  if (!anchor) {
    return null;
  }

  return resolveSourceOffsetWithinAnchor(anchor, targetNode, targetOffset);
}

function resolvePendingSelection(root: HTMLElement | null, content: string): PendingSelection | null {
  if (!root || !content) {
    return null;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString();

  if (!selectedText.trim() || !root.contains(range.commonAncestorContainer)) {
    return null;
  }

  const start = resolveSelectionBoundaryOffset(root, range.startContainer, range.startOffset);
  const end = resolveSelectionBoundaryOffset(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) {
    return null;
  }
  const selectionRange = { start, end };
  const selectedSourceText = content.slice(start, end);

  if (selectedSourceText !== selectedText) {
    return null;
  }

  return {
    selectedText,
    selectionRange,
  };
}

function buildEmptyAnnotationInstructionLine(annotation: MarkdownAnnotation) {
  return buildMarkdownAnnotationInstructionLine({
    ...annotation,
    replacementText: "",
  });
}

function resolveReplacementTextFromLine(line: string, annotation: MarkdownAnnotation) {
  const emptyLine = buildEmptyAnnotationInstructionLine(annotation);

  if (emptyLine && line.startsWith(emptyLine)) {
    return line.slice(emptyLine.length).trim();
  }

  const arrowIndex = line.indexOf("→");
  if (arrowIndex >= 0) {
    return line.slice(arrowIndex + 1).trim();
  }

  return line.trim();
}

function syncAnnotationsFromEditor(
  annotations: MarkdownAnnotation[],
  nextEditorValue: string,
) {
  const lines = nextEditorValue.split(/\r?\n/);

  return annotations.map((annotation, index) => ({
    ...annotation,
    replacementText: resolveReplacementTextFromLine(lines[index] || "", annotation),
  }));
}

function buildHighlightRanges(
  annotations: MarkdownAnnotation[],
  pendingSelection: PendingSelection | null,
) {
  const annotationRanges = annotations.flatMap((annotation) => annotation.matchRanges || []);

  if (!pendingSelection) {
    return annotationRanges;
  }

  return [...annotationRanges, pendingSelection.selectionRange];
}

export function MarkdownPreviewAnnotationWorkbench({
  content = "",
  filePath = "",
  files = [],
  headingScopeId,
  labels = {},
  onSubmit,
  resolvedTheme = "light",
  submitPending = false,
}: MarkdownPreviewAnnotationWorkbenchProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [annotations, setAnnotations] = useState<MarkdownAnnotation[]>([]);
  const [editorValue, setEditorValue] = useState("");
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);

  useEffect(() => {
    setAnnotations([]);
    setEditorValue("");
    setPendingSelection(null);
    clearDomSelection();
  }, [content, filePath]);

  const annotationLines = useMemo(() => normalizeAnnotationLines(editorValue), [editorValue]);
  const prompt = useMemo(
    () =>
      buildMarkdownAnnotationPrompt({
        annotationLines,
        filePath,
      }),
    [annotationLines, filePath],
  );
  const highlightRanges = useMemo(
    () => buildHighlightRanges(annotations, pendingSelection),
    [annotations, pendingSelection],
  );
  const canSubmit =
    annotations.length > 0 &&
    annotations.every((annotation) => annotationHasReplacement(annotation)) &&
    prompt.length > 0 &&
    !submitPending;

  function syncEditorFromAnnotations(nextAnnotations: MarkdownAnnotation[]) {
    setEditorValue(buildMarkdownAnnotationInstructionLines(nextAnnotations).join("\n"));
  }

  function handlePreviewSelectionChange() {
    setPendingSelection(resolvePendingSelection(previewRef.current, content));
  }

  function createAnnotation(kind: "replace" | "replaceAll") {
    if (!pendingSelection) {
      return;
    }

    const annotation =
      kind === "replaceAll"
        ? createReplaceAllAnnotation({
            content,
            replacementText: "",
            selectedText: pendingSelection.selectedText,
            selectionRange: pendingSelection.selectionRange,
          })
        : createReplaceAnnotation({
            content,
            replacementText: "",
            selectedText: pendingSelection.selectedText,
            selectionRange: pendingSelection.selectionRange,
          });

    if (!annotation) {
      setPendingSelection(null);
      clearDomSelection();
      return;
    }

    setAnnotations((currentAnnotations) => {
      const nextAnnotations = [...currentAnnotations, annotation];
      syncEditorFromAnnotations(nextAnnotations);
      return nextAnnotations;
    });
    setPendingSelection(null);
    clearDomSelection();
  }

  function handleEditorChange(nextValue: string) {
    setEditorValue(nextValue);
    setAnnotations((currentAnnotations) => syncAnnotationsFromEditor(currentAnnotations, nextValue));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    await onSubmit?.({
      annotationLines,
      annotations,
      editorValue,
      prompt,
    });
  }

  return (
    <form className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]" onSubmit={handleSubmit}>
      <div className="relative min-h-0 overflow-hidden rounded-xl border border-border/70 bg-background">
        {labels.title ? (
          <div className="border-b border-border/70 px-4 py-3 text-sm font-semibold text-foreground">{labels.title}</div>
        ) : null}
        <div className="relative min-h-[16rem] max-h-full overflow-auto px-4 py-3">
          {pendingSelection ? (
            <div
              className="absolute right-3 top-3 z-10 inline-flex gap-2 rounded-lg border border-border/80 bg-background/95 p-2 shadow-sm"
              data-testid="markdown-preview-annotation-actions"
            >
              <button type="button" className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => createAnnotation("replace")}>
                {labels.replace}
              </button>
              <button type="button" className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => createAnnotation("replaceAll")}>
                {labels.replaceAll}
              </button>
            </div>
          ) : null}
          <div
            ref={previewRef}
            className="min-w-0 max-w-full overflow-x-auto"
            data-testid="markdown-preview-annotation-preview"
            onKeyUp={handlePreviewSelectionChange}
            onMouseUp={handlePreviewSelectionChange}
          >
            <MarkdownContent
              content={content}
              files={files}
              headingScopeId={headingScopeId}
              highlightRanges={highlightRanges}
              resolvedTheme={resolvedTheme}
              sourceTextMapping
              className="min-w-0 max-w-full"
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {!annotations.length && labels.empty ? (
          <p className="rounded-md border border-dashed border-border/80 px-3 py-2 text-sm text-muted-foreground">
            {labels.empty}
          </p>
        ) : null}
        <textarea
          aria-label={labels.instructions}
          className="min-h-40 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={editorValue}
          onChange={(event) => handleEditorChange(event.target.value)}
        />
        <button
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit}
          type="submit"
        >
          {labels.submit}
        </button>
        <pre
          className="min-h-16 whitespace-pre-wrap rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="markdown-preview-annotation-prompt"
        >
          {prompt}
        </pre>
      </div>
    </form>
  );
}
