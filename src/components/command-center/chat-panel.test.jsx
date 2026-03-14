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
    version: "",
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
          session={createSession({ mode: "openclaw", status: "执行中", agentId: "ops", version: "2026.3.13 (61d171a)" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText(/\*?\*?已收到\*?\*?/)).toBeInTheDocument();
    expect(screen.getByText("OpenClaw 在线")).toBeInTheDocument();
    expect(screen.getByText("2026.3.13 (61d171a)")).toBeInTheDocument();
    expect(screen.getByText("ops")).toBeInTheDocument();
    expect(screen.getByText("思考中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
  });

  it("uses adaptive width for short assistant replies and full width for longer ones", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "assistant", content: "收到。", timestamp: 1 },
            {
              role: "assistant",
              content: "这是一个稍长一些的回复，用来验证超过临界值后，assistant 气泡会切换成更宽的展示方式，而不是继续保持自适应宽度。",
              timestamp: 2,
            },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("收到。").closest("[data-bubble-layout]")).toHaveAttribute("data-bubble-layout", "compact");
    expect(screen.getByText(/这是一个稍长一些的回复/).closest("[data-bubble-layout]")).toHaveAttribute("data-bubble-layout", "full");
  });

  it("renders user image attachments and composer attachments", async () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          composerAttachments={[
            {
              id: "composer-image",
              kind: "image",
              name: "draft.png",
              size: 1024,
              dataUrl: "data:image/png;base64,AAAA",
              previewUrl: "data:image/png;base64,AAAA",
            },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              role: "user",
              content: "请看截图",
              timestamp: 1,
              attachments: [
                {
                  id: "msg-image",
                  kind: "image",
                  name: "shot.png",
                  size: 1024,
                  dataUrl: "data:image/png;base64,BBBB",
                  previewUrl: "data:image/png;base64,BBBB",
                },
              ],
            },
          ]}
          onAddAttachments={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onRemoveAttachment={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByAltText("shot.png")).toBeInTheDocument();
    expect(screen.getByAltText("draft.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除 draft.png" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByAltText("shot.png"));
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();
  });
});
