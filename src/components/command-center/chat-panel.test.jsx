import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { TooltipProvider } from "@/components/ui/tooltip";

function createSession(overrides = {}) {
  return {
    mode: "mock",
    agentId: "main",
    availableMentionAgents: [],
    availableSkills: [],
    status: "空闲",
    time: "10:00:00",
    version: "",
    ...overrides,
  };
}

function MentionHarness({ availableMentionAgents = ["reviewer", "writer"], availableSkills = [], sessionOverrides = {} }) {
  const [prompt, setPrompt] = useState("");

  return (
    <TooltipProvider>
      <ChatPanel
        busy={false}
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[]}
        onPromptChange={setPrompt}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt={prompt}
        promptRef={null}
        session={createSession({ agentId: "main", availableMentionAgents, availableSkills, ...sessionOverrides })}
      />
    </TooltipProvider>
  );
}

describe("ChatPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders empty state and forwards reset/send actions", async () => {
    const onReset = vi.fn();
    const onSend = vi.fn();
    const onPromptChange = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onChatFontSizeChange={() => {}}
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
    expect(screen.getByLabelText("OpenClaw的状态")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "检查运行状态");
    await user.click(screen.getByLabelText("重置对话"));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onPromptChange).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("formats reset tooltip shortcuts for the current platform", async () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onChatFontSizeChange={() => {}}
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

    const user = userEvent.setup();
    await user.hover(screen.getByLabelText("重置对话"));
    expect((await screen.findAllByText("重置对话 (Ctrl + N)")).length).toBeGreaterThan(0);
  });

  it("renders direct font size buttons and forwards the selected size", async () => {
    const onChatFontSizeChange = vi.fn();

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          chatFontSize="small"
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onChatFontSizeChange={onChatFontSizeChange}
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

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "字体大小：小" }));
    expect((await screen.findAllByText("字体大小：小")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "字体大小：大" }));
    expect(onChatFontSizeChange).toHaveBeenCalledWith("large");
  });

  it("uses a two-line default height for the composer", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onChatFontSizeChange={() => {}}
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

    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    expect(textarea).toHaveAttribute("rows", "2");
    expect(textarea).toHaveClass("min-h-[3.75rem]");
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
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt="处理中"
          promptRef={null}
          session={createSession({
            mode: "openclaw",
            status: "执行中",
            agentId: "ops",
            version: "2026.3.13 (61d171a)",
            runtime: "direct · Think: medium · elevated",
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText(/\*?\*?已收到\*?\*?/)).toBeInTheDocument();
    expect(screen.getByText("ops - 当前会话")).toBeInTheDocument();
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
          onChatFontSizeChange={() => {}}
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

  it("opens file previews when clicking tracked files in assistant bubbles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          kind: "text",
          path: "/Users/marila/projects/lalaclaw/workspace/sample.py",
          name: "sample.py",
          content: "print('preview works')\n",
        }),
      })),
    );

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          files={[
            {
              path: "/Users/marila/projects/lalaclaw/workspace/sample.py",
              fullPath: "/Users/marila/projects/lalaclaw/workspace/sample.py",
              kind: "文件",
              primaryAction: "viewed",
            },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[{ role: "assistant", content: "可以先看 `sample.py`。", timestamp: 1 }]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          resolvedTheme="dark"
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "sample.py" }));

    expect(await screen.findByText("python")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("print('preview works')");
  });

  it("routes message and composer images through the shared image preview overlay", async () => {
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
    expect(screen.getByRole("button", { name: "放大图片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();

    await user.click(screen.getByAltText("draft.png"));
    expect(screen.getByRole("button", { name: "向左旋转" })).toBeInTheDocument();
  });

  it("routes pasted files from anywhere on the page through the attachment flow and refocuses the composer", async () => {
    const onAddAttachments = vi.fn(async () => {});
    const promptRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onAddAttachments={onAddAttachments}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={promptRef}
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    const pastedFile = new File(["hello"], "paste.txt", { type: "text/plain" });

    fireEvent.paste(window, {
      clipboardData: {
        files: [pastedFile],
      },
    });

    expect(onAddAttachments).toHaveBeenCalledWith(expect.arrayContaining([pastedFile]));
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });

  it("opens an agent menu on @ and inserts the selected agent into the composer", async () => {
    render(<MentionHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "@wr");

    expect(screen.getByText("writer")).toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /writer/i }));

    expect(textarea).toHaveValue("writer ");
    expect(screen.queryByRole("button", { name: /writer/i })).not.toBeInTheDocument();
  });

  it("supports keyboard navigation for the agent menu and uses a muted highlight", async () => {
    render(<MentionHarness availableMentionAgents={["writer", "expert", "transformer"]} />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "@");

    const writerOption = screen.getByRole("button", { name: /writer/i });
    expect(writerOption).toHaveClass("bg-foreground/10");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(textarea).toHaveValue("expert ");
    expect(screen.queryByRole("button", { name: /expert/i })).not.toBeInTheDocument();
  });

  it("shows skills after agents and inserts the selected skill without the trigger character", async () => {
    render(<MentionHarness availableMentionAgents={["writer"]} availableSkills={[{ name: "coding", ownerAgentId: "expert" }, { name: "nano-banana", ownerAgentId: "paint" }]} />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "@co");

    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("coding")).toBeInTheDocument();
    expect(screen.getByText("expert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /coding/i }));

    expect(textarea).toHaveValue("coding ");
  });

  it.skip("offers a jump button when the latest assistant reply starts below the viewport", async () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "上面还有旧消息", timestamp: 1 },
            {
              role: "assistant",
              content: "这是一个比较长的新回复，用来验证跳转按钮会把我带回最新 assistant 气泡的开头。",
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

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1400 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 600,
      bottom: 240,
      width: 600,
      height: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();

    latestAssistantAnchor.getBoundingClientRect = () => {
      const top = 420 - viewport.scrollTop;
      return {
        top,
        left: 0,
        right: 560,
        bottom: top + 260,
        width: 560,
        height: 260,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    };

    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
      fireEvent.scroll(viewport);
    });

    fireEvent.wheel(viewport);
    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    const jumpButton = await screen.findByRole("button", { name: "回到最新回复" });
    expect(jumpButton).toBeInTheDocument();
  });

  it("does not show the message-top jump button for assistant messages with images", async () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            {
              role: "assistant",
              content: "![山水图](https://example.com/demo.png)\n\n这是一张图片。",
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

    await screen.findByAltText("山水图");

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 80 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 600,
      bottom: 240,
      width: 600,
      height: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();

    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: -24,
      left: 0,
      right: 560,
      bottom: 196,
      width: 560,
      height: 220,
      x: 0,
      y: -24,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "回到这条消息顶部" })).not.toBeInTheDocument();
    });
  });

  it.skip("stops auto-aligning a streaming card after manual scroll takeover until a new card appears", async () => {
    const viewportRef = { current: null };
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            {
              role: "assistant",
              content: "第一段\n\n第二段\n\n第三段\n\n第四段",
              timestamp: 1,
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

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1600 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 1360 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 600,
      bottom: 240,
      width: 600,
      height: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    let latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: -120,
      left: 0,
      right: 560,
      bottom: 420,
      width: 560,
      height: 540,
      x: 0,
      y: -120,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            {
              role: "assistant",
              content: "第一段\n\n第二段\n\n第三段\n\n第四段\n\n第五段\n\n第六段",
              timestamp: 1,
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

    latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: -120,
      left: 0,
      right: 560,
      bottom: 500,
      width: 560,
      height: 620,
      x: 0,
      y: -120,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).not.toHaveBeenCalled();
    });

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            {
              role: "assistant",
              content: "第一段\n\n第二段\n\n第三段\n\n第四段\n\n第五段\n\n第六段",
              timestamp: 1,
            },
            {
              role: "assistant",
              content: "新卡片第一段\n\n新卡片第二段\n\n新卡片第三段\n\n新卡片第四段",
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

    latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 260,
      left: 0,
      right: 560,
      bottom: 860,
      width: 560,
      height: 600,
      x: 0,
      y: 260,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
  });

  it("does not open the agent menu when the current agent cannot use sub agents", async () => {
    render(<MentionHarness availableMentionAgents={[]} />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "@wr");

    expect(screen.queryByText("writer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /writer/i })).not.toBeInTheDocument();
  });
});
