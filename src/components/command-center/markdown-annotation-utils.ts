export type MarkdownAnnotationKind = "replace" | "replaceAll" | "delete" | "deleteAll";

export type MarkdownAnnotationRange = {
  end: number;
  start: number;
};

export type MarkdownAnnotation = {
  anchorRange: MarkdownAnnotationRange;
  id: string;
  kind: MarkdownAnnotationKind;
  lineNumber: number | null;
  matchRanges: MarkdownAnnotationRange[];
  replacementText: string;
  selectedText: string;
};

type MarkdownAnnotationSource = {
  content?: unknown;
  filePath?: unknown;
  replacementText?: unknown;
  selectionRange?: unknown;
  selectedText?: unknown;
};

type MarkdownAnnotationBuildPromptOptions = {
  annotationLines?: unknown[];
  annotations?: MarkdownAnnotation[];
  filePath?: unknown;
  instructionLines?: unknown[];
};

const markdownAnnotationKindLabels: Record<MarkdownAnnotationKind, string> = {
  delete: "删除",
  deleteAll: "批量删除",
  replace: "替换",
  replaceAll: "批量替换",
};

const markdownAnnotationKindAliases = new Map<string, MarkdownAnnotationKind>([
  ["delete", "delete"],
  ["deleteall", "deleteAll"],
  ["replace", "replace"],
  ["replaceall", "replaceAll"],
]);

function normalizeMarkdownAnnotationText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toMarkdownAnnotationText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function isBlankLine(value: unknown): boolean {
  return normalizeMarkdownAnnotationText(value).length === 0;
}

function createMarkdownAnnotationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `markdown-annotation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMarkdownAnnotationRange(range: unknown): MarkdownAnnotationRange {
  const start = typeof range === "object" && range !== null && Number.isFinite(Number((range as MarkdownAnnotationRange).start))
    ? Math.max(0, Math.floor(Number((range as MarkdownAnnotationRange).start)))
    : 0;
  const end = typeof range === "object" && range !== null && Number.isFinite(Number((range as MarkdownAnnotationRange).end))
    ? Math.max(start, Math.floor(Number((range as MarkdownAnnotationRange).end)))
    : start;

  return { start, end };
}

function normalizeMarkdownAnnotationKindValue(kind: unknown): MarkdownAnnotationKind | null {
  const normalizedKind = normalizeMarkdownAnnotationText(kind).toLowerCase();

  if (!normalizedKind) {
    return null;
  }

  return markdownAnnotationKindAliases.get(normalizedKind) ?? null;
}

function resolveMarkdownAnnotationSelectionStart(selectionRange: unknown): number {
  if (typeof selectionRange === "number" && Number.isFinite(selectionRange)) {
    return Math.max(0, Math.floor(selectionRange));
  }

  if (typeof selectionRange === "object" && selectionRange !== null) {
    return normalizeMarkdownAnnotationRange(selectionRange).start;
  }

  return 0;
}

export function normalizeMarkdownAnnotationKind(kind: unknown): MarkdownAnnotationKind | null {
  return normalizeMarkdownAnnotationKindValue(kind);
}

export function resolveMarkdownAnnotationLabel(kind: unknown): string {
  const normalizedKind = normalizeMarkdownAnnotationKindValue(kind);

  if (!normalizedKind) {
    return "";
  }

  return markdownAnnotationKindLabels[normalizedKind];
}

export function collectMarkdownAnnotationMatchRanges(content: unknown, selectedText: unknown): MarkdownAnnotationRange[] {
  const sourceText = toMarkdownAnnotationText(content);
  const needle = toMarkdownAnnotationText(selectedText);

  if (!sourceText || !needle) {
    return [];
  }

  const matchRanges: MarkdownAnnotationRange[] = [];
  let searchIndex = 0;

  while (searchIndex <= sourceText.length - needle.length) {
    const matchIndex = sourceText.indexOf(needle, searchIndex);

    if (matchIndex === -1) {
      break;
    }

    matchRanges.push({ start: matchIndex, end: matchIndex + needle.length });
    searchIndex = matchIndex + needle.length;
  }

  return matchRanges;
}

export function resolveMarkdownAnnotationLineNumber(content: unknown, selectionRangeOrOffset: unknown): number | null {
  const sourceText = toMarkdownAnnotationText(content);

  if (!sourceText) {
    return null;
  }

  const offset = Math.min(sourceText.length, resolveMarkdownAnnotationSelectionStart(selectionRangeOrOffset));
  let lineNumber = 1;

  for (let index = 0; index < offset; index += 1) {
    if (sourceText[index] === "\n") {
      lineNumber += 1;
    }
  }

  return lineNumber;
}

function createMarkdownAnnotation({
  content,
  kind,
  replacementText,
  selectionRange,
  selectedText,
}: {
  content?: unknown;
  kind: MarkdownAnnotationKind;
  replacementText?: unknown;
  selectionRange?: unknown;
  selectedText?: unknown;
}): MarkdownAnnotation {
  const normalizedSelectedText = toMarkdownAnnotationText(selectedText);
  const anchorRange = normalizeMarkdownAnnotationRange(selectionRange);
  const lineNumber = resolveMarkdownAnnotationLineNumber(content, anchorRange);
  const replacement = toMarkdownAnnotationText(replacementText);
  const matchRanges =
    kind === "replaceAll" || kind === "deleteAll"
      ? collectMarkdownAnnotationMatchRanges(content, normalizedSelectedText)
      : [anchorRange];

  return {
    anchorRange,
    id: createMarkdownAnnotationId(),
    kind,
    lineNumber,
    matchRanges,
    replacementText: replacement,
    selectedText: normalizedSelectedText,
  };
}

export function createReplaceAnnotation({
  content,
  replacementText,
  selectionRange,
  selectedText,
}: MarkdownAnnotationSource): MarkdownAnnotation {
  return createMarkdownAnnotation({
    content,
    kind: "replace",
    replacementText,
    selectionRange,
    selectedText,
  });
}

export function createReplaceAllAnnotation({
  content,
  replacementText,
  selectionRange,
  selectedText,
}: MarkdownAnnotationSource): MarkdownAnnotation {
  return createMarkdownAnnotation({
    content,
    kind: "replaceAll",
    replacementText,
    selectionRange,
    selectedText,
  });
}

export function buildDefaultAnnotationLine(annotation: MarkdownAnnotation | null | undefined): string {
  if (!annotation) {
    return "";
  }

  const normalizedKind = normalizeMarkdownAnnotationKindValue(annotation.kind);
  const selectedText = toMarkdownAnnotationText(annotation.selectedText);
  const replacementText = toMarkdownAnnotationText(annotation.replacementText);

  if (!normalizedKind || isBlankLine(selectedText)) {
    return "";
  }

  if (normalizedKind === "replaceAll" || normalizedKind === "deleteAll") {
    return `所有 ${selectedText} → ${replacementText}`;
  }

  const lineNumber = Number.isFinite(annotation.lineNumber ?? NaN) ? Math.max(1, Math.floor(Number(annotation.lineNumber))) : 0;
  return `第 ${lineNumber} 行：${selectedText} → ${replacementText}`;
}

export function buildDefaultAnnotationLines(annotations: Array<MarkdownAnnotation | null | undefined> = []): string[] {
  return annotations.map((annotation) => buildDefaultAnnotationLine(annotation)).filter((line) => !isBlankLine(line));
}

export function buildAnnotationPrompt({
  annotationLines,
  annotations = [],
  filePath,
  instructionLines,
}: MarkdownAnnotationBuildPromptOptions = {}): string {
  const resolvedLines = Array.isArray(annotationLines)
    ? annotationLines
    : Array.isArray(instructionLines)
      ? instructionLines
      : buildDefaultAnnotationLines(annotations);
  const normalizedFilePath = normalizeMarkdownAnnotationText(filePath);
  const normalizedLines = resolvedLines.map((line) => normalizeMarkdownAnnotationText(line)).filter((line) => !isBlankLine(line));

  if (!normalizedFilePath) {
    return normalizedLines.join("\n");
  }

  if (!normalizedLines.length) {
    return `修改 ${normalizedFilePath} 文件：`;
  }

  return `修改 ${normalizedFilePath} 文件：\n${normalizedLines.join("\n")}`;
}

export function buildMarkdownAnnotationInstructionLine(annotation: MarkdownAnnotation | null | undefined): string {
  return buildDefaultAnnotationLine(annotation);
}

export function buildMarkdownAnnotationInstructionLines(annotations: Array<MarkdownAnnotation | null | undefined> = []): string[] {
  return buildDefaultAnnotationLines(annotations);
}

export function buildMarkdownAnnotationEditPrompt(options: MarkdownAnnotationBuildPromptOptions = {}): string {
  return buildAnnotationPrompt(options);
}

export function buildMarkdownAnnotationPrompt(options: MarkdownAnnotationBuildPromptOptions = {}): string {
  return buildAnnotationPrompt(options);
}
