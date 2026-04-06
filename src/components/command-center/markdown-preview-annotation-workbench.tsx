import { Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionFile } from "@/types/chat";
import { resolveMarkdownAnnotationMenuPosition as resolveMenuPosition } from "@/components/command-center/markdown-annotation-menu-position";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import {
  buildMarkdownAnnotationInstructionLine,
  buildMarkdownAnnotationInstructionLines,
  buildMarkdownAnnotationPrompt,
  createDeleteAnnotation,
  createReplaceAllAnnotation,
  createReplaceAnnotation,
  type MarkdownAnnotation,
  type MarkdownAnnotationHighlightRange,
  type MarkdownAnnotationRange,
} from "@/components/command-center/markdown-annotation-utils";

type MarkdownPreviewAnnotationWorkbenchLabels = {
  actionMenuLabel?: string;
  delete?: string;
  editorHint?: string;
  instructions?: string;
  promptTitle?: string;
  replacementPlaceholder?: string;
  removeAnnotation?: string | ((line: string) => string);
  replace?: string;
  replaceAll?: string;
  submit?: string;
};

type MarkdownPreviewAnnotationWorkbenchSubmitPayload = {
  annotationLines: string[];
  annotations: MarkdownAnnotation[];
  editorValue: string;
  prompt: string;
};

type MarkdownPreviewAnnotationWorkbenchState = {
  annotationCount: number;
  hasDraftAnnotations: boolean;
};

type MarkdownPreviewAnnotationWorkbenchProps = {
  content?: string;
  filePath?: string;
  files?: SessionFile[];
  fontSize?: "small" | "medium" | "large";
  headingScopeId?: string;
  labels?: MarkdownPreviewAnnotationWorkbenchLabels;
  lineNumberOffset?: number;
  onOpenFilePreview?: (item: SessionFile) => void;
  onStateChange?: (state: MarkdownPreviewAnnotationWorkbenchState) => void;
  onSubmit?: (payload: MarkdownPreviewAnnotationWorkbenchSubmitPayload) => void | Promise<void>;
  resolvedTheme?: string;
  submitPending?: boolean;
};

type PendingSelection = {
  selectedText: string;
  selectionRange: MarkdownAnnotationRange;
  sourceSelectedText: string;
};

type PendingSelectionMenuPosition = {
  left: number;
  top: number;
};

type SelectionPointerPosition = {
  clientX: number;
  clientY: number;
};

type RelativeSelectionRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

const SELECTION_SYNC_RETRY_DELAY_MS = 24;
const SELECTION_SYNC_RETRY_LIMIT = 3;

function annotationHasReplacement(annotation: MarkdownAnnotation | null | undefined): boolean {
  if (!annotation) {
    return false;
  }

  if (annotation.kind !== "replace" && annotation.kind !== "replaceAll") {
    return true;
  }

  return String(annotation.replacementText || "").trim().length > 0;
}

function annotationNeedsReplacement(annotation: MarkdownAnnotation | null | undefined): boolean {
  return annotation?.kind === "replace" || annotation?.kind === "replaceAll";
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

  return {
    selectedText,
    selectionRange,
    sourceSelectedText: content.slice(start, end),
  };
}

function isUsableDomRect(rect: Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height"> | null | undefined) {
  if (!rect) {
    return false;
  }

  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height].every((value) => Number.isFinite(value));
}

function toRelativeSelectionRect(
  rect: Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">,
  containerRect: Pick<DOMRect, "top" | "left">,
): RelativeSelectionRect {
  return {
    bottom: rect.bottom - containerRect.top,
    height: rect.height,
    left: rect.left - containerRect.left,
    right: rect.right - containerRect.left,
    top: rect.top - containerRect.top,
    width: rect.width,
  };
}

function resolvePointerDistanceToRect(rect: RelativeSelectionRect, pointerLeft: number, pointerTop: number) {
  const dx = pointerLeft < rect.left
    ? rect.left - pointerLeft
    : pointerLeft > rect.right
      ? pointerLeft - rect.right
      : 0;
  const dy = pointerTop < rect.top
    ? rect.top - pointerTop
    : pointerTop > rect.bottom
      ? pointerTop - rect.bottom
      : 0;

  return Math.hypot(dx, dy);
}

