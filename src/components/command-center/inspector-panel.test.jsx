import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

vi.mock("@monaco-editor/react", () => ({
  default: function MockMonacoEditor({ language, onChange, value }) {
    return (
      <textarea
        aria-label="Monaco editor"
        data-language={language}
        data-testid="file-preview-monaco-editor"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  },
}));

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
      runtimeFallbackReason="Ping timeout"
      runtimeReconnectAttempts={2}
      runtimeSocketStatus="reconnecting"
      runtimeTransport="polling"
      setActiveTab={setActiveTab}
      taskTimeline={[
        {
          id: "run-1",
          title: "执行 10:00",
          prompt: "修复错误",
          status: "已完成",
          toolsSummary: "edit_file(完成)",
          tools: [
            { id: "tool-1", name: "edit_file", status: "完成", input: "{}", output: "ok", timestamp: 1000 },
            { id: "tool-2", name: "gateway", status: "完成", input: '{"action":"latest"}', output: "newest", timestamp: 2000 },
          ],
          relationships: [{ id: "rel-1", type: "child_agent", sourceAgentId: "main", targetAgentId: "writer", detail: "draft-worker", status: "running" }],
          files: [{ path: "src/App.jsx", kind: "文件", updatedLabel: "刚刚" }],
          outcome: "处理完成",
        },
      ]}
    />
  );
}

function getToolCard(name, toggleLabel = "收起详情") {
  const toggle = screen.getByRole("button", { name: `${name} ${toggleLabel}` });
  const card = toggle.closest(".space-y-3");
  expect(card).not.toBeNull();
  return card;
}

