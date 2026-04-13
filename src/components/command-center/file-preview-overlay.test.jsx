import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { monacoEditorApis, renderAsyncMock } = vi.hoisted(() => ({
  monacoEditorApis: [],
  renderAsyncMock: vi.fn(),
}));

vi.mock("docx-preview", () => ({
  renderAsync: renderAsyncMock,
}));

vi.mock("@/components/command-center/markdown-preview-annotation-workbench", () => ({
  MarkdownPreviewAnnotationWorkbench: function MockMarkdownPreviewAnnotationWorkbench({ fontSize, onStateChange, onSubmit }) {
    return (
      <div data-testid="markdown-preview-annotation-workbench" data-font-size={fontSize || "medium"}>
        <button
          type="button"
          data-testid="markdown-annotation-mark-draft"
          onClick={() => onStateChange?.({ annotationCount: 1, hasDraftAnnotations: true })}
        >
          mark draft
        </button>
        <button
          type="button"
          data-testid="markdown-annotation-clear-draft"
          onClick={() => onStateChange?.({ annotationCount: 0, hasDraftAnnotations: false })}
        >
          clear draft
        </button>
        <button
          type="button"
          data-testid="markdown-annotation-submit"
          onClick={() =>
            onSubmit?.({
              annotationLines: ["第 2 行：有限公司 → 科技有限公司"],
              annotations: [],
              editorValue: "第 2 行：有限公司 → 科技有限公司",
              prompt: "修改 /Users/marila/projects/lalaclaw/annotate.md 文件：\n第 2 行：有限公司 → 科技有限公司",
            })
          }
        >
          submit
        </button>
      </div>
    );
  },
}));

vi.mock("@monaco-editor/react", () => ({
  default: function MockMonacoEditor({ language, onChange, onMount, value }) {
    return (
      <textarea
        aria-label="Monaco editor"
        data-language={language}
        data-testid="file-preview-monaco-editor"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        ref={(node) => {
          if (!node || node.dataset.monacoMounted === "true") {
            return;
          }

          node.dataset.monacoMounted = "true";

          const editorApi = {
            focus: () => node.focus(),
            getDomNode: () => node,
            getLayoutInfo: () => ({ height: 200 }),
            getScrollHeight: () => 1200,
            setScrollTop: (nextScrollTop) => {
              node.scrollTop = nextScrollTop;
            },
          };

          monacoEditorApis.push(editorApi);
          onMount?.(editorApi);
        }}
      />
    );
  },
}));

import { FilePreviewOverlay, ImagePreviewOverlay } from "@/components/command-center/file-preview-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";

const navigatorPlatformDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "platform");

function renderPreview(node) {
  return render(
    <I18nProvider>
      <TooltipProvider delayDuration={0}>{node}</TooltipProvider>
    </I18nProvider>,
  );
}

function mockNavigatorPlatform(platform) {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
}