function resolveAnchorRectFromSelection(
  range: Range,
  selection: Selection,
  root: HTMLElement,
  scrollContainer: HTMLElement,
  pointerPosition: SelectionPointerPosition | null,
): RelativeSelectionRect | null {
  const containerRect = scrollContainer.getBoundingClientRect();
  const selectionRects = typeof range.getClientRects === "function"
    ? Array.from(range.getClientRects())
        .filter((rect) => isUsableDomRect(rect) && (rect.width > 0 || rect.height > 0))
        .map((rect) => toRelativeSelectionRect(rect, containerRect))
    : [];

  if (selectionRects.length > 0) {
    if (pointerPosition && Number.isFinite(pointerPosition.clientX) && Number.isFinite(pointerPosition.clientY)) {
      const pointerLeft = pointerPosition.clientX - containerRect.left;
      const pointerTop = pointerPosition.clientY - containerRect.top;
      const nearestRect = selectionRects.reduce((bestRect, currentRect) => {
        if (!bestRect) {
          return currentRect;
        }

        return resolvePointerDistanceToRect(currentRect, pointerLeft, pointerTop) < resolvePointerDistanceToRect(bestRect, pointerLeft, pointerTop)
          ? currentRect
          : bestRect;
      }, null as RelativeSelectionRect | null);

      if (nearestRect) {
        return nearestRect;
      }
    }

    return selectionRects.at(-1) || null;
  }

  const selectionFocusNode = selection.focusNode;
  const selectionFocusOffset = Number(selection.focusOffset);
  if (selectionFocusNode && root.contains(selectionFocusNode) && Number.isFinite(selectionFocusOffset)) {
    const collapsedRange = range.cloneRange();

    try {
      collapsedRange.setStart(selectionFocusNode, selectionFocusOffset);
      collapsedRange.collapse(true);
      const focusRect = Array.from(collapsedRange.getClientRects()).find((rect) => isUsableDomRect(rect) && (rect.width > 0 || rect.height > 0))
        || collapsedRange.getBoundingClientRect();
      if (isUsableDomRect(focusRect)) {
        return toRelativeSelectionRect(focusRect, containerRect);
      }
    } catch {
      // Ignore collapsed-range failures and fall through to the bounding rect fallback.
    }
  }

  const boundingRect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : root.getBoundingClientRect();
  if (!isUsableDomRect(boundingRect)) {
    return null;
  }

  return toRelativeSelectionRect(boundingRect, containerRect);
}

function resolvePendingSelectionMenuPosition(
  root: HTMLElement | null,
  scrollContainer: HTMLElement | null,
  pointerPosition: SelectionPointerPosition | null,
): PendingSelectionMenuPosition | null {
  if (!root || !scrollContainer) {
    return null;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }
  const rect = resolveAnchorRectFromSelection(range, selection, root, scrollContainer, pointerPosition);
  if (!rect) {
    return null;
  }

  return resolveMenuPosition({
    rect,
    scrollLeft: scrollContainer.scrollLeft,
    scrollTop: scrollContainer.scrollTop,
    viewport: {
      height: scrollContainer.clientHeight,
      width: scrollContainer.clientWidth,
    },
  });
}

function hasActivePreviewSelection(root: HTMLElement | null) {
  if (!root) {
    return false;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) && Boolean(selection.toString().trim());
}

function buildEmptyAnnotationInstructionLine(annotation: MarkdownAnnotation) {
  return buildMarkdownAnnotationInstructionLine({
    ...annotation,
    replacementText: "",
  }).trimEnd();
}

function buildHighlightRanges(
  annotations: MarkdownAnnotation[],
  pendingSelection: PendingSelection | null,
): MarkdownAnnotationHighlightRange[] {
  const annotationRanges = annotations.flatMap((annotation) =>
    (annotation.matchRanges || []).map((range) => ({
      ...range,
      tone: "annotation" as const,
    })),
  );

  if (!pendingSelection) {
    return annotationRanges;
  }

  return [
    ...annotationRanges,
    {
      ...pendingSelection.selectionRange,
      tone: "selection",
    },
  ];
}

function resolveRemoveAnnotationLabel(
  labels: MarkdownPreviewAnnotationWorkbenchLabels,
  annotation: MarkdownAnnotation,
) {
  const line = buildMarkdownAnnotationInstructionLine(annotation);

  if (typeof labels.removeAnnotation === "function") {
    return labels.removeAnnotation(line);
  }

  return String(labels.removeAnnotation || "");
}

type InlineReplacementEditorProps = {
  ariaLabel: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  value: string;
};

