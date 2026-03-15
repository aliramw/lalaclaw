import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

function renderWithTooltip(node, locale = "zh") {
  window.localStorage.setItem(localeStorageKey, locale);
  return render(
    <I18nProvider>
      <TooltipProvider delayDuration={0}>{node}</TooltipProvider>
    </I18nProvider>,
  );
}

function mockResizeObserver(width) {
  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback([{ contentRect: { width } }]);
    }

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
}

function TestHarness() {
  const [activeTab, setActiveTab] = useState("timeline");

  return (
    <InspectorPanel
      activeTab={activeTab}
      artifacts={[{ title: "交付结果", type: "assistant_output", detail: "生成完成" }]}
      currentWorkspaceRoot="/Users/marila/.openclaw/workspace-writer"
      files={[{ path: "src/App.jsx", kind: "文件" }]}
      peeks={{
        environment: {
          summary: "这里列出 Gateway 与会话环境信息。",
          items: [{ label: "gateway.baseUrl", value: "http://127.0.0.1:18789" }],
        },
        workspace: { summary: "工作区摘要", items: [{ label: "目录", value: "src" }] },
        terminal: null,
        browser: null,
      }}
      renderPeek={(section, fallback) =>
        section ? [section.summary, ...(section.items || []).map((item) => `${item.label}：${item.value}`)].join("\n") : fallback
      }
      setActiveTab={setActiveTab}
      taskTimeline={[
        {
          id: "run-1",
          title: "执行 10:00",
          prompt: "修复错误",
          status: "已完成",
          toolsSummary: "edit_file(完成)",
          tools: [{ id: "tool-1", name: "edit_file", status: "完成", input: "{}", output: "ok" }],
          relationships: [{ id: "rel-1", type: "child_agent", sourceAgentId: "main", targetAgentId: "writer", detail: "draft-worker", status: "running" }],
          files: [{ path: "src/App.jsx", kind: "文件", updatedLabel: "刚刚" }],
          outcome: "处理完成",
        },
      ]}
    />
  );
}

