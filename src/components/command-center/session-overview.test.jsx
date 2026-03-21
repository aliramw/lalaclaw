import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPufferEdgeResponse, resolveAquaticWalkDurationMs, resolvePufferPitchForVerticalEdge, resolveWalkerEndAtAfterReroute, SessionOverview } from "@/components/command-center/session-overview";
import { lobsterWalkTuning, sampleLobsterCompanionCount, samplePufferPitchDegrees, shouldSpawnLobsterCompanions } from "@/components/command-center/lobster-walk-tuning";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

function createSession(overrides = {}) {
  return {
    model: "openclaw",
    agentId: "main",
    status: "空闲",
    contextUsed: 1200,
    contextMax: 16000,
    tokens: "12 in / 8 out",
    queue: "empty",
    updatedLabel: "刚刚",
    auth: "token",
    runtime: "mock",
    time: "10:00:00",
    sessionKey: "agent:main:openai-user:demo",
    mode: "openclaw",
    thinkMode: "off",
    ...overrides,
  };
}

describe("SessionOverview", () => {
  let platformSpy;

  beforeEach(() => {
    window.localStorage.clear();
    platformSpy = vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders session metadata and toggles fast mode", async () => {
    const onFastModeChange = vi.fn();
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={onFastModeChange}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("LalaClaw")).toBeInTheDocument();
    expect(screen.getByText("已开启")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("1200 / 16000");

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "跟随系统" }));
    expect((await screen.findAllByText("快捷键：Shift + Cmd + F")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "快速模式 已开启" }));

    expect(onFastModeChange).toHaveBeenCalledWith(false);
  });

  it("renders a context usage ring that matches the current context color", () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            resolvedTheme="light"
            session={createSession({ contextUsed: 1200, contextMax: 16000 })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const ring = screen.getByTestId("context-usage-ring");
    expect(ring).toBeInTheDocument();
    expect(ring).toHaveStyle({ color: "#0f9f6e" });
  });

  it("shows empty model selection state", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={[]}
            availableModels={[]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model=""
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession({ model: "", auth: "", time: "", sessionKey: "" })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("切换模型"));

    expect(screen.getByText("暂无可选模型")).toBeInTheDocument();
  });

  it("aligns the model menu to the left edge when the trigger is near the left side", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw", "openrouter/auto"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const trigger = screen.getByLabelText("切换模型");
    const triggerWrapper = trigger.parentElement;
    expect(triggerWrapper).not.toBeNull();
    triggerWrapper.getBoundingClientRect = vi.fn(() => ({
      bottom: 100,
      height: 56,
      left: 40,
      right: 260,
      top: 44,
      width: 220,
      x: 40,
      y: 44,
      toJSON: () => ({}),
    }));

    const user = userEvent.setup();
    await user.click(trigger);

    expect(screen.getByRole("menu")).toHaveAttribute("data-align-strategy", "start");
  });

  it("aligns the model menu to the right edge when the trigger is near the right side", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw", "openrouter/auto"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const trigger = screen.getByLabelText("切换模型");
    const triggerWrapper = trigger.parentElement;
    expect(triggerWrapper).not.toBeNull();
    triggerWrapper.getBoundingClientRect = vi.fn(() => ({
      bottom: 100,
      height: 56,
      left: 980,
      right: 1200,
      top: 44,
      width: 220,
      x: 980,
      y: 44,
      toJSON: () => ({}),
    }));

    const user = userEvent.setup();
    await user.click(trigger);

    expect(screen.getByRole("menu")).toHaveAttribute("data-align-strategy", "end");
  });

  it("shows a logout button in token access mode and calls the logout handler", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onAccessLogout = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            accessMode="token"
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAccessLogout={onAccessLogout}
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(onAccessLogout).toHaveBeenCalledTimes(1);
    });
  });

  it("opens IM sessions directly from the agent tab trigger", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onOpenImSession = vi.fn().mockResolvedValue(undefined);
    const onSearchSessions = vi.fn().mockResolvedValue([]);
    const onSelectSearchedSession = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="agent-tab"
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onOpenImSession={onOpenImSession}
            onSearchSessions={onSearchSessions}
            onSelectSearchedSession={onSelectSearchedSession}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "切换 Agent" });

    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("选择 Agent 或 IM 对话");

    await user.click(trigger);
    expect(screen.getByText("Agent 对话")).toBeInTheDocument();
    expect(screen.getByText("IM 对话")).toBeInTheDocument();
    const dingTalkItem = screen.getByRole("menuitem", { name: "钉钉" });
    const feishuItem = screen.getByRole("menuitem", { name: "飞书" });
    const wecomItem = screen.getByRole("menuitem", { name: "企微" });
    expect(dingTalkItem.querySelector('img[src="/im-logo-dingtalk.svg"]')).not.toBeNull();
    expect(feishuItem).toHaveClass("cursor-pointer");
    expect(feishuItem.querySelector('img[src="/im-logo-feishu.svg"]')).not.toBeNull();
    expect(wecomItem.querySelector('img[src="/im-logo-wecom.svg"]')).not.toBeNull();
    await user.click(feishuItem);

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(onOpenImSession).toHaveBeenCalledWith("feishu");
    });

    expect(onSearchSessions).not.toHaveBeenCalled();
    expect(onSelectSearchedSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "定位飞书会话" })).not.toBeInTheDocument();
  });

  it("hides IM channels that already have an open tab from the switcher menu", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="agent-tab"
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onOpenImSession={vi.fn()}
            onThinkModeChange={() => {}}
            openSessionUsers={[
              "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
              "agent:main:wecom:direct:marila",
            ]}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));

    expect(screen.getByRole("menuitem", { name: "钉钉" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "飞书" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "企微" })).not.toBeInTheDocument();
  });

  it("disables model, fast mode, think mode, and agent-session controls until OpenClaw is connected", () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onAgentChange = vi.fn();
    const onFastModeChange = vi.fn();
    const onModelChange = vi.fn();
    const onThinkModeChange = vi.fn();

    render(
      <I18nProvider>
        <TooltipProvider>
          <>
            <SessionOverview
              availableAgents={["main", "expert"]}
              availableModels={["openai-codex/gpt-5.4", "openrouter/minimax/minimax-m2.5"]}
              fastMode={false}
              formatCompactK={(value) => `${value}`}
              layout="status"
              model="openai-codex/gpt-5.4"
              onAgentChange={onAgentChange}
              onFastModeChange={onFastModeChange}
              onModelChange={onModelChange}
              onThinkModeChange={onThinkModeChange}
              session={createSession({ mode: "mock", status: "空闲" })}
            />
            <SessionOverview
              availableAgents={["main", "expert"]}
              availableModels={["openai-codex/gpt-5.4"]}
              fastMode={false}
              formatCompactK={(value) => `${value}`}
              layout="agent-tab"
              model="openai-codex/gpt-5.4"
              onAgentChange={onAgentChange}
              onFastModeChange={onFastModeChange}
              onModelChange={onModelChange}
              onThinkModeChange={onThinkModeChange}
              openAgentIds={["main"]}
              session={createSession({ mode: "mock", status: "空闲" })}
            />
          </>
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByLabelText("切换模型")).toBeDisabled();
    expect(screen.getByRole("button", { name: "快速模式 已关闭" })).toBeDisabled();
    expect(screen.getByLabelText("切换思考模式")).toBeDisabled();
    expect(screen.getByRole("button", { name: "切换 Agent" })).toBeDisabled();
  });

  it("shows context guidance in the tooltip", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.hover(screen.getAllByText((_, element) => element?.textContent === "1200 / 16000")[0]);

    expect((await screen.findAllByText("当前上下文长度 / 最大长度")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/当上下文越来越长，考虑成本和模型效果/).length).toBeGreaterThan(0);
  });

  it("shows runtime transport and socket state for live OpenClaw sessions", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="status"
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            runtimeFallbackReason="Ping timeout"
            runtimeReconnectAttempts={2}
            runtimeSocketStatus="reconnecting"
            runtimeTransport="ws"
            session={createSession({ mode: "openclaw", status: "空闲" })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("WS / 重连中")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.hover(screen.getByText("WS / 重连中"));

    expect((await screen.findAllByText("传输: WebSocket")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("连接: 重连中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("重连: 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("回退: Ping timeout").length).toBeGreaterThan(0);
  });

  it("uses an ongoing-state label for a connected runtime socket", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="status"
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            runtimeSocketStatus="connected"
            runtimeTransport="ws"
            session={createSession({ mode: "openclaw", status: "空闲" })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("WS / 在线")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.hover(screen.getByText("WS / 在线"));

    expect((await screen.findAllByText("传输: WebSocket")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("连接: 在线").length).toBeGreaterThan(0);
  });

  it("prefers the selected model over the stale runtime model in the header", () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openai-codex/gpt-5.4", "openrouter/qwen/qwen3.5-397b-a17b"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model=""
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession({
              model: "openai-codex/gpt-5.4",
              selectedModel: "openrouter/qwen/qwen3.5-397b-a17b",
            })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("openrouter/qwen/qwen3.5-397b-a17b")).toBeInTheDocument();
  });

  it("marks the first available model as default in the model menu", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openai-codex/gpt-5.4", "openrouter/google/gemini-3-flash-preview"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openai-codex/gpt-5.4"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession({ model: "openai-codex/gpt-5.4" })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("切换模型"));

    expect(screen.getByRole("menuitemcheckbox", { name: "openai-codex/gpt-5.4 (默认)" })).toBeInTheDocument();
  });

  it("keeps the theme toggle as compact as the language switcher", async () => {
    window.localStorage.setItem(localeStorageKey, "en");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="dark"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(await screen.findByRole("button", { name: "Switch language" })).toHaveClass("h-9");
    expect(screen.getByRole("button", { name: "Follow system" }).parentElement).toHaveClass("h-9");
    expect(screen.getByRole("button", { name: "Follow system" })).toHaveClass("h-8", "min-w-[2.5rem]");
    expect(screen.getByRole("button", { name: "Light mode" })).toHaveClass("h-8", "min-w-[2.5rem]");
    expect(screen.getByRole("button", { name: "Dark mode" })).toHaveClass("h-8", "min-w-[2.5rem]");
  });

  it("shows ctrl shortcuts in theme tooltips on Windows", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    platformSpy.mockReturnValue("Win32");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="system"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "跟随系统" }));
    expect((await screen.findAllByText("快捷键：Shift + Ctrl + F")).length).toBeGreaterThan(0);
  });

  it("hides vertical overflow in the header rows that can scroll horizontally", () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    const { container: fullContainer } = render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(fullContainer.querySelector(".overflow-x-auto.overflow-y-hidden")).toBeTruthy();

    const { container: statusContainer } = render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            layout="status"
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(statusContainer.querySelector(".overflow-x-auto.overflow-y-hidden")).toBeTruthy();
  });

  it("opens the shortcut dialog from the keyboard icon and closes it from the close button", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="system"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "快捷键提示" });

    await user.hover(trigger);
    expect((await screen.findAllByText("快捷键提示")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Cmd + /")).length).toBeGreaterThan(0);

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "快捷键提示" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("这里列出当前可用的快捷键以及它们对应的功能。")).toBeInTheDocument();
    expect(within(dialog).getByText("打开快捷键提示")).toBeInTheDocument();
    expect(within(dialog).getByText("文件预览")).toBeInTheDocument();
    expect(within(dialog).getByText("编辑")).toBeInTheDocument();
    expect(within(dialog).getByText("保存")).toBeInTheDocument();
    expect(within(dialog).getByText("关闭预览")).toBeInTheDocument();
    expect(within(dialog).getByText("E")).toBeInTheDocument();
    expect(within(dialog).getByText("Cmd + S")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Esc").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Enter")).toBeInTheDocument();
    expect(within(dialog).getByText("Shift + Enter")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭快捷键提示" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "快捷键提示" })).not.toBeInTheDocument();
    });
  });

  it("opens the shortcut dialog with cmd or ctrl slash and closes it on escape", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    platformSpy.mockReturnValue("Win32");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="system"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.keyboard("{Control>}/{/Control}");

    const dialog = screen.getByRole("dialog", { name: "快捷键提示" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Ctrl + /")).toBeInTheDocument();
    expect(within(dialog).getByText("E")).toBeInTheDocument();
    expect(within(dialog).getByText("Ctrl + S")).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "快捷键提示" }));
    expect((await screen.findAllByText("Ctrl + /")).length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "快捷键提示" })).not.toBeInTheDocument();
    });
  });

  it("shows composer shortcuts for double-enter send mode", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            composerSendMode="double-enter-send"
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="system"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "快捷键提示" }));

    expect(screen.getByText("Shift + Enter / 连按两次 Enter")).toBeInTheDocument();
    expect(screen.getByText("Enter")).toBeInTheDocument();
  });

  it("does not open the shortcut dialog with ctrl slash on macOS", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    platformSpy.mockReturnValue("MacIntel");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="system"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.keyboard("{Control>}/{/Control}");

    expect(screen.queryByRole("dialog", { name: "快捷键提示" })).not.toBeInTheDocument();
  });

  it("closes the agent tooltip after switching agents", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onAgentChange = vi.fn();

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main", "expert"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="agent-tab"
            model="openclaw"
            onAgentChange={onAgentChange}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            openAgentIds={["main"]}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "切换 Agent" });

    await user.hover(trigger);
    expect(await screen.findByText("选择 Agent 或 IM 对话", { selector: "div" })).toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "expert" }));

    expect(onAgentChange).toHaveBeenCalledWith("expert");
    await waitFor(() => {
      expect(screen.queryByText("选择 Agent 或 IM 对话", { selector: "div" })).not.toBeInTheDocument();
    });
  });

  it("does not show the language tooltip again immediately after switching languages", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            onThemeChange={() => {}}
            resolvedTheme="dark"
            session={createSession()}
            theme="dark"
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "切换语言" });

    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("切换语言");

    await user.click(trigger);
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Français" }));

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    await user.hover(trigger);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    await user.unhover(trigger);
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Changer de langue");
  });

  it("hides agents that already have an open session from the switcher menu", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main", "expert", "writer"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="agent-tab"
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            openAgentIds={["main", "expert"]}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));

    expect(screen.queryByRole("menuitem", { name: "main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "expert" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "writer" })).toBeInTheDocument();
  });

  it("shows the new-agent hint when every agent already has an open session", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
        <TooltipProvider>
          <SessionOverview
            availableAgents={["main", "expert"]}
            availableModels={["openclaw"]}
            fastMode={false}
            formatCompactK={(value) => `${value}`}
            layout="agent-tab"
            model="openclaw"
            onAgentChange={() => {}}
            onFastModeChange={() => {}}
            onModelChange={() => {}}
            onThinkModeChange={() => {}}
            openAgentIds={["main", "expert"]}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));

    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("w-[300px]");
    expect(menu).toHaveTextContent("可以和主 Agent 对话让他帮你创建新的 Agent，比如：");
    expect(menu).toHaveTextContent("帮我创建一个新的 Agent，名字叫 Developer（中文名：程序员），他的职责是...");
  });

  it("keeps the lobster easter egg performance tuning tightened", () => {
    expect(lobsterWalkTuning).toEqual({
      companionSpawnProbability: 0.5,
      companionMinCount: 1,
      companionMaxCount: 10,
      crabSpawnProbability: 0.05,
      octopusSpawnProbability: 0.01,
      pufferSpawnProbability: 0.03,
      fishSpawnProbability: 0.08,
      tropicalFishSpawnProbability: 0.02,
      pufferMaxPitchDegrees: 20,
      aquaticSpeedMultiplier: 0.5,
      rerouteCooldownMs: 900,
      primaryFontSizePx: 48,
    });
  });

  it("uses the updated lobster companion spawn rules", () => {
    expect(shouldSpawnLobsterCompanions(0.5)).toBe(true);
    expect(shouldSpawnLobsterCompanions(0.500001)).toBe(false);
    expect(sampleLobsterCompanionCount(0)).toBe(1);
    expect(sampleLobsterCompanionCount(0.42)).toBe(5);
    expect(sampleLobsterCompanionCount(0.9999)).toBe(10);
    expect(samplePufferPitchDegrees(0)).toBe(-20);
    expect(samplePufferPitchDegrees(0.5)).toBe(0);
    expect(samplePufferPitchDegrees(0.9999)).toBeCloseTo(19.996, 3);
  });

  it("flips the puffer immediately when it approaches the left or right edge", () => {
    expect(getPufferEdgeResponse({
      currentLeft: 18,
      currentTop: 160,
      dx: -2,
      dy: 0,
      height: 48,
      viewportHeight: 720,
      viewportWidth: 1280,
      width: 48,
    })).toEqual({ edge: "left", type: "horizontal-flip" });

    expect(getPufferEdgeResponse({
      currentLeft: 1238,
      currentTop: 160,
      dx: 2,
      dy: 0,
      height: 48,
      viewportHeight: 720,
      viewportWidth: 1280,
      width: 48,
    })).toEqual({ edge: "right", type: "horizontal-flip" });
  });

  it("reroutes the puffer immediately when it approaches the top or bottom edge", () => {
    expect(getPufferEdgeResponse({
      currentLeft: 260,
      currentTop: 12,
      dx: -2,
      dy: -0.7,
      height: 48,
      viewportHeight: 720,
      viewportWidth: 1280,
      width: 48,
    })).toEqual({ edge: "top", type: "vertical-reroute" });

    expect(getPufferEdgeResponse({
      currentLeft: 260,
      currentTop: 666,
      dx: 2,
      dy: 0.7,
      height: 48,
      viewportHeight: 720,
      viewportWidth: 1280,
      width: 48,
    })).toEqual({ edge: "bottom", type: "vertical-reroute" });

    expect(getPufferEdgeResponse({
      currentLeft: 260,
      currentTop: 80,
      dx: 2,
      dy: -0.7,
      height: 48,
      viewportHeight: 720,
      viewportWidth: 1280,
      width: 48,
    })).toBeNull();
  });

  it("forces rerouted puffer pitches away from the vertical screen edges", () => {
    expect(resolvePufferPitchForVerticalEdge("top", 0.5)).toBeGreaterThanOrEqual(4);
    expect(resolvePufferPitchForVerticalEdge("bottom", 0.5)).toBeLessThanOrEqual(-4);
    expect(resolvePufferPitchForVerticalEdge("top", 0.49)).toBeGreaterThanOrEqual(4);
    expect(resolvePufferPitchForVerticalEdge("bottom", 0.51)).toBeLessThanOrEqual(-4);
  });

  it("keeps a rerouted walker's original end time instead of extending it", () => {
    expect(resolveWalkerEndAtAfterReroute({
      currentEndAt: 2400,
      fallbackDurationMs: 1600,
      fallbackStartedAt: 1200,
    })).toBe(2400);

    expect(resolveWalkerEndAtAfterReroute({
      currentEndAt: 0,
      fallbackDurationMs: 1600,
      fallbackStartedAt: 1200,
    })).toBe(2800);
  });

  it("slows aquatic walker durations to half the default lobster speed", () => {
    expect(resolveAquaticWalkDurationMs(0)).toBe(0);
    expect(resolveAquaticWalkDurationMs(150)).toBe(2000);
    expect(resolveAquaticWalkDurationMs(300)).toBe(4000);
  });

  it("keeps the aquatic spawn probabilities distinct", () => {
    expect(lobsterWalkTuning.pufferSpawnProbability).toBe(0.03);
    expect(lobsterWalkTuning.fishSpawnProbability).toBe(0.08);
    expect(lobsterWalkTuning.tropicalFishSpawnProbability).toBe(0.02);
    expect(lobsterWalkTuning.fishSpawnProbability).toBeGreaterThan(lobsterWalkTuning.pufferSpawnProbability);
    expect(lobsterWalkTuning.pufferSpawnProbability).toBeGreaterThan(lobsterWalkTuning.tropicalFishSpawnProbability);
  });
});
