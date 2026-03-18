import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionOverview } from "@/components/command-center/session-overview";
import { lobsterWalkTuning, sampleLobsterCompanionCount, shouldSpawnLobsterCompanions } from "@/components/command-center/lobster-walk-tuning";
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

  it("searches DingTalk sessions from the agent tab trigger and switches to the selected result", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onSearchSessions = vi.fn().mockResolvedValue([
      {
        agentId: "main",
        preview: "这是最近一条和发布群有关的消息。",
        sessionKey: "agent:main:openai-user:dingtalk-connector:release-room",
        sessionUser: "dingtalk-connector:release-room",
        title: "发布群",
        updatedLabel: "03/17 12:10",
      },
    ]);
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
    expect(screen.getByRole("menuitem", { name: "飞书" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "企微" })).toBeInTheDocument();
    expect(dingTalkItem).toHaveClass("cursor-pointer");
    const dingTalkIcon = within(dingTalkItem).getByText("钉");
    expect(dingTalkIcon).toHaveClass("self-center");
    expect(dingTalkIcon).toHaveClass("bg-[#1677ff]");
    await user.click(screen.getByRole("menuitem", { name: "钉钉" }));

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    expect(screen.getByText("输入最近消息关键词等以便找到真正要同步的钉钉会话，比如你在钉钉发一句：宝塔镇河妖，然后就在这里搜“宝塔镇河妖”就能找到啦！")).toBeInTheDocument();
    expect(screen.getByText("输入关键词找会话，或直接点搜索直接找。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveClass("rounded-full");
    expect(screen.getByPlaceholderText("输入最近消息的关键词最准，其次是昵称…")).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索词"), "发布群");
    await user.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(onSearchSessions).toHaveBeenCalledWith("发布群", { channel: "dingtalk-connector" });
    });

    expect(await screen.findByText("发布群")).toBeInTheDocument();
    expect(screen.getByText(/dingtalk-connector:release-room/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "同步此会话" }));

    await waitFor(() => {
      expect(onSelectSearchedSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionUser: "dingtalk-connector:release-room",
          title: "发布群",
        }),
      );
    });
  });

  it("closes the DingTalk search dialog from the circular close button", async () => {
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
            onSearchSessions={vi.fn().mockResolvedValue([])}
            onSelectSearchedSession={vi.fn()}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));
    await user.click(screen.getByRole("menuitem", { name: "钉钉" }));
    await user.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "定位钉钉会话" })).not.toBeInTheDocument();
    });
  });

  it("shows the full DingTalk session id in search results", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const fullSessionUser = "{\"channel\":\"dingtalk-connector\",\"accountid\":\"__default__\",\"chattype\":\"direct\",\"peerid\":\"398058\",\"sendername\":\"马锐拉\"}";
    const displaySessionUser = "dingtalk-connector:__default__:direct:398058:马锐拉";
    const onSearchSessions = vi.fn().mockResolvedValue([
      {
        agentId: "main",
        displaySessionUser,
        preview: "最近一条消息",
        sessionKey: `agent:main:openai-user:${fullSessionUser}`,
        sessionUser: fullSessionUser,
        title: "马锐拉",
        updatedLabel: "03/17 14:38",
      },
    ]);

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
            onSearchSessions={onSearchSessions}
            onSelectSearchedSession={vi.fn()}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));
    await user.click(screen.getByRole("menuitem", { name: "钉钉" }));
    await user.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(onSearchSessions).toHaveBeenCalledWith("", { channel: "dingtalk-connector" });
    });

    const sessionLine = await screen.findByText((content) => content.includes(displaySessionUser));
    expect(sessionLine).toBeInTheDocument();
    expect(sessionLine).not.toHaveClass("rounded-md");
    expect(sessionLine).not.toHaveClass("bg-background/55");
    expect(screen.queryByText((content) => content.includes(fullSessionUser))).not.toBeInTheDocument();
  });

  it("searches Feishu sessions from the IM menu", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onSearchSessions = vi.fn().mockResolvedValue([
      {
        agentId: "main",
        displaySessionUser: "feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
        preview: "宝塔镇河妖",
        sessionKey: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
        sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
        title: "飞书小助手",
        updatedLabel: "03/17 14:38",
      },
    ]);

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
            onSearchSessions={onSearchSessions}
            onSelectSearchedSession={vi.fn()}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));
    await user.click(screen.getByRole("menuitem", { name: "飞书" }));

    expect(screen.getByText("定位飞书会话")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(onSearchSessions).toHaveBeenCalledWith("", { channel: "feishu" });
    });

    expect(await screen.findByText("飞书小助手")).toBeInTheDocument();
    expect(screen.getByText(/feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58/)).toBeInTheDocument();
  });

  it("searches WeCom sessions from the IM menu", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    const onSearchSessions = vi.fn().mockResolvedValue([
      {
        agentId: "main",
        displaySessionUser: "wecom:direct:marila",
        preview: "宝塔镇河妖",
        sessionKey: "agent:main:wecom:direct:marila",
        sessionUser: "agent:main:wecom:direct:marila",
        title: "marila",
        updatedLabel: "03/17 17:03",
      },
    ]);

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
            onSearchSessions={onSearchSessions}
            onSelectSearchedSession={vi.fn()}
            onThinkModeChange={() => {}}
            session={createSession()}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换 Agent" }));
    await user.click(screen.getByRole("menuitem", { name: "企微" }));

    expect(screen.getByText("定位企业微信会话")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(onSearchSessions).toHaveBeenCalledWith("", { channel: "wecom" });
    });

    expect(await screen.findByText("marila")).toBeInTheDocument();
    expect(screen.getByText(/wecom:direct:marila/)).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: "快捷键提示" })).toBeInTheDocument();
    expect(screen.getByText("这里列出当前可用的快捷键以及它们对应的功能。")).toBeInTheDocument();
    expect(screen.getByText("打开快捷键提示")).toBeInTheDocument();
    expect(screen.getByText("Enter")).toBeInTheDocument();
    expect(screen.getByText("Shift + Enter")).toBeInTheDocument();

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

    expect(screen.getByRole("dialog", { name: "快捷键提示" })).toBeInTheDocument();
    expect(screen.getByText("Ctrl + /")).toBeInTheDocument();
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
  });
});
