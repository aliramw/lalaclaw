import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionOverview } from "@/components/command-center/session-overview";

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
    ...overrides,
  };
}

describe("SessionOverview", () => {
  it("renders session metadata and toggles fast mode", async () => {
    const onFastModeChange = vi.fn();

    render(
      <SessionOverview
        availableAgents={["main"]}
        availableModels={["openclaw"]}
        fastMode
        formatCompactK={(value) => `${value}`}
        model="openclaw"
        onAgentChange={() => {}}
        onFastModeChange={onFastModeChange}
        onModelChange={() => {}}
        session={createSession()}
      />,
    );

    expect(screen.getByText("指挥中心")).toBeInTheDocument();
    expect(screen.getByText("已开启")).toBeInTheDocument();
    expect(screen.getByText("agent:main:openai-user:demo")).toBeInTheDocument();
    expect(screen.getByText("模拟模式")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("switch"));

    expect(onFastModeChange).toHaveBeenCalledWith(false);
  });

  it("shows empty model selection state", async () => {
    render(
      <SessionOverview
        availableAgents={[]}
        availableModels={[]}
        fastMode={false}
        formatCompactK={(value) => `${value}`}
        model=""
        onAgentChange={() => {}}
        onFastModeChange={() => {}}
        onModelChange={() => {}}
        session={createSession({ model: "", auth: "", time: "", sessionKey: "" })}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("切换模型"));

    expect(screen.getByText("暂无可选模型")).toBeInTheDocument();
  });
});
