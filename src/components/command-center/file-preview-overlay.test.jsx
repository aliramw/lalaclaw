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
    expect(screen.getByTestId("file-preview-code-scroll")).toHaveClass("min-w-0", "max-w-full", "overflow-auto");
    expect(document.querySelector(".token-line")).toHaveClass("w-fit", "min-w-full");
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

  it("shows the inspector files sidebar for editable previews and opens files from it", async () => {
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
      { startInEditMode: true },
    );
  });

  it("disables non-editable files in the preview sidebar and shows a tooltip", async () => {
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
    const disabledFile = within(screen.getByTestId("file-preview-files-sidebar")).getByTitle("/Users/marila/projects/lalaclaw/src/demo.pdf");

    expect(disabledFile).toHaveAttribute("aria-disabled", "true");

    await user.hover(disabledFile.parentElement || disabledFile);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(/This file type can't be selected while editing\.|编辑时无法选择此类文件/);
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

    expect(screen.queryByTestId("file-preview-monaco-editor")).not.toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("const before = true;");
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
});
