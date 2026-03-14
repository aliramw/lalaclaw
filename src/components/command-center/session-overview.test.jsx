import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    window.localStorage.clear();
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
    expect(screen.getByText("agent:main:openai-user:demo")).toBeInTheDocument();
    expect(screen.getByText("模拟模式")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "跟随系统" }));
    expect((await screen.findAllByText("Shift + Cmd + F")).length).toBeGreaterThan(0);

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

    expect(screen.getByText("openrouter/qwen/qwen3.5-397b-a17b")).toBeInTheDocument();
  });
});
