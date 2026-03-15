import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionOverview } from "@/components/command-center/session-overview";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

function createSession(overrides = {}) {
  return {
    model: "openclaw",
    agentId: "main",
    contextUsed: 1200,
    contextMax: 16000,
    tokens: "12 in / 8 out",
    queue: "empty",
    updatedLabel: "刚刚",
    auth: "token",
    runtime: "mock",
    time: "10:00:00",
    sessionKey: "agent:main:openai-user:demo",
    mode: "mock",
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

    expect(screen.getByText("LalaClaw.ai")).toBeInTheDocument();
    expect(screen.getByText("已开启")).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("1200 / 16000")).toBeInTheDocument();

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

  it("localizes relative update labels in English", () => {
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
            session={createSession({ updatedLabel: "2m ago" })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
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

    expect(screen.getByText("qwen3.5-397b-a17b")).toBeInTheDocument();
  });

  it("keeps the theme toggle as compact as the language switcher", () => {
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

    expect(screen.getByRole("button", { name: "Switch language" })).toHaveClass("h-8");
    expect(screen.getByRole("button", { name: "Follow system" }).parentElement).toHaveClass("h-8");
    expect(screen.getByRole("button", { name: "Follow system" })).toHaveClass("h-7", "min-w-[2.5rem]");
    expect(screen.getByRole("button", { name: "Light mode" })).toHaveClass("h-7", "min-w-[2.5rem]");
    expect(screen.getByRole("button", { name: "Dark mode" })).toHaveClass("h-7", "min-w-[2.5rem]");
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
});
