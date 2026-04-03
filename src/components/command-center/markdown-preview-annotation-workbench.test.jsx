import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownPreviewAnnotationWorkbench } from "@/components/command-center/markdown-preview-annotation-workbench";

const labels = {
  empty: "No annotations yet",
  instructions: "Annotation instructions",
  replace: "Replace selection",
  replaceAll: "Replace all matches",
  submit: "Send instructions",
  title: "Preview annotation workbench",
};

function setPreviewSelection(node, start, end) {
  const selection = window.getSelection();
  const range = document.createRange();

  range.setStart(node, start);
  range.setEnd(node, end);
  selection?.removeAllRanges();
  selection?.addRange(range);

  return selection;
}

describe("MarkdownPreviewAnnotationWorkbench", () => {
  it("renders MarkdownContent, creates a replace annotation from the preview selection, and gates submit until a replacement is entered", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"第一行\n有限公司在这里\n第三行"}
        filePath="docs/spec.md"
        labels={labels}
        onSubmit={onSubmit}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-words")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);
    expect(previewText?.textContent).toBe("第一行\n有限公司在这里\n第三行");

    setPreviewSelection(previewText, 4, 8);
    fireEvent.mouseUp(preview);

    expect(screen.getByRole("button", { name: labels.replace })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.replaceAll })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: labels.replace }));

    const textarea = screen.getByRole("textbox", { name: labels.instructions });
    expect(textarea).toHaveValue("第 2 行：有限公司 → ");
    expect(screen.getAllByTestId("markdown-preview-annotation-preview")[0].querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(1);
    expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();

    await user.type(textarea, "科技有限公司");

    await waitFor(() => {
      expect(textarea).toHaveValue("第 2 行：有限公司 → 科技有限公司");
      expect(screen.getByRole("button", { name: labels.submit })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: labels.submit }));

    expect(onSubmit).toHaveBeenCalledWith({
      annotationLines: ["第 2 行：有限公司 → 科技有限公司"],
      annotations: [
        expect.objectContaining({
          kind: "replace",
          lineNumber: 2,
          matchRanges: [{ start: 4, end: 8 }],
          replacementText: "科技有限公司",
          selectedText: "有限公司",
        }),
      ],
      editorValue: "第 2 行：有限公司 → 科技有限公司",
      prompt: "修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司",
    });
  });

  it("creates a replaceAll annotation from the selection menu and tracks all exact source matches", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
        onSubmit={onSubmit}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-words")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 2);
    fireEvent.mouseUp(preview);
    await user.click(screen.getByRole("button", { name: labels.replaceAll }));

    const textarea = screen.getByRole("textbox", { name: labels.instructions });
    expect(textarea).toHaveValue("所有 陈航 → ");
    expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(3);
    expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();

    await user.type(textarea, "无招");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: labels.submit })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: labels.submit }));

    expect(onSubmit).toHaveBeenCalledWith({
      annotationLines: ["所有 陈航 → 无招"],
      annotations: [
        expect.objectContaining({
          kind: "replaceAll",
          lineNumber: 1,
          matchRanges: [
            { start: 0, end: 2 },
            { start: 9, end: 11 },
            { start: 12, end: 14 },
          ],
          replacementText: "无招",
          selectedText: "陈航",
        }),
      ],
      editorValue: "所有 陈航 → 无招",
      prompt: "修改 docs/spec.md 文件：\n所有 陈航 → 无招",
    });
  });

  it("maps formatted markdown selections back to the correct source line and preserves highlight", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"第一行\n**有限公司** 在这里"}
        filePath="docs/spec.md"
        labels={labels}
        onSubmit={onSubmit}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    await waitFor(() => {
      expect(preview.querySelector("[data-source-text='true']")).toBeTruthy();
    });

    const annotatedText = Array.from(preview.querySelectorAll("[data-source-text='true']")).find((node) => node.textContent === "有限公司");
    const previewText = annotatedText?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 4);
    fireEvent.mouseUp(preview);
    await user.click(screen.getByRole("button", { name: labels.replace }));

    const textarea = screen.getByRole("textbox", { name: labels.instructions });
    expect(textarea).toHaveValue("第 2 行：有限公司 → ");
    expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(1);

    await user.type(textarea, "科技有限公司");
    await user.click(screen.getByRole("button", { name: labels.submit }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        annotationLines: ["第 2 行：有限公司 → 科技有限公司"],
        prompt: "修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司",
      }),
    );
  });
});
