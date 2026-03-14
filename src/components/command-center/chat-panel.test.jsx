import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { TooltipProvider } from "@/components/ui/tooltip";

function createSession(overrides = {}) {
  return {
    mode: "mock",
    agentId: "main",
    status: "空闲",
    time: "10:00:00",
    ...overrides,
  };
}

describe("ChatPanel", () => {
  it("renders empty state and forwards reset/send actions", async () => {
    const onReset = vi.fn();
    const onSend = vi.fn();
    const onPromptChange = vi.fn();

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onPromptChange={onPromptChange}
          onPromptKeyDown={() => {}}
          onReset={onReset}
          onSend={onSend}
          prompt=""
          promptRef={null}
          session={createSession()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("等待第一条指令")).toBeInTheDocument();
    expect(screen.getByText("模拟模式")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "检查运行状态");
    await user.click(screen.getByLabelText("重置对话"));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onPromptChange).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("renders messages and busy/openclaw status", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "你好", timestamp: 1 },
            { role: "assistant", content: "**已收到**", timestamp: 2, pending: true },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt="处理中"
          promptRef={null}
          session={createSession({ mode: "openclaw", status: "执行中", agentId: "ops" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText(/\*?\*?已收到\*?\*?/)).toBeInTheDocument();
    expect(screen.getByText("OpenClaw 在线")).toBeInTheDocument();
    expect(screen.getByText("ops")).toBeInTheDocument();
    expect(screen.getByText("思考中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });
});
