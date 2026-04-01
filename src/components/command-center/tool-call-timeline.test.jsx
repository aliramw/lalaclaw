import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useI18n, I18nProvider, localeStorageKey } from "@/lib/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";

function Harness() {
  const { messages } = useI18n();

  return (
    <ToolCallTimeline
      messages={{
        ...messages,
        inspector: {
          ...messages.inspector,
          timeline: {
            collapse: messages.inspector.timeline.collapse,
            expand: messages.inspector.timeline.expand,
            input: messages.inspector.timeline.input,
            output: messages.inspector.timeline.output,
            none: messages.inspector.timeline.none,
            noOutput: messages.inspector.timeline.noOutput,
          },
        },
      }}
      tools={[
        {
          id: "tool-edit",
          name: "edit_file",
          status: "完成",
          input: "{}",
          output: "ok",
          timestamp: 2000,
        },
        {
          id: "tool-gateway",
          name: "gateway",
          status: "完成",
          input: '{"action":"latest"}',
          output: "newest",
          timestamp: 1000,
        },
      ]}
    />
  );
}

function renderWithProviders(node) {
  window.localStorage.setItem(localeStorageKey, "zh");

  return render(
    <I18nProvider>
      <TooltipProvider delayDuration={0}>{node}</TooltipProvider>
    </I18nProvider>,
  );
}

describe("ToolCallTimeline", () => {
  it("keeps sibling tool cards visible when one card is collapsed", async () => {
    renderWithProviders(<Harness />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "edit_file 收起详情" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gateway 收起详情" })).toBeInTheDocument();
    expect(screen.getAllByText("输入").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "edit_file 收起详情" }));

    expect(screen.getByRole("button", { name: "edit_file 查看详情" })).toBeInTheDocument();
    const gatewayCard = screen.getByRole("button", { name: "gateway 收起详情" }).closest(".space-y-3");
    expect(gatewayCard).not.toBeNull();
    expect(within(gatewayCard).getByText("输入")).toBeInTheDocument();
  });
});
