import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { renderAsyncMock } = vi.hoisted(() => ({
  renderAsyncMock: vi.fn(),
}));

vi.mock("docx-preview", () => ({
  renderAsync: renderAsyncMock,
}));

import { FilePreviewOverlay, ImagePreviewOverlay } from "@/components/command-center/file-preview-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";

function renderPreview(node) {
  return render(
    <I18nProvider>
      <TooltipProvider delayDuration={0}>{node}</TooltipProvider>
    </I18nProvider>,
  );
}

describe("FilePreviewOverlay", () => {
  afterEach(() => {
    window.localStorage.removeItem("file-preview-font-size");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    await user.click(screen.getByLabelText(/Expand preview|最大化/));

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

    await user.click(screen.getByLabelText("Preview font size: Large"));

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

    expect(screen.getByLabelText("Preview font size: Large")).toBeInTheDocument();
    expect(screen.getByText("plain preview").closest("pre")).toHaveClass("text-[16px]", "leading-7");
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
