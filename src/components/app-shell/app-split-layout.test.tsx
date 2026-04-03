import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSplitLayout } from "@/components/app-shell/app-split-layout";

describe("AppSplitLayout", () => {
  it("keeps split panes structural instead of wrapping both sides in heavyweight stage cards", () => {
    const { container } = render(
      <AppSplitLayout
        chatPanel={<div data-testid="chat-panel">chat</div>}
        inspectorPanel={<div data-testid="inspector-panel">inspector</div>}
        isResizingPanels={false}
        isWideLayout={true}
        onResizeStart={vi.fn()}
        resizeLabel="resize"
        splitLayoutRef={createRef<HTMLElement | null>()}
        splitLayoutStyle={{}}
        taskRelationshipsPanel={<div data-testid="relationships-panel">relationships</div>}
      />,
    );

    const workspaceStage = container.querySelector(".cc-workspace-stage");
    const inspectorStage = container.querySelector(".cc-inspector-stage");

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-panel")).toBeInTheDocument();
    expect(screen.getByTestId("relationships-panel")).toBeInTheDocument();
    expect(workspaceStage).toBeInTheDocument();
    expect(inspectorStage).toBeInTheDocument();
    expect(workspaceStage).not.toHaveClass("rounded-[30px]");
    expect(workspaceStage).not.toHaveClass("border");
    expect(workspaceStage).not.toHaveClass("bg-[var(--surface-elevated)]");
    expect(workspaceStage).not.toHaveClass("p-2");
    expect(inspectorStage).not.toHaveClass("rounded-[28px]");
    expect(inspectorStage).not.toHaveClass("border");
    expect(inspectorStage).not.toHaveClass("bg-[var(--panel)]");
    expect(inspectorStage).not.toHaveClass("p-2");
  });

  it("uses one shared workspace shell so the split panes still read as a finished editor layout", () => {
    const { container } = render(
      <AppSplitLayout
        chatPanel={<div data-testid="chat-panel">chat</div>}
        inspectorPanel={<div data-testid="inspector-panel">inspector</div>}
        isResizingPanels={false}
        isWideLayout={true}
        onResizeStart={vi.fn()}
        resizeLabel="resize"
        splitLayoutRef={createRef<HTMLElement | null>()}
        splitLayoutStyle={{}}
        taskRelationshipsPanel={<div data-testid="relationships-panel">relationships</div>}
      />,
    );

    const workspaceShell = container.querySelector(".cc-workspace-layout-shell");

    expect(workspaceShell).toBeInTheDocument();
    expect(workspaceShell).toHaveClass("rounded-[24px]");
    expect(workspaceShell).toHaveClass("border");
    expect(workspaceShell).toHaveClass("bg-[var(--surface-elevated)]");
  });
});
