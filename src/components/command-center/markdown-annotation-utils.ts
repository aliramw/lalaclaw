export type MarkdownAnnotationKind = "replace" | "replaceAll" | "delete" | "deleteAll";

export type MarkdownAnnotationRange = {
  end: number;
  start: number;
};

export type MarkdownAnnotation = {
  anchorRange?: MarkdownAnnotationRange;
  id?: string;
  kind: MarkdownAnnotationKind | string;
  lineNumber?: number;
  matchRanges?: MarkdownAnnotationRange[];
  replacementText?: string;
  selectedText: string;
};

const markdownAnnotationKindLabels = {
  delete: "删除",
  deleteAll: "批量删除",
  replace: "替换",
  replaceAll: "批量替换",
} as const;

const markdownAnnotationKindAliases = new Map([
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

function isBlankLine(value: unknown): boolean {
  return normalizeMarkdownAnnotationText(value).length === 0;
}

export function normalizeMarkdownAnnotationKind(kind: unknown): MarkdownAnnotationKind | null {
  const normalizedKind = normalizeMarkdownAnnotationText(kind).toLowerCase();

  if (!normalizedKind) {
    return null;
  }

  return markdownAnnotationKindAliases.get(normalizedKind) ?? null;
}

export function resolveMarkdownAnnotationLabel(kind: unknown): string {
  const normalizedKind = normalizeMarkdownAnnotationKind(kind);

  if (!normalizedKind) {
    return "";
  }

  return markdownAnnotationKindLabels[normalizedKind];
}

export function buildMarkdownAnnotationInstructionLine(annotation: MarkdownAnnotation | null | undefined): string {
  const normalizedKind = normalizeMarkdownAnnotationKind(annotation?.kind);
  const selectedText = normalizeMarkdownAnnotationText(annotation?.selectedText);
  const replacementText = normalizeMarkdownAnnotationText(annotation?.replacementText);

  if (!normalizedKind || !selectedText) {
    return "";
  }

  if (normalizedKind === "replaceAll" || normalizedKind === "deleteAll") {
    return `所有 ${selectedText} → ${replacementText}`;
  }

  return `第 ${Number(annotation?.lineNumber || 0)} 行：${selectedText} → ${replacementText}`;
}

export function buildMarkdownAnnotationInstructionLines(
  annotations: Array<MarkdownAnnotation | null | undefined> = [],
): string[] {
  return annotations
    .map((annotation) => buildMarkdownAnnotationInstructionLine(annotation))
    .filter((line) => !isBlankLine(line));
}

export function buildMarkdownAnnotationEditPrompt({
  filePath,
  instructionLines = [],
}: {
  filePath?: unknown;
  instructionLines?: unknown[];
} = {}): string {
  const normalizedFilePath = normalizeMarkdownAnnotationText(filePath);
  const normalizedLines = instructionLines.map((line) => normalizeMarkdownAnnotationText(line)).filter((line) => !isBlankLine(line));

  if (!normalizedFilePath) {
    return normalizedLines.join("\n");
  }

  if (!normalizedLines.length) {
    return `修改 ${normalizedFilePath} 文件：`;
  }

  return `修改 ${normalizedFilePath} 文件：\n${normalizedLines.join("\n")}`;
}

export function buildMarkdownAnnotationPrompt({
  filePath,
  annotations = [],
  instructionLines,
}: {
  annotations?: Array<MarkdownAnnotation | null | undefined>;
  filePath?: unknown;
  instructionLines?: unknown[];
} = {}): string {
  const resolvedLines = Array.isArray(instructionLines) ? instructionLines : buildMarkdownAnnotationInstructionLines(annotations);
  return buildMarkdownAnnotationEditPrompt({ filePath, instructionLines: resolvedLines });
}
