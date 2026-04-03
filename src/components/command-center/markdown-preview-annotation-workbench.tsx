import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildMarkdownAnnotationInstructionLines,
  buildMarkdownAnnotationPrompt,
  type MarkdownAnnotation,
} from "@/components/command-center/markdown-annotation-utils";

type MarkdownPreviewAnnotationWorkbenchLabels = {
  empty?: string;
  instructions?: string;
  submit?: string;
  title?: string;
};

type MarkdownPreviewAnnotationWorkbenchSubmitPayload = {
  annotationLines: string[];
  editorValue: string;
  prompt: string;
};

type MarkdownPreviewAnnotationWorkbenchProps = {
  annotations?: Array<MarkdownAnnotation | null | undefined>;
  filePath?: string;
  labels?: MarkdownPreviewAnnotationWorkbenchLabels;
  onSubmit?: (payload: MarkdownPreviewAnnotationWorkbenchSubmitPayload) => void | Promise<void>;
  submitPending?: boolean;
};

function annotationNeedsReplacement(annotation: MarkdownAnnotation | null | undefined): boolean {
  if (!annotation) {
    return false;
  }

  return annotation.kind === "replace" || annotation.kind === "replaceAll";
}

function annotationHasReplacement(annotation: MarkdownAnnotation | null | undefined): boolean {
  if (!annotationNeedsReplacement(annotation)) {
    return true;
  }

  return String(annotation?.replacementText ?? "").trim().length > 0;
}

function normalizeAnnotationLines(value = ""): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function MarkdownPreviewAnnotationWorkbench({
  annotations = [],
  filePath = "",
  labels = {},
  onSubmit,
  submitPending = false,
}: MarkdownPreviewAnnotationWorkbenchProps) {
  const defaultEditorValue = useMemo(
    () => buildMarkdownAnnotationInstructionLines(annotations).join("\n"),
    [annotations],
  );
  const [editorValue, setEditorValue] = useState(defaultEditorValue);

  useEffect(() => {
    setEditorValue(defaultEditorValue);
  }, [defaultEditorValue]);

  const annotationLines = useMemo(() => normalizeAnnotationLines(editorValue), [editorValue]);
  const prompt = useMemo(
    () =>
      buildMarkdownAnnotationPrompt({
        annotationLines,
        filePath,
      }),
    [annotationLines, filePath],
  );
  const canSubmit =
    annotations.length > 0 &&
    annotations.every((annotation) => annotationHasReplacement(annotation)) &&
    prompt.length > 0 &&
    !submitPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    await onSubmit?.({
      annotationLines,
      editorValue,
      prompt,
    });
  }

  return (
    <form className="flex h-full flex-col gap-3" onSubmit={handleSubmit}>
      {labels.title ? <h2 className="text-sm font-semibold text-foreground">{labels.title}</h2> : null}
      {!annotations.length && labels.empty ? (
        <p className="rounded-md border border-dashed border-border/80 px-3 py-2 text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : null}
      <textarea
        aria-label={labels.instructions}
        className="min-h-40 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        value={editorValue}
        onChange={(event) => setEditorValue(event.target.value)}
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
    </form>
  );
}
