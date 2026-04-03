import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createReplaceAllAnnotation,
  createReplaceAnnotation,
} from "@/components/command-center/markdown-annotation-utils";
import { MarkdownPreviewAnnotationWorkbench } from "@/components/command-center/markdown-preview-annotation-workbench";

const labels = {
  empty: "No annotations yet",
  instructions: "Annotation instructions",
  submit: "Send instructions",
  title: "Preview annotation workbench",
};

describe("MarkdownPreviewAnnotationWorkbench", () => {
  it("seeds editable instructions from annotations and submits the edited prompt", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MarkdownPreviewAnnotationWorkbench
        annotations={[
          createReplaceAnnotation({
            content: "第一行\n有限公司在这里\n第三行",
            replacementText: "科技有限公司",
            selectedText: "有限公司",
            selectionRange: { start: 4, end: 8 },
          }),
          createReplaceAllAnnotation({
            content: "陈航\nhello 陈航\n陈航",
            replacementText: "无招",
            selectedText: "陈航",
            selectionRange: { start: 0, end: 2 },
          }),
        ]}
        filePath="docs/spec.md"
        labels={labels}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByRole("textbox", { name: labels.instructions });
    expect(textarea).toHaveValue("第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 无招");
    expect(screen.getByTestId("markdown-preview-annotation-prompt").textContent).toBe(
      "修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 无招",
    );

    await user.clear(textarea);
    await user.type(textarea, "第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 百川");
    await user.click(screen.getByRole("button", { name: labels.submit }));

    expect(onSubmit).toHaveBeenCalledWith({
      annotationLines: ["第 2 行：有限公司 → 科技有限公司", "所有 陈航 → 百川"],
      editorValue: "第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 百川",
      prompt: "修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司\n所有 陈航 → 百川",
    });
  });

  it("disables submission when any annotation is still missing a replacement target", () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        annotations={[
          createReplaceAnnotation({
            content: "第一行\n有限公司在这里\n第三行",
            replacementText: "",
            selectedText: "有限公司",
            selectionRange: { start: 4, end: 8 },
          }),
        ]}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    expect(screen.getByRole("textbox", { name: labels.instructions })).toHaveValue("第 2 行：有限公司 → ");
    expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();
  });

  it("shows the empty workbench state when there are no annotations yet", () => {
    render(<MarkdownPreviewAnnotationWorkbench annotations={[]} filePath="docs/spec.md" labels={labels} />);

    expect(screen.getByText(labels.empty)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: labels.instructions })).toHaveValue("");
    expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();
    expect(screen.getByTestId("markdown-preview-annotation-prompt")).toBeEmptyDOMElement();
  });
});