describe("InspectorPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, items: [] }),
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.removeItem(localeStorageKey);
  });

  it("renders timeline details and switches tabs", async () => {
    renderWithTooltip(<TestHarness />);

    expect(screen.getAllByRole("tab").slice(0, 3).map((tab) => tab.textContent)).toEqual(["文件1", "回复摘要", "运行记录"]);
    expect(screen.getByText("查看 Agent 执行记录的明细")).toBeInTheDocument();
    expect(screen.getByText("修复错误")).toBeInTheDocument();
    expect(screen.getByText("协同任务")).toBeInTheDocument();
    expect(screen.getByText("writer")).toBeInTheDocument();
    expect(screen.getByText("draft-worker")).toBeInTheDocument();
    expect(screen.getAllByTitle("src/App.jsx").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("tab", { name: "文件" })).getByText("1")).toBeInTheDocument();

    expect(
      screen
        .getAllByRole("button", { name: /收起详情/ })
        .map((button) => button.getAttribute("aria-label"))
        .filter(Boolean),
    ).toEqual(["gateway 收起详情", "edit_file 收起详情"]);

    const gatewayCard = getToolCard("gateway");
    expect(within(gatewayCard).getByText("输入")).toBeInTheDocument();
    expect(within(gatewayCard).getByText("输出")).toBeInTheDocument();
    expect(within(gatewayCard).getAllByText((_, element) => element?.textContent === '{"action":"latest"}').length).toBeGreaterThan(0);
    expect(within(gatewayCard).getAllByText((_, element) => element?.textContent === "newest").length).toBeGreaterThan(0);

    const editFileCard = getToolCard("edit_file");
    expect(within(editFileCard).getByText("输入")).toBeInTheDocument();
    expect(within(editFileCard).getByText("输出")).toBeInTheDocument();
    expect(within(editFileCard).getAllByText((_, element) => element?.textContent === "{}").length).toBeGreaterThan(0);
    expect(within(editFileCard).getAllByText((_, element) => element?.textContent === "ok").length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "回复摘要" }));
    expect(screen.getByText("这里列出本次会话的回复摘要，点击可以直接定位到会话位置")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "文件" }));
    expect(screen.getByRole("tab", { name: "文件" })).toHaveAttribute("data-state", "active");

    expect(screen.getByRole("tab", { name: "环境" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "协作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "快照" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "环境" }));
    expect(screen.getByText("这里列出 Gateway 与会话环境信息。")).toBeInTheDocument();
    expect(screen.getByText("runtime.transport")).toBeInTheDocument();
    expect(screen.getByText("轮询")).toBeInTheDocument();
    expect(screen.getByText("runtime.socket")).toBeInTheDocument();
    expect(screen.getByText("重连中")).toBeInTheDocument();
    expect(screen.getByText("runtime.reconnectAttempts")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("runtime.fallbackReason")).toBeInTheDocument();
    expect(screen.getByText("Ping timeout")).toBeInTheDocument();
    expect(screen.getByText("gateway.baseUrl")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:18789")).toBeInTheDocument();
    expect(screen.getByText("gateway.baseUrl").closest('[role="tabpanel"]')).toHaveClass("min-w-0");
  });

  it("localizes timeline statuses and tool summaries for english UI", async () => {
    renderWithTooltip(<TestHarness />, "en");

    expect(await screen.findByRole("tab", { name: "Run Log" })).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Tools: edit_file(Completed)")).toBeInTheDocument();
  });

  it("localizes summary titles for english UI", async () => {
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

    expect(await screen.findByText("Reply 03/15 15:03")).toBeInTheDocument();
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

  it("renders duplicate reply titles without duplicate key warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const [activeTab, setActiveTab] = ["artifacts", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        artifacts={[
          { title: "回复 03/19 04:29", type: "assistant_output", detail: "第一条回复", messageTimestamp: 100, timestamp: 100 },
          { title: "回复 03/19 04:29", type: "assistant_output", detail: "第二条回复", messageTimestamp: 200, timestamp: 200 },
        ]}
        files={[]}
        onSelectArtifact={() => {}}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getAllByText("回复 03/19 04:29")).toHaveLength(2);
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) => String(value).includes("Encountered two children with the same key")),
      ),
    ).toBe(false);
  });

  it("renders artifact details without markdown markers", () => {
    const [activeTab, setActiveTab] = ["artifacts", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[{ title: "回复 03/16 17:48", type: "assistant_output", detail: "结论先说： **外星殖民**。 --- ### 1. [继续](https://example.com)" }]}
        files={[]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByText("结论先说： 外星殖民。 1. 继续")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
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

  it("hides the session files section when there are no session files", () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: /本次会话文件/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "过滤本次会话文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /workspace 文件/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "过滤 workspace 文件" })).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: "文件" })).toHaveTextContent("1");
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

  it("renders a compact vertical icon rail with tooltips", async () => {
    const [activeTab, setActiveTab] = ["timeline", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        compact
        agents={[]}
        artifacts={[]}
        files={[{ path: "src/App.jsx", kind: "文件" }]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回复摘要" })).toBeInTheDocument();
    expect(screen.queryByText("追踪与观察")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "环境" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("环境");
  });

  it("opens a right-side sheet for the selected compact inspector tab", async () => {
    function CompactHarness() {
      const [activeTab, setActiveTab] = useState("timeline");

      return (
        <InspectorPanel
          activeTab={activeTab}
          compact
          artifacts={[]}
          files={[{ path: "src/App.jsx", kind: "文件" }]}
          peeks={{
            environment: {
              summary: "这里列出 Gateway 与会话环境信息。",
              items: [{ label: "gateway.baseUrl", value: "http://127.0.0.1:18789" }],
            },
            workspace: null,
            terminal: null,
            browser: null,
          }}
          renderPeek={(_, fallback) => fallback}
          setActiveTab={setActiveTab}
          taskTimeline={[]}
        />
      );
    }

    renderWithTooltip(<CompactHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "环境" }));

    const sheet = await screen.findByRole("dialog", { name: "追踪与观察 - 环境" });
    expect(within(sheet).getByText("环境")).toBeInTheDocument();
    expect(within(sheet).getByText("gateway.baseUrl")).toBeInTheDocument();
    expect(within(sheet).getByText("http://127.0.0.1:18789")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "关闭追踪面板" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "追踪与观察 - 环境" })).not.toBeInTheDocument();
    });
  });

  it("closes the compact sheet before showing a file preview overlay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "markdown",
          path: "/Users/marila/projects/lalaclaw/AGENTS.md",
          name: "AGENTS.md",
          content: "# AGENTS\n\nhello compact preview",
        }),
      })),
    );

    function CompactPreviewHarness() {
      const [activeTab, setActiveTab] = useState("files");

      return (
        <InspectorPanel
          activeTab={activeTab}
          compact
          artifacts={[]}
          currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
          files={[
            { path: "/Users/marila/projects/lalaclaw/AGENTS.md", fullPath: "/Users/marila/projects/lalaclaw/AGENTS.md", kind: "文件", primaryAction: "viewed" },
          ]}
          peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
          renderPeek={(_, fallback) => fallback}
          setActiveTab={setActiveTab}
          taskTimeline={[]}
        />
      );
    }

    renderWithTooltip(<CompactPreviewHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "文件" }));
    expect(await screen.findByRole("dialog", { name: "追踪与观察 - 文件" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "AGENTS.md" }));

    expect(await screen.findByText("hello compact preview")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "追踪与观察 - 文件" })).not.toBeInTheDocument();
    });
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
    const gatewayCard = getToolCard("gateway");
    const editFileCard = getToolCard("edit_file");

    expect(within(gatewayCard).getAllByRole("button", { name: "复制代码" })).toHaveLength(2);
    expect(within(editFileCard).getAllByRole("button", { name: "复制代码" })).toHaveLength(2);

    await user.click(within(gatewayCard).getAllByRole("button", { name: "复制代码" })[0]);
  });

  it("collapses individual tool cards inside the detail section", async () => {
    renderWithTooltip(<TestHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "edit_file 收起详情" }));

    expect(within(getToolCard("gateway")).getByText("输入")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "edit_file 查看详情" })).toBeInTheDocument();
    expect(within(getToolCard("edit_file", "查看详情")).queryByText("输入")).not.toBeInTheDocument();
  });

  it("renders session files as a directory tree and compacts single-directory paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, items: [] }),
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
          { path: "/Users/marila/projects/lalaclaw/src/App.jsx", fullPath: "/Users/marila/projects/lalaclaw/src/App.jsx", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: { summary: "工作区摘要", items: [], entries: [] }, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByText("TOOLS.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "projects / lalaclaw / src 收起详情" })).toBeInTheDocument();
    expect(screen.getByText("App.jsx")).toBeInTheDocument();
  });

  it("sorts file groups alphabetically by display path", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, items: [] }),
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
    expect(links.map((element) => element.textContent)).toEqual(["beta.md", "alpha.md", "zeta.md"]);
    expect(screen.getByRole("button", { name: "folder 收起详情" })).toBeInTheDocument();
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

    expect(screen.getByText("这里会分组列出本次会话涉及文件与当前 workspace 文件，方便你检阅")).toBeInTheDocument();
  });

  it("renders a separate collapsible workspace files section", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/alpha.md", fullPath: "/Users/marila/projects/lalaclaw/alpha.md", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            totalCount: 42,
            entries: [
              { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
              { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "workspace 文件 收起详情" })).toHaveTextContent("42");
    expect(screen.getByRole("button", { name: "workspace 文件 收起详情" })).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src 查看详情" })).toBeInTheDocument();
  });

  it("renders workspace files as a collapsible tree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fsrc%2Fcomponents")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/src/components/App.jsx", fullPath: "/Users/marila/projects/lalaclaw/src/components/App.jsx", kind: "文件" },
              ],
            }),
          };
        }
        if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fsrc%2Flib")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/src/lib/utils.js", fullPath: "/Users/marila/projects/lalaclaw/src/lib/utils.js", kind: "文件" },
              ],
            }),
          };
        }
        if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fsrc")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/src/components", fullPath: "/Users/marila/projects/lalaclaw/src/components", kind: "目录", hasChildren: true },
                { path: "/Users/marila/projects/lalaclaw/src/lib", fullPath: "/Users/marila/projects/lalaclaw/src/lib", kind: "目录", hasChildren: true },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, items: [] }),
        };
      }),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
              { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "src 查看详情" })).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "src 查看详情" }));
    expect(await screen.findByRole("button", { name: "components 查看详情" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "lib 查看详情" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "components 查看详情" }));
    expect(await screen.findByText("App.jsx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "lib 查看详情" }));
    expect(await screen.findByText("utils.js")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "src 收起详情" }));

    expect(screen.queryByText("App.jsx")).not.toBeInTheDocument();
    expect(screen.queryByText("utils.js")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src 查看详情" })).toBeInTheDocument();
  });

  it.each(["zh", "en", "ja", "fr", "es", "pt"])("renders the files inspector without crashing for locale %s", (locale) => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/README.md", fullPath: "/Users/marila/projects/lalaclaw/README.md", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{
          workspace: {
            summary: "workspace summary",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
              { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
      locale,
    );

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
  });

  it("filters session files locally by text and glob patterns", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/docs/guide.md", fullPath: "/Users/marila/projects/lalaclaw/docs/guide.md", kind: "文件", primaryAction: "created" },
          { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件", primaryAction: "modified" },
          { path: "/Users/marila/projects/lalaclaw/tests/test01.js", fullPath: "/Users/marila/projects/lalaclaw/tests/test01.js", kind: "文件", primaryAction: "viewed" },
          { path: "/Users/marila/projects/lalaclaw/tests/testA.js", fullPath: "/Users/marila/projects/lalaclaw/tests/testA.js", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: { summary: "工作区摘要", items: [], entries: [] }, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    const filterInput = screen.getByRole("textbox", { name: "过滤本次会话文件" });

    expect(screen.queryByRole("button", { name: "清空本次会话文件过滤" })).not.toBeInTheDocument();

    await user.type(filterInput, ".md");

    expect(screen.getByRole("button", { name: "清空本次会话文件过滤" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs 收起详情" })).toBeInTheDocument();
    expect(screen.getByText("guide.md")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("package.json")).not.toBeInTheDocument();
      expect(screen.queryByText("test01.js")).not.toBeInTheDocument();
      expect(screen.queryByText("testA.js")).not.toBeInTheDocument();
    });

    await user.clear(filterInput);
    await user.type(filterInput, "test??.*");

    expect(screen.getByRole("button", { name: "tests 收起详情" })).toBeInTheDocument();
    expect(screen.getByText("test01.js")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("guide.md")).not.toBeInTheDocument();
      expect(screen.queryByText("package.json")).not.toBeInTheDocument();
      expect(screen.queryByText("testA.js")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "清空本次会话文件过滤" }));

    expect(screen.queryByRole("button", { name: "清空本次会话文件过滤" })).not.toBeInTheDocument();
    expect(screen.getByText("guide.md")).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByText("test01.js")).toBeInTheDocument();
    expect(screen.getByText("testA.js")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters workspace files by text and glob patterns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("filter=.md")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                {
                  path: "/Users/marila/projects/lalaclaw/docs",
                  fullPath: "/Users/marila/projects/lalaclaw/docs",
                  kind: "目录",
                  hasChildren: true,
                  children: [
                    { path: "/Users/marila/projects/lalaclaw/docs/guide.md", fullPath: "/Users/marila/projects/lalaclaw/docs/guide.md", kind: "文件" },
                  ],
                },
                { path: "/Users/marila/projects/lalaclaw/README.md", fullPath: "/Users/marila/projects/lalaclaw/README.md", kind: "文件" },
              ],
            }),
          };
        }
        if (url.includes("filter=test")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                {
                  path: "/Users/marila/projects/lalaclaw/tests",
                  fullPath: "/Users/marila/projects/lalaclaw/tests",
                  kind: "目录",
                  hasChildren: true,
                  children: [
                    { path: "/Users/marila/projects/lalaclaw/tests/test01.js", fullPath: "/Users/marila/projects/lalaclaw/tests/test01.js", kind: "文件" },
                  ],
                },
              ],
            }),
          };
        }
        if (url.includes("filter=missing")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [],
            }),
          };
        }
        if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fdocs")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/docs/guide.md", fullPath: "/Users/marila/projects/lalaclaw/docs/guide.md", kind: "文件" },
                { path: "/Users/marila/projects/lalaclaw/docs/notes.txt", fullPath: "/Users/marila/projects/lalaclaw/docs/notes.txt", kind: "文件" },
              ],
            }),
          };
        }
        if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Ftests")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/tests/test01.js", fullPath: "/Users/marila/projects/lalaclaw/tests/test01.js", kind: "文件" },
                { path: "/Users/marila/projects/lalaclaw/tests/testA.js", fullPath: "/Users/marila/projects/lalaclaw/tests/testA.js", kind: "文件" },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, items: [] }),
        };
      }),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/docs", fullPath: "/Users/marila/projects/lalaclaw/docs", kind: "目录", hasChildren: true },
              { path: "/Users/marila/projects/lalaclaw/tests", fullPath: "/Users/marila/projects/lalaclaw/tests", kind: "目录", hasChildren: true },
              { path: "/Users/marila/projects/lalaclaw/README.md", fullPath: "/Users/marila/projects/lalaclaw/README.md", kind: "文件" },
              { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "docs 查看详情" }));
    await user.click(screen.getByRole("button", { name: "tests 查看详情" }));

    expect(await screen.findByText("guide.md")).toBeInTheDocument();
    expect(await screen.findByText("test01.js")).toBeInTheDocument();

    const filterInput = screen.getByRole("textbox", { name: "过滤 workspace 文件" });
    await user.clear(filterInput);
    await user.type(filterInput, ".md");

    expect(await screen.findByText("README.md")).toBeInTheDocument();
    expect(await screen.findByText("guide.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /docs .*详情/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("package.json")).not.toBeInTheDocument();
      expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "tests 收起详情" })).not.toBeInTheDocument();
    });

    await user.clear(filterInput);
    await user.type(filterInput, "test??.*");

    expect(await screen.findByText("test01.js")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("testA.js")).not.toBeInTheDocument();
      expect(screen.queryByText("README.md")).not.toBeInTheDocument();
      expect(screen.queryByText("guide.md")).not.toBeInTheDocument();
    });

    await user.clear(filterInput);
    await user.type(filterInput, "missing");

    expect(await screen.findByText("没有匹配“missing”的 workspace 文件。")).toBeInTheDocument();
  });

  it("shows a clear button for the workspace filter and resets results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("filter=.md")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/README.md", fullPath: "/Users/marila/projects/lalaclaw/README.md", kind: "文件" },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, items: [] }),
        };
      }),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/README.md", fullPath: "/Users/marila/projects/lalaclaw/README.md", kind: "文件" },
              { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    const filterInput = screen.getByRole("textbox", { name: "过滤 workspace 文件" });
    expect(screen.queryByRole("button", { name: "清空 workspace 过滤" })).not.toBeInTheDocument();

    await user.type(filterInput, ".md");

    expect(await screen.findByRole("button", { name: "清空 workspace 过滤" })).toBeInTheDocument();
    expect(await screen.findByText("README.md")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("package.json")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "清空 workspace 过滤" }));

    expect(screen.queryByRole("button", { name: "清空 workspace 过滤" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "过滤 workspace 文件" })).toHaveValue("");
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
  });

  it("debounces workspace filter requests by 150ms", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("filter=lesson")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            items: [{ path: "/Users/marila/projects/lalaclaw/lesson.md", fullPath: "/Users/marila/projects/lalaclaw/lesson.md", kind: "文件" }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, items: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{ workspace: { summary: "工作区摘要", items: [], entries: [] }, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const filterInput = screen.getByRole("textbox", { name: "过滤 workspace 文件" });
    await act(async () => {
      fireEvent.change(filterInput, { target: { value: "lesson" } });
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("filter=lesson");
    expect(screen.getByText("lesson.md")).toBeInTheDocument();
  });

  it("loads workspace root items lazily when initial entries are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          items: [
            { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
            { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
          ],
        }),
      })),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{ workspace: { summary: "工作区摘要", items: [] }, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(await screen.findByText("package.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src 查看详情" })).toBeInTheDocument();
  });

  it("keeps expanded workspace directories open when fresh root snapshots arrive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fsrc")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                { path: "/Users/marila/projects/lalaclaw/src/App.jsx", fullPath: "/Users/marila/projects/lalaclaw/src/App.jsx", kind: "文件" },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, items: [] }),
        };
      }),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];
    const initialPeeks = {
      workspace: {
        summary: "工作区摘要",
        items: [],
        entries: [{ path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true }],
      },
      terminal: null,
      browser: null,
      environment: null,
    };

    const { rerender } = renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={initialPeeks}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "src 查看详情" }));

    expect(await screen.findByText("App.jsx")).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <TooltipProvider delayDuration={0}>
          <InspectorPanel
            activeTab={activeTab}
            agents={[]}
            artifacts={[]}
            currentAgentId="main"
            currentSessionUser="command-center"
            currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
            files={[]}
            peeks={{
              ...initialPeeks,
              workspace: {
                ...initialPeeks.workspace,
                entries: [
                  { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
                  { path: "/Users/marila/projects/lalaclaw/package.json", fullPath: "/Users/marila/projects/lalaclaw/package.json", kind: "文件" },
                ],
              },
            }}
            renderPeek={(_, fallback) => fallback}
            setActiveTab={setActiveTab}
            taskTimeline={[]}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("App.jsx")).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src 收起详情" })).toBeInTheDocument();
  });

  it("shows empty workspace copy when no workspace files are available", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{ workspace: { summary: "工作区摘要", items: [], entries: [] }, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    expect(screen.getByText("当前 workspace 中检测到的文件会显示在这里。")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "App.jsx" }));

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
    await user.click(screen.getByRole("button", { name: "init.lua" }));

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
  ])("renders $language text previews with syntax highlighting", async ({ path, language, content, expectedSnippet }) => {
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
    await user.click(screen.getByRole("button", { name: path.split("/").pop() }));

    expect(await screen.findByText(language)).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain(expectedSnippet);
  });

  it("shows edit after preview in the context menu for editable files", async () => {
    const originalPlatform = window.navigator.platform;
    Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });

    const [activeTab, setActiveTab] = ["files", () => {}];

    try {
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
      expect(screen.getByRole("menuitem", { name: "预览" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "在 访达 中显示" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "在 VS Code 中打开" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "复制路径" })).toBeInTheDocument();
      expect(screen.getAllByRole("separator")).toHaveLength(2);
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["预览", "编辑", "在 访达 中显示", "在 VS Code 中打开", "复制路径"]);
    } finally {
      Object.defineProperty(window.navigator, "platform", { configurable: true, value: originalPlatform });
    }
  });

  it("reveals files in Finder from the context menu", async () => {
    const originalPlatform = window.navigator.platform;
    Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          label: "Finder",
          path: "/Users/marila/projects/lalaclaw/AGENTS.md",
        }),
      })),
    );

    const [activeTab, setActiveTab] = ["files", () => {}];

    try {
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
      await user.click(await screen.findByRole("menuitem", { name: "在 访达 中显示" }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/file-manager/reveal",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/Users/marila/projects/lalaclaw/AGENTS.md" }),
        }),
      );
    } finally {
      Object.defineProperty(window.navigator, "platform", { configurable: true, value: originalPlatform });
    }
  });

  it("opens files in VS Code from the context menu", async () => {
    const originalPlatform = window.navigator.platform;
    Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const [activeTab, setActiveTab] = ["files", () => {}];

    try {
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
      await user.click(await screen.findByRole("menuitem", { name: "在 VS Code 中打开" }));

      expect(openSpy).toHaveBeenCalledWith(
        "vscode://file/%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2FAGENTS.md",
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      Object.defineProperty(window.navigator, "platform", { configurable: true, value: originalPlatform });
    }
  });

  it("opens the preview directly in edit mode from the context menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "markdown",
          path: "/Users/marila/projects/lalaclaw/AGENTS.md",
          name: "AGENTS.md",
          content: "# AGENTS\n",
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
    await user.click(screen.getByRole("menuitem", { name: "编辑" }));

    expect(await screen.findByTestId("file-preview-monaco-editor")).toBeInTheDocument();
    expect(screen.getByTestId("file-preview-monaco-editor")).toHaveAttribute("data-language", "markdown");
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("keeps non-editable files without the edit context action", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/report.pdf", fullPath: "/Users/marila/projects/lalaclaw/report.pdf", kind: "文件", primaryAction: "viewed" },
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
        target: screen.getByRole("button", { name: "report.pdf" }),
        keys: "[MouseRight]",
      },
    ]);

    expect(await screen.findByRole("menu", { name: "文件菜单" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("shows refresh in the context menu for workspace directories", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.pointer([
      {
        target: screen.getByRole("button", { name: "src 查看详情" }),
        keys: "[MouseRight]",
      },
    ]);

    expect(await screen.findByRole("menu", { name: "文件菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "复制路径" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "预览" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["刷新", "复制路径"]);
  });

  it("refreshes workspace directory contents from the context menu", async () => {
    const fetchMock = vi.fn();
    let srcFetchCount = 0;

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw%2Fsrc")) {
        srcFetchCount += 1;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            items: srcFetchCount === 1
              ? [{ path: "/Users/marila/projects/lalaclaw/src/old.txt", fullPath: "/Users/marila/projects/lalaclaw/src/old.txt", kind: "文件" }]
              : [{ path: "/Users/marila/projects/lalaclaw/src/new.txt", fullPath: "/Users/marila/projects/lalaclaw/src/new.txt", kind: "文件" }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, items: [] }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentAgentId="main"
        currentSessionUser="command-center"
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: true },
            ],
          },
          terminal: null,
          browser: null,
          environment: null,
        }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "src 查看详情" }));
    expect(await screen.findByText("old.txt")).toBeInTheDocument();

    await user.pointer([
      {
        target: screen.getByRole("button", { name: "src 收起详情" }),
        keys: "[MouseRight]",
      },
    ]);
    await user.click(await screen.findByRole("menuitem", { name: "刷新" }));

    expect(await screen.findByText("new.txt")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("old.txt")).not.toBeInTheDocument();
    });
    expect(srcFetchCount).toBe(2);
  });

  it.each([
    { label: "slides/demo.pptx", path: "/Users/marila/projects/lalaclaw/slides/demo.pptx" },
    { label: "docs/spec.docx", path: "/Users/marila/projects/lalaclaw/docs/spec.docx" },
    { label: "sheets/report.xlsm", path: "/Users/marila/projects/lalaclaw/sheets/report.xlsm" },
    { label: "photos/cover.heic", path: "/Users/marila/projects/lalaclaw/photos/cover.heic" },
  ])("enables preview in the context menu for $label", async ({ path }) => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path, fullPath: path, kind: "文件", primaryAction: "viewed" },
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
        target: screen.getByRole("button", { name: path.split("/").pop() }),
        keys: "[MouseRight]",
      },
    ]);

    expect(await screen.findByRole("menu", { name: "文件菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "预览" })).toBeEnabled();
  });

  it("shows a localized LibreOffice hint when an office preview cannot be converted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          ok: false,
          error: "Office preview requires LibreOffice.",
          errorCode: "office_preview_requires_libreoffice",
          installCommand: "brew install --cask libreoffice",
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
          { path: "/Users/marila/projects/lalaclaw/docs/spec.doc", fullPath: "/Users/marila/projects/lalaclaw/docs/spec.doc", kind: "文件", primaryAction: "viewed" },
        ]}
        peeks={{ workspace: null, terminal: null, browser: null, environment: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={setActiveTab}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "spec.doc" }));

    expect(await screen.findByText("安装 LibreOffice 后即可预览 DOC、PPT 和 PPTX 文件。可打开终端执行：brew install --cask libreoffice")).toBeInTheDocument();
  });

  it("disables preview in the context menu for unsupported files", async () => {
    const [activeTab, setActiveTab] = ["files", () => {}];

    renderWithTooltip(
      <InspectorPanel
        activeTab={activeTab}
        agents={[]}
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[
          { path: "/Users/marila/projects/lalaclaw/archive.bin", fullPath: "/Users/marila/projects/lalaclaw/archive.bin", kind: "文件", primaryAction: "viewed" },
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
        target: screen.getByRole("button", { name: "archive.bin" }),
        keys: "[MouseRight]",
      },
    ]);

    expect(await screen.findByRole("menu", { name: "文件菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "预览" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "复制路径" })).toBeInTheDocument();
  });

  it("repositions the context menu to stay inside the viewport near the bottom edge", async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });

    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect() {
      if (this.getAttribute?.("role") === "menu") {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 180,
          bottom: 96,
          width: 180,
          height: 96,
          toJSON() {
            return this;
          },
        };
      }
      return originalGetBoundingClientRect.call(this);
    });

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

    fireEvent.contextMenu(screen.getByRole("button", { name: "AGENTS.md" }), {
      clientX: 790,
      clientY: 590,
    });

    const menu = await screen.findByRole("menu", { name: "文件菜单" });
    await waitFor(() => {
      expect(menu.style.left).toBe("612px");
      expect(menu.style.top).toBe("496px");
    });

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
  });
});
