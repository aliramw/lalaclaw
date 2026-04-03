import { describe, expect, it } from "vitest";
import {
  buildAnnotationPrompt,
  buildDefaultAnnotationLines,
  collectMarkdownAnnotationMatchRanges,
  createReplaceAllAnnotation,
  createReplaceAnnotation,
  normalizeMarkdownAnnotationKind,
  resolveMarkdownAnnotationLineNumber,
} from "@/components/command-center/markdown-annotation-utils";

describe("normalizeMarkdownAnnotationKind", () => {
  it("normalizes supported annotation kinds and rejects arbitrary kinds", () => {
    expect(normalizeMarkdownAnnotationKind("replace")).toBe("replace");
    expect(normalizeMarkdownAnnotationKind("replaceAll")).toBe("replaceAll");
    expect(normalizeMarkdownAnnotationKind("delete")).toBe("delete");
    expect(normalizeMarkdownAnnotationKind("deleteAll")).toBe("deleteAll");
    expect(normalizeMarkdownAnnotationKind("  replaceAll  ")).toBe("replaceAll");
    expect(normalizeMarkdownAnnotationKind("rename")).toBeNull();
    expect(normalizeMarkdownAnnotationKind("")).toBeNull();
    expect(normalizeMarkdownAnnotationKind(null)).toBeNull();
  });
});

describe("collectMarkdownAnnotationMatchRanges", () => {
  it("collects every exact match range from source content", () => {
    expect(collectMarkdownAnnotationMatchRanges("有限公司\nfoo有限公司\n有限公司", "有限公司")).toEqual([
      { start: 0, end: 4 },
      { start: 8, end: 12 },
      { start: 13, end: 17 },
    ]);
  });

  it("returns an empty list for blank selections", () => {
    expect(collectMarkdownAnnotationMatchRanges("abc", "")).toEqual([]);
    expect(collectMarkdownAnnotationMatchRanges("abc", null)).toEqual([]);
  });
});

describe("resolveMarkdownAnnotationLineNumber", () => {
  it("resolves a 1-based line number from the source offset", () => {
    expect(resolveMarkdownAnnotationLineNumber("first\nsecond\nthird", 0)).toBe(1);
    expect(resolveMarkdownAnnotationLineNumber("first\nsecond\nthird", 6)).toBe(2);
    expect(resolveMarkdownAnnotationLineNumber("first\nsecond\nthird", 14)).toBe(3);
  });
});

describe("createReplaceAnnotation", () => {
  it("creates a normalized replace annotation from source content", () => {
    expect(
      createReplaceAnnotation({
        content: "第一行\n有限公司在这里\n第三行",
        replacementText: "科技有限公司",
        selectedText: "有限公司",
        selectionRange: { start: 6, end: 10 },
      }),
    ).toEqual({
      anchorRange: { start: 6, end: 10 },
      id: expect.any(String),
      kind: "replace",
      lineNumber: 2,
      matchRanges: [{ start: 6, end: 10 }],
      replacementText: "科技有限公司",
      selectedText: "有限公司",
    });
  });
});

describe("createReplaceAllAnnotation", () => {
  it("creates a normalized replaceAll annotation with all exact match ranges", () => {
    expect(
      createReplaceAllAnnotation({
        content: "陈航\nhello 陈航\n陈航",
        replacementText: "无招",
        selectedText: "陈航",
        selectionRange: { start: 0, end: 2 },
      }),
    ).toEqual({
      anchorRange: { start: 0, end: 2 },
      id: expect.any(String),
      kind: "replaceAll",
      lineNumber: 1,
      matchRanges: [
        { start: 0, end: 2 },
        { start: 9, end: 11 },
        { start: 12, end: 14 },
      ],
      replacementText: "无招",
      selectedText: "陈航",
    });
  });
});

describe("buildDefaultAnnotationLines", () => {
  it("builds the default instruction lines from normalized annotations", () => {
    expect(
      buildDefaultAnnotationLines([
        createReplaceAnnotation({
          content: "第一行\n有限公司在这里\n第三行",
          replacementText: "",
          selectedText: "有限公司",
          selectionRange: { start: 6, end: 10 },
        }),
        createReplaceAllAnnotation({
          content: "陈航\nhello 陈航\n陈航",
          replacementText: "无招",
          selectedText: "陈航",
          selectionRange: { start: 0, end: 2 },
        }),
      ]),
    ).toEqual(["第 2 行：有限公司 → ", "所有 陈航 → 无招"]);
  });
});

describe("buildAnnotationPrompt", () => {
  it("builds the final prompt body from the file path and editable lines", () => {
    expect(
      buildAnnotationPrompt({
        annotationLines: ["第 2 行：有限公司 → 科技有限公司", "所有 陈航 → 无招"],
        filePath: "docs/spec.md",
      }),
    ).toBe("修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 无招");
  });

  it("filters blank lines before serializing", () => {
    expect(
      buildAnnotationPrompt({
        annotationLines: ["  ", "第 2 行：有限公司 → 科技有限公司", "", "所有 陈航 → 无招"],
        filePath: "docs/spec.md",
      }),
    ).toBe("修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 无招");
  });
});