describe("FilePreviewOverlay", () => {
  afterEach(() => {
    window.localStorage.removeItem("file-preview-font-size");
    window.localStorage.removeItem("file-preview-expanded");
    monacoEditorApis.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (navigatorPlatformDescriptor) {
      Object.defineProperty(window.navigator, "platform", navigatorPlatformDescriptor);
    }
  });

  it("renders pdf files inside an iframe preview", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "pdf",
          name: "report.pdf",
          path: "/Users/marila/projects/lalaclaw/report.pdf",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTitle("report.pdf")).toHaveAttribute(
      "src",
      "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
    );
    expect(screen.queryByText("该文件类型暂不支持内联预览。")).not.toBeInTheDocument();
  });

  it("shows the files sidebar for pdf previews with a real file path", async () => {
    const onOpenFilePreview = vi.fn();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        sessionFiles={[
          {
            path: "/Users/marila/projects/lalaclaw/src/alpha.md",
            fullPath: "/Users/marila/projects/lalaclaw/src/alpha.md",
            primaryAction: "modified",
          },
        ]}
        preview={{
          kind: "pdf",
          name: "report.pdf",
          path: "/Users/marila/projects/lalaclaw/report.pdf",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
        }}
        onClose={() => {}}
        onOpenFilePreview={onOpenFilePreview}
      />,
    );

    const sidebar = screen.getByTestId("file-preview-files-sidebar");
    expect(sidebar).toBeInTheDocument();
    expect(within(sidebar).getByText(/Session files|本次会话文件/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(sidebar).getByTitle("/Users/marila/projects/lalaclaw/src/alpha.md"));

    expect(onOpenFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/Users/marila/projects/lalaclaw/src/alpha.md",
      }),
    );
  });

  it("lets fullscreen pdf previews use the full available height", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "pdf",
          name: "report.pdf",
          path: "/Users/marila/projects/lalaclaw/report.pdf",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Expand preview|铺满预览窗/));

    expect(screen.getByTitle("report.pdf")).toHaveClass("h-full");
  });

  it("shows a tooltip for the expand preview button", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "pdf",
          name: "report.pdf",
          path: "/Users/marila/projects/lalaclaw/report.pdf",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: /Expand preview|铺满预览窗/ }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Expand preview|铺满预览窗/);
  });

  it("persists the expanded preview preference across reopen", async () => {
    const preview = {
      kind: "pdf",
      name: "report.pdf",
      path: "/Users/marila/projects/lalaclaw/report.pdf",
      contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
    };
    const user = userEvent.setup();

    const { unmount } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={preview}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Expand preview|铺满预览窗/ }));
    expect(window.localStorage.getItem("file-preview-expanded")).toBe("true");
    expect(screen.getByTitle("report.pdf")).toHaveClass("h-full");

    unmount();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={preview}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /Restore preview|还原预览窗/ })).toBeInTheDocument();
    expect(screen.getByTitle("report.pdf")).toHaveClass("h-full");
  });

  it("keeps padding around fullscreen code previews", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Expand preview|铺满预览窗/ }));

    expect(screen.getByTestId("file-preview-code-block").parentElement).toHaveClass("h-full", "px-6", "py-5");
  });

  it("uses a dark shell for pdf previews in dark mode", () => {
    const { container } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "pdf",
          name: "report.pdf",
          path: "/Users/marila/projects/lalaclaw/report.pdf",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Freport.pdf",
        }}
        resolvedTheme="dark"
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const iframe = screen.getByTitle("report.pdf");
    expect(iframe).toHaveClass("block", "bg-transparent");
    expect(iframe.parentElement).toHaveClass("bg-[#111318]", "border-white/8");
    expect(container).toBeTruthy();
  });

  it("uses shell-consistent toolbar controls for file previews in light mode", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "notes.txt",
          path: "/Users/marila/projects/lalaclaw/notes.txt",
          content: "plain preview",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /Expand preview|铺满预览窗/ })).toHaveClass("border-border/70", "bg-[var(--surface)]");
    expect(screen.getByRole("button", { name: /Close preview|关闭预览/ })).toHaveClass("border-border/70", "bg-[var(--surface)]");
  });

  it("renders markdown front matter as a separate yaml block", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: `---\nname: prepare-release-notes\ndescription: 整理版本发布说明并生成摘要\nuser-invocable: true\n---\n\n# 发布说明\n\n生成本次版本的发布说明预览。`,
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByText("Front Matter")).toBeInTheDocument();
    expect(screen.getByText("yaml")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("name: prepare-release-notes");
    expect(document.querySelector("pre")?.textContent).toContain("description: 整理版本发布说明并生成摘要");
  });

  it("lets markdown previews change font size and keeps the last selected size", async () => {
    const preview = {
      kind: "markdown",
      name: "publish.md",
      path: "/Users/marila/projects/lalaclaw/publish.md",
      content: "# 发布说明\n\n生成本次版本的发布说明预览。\n\n- 第一项\n- 第二项",
    };
    const user = userEvent.setup();

    const { unmount } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={preview}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const content = screen.getByTestId("markdown-preview-content");
    expect(content.firstChild).toHaveClass("text-[14px]", "leading-6", "[&_p]:!leading-6", "[&_ul]:!my-2");

    await user.click(screen.getByLabelText(/Preview font size: Large|预览字号：大/));

    expect(content.firstChild).toHaveClass("text-[16px]", "leading-7", "[&_p]:!leading-7", "[&_ul]:!my-2.5");
    expect(window.localStorage.getItem("file-preview-font-size")).toBe("large");

    unmount();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={preview}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("markdown-preview-content").firstChild).toHaveClass("text-[16px]", "leading-7", "[&_p]:!leading-7", "[&_ul]:!my-2.5");
  });

  it("shows a markdown outline popover from the toolbar", async () => {
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "physics.md",
          path: "/Users/marila/projects/lalaclaw/physics.md",
          content: "# 物理公式汇总\n\n## 力学\n\n内容\n\n## 电学\n\n更多内容",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Show document outline|查看文档大纲/ }));

    const popover = screen.getByTestId("file-preview-markdown-outline-popover");
    expect(within(popover).getByText(/Outline|大纲/)).toBeInTheDocument();
    expect(within(popover).getByRole("button", { name: "物理公式汇总" })).not.toHaveClass("font-extrabold");
    expect(within(popover).getByRole("button", { name: "力学" })).toHaveClass("font-extrabold", "text-[13px]", "pl-3");
    expect(within(popover).getByRole("button", { name: "电学" })).toBeInTheDocument();
  });

  it("scrolls the markdown preview to the selected outline heading", async () => {
    const user = userEvent.setup();
    const { container } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "physics.md",
          path: "/Users/marila/projects/lalaclaw/physics.md",
          content: "# 物理公式汇总\n\n## 力学\n\n内容\n\n## 电学\n\n更多内容",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const heading = await screen.findByRole("heading", { name: "力学" });
    const viewport = container.querySelector("[data-radix-scroll-area-viewport]");
    expect(viewport).toBeTruthy();
    viewport.scrollTop = 240;
    viewport.scrollTo = vi.fn();
    viewport.getBoundingClientRect = () => ({
      top: 100,
      bottom: 700,
      left: 0,
      right: 900,
      width: 900,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    heading.getBoundingClientRect = () => ({
      top: 420,
      bottom: 460,
      left: 0,
      right: 600,
      width: 600,
      height: 40,
      x: 0,
      y: 420,
      toJSON: () => ({}),
    });

    await user.click(screen.getByRole("button", { name: /Show document outline|查看文档大纲/ }));
    await user.click(within(screen.getByTestId("file-preview-markdown-outline-popover")).getByRole("button", { name: "力学" }));

    expect(viewport.scrollTo).toHaveBeenCalledWith({
      top: 548,
      behavior: "smooth",
    });
    await waitFor(() => {
      expect(screen.queryByTestId("file-preview-markdown-outline-popover")).not.toBeInTheDocument();
    });
  });

  it("shows a markdown annotation toolbar button and enters annotation mode", async () => {
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={vi.fn()}
      />,
    );

    await user.hover(screen.getByRole("button", { name: /批注更新|Annotate/ }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/对内容进行批注|Annotate the content/);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/快捷键：A|Shortcut: A/);

    await user.click(screen.getByRole("button", { name: /批注更新|Annotate/ }));

    expect(screen.getByTestId("markdown-preview-annotation-workbench")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /取消批注|Cancel annotation/ })).toBeInTheDocument();
  });

  it("passes the selected preview font size into markdown annotation mode", async () => {
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/Preview font size: Large|预览字号：大/));
    await user.click(screen.getByRole("button", { name: /批注更新|Annotate/ }));

    expect(screen.getByTestId("markdown-preview-annotation-workbench")).toHaveAttribute("data-font-size", "large");
  });

  it("supports the A shortcut for toggling markdown annotation mode", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "a", code: "KeyA" });
    expect(screen.getByTestId("markdown-preview-annotation-workbench")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "a", code: "KeyA" });
    expect(screen.queryByTestId("markdown-preview-annotation-workbench")).not.toBeInTheDocument();
  });

  it("asks for confirmation before discarding pending markdown annotations", async () => {
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /批注更新|Annotate/ }));
    await user.click(screen.getByTestId("markdown-annotation-mark-draft"));
    await user.click(screen.getByRole("button", { name: /取消批注|Cancel annotation/ }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(/放弃当前批注|Discard current annotations/);

    await user.click(screen.getByRole("button", { name: /放弃批注|Discard annotations/ }));

    expect(screen.queryByTestId("markdown-preview-annotation-workbench")).not.toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("asks for confirmation before Escape closes a clean annotation session", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={onClose}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /批注更新|Annotate/ }));
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /Close this preview\?|确认关闭预览？/ });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Close preview|关闭预览/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the annotation prompt directly and closes the preview on success", async () => {
    const onClose = vi.fn();
    const onSendPreparedPrompt = vi.fn(async () => {});
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={onClose}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={onSendPreparedPrompt}
      />,
    );

    await user.click(screen.getByRole("button", { name: /批注更新|Annotate/ }));
    await user.click(screen.getByTestId("markdown-annotation-submit"));

    await waitFor(() => {
      expect(onSendPreparedPrompt).toHaveBeenCalledWith(
        "修改 /Users/marila/projects/lalaclaw/annotate.md 文件：\n第 2 行：有限公司 → 科技有限公司",
        { shouldAppendPromptHistory: true },
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes the preview immediately after dispatching an annotation prompt without waiting for the full chat turn", async () => {
    const onClose = vi.fn();
    let resolveSend;
    const onSendPreparedPrompt = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "annotate.md",
          path: "/Users/marila/projects/lalaclaw/annotate.md",
          content: "# Title\n\nBody text",
        }}
        onClose={onClose}
        onOpenFilePreview={() => {}}
        onSendPreparedPrompt={onSendPreparedPrompt}
      />,
    );

    await user.click(screen.getByRole("button", { name: /批注更新|Annotate/ }));
    await user.click(screen.getByTestId("markdown-annotation-submit"));

    expect(onSendPreparedPrompt).toHaveBeenCalledWith(
      "修改 /Users/marila/projects/lalaclaw/annotate.md 文件：\n第 2 行：有限公司 → 科技有限公司",
      { shouldAppendPromptHistory: true },
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    resolveSend?.();
  });

  it("keeps markdown preview content constrained inside the main panel", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "wide.md",
          path: "/Users/marila/projects/lalaclaw/wide.md",
          content: "# Wide\n\n| A | B |\n| --- | --- |\n| very-long-content | another-very-long-content |",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const content = screen.getByTestId("markdown-preview-content");
    expect(content).toHaveClass("min-w-0", "max-w-full", "overflow-x-auto");
    expect(content.firstChild).toHaveClass("min-w-0", "max-w-full");
  });

  it("shows the same persisted font size controls for text previews", async () => {
    window.localStorage.setItem("file-preview-font-size", "large");

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "notes.txt",
          path: "/Users/marila/projects/lalaclaw/notes.txt",
          content: "plain preview",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByLabelText(/Preview font size: Large|预览字号：大/)).toBeInTheDocument();
    expect(screen.getByText("plain preview").closest("pre")).toHaveClass("text-[16px]", "leading-7");
  });

  it("keeps long code preview lines inside the main panel without widening the layout", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        sessionFiles={[
          {
            path: "/Users/marila/projects/lalaclaw/src/alpha.js",
            fullPath: "/Users/marila/projects/lalaclaw/src/alpha.js",
            primaryAction: "modified",
          },
        ]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: `const digest = "${"x".repeat(500)}";\n`,
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("file-preview-files-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("file-preview-code-block")).toHaveClass("min-w-0", "max-w-full");
    expect(screen.getByTestId("file-preview-code-scroll")).toHaveClass("min-w-0", "w-full", "max-w-full", "overflow-auto");
    expect(document.querySelector(".token-line")).toHaveClass("block", "min-w-max");
  });

  it("uses an explicit constrained main column when the files sidebar is visible", () => {
    const { container } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        sessionFiles={[
          {
            path: "/Users/marila/projects/lalaclaw/src/alpha.md",
            fullPath: "/Users/marila/projects/lalaclaw/src/alpha.md",
            primaryAction: "modified",
          },
        ]}
        preview={{
          kind: "markdown",
          name: "wide.md",
          path: "/Users/marila/projects/lalaclaw/wide.md",
          content: "---\nname: nano-banana\nveryLongValue: " + "x".repeat(400) + "\n---\n\n```bash\n" + "x".repeat(400) + "\n```",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("file-preview-main-column")).toHaveClass("min-w-0", "w-full", "overflow-hidden");
    expect(screen.getByTestId("file-preview-files-sidebar")).toBeInTheDocument();
    expect(container.querySelector("[data-radix-scroll-area-viewport]")).toHaveClass("[&>div]:!block", "[&>div]:!w-full", "[&>div]:!min-w-0", "[&>div]:!max-w-full");
  });

  it("uses a light code preview surface and syntax theme in light mode", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "json",
          name: "config.json",
          path: "/Users/marila/projects/lalaclaw/config.json",
          content: '{\n  "enabled": true\n}',
        }}
        resolvedTheme="light"
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("file-preview-code-block")).toHaveClass("border-slate-200", "bg-[#f6f8fb]");
    expect(screen.getByTestId("file-preview-code-header")).toHaveClass("bg-white/88", "text-slate-500");
    expect(screen.getByTestId("file-preview-code-scroll")).toHaveClass("text-slate-900");
  });

  it("renders csh files with the code preview pipeline", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "activate.csh",
          path: "/Users/marila/projects/lalaclaw/activate.csh",
          content: "setenv VIRTUAL_ENV /tmp/demo\nsource bin/activate.csh\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("file-preview-code-block")).toBeInTheDocument();
    expect(screen.getByTestId("file-preview-code-header")).toHaveTextContent("bash");
  });

  it("renders cfg files with the code preview pipeline", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "pyvenv.cfg",
          path: "/Users/marila/projects/lalaclaw/pyvenv.cfg",
          content: "home = /opt/homebrew/bin/python3\ninclude-system-site-packages = false\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("file-preview-code-block")).toBeInTheDocument();
    expect(screen.getByTestId("file-preview-code-header")).toHaveTextContent("ini");
  });

  it("renders extensionless python shebang files with the code preview pipeline", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "numpy-config",
          path: "/Users/marila/projects/lalaclaw/numpy-config",
          content: "#!/Users/marila/.openclaw/workspace/tmp/asr_work/venv/bin/python3.14\nimport sys\nfrom numpy._configtool import main\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByTestId("file-preview-code-block")).toBeInTheDocument();
    expect(screen.getByTestId("file-preview-code-header")).toHaveTextContent("python");
  });

  it("keeps toml table tokens inline inside a single preview line", () => {
    const { container } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "uv.lock",
          path: "/Users/marila/projects/lalaclaw/uv.lock",
          content: "version = 1\n\n[[package]]\nname = \"workspace\"\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const tableLine = Array.from(container.querySelectorAll(".token-line")).find((node) => node.textContent === "[[package]]");
    expect(tableLine).toBeTruthy();
    expect(tableLine).toHaveClass("whitespace-pre");

    const tokenSpans = tableLine?.querySelectorAll("span") || [];
    expect(tokenSpans.length).toBeGreaterThan(0);
    tokenSpans.forEach((token) => {
      expect(token).toHaveStyle({ display: "inline" });
    });
  });

  it("returns markdown previews to preview mode after clicking save and shows a success notice", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    expect(editor).toHaveAttribute("data-language", "markdown");
    await user.clear(editor);
    await user.type(editor, "# After{enter}{enter}Saved in preview");
    await user.click(screen.getByRole("button", { name: /Save|保存/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/file-preview/save",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/file-preview/save",
      expect.objectContaining({
        body: JSON.stringify({
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# After\n\nSaved in preview",
        }),
      }),
    );
    await waitFor(() => {
      expect(screen.queryByTestId("file-preview-monaco-editor")).not.toBeInTheDocument();
      expect(screen.getByText("After")).toBeInTheDocument();
      expect(screen.getByText("Saved in preview")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/Saved successfully\.|保存成功/);
    });
  });

  it("starts editing near the same scroll position as the preview", async () => {
    const user = userEvent.setup();
    const markdownContent = Array.from({ length: 120 }, (_, index) => `- 第 ${index + 1} 行`).join("\n");
    const { container } = renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: `# 标题\n\n${markdownContent}`,
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const viewport = container.querySelector("[data-radix-scroll-area-viewport]");
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1600 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    viewport.scrollTop = 600;

    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    await waitFor(() => {
      expect(editor.scrollTop).toBe(500);
    });
  });

  it("uses Cmd+S on Apple platforms to save while staying in editing mode", async () => {
    mockNavigatorPlatform("MacIntel");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    await user.clear(editor);
    await user.type(editor, "# After");
    fireEvent.keyDown(window, {
      key: "s",
      code: "KeyS",
      metaKey: true,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("file-preview-monaco-editor")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Saved successfully\.|保存成功/);
  });

  it("uses Ctrl+S on non-Apple platforms to save while staying in editing mode", async () => {
    mockNavigatorPlatform("Win32");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    await user.clear(editor);
    await user.type(editor, "# After");
    fireEvent.keyDown(window, {
      key: "s",
      code: "KeyS",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("file-preview-monaco-editor")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Saved successfully\.|保存成功/);
  });

  it("shows the edit shortcut in the tooltip using the active platform label", async () => {
    mockNavigatorPlatform("Win32");

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: /Edit|编辑/ }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Shortcut: E|快捷键：E/);
  });

  it("uses E to start editing from preview mode", async () => {
    mockNavigatorPlatform("MacIntel");

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    fireEvent.keyDown(window, {
      key: "e",
      code: "KeyE",
    });

    expect(await screen.findByTestId("file-preview-monaco-editor")).toBeInTheDocument();
  });

  it("does not insert E into the editor when the edit shortcut opens it", async () => {
    mockNavigatorPlatform("MacIntel");

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    fireEvent.keyDown(window, {
      key: "e",
      code: "KeyE",
    });

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    await waitFor(() => expect(editor).toHaveFocus());
    expect(editor).toHaveValue("# Before\n\nPreview body");
  });

  it("does not trigger preview editing from an already editable field", async () => {
    mockNavigatorPlatform("Win32");

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "publish.md",
          path: "/Users/marila/projects/lalaclaw/publish.md",
          content: "# Before\n\nPreview body",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(window, {
      key: "e",
      code: "KeyE",
    });

    expect(screen.queryByTestId("file-preview-monaco-editor")).not.toBeInTheDocument();
    input.remove();
  });

  it("shows the inspector files sidebar for previewable files and opens files from it", async () => {
    const onOpenFilePreview = vi.fn();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        sessionFiles={[
          {
            path: "/Users/marila/projects/lalaclaw/src/alpha.js",
            fullPath: "/Users/marila/projects/lalaclaw/src/alpha.js",
            primaryAction: "modified",
          },
          {
            path: "/Users/marila/projects/lalaclaw/src/beta.js",
            fullPath: "/Users/marila/projects/lalaclaw/src/beta.js",
            primaryAction: "modified",
          },
        ]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={onOpenFilePreview}
      />,
    );

    const sidebar = screen.getByTestId("file-preview-files-sidebar");
    expect(sidebar).toHaveAttribute("aria-label", "Files");
    expect(within(sidebar).getByText(/Session files|本次会话文件/)).toBeInTheDocument();
    const sidebarViewport = sidebar.querySelector("[data-radix-scroll-area-viewport]");
    expect(sidebarViewport).toBeInTheDocument();
    expect(sidebarViewport).toHaveClass("h-full");

    const user = userEvent.setup();
    await user.click(within(sidebar).getByTitle("/Users/marila/projects/lalaclaw/src/alpha.js"));

    expect(onOpenFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/Users/marila/projects/lalaclaw/src/alpha.js",
      }),
    );
  });

  it("keeps non-editable files selectable in the preview sidebar before editing starts", async () => {
    const onOpenFilePreview = vi.fn();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        sessionFiles={[
          {
            path: "/Users/marila/projects/lalaclaw/src/demo.pdf",
            fullPath: "/Users/marila/projects/lalaclaw/src/demo.pdf",
            primaryAction: "viewed",
          },
        ]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={onOpenFilePreview}
      />,
    );

    const user = userEvent.setup();
    const disabledFile = within(screen.getByTestId("file-preview-files-sidebar")).getByTitle("/Users/marila/projects/lalaclaw/src/demo.pdf");
    const tooltipText = /This file type can't be selected while editing\.|编辑时无法选择此类文件/;

    expect(disabledFile).toHaveAttribute("aria-disabled", "false");

    await user.hover(disabledFile.parentElement || disabledFile);

    expect(screen.queryByText(tooltipText, { selector: "[data-side]" })).not.toBeInTheDocument();

    await user.click(disabledFile);

    expect(onOpenFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/Users/marila/projects/lalaclaw/src/demo.pdf",
      }),
    );
  });

  it("disables non-editable files in the preview sidebar and shows a tooltip while editing", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        sessionFiles={[
          {
            path: "/Users/marila/projects/lalaclaw/src/demo.pdf",
            fullPath: "/Users/marila/projects/lalaclaw/src/demo.pdf",
            primaryAction: "viewed",
          },
        ]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const disabledFile = within(screen.getByTestId("file-preview-files-sidebar")).getByTitle("/Users/marila/projects/lalaclaw/src/demo.pdf");
    const tooltipText = /This file type can't be selected while editing\.|编辑时无法选择此类文件/;

    expect(disabledFile).toHaveAttribute("aria-disabled", "true");

    await user.hover(disabledFile.parentElement || disabledFile);

    expect(await screen.findByText(tooltipText, { selector: "[data-side]" })).toBeInTheDocument();

    await user.unhover(disabledFile.parentElement || disabledFile);

    await waitFor(() => {
      expect(screen.queryByText(tooltipText, { selector: "[data-side]" })).not.toBeInTheDocument();
    });
  });

  it("uses Monaco for code-like text previews and lets cancel restore the original content", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    expect(editor).toHaveAttribute("data-language", "javascript");
    await user.clear(editor);
    await user.type(editor, "const after = true;");
    await user.click(screen.getByRole("button", { name: /Cancel|取消/ }));
    await user.click(screen.getByRole("button", { name: /Discard edits|放弃修改/ }));

    expect(screen.queryByTestId("file-preview-monaco-editor")).not.toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("const before = true;");
  });

  it("asks for confirmation before canceling editing after the content was changed", async () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    await user.clear(editor);
    await user.type(editor, "const after = true;");
    await user.click(screen.getByRole("button", { name: /Cancel|取消/ }));

    expect(screen.getByRole("alertdialog", { name: /Discard edits\?|确认放弃当前编辑？/ })).toBeInTheDocument();
    expect(screen.getByTestId("file-preview-monaco-editor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Discard edits|放弃修改/ }));

    expect(screen.queryByTestId("file-preview-monaco-editor")).not.toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("const before = true;");
  });

  it("asks for confirmation before closing the preview after the content was changed", async () => {
    const onClose = vi.fn();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={onClose}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));

    const editor = await screen.findByTestId("file-preview-monaco-editor");
    await user.type(editor, "// changed");
    await user.click(screen.getByRole("button", { name: /Close preview|关闭预览/ }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: /Discard edits and close preview\?|确认放弃当前编辑并关闭预览？/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Discard and close|放弃并关闭/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before Escape closes the preview while editing even without dirty changes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "server.js",
          path: "/Users/marila/projects/lalaclaw/server.js",
          content: "const before = true;\n",
        }}
        onClose={onClose}
        onOpenFilePreview={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));
    await screen.findByTestId("file-preview-monaco-editor");
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /Close this preview\?|确认关闭预览？/ });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Close preview|关闭预览/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps oversized text previews read-only to avoid saving truncated content", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "text",
          name: "large.log",
          path: "/Users/marila/projects/lalaclaw/large.log",
          content: "partial content",
          truncated: true,
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText(/This file is too large to edit here\. Only the first 1 MB is shown\.|文件过大，无法在这里直接编辑。当前只显示前 1 MB 内容。/)).toBeInTheDocument();
  });

  it("shows a restart hint when the running backend has not picked up the save route yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 405,
        json: async () => ({ error: "Method not allowed" }),
      })),
    );

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "markdown",
          name: "AGENTS.md",
          path: "/Users/marila/.openclaw/workspace-writer/AGENTS.md",
          content: "# Agents\n",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Edit|编辑/ }));
    await user.click(screen.getByRole("button", { name: /Save|保存/ }));

    expect(await screen.findByText(/This running backend does not support inline save yet\. Restart LalaClaw or the backend service, then try again\.|当前正在运行的后端还不支持在线保存。请重启 LalaClaw 或后端服务后再试。/)).toBeInTheDocument();
  });

  it("renders docx previews with docx-preview", async () => {
    renderAsyncMock.mockImplementation(async (_buffer, container) => {
      container.innerHTML = "<p>Rendered DOCX preview</p>";
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([0x50, 0x4b]).buffer,
      })),
    );

    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "docx",
          name: "notes.docx",
          path: "/Users/marila/projects/lalaclaw/notes.docx",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fnotes.docx",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    await waitFor(() => {
      expect(renderAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Rendered DOCX preview")).toBeInTheDocument();
    expect(screen.getByTestId("docx-preview-content")).toBeInTheDocument();
  });

  it("shows current and total duration for audio previews even when duration becomes available after metadata", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "audio",
          name: "sample.wav",
          path: "/Users/marila/projects/lalaclaw/sample.wav",
          contentUrl: "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fsample.wav",
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    const audio = document.querySelector("audio");
    expect(audio).toBeTruthy();

    Object.defineProperty(audio, "duration", { configurable: true, value: 0 });
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 0 });
    fireEvent.loadedMetadata(audio);

    expect(screen.getByTestId("audio-preview-timestamps")).toHaveTextContent("0:00 / 0:00");

    Object.defineProperty(audio, "duration", { configurable: true, value: 65 });
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 3 });
    fireEvent.timeUpdate(audio);

    expect(screen.getByTestId("audio-preview-timestamps")).toHaveTextContent("0:03 / 1:05");

    Object.defineProperty(audio, "currentTime", { configurable: true, value: 12 });
    fireEvent.timeUpdate(audio);

    expect(screen.getByTestId("audio-preview-timestamps")).toHaveTextContent("0:12 / 1:05");
  });

  it("renders csv previews as a table", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "spreadsheet",
          name: "report.csv",
          path: "/Users/marila/projects/lalaclaw/report.csv",
          spreadsheet: {
            sheetName: "report.csv",
            rows: [
              ["name", "score"],
              ["alice", "95"],
              ["bob", "88"],
            ],
            totalRows: 3,
            totalColumns: 2,
            truncatedRows: false,
            truncatedColumns: false,
          },
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByText((_, element) => element?.textContent === "Sheet: report.csv")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
  });

  it("shows spreadsheet truncation copy when rows or columns are clipped", () => {
    renderPreview(
      <FilePreviewOverlay
        files={[]}
        preview={{
          kind: "spreadsheet",
          name: "report.xlsx",
          path: "/Users/marila/projects/lalaclaw/report.xlsx",
          spreadsheet: {
            sheetName: "Summary",
            rows: [["name", "score"]],
            totalRows: 300,
            totalColumns: 80,
            truncatedRows: true,
            truncatedColumns: true,
          },
        }}
        onClose={() => {}}
        onOpenFilePreview={() => {}}
      />,
    );

    expect(screen.getByText("Showing the first 200 rows and 50 columns.")).toBeInTheDocument();
  });

  it("lets zoomed preview images be dragged to inspect off-screen areas", async () => {
    renderPreview(
      <ImagePreviewOverlay
        image={{
          src: "https://example.com/demo.png",
          alt: "示例图",
        }}
        onClose={() => {}}
      />,
    );

    const user = userEvent.setup();
    const previewImage = screen.getByAltText("示例图");
    previewImage.setPointerCapture = () => {};
    previewImage.releasePointerCapture = () => {};
    previewImage.hasPointerCapture = () => true;
    Object.defineProperty(previewImage, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(previewImage, "offsetHeight", { configurable: true, value: 300 });

    await user.click(screen.getByLabelText(/Zoom in|放大图片/));
    expect(previewImage.style.transform).toContain("scale(1.25)");

    fireEvent.pointerDown(previewImage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(previewImage, { pointerId: 1, clientX: 140, clientY: 130 });
    fireEvent.pointerUp(previewImage, { pointerId: 1, clientX: 140, clientY: 130 });

    expect(previewImage.style.transform).toContain("translate(40px, 30px)");
    expect(previewImage.style.transform).toContain("scale(1.25)");
  });

  it("supports image preview keyboard shortcuts and blocks them from typing into the focused input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      })),
    );

    renderPreview(
      <div>
        <textarea aria-label="underlay input" />
        <ImagePreviewOverlay
          image={{
            src: "https://example.com/demo.png",
            alt: "示例图",
            path: "/Users/marila/projects/lalaclaw/demo.png",
            fileManagerLabel: "Finder",
          }}
          onClose={() => {}}
        />
      </div>,
    );

    const user = userEvent.setup();
    const previewImage = screen.getByAltText("示例图");
    const input = screen.getByRole("textbox", { name: "underlay input" });
    previewImage.setPointerCapture = () => {};
    previewImage.releasePointerCapture = () => {};
    previewImage.hasPointerCapture = () => true;
    Object.defineProperty(previewImage, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(previewImage, "offsetHeight", { configurable: true, value: 300 });

    input.focus();

    await user.keyboard("q");
    expect(previewImage.style.transform).toContain("rotate(-90deg)");
    expect(input).toHaveValue("");

    await user.keyboard("w");
    expect(previewImage.style.transform).toContain("rotate(0deg)");
    expect(input).toHaveValue("");

    await user.keyboard("=");
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(input).toHaveValue("");

    await user.keyboard("{Shift>}{=}{/Shift}");
    expect(screen.getByText("150%")).toBeInTheDocument();
    expect(input).toHaveValue("");

    await user.keyboard("-");
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(input).toHaveValue("");

    await user.keyboard("0");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(input).toHaveValue("");

    await user.keyboard("o");
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/file-manager/reveal",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/Users/marila/projects/lalaclaw/demo.png" }),
        }),
      );
    });
    expect(input).toHaveValue("");
  });

  it("shows image preview shortcut hints inside toolbar tooltips", async () => {
    renderPreview(
      <ImagePreviewOverlay
        image={{
          src: "https://example.com/demo.png",
          alt: "示例图",
          path: "/Users/marila/projects/lalaclaw/demo.png",
          fileManagerLabel: "Finder",
        }}
        onClose={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByLabelText(/放大图片|Zoom in/));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/快捷键：=\/\+|Shortcut: =\/\+/);
  });

  it("shows the rotate-left shortcut inside the image toolbar tooltip", async () => {
    renderPreview(
      <ImagePreviewOverlay
        image={{
          src: "https://example.com/demo.png",
          alt: "示例图",
        }}
        onClose={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByLabelText(/向左旋转|Rotate left/));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/快捷键：Q|Shortcut: Q/);
  });
});
