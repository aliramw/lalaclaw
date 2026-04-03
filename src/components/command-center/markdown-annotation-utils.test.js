import { describe, expect, it } from "vitest";
import {
  buildMarkdownAnnotationEditPrompt,
  buildMarkdownAnnotationInstructionLine,
  normalizeMarkdownAnnotationKind,
  resolveMarkdownAnnotationLabel,
} from "@/components/command-center/markdown-annotation-utils";

describe("normalizeMarkdownAnnotationKind", () => {
  it("normalizes supported annotation kinds and aliases future delete kinds", () => {
    expect(normalizeMarkdownAnnotationKind("replace")).toBe("replace");
    expect(normalizeMarkdownAnnotationKind("replaceAll")).toBe("replaceAll");
    expect(normalizeMarkdownAnnotationKind("delete")).toBe("delete");
    expect(normalizeMarkdownAnnotationKind("deleteAll")).toBe("deleteAll");
    expect(normalizeMarkdownAnnotationKind("  replaceAll  ")).toBe("replaceAll");
  });

  it("returns null for unknown kinds", () => {
    expect(normalizeMarkdownAnnotationKind("rename")).toBeNull();
    expect(normalizeMarkdownAnnotationKind("")).toBeNull();
    expect(normalizeMarkdownAnnotationKind(null)).toBeNull();
  });
});

describe("resolveMarkdownAnnotationLabel", () => {
  it("returns stable labels for normalized kinds", () => {
    expect(resolveMarkdownAnnotationLabel("replace")).toBe("替换");
    expect(resolveMarkdownAnnotationLabel("replaceAll")).toBe("批量替换");
    expect(resolveMarkdownAnnotationLabel("delete")).toBe("删除");
    expect(resolveMarkdownAnnotationLabel("deleteAll")).toBe("批量删除");
  });
});

describe("buildMarkdownAnnotationInstructionLine", () => {
  it("builds default lines for replace and replaceAll annotations", () => {
    expect(
      buildMarkdownAnnotationInstructionLine({
        kind: "replace",
        lineNumber: 8,
        selectedText: "有限公司",
        replacementText: "",
      }),
    ).toBe("第 8 行：有限公司 → ");

    expect(
      buildMarkdownAnnotationInstructionLine({
        kind: "replaceAll",
        selectedText: "陈航",
        replacementText: "无招",
      }),
    ).toBe("所有 陈航 → 无招");
  });

  it("uses future delete labels and keeps the replacement slot editable", () => {
    expect(
      buildMarkdownAnnotationInstructionLine({
        kind: "delete",
        lineNumber: 3,
        selectedText: "旧文本",
        replacementText: "",
      }),
    ).toBe("第 3 行：旧文本 → ");
  });
});

describe("buildMarkdownAnnotationEditPrompt", () => {
  it("builds the agent prompt body from the file path and editable lines", () => {
    expect(
      buildMarkdownAnnotationEditPrompt({
        filePath: "docs/spec.md",
        instructionLines: ["第 8 行：有限公司 → 科技有限公司", "所有 陈航 → 无招"],
      }),
    ).toBe("修改 docs/spec.md 文件：\n第 8 行：有限公司 → 科技有限公司\n所有 陈航 → 无招");
  });

  it("trims blank lines from the editable block before building the prompt", () => {
    expect(
      buildMarkdownAnnotationEditPrompt({
        filePath: "docs/spec.md",
        instructionLines: ["  ", "第 8 行：有限公司 → 科技有限公司", "", "所有 陈航 → 无招"],
      }),
    ).toBe("修改 docs/spec.md 文件：\n第 8 行：有限公司 → 科技有限公司\n所有 陈航 → 无招");
  });
});
