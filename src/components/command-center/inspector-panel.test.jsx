import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InspectorPanel } from "@/components/command-center/inspector-panel";

function TestHarness() {
  const [activeTab, setActiveTab] = useState("timeline");

  return (
    <InspectorPanel
      activeTab={activeTab}
      agents={[{ label: "main", detail: "主 Agent" }]}
      artifacts={[{ title: "交付结果", type: "assistant_output", detail: "生成完成" }]}
      files={[{ path: "src/App.jsx", kind: "文件" }]}
      peeks={{
        workspace: { summary: "工作区摘要", items: [{ label: "目录", value: "src" }] },
        terminal: null,
        browser: null,
      }}
      renderPeek={(section, fallback) =>
        section ? [section.summary, ...(section.items || []).map((item) => `${item.label}：${item.value}`)].join("\n") : fallback
      }
      setActiveTab={setActiveTab}
      snapshots={[{ title: "快照 1", detail: "完成" }]}
      taskTimeline={[
        {
          id: "run-1",
          title: "执行 10:00",
          prompt: "修复错误",
          status: "已完成",
          toolsSummary: "edit_file(完成)",
          tools: [{ id: "tool-1", name: "edit_file", status: "完成", input: "{}", output: "ok" }],
          files: [{ path: "src/App.jsx", kind: "文件", updatedLabel: "刚刚" }],
          snapshots: [{ id: "snap-1", title: "快照 1", detail: "完成" }],
          outcome: "处理完成",
        },
      ]}
    />
  );
}

describe("InspectorPanel", () => {
  it("renders timeline details and switches tabs", async () => {
    render(<TestHarness />);

    expect(screen.getByText("修复错误")).toBeInTheDocument();
    expect(screen.getByText("输入")).toBeInTheDocument();
    expect(screen.getByText("输出")).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent === "{}").length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, element) => element?.textContent === "ok").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("src/App.jsx").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("tab", { name: "文件" })).getByText("1")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "文件" }));
    expect(screen.getByRole("tab", { name: "文件" })).toHaveAttribute("data-state", "active");

    await user.click(screen.getByRole("tab", { name: "预览" }));
    expect(screen.getByText(/工作区摘要/)).toBeInTheDocument();
    expect(screen.getByText(/等待终端预览/)).toBeInTheDocument();
  });

  it("collapses timeline detail blocks on demand", async () => {
    render(<TestHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "收起详情" }));

    expect(screen.queryByText("输入")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看详情" })).toBeInTheDocument();
  });

  it("hides the files count badge when there are no files", () => {
    const [activeTab, setActiveTab] = ["timeline", () => {}];

    render(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        files={[]}
        peeks={{ workspace: null, terminal: null, browser: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        snapshots={[]}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByRole("tab", { name: "文件" })).toHaveTextContent(/^文件$/);
  });
});
