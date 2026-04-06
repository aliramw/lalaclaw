import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";

vi.mock("@/components/command-center/use-file-preview", () => ({
  useFilePreview: () => ({
    closeFilePreview: vi.fn(),
    closeImagePreview: vi.fn(),
    filePreview: {
      kind: "markdown",
      loading: false,
      name: "nemoClaw.md",
      path: "/Users/marila/.openclaw/workspace/nemoClaw.md",
    },
    handleOpenPreview: vi.fn(),
    imagePreview: null,
    openImagePreview: vi.fn(),
  }),
}));

vi.mock("@/components/command-center/file-preview-overlay", () => ({
  FilePreviewOverlay: function MockFilePreviewOverlay({ onSendPreparedPrompt }) {
    return (
      <button
        type="button"
        onClick={() => onSendPreparedPrompt?.("修改 /Users/marila/.openclaw/workspace/nemoClaw.md 文件：\n所有 NVIDIA → 英伟达")}
      >
        send annotation prompt
      </button>
    );
  },
  ImagePreviewOverlay: function MockImagePreviewOverlay() {
    return null;
  },
}));

function renderInspectorPanel(node) {
  return render(
    <I18nProvider>
      <TooltipProvider delayDuration={0}>{node}</TooltipProvider>
    </I18nProvider>,
  );
}

describe("InspectorPanel annotation prompt sending", () => {
  it("passes prepared prompt sending through to the file preview overlay", async () => {
    const onSendPreparedPrompt = vi.fn();
    const user = userEvent.setup();

    renderInspectorPanel(
      <InspectorPanel
        activeTab="files"
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="main"
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        onSendPreparedPrompt={onSendPreparedPrompt}
        peeks={{ workspace: { entries: [] } }}
        renderPeek={() => ""}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "send annotation prompt" }));

    expect(onSendPreparedPrompt).toHaveBeenCalledWith(
      "修改 /Users/marila/.openclaw/workspace/nemoClaw.md 文件：\n所有 NVIDIA → 英伟达",
    );
  });
});