function InlineReplacementEditor({
  ariaLabel,
  onChange,
  placeholder,
  value,
}: InlineReplacementEditorProps) {
  const editorRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!editorRef.current || editorRef.current.textContent === value) {
      return;
    }

    editorRef.current.textContent = value;
  }, [value]);

  function handleInput(event: SyntheticEvent<HTMLSpanElement>) {
    onChange(event.currentTarget.textContent || "");
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  return (
    <span
      ref={editorRef}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={0}
      aria-label={ariaLabel}
      aria-placeholder={placeholder}
      data-placeholder={placeholder || ""}
      className={[
        "inline-block min-w-[5.5ch] max-w-full cursor-text whitespace-pre-wrap break-words align-baseline outline-none",
        "before:pointer-events-none",
        value
          ? ""
          : "before:content-[attr(data-placeholder)] before:text-muted-foreground/78",
      ].join(" ").trim()}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    />
  );
}

function isKeyboardActionEvent(event: ReactKeyboardEvent<HTMLButtonElement>) {
  return event.key === "Enter" || event.key === " ";
}

export function MarkdownPreviewAnnotationWorkbench({
  content = "",
  filePath = "",
  files = [],
  fontSize = "medium",
  headingScopeId,
  labels = {},
  lineNumberOffset = 0,
  onOpenFilePreview,
  onStateChange,
  onSubmit,
  resolvedTheme = "light",
  submitPending = false,
}: MarkdownPreviewAnnotationWorkbenchProps) {
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const pointerSelectionActiveRef = useRef(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const ignoreSelectionChangeRef = useRef(false);
  const selectionPointerPositionRef = useRef<SelectionPointerPosition | null>(null);
  const syncPendingSelectionRef = useRef<(attempt?: number) => void>(() => {});
  const selectionSyncTimeoutRef = useRef<number | null>(null);
  const suppressSelectionSyncRef = useRef(false);
  const [annotations, setAnnotations] = useState<MarkdownAnnotation[]>([]);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [pendingSelectionMenuPosition, setPendingSelectionMenuPosition] = useState<PendingSelectionMenuPosition | null>(null);

  useEffect(() => {
    setAnnotations([]);
    setPendingSelection(null);
    setPendingSelectionMenuPosition(null);
    clearDomSelection();
  }, [content, filePath]);

  useEffect(() => {
    onStateChange?.({
      annotationCount: annotations.length,
      hasDraftAnnotations: annotations.length > 0,
    });
  }, [annotations, onStateChange]);

  const annotationLines = useMemo(
    () => buildMarkdownAnnotationInstructionLines(annotations),
    [annotations],
  );
  const editorValue = useMemo(
    () => annotationLines.join("\n"),
    [annotationLines],
  );
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
  const shouldShowEditorHint = annotations.some((annotation) => annotationNeedsReplacement(annotation));

  const clearPendingSelection = useCallback(() => {
    setPendingSelection(null);
    setPendingSelectionMenuPosition(null);
  }, []);

  const clearDomSelectionSilently = useCallback(() => {
    ignoreSelectionChangeRef.current = true;
    clearDomSelection();
  }, []);

  const schedulePendingSelectionSync = useCallback((attempt = 0) => {
    if (selectionSyncTimeoutRef.current !== null) {
      window.clearTimeout(selectionSyncTimeoutRef.current);
    }

    selectionSyncTimeoutRef.current = window.setTimeout(() => {
      selectionSyncTimeoutRef.current = null;
      syncPendingSelectionRef.current(attempt);
    }, attempt > 0 ? SELECTION_SYNC_RETRY_DELAY_MS : 0);
  }, []);

  const syncPendingSelection = useCallback((attempt = 0) => {
    const nextPendingSelection = resolvePendingSelection(previewRef.current, content);

    if (!nextPendingSelection) {
      if (attempt < SELECTION_SYNC_RETRY_LIMIT && hasActivePreviewSelection(previewRef.current)) {
        schedulePendingSelectionSync(attempt + 1);
        return;
      }
      clearPendingSelection();
      return;
    }

    const nextPosition = resolvePendingSelectionMenuPosition(
      previewRef.current,
      previewScrollRef.current,
      selectionPointerPositionRef.current,
    );

    if (nextPosition) {
      setPendingSelection(nextPendingSelection);
      setPendingSelectionMenuPosition(nextPosition);
      clearDomSelectionSilently();
      return;
    }

    if (attempt < SELECTION_SYNC_RETRY_LIMIT) {
      schedulePendingSelectionSync(attempt + 1);
      return;
    }

    clearPendingSelection();
  }, [clearDomSelectionSilently, clearPendingSelection, content, schedulePendingSelectionSync]);

  useEffect(() => {
    syncPendingSelectionRef.current = syncPendingSelection;
  }, [syncPendingSelection]);

  function handlePreviewSelectionChange() {
    schedulePendingSelectionSync();
  }

  function createAnnotation(kind: "delete" | "replace" | "replaceAll") {
    if (!pendingSelection) {
      suppressSelectionSyncRef.current = false;
      return;
    }

    const annotation =
      kind === "delete"
        ? createDeleteAnnotation({
            content,
            selectedText: pendingSelection.selectedText,
            selectionRange: pendingSelection.selectionRange,
            sourceSelectedText: pendingSelection.sourceSelectedText,
          })
        : kind === "replaceAll"
        ? createReplaceAllAnnotation({
            content,
            replacementText: "",
            selectedText: pendingSelection.selectedText,
            selectionRange: pendingSelection.selectionRange,
            sourceSelectedText: pendingSelection.sourceSelectedText,
          })
        : createReplaceAnnotation({
            content,
            replacementText: "",
            selectedText: pendingSelection.selectedText,
            selectionRange: pendingSelection.selectionRange,
            sourceSelectedText: pendingSelection.sourceSelectedText,
          });

    if (!annotation) {
      suppressSelectionSyncRef.current = false;
      setPendingSelection(null);
      setPendingSelectionMenuPosition(null);
      clearDomSelection();
      return;
    }

    if (Number.isFinite(lineNumberOffset) && Number(lineNumberOffset) > 0 && Number.isFinite(annotation.lineNumber ?? NaN)) {
      annotation.lineNumber = Number(annotation.lineNumber) + Math.max(0, Math.floor(Number(lineNumberOffset)));
    }

    setAnnotations((currentAnnotations) => {
      return [...currentAnnotations, annotation];
    });
    suppressSelectionSyncRef.current = false;
    clearPendingSelection();
    clearDomSelection();
  }

  function handleRemoveAnnotation(annotationId: string) {
    setAnnotations((currentAnnotations) => currentAnnotations.filter((annotation) => annotation.id !== annotationId));
  }

  function handleReplacementTextChange(annotationId: string, nextValue: string) {
    setAnnotations((currentAnnotations) =>
      currentAnnotations.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              replacementText: nextValue,
            }
          : annotation,
      ),
    );
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

  useEffect(() => {
    function handleDocumentSelectionChange() {
      if (ignoreSelectionChangeRef.current) {
        ignoreSelectionChangeRef.current = false;
        return;
      }

      if (pointerSelectionActiveRef.current || suppressSelectionSyncRef.current) {
        return;
      }
      schedulePendingSelectionSync();
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        suppressSelectionSyncRef.current = false;
        ignoreSelectionChangeRef.current = false;
        clearPendingSelection();
        return;
      }

      if (previewRef.current?.contains(target)) {
        return;
      }

      if (actionMenuRef.current?.contains(target)) {
        return;
      }

      suppressSelectionSyncRef.current = false;
      ignoreSelectionChangeRef.current = false;
      clearPendingSelection();
      clearDomSelection();
    }

    function handleDocumentPointerUp(event: PointerEvent) {
      const shouldSyncSelection = pointerSelectionActiveRef.current;
      if (shouldSyncSelection) {
        selectionPointerPositionRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }
      pointerSelectionActiveRef.current = false;

      if (!shouldSyncSelection) {
        return;
      }

      schedulePendingSelectionSync();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearPendingSelection();
        clearDomSelection();
      }
    }

    document.addEventListener("selectionchange", handleDocumentSelectionChange);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("pointerup", handleDocumentPointerUp);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("pointerup", handleDocumentPointerUp);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      if (selectionSyncTimeoutRef.current !== null) {
        window.clearTimeout(selectionSyncTimeoutRef.current);
        selectionSyncTimeoutRef.current = null;
      }
    };
  }, [clearPendingSelection, schedulePendingSelectionSync]);

  return (
    <form
      className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.95fr)]"
      data-testid="markdown-preview-annotation-workbench"
      onSubmit={handleSubmit}
    >
      <div className="relative min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
        <div ref={previewScrollRef} className="relative min-h-[16rem] max-h-full overflow-auto px-5 py-4 sm:px-6 sm:py-5">
          {pendingSelection && pendingSelectionMenuPosition ? (
            <div
              ref={actionMenuRef}
              role="menu"
              aria-label={labels.actionMenuLabel}
              className="absolute z-50 min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
              data-testid="markdown-preview-annotation-actions"
              style={{
                left: `${pendingSelectionMenuPosition.left}px`,
                top: `${pendingSelectionMenuPosition.top}px`,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                onMouseDown={(event) => {
                  suppressSelectionSyncRef.current = true;
                  event.preventDefault();
                  createAnnotation("replace");
                }}
                onKeyDown={(event) => {
                  if (!isKeyboardActionEvent(event)) {
                    return;
                  }
                  event.preventDefault();
                  createAnnotation("replace");
                }}
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
                {labels.replace}
              </button>
              <button
                type="button"
                role="menuitem"
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                onMouseDown={(event) => {
                  suppressSelectionSyncRef.current = true;
                  event.preventDefault();
                  createAnnotation("replaceAll");
                }}
                onKeyDown={(event) => {
                  if (!isKeyboardActionEvent(event)) {
                    return;
                  }
                  event.preventDefault();
                  createAnnotation("replaceAll");
                }}
              >
                <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                {labels.replaceAll}
              </button>
              <button
                type="button"
                role="menuitem"
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                onMouseDown={(event) => {
                  suppressSelectionSyncRef.current = true;
                  event.preventDefault();
                  createAnnotation("delete");
                }}
                onKeyDown={(event) => {
                  if (!isKeyboardActionEvent(event)) {
                    return;
                  }
                  event.preventDefault();
                  createAnnotation("delete");
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                {labels.delete}
              </button>
            </div>
          ) : null}
          <div
            ref={previewRef}
            className="min-w-0 max-w-full overflow-x-auto"
            data-testid="markdown-preview-annotation-preview"
            onMouseDown={() => {
              pointerSelectionActiveRef.current = true;
              selectionPointerPositionRef.current = null;
              clearPendingSelection();
            }}
            onKeyUp={handlePreviewSelectionChange}
            onMouseUp={(event: ReactMouseEvent<HTMLDivElement>) => {
              selectionPointerPositionRef.current = {
                clientX: event.clientX,
                clientY: event.clientY,
              };
              pointerSelectionActiveRef.current = false;
              handlePreviewSelectionChange();
            }}
          >
            <MarkdownContent
              content={content}
              files={files}
              fontSize={fontSize}
              headingScopeId={headingScopeId}
              highlightRanges={highlightRanges}
              onOpenFilePreview={onOpenFilePreview}
              resolvedTheme={resolvedTheme}
              sourceTextMapping
              className="min-w-0 max-w-full"
            />
          </div>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-col gap-4 rounded-2xl border border-border/70 bg-[var(--surface)]/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] sm:p-5"
        data-testid="markdown-preview-annotation-sidebar"
      >
        {labels.empty ? (
          <div className="px-1 text-sm leading-6 text-muted-foreground">
            {labels.empty}
          </div>
        ) : null}
        {annotations.length ? (
          <div className="space-y-2.5" data-testid="markdown-preview-annotation-list">
            {annotations.map((annotation) => {
              const line = buildMarkdownAnnotationInstructionLine(annotation);
              const needsReplacement = annotationNeedsReplacement(annotation);
              const inputPrefix = buildEmptyAnnotationInstructionLine(annotation);

              return (
                <div
                  key={annotation.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/78 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {needsReplacement ? (
                      <div className="min-w-0 text-sm leading-6 text-foreground">
                        <span
                          className="whitespace-normal break-words text-foreground"
                          title={inputPrefix}
                        >
                          {inputPrefix}
                        </span>
                        {" "}
                        <InlineReplacementEditor
                          ariaLabel={`${labels.instructions || ""}: ${inputPrefix}`.trim()}
                          placeholder={labels.replacementPlaceholder}
                          value={annotation.replacementText}
                          onChange={(nextValue) =>
                            handleReplacementTextChange(annotation.id, nextValue)}
                        />
                      </div>
                    ) : (
                      <div className="text-sm leading-6 text-foreground">{line}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background/72 text-xs text-muted-foreground transition hover:border-[var(--border-strong)] hover:bg-accent/28 hover:text-foreground"
                    aria-label={resolveRemoveAnnotationLabel(labels, annotation)}
                    onClick={() => handleRemoveAnnotation(annotation.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          {annotations.length && shouldShowEditorHint && labels.editorHint ? (
            <div className="px-1 text-sm leading-6 text-muted-foreground">
              {labels.editorHint}
            </div>
          ) : null}
          <div
            className="mt-auto rounded-xl border border-border/80 bg-background/62 p-3"
            data-testid="markdown-preview-annotation-prompt-panel"
          >
            {labels.promptTitle ? (
              <div className="px-1 pb-2 text-xs font-semibold tracking-[0.01em] text-foreground/78">
                {labels.promptTitle}
              </div>
            ) : null}
            <pre
              className="min-h-[6.5rem] max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/35 px-4 py-3 text-xs leading-6 text-muted-foreground"
              data-testid="markdown-preview-annotation-prompt"
            >
              {prompt}
            </pre>
          </div>
        </div>
        <button
          className="mt-auto inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit}
          type="submit"
        >
          {labels.submit}
        </button>
      </div>
    </form>
  );
}
