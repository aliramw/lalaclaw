import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clipboardUtils from "@/components/command-center/clipboard-utils";
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

async function ensureEnvironmentSectionExpanded(user, label) {
  const expandButton = screen.queryByRole("button", { name: `${label} 查看详情` });
  if (expandButton) {
    await user.click(expandButton);
  }
  expect(screen.getByRole("button", { name: `${label} 收起详情` })).toBeInTheDocument();
}

describe("InspectorPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: ["Run global package manager update with spec openclaw@latest"] },
          }),
        };
      }
      if (url === "/api/openclaw/onboarding") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: true,
            needsOnboarding: false,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: true, valid: true, path: "/Users/marila/.openclaw/openclaw.json" },
            defaults: {
              authChoice: "openai-api-key",
              gatewayBind: "loopback",
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "moonshot-api-key", "kimi-code-api-key", "custom-api-key"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/lalaclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            currentVersion: "2026.3.20-1",
            workspaceVersion: "2026.3.20-1",
            currentRelease: { version: "2026.3.20-1", stable: true },
            targetRelease: { version: "2026.3.20-1", stable: true },
            stableTag: "stable",
            updateAvailable: false,
            capability: { installKind: "npm-package", restartMode: "manual", updateSupported: true, reason: "" },
            check: { ok: true, scope: "stable", checkedAt: 1, errorCode: "", error: "" },
            job: { active: false, status: "idle", targetVersion: "", currentVersionAtStart: "", startedAt: 0, finishedAt: 0, errorCode: "", error: "" },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, items: [] }),
      };
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.removeItem(localeStorageKey);
  });

  it("renders timeline details and switches tabs", async () => {
    renderWithTooltip(<TestHarness />);
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("tab", { name: "回复摘要" }));
    expect(screen.getByText("这里列出本次会话的回复摘要，点击可以直接定位到会话位置")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "文件" }));
    expect(screen.getByRole("tab", { name: "文件" })).toHaveAttribute("data-state", "active");

    expect(screen.getByRole("tab", { name: "环境" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "协作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "快照" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "环境" }));
    expect(screen.getByText("这里汇总 OpenClaw 诊断、管理动作与当前会话环境信息，便于排查与检阅。")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "实时同步");
    expect(screen.getByText("runtime.transport")).toBeInTheDocument();
    expect(screen.getByText("轮询")).toBeInTheDocument();
    expect(screen.getByText("runtime.socket")).toBeInTheDocument();
    expect(screen.getByText("重连中")).toBeInTheDocument();
    expect(screen.getByText("实时同步")).toBeInTheDocument();
    expect(screen.getByText("runtime.reconnectAttempts")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("runtime.fallbackReason")).toBeInTheDocument();
    expect(screen.getByText("Ping timeout")).toBeInTheDocument();
    expect(screen.queryByText("gateway.baseUrl")).not.toBeInTheDocument();
    expect(screen.getByText("runtime.transport").closest('[role="tabpanel"]')).toHaveClass("min-w-0");
  });

  it("shows an environment item copy action on the label row", async () => {
    renderWithTooltip(<TestHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "环境" }));
    await ensureEnvironmentSectionExpanded(user, "实时同步");

    const labelText = screen.getByText("runtime.fallbackReason");
    const labelRow = labelText.parentElement;
    expect(labelRow).not.toBeNull();

    await user.hover(labelRow);
    expect(within(labelRow).getByRole("button", { name: "复制代码" })).toBeInTheDocument();
  });

  it("prefers the workspace version label when it differs from the stable update state", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/onboarding") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: true,
            needsOnboarding: false,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: true, valid: true, path: "/Users/marila/.openclaw/openclaw.json" },
            defaults: {
              authChoice: "openai-api-key",
              gatewayBind: "loopback",
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["openai-api-key"],
            supportedGatewayBinds: ["loopback"],
          }),
        };
      }
      if (url === "/api/lalaclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            currentVersion: "2026.3.21-1",
            workspaceVersion: "2026.3.21-2",
            currentRelease: { version: "2026.3.21-1", stable: true },
            targetRelease: { version: "2026.3.21-1", stable: true },
            stableTag: "stable",
            updateAvailable: false,
            capability: { installKind: "npm-package", restartMode: "manual", updateSupported: true, reason: "" },
            check: { ok: true, scope: "stable", checkedAt: 1, errorCode: "", error: "" },
            job: { active: false, status: "idle", targetVersion: "", currentVersionAtStart: "", startedAt: 0, finishedAt: 0, errorCode: "", error: "" },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, items: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(<TestHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "环境" }));
    await ensureEnvironmentSectionExpanded(user, "LalaClaw");

    expect(await screen.findByText("当前源码版本")).toBeInTheDocument();
    expect(screen.getByText("2026.3.21-2")).toBeInTheDocument();
    expect(screen.getByText("最新稳定版")).toBeInTheDocument();
    expect(screen.getByText("2026.3.21-1")).toBeInTheDocument();
  });

  it("keeps a visible background badge for inactive inspector tabs", () => {
    mockResizeObserver(520);

    renderWithTooltip(
      <InspectorPanel
        activeTab="timeline"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace-writer"
        files={[{ path: "src/App.jsx", kind: "文件" }]}
        peeks={{ environment: null, workspace: null, terminal: null, browser: null }}
        renderPeek={(_, fallback) => fallback}
        setActiveTab={() => {}}
        taskTimeline={[
          {
            id: "run-1",
            title: "执行 10:00",
            prompt: "修复错误",
            status: "已完成",
          },
        ]}
      />,
    );

    const inactiveCountBadge = within(screen.getByRole("tab", { name: "文件" })).getByText("1");

    expect(inactiveCountBadge).toHaveClass(
      "bg-[var(--inspector-tab-count-bg)]",
      "text-[var(--inspector-tab-count-fg)]",
      "border-[var(--inspector-tab-count-border)]",
    );
  });

  it("localizes timeline statuses and tool summaries for english UI", async () => {
    renderWithTooltip(<TestHarness />, "en");

    expect(await screen.findByRole("tab", { name: "Run Log" })).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Tools: edit_file(Completed)")).toBeInTheDocument();
  });

  it("renders OpenClaw diagnostics cards in the environment tab", async () => {
    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace-writer"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "LALACLAW.VERSION", value: "2026.3.19-2" },
              { label: "LALACLAW.FRONTEND_URL", value: "http://127.0.0.1:5173" },
              { label: "LALACLAW.SERVER_URL", value: "http://127.0.0.1:3000" },
              { label: "LALACLAW.ACCESS_MODE", value: "token" },
              { label: "LALACLAW.GATEWAY_AUTH", value: "token" },
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
              { label: "openclaw.config.path", value: "/Users/marila/.openclaw/openclaw.json", previewable: true },
              { label: "openclaw.config.status", value: "ok" },
              { label: "openclaw.workspace.root", value: "/Users/marila/.openclaw/workspace", revealable: true },
              { label: "openclaw.workspace.status", value: "ok" },
              { label: "openclaw.gateway.status", value: "unreachable" },
              { label: "openclaw.gateway.baseUrl", value: "http://127.0.0.1:18789" },
              { label: "openclaw.gateway.healthUrl", value: "http://127.0.0.1:18789/healthz" },
              { label: "openclaw.doctor.summary", value: "attention" },
              { label: "openclaw.doctor.config", value: "ok" },
              { label: "openclaw.doctor.workspace", value: "ok" },
              { label: "openclaw.doctor.gateway", value: "unreachable" },
              { label: "openclaw.doctor.logs", value: "missing" },
              { label: "openclaw.logs.dir", value: "/Users/marila/.openclaw/logs", revealable: true },
              { label: "openclaw.logs.gatewayPath", value: "/Users/marila/.openclaw/logs/gateway.log", previewable: true },
              { label: "openclaw.logs.supervisorPath", value: "/Users/marila/.openclaw/logs/supervisor.log" },
              { label: "session.agent", value: "main" },
              { label: "session.selectedModel", value: "openrouter/minimax/minimax-m2.5" },
              { label: "runtime.transport", value: "ws" },
              { label: "runtimeHub.channel.key", value: 'main::{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","sendername":"锐拉"}' },
              { label: "runtimeHub.channelCount", value: "1" },
              { label: "gateway.port", value: "18789" },
              { label: "gateway.apiStyle", value: "chat" },
              { label: "misc.note", value: "custom" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    expect(screen.queryByText("OpenClaw 诊断")).not.toBeInTheDocument();
    expect(screen.getByText("概览")).toBeInTheDocument();
    expect(screen.getByText("连接概况")).toBeInTheDocument();
    expect(screen.getByText("OpenClaw Doctor")).toBeInTheDocument();
    expect(screen.getByText("日志")).toBeInTheDocument();
    expect(screen.getByText("会话上下文")).toBeInTheDocument();
    expect(screen.getByText("实时同步")).toBeInTheDocument();
    expect(screen.getByText("Gateway 配置")).toBeInTheDocument();
    expect(screen.getByText("LalaClaw")).toBeInTheDocument();
    expect(screen.getByText("其他")).toBeInTheDocument();
    expect(screen.queryByText("openclaw.version")).not.toBeInTheDocument();
    expect(screen.queryByText("gateway.baseUrl")).not.toBeInTheDocument();

    const user = userEvent.setup();
    const sectionButtons = screen.getAllByRole("button", { name: /(?:查看|收起)详情/i }).map((button) => button.getAttribute("aria-label"));
    expect(sectionButtons).toEqual(expect.arrayContaining([
      "概览 查看详情",
      "连接概况 查看详情",
      "OpenClaw Doctor 查看详情",
      "日志 查看详情",
      "会话上下文 查看详情",
      "实时同步 查看详情",
      "Gateway 配置 查看详情",
      "LalaClaw 查看详情",
      "其他 查看详情",
    ]));
    const diagnosticsSection = screen.getByRole("button", { name: "概览 查看详情" });
    expect(diagnosticsSection).toHaveClass("min-h-9");
    for (const sectionLabel of ["概览", "连接概况", "OpenClaw Doctor", "实时同步", "LalaClaw"]) {
      await ensureEnvironmentSectionExpanded(user, sectionLabel);
    }
    expect(screen.getAllByText("版本").length).toBeGreaterThan(0);
    expect(screen.getByText("前端访问地址")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:5173")).toBeInTheDocument();
    expect(screen.getByText("后端服务地址")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:3000")).toBeInTheDocument();
    expect(screen.queryByText("服务器主机")).not.toBeInTheDocument();
    expect(screen.queryByText("服务器端口")).not.toBeInTheDocument();
    expect(screen.getAllByText("令牌").length).toBeGreaterThan(0);
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
    expect(screen.getByText("运行档位")).toBeInTheDocument();
    expect(screen.getByText("实时网关")).toBeInTheDocument();
    expect(screen.getByText("Doctor 摘要")).toBeInTheDocument();
    expect(screen.getByText("需要关注")).toBeInTheDocument();
    expect(screen.getByText("Gateway 状态")).toBeInTheDocument();
    expect(screen.getAllByText("不可达").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /实时同步 收起详情/i }));
    expect(screen.queryByText("runtime.transport")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /实时同步 (?:查看|收起)详情/i }));
    const syncSection = screen.getByRole("button", { name: /实时同步 收起详情/i }).closest("section");
    expect(syncSection).not.toBeNull();
    expect(within(syncSection).getAllByText("runtime.transport").length).toBeGreaterThan(0);
    const longValueRow = within(syncSection).getByText("runtimeHub.channel.key").closest(".group");
    const longValueContainer = longValueRow?.querySelector(".font-mono");
    expect(longValueContainer).not.toBeNull();
    expect(longValueContainer?.className).toContain("overflow-hidden");
    expect(longValueContainer?.className).toContain("break-all");
  }, 15000);

  it("opens a file preview when an environment value is an absolute file path", async () => {
    const fetchMock = vi.fn(async (input) => {
        const url = String(input);
        if (url === "/api/openclaw/config") {
          return {
            ok: true,
            json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
          };
        }
        if (url === "/api/lalaclaw/update") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              currentVersion: "2026.3.20-1",
              currentRelease: { version: "2026.3.20-1", stable: true },
              targetRelease: { version: "2026.3.20-1", stable: true },
              stableTag: "stable",
              updateAvailable: false,
              capability: { installKind: "npm-package", restartMode: "manual", updateSupported: true, reason: "" },
              check: { ok: true, scope: "stable", checkedAt: 1, errorCode: "", error: "" },
              job: { active: false, status: "idle", targetVersion: "", currentVersionAtStart: "", startedAt: 0, finishedAt: 0, errorCode: "", error: "" },
            }),
          };
        }
        if (url === "/api/openclaw/update") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              installed: true,
              currentVersion: "2026.3.13",
              targetVersion: "2026.3.13",
              availability: { available: false },
              update: { installKind: "package", packageManager: "pnpm" },
              channel: { value: "stable", label: "stable (default)" },
              preview: { actions: [] },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
              ok: true,
              kind: "text",
              path: "/Users/marila/.openclaw/logs/gateway.log",
              name: "gateway.log",
              content: "gateway ready",
            }),
          };
        });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.logs.gatewayPath", value: "/Users/marila/.openclaw/logs/gateway.log", previewable: true },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await ensureEnvironmentSectionExpanded(user, "日志");
    await user.click(screen.getByRole("button", { name: "/Users/marila/.openclaw/logs/gateway.log" }));

    expect(await screen.findByText("gateway ready")).toBeInTheDocument();
  });

  it("renders environment directory paths as file-manager shortcuts instead of preview links", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/file-manager/reveal") {
        return {
          ok: true,
          json: async () => ({ ok: true, path: "/Users/marila/.openclaw/logs", label: "Finder" }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.logs.dir", value: "/Users/marila/.openclaw/logs", revealable: true },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );
    const user = userEvent.setup();
    await ensureEnvironmentSectionExpanded(user, "日志");
    const directoryLink = screen.getByRole("button", { name: "/Users/marila/.openclaw/logs" });
    const directoryIcon = within(directoryLink).getByTestId("file-link-directory-icon");

    expect(directoryIcon).toBeInTheDocument();
    expect(directoryIcon.parentElement).toHaveClass("text-muted-foreground/80", "items-center", "justify-center");

    await user.click(directoryLink);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/file-manager/reveal",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "/Users/marila/.openclaw/logs" }),
      }),
    );
  });

  it("keeps missing log paths as plain text when preview metadata is absent", async () => {
    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.logs.supervisorPath", value: "/Users/marila/.openclaw/logs/supervisor.log" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );
    const user = userEvent.setup();
    await ensureEnvironmentSectionExpanded(user, "日志");
    expect(screen.queryByRole("button", { name: "/Users/marila/.openclaw/logs/supervisor.log" })).not.toBeInTheDocument();
    expect(screen.getByText("/Users/marila/.openclaw/logs/supervisor.log")).toBeInTheDocument();
  });

  it("keeps gateway API paths as plain text instead of preview links", async () => {
    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "gateway.apiPath", value: "/v1/chat/completions" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await ensureEnvironmentSectionExpanded(user, "Gateway 配置");
    expect(screen.queryByRole("button", { name: "/v1/chat/completions" })).not.toBeInTheDocument();
    expect(screen.getByText("/v1/chat/completions")).toBeInTheDocument();
  });

  it("runs a confirmed OpenClaw management action and renders the structured result", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/manage") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "restart",
            command: { display: "openclaw gateway restart" },
            commandResult: {
              ok: true,
              stdout: "gateway restarted",
              stderr: "",
            },
            healthCheck: {
              status: "healthy",
              url: "http://127.0.0.1:18792/healthz",
            },
            guidance: ["The command completed successfully. Verify the updated gateway state in the diagnostics summary if needed."],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 管理动作");
    await user.click(screen.getByRole("button", { name: "重启" }));

    expect(screen.getByRole("alertdialog", { name: "确认执行重启？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认执行" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/manage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "restart" }),
      }),
    );
    expect(await screen.findByText("最近一次动作结果")).toBeInTheDocument();
    expect(screen.getByText("openclaw gateway restart")).toBeInTheDocument();
    expect(screen.getByText("健康检查")).toBeInTheDocument();
    expect(screen.getByText("gateway restarted")).toBeInTheDocument();
  });

  it("refreshes the environment after a successful OpenClaw management action", async () => {
    const onRefreshEnvironment = vi.fn(async () => {});
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/manage") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "status",
            command: { display: "openclaw gateway status" },
            commandResult: { ok: true, stdout: "ok", stderr: "" },
            healthCheck: { status: "healthy", url: "http://127.0.0.1:18792/healthz" },
            guidance: ["Looks good."],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        onRefreshEnvironment={onRefreshEnvironment}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 管理动作");
    await user.click(screen.getByRole("button", { name: "查看状态" }));

    expect(await screen.findByText("最近一次动作结果")).toBeInTheDocument();
    expect(onRefreshEnvironment).toHaveBeenCalledTimes(1);
  });

  it("loads structured OpenClaw config values and applies them with restart", async () => {
    const onRefreshEnvironment = vi.fn(async () => {});
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/config?agentId=main" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            baseHash: "base-hash-1",
            currentAgentId: "main",
            modelOptions: [
              "openai/gpt-5.4",
              "openai-codex/gpt-5.4",
              "openrouter/minimax/minimax-m2.5",
            ],
            fields: [
              { key: "modelPrimary", value: "openai/gpt-5.4" },
              { key: "agentModel", value: "openrouter/minimax/minimax-m2.5", meta: { agentId: "main" } },
              { key: "gatewayBind", value: "loopback" },
              { key: "chatCompletionsEnabled", value: true },
            ],
            validation: { ok: true, valid: true },
          }),
        };
      }
      if (url === "/api/openclaw/config" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            backupPath: "/Users/marila/.openclaw/openclaw.json.backup.20260319T102030Z",
            changedFields: [
              { key: "modelPrimary", before: "openai/gpt-5.4", after: "openrouter/minimax/minimax-m2.5" },
              { key: "agentModel", before: "openrouter/minimax/minimax-m2.5", after: "openai-codex/gpt-5.4", meta: { agentId: "main" } },
            ],
            validation: { ok: true, valid: true },
            restartRequested: true,
            healthCheck: { status: "healthy", url: "http://127.0.0.1:18789/healthz" },
            state: {
              ok: true,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              baseHash: "base-hash-2",
              currentAgentId: "main",
              modelOptions: [
                "openai/gpt-5.4",
                "openai-codex/gpt-5.4",
                "openrouter/minimax/minimax-m2.5",
              ],
              fields: [
                { key: "modelPrimary", value: "openrouter/minimax/minimax-m2.5" },
                { key: "agentModel", value: "openai-codex/gpt-5.4", meta: { agentId: "main" } },
                { key: "gatewayBind", value: "loopback" },
                { key: "chatCompletionsEnabled", value: true },
              ],
              validation: { ok: true, valid: true },
            },
          }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentAgentId="main"
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        onRefreshEnvironment={onRefreshEnvironment}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 配置")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 配置");
    expect(screen.getByRole("combobox", { name: "默认模型" })).toHaveValue("openai/gpt-5.4");
    expect(screen.getByRole("combobox", { name: "main 默认模型" })).toHaveValue("openrouter/minimax/minimax-m2.5");
    expect(screen.getByRole("button", { name: "应用并重启" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "默认模型" }), "openrouter/minimax/minimax-m2.5");
    await user.selectOptions(screen.getByRole("combobox", { name: "main 默认模型" }), "openai-codex/gpt-5.4");
    expect(screen.getByRole("button", { name: "应用并重启" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "应用并重启" }));

    const configPostCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/openclaw/config" && options?.method === "POST");
    expect(configPostCall).toBeTruthy();
    expect(JSON.parse(configPostCall[1].body)).toEqual({
      agentId: "main",
      baseHash: "base-hash-1",
      remoteAuthorization: null,
      restartGateway: true,
      values: {
        modelPrimary: "openrouter/minimax/minimax-m2.5",
        agentModel: "openai-codex/gpt-5.4",
        gatewayBind: "loopback",
        chatCompletionsEnabled: true,
      },
    });
    expect(await screen.findByText("最近一次配置结果")).toBeInTheDocument();
    expect(screen.getByText("备份文件")).toBeInTheDocument();
    expect(screen.getByText("修改前: openai/gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("修改后: openrouter/minimax/minimax-m2.5")).toBeInTheDocument();
    expect(screen.getByText("修改前: openrouter/minimax/minimax-m2.5")).toBeInTheDocument();
    expect(screen.getByText("修改后: openai-codex/gpt-5.4")).toBeInTheDocument();
    expect(onRefreshEnvironment).toHaveBeenCalledTimes(1);
  });

  it("loads the OpenClaw update state and runs the official update flow", async () => {
    const onRefreshEnvironment = vi.fn(async () => {});
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.19",
            availability: { available: true },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: ["Run global package manager update with spec openclaw@latest"] },
          }),
        };
      }
      if (url === "/api/openclaw/update" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            commandResult: {
              ok: true,
              command: { display: "openclaw update --yes --json" },
              stdout: "{\"ok\":true}",
            },
            result: { targetVersion: "2026.3.19" },
            healthCheck: { status: "healthy", url: "http://127.0.0.1:18789/healthz" },
            state: {
              ok: true,
              installed: true,
              currentVersion: "2026.3.19",
              targetVersion: "2026.3.19",
              availability: { available: false },
              update: { installKind: "package", packageManager: "pnpm" },
              channel: { value: "stable", label: "stable (default)" },
              preview: { actions: ["Run global package manager update with spec openclaw@latest"] },
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        onRefreshEnvironment={onRefreshEnvironment}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    expect(screen.getByText("有可用更新")).toBeInTheDocument();
    expect(screen.getByText("目标版本: 2026.3.19")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "执行官方更新" }));

    expect(fetchMock.mock.calls).toEqual(expect.arrayContaining([
      [
        "/api/openclaw/update",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "update", restartGateway: true }),
        }),
      ],
    ]));
    expect(await screen.findByText("最近一次更新结果")).toBeInTheDocument();
    expect(screen.getByText("openclaw update --yes --json")).toBeInTheDocument();
    expect(onRefreshEnvironment).toHaveBeenCalledTimes(1);
  });

  it("hides the official update action when OpenClaw is already up to date", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: ["Run global package manager update with spec openclaw@latest"] },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    expect(await screen.findByText("已是最新")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行官方更新" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeInTheDocument();
  });

  it("shows official install guidance and can trigger the install flow when OpenClaw is missing", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: false,
            installGuidance: {
              docsUrl: "https://docs.openclaw.ai/install",
              command: "curl -fsSL https://openclaw.ai/install.sh | bash",
            },
          }),
        };
      }
      if (url === "/api/openclaw/update" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "install",
            commandResult: {
              ok: true,
              command: { display: "bash -lc curl -fsSL https://openclaw.ai/install.sh | bash" },
              stdout: "installed",
            },
            state: {
              ok: true,
              installed: true,
              currentVersion: "2026.3.19",
              targetVersion: "2026.3.19",
              availability: { available: false },
              update: { installKind: "package", packageManager: "pnpm" },
              channel: { value: "stable", label: "stable (default)" },
              preview: { actions: ["Run global package manager update with spec openclaw@latest"] },
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    expect(await screen.findByText("未安装")).toBeInTheDocument();
    expect(screen.getByText("curl -fsSL https://openclaw.ai/install.sh | bash")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "执行官方安装" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "install", restartGateway: true }),
      }),
    );
    expect(await screen.findByText("bash -lc curl -fsSL https://openclaw.ai/install.sh | bash")).toBeInTheDocument();
  });

  it("switches straight into onboarding after the official install completes", async () => {
    let onboardingGetCount = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        onboardingGetCount += 1;
        return {
          ok: true,
          json: async () => (
            onboardingGetCount > 1
              ? {
                  ok: true,
                  installed: true,
                  ready: false,
                  needsOnboarding: true,
                  configPath: "/Users/marila/.openclaw/openclaw.json",
                  validation: { ok: false, valid: false },
                  defaults: {
                    authChoice: "openai-api-key",
                    gatewayBind: "loopback",
                    workspace: "/Users/marila/.openclaw/workspace",
                  },
                  supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "custom-api-key"],
                  supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
                }
              : {
                  ok: true,
                  installed: false,
                  ready: false,
                  needsOnboarding: false,
                  configPath: "",
                  validation: null,
                  defaults: {
                    authChoice: "openai-api-key",
                    gatewayBind: "loopback",
                    workspace: "/Users/marila/.openclaw/workspace",
                  },
                  supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "custom-api-key"],
                  supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
                }
          ),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [] }),
        };
      }
      if (url === "/api/openclaw/update" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: false,
            installGuidance: {
              docsUrl: "https://docs.openclaw.ai/install",
              command: "curl -fsSL https://openclaw.ai/install.sh | bash",
            },
          }),
        };
      }
      if (url === "/api/openclaw/update" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "install",
            commandResult: {
              ok: true,
              stdout: "installed",
              stderr: "",
              command: { display: "bash -lc curl -fsSL https://openclaw.ai/install.sh | bash" },
            },
            state: {
              ok: true,
              installed: true,
              currentVersion: "2026.3.19",
              targetVersion: "2026.3.19",
              availability: { available: false },
              update: { installKind: "package", packageManager: "pnpm" },
              channel: { value: "stable", label: "stable (default)" },
              preview: { actions: [] },
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    await user.click(screen.getByRole("button", { name: "执行官方安装" }));

    expect(await screen.findByText("OpenClaw 初始化")).toBeInTheDocument();
    expect(screen.queryByText("OpenClaw 配置")).not.toBeInTheDocument();
    expect(onboardingGetCount).toBeGreaterThanOrEqual(2);
  });

  it("prioritizes onboarding when OpenClaw is installed but first-run setup is incomplete", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            defaults: {
              authChoice: "openai-api-key",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "custom-api-key"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --mode local --flow quickstart" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              defaults: {
                authChoice: "openai-api-key",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "quickstart",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["openai-api-key", "openrouter-api-key", "custom-api-key"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "healthy" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 初始化")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    expect(screen.queryByText("OpenClaw 配置")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("API Key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "openai-api-key",
          apiKey: "sk-test",
          customBaseUrl: "",
          customCompatibility: "openai",
          customModelId: "",
          customProviderId: "",
          daemonRuntime: "node",
          flow: "quickstart",
          gatewayAuth: "off",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "plaintext",
          gatewayTokenRefEnv: "",
          installDaemon: true,
          secretInputMode: "plaintext",
          skipHealthCheck: false,
          token: "",
          tokenExpiresIn: "",
          tokenProfileId: "",
          tokenProvider: "",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
    expect(await screen.findByText("openclaw onboard --non-interactive --mode local --flow quickstart")).toBeInTheDocument();
  });

  it("supports custom provider onboarding in SecretRef mode", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            defaults: {
              authChoice: "custom-api-key",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["openai-api-key", "custom-api-key", "ollama", "skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              defaults: {
                authChoice: "custom-api-key",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "quickstart",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["openai-api-key", "custom-api-key", "ollama", "skip"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "healthy" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    await user.selectOptions(screen.getByRole("combobox", { name: "模型提供方" }), "custom-api-key");
    await user.selectOptions(screen.getByRole("combobox", { name: "凭据保存方式" }), "ref");
    await user.type(screen.getByLabelText("提供方 Base URL"), "https://llm.example.com/v1");
    await user.type(screen.getByLabelText("提供方模型 ID"), "claude-compat");
    await user.type(screen.getByLabelText("自定义提供方 ID"), "acme-anthropic");
    await user.selectOptions(screen.getByRole("combobox", { name: "提供方兼容类型" }), "anthropic");
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "custom-api-key",
          apiKey: "",
          customBaseUrl: "https://llm.example.com/v1",
          customCompatibility: "anthropic",
          customModelId: "claude-compat",
          customProviderId: "acme-anthropic",
          daemonRuntime: "node",
          flow: "quickstart",
          gatewayAuth: "off",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "plaintext",
          gatewayTokenRefEnv: "",
          installDaemon: true,
          secretInputMode: "ref",
          skipHealthCheck: false,
          token: "",
          tokenExpiresIn: "",
          tokenProfileId: "",
          tokenProvider: "",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
  });

  it("passes the selected official onboarding flow through to the backend", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            capabilityDetection: {
              source: "help",
              reason: "",
              signature: "openclaw@2026.3.13@package@stable",
            },
            defaults: {
              authChoice: "skip",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            capabilityDetection: {
              source: "help",
              reason: "",
              signature: "openclaw@2026.3.13@package@stable",
            },
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --accept-risk --mode local --flow manual" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              capabilityDetection: {
                source: "help",
                reason: "",
                signature: "openclaw@2026.3.13@package@stable",
              },
              defaults: {
                authChoice: "skip",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "manual",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["skip"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "healthy" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    await user.selectOptions(screen.getByRole("combobox", { name: "初始化流程" }), "manual");
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(await screen.findByText("能力探测")).toBeInTheDocument();
    expect(screen.getAllByText("来自 `openclaw onboard --help` 的实时探测").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("版本签名: openclaw@2026.3.13@package@stable").length).toBeGreaterThanOrEqual(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "skip",
          apiKey: "",
          customBaseUrl: "",
          customCompatibility: "openai",
          customModelId: "",
          customProviderId: "",
          daemonRuntime: "node",
          flow: "manual",
          gatewayAuth: "off",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "plaintext",
          gatewayTokenRefEnv: "",
          installDaemon: true,
          secretInputMode: "plaintext",
          skipHealthCheck: false,
          token: "",
          tokenExpiresIn: "",
          tokenProfileId: "",
          tokenProvider: "",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
  });

  it("lets the onboarding panel force-refresh detected CLI capabilities", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            capabilityDetection: {
              source: "help-cache",
              reason: "",
              detectedAt: "2026-03-21T02:50:00.000Z",
              signature: "openclaw@2026.3.13@package@stable",
            },
            defaults: {
              authChoice: "skip",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "manual",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["google-gemini-cli", "skip"],
            supportedDaemonRuntimes: ["node"],
            supportedFlows: ["manual"],
            supportedGatewayAuthModes: ["off"],
            supportedGatewayTokenInputModes: ["plaintext"],
            supportedSecretInputModes: ["plaintext"],
            supportedGatewayBinds: ["loopback"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding?refreshCapabilities=1" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            capabilityDetection: {
              source: "help",
              reason: "",
              detectedAt: "2026-03-21T02:55:00.000Z",
              signature: "openclaw@2026.3.21@package@stable",
            },
            defaults: {
              authChoice: "skip",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "manual",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["github-copilot", "google-gemini-cli", "skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet"],
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");

    expect(screen.getByText("复用已缓存的 `openclaw onboard --help` 能力快照")).toBeInTheDocument();
    expect(screen.getByText("版本签名: openclaw@2026.3.13@package@stable")).toBeInTheDocument();
    expect(screen.getByText("探测时间: 2026-03-21T02:50:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("Google Gemini CLI 登录 / 暂时跳过提供方配置")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新检测 OpenClaw 支持项" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/openclaw/onboarding?refreshCapabilities=1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    expect(await screen.findByText("来自 `openclaw onboard --help` 的实时探测")).toBeInTheDocument();
    expect(screen.getByText("最近一次支持项检测结果")).toBeInTheDocument();
    expect(screen.getByText("检测请求时间")).toBeInTheDocument();
    expect(screen.getByText("版本签名: openclaw@2026.3.21@package@stable")).toBeInTheDocument();
    expect(screen.getByText("探测时间: 2026-03-21T02:55:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("GitHub Copilot 本机登录 / Google Gemini CLI 登录 / 暂时跳过提供方配置")).toBeInTheDocument();
  });

  it("supports gateway token SecretRef fields during onboarding", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            capabilityDetection: {
              source: "help",
              reason: "",
            },
            defaults: {
              authChoice: "skip",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              defaults: {
                authChoice: "skip",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "quickstart",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["skip"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "healthy" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    await user.selectOptions(screen.getByRole("combobox", { name: "Gateway 认证方式" }), "token");
    await user.selectOptions(screen.getByRole("combobox", { name: "Gateway Token 保存方式" }), "ref");
    await user.type(screen.getByLabelText("Gateway Token 环境变量名"), "OPENCLAW_GATEWAY_TOKEN");
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "skip",
          apiKey: "",
          customBaseUrl: "",
          customCompatibility: "openai",
          customModelId: "",
          customProviderId: "",
          daemonRuntime: "node",
          flow: "quickstart",
          gatewayAuth: "token",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "ref",
          gatewayTokenRefEnv: "OPENCLAW_GATEWAY_TOKEN",
          installDaemon: true,
          secretInputMode: "plaintext",
          skipHealthCheck: false,
          token: "",
          tokenExpiresIn: "",
          tokenProfileId: "",
          tokenProvider: "",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
  });

  it("lets onboarding skip daemon install without failing the submitted payload shape", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            defaults: {
              authChoice: "skip",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              defaults: {
                authChoice: "skip",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "quickstart",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["skip"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "unreachable" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    expect(screen.getByRole("combobox", { name: "Gateway 服务运行时" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "安装 Gateway 后台服务" }));
    expect(screen.queryByRole("combobox", { name: "Gateway 服务运行时" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "跳过官方健康检查" }));
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "skip",
          apiKey: "",
          customBaseUrl: "",
          customCompatibility: "openai",
          customModelId: "",
          customProviderId: "",
          daemonRuntime: "node",
          flow: "quickstart",
          gatewayAuth: "off",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "plaintext",
          gatewayTokenRefEnv: "",
          installDaemon: false,
          secretInputMode: "plaintext",
          skipHealthCheck: true,
          token: "",
          tokenExpiresIn: "",
          tokenProfileId: "",
          tokenProvider: "",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
  });

  it("supports token-based provider onboarding", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            defaults: {
              authChoice: "token",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["token", "skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              defaults: {
                authChoice: "token",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "quickstart",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["token", "skip"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "healthy" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    await user.selectOptions(screen.getByRole("combobox", { name: "模型提供方" }), "token");
    await user.type(screen.getByLabelText("Token 提供方 ID"), "openai");
    await user.type(screen.getByLabelText("访问 Token"), "provider-token");
    await user.type(screen.getByLabelText("认证配置 ID"), "openai:manual");
    await user.type(screen.getByLabelText("Token 有效期"), "30d");
    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "token",
          apiKey: "",
          customBaseUrl: "",
          customCompatibility: "openai",
          customModelId: "",
          customProviderId: "",
          daemonRuntime: "node",
          flow: "quickstart",
          gatewayAuth: "off",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "plaintext",
          gatewayTokenRefEnv: "",
          installDaemon: true,
          secretInputMode: "plaintext",
          skipHealthCheck: false,
          token: "provider-token",
          tokenExpiresIn: "30d",
          tokenProfileId: "openai:manual",
          tokenProvider: "openai",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
  });

  it("supports managed local-login providers without showing API key inputs", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            defaults: {
              authChoice: "github-copilot",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "quickstart",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["github-copilot", "openai-api-key", "skip"],
            supportedDaemonRuntimes: ["node", "bun"],
            supportedFlows: ["quickstart", "advanced", "manual"],
            supportedGatewayAuthModes: ["off", "token", "password"],
            supportedGatewayTokenInputModes: ["plaintext", "ref"],
            supportedSecretInputModes: ["plaintext", "ref"],
            supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
          }),
        };
      }
      if (url === "/api/openclaw/onboarding" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "onboard",
            commandResult: {
              ok: true,
              command: { display: "openclaw onboard --non-interactive --accept-risk --mode local --flow quickstart" },
              stdout: "onboarded",
              stderr: "",
            },
            state: {
              ok: true,
              installed: true,
              ready: true,
              needsOnboarding: false,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              validation: { ok: true, valid: true },
              defaults: {
                authChoice: "github-copilot",
                customCompatibility: "openai",
                daemonRuntime: "node",
                flow: "quickstart",
                gatewayAuth: "off",
                gatewayBind: "loopback",
                gatewayTokenInputMode: "plaintext",
                installDaemon: true,
                secretInputMode: "plaintext",
                skipHealthCheck: false,
                workspace: "/Users/marila/.openclaw/workspace",
              },
              supportedAuthChoices: ["github-copilot", "openai-api-key", "skip"],
              supportedDaemonRuntimes: ["node", "bun"],
              supportedFlows: ["quickstart", "advanced", "manual"],
              supportedGatewayAuthModes: ["off", "token", "password"],
              supportedGatewayTokenInputModes: ["plaintext", "ref"],
              supportedSecretInputModes: ["plaintext", "ref"],
              supportedGatewayBinds: ["loopback", "tailnet", "lan", "auto", "custom"],
            },
            healthCheck: { status: "healthy" },
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");
    await user.selectOptions(screen.getByRole("combobox", { name: "模型提供方" }), "github-copilot");

    expect(screen.getByText("复用本机已有登录态")).toBeInTheDocument();
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("凭据保存方式")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "执行初始化" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openclaw/onboarding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authChoice: "github-copilot",
          apiKey: "",
          customBaseUrl: "",
          customCompatibility: "openai",
          customModelId: "",
          customProviderId: "",
          daemonRuntime: "node",
          flow: "quickstart",
          gatewayAuth: "off",
          gatewayBind: "loopback",
          gatewayPassword: "",
          gatewayToken: "",
          gatewayTokenInputMode: "plaintext",
          gatewayTokenRefEnv: "",
          installDaemon: true,
          secretInputMode: "plaintext",
          skipHealthCheck: false,
          token: "",
          tokenExpiresIn: "",
          tokenProfileId: "",
          tokenProvider: "",
          workspace: "/Users/marila/.openclaw/workspace",
        }),
      }),
    );
  });

  it("renders onboarding selects from backend capability lists instead of local fallback options", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/onboarding") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            ready: false,
            needsOnboarding: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            validation: { ok: false, valid: false },
            defaults: {
              authChoice: "skip",
              customCompatibility: "openai",
              daemonRuntime: "node",
              flow: "manual",
              gatewayAuth: "off",
              gatewayBind: "loopback",
              gatewayTokenInputMode: "plaintext",
              installDaemon: true,
              secretInputMode: "plaintext",
              skipHealthCheck: false,
              workspace: "/Users/marila/.openclaw/workspace",
            },
            supportedAuthChoices: ["google-gemini-cli", "skip"],
            supportedDaemonRuntimes: ["node"],
            supportedFlows: ["manual"],
            supportedGatewayAuthModes: ["off"],
            supportedGatewayTokenInputModes: ["plaintext"],
            supportedSecretInputModes: ["plaintext"],
            supportedGatewayBinds: ["loopback"],
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.19",
            targetVersion: "2026.3.19",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [], remoteTarget: false }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    await screen.findByText("OpenClaw 初始化");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 初始化");

    const providerSelect = screen.getByRole("combobox", { name: "模型提供方" });

    expect(screen.getByText("当前 CLI 能力")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "支持的流程: Manual")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "支持的模型提供方: Google Gemini CLI 登录 / 暂时跳过提供方配置")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "支持的 Gateway 绑定: 仅本机")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "支持的服务运行时: Node.js")).toBeInTheDocument();
    expect(screen.getAllByText("当前 OpenClaw CLI 能力已将这里固定为只读值。").length).toBeGreaterThanOrEqual(3);

    expect(Array.from(providerSelect.options).map((option) => option.value)).toEqual(["google-gemini-cli", "skip"]);
    expect(screen.queryByRole("combobox", { name: "初始化流程" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Gateway 绑定方式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Gateway 认证方式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Gateway 服务运行时" })).not.toBeInTheDocument();

    await user.selectOptions(providerSelect, "google-gemini-cli");
    expect(screen.getByText("复用本机已有登录态")).toBeInTheDocument();
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();
  });

  it("shows stderr plus troubleshooting guidance for install failures", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: false,
            installGuidance: {
              docsUrl: "https://docs.openclaw.ai/install",
              command: "curl -fsSL https://openclaw.ai/install.sh | bash",
            },
          }),
        };
      }
      if (url === "/api/openclaw/update" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: false,
            action: "install",
            commandResult: {
              ok: false,
              exitCode: 6,
              timedOut: false,
              stderr: "curl: (6) Could not resolve host: openclaw.ai",
              stdout: "",
              command: { display: "bash -lc curl -fsSL https://openclaw.ai/install.sh | bash" },
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    await user.click(await screen.findByRole("button", { name: "执行官方安装" }));

    expect(await screen.findByText("最近一次更新结果")).toBeInTheDocument();
    expect(screen.getByText("错误输出")).toBeInTheDocument();
    expect(screen.getByText("curl: (6) Could not resolve host: openclaw.ai")).toBeInTheDocument();
    expect(screen.getByText("检查网络或代理配置")).toBeInTheDocument();

    const docsLinks = screen.getAllByRole("link", { name: "安装文档" });
    expect(docsLinks[0]).toHaveAttribute("href", "https://docs.openclaw.ai/install");

    await user.click(screen.getAllByRole("button", { name: "查看解决办法" })[0]);

    expect(screen.getByRole("dialog", { name: "检查网络或代理配置" })).toBeInTheDocument();
    expect(screen.getByText("确认这台机器能访问 `https://openclaw.ai/install.sh` 和 npm registry。")).toBeInTheDocument();
  });

  it("shows structured troubleshooting for request-level install errors", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: false,
            installGuidance: {
              docsUrl: "https://docs.openclaw.ai/install",
              command: "curl -fsSL https://openclaw.ai/install.sh | bash",
            },
          }),
        };
      }
      if (url === "/api/openclaw/update" && init?.method === "POST") {
        return {
          ok: false,
          json: async () => ({
            ok: false,
            errorCode: "install_platform_unsupported",
            error: "The local OpenClaw install flow is not supported on this platform yet",
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    await user.click(await screen.findByRole("button", { name: "执行官方安装" }));

    expect(await screen.findByText("当前平台暂不支持在这里直接执行 OpenClaw 官方安装流程。")).toBeInTheDocument();
    expect(screen.getByText("改为在应用外执行官方安装")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "安装文档" })).toHaveAttribute("href", "https://docs.openclaw.ai/install");
  });

  it("blocks local-only OpenClaw mutations when the active gateway target is remote and shows operation history", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            entries: [
              {
                id: "entry-1",
                scope: "config",
                action: "apply",
                target: "remote",
                outcome: "blocked",
                blocked: true,
                finishedAt: 1773912000000,
                summary: "Blocked a local-only OpenClaw mutation because the active gateway target is remote.",
              },
            ],
          }),
        };
      }
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            remoteTarget: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            baseHash: "remote-hash-1",
            modelOptions: [
              "openai/gpt-5.4",
              "openrouter/minimax/minimax-m2.5",
            ],
            fields: [
              { key: "modelPrimary", value: "openai/gpt-5.4" },
              { key: "gatewayBind", value: "loopback" },
              { key: "chatCompletionsEnabled", value: true },
            ],
            validation: { ok: true, valid: true },
          }),
        };
      }
      if (url === "/api/openclaw/update") {
        throw new Error(`Should not load local-only update route in remote mode: ${url}`);
      }
      return {
        ok: true,
        json: async () => ({ ok: true, items: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
              { label: "openclaw.remote.target", value: "remote" },
              { label: "openclaw.remote.writeAccess", value: "blocked" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    expect(await screen.findByText("OpenClaw 配置")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 配置");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 管理动作");
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 操作历史");
    expect(await screen.findAllByText("远端 OpenClaw 写操作暂时禁用")).toHaveLength(3);
    expect(screen.getByText("OpenClaw 操作历史")).toBeInTheDocument();
    expect(screen.getByText("config.apply")).toBeInTheDocument();
    expect(screen.getByText("已在执行前阻止")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/openclaw/history", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/openclaw/config", expect.objectContaining({ method: "GET" }));
    expect(screen.queryByRole("button", { name: "执行官方安装" })).not.toBeInTheDocument();
    expect(screen.getByText("/Users/marila/.openclaw/openclaw.json")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/Users/marila/.openclaw/openclaw.json" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我确认要把这次修改写入远端 OpenClaw 配置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "授权并应用远端变更" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "查看恢复引导" })).toHaveLength(4);
    expect(screen.getByRole("button", { name: /OpenClaw 配置 收起详情/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OpenClaw 管理动作 收起详情/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OpenClaw 安装与更新 收起详情/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OpenClaw 操作历史 收起详情/i })).toBeInTheDocument();

    const remoteConfirm = screen.getByRole("checkbox", { name: "我确认要把这次修改写入远端 OpenClaw 配置" });
    expect(remoteConfirm.closest("label")).toHaveClass("items-center");
    await user.click(remoteConfirm);
    await user.selectOptions(screen.getByRole("combobox", { name: "默认模型" }), "openrouter/minimax/minimax-m2.5");

    expect(remoteConfirm).toBeChecked();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "授权并应用远端变更" })).toBeEnabled();
    });

    await user.click(screen.getAllByRole("button", { name: "查看恢复引导" })[0]);

    expect(screen.getByRole("dialog", { name: "远端 OpenClaw 恢复引导" })).toBeInTheDocument();
    expect(screen.getByText("建议下一步")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "安装文档" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /OpenClaw 配置 收起详情/i }));
    expect(screen.queryByRole("checkbox", { name: "我确认要把这次修改写入远端 OpenClaw 配置" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /OpenClaw 配置 (?:查看|收起)详情/i }));
    expect(screen.getByRole("checkbox", { name: "我确认要把这次修改写入远端 OpenClaw 配置" })).toBeInTheDocument();
  }, 10_000);

  it("reloads the latest config state before showing a config conflict error", async () => {
    const initialState = {
      ok: true,
      configPath: "/Users/marila/.openclaw/openclaw.json",
      baseHash: "hash-1",
      currentAgentId: "main",
      modelOptions: ["openai/gpt-5.4", "openrouter/minimax/minimax-m2.5"],
      fields: [
        { key: "modelPrimary", path: "agents.defaults.model.primary", type: "string", options: [], restartRequired: false, allowUnset: true, value: "openai/gpt-5.4" },
        { key: "gatewayBind", path: "gateway.bind", type: "enum", options: ["loopback", "lan"], restartRequired: true, allowUnset: false, value: "loopback" },
        { key: "chatCompletionsEnabled", path: "gateway.http.endpoints.chatCompletions.enabled", type: "boolean", options: [], restartRequired: true, allowUnset: false, value: true },
      ],
      validation: { ok: true, valid: true },
    };
    const reloadedState = {
      ...initialState,
      baseHash: "hash-2",
      fields: initialState.fields.map((field) => (
        field.key === "modelPrimary"
          ? { ...field, value: "openrouter/minimax/minimax-m2.5" }
          : field
      )),
    };
    let configGetCount = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/config" && (!init || init.method === "GET")) {
        configGetCount += 1;
        return {
          ok: true,
          json: async () => (configGetCount > 1 ? reloadedState : initialState),
        };
      }
      if (url === "/api/openclaw/config" && init?.method === "POST") {
        return {
          ok: false,
          json: async () => ({ ok: false, errorCode: "config_conflict" }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({ ok: true, entries: [] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 配置")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 配置");
    await user.selectOptions(screen.getByRole("combobox", { name: "默认模型" }), "openrouter/minimax/minimax-m2.5");
    await user.click(screen.getByRole("button", { name: "应用变更" }));

    expect(await screen.findByText("OpenClaw 配置已被其他操作修改，请先重新加载最新值。")).toBeInTheDocument();
    expect(configGetCount).toBe(2);
    expect(screen.getByRole("combobox", { name: "默认模型" })).toHaveValue("openrouter/minimax/minimax-m2.5");
  });

  it("does not show the official install action before update state has loaded", async () => {
    let resolveUpdateRequest;
    const updateRequest = new Promise((resolve) => {
      resolveUpdateRequest = resolve;
    });
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/openclaw/config") {
        return {
          ok: true,
          json: async () => ({ ok: true, configPath: "/Users/marila/.openclaw/openclaw.json", baseHash: "hash", fields: [], validation: { ok: true, valid: true } }),
        };
      }
      if (url === "/api/openclaw/update") {
        await updateRequest;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: false,
            installGuidance: {
              docsUrl: "https://docs.openclaw.ai/install",
              command: "curl -fsSL https://openclaw.ai/install.sh | bash",
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("OpenClaw 安装与更新")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 安装与更新");
    expect(screen.getByRole("button", { name: "刷新状态" })).toHaveTextContent("刷新中…");
    expect(screen.queryByRole("button", { name: "执行官方安装" })).not.toBeInTheDocument();

    resolveUpdateRequest();

    expect(await screen.findByText("未安装")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行官方安装" })).toBeInTheDocument();
  });

  it("restores a remote rollback point from the operation history panel", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            entries: [
              {
                id: "entry-rollback-source",
                scope: "config",
                action: "apply",
                target: "remote",
                outcome: "success",
                ok: true,
                finishedAt: 1773912000000,
                summary: "Stored remote rollback point remote-config-backup-1.",
                backupId: "backup-1",
                backupLabel: "remote-config-backup-1",
              },
            ],
          }),
        };
      }
      if (url === "/api/openclaw/config" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            remoteTarget: true,
            configPath: "https://gateway.example.test/config",
            baseHash: "remote-hash-1",
            modelOptions: ["openai/gpt-5.4", "openrouter/minimax/minimax-m2.5"],
            fields: [
              { key: "modelPrimary", value: "openrouter/minimax/minimax-m2.5" },
              { key: "gatewayBind", value: "loopback" },
              { key: "chatCompletionsEnabled", value: false },
            ],
            validation: { ok: true, valid: true },
          }),
        };
      }
      if (url === "/api/openclaw/config" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            remoteTarget: true,
            rolledBack: true,
            backupReference: { id: "backup-1", label: "remote-config-backup-1" },
            state: {
              ok: true,
              remoteTarget: true,
              configPath: "https://gateway.example.test/config",
              baseHash: "remote-hash-2",
              modelOptions: ["openai/gpt-5.4", "openrouter/minimax/minimax-m2.5"],
              fields: [
                { key: "modelPrimary", value: "openai/gpt-5.4" },
                { key: "gatewayBind", value: "loopback" },
                { key: "chatCompletionsEnabled", value: true },
              ],
              validation: { ok: true, valid: true },
            },
            validation: { ok: true, valid: true },
            healthCheck: { status: "healthy", url: "https://gateway.example.test/health" },
            guidance: ["Remote config rollback restored the snapshot saved as remote-config-backup-1."],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
              { label: "openclaw.remote.target", value: "remote" },
              { label: "openclaw.remote.writeAccess", value: "blocked" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    expect(await screen.findByText("OpenClaw 操作历史")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 操作历史");
    await user.click(await screen.findByRole("button", { name: "恢复到此状态" }));

    const rollbackDialog = screen.getByRole("alertdialog", { name: "恢复远端 OpenClaw 配置状态" });
    expect(rollbackDialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复回滚点" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "我确认要用选中的回滚点覆盖当前远端 OpenClaw 配置。" }));
    await user.type(within(rollbackDialog).getByRole("textbox", { name: "审计备注" }), "回滚到稳定版本");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "恢复回滚点" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "恢复回滚点" }));

    await waitFor(() => {
      const rollbackCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/openclaw/config" && options?.method === "POST");
      expect(rollbackCall).toBeTruthy();
      const rollbackBody = JSON.parse(rollbackCall[1].body);
      expect(rollbackBody).toEqual({
        action: "rollback",
        agentId: "",
        backupId: "backup-1",
        remoteAuthorization: {
          confirmed: true,
          note: "回滚到稳定版本",
        },
      });
    });

    await ensureEnvironmentSectionExpanded(user, "OpenClaw 配置");
    expect(await screen.findByText("remote-config-backup-1")).toBeInTheDocument();
  });

  it("restores a local rollback point from the operation history panel", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === "/api/openclaw/history") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            entries: [
              {
                id: "entry-local-rollback-source",
                scope: "config",
                action: "apply+restart",
                target: "local",
                outcome: "success",
                ok: true,
                finishedAt: 1773912000000,
                summary: "Stored local rollback point local-config-backup-1.",
                backupId: "backup-local-1",
                backupLabel: "local-config-backup-1",
                backupPath: "/Users/marila/.openclaw/openclaw.json.backup.20260319T101112Z",
              },
            ],
          }),
        };
      }
      if (url === "/api/openclaw/config" && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            configPath: "/Users/marila/.openclaw/openclaw.json",
            baseHash: "local-hash-1",
            modelOptions: ["openai/gpt-5.4", "openrouter/minimax/minimax-m2.5"],
            fields: [
              { key: "modelPrimary", value: "openrouter/minimax/minimax-m2.5" },
              { key: "gatewayBind", value: "lan" },
              { key: "chatCompletionsEnabled", value: false },
            ],
            validation: { ok: true, valid: true },
          }),
        };
      }
      if (url === "/api/openclaw/update") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            installed: true,
            currentVersion: "2026.3.13",
            targetVersion: "2026.3.13",
            availability: { available: false },
            update: { installKind: "package", packageManager: "pnpm" },
            channel: { value: "stable", label: "stable (default)" },
            preview: { actions: [] },
          }),
        };
      }
      if (url === "/api/openclaw/config" && init?.method === "POST") {
        expect(JSON.parse(init.body)).toEqual({
          action: "rollback",
          agentId: "main",
          backupId: "backup-local-1",
          remoteAuthorization: {
            confirmed: true,
            note: "restore local state",
          },
        });
        return {
          ok: true,
          json: async () => ({
            ok: true,
            rolledBack: true,
            backupPath: "/Users/marila/.openclaw/openclaw.json.backup.20260319T101112Z",
            backupReference: { id: "backup-local-1", label: "local-config-backup-1" },
            state: {
              ok: true,
              configPath: "/Users/marila/.openclaw/openclaw.json",
              baseHash: "local-hash-2",
              modelOptions: ["openai/gpt-5.4", "openrouter/minimax/minimax-m2.5"],
              fields: [
                { key: "modelPrimary", value: "openai/gpt-5.4" },
                { key: "gatewayBind", value: "loopback" },
                { key: "chatCompletionsEnabled", value: true },
              ],
              validation: { ok: true, valid: true },
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithTooltip(
      <InspectorPanel
        activeTab="environment"
        artifacts={[]}
        currentAgentId="main"
        currentWorkspaceRoot="/Users/marila/.openclaw/workspace"
        files={[]}
        peeks={{
          environment: {
            summary: "这里列出 OpenClaw 只读诊断信息。",
            items: [
              { label: "openclaw.version", value: "1.2.3" },
              { label: "openclaw.runtime.profile", value: "openclaw" },
            ],
          },
          workspace: null,
          terminal: null,
          browser: null,
        }}
        setActiveTab={() => {}}
        taskTimeline={[]}
      />,
    );

    expect(await screen.findByText("OpenClaw 操作历史")).toBeInTheDocument();
    await ensureEnvironmentSectionExpanded(user, "OpenClaw 操作历史");
    await user.click(screen.getByRole("button", { name: "恢复到此状态" }));

    const rollbackDialog = screen.getByRole("alertdialog", { name: "恢复本机 OpenClaw 配置状态" });
    await user.click(within(rollbackDialog).getByRole("checkbox", { name: "我确认要用选中的回滚点覆盖当前本机 OpenClaw 配置。" }));
    await user.type(within(rollbackDialog).getByRole("textbox", { name: "审计备注" }), "restore local state");
    await user.click(within(rollbackDialog).getByRole("button", { name: "恢复回滚点" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/openclaw/config",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
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

  it("hides the session files section when there are no session files", async () => {
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
    await userEvent.setup().click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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
              items: [{ label: "gateway.port", value: "18789" }],
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
    expect(within(sheet).getByText("Gateway 配置")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Gateway 配置 查看详情" }));
    expect(within(sheet).getByText("gateway.port")).toBeInTheDocument();
    expect(within(sheet).getByText("18789")).toBeInTheDocument();

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

    expect(screen.getByRole("button", { name: "workspace 文件 查看详情" })).toHaveTextContent("42");
    expect(screen.getByRole("button", { name: "workspace 文件 查看详情" })).toBeInTheDocument();
    expect(screen.queryByText("package.json")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "src 查看详情" })).not.toBeInTheDocument();
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

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));

    expect(screen.getByRole("button", { name: "src 查看详情" })).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: /workspace/i })).toBeInTheDocument();
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
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/workspace-tree"))).toHaveLength(0);
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
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/workspace-tree"))).toHaveLength(0);
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    const filterInput = screen.getByRole("textbox", { name: "过滤 workspace 文件" });
    expect(screen.queryByRole("button", { name: "清空 workspace 过滤" })).not.toBeInTheDocument();

    await user.type(filterInput, ".md");

    expect(await screen.findByRole("button", { name: "清空 workspace 过滤" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeInTheDocument();
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
    fetchMock.mockClear();

    const filterInput = screen.getByRole("textbox", { name: "过滤 workspace 文件" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    });
    await act(async () => {
      fireEvent.change(filterInput, { target: { value: "lesson" } });
    });

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/workspace-tree"))).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/workspace-tree"))).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const workspaceCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/workspace-tree"));
    expect(workspaceCalls).toHaveLength(1);
    expect(workspaceCalls[0][0]).toContain("filter=lesson");
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

    await userEvent.setup().click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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

  it("does not blank the workspace tree when a later snapshot temporarily omits workspace entries", async () => {
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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
              workspace: {
                summary: "工作区摘要",
                items: [],
              },
              terminal: null,
              browser: null,
              environment: null,
            }}
            renderPeek={(_, fallback) => fallback}
            setActiveTab={setActiveTab}
            taskTimeline={[]}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("App.jsx")).toBeInTheDocument();
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

    await userEvent.setup().click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["重命名", "预览", "编辑", "在 访达 中显示", "在 VS Code 中打开", "复制路径"]);
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    await user.click(screen.getByRole("button", { name: "src 查看详情" }));
    await user.pointer([
      {
        target: screen.getByRole("button", { name: "src 收起详情" }),
        keys: "[MouseRight]",
      },
    ]);

    expect(await screen.findByRole("menu", { name: "文件菜单" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "粘贴到此处" })).toBeInTheDocument();
    const revealItem = screen.getByRole("menuitem", { name: /在 .* 中打开/ });
    expect(revealItem).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "复制路径" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "预览" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["重命名", "刷新", "粘贴到此处", revealItem.textContent, "复制路径"]);
  });

  it("renames files from the context menu and updates the session tree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url === "/api/file-manager/rename") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              path: "/Users/marila/projects/lalaclaw/AGENTS.md",
              nextPath: "/Users/marila/projects/lalaclaw/README.md",
              name: "README.md",
              kind: "文件",
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
    await user.pointer([{ target: screen.getByRole("button", { name: "AGENTS.md" }), keys: "[MouseRight]" }]);
    await user.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const input = screen.getByLabelText("新名称");
    await user.clear(input);
    await user.type(input, "README.md");
    await user.click(screen.getByRole("button", { name: "重命名" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/file-manager/rename",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/Users/marila/projects/lalaclaw/AGENTS.md", nextName: "README.md" }),
        }),
      );
    });
    expect(await screen.findByRole("button", { name: "README.md" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AGENTS.md" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before changing a file extension", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        path: "/Users/marila/projects/lalaclaw/AGENTS.md",
        nextPath: "/Users/marila/projects/lalaclaw/AGENTS.txt",
        name: "AGENTS.txt",
        kind: "文件",
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

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
    await user.pointer([{ target: screen.getByRole("button", { name: "AGENTS.md" }), keys: "[MouseRight]" }]);
    await user.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const input = screen.getByLabelText("新名称");
    await user.clear(input);
    await user.type(input, "AGENTS.txt");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("确认修改文件后缀？")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "/api/file-manager/rename",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "仍然修改后缀" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/file-manager/rename",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/Users/marila/projects/lalaclaw/AGENTS.md", nextName: "AGENTS.txt" }),
        }),
      );
    });
  });

  it("renames workspace directories from the context menu and updates the tree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url === "/api/file-manager/rename") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              path: "/Users/marila/projects/lalaclaw/src",
              nextPath: "/Users/marila/projects/lalaclaw/app",
              name: "app",
              kind: "目录",
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
        currentWorkspaceRoot="/Users/marila/projects/lalaclaw"
        files={[]}
        peeks={{
          workspace: {
            summary: "工作区摘要",
            items: [],
            entries: [
              { path: "/Users/marila/projects/lalaclaw/src", fullPath: "/Users/marila/projects/lalaclaw/src", kind: "目录", hasChildren: false },
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    await user.pointer([{ target: screen.getByRole("button", { name: "src 查看详情" }), keys: "[MouseRight]" }]);
    await user.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const input = screen.getByLabelText("新名称");
    await user.clear(input);
    await user.type(input, "app");
    await user.click(screen.getByRole("button", { name: "重命名" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/file-manager/rename",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/Users/marila/projects/lalaclaw/src", nextName: "app" }),
        }),
      );
    });
    expect(await screen.findByRole("button", { name: "app 查看详情" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "src 查看详情" })).not.toBeInTheDocument();
  });

  it("opens workspace directories in Finder from the context menu", async () => {
    const originalPlatform = window.navigator.platform;
    Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url === "/api/file-manager/reveal") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              label: "Finder",
              path: "/Users/marila/projects/lalaclaw/src",
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

    try {
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
      await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
      await user.click(screen.getByRole("button", { name: "src 查看详情" }));
      await user.pointer([
        {
          target: screen.getByRole("button", { name: "src 收起详情" }),
          keys: "[MouseRight]",
        },
      ]);
      await user.click(await screen.findByRole("menuitem", { name: "在 访达 中打开" }));

      expect(fetch).toHaveBeenCalledWith(
        "/api/file-manager/reveal",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "/Users/marila/projects/lalaclaw/src" }),
        }),
      );
    } finally {
      Object.defineProperty(window.navigator, "platform", { configurable: true, value: originalPlatform });
    }
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
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

  it("marks the clicked folder as selected and saves pasted files into that directory", async () => {
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
              ? []
              : [{ path: "/Users/marila/projects/lalaclaw/src/clip.png", fullPath: "/Users/marila/projects/lalaclaw/src/clip.png", kind: "文件" }],
          }),
        };
      }
      if (url === "/api/file-manager/paste") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            directoryPath: "/Users/marila/projects/lalaclaw/src",
            items: [{ path: "/Users/marila/projects/lalaclaw/src/clip.png", name: "clip.png", kind: "文件" }],
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    const srcButton = screen.getByRole("button", { name: "src 查看详情" });
    await user.click(srcButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "src 收起详情" })).toHaveAttribute("data-selected", "true");
    });

    fireEvent.paste(window, {
      clipboardData: {
        files: [new File(["image-bytes"], "clip.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/file-manager/paste",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("\"directoryPath\":\"/Users/marila/projects/lalaclaw/src\""),
        }),
      );
    });
    expect(await screen.findAllByText("clip.png")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "本次会话文件 收起详情" })).toHaveTextContent("1");
    expect(screen.getByText("已将 1 个剪贴板文件保存到 src。")).toBeInTheDocument();
  });

  it("enables the directory paste context action when the clipboard has a pasteable image", async () => {
    vi.spyOn(clipboardUtils, "clipboardHasPasteableFiles").mockResolvedValue(true);
    vi.spyOn(clipboardUtils, "readClipboardFileEntries").mockResolvedValue([
      {
        kind: "upload",
        file: new File(["image-bytes"], "pasted-file-1.png", { type: "image/png" }),
      },
    ]);

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
              ? []
              : [{ path: "/Users/marila/projects/lalaclaw/src/pasted-file-1.png", fullPath: "/Users/marila/projects/lalaclaw/src/pasted-file-1.png", kind: "文件" }],
          }),
        };
      }
      if (url === "/api/file-manager/paste") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            directoryPath: "/Users/marila/projects/lalaclaw/src",
            items: [{ path: "/Users/marila/projects/lalaclaw/src/pasted-file-1.png", name: "pasted-file-1.png", kind: "文件" }],
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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    await user.pointer([
      {
        target: screen.getByRole("button", { name: "src 查看详情" }),
        keys: "[MouseRight]",
      },
    ]);

    const pasteItem = await screen.findByRole("menuitem", { name: "粘贴到此处" });
    await waitFor(() => {
      expect(pasteItem).toBeEnabled();
    });

    await user.click(pasteItem);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/file-manager/paste",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("\"directoryPath\":\"/Users/marila/projects/lalaclaw/src\""),
        }),
      );
    });
    expect(await screen.findByText("已将 1 个剪贴板文件保存到 src。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本次会话文件 收起详情" })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "创建 收起详情" })).toBeInTheDocument();
    expect(screen.getByText("pasted-file-1.png")).toBeInTheDocument();
  });

  it("disables the directory paste context action when the clipboard has no files or images", async () => {
    vi.spyOn(clipboardUtils, "clipboardHasPasteableFiles").mockResolvedValue(false);

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
    await user.click(screen.getByRole("button", { name: "workspace 文件 查看详情" }));
    await user.pointer([
      {
        target: screen.getByRole("button", { name: "src 查看详情" }),
        keys: "[MouseRight]",
      },
    ]);

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "粘贴到此处" })).toBeDisabled();
    });
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