describe("InspectorPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem(localeStorageKey);
  });

  it("renders timeline details and switches tabs", async () => {
    renderWithTooltip(<TestHarness />);

    expect(screen.getAllByRole("tab").slice(0, 3).map((tab) => tab.textContent)).toEqual(["文件1", "回复摘要", "运行记录"]);
    expect(screen.getByText("修复错误")).toBeInTheDocument();
    expect(screen.getByText("输入")).toBeInTheDocument();
    expect(screen.getByText("输出")).toBeInTheDocument();
    expect(screen.getByText("协同任务")).toBeInTheDocument();
    expect(screen.getByText("writer")).toBeInTheDocument();
    expect(screen.getByText("draft-worker")).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent === "{}").length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, element) => element?.textContent === "ok").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("src/App.jsx").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("tab", { name: "文件" })).getByText("1")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "文件" }));
    expect(screen.getByRole("tab", { name: "文件" })).toHaveAttribute("data-state", "active");

    expect(screen.getByRole("tab", { name: "环境" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "协作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "快照" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "环境" }));
    expect(screen.getByText("这里会列出 Gateway 与当前会话的环境信息，便于排查与检阅。")).toBeInTheDocument();
    expect(screen.getByText("gateway.baseUrl")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:18789")).toBeInTheDocument();
  });

  it("localizes timeline statuses and tool summaries for english UI", () => {
    renderWithTooltip(<TestHarness />, "en");

    expect(screen.getByRole("tab", { name: "Run Log" })).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Tools: edit_file(Completed)")).toBeInTheDocument();
  });

  it("localizes summary titles for english UI", () => {
    const [activeTab, setActiveTab] = ["artifacts", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        artifacts={[{ title: "回复 03/15 15:03", type: "assistant_output", detail: "生成完成", messageTimestamp: 123 }]}
        files={[]}
        onSelectArtifact={() => {}}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
      "en",
    );

    expect(screen.getByText("Reply 03/15 15:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jump to Reply 03/15 15:03" })).toBeInTheDocument();
  });

  it("routes artifact clicks back to the parent controller", async () => {
    const onSelectArtifact = vi.fn();
    const [activeTab, setActiveTab] = ["artifacts", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[{ title: "交付结果", type: "assistant_output", detail: "生成完成", messageTimestamp: 123 }]}
        files={[]}
        onSelectArtifact={onSelectArtifact}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "定位到 交付结果" }));

    expect(onSelectArtifact).toHaveBeenCalledWith(expect.objectContaining({ title: "交付结果", messageTimestamp: 123 }));
  });

  it("keeps the timeline tab inside its own scroll container", () => {
    renderWithTooltip(<TestHarness />);

    const timelinePanel = screen.getByText("修复错误").closest('[role="tabpanel"]');
    expect(timelinePanel).toHaveClass("flex-1", "min-h-0", "overflow-hidden");
    expect(screen.getByTestId("timeline-scroll-region")).toHaveClass("flex-1", "overflow-y-auto", "overscroll-contain");
  });

  it("collapses timeline detail blocks on demand", async () => {
    renderWithTooltip(<TestHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "收起详情" }));

    expect(screen.queryByText("输入")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看详情" })).toBeInTheDocument();
  });

  it("hides the files count badge when there are no files", () => {
    const [activeTab, setActiveTab] = ["timeline", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        files={[]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByRole("tab", { name: "文件" })).toHaveTextContent(/^文件$/);
  });

  it("collapses inspector tab labels down to icons when the panel gets narrow", () => {
    mockResizeObserver(360);
    const [activeTab, setActiveTab] = ["timeline", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        files={[{ path: "src/App.jsx", kind: "文件" }]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByRole("tab", { name: "文件" })).not.toHaveTextContent("文件");
    expect(screen.getByRole("tab", { name: "回复摘要" })).not.toHaveTextContent("回复摘要");
  });

  it("shows tooltips for inspector tabs when only icons are visible", async () => {
    mockResizeObserver(360);
    const [activeTab, setActiveTab] = ["timeline", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        files={[{ path: "src/App.jsx", kind: "文件" }]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByRole("tab", { name: "环境" }));

    expect(screen.getByTestId("inspector-tab-tooltip-environment")).toHaveTextContent("环境");
  });

  it("keeps the active tab highlighted in icon-only mode after click", async () => {
    mockResizeObserver(360);

    function ClickHarness() {
      const [activeTab, setActiveTab] = useState("timeline");

      return (
        <InspectorPanel
          activeTab={activeTab}
          agents={[]}
          artifacts={[]}
          files={[{ path: "src/App.jsx", kind: "文件" }]}
          peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
          renderPeek={(_, fallback) => fallback}
          setActiveTab={setActiveTab}
          taskTimeline={[]}
        />
      );
    }

    renderWithTooltip(<ClickHarness />);

    const user = userEvent.setup();
    const environmentTab = screen.getByRole("tab", { name: "环境" });

    await user.click(environmentTab);

    expect(environmentTab).toHaveAttribute("data-state", "active");
    expect(environmentTab).toHaveClass("bg-[#1677eb]", "text-white");
  });

  it("renders copy buttons for tool input and output headers", async () => {
    renderWithTooltip(<TestHarness />);

    const user = userEvent.setup();
    const copyButtons = screen.getAllByRole("button", { name: "复制代码" });
    expect(copyButtons).toHaveLength(2);
    await user.click(copyButtons[0]);
  });

  it("collapses individual tool cards inside the detail section", async () => {
    renderWithTooltip(<TestHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "edit_file 收起详情" }));

    expect(screen.queryByText("输入")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "edit_file 查看详情" })).toBeInTheDocument();
  });

  it("clips workspace-root paths in file displays while keeping external paths full", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace-writer"
        files={[
          { path: "/Users/marila/.openclaw/workspace-writer/TOOLS.md", fullPath: "/Users/marila/.openclaw/workspace-writer/TOOLS.md", kind: "文件", primaryAction: "viewed" },
          { path: "/Users/marila/projects/lalaclaw/src/App.jsx", fullPath: "/Users/marila/projects/lalaclaw/src/App.jsx", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByText("TOOLS.md")).toBeInTheDocument();
    expect(screen.getByText("~/projects/lalaclaw/src/App.jsx")).toBeInTheDocument();
  });

  it("sorts file groups alphabetically by display path", () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/zeta.md", fullPath: "/Users/marila/projects/lalaclaw/zeta.md", kind: "文件", primaryAction: "viewed" },
          { path: "/Users/marila/projects/lalaclaw/alpha.md", fullPath: "/Users/marila/projects/lalaclaw/alpha.md", kind: "文件", primaryAction: "viewed" },
          { path: "/Users/marila/projects/lalaclaw/folder/beta.md", fullPath: "/Users/marila/projects/lalaclaw/folder/beta.md", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const links = screen.getAllByTitle(/\/Users\/marila\/projects\/lalaclaw\//);
    expect(links.map((element) => element.textContent)).toEqual(["alpha.md", "folder/beta.md", "zeta.md"]);
  });

  it("supports collapsing file action groups", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/alpha.md", fullPath: "/Users/marila/projects/lalaclaw/alpha.md", kind: "文件", primaryAction: "created" },
          { path: "/Users/marila/projects/lalaclaw/beta.md", fullPath: "/Users/marila/projects/lalaclaw/beta.md", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByText("alpha.md")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "创建 收起详情" }));

    expect(screen.queryByText("alpha.md")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建 查看详情" })).toBeInTheDocument();
    expect(screen.getByText("beta.md")).toBeInTheDocument();
  });

  it("shows a lightweight files hint above the grouped file list", () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/alpha.md", fullPath: "/Users/marila/projects/lalaclaw/alpha.md", kind: "文件", primaryAction: "created" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByText("这里会列出本次会话 Agent 创建、修改与查看所有文件，方便你检阅")).toBeInTheDocument();
  });

  it("opens a full-screen markdown preview when clicking a file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "markdown",
          path: "/Users/marila/.openclaw/workspace-writer/TOOLS.md",
          name: "TOOLS.md",
          content: "# Title\n\nhello preview",
        }),
      })),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace-writer"
        files={[
          { path: "/Users/marila/.openclaw/workspace-writer/TOOLS.md", fullPath: "/Users/marila/.openclaw/workspace-writer/TOOLS.md", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "TOOLS.md" }));

    expect(await screen.findByText("hello preview")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("hello preview")).not.toBeInTheDocument();
  });

  it("renders code-like text previews with the same code block UI as json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "text",
          path: "/Users/marila/projects/lalaclaw/src/App.jsx",
          name: "App.jsx",
          content: "export default function App() { return null; }",
        }),
      })),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/src/App.jsx", fullPath: "/Users/marila/projects/lalaclaw/src/App.jsx", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "src/App.jsx" }));

    expect(await screen.findByText("jsx")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("export default function App() { return null; }");
  });

  it("renders lua text previews with lua syntax highlighting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "text",
          path: "/Users/marila/projects/lalaclaw/scripts/init.lua",
          name: "init.lua",
          content: "local answer = 42\nreturn answer\n",
        }),
      })),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/scripts/init.lua", fullPath: "/Users/marila/projects/lalaclaw/scripts/init.lua", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "scripts/init.lua" }));

    expect(await screen.findByText("lua")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("local answer = 42");
  });

  it.each([
    {
      label: "scripts/main.dart",
      path: "/Users/marila/projects/lalaclaw/scripts/main.dart",
      language: "dart",
      content: "void main() {\n  print('hi');\n}\n",
      expectedSnippet: "void main()",
    },
    {
      label: "lib/app.ex",
      path: "/Users/marila/projects/lalaclaw/lib/app.ex",
      language: "elixir",
      content: "defmodule App do\nend\n",
      expectedSnippet: "defmodule App do",
    },
    {
      label: "tools/build.pl",
      path: "/Users/marila/projects/lalaclaw/tools/build.pl",
      language: "perl",
      content: "my $value = 42;\nprint $value;\n",
      expectedSnippet: "my $value = 42;",
    },
    {
      label: "analysis/report.r",
      path: "/Users/marila/projects/lalaclaw/analysis/report.r",
      language: "r",
      content: "value <- 42\nprint(value)\n",
      expectedSnippet: "value <- 42",
    },
  ])("renders $language text previews with syntax highlighting", async ({ label, path, language, content, expectedSnippet }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "text",
          path,
          name: path.split("/").pop(),
          content,
        }),
      })),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[{ path, fullPath: path, kind: "文件", primaryAction: "viewed" }]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: label }));

    expect(await screen.findByText(language)).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain(expectedSnippet);
  });

  it("opens a context menu on right click and shows copy path", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/AGENTS.md", fullPath: "/Users/marila/projects/lalaclaw/AGENTS.md", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.pointer([
      {
        target: screen.getByRole("button", { name: "AGENTS.md" }),
        keys: "[MouseRight]",
      },
    ]);

    expect(await screen.findByRole("menu", { name: "文件菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "复制路径" })).toBeInTheDocument();
  });
});
