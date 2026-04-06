import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreviewAnnotationWorkbench } from "@/components/command-center/markdown-preview-annotation-workbench";

const labels = {
  actionMenuLabel: "Annotation action menu",
  delete: "Delete selection",
  editorHint: "Type the replacement text after the arrow.",
  empty: "No annotations yet",
  instructions: "Annotation instructions",
  promptTitle: "Instructions that will be sent to LalaClaw",
  replacementPlaceholder: "Replace with",
  removeAnnotation: (line) => `Remove annotation: ${line}`,
  replace: "Replace selection",
  replaceAll: "Replace all matches",
  submit: "Send instructions",
  title: "Preview annotation workbench",
};

function replacementFieldLabel(prefix) {
  return `${labels.instructions}: ${prefix}`.trim();
}

function setPreviewSelection(node, start, end) {
  const selection = window.getSelection();
  const range = document.createRange();

  range.setStart(node, start);
  range.setEnd(node, end);
  selection?.removeAllRanges();
  selection?.addRange(range);

  return selection;
}

async function chooseSelectionAction(label) {
  fireEvent.mouseDown(await screen.findByRole("menuitem", { name: label }));
}

afterEach(() => {
  vi.useRealTimers();
});

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

    expect(screen.getByTestId("markdown-preview-annotation-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("markdown-preview-annotation-prompt-panel")).toBeInTheDocument();
    expect(screen.getByText(labels.promptTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.empty)).toBeInTheDocument();

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);
    expect(previewText?.textContent).toBe("第一行\n有限公司在这里\n第三行");

    setPreviewSelection(previewText, 4, 8);
    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: labels.replace })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: labels.replaceAll })).toBeInTheDocument();
      expect(preview.querySelector("mark[data-markdown-annotation-highlight-tone='selection']")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual([
      labels.replace,
      labels.replaceAll,
      labels.delete,
    ]);

    await chooseSelectionAction(labels.replace);

    const replacementInput = screen.getByRole("textbox", { name: replacementFieldLabel("第 2 行：有限公司 → ") });
    await waitFor(() => {
      expect(screen.getByText(labels.editorHint)).toBeInTheDocument();
      expect(screen.getByText("第 2 行：有限公司 →")).toBeInTheDocument();
      expect(replacementInput).toHaveAttribute("aria-placeholder", labels.replacementPlaceholder);
      expect(replacementInput).toBeEmptyDOMElement();
      expect(screen.getAllByTestId("markdown-preview-annotation-preview")[0].querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(1);
      expect(preview.querySelector("mark[data-markdown-annotation-highlight-tone='annotation']")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();
    });

    await user.click(replacementInput);
    expect(replacementInput).toHaveFocus();
    await user.type(replacementInput, "科技有限公司");

    await waitFor(() => {
      expect(replacementInput).toHaveTextContent("科技有限公司");
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

  it("passes the selected font size through to the markdown preview content in annotation mode", () => {
    const { rerender } = render(
      <MarkdownPreviewAnnotationWorkbench
        content={"第一行\n第二行"}
        filePath="docs/spec.md"
        fontSize="small"
        labels={labels}
      />,
    );

    expect(screen.getByTestId("markdown-preview-annotation-preview").firstChild).toHaveClass("text-[11px]", "leading-[1.15rem]");

    rerender(
      <MarkdownPreviewAnnotationWorkbench
        content={"第一行\n第二行"}
        filePath="docs/spec.md"
        fontSize="large"
        labels={labels}
      />,
    );

    expect(screen.getByTestId("markdown-preview-annotation-preview").firstChild).toHaveClass("text-[14px]", "leading-6");
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
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 2);
    fireEvent.mouseUp(preview);
    await chooseSelectionAction(labels.replaceAll);

    const replacementInput = screen.getByRole("textbox", { name: replacementFieldLabel("所有 陈航 → ") });
    await waitFor(() => {
      expect(screen.getByText("所有 陈航 →")).toBeInTheDocument();
      expect(replacementInput).toHaveAttribute("aria-placeholder", labels.replacementPlaceholder);
      expect(replacementInput).toBeEmptyDOMElement();
      expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(3);
      expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight-tone='annotation']")).toHaveLength(3);
      expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();
    });

    await user.click(replacementInput);
    expect(replacementInput).toHaveFocus();
    await user.type(replacementInput, "无招");
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

  it("clears the temporary selection menu and highlight when the user clicks away without choosing an action", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 2);
    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
      expect(screen.getByTestId("markdown-preview-annotation-actions")).toBeInTheDocument();
      expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(1);
      expect(preview.querySelector("mark[data-markdown-annotation-highlight-tone='selection']")).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTestId("markdown-preview-annotation-actions")).not.toBeInTheDocument();
      expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(0);
    });
  });

  it("clears the native browser selection after the temporary action menu appears so only the custom highlight remains", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 2);
    expect(window.getSelection()?.toString()).toBe("陈航");

    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
      expect(preview.querySelector("mark[data-markdown-annotation-highlight-tone='selection']")).toBeInTheDocument();
      expect(window.getSelection()?.toString()).toBe("");
    });
  });

  it("waits until pointer release before showing the selection action menu", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    fireEvent.mouseDown(preview);
    setPreviewSelection(previewText, 0, 2);
    fireEvent(document, new Event("selectionchange"));

    expect(screen.queryByTestId("markdown-preview-annotation-actions")).not.toBeInTheDocument();

    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
    });
  });

  it("does not clear an existing native selection when pointerdown starts inside the preview", () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 2);
    expect(window.getSelection()?.toString()).toBe("陈航");

    fireEvent.pointerDown(preview);

    expect(window.getSelection()?.toString()).toBe("陈航");
  });

  it("shows the selection menu after a real pointer-plus-mouse drag sequence inside the preview", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    fireEvent.pointerDown(preview);
    fireEvent.mouseDown(preview);
    setPreviewSelection(previewText, 0, 2);
    fireEvent(document, new Event("selectionchange"));
    fireEvent.pointerUp(preview);
    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
    });
  });

  it("anchors the action menu to the selection rect nearest the pointer release inside a scrolled preview", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const scrollContainer = preview.parentElement;
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(scrollContainer).toBeTruthy();
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 300 });
    Object.defineProperty(scrollContainer, "scrollLeft", { configurable: true, value: 0 });
    scrollContainer.getBoundingClientRect = () => ({
      bottom: 600,
      height: 400,
      left: 100,
      right: 700,
      top: 200,
      width: 600,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });

    setPreviewSelection(previewText, 0, 2);
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);
    expect(selection).toBeTruthy();
    expect(range).toBeTruthy();

    range.getClientRects = () => ([
      {
        bottom: 244,
        height: 24,
        left: 120,
        right: 180,
        top: 220,
        width: 60,
        x: 120,
        y: 220,
        toJSON: () => ({}),
      },
      {
        bottom: 504,
        height: 24,
        left: 320,
        right: 380,
        top: 480,
        width: 60,
        x: 320,
        y: 480,
        toJSON: () => ({}),
      },
    ]);
    range.getBoundingClientRect = () => ({
      bottom: 244,
      height: 24,
      left: 120,
      right: 180,
      top: 220,
      width: 60,
      x: 120,
      y: 220,
      toJSON: () => ({}),
    });
    range.cloneRange = () => ({
      collapse: () => {},
      getBoundingClientRect: () => ({
        bottom: 504,
        height: 24,
        left: 320,
        right: 380,
        top: 480,
        width: 60,
        x: 320,
        y: 480,
        toJSON: () => ({}),
      }),
      getClientRects: () => [],
      setStart: () => {},
    });
    Object.defineProperty(selection, "focusNode", { configurable: true, value: previewText });
    Object.defineProperty(selection, "focusOffset", { configurable: true, value: 2 });

    fireEvent.mouseUp(preview, { clientX: 330, clientY: 504 });

    const menu = await screen.findByRole("menu", { name: labels.actionMenuLabel });
    expect(menu).toHaveStyle({
      left: "220px",
      top: "446px",
    });
  });

  it("retries menu positioning instead of falling back to the preview corner when selection geometry is not ready yet", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const scrollContainer = preview.parentElement;
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(scrollContainer).toBeTruthy();
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(scrollContainer, "scrollTop", { configurable: true, value: 300 });
    Object.defineProperty(scrollContainer, "scrollLeft", { configurable: true, value: 0 });
    scrollContainer.getBoundingClientRect = () => ({
      bottom: 600,
      height: 400,
      left: 100,
      right: 700,
      top: 200,
      width: 600,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });

    setPreviewSelection(previewText, 0, 2);
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);
    expect(selection).toBeTruthy();
    expect(range).toBeTruthy();

    let rectCallCount = 0;
    range.getClientRects = () => {
      rectCallCount += 1;
      if (rectCallCount === 1) {
        return [];
      }

      return [{
        bottom: 504,
        height: 24,
        left: 320,
        right: 380,
        top: 480,
        width: 60,
        x: 320,
        y: 480,
        toJSON: () => ({}),
      }];
    };
    range.getBoundingClientRect = () => ({
      bottom: Number.NaN,
      height: Number.NaN,
      left: Number.NaN,
      right: Number.NaN,
      top: Number.NaN,
      width: Number.NaN,
      x: Number.NaN,
      y: Number.NaN,
      toJSON: () => ({}),
    });
    range.cloneRange = () => ({
      collapse: () => {},
      getBoundingClientRect: () => ({
        bottom: Number.NaN,
        height: Number.NaN,
        left: Number.NaN,
        right: Number.NaN,
        top: Number.NaN,
        width: Number.NaN,
        x: Number.NaN,
        y: Number.NaN,
        toJSON: () => ({}),
      }),
      getClientRects: () => [],
      setStart: () => {
        throw new Error("selection geometry not ready");
      },
    });
    Object.defineProperty(selection, "focusNode", { configurable: true, value: previewText });
    Object.defineProperty(selection, "focusOffset", { configurable: true, value: 2 });

    fireEvent.mouseUp(preview, { clientX: 330, clientY: 504 });

    expect(screen.queryByRole("menu", { name: labels.actionMenuLabel })).not.toBeInTheDocument();

    await waitFor(() => {
      const menu = screen.getByRole("menu", { name: labels.actionMenuLabel });
      expect(menu).toHaveStyle({
        left: "220px",
        top: "446px",
      });
    });
  });

  it("still shows the selection action menu when the drag ends outside the preview container", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"陈航\nhello 陈航\n陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    fireEvent.mouseDown(preview);
    setPreviewSelection(previewText, 0, 2);
    fireEvent(document, new Event("selectionchange"));
    fireEvent.pointerUp(document);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
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
    await chooseSelectionAction(labels.replace);

    const replacementInput = screen.getByRole("textbox", { name: replacementFieldLabel("第 2 行：有限公司 → ") });
    await waitFor(() => {
      expect(screen.getByText("第 2 行：有限公司 →")).toBeInTheDocument();
      expect(replacementInput).toHaveAttribute("aria-placeholder", labels.replacementPlaceholder);
      expect(replacementInput).toBeEmptyDOMElement();
      expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(1);
      expect(preview.querySelector("mark[data-markdown-annotation-highlight-tone='annotation']")).toBeInTheDocument();
    });

    await user.type(replacementInput, "科技有限公司");
    await user.click(screen.getByRole("button", { name: labels.submit }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        annotationLines: ["第 2 行：有限公司 → 科技有限公司"],
        prompt: "修改 docs/spec.md 文件：\n第 2 行：有限公司 → 科技有限公司",
      }),
    );
  });

  it("shows the action menu for selections that span formatted markdown nodes", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"- **定位**: 面向企业"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    await waitFor(() => {
      expect(preview.querySelectorAll("[data-source-text='true']").length).toBeGreaterThan(1);
    });

    const sourceTextNodes = Array.from(preview.querySelectorAll("[data-source-text='true']"));
    const startNode = sourceTextNodes.find((node) => node.textContent === "定位")?.firstChild;
    const endNode = sourceTextNodes.find((node) => node.textContent === ": 面向企业")?.firstChild;

    expect(startNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(endNode?.nodeType).toBe(Node.TEXT_NODE);

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(startNode, 0);
    range.setEnd(endNode, endNode.textContent.length);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menu", { name: labels.actionMenuLabel })).toBeInTheDocument();
      expect(preview.querySelector("mark[data-markdown-annotation-highlight-tone='selection']")).toBeInTheDocument();
    });
  });

  it("removes a single annotation without clearing the rest of the draft set", async () => {
    const user = userEvent.setup();

    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"有限公司\n陈航 hello 陈航"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 0, 4);
    fireEvent.mouseUp(preview);
    await chooseSelectionAction(labels.replace);

    const plainTextNode = Array.from(preview.querySelector("[data-source-text='true']")?.childNodes || []).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("陈航 hello 陈航"),
    );
    expect(plainTextNode?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(plainTextNode, 1, 3);
    fireEvent.mouseUp(preview);
    await chooseSelectionAction(labels.replaceAll);

    await waitFor(() => {
      expect(screen.getByText("第 1 行：有限公司 →")).toBeInTheDocument();
      expect(screen.getByText("所有 陈航 →")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: replacementFieldLabel("第 1 行：有限公司 → ") })).toBeEmptyDOMElement();
      expect(screen.getByRole("textbox", { name: replacementFieldLabel("所有 陈航 → ") })).toBeEmptyDOMElement();
      expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(3);
    });

    await user.click(screen.getByRole("button", { name: /Remove annotation: 所有 陈航/ }));

    expect(screen.getByRole("textbox", { name: replacementFieldLabel("第 1 行：有限公司 → ") })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: replacementFieldLabel("所有 陈航 → ") })).not.toBeInTheDocument();
    expect(preview.querySelectorAll("mark[data-markdown-annotation-highlight='true']")).toHaveLength(1);
  });

  it("creates a delete annotation from the selection menu without requiring replacement text", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"第一行\n这段话需要删除\n第三行"}
        filePath="docs/spec.md"
        labels={labels}
        onSubmit={onSubmit}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 4, 11);
    fireEvent.mouseUp(preview);

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: labels.delete })).toBeInTheDocument();
    });
    await chooseSelectionAction(labels.delete);

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: /第 2 行：删除 这段话需要删除/ })).not.toBeInTheDocument();
      expect(screen.getByText("第 2 行：删除 这段话需要删除")).toBeInTheDocument();
      expect(screen.queryByText(labels.editorHint)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: labels.submit })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: labels.submit }));

    expect(onSubmit).toHaveBeenCalledWith({
      annotationLines: ["第 2 行：删除 这段话需要删除"],
      annotations: [
        expect.objectContaining({
          kind: "delete",
          lineNumber: 2,
          matchRanges: [{ start: 4, end: 11 }],
          replacementText: "",
          selectedText: "这段话需要删除",
        }),
      ],
      editorValue: "第 2 行：删除 这段话需要删除",
      prompt: "修改 docs/spec.md 文件：\n第 2 行：删除 这段话需要删除",
    });
  });

  it("flows long replacement prefixes and the target field together as one wrapped instruction block instead of a separate right column", async () => {
    render(
      <MarkdownPreviewAnnotationWorkbench
        content={"第一行\n终落地，那它的战略意义不在于“做了一个 agent”"}
        filePath="docs/spec.md"
        labels={labels}
      />,
    );

    const preview = screen.getByTestId("markdown-preview-annotation-preview");
    const previewText = preview.querySelector(".whitespace-pre-wrap.break-all")?.firstChild;
    expect(previewText?.nodeType).toBe(Node.TEXT_NODE);

    setPreviewSelection(previewText, 4, 26);
    fireEvent.mouseUp(preview);
    await chooseSelectionAction(labels.replace);

    const prefix = await screen.findByTitle(/第 2 行：终落地，那它的战略意义不在于/);
    const replacementInput = screen.getByRole("textbox", { name: /Annotation instructions: 第 2 行：终落地，那它的战略意义不在于/ });

    expect(prefix).toHaveClass("whitespace-normal", "break-words");
    expect(prefix).not.toHaveClass("truncate", "shrink-0");
    expect(replacementInput).toHaveClass("inline-block", "min-w-[5.5ch]", "cursor-text", "whitespace-pre-wrap", "break-words");
    expect(replacementInput).toHaveAttribute("aria-placeholder", labels.replacementPlaceholder);
    expect(replacementInput).not.toHaveClass("w-36", "rounded-md", "bg-muted/35", "h-8", "h-9");
  });
});
