import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FilePreviewOverlay } from "@/components/command-center/file-preview-overlay";
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
});
