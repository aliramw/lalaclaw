import { describe, expect, it } from "vitest";
import {
  buildAnnotationPrompt,
  buildDefaultAnnotationLines,
  collectMarkdownAnnotationMatchRanges,
  createDeleteAnnotation,
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
        selectionRange: { start: 4, end: 8 },
      }),
    ).toEqual({
      anchorRange: { start: 4, end: 8 },
      id: expect.any(String),
      kind: "replace",
      lineNumber: 2,
      matchRanges: [{ start: 4, end: 8 }],
      replacementText: "科技有限公司",
      selectedText: "有限公司",
    });
  });

  it("fails closed when the selection drifts from the source content", () => {
    expect(
      createReplaceAnnotation({
        content: "abcXYZdef",
        replacementText: "nope",
        selectedText: "ABC",
        selectionRange: { start: 3, end: 6 },
      }),
    ).toBeNull();
  });

  it("accepts rendered markdown text when the raw source slice is provided separately", () => {
    const content = "**定位**: 面向企业";

    expect(
      createReplaceAnnotation({
        content,
        replacementText: "面向大型企业",
        selectedText: "定位: 面向企业",
        selectionRange: { start: 0, end: content.length },
        sourceSelectedText: content,
      }),
    ).toEqual({
      anchorRange: { start: 0, end: content.length },
      id: expect.any(String),
      kind: "replace",
      lineNumber: 1,
      matchRanges: [{ start: 0, end: content.length }],
      replacementText: "面向大型企业",
      selectedText: "定位: 面向企业",
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

  it("fails closed when the exact match is missing from the source content", () => {
    expect(
      createReplaceAllAnnotation({
        content: "abc abc",
        replacementText: "无招",
        selectedText: "abd",
        selectionRange: { start: 0, end: 3 },
      }),
    ).toBeNull();
  });
});

describe("createDeleteAnnotation", () => {
  it("creates a normalized delete annotation from source content", () => {
    expect(
      createDeleteAnnotation({
        content: "第一行\n这段话需要删除\n第三行",
        selectedText: "这段话需要删除",
        selectionRange: { start: 4, end: 11 },
      }),
    ).toEqual({
      anchorRange: { start: 4, end: 11 },
      id: expect.any(String),
      kind: "delete",
      lineNumber: 2,
      matchRanges: [{ start: 4, end: 11 }],
      replacementText: "",
      selectedText: "这段话需要删除",
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
          selectionRange: { start: 4, end: 8 },
        }),
        createReplaceAllAnnotation({
          content: "陈航\nhello 陈航\n陈航",
          replacementText: "无招",
          selectedText: "陈航",
          selectionRange: { start: 0, end: 2 },
        }),
        createDeleteAnnotation({
          content: "第一行\n这段话需要删除\n第三行",
          selectedText: "这段话需要删除",
          selectionRange: { start: 4, end: 11 },
        }),
      ]),
    ).toEqual(["第 2 行：有限公司 → ", "所有 陈航 → 无招", "第 2 行：删除 这段话需要删除"]);
  });

  it("drops replace annotations that cannot resolve to a valid source line", () => {
    expect(
      buildDefaultAnnotationLines([
        {
          anchorRange: { start: 0, end: 1 },
          id: "bad",
          kind: "replace",
          lineNumber: 0,
          matchRanges: [{ start: 0, end: 1 }],
          replacementText: "科技有限公司",
          selectedText: "有",
        },
      ]),
    ).toEqual([]);
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

  it("fails closed when the prompt has no valid annotation lines", () => {
    expect(
      buildAnnotationPrompt({
        annotationLines: ["  ", "", null],
        filePath: "docs/spec.md",
      }),
    ).toBe("");
  });

  it("fails closed when the prompt file path is invalid", () => {
    expect(
      buildAnnotationPrompt({
        annotationLines: ["第 2 行：有限公司 → 科技有限公司"],
        filePath: "   ",
      }),
    ).toBe("");
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
