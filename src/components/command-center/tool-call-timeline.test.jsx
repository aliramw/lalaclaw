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
      timeline: {
        runTitle: "执行",
      },
      relationships: {
        statuses: {
          running: "执行中",
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

  it("renders running tool badges in red to distinguish them from completed tools", () => {
    renderWithProviders(
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
        messages={{
          common: {},
          inspector: {
            timeline: { runTitle: "执行" },
            relationships: {
              statuses: {
                running: "执行中",
                completed: "已完成",
              },
            },
          },
        }}
        tools={[
          { id: "tool-running", name: "process", status: "执行中", input: '{"action":"poll"}', output: '{"ok":true}' },
          { id: "tool-done", name: "exec", status: "已完成", input: "{}", output: "ok" },
        ]}
      />,
    );

    expect(screen.getByText("执行中")).toHaveClass("bg-rose-50", "text-rose-700");
    expect(screen.getByText("已完成")).toHaveClass("bg-[var(--badge-success-bg)]", "text-[var(--badge-success-fg)]");
  });

  it("merges identical input and output payloads into a single execution block", () => {
    renderWithProviders(
      <ToolCallTimeline
        copyLabels={{ copy: "复制片段", copied: "已复制片段" }}
        labels={{
          collapse: "折叠卡片",
          expand: "展开卡片",
          input: "输入",
          output: "输出",
          none: "未提供",
          noOutput: "无输出可见",
        }}
        messages={{
          common: {},
          inspector: {
            timeline: { runTitle: "执行" },
            relationships: {
              statuses: {
                running: "执行中",
              },
            },
          },
        }}
        tools={[
          {
            id: "tool-process",
            name: "process",
            status: "执行中",
            input: '{\n  "action": "poll",\n  "sessionId": "tender-otter",\n  "timeout": 1000\n}',
            output: '{\n  "action": "poll",\n  "sessionId": "tender-otter",\n  "timeout": 1000\n}',
          },
        ]}
      />,
    );

    expect(screen.getByText("执行")).toBeInTheDocument();
    expect(screen.queryByText("输入")).not.toBeInTheDocument();
    expect(screen.queryByText("输出")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "复制片段" })).toHaveLength(1);
  });
});
