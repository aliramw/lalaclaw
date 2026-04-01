import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useI18n, I18nProvider, localeStorageKey } from "@/lib/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";

function Harness() {
  const { messages: i18nMessages } = useI18n();
  const messages = {
    common: i18nMessages.common,
    inspector: {
      relationships: {
        statuses: {
          completed: "完成",
        },
      },
    },
  };

  return (
    <ToolCallTimeline
      copyLabels={{ copy: "复制片段", copied: "已复制片段" }}
      labels={{
        collapse: "折叠卡片",
        expand: "展开卡片",
        input: "入参",
        output: "出参",
        none: "未提供",
        noOutput: "无输出可见",
      }}
      messages={messages}
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

    expect(screen.getByRole("button", { name: "edit_file 折叠卡片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gateway 折叠卡片" })).toBeInTheDocument();
    expect(screen.getAllByText("入参").length).toBeGreaterThan(0);

    const gatewayCard = screen.getByRole("button", { name: "gateway 折叠卡片" }).closest(".space-y-3");
    expect(gatewayCard).not.toBeNull();
    expect(within(gatewayCard).getAllByRole("button", { name: "复制片段" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "edit_file 折叠卡片" }));

    expect(screen.getByRole("button", { name: "edit_file 展开卡片" })).toBeInTheDocument();
    expect(within(gatewayCard).getByText("入参")).toBeInTheDocument();
  });
});
