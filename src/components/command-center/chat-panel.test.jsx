import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel, ChatTabsStrip, shouldShowBubbleTopJumpButton } from "@/components/command-center/chat-panel";
import { TooltipProvider } from "@/components/ui/tooltip";

function createSession(overrides = {}) {
  return {
    mode: "openclaw",
    agentId: "main",
    availableMentionAgents: [],
    availableSkills: [],
    status: "空闲",
    time: "10:00:00",
    version: "",
    ...overrides,
  };
}

function MentionHarness({
  availableMentionAgents = ["reviewer", "writer"],
  availableSkills = [],
  initialPrompt = "",
  sessionOverrides = {},
}) {
  const [prompt, setPrompt] = useState(initialPrompt);

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
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the bubble-top jump trigger for a tall assistant card scrolled past the top edge", () => {
    expect(
      shouldShowBubbleTopJumpButton({
        viewportRect: { top: 100, bottom: 700 },
        bubbleRect: { top: 60, bottom: 520, height: 460 },
        viewportClientHeight: 600,
      }),
    ).toBe(true);

    expect(
      shouldShowBubbleTopJumpButton({
        viewportRect: { top: 100, bottom: 700 },
        bubbleRect: { top: 120, bottom: 360, height: 240 },
        viewportClientHeight: 600,
      }),
    ).toBe(false);
  });

  it("keeps the tabs strip from showing a vertical scrollbar when the leading control animates", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[]}
          leadingControl={<button type="button">Let the lobster crawl</button>}
        />
      </TooltipProvider>,
    );

    expect(container.firstChild).toHaveClass("overflow-x-auto", "overflow-y-hidden");
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
    expect(screen.getByText("待命")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。"), "检查运行状态");
    await user.click(screen.getByLabelText("开启新会话"));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onPromptChange).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("locks the composer and send button until OpenClaw is connected", () => {
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
          session={createSession({ mode: "mock", status: "空闲" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByPlaceholderText("Openclaw尚未连接，请稍候。")).toBeDisabled();
    expect(screen.getByLabelText("开启新会话")).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
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
          resolvedTheme="light"
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByLabelText("开启新会话"));
    expect((await screen.findAllByText("开启新会话 (Ctrl + N)")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("开启新会话后，当前会话的内容将重置").length).toBeGreaterThan(0);
  });

  it("opens the mention picker from the @ button and inserts the selected item at the cursor", async () => {
    render(<MentionHarness initialPrompt="hello world" />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    textarea.focus();
    textarea.setSelectionRange(6, 6);
    fireEvent.select(textarea);

    await user.click(screen.getByLabelText("插入 @"));
    expect(await screen.findByText("reviewer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /writer/ }));
    expect(textarea).toHaveValue("hello writer world");
  });

  it("inserts the selected mention on the first mouse press inside the picker", async () => {
    render(<MentionHarness initialPrompt="hello world" />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");
    textarea.focus();
    textarea.setSelectionRange(6, 6);
    fireEvent.select(textarea);

    await user.click(screen.getByLabelText("插入 @"));
    const option = await screen.findByRole("button", { name: /writer/ });

    fireEvent.mouseDown(option, { button: 0 });
    expect(textarea).toHaveValue("hello writer world");
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
          resolvedTheme="light"
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

  it("shows a concise tooltip for the copy icon", async () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={{ current: null }}
          messages={[
            { id: "msg-user", role: "user", content: "你好", timestamp: 1 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          resolvedTheme="light"
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByLabelText("复制消息文本"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("复制");
  });

  it("treats jumping to the previous user message as manual takeover and blocks later auto-follow", async () => {
    const viewportRef = { current: null };
    vi.spyOn(window.performance, "now").mockReturnValue(0);
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback(500);
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
            { id: "msg-user-1", role: "user", content: "第一句", timestamp: 1 },
            { id: "msg-assistant-1", role: "assistant", content: "回复一", timestamp: 2 },
            { id: "msg-user-2", role: "user", content: "第二句", timestamp: 3 },
            { id: "msg-latest", role: "assistant", content: "最新回复第一版", timestamp: 4, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 2200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 900,
      bottom: 400,
      width: 900,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    const previousUserBubble = document.querySelector('[data-message-id="msg-user-1"]');
    const latestBubble = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(previousUserBubble).toBeTruthy();
    expect(latestBubble).toBeTruthy();

    previousUserBubble.getBoundingClientRect = () => ({
      top: 620 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 740 - viewport.scrollTop,
      width: 700,
      height: 120,
      x: 0,
      y: 620 - viewport.scrollTop,
      toJSON: () => ({}),
    });
    latestBubble.getBoundingClientRect = () => ({
      top: 180 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 520 - viewport.scrollTop,
      width: 700,
      height: 340,
      x: 0,
      y: 180 - viewport.scrollTop,
      toJSON: () => ({}),
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByLabelText("定位到上一句")[0]);

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(500);
    });

    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { id: "msg-user-1", role: "user", content: "第一句", timestamp: 1 },
            { id: "msg-assistant-1", role: "assistant", content: "回复一", timestamp: 2 },
            { id: "msg-user-2", role: "user", content: "第二句", timestamp: 3 },
            { id: "msg-latest", role: "assistant", content: "最新回复第二版\n继续增长", timestamp: 4, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });

  it("lets assistant message meta jump to the previous assistant message", async () => {
    const viewportRef = { current: null };
    vi.spyOn(window.performance, "now").mockReturnValue(0);
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback(500);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { id: "msg-user-1", role: "user", content: "第一句", timestamp: 1 },
            { id: "msg-assistant-1", role: "assistant", content: "第一条回复", timestamp: 2 },
            { id: "msg-user-2", role: "user", content: "第二句", timestamp: 3 },
            { id: "msg-assistant-2", role: "assistant", content: "第二条回复", timestamp: 4 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 2200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 900,
      bottom: 400,
      width: 900,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    const previousAssistantBubble = document.querySelector('[data-message-id="msg-assistant-1"]');
    expect(previousAssistantBubble).toBeTruthy();

    previousAssistantBubble.getBoundingClientRect = () => ({
      top: 620 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 740 - viewport.scrollTop,
      width: 700,
      height: 120,
      x: 0,
      y: 620 - viewport.scrollTop,
      toJSON: () => ({}),
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByLabelText("定位到上一句").at(-1));

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(500);
    });
  });

  it("shows the close keycap only on the active chat tab", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:expert"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: false, busy: false },
            { id: "agent:expert", agentId: "expert", active: true, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={() => {}}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
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

    expect(screen.queryByLabelText("关闭会话 main")).not.toBeInTheDocument();
    expect(screen.getByLabelText("关闭会话 expert")).toBeInTheDocument();
  });

  it("shows shortcut numbers on chat tabs in left-to-right order", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:expert"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: false, busy: false },
            { id: "agent:expert", agentId: "expert", active: true, busy: false },
            { id: "agent:writer", agentId: "writer", active: false, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={() => {}}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
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

    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("adds the breathing highlight treatment to busy tab dots only", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:main"
          busy
          chatTabs={[
            { id: "agent:main", agentId: "main", active: true, busy: true },
            { id: "agent:expert", agentId: "expert", active: false, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={() => {}}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
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

    const busyTabDot = screen.getByRole("button", { name: "main" }).querySelector("span.rounded-full");
    const idleTabDot = screen.getByRole("button", { name: "expert" }).querySelector("span.rounded-full");

    expect(busyTabDot).toHaveClass("cc-chat-tab-busy-dot");
    expect(idleTabDot).not.toHaveClass("cc-chat-tab-busy-dot");
  });

  it("activates an inactive tab when clicking its shortcut keycap", async () => {
    const onActivateChatTab = vi.fn();

    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:main"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: true, busy: false },
            { id: "agent:expert", agentId: "expert", active: false, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={onActivateChatTab}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
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
    await user.click(screen.getByText("2"));

    expect(onActivateChatTab).toHaveBeenCalledWith("agent:expert");
  });

  it("shows a platform-aware tooltip for inactive tab shortcuts", async () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");

    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:main"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: true, busy: false },
            { id: "agent:expert", agentId: "expert", active: false, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={() => {}}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
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
    await user.hover(screen.getByText("2"));

    expect((await screen.findAllByText("Ctrl + 2 切换到此会话")).length).toBeGreaterThan(0);
  });

  it("shows the close-session tooltip when hovering the active tab keycap", async () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:expert"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: false, busy: false },
            { id: "agent:expert", agentId: "expert", active: true, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={() => {}}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
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
    await user.hover(screen.getByLabelText("关闭会话 expert"));

    expect((await screen.findAllByText("关闭会话")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("该操作不会清除会话内容，可再次打开").length).toBeGreaterThan(0);
  });

  it("uses the same active blue tab treatment as the inspector tabs", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:main"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: true, busy: false },
            { id: "agent:expert", agentId: "expert", active: false, busy: false },
          ]}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onActivateChatTab={() => {}}
          onChatFontSizeChange={() => {}}
          onCloseChatTab={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          resolvedTheme="light"
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const activeTab = screen.getByRole("button", { name: "main" }).closest("div");
    expect(activeTab).toHaveClass("bg-[#1677eb]", "text-white");
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
    expect(textarea).toHaveClass("min-h-[3.35rem]");
  });

  it("shows the enter-send hint and toggle button by default", async () => {
    const onComposerSendModeToggle = vi.fn();

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[]}
          onChatFontSizeChange={() => {}}
          onComposerSendModeToggle={onComposerSendModeToggle}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          resolvedTheme="light"
          session={createSession()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("回车发送，Shift + 回车换行")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换为Shift + 回车发送" })).toHaveClass("text-[#6b7280]");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "切换为Shift + 回车发送" }));

    expect(onComposerSendModeToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the double-enter hint after switching send mode", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          composerSendMode="double-enter-send"
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

    expect(screen.getByText("快速连按回车或 Shift + 回车发送，回车换行")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换为回车发送" })).toBeInTheDocument();
  });

  it("places the timestamp above the outline for assistant messages that render an outline", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              role: "assistant",
              content: "# 第一部分\n内容\n## 第二部分\n更多内容",
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

    const metaStack = container.querySelector("[data-message-outline-meta-stack]");
    expect(metaStack).toBeTruthy();
    expect(metaStack).toContainElement(screen.getByText("大纲"));
    expect(metaStack.querySelector("time")).toHaveTextContent("10:00:00");
    expect(metaStack.querySelector("aside")).toHaveClass("max-h-[calc(100vh-6rem)]", "overflow-y-auto");
  });

  it("does not render the outline card while the latest assistant message is still streaming", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              id: "msg-streaming-outline",
              role: "assistant",
              content: "# 第一部分\n内容\n## 第二部分\n更多内容",
              timestamp: 2,
              streaming: true,
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

    expect(container.querySelector("[data-message-outline-meta-stack]")).toBeNull();
    expect(screen.queryByText("大纲")).not.toBeInTheDocument();
  });

  it("renders messages and busy/openclaw status", () => {
    const onStop = vi.fn();

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
          onStop={onStop}
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
    expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
  });

  it("keeps the header in busy mode while an assistant reply is still streaming", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段", timestamp: 2, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ status: "待命" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("思考中")).toBeInTheDocument();
    expect(screen.queryByText("待命")).not.toBeInTheDocument();
  });

  it("shows idle once the latest turn is complete even if session status still says running", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "你是什么模型？", timestamp: 1 },
            { role: "assistant", content: "我是 Gemini 3 Flash Preview。", timestamp: 2 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ status: "思考中" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("待命")).toBeInTheDocument();
    expect(screen.queryByText("思考中")).not.toBeInTheDocument();
  });

  it("adds a breathing class to the latest streaming assistant bubble without reusing the pending card style", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "给我看一点新闻", timestamp: 1 },
            { role: "assistant", content: "我", timestamp: 2, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ agentId: "news" })}
        />
      </TooltipProvider>,
    );

    const streamingBubble = screen.getByText("我").closest('[data-bubble-layout="compact"]');
    expect(streamingBubble).toHaveClass("cc-streaming-bubble");
    expect(streamingBubble).not.toHaveClass("cc-thinking-bubble");
  });

  it("does not keep the breathing class once the assistant message is no longer streaming", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "给我看一点新闻", timestamp: 1 },
            { role: "assistant", content: "我去抓一版综合新闻，给你做个短报。", timestamp: 2 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ agentId: "news" })}
        />
      </TooltipProvider>,
    );

    const settledBubble = screen.getByText("我去抓一版综合新闻，给你做个短报。").closest('[data-bubble-layout="compact"]');
    expect(settledBubble).not.toHaveClass("cc-streaming-bubble");
  });

  it("does not render a transient handoff overlay when a pending assistant bubble resolves", () => {
    const { rerender, container } = render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "hi", timestamp: 1 },
            { id: "msg-assistant-handoff", role: "assistant", content: "正在思考…", timestamp: 2, pending: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ agentId: "paint" })}
        />
      </TooltipProvider>,
    );

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "hi", timestamp: 1 },
            { id: "msg-assistant-handoff", role: "assistant", content: "嘿！", timestamp: 2, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ agentId: "paint" })}
        />
      </TooltipProvider>,
    );

    expect(container.querySelector("[data-handoff-overlay]")).toBeNull();
  });

  it("treats artifact focus jumps as manual takeover and blocks later auto-alignment", async () => {
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
          focusMessageRequest={null}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { id: "msg-target", role: "assistant", content: "较早的一条回复", timestamp: 1 },
            { id: "msg-latest", role: "assistant", content: "最新回复第一版", timestamp: 2, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 2200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 900,
      bottom: 400,
      width: 900,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    const targetBubble = document.querySelector('[data-message-id="msg-target"]');
    const latestBubble = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(targetBubble).toBeTruthy();
    expect(latestBubble).toBeTruthy();

    targetBubble.getBoundingClientRect = () => ({
      top: 620 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 760 - viewport.scrollTop,
      width: 700,
      height: 140,
      x: 0,
      y: 620 - viewport.scrollTop,
      toJSON: () => ({}),
    });
    latestBubble.getBoundingClientRect = () => ({
      top: 160 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 520 - viewport.scrollTop,
      width: 700,
      height: 360,
      x: 0,
      y: 160 - viewport.scrollTop,
      toJSON: () => ({}),
    });

    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          focusMessageRequest={{ id: "focus-artifact", messageId: "msg-target", role: "assistant", source: "artifact", timestamp: 1 }}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { id: "msg-target", role: "assistant", content: "较早的一条回复", timestamp: 1 },
            { id: "msg-latest", role: "assistant", content: "最新回复第一版", timestamp: 2, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(500);
    });

    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          focusMessageRequest={null}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { id: "msg-target", role: "assistant", content: "较早的一条回复", timestamp: 1 },
            { id: "msg-latest", role: "assistant", content: "最新回复第二版\n继续增长", timestamp: 2, streaming: true },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });

  it("briefly highlights the target message after an artifact jump", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          focusMessageRequest={{ id: "focus-artifact", messageId: "msg-target", role: "assistant", source: "artifact", timestamp: 1 }}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { id: "msg-target", role: "assistant", content: "目标消息", timestamp: 1 },
            { id: "msg-latest", role: "assistant", content: "最新消息", timestamp: 2 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 2200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });
    viewport.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 900,
      bottom: 400,
      width: 900,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    const targetBubble = document.querySelector('[data-message-id="msg-target"]');
    expect(targetBubble).toBeTruthy();
    targetBubble.getBoundingClientRect = () => ({
      top: 620 - viewport.scrollTop,
      left: 0,
      right: 700,
      bottom: 760 - viewport.scrollTop,
      width: 700,
      height: 140,
      x: 0,
      y: 620 - viewport.scrollTop,
      toJSON: () => ({}),
    });

    await act(async () => {});
    expect(targetBubble).not.toHaveAttribute("data-message-highlighted");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(targetBubble).toHaveAttribute("data-message-highlighted", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(targetBubble).not.toHaveAttribute("data-message-highlighted");
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
    expect(screen.getByAltText("shot.png").closest("[data-scroll-anchor-id]")).toHaveAttribute(
      "data-scroll-anchor-id",
      "message-1-0-attachment-image-msg-image",
    );

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
    expect(writerOption.className).toMatch(/bg-\[|bg-foreground\/10/);

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

  it("closes the mention menu when clicking outside", async () => {
    render(<MentionHarness availableMentionAgents={["writer"]} availableSkills={[{ name: "coding", ownerAgentId: "expert" }]} />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText("描述你希望 Agent 在当前 workspace 中完成什么。");

    await user.type(textarea, "@co");
    expect(screen.getByText("Skills")).toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByText("Skills")).not.toBeInTheDocument();
    });
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

    const jumpButton = await screen.findByRole("button", { name: "回到底部" });
    expect(jumpButton).toBeInTheDocument();
  });

  it("treats the message-top jump button as manual takeover and blocks later auto-alignment", async () => {
    const viewportRef = { current: null };
    let frameTime = 0;
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      frameTime += 160;
      callback(frameTime);
      return frameTime;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-latest", role: "assistant", content: "第一段\n\n第二段\n第三段\n第四段\n第五段", timestamp: 2, streaming: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 1040 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 160 });
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
      const top = 136 - viewport.scrollTop;
      return {
        top,
        left: 0,
        right: 560,
        bottom: top + 320,
        width: 560,
        height: 320,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    };

    fireEvent.scroll(viewport);

    const jumpButton = await screen.findByRole("button", { name: "回到这条消息顶部" });
    fireEvent.click(jumpButton);

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(64);
    });

    viewport.scrollHeight = 1200;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-latest", role: "assistant", content: "第一段\n\n第二段\n第三段\n第四段\n第五段\n第六段", timestamp: 2, streaming: true },
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

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(64);
    });
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

  it("does not show the message-top jump button for a compact welcome assistant message after /new", async () => {
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
              content: "新会话已开始。直接说你要我干什么。",
              timestamp: 2,
            },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "main:new" })}
        />
      </TooltipProvider>,
    );

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

  it("follows short streaming assistant replies by staying at the bottom", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段", timestamp: 2, pending: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 520 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 280 });
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
      top: 90,
      left: 0,
      right: 560,
      bottom: 250,
      width: 560,
      height: 160,
      x: 0,
      y: 90,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    viewport.scrollHeight = 560;
    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段\n第二段", timestamp: 2, pending: true },
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
      top: 70,
      left: 0,
      right: 560,
      bottom: 250,
      width: 560,
      height: 180,
      x: 0,
      y: 70,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 320, behavior: "auto" });
    });
  });

  it("pins tall streaming assistant replies near the top 20% of the viewport once they outgrow bottom-follow", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段", timestamp: 2, pending: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 920 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 640 });
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

    const latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 980;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2, streaming: true },
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

    const latestStreamingAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestStreamingAnchor).toBeTruthy();
    latestStreamingAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top: streamingTop, behavior: streamingBehavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(streamingBehavior).toBe("auto");
    expect(streamingTop).toBeGreaterThan(0);
    expect(streamingTop).toBeLessThan(740);
  });

  it("pins tall settled assistant replies near the top 20% while the latest turn is still being followed", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段", timestamp: 2, pending: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 980 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 700 });
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

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 1040;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2 },
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

    const latestSettledAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestSettledAnchor).toBeTruthy();
    latestSettledAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top: settledTop, behavior: settledBehavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(settledBehavior).toBe("auto");
    expect(settledTop).toBeGreaterThan(0);
    expect(settledTop).toBeLessThan(800);
  });

  it("shows the back-to-bottom button once a tall reply enters the top-20% pin", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段", timestamp: 2, pending: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 980 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 700 });
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

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 1040;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2 },
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

    const latestSettledAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestSettledAnchor).toBeTruthy();
    latestSettledAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    expect(await screen.findByRole("button", { name: "回到底部" })).toBeInTheDocument();
  });

  it("keeps the manual scroll position when a new user message is sent", async () => {
    const viewportRef = { current: null };

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "旧回复", timestamp: 1 },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 180 });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "旧回复", timestamp: 1 },
            { role: "user", content: "新问题", timestamp: 2 },
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

    expect(viewport.scrollTo).not.toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(180);
  });

  it("does not let a thinking card reclaim auto-follow after the user manually scrolled away", async () => {
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
            { role: "assistant", content: "旧回复", timestamp: 1 },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 180 });
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

    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "旧回复", timestamp: 1 },
            { role: "user", content: "新问题", timestamp: 2 },
            { role: "assistant", content: "正在思考…", timestamp: 3, pending: true },
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

    const latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 120,
      left: 0,
      right: 560,
      bottom: 220,
      width: 560,
      height: 100,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });

    expect(viewport.scrollTo).not.toHaveBeenCalled();
    viewport.scrollHeight = 1040;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "旧回复", timestamp: 1 },
            { role: "user", content: "新问题", timestamp: 2 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段", timestamp: 3, streaming: true },
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

    await waitFor(() => {
      expect(viewport.scrollTo).not.toHaveBeenCalled();
    });
    expect(viewport.scrollTop).toBe(180);
  });

  it("hands control back to automatic follow once the user manually scrolls back to the bottom", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段", timestamp: 2, streaming: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 640 });
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

    const latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 120,
      left: 0,
      right: 560,
      bottom: 260,
      width: 560,
      height: 140,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });

    fireEvent.wheel(viewport);
    viewport.scrollTop = 420;
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    viewport.scrollTop = 720;
    fireEvent.scroll(viewport);

    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 1040;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段", timestamp: 2, streaming: true },
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

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top, behavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(behavior).toBe("auto");
    expect(top).toBeGreaterThan(720);
  });

  it("does not re-enter the top-20% pin for the same turn after the user manually intervenes", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段", timestamp: 2, streaming: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 980 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 700 });
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

    const latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAssistantAnchor).toBeTruthy();
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    fireEvent.wheel(viewport);
    viewport.scrollTop = 740;
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    viewport.scrollTop = 740;
    fireEvent.scroll(viewport);

    viewport.scrollHeight = 1040;
    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2, streaming: true },
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

    const latestStreamingAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestStreamingAnchor).toBeTruthy();
    latestStreamingAnchor.getBoundingClientRect = () => ({
      top: -40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 400,
      x: 0,
      y: -40,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top, behavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(behavior).toBe("auto");
    expect(top).toBe(800);
  });

  it("keeps lightly compensating around the top pin after layout growth changes the card height", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段", timestamp: 2, pending: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 560 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 320 });
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

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    viewport.scrollHeight = 980;
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2 },
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

    const latestFinalAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestFinalAnchor).toBeTruthy();
    latestFinalAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top: compensatedTop, behavior: compensatedBehavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(compensatedBehavior).toBe("auto");
    expect(compensatedTop).toBeGreaterThan(0);
    expect(compensatedTop).toBeLessThan(740);
  });

  it("does not reapply restored scroll after manual scrolling within the same conversation", async () => {
    const viewportRef = { current: null };

    const baseProps = {
      busy: false,
      formatTime: () => "10:00:00",
      messageViewportRef: viewportRef,
      onPromptChange: () => {},
      onPromptKeyDown: () => {},
      onReset: () => {},
      onSend: () => {},
      prompt: "",
      promptRef: null,
      session: createSession(),
    };

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollKey=""
          restoredScrollState={null}
          messages={[
            { role: "assistant", content: "第一条消息", timestamp: 1 },
          ]}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });

    rerender(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollKey="command-center:main"
          restoredScrollState={{ scrollTop: 180 }}
          messages={[
            { role: "assistant", content: "第一条消息", timestamp: 1 },
          ]}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(180);
    });

    fireEvent.wheel(viewport);
    viewport.scrollTop = 420;
    fireEvent.scroll(viewport);

    rerender(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollKey="command-center:main"
          restoredScrollState={{ scrollTop: 180 }}
          messages={[
            { role: "assistant", content: "第一条消息", timestamp: 1 },
            { role: "assistant", content: "第二条消息", timestamp: 2 },
          ]}
        />
      </TooltipProvider>,
    );

    expect(viewport.scrollTop).toBe(420);
  });

  it("re-aligns restored scroll after an image finishes loading", async () => {
    const viewportRef = { current: null };
    let documentTop = 220;

    const baseProps = {
      busy: false,
      formatTime: () => "10:00:00",
      messageViewportRef: viewportRef,
      onPromptChange: () => {},
      onPromptKeyDown: () => {},
      onReset: () => {},
      onSend: () => {},
      prompt: "",
      promptRef: null,
      session: createSession({ sessionUser: "command-center" }),
    };

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollKey=""
          restoredScrollState={null}
          messages={[
            { role: "assistant", content: "![图](https://example.com/demo.png)\n\n图片回复", timestamp: 2 },
          ]}
        />
      </TooltipProvider>,
    );

    await screen.findByAltText("图");

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1600 });
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

    rerender(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollKey="command-center:main"
          restoredScrollState={{ scrollTop: 180, anchorNodeId: "message-2-0-block-0", anchorOffset: 20 }}
          messages={[
            { role: "assistant", content: "![图](https://example.com/demo.png)\n\n图片回复", timestamp: 2 },
          ]}
        />
      </TooltipProvider>,
    );

    const restoredAnchorNode = document.querySelector('[data-scroll-anchor-id="message-2-0-block-0"]');
    expect(restoredAnchorNode).toBeTruthy();
    restoredAnchorNode.getBoundingClientRect = () => ({
      top: documentTop - viewport.scrollTop,
      left: 0,
      right: 560,
      bottom: documentTop - viewport.scrollTop + 260,
      width: 560,
      height: 260,
      x: 0,
      y: documentTop - viewport.scrollTop,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(200);
    });

    const image = screen.getByAltText("图");
    Object.defineProperty(image, "complete", { configurable: true, value: false });
    documentTop = 310;
    fireEvent.load(image);

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(290);
    });
  });

  it("re-applies restored scroll for the same conversation when the restore revision changes", async () => {
    const viewportRef = { current: null };

    const baseProps = {
      busy: false,
      formatTime: () => "10:00:00",
      messageViewportRef: viewportRef,
      onPromptChange: () => {},
      onPromptKeyDown: () => {},
      onReset: () => {},
      onSend: () => {},
      prompt: "",
      promptRef: null,
      restoredScrollKey: "command-center:main",
      restoredScrollState: { scrollTop: 180 },
      session: createSession({ sessionUser: "command-center" }),
    };

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollRevision={0}
          messages={[
            { role: "assistant", content: "第一条消息", timestamp: 1 },
          ]}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 0 });

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(180);
    });

    viewport.scrollTop = 420;

    rerender(
      <TooltipProvider>
        <ChatPanel
          {...baseProps}
          restoredScrollRevision={1}
          messages={[
            { role: "assistant", content: "第一条消息", timestamp: 1 },
          ]}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(180);
    });
  });

  it("restores all the way to the bottom when the saved state was bottom-pinned", async () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "第一段", timestamp: 1 },
            { role: "assistant", content: "第二段", timestamp: 2 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          restoredScrollKey="command-center:main"
          restoredScrollState={{ scrollTop: 640, atBottom: true, anchorMessageId: "2-1", anchorOffset: 20 }}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
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

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(720);
    });

    viewport.scrollHeight = 1040;
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(800);
    });
  });

  it("keeps a restored bottom-pinned conversation stuck to the bottom when the latest reply grows after refresh", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          restoredScrollKey="command-center:main"
          restoredScrollState={{ scrollTop: 800, atBottom: true }}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 1040 });
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
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    const latestAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(latestAnchor).toBeTruthy();
    latestAnchor.getBoundingClientRect = () => ({
      top: 36,
      left: 0,
      right: 560,
      bottom: 356,
      width: 560,
      height: 320,
      x: 0,
      y: 36,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(800);
    });

    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段\n第五段", timestamp: 2 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          restoredScrollKey="command-center:main"
          restoredScrollState={{ scrollTop: 800, atBottom: true }}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    });
  });

  it("shows the bottom button whenever the viewport is away from the bottom and clicking it returns to the bottom", async () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "第一段", timestamp: 1 },
            { role: "assistant", content: "第二段", timestamp: 2 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 320 });
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
    });

    fireEvent.scroll(viewport);

    const bottomButton = await screen.findByRole("button", { name: "回到底部" });
    fireEvent.click(bottomButton);

    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "smooth" });
  });

  it("does not show the bottom button for a brand new empty conversation after restoring from a scrolled session", () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          restoredScrollKey="agent:main:openai-user:main:new"
          restoredScrollState={{ scrollTop: 180 }}
          session={createSession({ sessionUser: "main:new" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 180 });

    fireEvent.scroll(viewport);

    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();
  });

  it("resets the bottom button when switching to a new conversation with the same message count", async () => {
    const viewportRef = { current: null };

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "旧会话里的很长一段内容\n第二行\n第三行\n第四行", timestamp: 1 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 320 });
    fireEvent.scroll(viewport);

    await screen.findByRole("button", { name: "回到底部" });

    viewport.scrollHeight = 240;
    viewport.scrollTop = 0;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "新会话已开始。直接说你要我干什么。", timestamp: 2 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "main:new" })}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();
    });
  });

  it("does not show the bottom button for a compact intro-only assistant message after /new", async () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "assistant", content: "新会话已开始。直接说你要我干什么。", timestamp: 2 },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({ sessionUser: "main:new" })}
        />
      </TooltipProvider>,
    );

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
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
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 400,
      bottom: 56,
      width: 400,
      height: 56,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();
    });
  });

  it("keeps a tall latest reply at the bottom after clicking the bottom button instead of immediately re-pinning it", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2 },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 1040 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 652 });
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

    const pinnedAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(pinnedAnchor).toBeTruthy();
    pinnedAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 360,
      width: 560,
      height: 320,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);
    const bottomButton = await screen.findByRole("button", { name: "回到底部" });
    fireEvent.click(bottomButton);

    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
    viewport.scrollTo.mockClear();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-final", role: "assistant", content: "第一段\n第二段\n第三段\n第四段\n第五段", timestamp: 2 },
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

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    });
  });

  it.skip("treats keyboard scrolling as manual takeover and stops auto-following until a new turn starts", async () => {
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
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段", timestamp: 2, streaming: true },
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
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 960 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 720 });
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

    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    fireEvent.keyDown(document.body, { key: "PageDown" });
    viewport.scrollTop = 460;
    fireEvent.scroll(viewport);

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 2, streaming: true },
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

    await waitFor(() => {
      expect(viewport.scrollTo).not.toHaveBeenCalled();
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
