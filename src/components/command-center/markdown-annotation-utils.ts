export type MarkdownAnnotationKind = "replace" | "replaceAll" | "delete" | "deleteAll";

export type MarkdownAnnotationRange = {
  end: number;
  start: number;
};

export type MarkdownAnnotationHighlightRange = MarkdownAnnotationRange & {
  tone?: "annotation" | "selection";
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
  sourceSelectedText?: unknown;
};

type MarkdownAnnotationBuildPromptOptions = {
  annotationLines?: unknown[];
  filePath?: unknown;
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

function resolveMarkdownAnnotationRange(content: unknown, selectionRange: unknown): MarkdownAnnotationRange | null {
  const sourceText = toMarkdownAnnotationText(content);
  const range = normalizeMarkdownAnnotationRange(selectionRange);

  if (!sourceText || range.end <= range.start || range.start < 0 || range.end > sourceText.length) {
    return null;
  }

  return range;
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

  const offset = resolveMarkdownAnnotationSelectionStart(selectionRangeOrOffset);
  if (offset < 0 || offset > sourceText.length) {
    return null;
  }

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
  sourceSelectedText,
}: {
  content?: unknown;
  kind: MarkdownAnnotationKind;
  replacementText?: unknown;
  selectionRange?: unknown;
  selectedText?: unknown;
  sourceSelectedText?: unknown;
}): MarkdownAnnotation | null {
  const sourceText = toMarkdownAnnotationText(content);
  const normalizedSelectedText = toMarkdownAnnotationText(selectedText);
  const normalizedSourceSelectedText = toMarkdownAnnotationText(sourceSelectedText);
  const anchorRange = resolveMarkdownAnnotationRange(sourceText, selectionRange);

  if (!sourceText || !normalizedSelectedText || !anchorRange) {
    return null;
  }

  const anchoredSourceSlice = sourceText.slice(anchorRange.start, anchorRange.end);
  const selectionSourceText = normalizedSourceSelectedText || normalizedSelectedText;

  if (anchoredSourceSlice !== selectionSourceText) {
    return null;
  }

  const lineNumber = resolveMarkdownAnnotationLineNumber(sourceText, anchorRange);

  if ((kind === "replace" || kind === "delete") && (!lineNumber || lineNumber < 1)) {
    return null;
  }

  const replacement = toMarkdownAnnotationText(replacementText);
  const matchRanges =
    kind === "replaceAll" || kind === "deleteAll"
      ? collectMarkdownAnnotationMatchRanges(sourceText, selectionSourceText)
      : [anchorRange];

  if ((kind === "replaceAll" || kind === "deleteAll") && matchRanges.length === 0) {
    return null;
  }

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
  sourceSelectedText,
}: MarkdownAnnotationSource): MarkdownAnnotation | null {
  return createMarkdownAnnotation({
    content,
    kind: "replace",
    replacementText,
    selectionRange,
    selectedText,
    sourceSelectedText,
  });
}

export function createReplaceAllAnnotation({
  content,
  replacementText,
  selectionRange,
  selectedText,
  sourceSelectedText,
}: MarkdownAnnotationSource): MarkdownAnnotation | null {
  return createMarkdownAnnotation({
    content,
    kind: "replaceAll",
    replacementText,
    selectionRange,
    selectedText,
    sourceSelectedText,
  });
}

export function createDeleteAnnotation({
  content,
  selectionRange,
  selectedText,
  sourceSelectedText,
}: MarkdownAnnotationSource): MarkdownAnnotation | null {
  return createMarkdownAnnotation({
    content,
    kind: "delete",
    replacementText: "",
    selectionRange,
    selectedText,
    sourceSelectedText,
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

  if (normalizedKind === "deleteAll") {
    return `删除所有 ${selectedText}`;
  }

  if (normalizedKind === "delete") {
    const lineNumber = Number.isFinite(annotation.lineNumber ?? NaN) ? Math.floor(Number(annotation.lineNumber)) : 0;
    if (lineNumber < 1) {
      return "";
    }

    return `第 ${lineNumber} 行：删除 ${selectedText}`;
  }

  if (normalizedKind === "replaceAll" || normalizedKind === "deleteAll") {
    return `所有 ${selectedText} → ${replacementText}`;
  }

  const lineNumber = Number.isFinite(annotation.lineNumber ?? NaN) ? Math.floor(Number(annotation.lineNumber)) : 0;
  if (lineNumber < 1) {
    return "";
  }

  return `第 ${lineNumber} 行：${selectedText} → ${replacementText}`;
}

export function buildDefaultAnnotationLines(annotations: Array<MarkdownAnnotation | null | undefined> = []): string[] {
  return annotations.map((annotation) => buildDefaultAnnotationLine(annotation)).filter((line) => !isBlankLine(line));
}

export function buildAnnotationPrompt({ annotationLines, filePath }: MarkdownAnnotationBuildPromptOptions = {}): string {
  const resolvedLines = Array.isArray(annotationLines) ? annotationLines : [];
  const normalizedFilePath = normalizeMarkdownAnnotationText(filePath);
  const normalizedLines = resolvedLines
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter((line) => !isBlankLine(line));

  if (!normalizedFilePath || !normalizedLines.length) {
    return "";
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
