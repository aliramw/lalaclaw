import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel, ChatTabsStrip } from "@/components/command-center/chat-panel";
import { shouldShowBubbleTopJumpButton } from "@/components/command-center/chat-panel-utils";
import { shouldSuppressComposerReplay } from "@/components/command-center/chat-panel-utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

const defaultPromptPlaceholder = "💡 想要和 main 一起做点什么？";

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
  const [prompt, setPrompt] = React.useState(initialPrompt);

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

function QueuedMessagesHarness({
  initialPrompt = "",
  initialQueuedMessages = [],
}) {
  const [prompt, setPrompt] = React.useState(initialPrompt);
  const [queuedMessages, setQueuedMessages] = React.useState(initialQueuedMessages);

  const handleRemoveQueuedMessage = (entryId) => {
    setQueuedMessages((current) => current.filter((item) => item.id !== entryId));
  };

  const handleEditQueuedMessage = (entryId) => {
    let nextPrompt = null;

    setQueuedMessages((current) => {
      const entry = current.find((item) => item.id === entryId);
      nextPrompt = entry ? String(entry.content || "") : null;
      return current.filter((item) => item.id !== entryId);
    });

    if (nextPrompt !== null) {
      setPrompt(nextPrompt);
    }
  };

  return (
    <TooltipProvider>
      <ChatPanel
        busy={false}
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[]}
        onClearQueuedMessages={() => setQueuedMessages([])}
        onEditQueuedMessage={handleEditQueuedMessage}
        onPromptChange={setPrompt}
        onPromptKeyDown={() => {}}
        onRemoveQueuedMessage={handleRemoveQueuedMessage}
        onReset={() => {}}
        onSend={() => {}}
        prompt={prompt}
        promptRef={null}
        queuedMessages={queuedMessages}
        session={createSession()}
      />
    </TooltipProvider>
  );
}

function VoiceInputHarness() {
  const [prompt, setPrompt] = React.useState("");

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
        session={createSession()}
      />
    </TooltipProvider>
  );
}

function createSpeechRecognitionMock() {
  const instances = [];

  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = "";
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.start = vi.fn();
      this.stop = vi.fn(() => {
        this.onend?.();
      });
      instances.push(this);
    }

    emitResult(results) {
      this.onresult?.({ results });
    }

    emitError(error) {
      this.onerror?.({ error });
      this.onend?.();
    }
  }

  return {
    MockSpeechRecognition,
    instances,
  };
}

describe("ChatPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.removeItem(localeStorageKey);
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

  it("keeps the scrollable tab viewport clipped when the leading control animates", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[]}
          leadingControl={<button type="button">Let the lobster crawl</button>}
        />
      </TooltipProvider>,
    );

    expect(container.firstChild).toHaveClass("min-w-0");
    expect(container.firstChild).not.toHaveClass("overflow-x-auto");
  });

  it("renders scroll buttons for overflowing tabs and scrolls the tab rail", async () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:writer", agentId: "writer", active: false, busy: false, title: "writer" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
            { id: "agent:transformer", agentId: "transformer", active: false, busy: false, title: "transformer" },
          ]}
        />
      </TooltipProvider>,
    );

    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    expect(viewport).toBeTruthy();

    let scrollLeftValue = 0;
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      get: () => 180,
    });
    Object.defineProperty(viewport, "scrollWidth", {
      configurable: true,
      get: () => 520,
    });
    Object.defineProperty(viewport, "scrollLeft", {
      configurable: true,
      get: () => scrollLeftValue,
      set: (value) => {
        scrollLeftValue = value;
      },
    });
    viewport.scrollBy = vi.fn(({ left }) => {
      scrollLeftValue += left;
      fireEvent.scroll(viewport);
    });

    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "向左滚动会话标签" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "向右滚动会话标签" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "向左滚动会话标签" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "向右滚动会话标签" })).not.toBeDisabled();

    await userEvent.setup().click(screen.getByRole("button", { name: "向右滚动会话标签" }));

    expect(viewport.scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollLeftValue).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "向左滚动会话标签" })).not.toBeDisabled();
  });

  it("keeps a tab busy dot stable through a brief false pulse", () => {
    vi.useFakeTimers();

    const { container, rerender } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: true, title: "main" },
          ]}
        />
      </TooltipProvider>,
    );

    expect(container.querySelector(".cc-chat-tab-busy-dot")).toBeTruthy();

    rerender(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
          ]}
        />
      </TooltipProvider>,
    );

    expect(container.querySelector(".cc-chat-tab-busy-dot")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(container.querySelector(".cc-chat-tab-busy-dot")).toBeNull();
  });

  it("does not render a user-name editor in the chat header anymore", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[{ id: "msg-user-1", role: "user", content: "你好", timestamp: 1 }]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession()}
          userLabel="Lala"
        />
      </TooltipProvider>,
    );

    expect(screen.queryByRole("textbox", { name: "我的名字" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Lala").length).toBeGreaterThan(0);
  });

  it("keeps the trailing control inside the tab rail after the session tabs", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:writer", agentId: "writer", active: false, busy: false, title: "writer" },
          ]}
          trailingControl={<button type="button">Open session</button>}
        />
      </TooltipProvider>,
    );

    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    expect(viewport).toContainElement(screen.getByRole("button", { name: "Open session" }));

    const trackLabels = Array.from(viewport.textContent.matchAll(/main|writer|Open session/g)).map(([value]) => value);
    expect(trackLabels).toEqual(["main", "writer", "Open session"]);
  });

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
    await user.type(screen.getByPlaceholderText(defaultPromptPlaceholder), "检查运行状态");
    await user.click(screen.getByLabelText("开启新会话"));
    expect(screen.getByRole("alertdialog", { name: "开启新的会话？" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确定" }));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onPromptChange).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("shows loading session state before the empty conversation placeholder resolves", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy
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

    expect(screen.getByText("加载会话中...")).toBeInTheDocument();
    expect(screen.queryByText("等待第一条指令")).not.toBeInTheDocument();
  });

  it("renders the queued strip above the composer with compact edit and delete actions", () => {
    render(
      <QueuedMessagesHarness
        initialQueuedMessages={[
          { id: "queued-1", content: "第一个待发送草稿" },
        ]}
      />,
    );

    const panel = screen.getByTestId("queued-messages-panel");
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    expect(panel.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getByText("当前回复结束后将按顺序发送")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "修改第 1 条待发送消息" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "删除第 1 条待发送消息" })).toBeInTheDocument();
  });

  it("moves a queued message back into the composer when edit is pressed", async () => {
    render(
      <QueuedMessagesHarness
        initialQueuedMessages={[
          { id: "queued-edit-1", content: "把这条待发送拿回来改一下" },
        ]}
      />,
    );

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "修改第 1 条待发送消息" }));

    expect(textarea).toHaveValue("把这条待发送拿回来改一下");
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
    expect(screen.queryByTestId("queued-messages-panel")).not.toBeInTheDocument();
  });

  it("shows a stable unsupported message when voice input is unavailable", async () => {
    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    expect(screen.getByText("当前浏览器不支持语音输入")).toBeInTheDocument();
  });

  it("streams speech recognition text into the composer and keeps the final transcript after stop", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "帮我记录");
    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
    expect(screen.getByText("正在监听并转写…")).toBeInTheDocument();

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "今天下午" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("帮我记录 今天下午");

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "今天下午开会" }, isFinal: true },
      ]);
    });

    expect(textarea).toHaveValue("帮我记录 今天下午开会");

    await user.click(screen.getByRole("button", { name: "停止语音输入" }));

    expect(instances[0].stop).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveValue("帮我记录 今天下午开会");
    expect(screen.getByText("语音输入已停止")).toBeInTheDocument();
  });

  it("toggles voice input with ctrl shift period", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    fireEvent.keyDown(window, {
      key: ".",
      code: "Period",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
    expect(screen.getByText("正在监听并转写…")).toBeInTheDocument();

    fireEvent.keyDown(window, {
      key: ".",
      code: "Period",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(instances[0].stop).toHaveBeenCalledTimes(1);
    expect(screen.getByText("语音输入已停止")).toBeInTheDocument();
  });

  it("does not restore deleted transcript text after the user clears the composer during voice input", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "今天下午" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("今天下午");

    await user.clear(textarea);
    expect(textarea).toHaveValue("");

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "今天下午开会" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("开会");
  });

  it("does not duplicate a repeated interim tail when speech results contain a finalized phrase and its shorter draft", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "你一按就可以语音" }, isFinal: true },
        { 0: { transcript: "一按就可" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("你一按就可以语音");
  });

  it("collapses progressively longer draft segments into one sentence instead of concatenating each draft", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当" }, isFinal: false },
        { 0: { transcript: "当前代办还很早期核心 4 件事都没收" }, isFinal: false },
        { 0: { transcript: "当前代办还很早期，核心 4 件事都没收，补全" }, isFinal: false },
        { 0: { transcript: "当前代办还很早期，核心 4 件事都没收，补全关键时间线" }, isFinal: true },
      ]);
    });

    expect(textarea).toHaveValue("当前代办还很早期，核心 4 件事都没收，补全关键时间线");
  });

  it("uses the latest interim phrase instead of concatenating multiple interim drafts from one event", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前代办还很早" }, isFinal: false },
        { 0: { transcript: "当前代办还很早期核心" }, isFinal: false },
        { 0: { transcript: "当前代办还很早期核心事件是都没收" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("当前代办还很早期核心事件是都没收");
  });

  it("does not concatenate progressively longer finalized drafts from one event", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前" }, isFinal: true },
        { 0: { transcript: "当前代办还很早期核" }, isFinal: true },
        { 0: { transcript: "当前代办还很早期核心事件是都没收" }, isFinal: true },
      ]);
    });

    expect(textarea).toHaveValue("当前代办还很早期核心事件是都没收");
  });

  it("replaces the in-flight transcript across successive recognition events instead of accumulating older drafts", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前" }, isFinal: false },
      ]);
    });
    expect(textarea).toHaveValue("当前");

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前代办还很早期核心事件" }, isFinal: false },
      ]);
    });
    expect(textarea).toHaveValue("当前代办还很早期核心事件");

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前代办还很早期核心事件事都没收" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("当前代办还很早期核心事件事都没收");
  });

  it("replaces a highly similar draft when the recognizer corrects words inside the same sentence", async () => {
    const { MockSpeechRecognition, instances } = createSpeechRecognitionMock();
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);

    render(<VoiceInputHarness />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.click(screen.getByRole("button", { name: "开始语音输入" }));

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前代办还很早期核心事件" }, isFinal: false },
      ]);
    });
    expect(textarea).toHaveValue("当前代办还很早期核心事件");

    act(() => {
      instances[0].emitResult([
        { 0: { transcript: "当前代办还很早期核心 4 件事都没收" }, isFinal: false },
      ]);
    });

    expect(textarea).toHaveValue("当前代办还很早期核心 4 件事都没收");
  });

  it("removes a queued message when the trash icon is pressed", async () => {
    render(
      <QueuedMessagesHarness
        initialQueuedMessages={[
          { id: "queued-remove-1", content: "先删除这条" },
          { id: "queued-remove-2", content: "保留这条" },
        ]}
      />,
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "删除第 1 条待发送消息" }));

    const panel = screen.getByTestId("queued-messages-panel");
    expect(within(panel).queryByText("先删除这条")).not.toBeInTheDocument();
    expect(within(panel).getByText("保留这条")).toBeInTheDocument();
    expect(within(panel).getByText("待发送 1")).toBeInTheDocument();
  });

  it("suppresses suffix-style IME replay text right after send", () => {
    expect(
      shouldSuppressComposerReplay({
        armed: true,
        armedAt: 1000,
        eventType: "change",
        nextPrompt: "test.md",
        replaySource: "创建 test.md",
        now: 1080,
      }),
    ).toBe(true);

    expect(
      shouldSuppressComposerReplay({
        armed: true,
        armedAt: 1000,
        eventType: "change",
        nextPrompt: "新的内容",
        replaySource: "创建 test.md",
        now: 1080,
      }),
    ).toBe(false);

    expect(
      shouldSuppressComposerReplay({
        armed: true,
        armedAt: 1000,
        eventType: "compositionend",
        nextPrompt: "test.md",
        replaySource: "创建 test.md",
        now: 1400,
      }),
    ).toBe(true);
  });

  it("renders the composer placeholder with the agent name emphasized but not darker than the rest", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          agentLabel="writer"
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
          session={createSession({ agentId: "writer" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByPlaceholderText("💡 想要和 writer 一起做点什么？")).toBeInTheDocument();
    const overlay = screen.getByTestId("composer-placeholder-overlay");
    expect(overlay).toHaveTextContent("想要和 writer 一起做点什么？💡");
    expect(overlay).toHaveTextContent("PS: 不用点击输入框，任何时候直接打字");
    expect(screen.getByText("writer", { selector: "span" })).toHaveClass("font-medium", "text-muted-foreground/75");
  });

  it("cancels resetting the conversation when the custom dialog is dismissed", async () => {
    const onReset = vi.fn();

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
          onReset={onReset}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("开启新会话"));
    expect(screen.getByRole("alertdialog", { name: "开启新的会话？" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alertdialog", { name: "开启新的会话？" })).not.toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("localizes the reset dialog for japanese UI", async () => {
    window.localStorage.setItem(localeStorageKey, "ja");

    render(
      <I18nProvider>
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
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("新しいセッションを開始"));

    expect(screen.getByRole("alertdialog", { name: "新しいセッションを開始しますか？" })).toBeInTheDocument();
    expect(screen.getByText("会話履歴とコンテキストは消去されます。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認" })).toBeInTheDocument();
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

  it("keeps the composer frame in its active focus styling even before focus", () => {
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
          resolvedTheme="dark"
          session={createSession()}
        />
      </TooltipProvider>,
    );

    const composerFrame = screen.getByPlaceholderText(defaultPromptPlaceholder).parentElement?.parentElement;
    expect(composerFrame).toHaveClass("border-[#4d88c7]", "ring-2", "ring-[#4d88c7]/20");
  });

  it("uses the dramatic connected label in chinese while keeping the tooltip detail standard", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");

    render(
      <I18nProvider>
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
        </TooltipProvider>
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.hover(screen.getByText("大钳在握"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("OpenClaw 连接状态");
    expect(screen.getByRole("tooltip")).toHaveTextContent("已连接");
  });

  it("reserves stable footer width for the connection label and hint", () => {
    const { container } = render(
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
          session={createSession({ mode: "openclaw", status: "空闲" })}
        />
      </TooltipProvider>,
    );

    expect(container.querySelector("[data-connection-status-label]")).toHaveClass("min-w-[6ch]");
    expect(container.querySelector("[data-connection-status-hint]")).toHaveClass("md:min-w-[22rem]");
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
    expect(screen.getAllByText("开启新会话后，当前会话的内容将重置，上下文长度清零").length).toBeGreaterThan(0);
  });

  it("opens the mention picker from the @ button and inserts the selected item at the cursor", async () => {
    render(<MentionHarness initialPrompt="hello world" />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);
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
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);
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

  it("renders markdown images inside user messages", async () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={{ current: null }}
          messages={[
            {
              id: "msg-user-markdown-image",
              role: "user",
              content: "![image](file:///Users/marila/openclaw/workspace/media/inbound/openclaw-media-1773729468593-nd9non.jpg)",
              timestamp: 1,
            },
          ]}
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

    const image = await screen.findByAltText("image");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute(
      "src",
      "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fopenclaw%2Fworkspace%2Fmedia%2Finbound%2Fopenclaw-media-1773729468593-nd9non.jpg",
    );
  });



  it("renders markdown images with Windows file URLs inside user messages", async () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={{ current: null }}
          messages={[
            {
              id: "msg-user-markdown-image-windows",
              role: "user",
              content: "![image](file:///C:/Users/marila/openclaw/workspace/media/inbound/demo.jpg)",
              timestamp: 1,
            },
          ]}
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

    const image = await screen.findByAltText("image");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute(
      "src",
      "/api/file-preview/content?path=C%3A%2FUsers%2Fmarila%2Fopenclaw%2Fworkspace%2Fmedia%2Finbound%2Fdemo.jpg",
    );
  });
  it.each(["[图片]", "[image]", "[Image]"])(
    "hides the DingTalk image placeholder label %s when a markdown image follows it",
    async (placeholder) => {
      render(
        <TooltipProvider>
          <ChatPanel
            busy={false}
            formatTime={() => "10:00:00"}
            messageViewportRef={{ current: null }}
            messages={[
              {
                id: "msg-user-dingtalk-image",
                role: "user",
                content: `${placeholder}\n\n![image](file:///Users/marila/openclaw/workspace/media/inbound/openclaw-media-1773729468593-nd9non.jpg)`,
                timestamp: 1,
              },
            ]}
            onChatFontSizeChange={() => {}}
            onPromptChange={() => {}}
            onPromptKeyDown={() => {}}
            onReset={() => {}}
            onSend={() => {}}
            prompt=""
            promptRef={null}
            resolvedTheme="dark"
            session={createSession({ sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}' })}
          />
        </TooltipProvider>,
      );

      expect(screen.queryByText(placeholder)).not.toBeInTheDocument();
      expect(await screen.findByAltText("image")).toBeInTheDocument();
    },
  );

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
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("pins inactive tab shortcut numbers to the top-left corner badge position", () => {
    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:writer", agentId: "writer", active: false, busy: false, title: "writer" },
          ]}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("2")).toHaveClass("absolute", "left-[0.8125rem]", "top-0", "-translate-x-1/2", "text-[12px]", "font-bold");
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

  it("shows a numeric unread badge on inactive tabs without covering the title", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:main"
          busy={false}
          chatTabs={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main", unreadCount: 0 },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert", unreadCount: 12 },
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

    expect(screen.getByRole("button", { name: "expert" }).querySelector(".cc-chat-tab-unread-badge")).toHaveTextContent("12");
    expect(screen.getByRole("button", { name: "main" }).querySelector(".cc-chat-tab-unread-badge")).toBeFalsy();
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

  it("activates an inactive tab on click", async () => {
    const onActivate = vi.fn();

    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
          onActivate={onActivate}
        />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "expert" }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith("agent:expert");
  });

  it("activates an inactive tab on pointerdown for faster response", () => {
    const onActivate = vi.fn();

    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
          onActivate={onActivate}
        />
      </TooltipProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "expert" }), { button: 0, pointerType: "touch" });

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith("agent:expert");
  });

  it("keeps the dragged tab in place and renders a detached drag overlay", () => {
    const onReorder = vi.fn();

    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
          onReorder={onReorder}
        />
      </TooltipProvider>,
    );

    const sourceButton = screen.getByRole("button", { name: "main" });
    const targetButton = screen.getByRole("button", { name: "expert" });
    const sourceWrapper = sourceButton.closest(".group");
    const targetWrapper = targetButton.closest(".group");
    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    expect(sourceWrapper).toBeTruthy();
    expect(targetWrapper).toBeTruthy();
    expect(viewport).toBeTruthy();

    viewport.getBoundingClientRect = () => ({
      top: 10,
      left: 10,
      right: 500,
      bottom: 120,
      width: 490,
      height: 110,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    });
    sourceWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 20,
      right: 140,
      bottom: 73,
      width: 120,
      height: 53,
      x: 20,
      y: 20,
      toJSON: () => ({}),
    });
    targetWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 160,
      right: 280,
      bottom: 73,
      width: 120,
      height: 53,
      x: 160,
      y: 20,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 80, clientY: 46, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 250, clientY: 96, pointerId: 1 });

    expect(sourceWrapper).not.toHaveClass("opacity-75");
    expect(onReorder).toHaveBeenCalledWith("agent:main", "agent:expert", "after");
    expect(sourceWrapper).toHaveStyle({ opacity: "0" });
    const dragOverlay = document.querySelector("[data-dragging-tab-overlay='true']");
    expect(dragOverlay).toBeTruthy();
    expect(dragOverlay.getAttribute("style")).toContain("top: 20px");
  });

  it("scrolls the tab rail on pointerdown for faster response", async () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:writer", agentId: "writer", active: false, busy: false, title: "writer" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
            { id: "agent:transformer", agentId: "transformer", active: false, busy: false, title: "transformer" },
          ]}
        />
      </TooltipProvider>,
    );

    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    expect(viewport).toBeTruthy();

    let scrollLeftValue = 0;
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      get: () => 180,
    });
    Object.defineProperty(viewport, "scrollWidth", {
      configurable: true,
      get: () => 520,
    });
    Object.defineProperty(viewport, "scrollLeft", {
      configurable: true,
      get: () => scrollLeftValue,
      set: (value) => {
        scrollLeftValue = value;
      },
    });
    viewport.scrollBy = vi.fn(({ left }) => {
      scrollLeftValue += left;
      fireEvent.scroll(viewport);
    });

    fireEvent(window, new Event("resize"));

    const rightButton = await screen.findByRole("button", { name: "向右滚动会话标签" });
    fireEvent.pointerDown(rightButton, { button: 0, pointerType: "touch" });

    expect(viewport.scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollLeftValue).toBeGreaterThan(0);
  });

  it("keeps the close button visible on the active tab while dragging", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
        />
      </TooltipProvider>,
    );

    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    const sourceWrapper = screen.getByRole("button", { name: "main" }).closest(".group");
    expect(viewport).toBeTruthy();
    expect(sourceWrapper).toBeTruthy();

    viewport.getBoundingClientRect = () => ({
      top: 10,
      left: 10,
      right: 500,
      bottom: 120,
      width: 490,
      height: 110,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    });
    sourceWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 20,
      right: 140,
      bottom: 73,
      width: 120,
      height: 53,
      x: 20,
      y: 20,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 80, clientY: 46, pointerId: 1 });
    expect(within(sourceWrapper).getByLabelText("关闭会话 main")).toBeInTheDocument();

    fireEvent.pointerMove(window, { clientX: 120, clientY: 46, pointerId: 1 });

    expect(within(sourceWrapper).getByLabelText("关闭会话 main")).toBeInTheDocument();
  });

  it("does not activate an inactive tab while dragging it", () => {
    const onActivate = vi.fn();

    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
          onActivate={onActivate}
        />
      </TooltipProvider>,
    );

    const sourceWrapper = screen.getByRole("button", { name: "expert" }).closest(".group");
    expect(sourceWrapper).toBeTruthy();

    sourceWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 160,
      right: 280,
      bottom: 73,
      width: 120,
      height: 53,
      x: 160,
      y: 20,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 220, clientY: 46, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 260, clientY: 46, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("keeps the dragged tab inside the horizontal tab rail bounds", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
        />
      </TooltipProvider>,
    );

    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    const sourceWrapper = screen.getByRole("button", { name: "main" }).closest(".group");

    viewport.getBoundingClientRect = () => ({
      top: 10,
      left: 50,
      right: 260,
      bottom: 120,
      width: 210,
      height: 110,
      x: 50,
      y: 10,
      toJSON: () => ({}),
    });
    sourceWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 60,
      right: 180,
      bottom: 73,
      width: 120,
      height: 53,
      x: 60,
      y: 20,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 120, clientY: 46, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: -40, clientY: 46, pointerId: 1 });

    let dragOverlay = document.querySelector("[data-dragging-tab-overlay='true']");
    expect(dragOverlay).toBeTruthy();
    expect(dragOverlay.getAttribute("style")).toContain("left: 50px");

    fireEvent.pointerMove(window, { clientX: 400, clientY: 46, pointerId: 1 });

    dragOverlay = document.querySelector("[data-dragging-tab-overlay='true']");
    expect(dragOverlay).toBeTruthy();
    expect(dragOverlay.getAttribute("style")).toContain("left: 140px");
  });

  it("waits until the pointer clearly crosses the target midpoint before reordering", () => {
    const onReorder = vi.fn();

    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
          onReorder={onReorder}
        />
      </TooltipProvider>,
    );

    const sourceButton = screen.getByRole("button", { name: "main" });
    const targetButton = screen.getByRole("button", { name: "expert" });
    const sourceWrapper = sourceButton.closest(".group");
    const targetWrapper = targetButton.closest(".group");

    sourceWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 20,
      right: 140,
      bottom: 73,
      width: 120,
      height: 53,
      x: 20,
      y: 20,
      toJSON: () => ({}),
    });
    targetWrapper.getBoundingClientRect = () => ({
      top: 20,
      left: 160,
      right: 280,
      bottom: 73,
      width: 120,
      height: 53,
      x: 160,
      y: 20,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 80, clientY: 46, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 214, clientY: 46, pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { clientX: 250, clientY: 46, pointerId: 1 });

    expect(onReorder).toHaveBeenCalledWith("agent:main", "agent:expert", "after");
  });

  it("animates the displaced tab into its new slot while dragging reorders", () => {
    const { rerender } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
        />
      </TooltipProvider>,
    );

    const sourceButton = screen.getByRole("button", { name: "main" });
    const targetButton = screen.getByRole("button", { name: "expert" });
    const sourceWrapper = sourceButton.closest(".group");
    const targetWrapper = targetButton.closest(".group");
    expect(sourceWrapper).toBeTruthy();
    expect(targetWrapper).toBeTruthy();

    let layout = {
      "agent:main": { top: 20, left: 20, width: 120, height: 53 },
      "agent:expert": { top: 20, left: 160, width: 120, height: 53 },
    };
    const toRect = ({ top, left, width, height }) => ({
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });

    sourceWrapper.getBoundingClientRect = () => toRect(layout["agent:main"]);
    targetWrapper.getBoundingClientRect = () => toRect(layout["agent:expert"]);

    const animateMock = vi.fn();
    targetWrapper.animate = animateMock;

    fireEvent.pointerDown(sourceWrapper, { button: 0, clientX: 80, clientY: 46, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 250, clientY: 46, pointerId: 1 });

    layout = {
      "agent:main": { top: 20, left: 160, width: 120, height: 53 },
      "agent:expert": { top: 20, left: 20, width: 120, height: 53 },
    };

    rerender(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
          ]}
        />
      </TooltipProvider>,
    );

    expect(animateMock).toHaveBeenCalledWith(
      [
        { transform: "translate(140px, 0px)" },
        { transform: "translate(0px, 0px)" },
      ],
      expect.objectContaining({
        duration: 180,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }),
    );
  });

  it("renders IM tabs with platform logo and without the trailing agent name", () => {
    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            {
              id: "agent:main::abc123",
              agentId: "main",
              active: false,
              busy: false,
              title: "钉钉 main",
              sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
            },
          ]}
        />
      </TooltipProvider>,
    );

    const tabButton = screen.getByText("钉钉").closest("button");

    expect(tabButton).toBeTruthy();
    expect(tabButton).toHaveTextContent("钉钉");
    expect(tabButton).not.toHaveTextContent("钉钉 main");
    expect(tabButton.querySelector('[data-im-logo="dingtalk-connector"]')).not.toBeNull();
  });

  it("uses a brighter IM logo chip for the active IM tab", () => {
    render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            {
              id: "agent:main::wecom",
              agentId: "main",
              active: true,
              busy: false,
              title: "企微 main",
              sessionUser: "agent:main:wecom:direct:marila",
            },
          ]}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "企微" }).querySelector('[data-im-logo="wecom"]')).toHaveClass(
      "h-[18px]",
      "w-[18px]",
      "bg-white",
      "border-white/55",
    );
  });

  it("keeps the tab rail at a stable height during drag interactions", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatTabsStrip
          items={[
            { id: "agent:main", agentId: "main", active: true, busy: false, title: "main" },
            { id: "agent:expert", agentId: "expert", active: false, busy: false, title: "expert" },
          ]}
        />
      </TooltipProvider>,
    );

    const rail = container.firstElementChild;
    const viewport = container.querySelector(".cc-chat-tabs-viewport");
    const firstTabWrapper = screen.getByRole("button", { name: "main" }).closest(".group");

    expect(rail).toHaveClass("min-h-[54px]");
    expect(viewport).toHaveClass("min-h-[54px]");
    expect(firstTabWrapper).toHaveClass("h-[50px]");
  });

  it("renders the current conversation title with the IM platform prefix", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          activeChatTabId="agent:ops::wecom"
          busy={false}
          currentAgentId="ops"
          formatTime={() => "10:00:00"}
          messages={[
            {
              id: "assistant-im-title",
              role: "assistant",
              content: "已收到",
              createdAt: 1710000000000,
            },
          ]}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          resolvedTheme="light"
          session={createSession({
            agentId: "ops",
            sessionUser: "agent:main:wecom:direct:marila",
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("企微 - ops - 当前会话")).toBeInTheDocument();
  });

  it("renders English IM platform names outside Chinese locales", async () => {
    window.localStorage.setItem(localeStorageKey, "en");

    render(
      <I18nProvider>
        <TooltipProvider>
          <ChatPanel
            activeChatTabId="agent:ops::wecom"
            busy={false}
            currentAgentId="ops"
            formatTime={() => "10:00:00"}
            messages={[]}
            onPromptChange={() => {}}
            onPromptKeyDown={() => {}}
            onReset={() => {}}
            onSend={() => {}}
            prompt=""
            promptRef={null}
            resolvedTheme="light"
            session={createSession({
              agentId: "ops",
              sessionUser: "agent:main:wecom:direct:marila",
            })}
          />
        </TooltipProvider>
      </I18nProvider>,
    );

    expect(await screen.findByText("WeCom - ops - Current session")).toBeInTheDocument();
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

    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);
    expect(textarea).toHaveAttribute("rows", "2");
    expect(textarea).toHaveClass("min-h-[4.6rem]");
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

    expect(screen.getByText("↑↓输入历史 - 回车发送，Shift + 回车换行")).toBeInTheDocument();
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

    expect(screen.getByText("↑↓输入历史 - 快速连按回车或 Shift + 回车发送，回车换行")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换为回车发送" })).toBeInTheDocument();
  });

  it("shows a tooltip for the composer send mode switcher", async () => {
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

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "切换为回车发送" }));

    expect((await screen.findAllByText("Enter 还是 Shift Enter？")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("如果你经常误触 Enter 不小心发送，希望更谨慎行事，考虑使用 Shift Enter 发送").length).toBeGreaterThan(0);
  });

  it("places the timestamp above the outline for assistant messages that render an outline", () => {
    const messageViewportRef = { current: null };
    const { container } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={messageViewportRef}
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
    expect(metaStack.querySelector("aside")).toHaveClass("max-h-[calc(100vh-6rem)]", "overflow-hidden");
    expect(metaStack.querySelector("[data-message-outline-scroll-area]")).toHaveClass("cc-scroll-region", "overflow-y-auto", "overflow-x-hidden");
  });

  it("keeps the outline bottom 12px above the conversation viewport bottom", async () => {
    const messageViewportRef = { current: null };
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={messageViewportRef}
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

    const aside = screen.getByText("大纲").closest("aside");
    expect(aside).toBeTruthy();
    expect(messageViewportRef.current).toBeTruthy();

    Object.defineProperty(messageViewportRef.current, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 100, bottom: 540, left: 0, right: 0, width: 0, height: 440 }),
    });
    Object.defineProperty(aside, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 140, bottom: 260, left: 0, right: 0, width: 0, height: 120 }),
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(aside.style.maxHeight).toBe("388px");
    });
  });

  it("keeps the outline height stable while the chat viewport scrolls", async () => {
    const messageViewportRef = { current: null };
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={messageViewportRef}
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

    const aside = screen.getByText("大纲").closest("aside");
    expect(aside).toBeTruthy();
    expect(messageViewportRef.current).toBeTruthy();

    Object.defineProperty(messageViewportRef.current, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 100, bottom: 540, left: 0, right: 0, width: 0, height: 440 }),
    });

    let outlineTop = 140;
    Object.defineProperty(aside, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: outlineTop, bottom: outlineTop + 120, left: 0, right: 0, width: 0, height: 120 }),
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(aside.style.maxHeight).toBe("388px");
    });

    outlineTop = 72;

    act(() => {
      messageViewportRef.current.dispatchEvent(new Event("scroll"));
    });

    expect(aside.style.maxHeight).toBe("388px");
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

  it("keeps the latest assistant outline hidden while the header is still latched busy", () => {
    vi.useFakeTimers();

    const { container, rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              id: "msg-latched-busy-outline",
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

    expect(container.querySelector("[data-message-outline-meta-stack]")).toBeNull();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              id: "msg-latched-busy-outline",
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

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
    expect(container.querySelector("[data-message-outline-meta-stack]")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("待命")).toBeInTheDocument();
    expect(container.querySelector("[data-message-outline-meta-stack]")).not.toBeNull();
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
    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
  });

  it("unwraps assistant final envelope tags before rendering the message", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "assistant", content: "<final>Hey 奥尘！👋 今晚好~ 有什么需要帮忙的吗？</final>", timestamp: 2 },
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

    expect(screen.getByText("Hey 奥尘！👋 今晚好~ 有什么需要帮忙的吗？")).toBeInTheDocument();
    expect(screen.queryByText(/<final>/i)).not.toBeInTheDocument();
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

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
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
          session={createSession({ status: "消化 Token 中" })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("待命")).toBeInTheDocument();
    expect(screen.queryByText("消化 Token 中")).not.toBeInTheDocument();
  });

  it("shows busy for DingTalk sessions when the runtime status says running without a local pending bubble", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "上一句", timestamp: 1 },
            { role: "assistant", content: "上一句回复", timestamp: 2 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({
            sessionUser: '{"channel":"dingtalk-connector","peerid":"398058"}',
            status: "运行中",
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
    expect(screen.queryByText("待命")).not.toBeInTheDocument();
  });

  it("keeps the header busy badge stable through a brief false pulse", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy
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

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();

    rerender(
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

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
    expect(screen.queryByText("待命")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("待命")).toBeInTheDocument();
  });

  it("shows busy for Feishu sessions when the runtime status says running without a local pending bubble", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "上一句", timestamp: 1 },
            { role: "assistant", content: "上一句回复", timestamp: 2 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({
            sessionUser: "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58",
            status: "运行中",
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
    expect(screen.queryByText("待命")).not.toBeInTheDocument();
  });

  it("does not attach streaming tail dots to the previous assistant bubble when an IM turn currently ends on a user message", () => {
    const { container } = render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "assistant", content: "在。你说。", timestamp: 1 },
            { role: "user", content: "菠菜", timestamp: 2 },
          ]}
          onChatFontSizeChange={() => {}}
          onPromptChange={() => {}}
          onPromptKeyDown={() => {}}
          onReset={() => {}}
          onSend={() => {}}
          prompt=""
          promptRef={null}
          session={createSession({
            sessionUser: "agent:main:openclaw-weixin:direct:marila",
            status: "运行中",
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
    expect(container.querySelector('[data-streaming-tail-dots="true"]')).toBeNull();
  });

  it("keeps the latest streaming assistant bubble in full layout without reusing the pending card style", () => {
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

    const streamingBubble = screen.getByText("我").closest('[data-bubble-layout="full"]');
    expect(streamingBubble).toHaveClass("cc-streaming-bubble");
    expect(streamingBubble).toHaveClass("transition-none");
    expect(streamingBubble).not.toHaveClass("cc-thinking-bubble");
    expect(screen.queryByText("生成中")).not.toBeInTheDocument();
    expect(streamingBubble?.querySelector('[data-streaming-tail-dots="true"]')).toBeTruthy();
  });

  it("keeps the streaming assistant DOM node stable when timestamp changes without an explicit id", () => {
    const { rerender, container } = render(
      <TooltipProvider>
        <ChatPanel
          busy
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
          session={createSession({ agentId: "news" })}
        />
      </TooltipProvider>,
    );

    const initialBubble = container.querySelector('[data-message-anchor="latest-assistant"]');
    expect(initialBubble).toBeTruthy();

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:01"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段\n第二段", timestamp: 3, streaming: true },
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

    const updatedBubble = container.querySelector('[data-message-anchor="latest-assistant"]');
    expect(updatedBubble).toBe(initialBubble);
    expect(updatedBubble?.textContent || "").toContain("第一段");
    expect(updatedBubble?.textContent || "").toContain("第二段");
  });

  it("does not keep the breathing class once the assistant message is no longer streaming", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
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
    expect(screen.queryByText("生成中")).not.toBeInTheDocument();
    expect(settledBubble?.querySelector('[data-streaming-tail-dots="true"]')).toBeNull();
  });

  it("keeps the trailing dots on the active assistant bubble while the turn is still busy even if the streaming flag has dropped", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-active", role: "assistant", content: "收到。", timestamp: 2 },
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

    const activeBubble = screen.getByText("收到。").closest('[data-bubble-layout="full"]');
    expect(activeBubble?.querySelector('[data-streaming-tail-dots="true"]')).toBeTruthy();
    expect(screen.getByText("消化 Token 中")).toBeInTheDocument();
  });

  it("keeps the trailing dots latched through a brief busy-state drop while the streaming card is settling", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <TooltipProvider>
        <ChatPanel
          busy
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "收到", timestamp: 2, streaming: true },
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

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "收到。", timestamp: 2 },
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

    const settledBubble = screen.getByText("收到。").closest('[data-bubble-layout="full"]');
    expect(settledBubble?.querySelector('[data-streaming-tail-dots="true"]')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(settledBubble?.querySelector('[data-streaming-tail-dots="true"]')).toBeNull();
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
      vi.fn(async (input) => {
        const url = String(input);
        if (url.startsWith("/api/workspace-tree")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              items: [
                {
                  path: "/Users/marila/projects/lalaclaw/workspace/videos",
                  fullPath: "/Users/marila/projects/lalaclaw/workspace/videos",
                  kind: "目录",
                  hasChildren: true,
                },
                {
                  path: "/Users/marila/projects/lalaclaw/workspace/sample.py",
                  fullPath: "/Users/marila/projects/lalaclaw/workspace/sample.py",
                  kind: "文件",
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          json: async () => ({
            ok: true,
            kind: "text",
            path: "/Users/marila/projects/lalaclaw/workspace/sample.py",
            name: "sample.py",
            content: "print('preview works')\n",
          }),
        };
      }),
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
          session={createSession({
            sessionUser: "command-center",
            workspaceRoot: "/Users/marila/projects/lalaclaw/workspace",
          })}
          workspaceCount={128}
          workspaceFiles={[
            {
              path: "/Users/marila/projects/lalaclaw/workspace/videos",
              fullPath: "/Users/marila/projects/lalaclaw/workspace/videos",
              kind: "目录",
              hasChildren: true,
            },
            {
              path: "/Users/marila/projects/lalaclaw/workspace/sample.py",
              fullPath: "/Users/marila/projects/lalaclaw/workspace/sample.py",
              kind: "文件",
            },
          ]}
          workspaceLoaded
        />
      </TooltipProvider>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "sample.py" }));

    expect(await screen.findByText("python")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain("print('preview works')");
    const sidebar = screen.getByTestId("file-preview-files-sidebar");
    expect(sidebar).toBeInTheDocument();
    expect(within(sidebar).getByText(/^Session files$|^本次会话文件$/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "sample.py" }).length).toBeGreaterThan(1);

    const workspaceButton = within(sidebar).getByRole("button", { name: /^workspace 文件 / });
    expect(workspaceButton).toHaveTextContent("128");

    const videosButton = await within(sidebar).findByRole("button", { name: /^videos / });
    expect(videosButton).toBeInTheDocument();
    expect(within(sidebar).getAllByRole("button", { name: "sample.py" }).length).toBeGreaterThan(0);
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
    expect(await screen.findByRole("button", { name: "放大图片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();

    await user.click(screen.getByAltText("draft.png"));
    expect(screen.getByRole("button", { name: "向左旋转" })).toBeInTheDocument();
  });

  it("renders persisted local image attachments through the file preview content route", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              role: "user",
              content: "这是持久化后的图片附件。",
              timestamp: 1,
              attachments: [
                {
                  id: "persisted-image",
                  kind: "image",
                  name: "poster.png",
                  size: 2048,
                  path: "/Users/marila/projects/lalaclaw2/workspace/poster.png",
                  fullPath: "/Users/marila/projects/lalaclaw2/workspace/poster.png",
                },
              ],
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

    const image = screen.getByAltText("poster.png");
    expect(image).toHaveAttribute(
      "src",
      "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw2%2Fworkspace%2Fposter.png",
    );

    await user.click(image);
    expect(await screen.findByRole("button", { name: "放大图片" })).toBeInTheDocument();
  });

  it("renders equivalent message image attachments only once when payloads arrive from different layers", () => {
    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={null}
          messages={[
            {
              role: "user",
              content: "修改这张图。把上衣改成姜黄色吧",
              timestamp: 1,
              attachments: [
                {
                  id: "local-image",
                  kind: "image",
                  name: "wukong-mibai-eyes-brave.png",
                  mimeType: "image/png",
                  size: 826 * 1024,
                  dataUrl: "data:image/png;base64,BBBB",
                  previewUrl: "data:image/png;base64,BBBB",
                },
                {
                  id: "runtime-image",
                  kind: "image",
                  name: "wukong-mibai-eyes-brave.png",
                  mimeType: "image/png",
                  size: 826 * 1024,
                  path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/wukong-mibai-eyes-brave.png",
                  fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/wukong-mibai-eyes-brave.png",
                },
              ],
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

    const images = screen.getAllByAltText("wukong-mibai-eyes-brave.png");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "data:image/png;base64,BBBB");
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

    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);
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
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

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
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "@");

    const writerOption = screen.getByRole("button", { name: /writer/i });
    expect(writerOption.className).toMatch(/bg-\[|bg-foreground\/10/);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(textarea).toHaveValue("expert ");
    expect(screen.queryByRole("button", { name: /expert/i })).not.toBeInTheDocument();
  });

  it("positions the @ mention menu near the trigger caret instead of pinning it to the composer edge", async () => {
    render(<MentionHarness availableMentionAgents={["writer", "expert", "transformer"]} />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);
    const composerMentionLayer = textarea.parentElement?.parentElement?.parentElement;
    expect(composerMentionLayer).not.toBeNull();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === "div") {
        element.getBoundingClientRect = () => ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        });
      }
      if (String(tagName).toLowerCase() === "span") {
        element.getBoundingClientRect = () => ({
          x: 220,
          y: 44,
          left: 220,
          top: 44,
          right: 228,
          bottom: 64,
          width: 8,
          height: 20,
          toJSON: () => ({}),
        });
      }
      return element;
    });

    Object.defineProperty(textarea, "clientWidth", { configurable: true, value: 640 });
    textarea.getBoundingClientRect = () => ({
      x: 100,
      y: 500,
      left: 100,
      top: 500,
      right: 740,
      bottom: 596,
      width: 640,
      height: 96,
      toJSON: () => ({}),
    });
    composerMentionLayer.getBoundingClientRect = () => ({
      x: 80,
      y: 460,
      left: 80,
      top: 460,
      right: 760,
      bottom: 620,
      width: 680,
      height: 160,
      toJSON: () => ({}),
    });

    await user.type(textarea, "abcdefghijklmnopqrstuvwxyz @wr");

    const mentionMenu = screen.getByTestId("mention-menu-composer");
    expect(mentionMenu.style.left).not.toBe("12px");
    expect(Number.parseFloat(mentionMenu.style.left)).toBeGreaterThan(100);
  });

  it("shows skills after agents and inserts the selected skill without the trigger character", async () => {
    render(<MentionHarness availableMentionAgents={["writer"]} availableSkills={[{ name: "coding", ownerAgentId: "expert" }, { name: "nano-banana", ownerAgentId: "paint" }]} />);

    const user = userEvent.setup();
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

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
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

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
    viewport.scrollTo = vi.fn(({ top }) => {
      viewport.scrollTop = top;
      fireEvent.scroll(viewport);
    });
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
    const latestAssistantCard = latestAssistantAnchor.querySelector('[data-bubble-layout="full"]');
    expect(latestAssistantCard).toBeTruthy();
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
    latestAssistantCard.getBoundingClientRect = () => {
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
    expect(jumpButton).toHaveClass(
      "pointer-events-none",
      "opacity-0",
      "group-hover/message:pointer-events-auto",
      "group-hover/message:opacity-100",
      "group-focus-within/message:pointer-events-auto",
      "group-focus-within/message:opacity-100",
    );
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

  it("does not show the message-top jump button when the card top is still visible", async () => {
    const viewportRef = { current: null };

    render(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { role: "assistant", content: "第一段\n\n第二段\n第三段\n第四段\n第五段\n第六段", timestamp: 2 },
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
    const latestAssistantCard = latestAssistantAnchor.querySelector('[data-bubble-layout="full"]');
    expect(latestAssistantCard).toBeTruthy();

    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: -24,
      left: 0,
      right: 560,
      bottom: 316,
      width: 560,
      height: 340,
      x: 0,
      y: -24,
      toJSON: () => ({}),
    });
    latestAssistantCard.getBoundingClientRect = () => ({
      top: 12,
      left: 0,
      right: 560,
      bottom: 332,
      width: 560,
      height: 320,
      x: 0,
      y: 12,
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

  it("returns to the bottom when a new user message is sent", async () => {
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

    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "auto" });
    expect(viewport.scrollTop).toBe(720);
  });

  it("restores bottom-follow for the next turn's thinking card after manual takeover", async () => {
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

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "auto" });
    });
    expect(viewport.scrollTop).toBe(720);
  });

  it("restores auto-follow after the user manually scrolls back to the bottom", async () => {
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    });
    expect(viewport.scrollTop).toBe(800);
  });

  it("restores auto-follow after wheel scrolling returns to the bottom", async () => {
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

    fireEvent.wheel(viewport);
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    });
    expect(viewport.scrollTop).toBe(800);
  });

  it("restores auto-follow after keyboard scrolling returns to the bottom", async () => {
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    });
    expect(viewport.scrollTop).toBe(800);
  });

  it("restores bottom-follow instead of re-entering the top-20% pin after manual intervention", async () => {
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    });
    expect(viewport.scrollTop).toBe(800);
  });

  it("starts a fresh bottom-follow cycle for a new user turn after the previous turn was manually interrupted", async () => {
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
            { role: "user", content: "上一轮问题", timestamp: 1 },
            { id: "msg-assistant-stream-1", role: "assistant", content: "第一段", timestamp: 2, streaming: true },
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

    let latestAssistantAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
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
    fireEvent.wheel(viewport);
    viewport.scrollTop = 420;
    fireEvent.scroll(viewport);
    viewport.scrollTo.mockClear();

    viewport.scrollHeight = 1200;
    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "上一轮问题", timestamp: 1 },
            { id: "msg-assistant-stream-1", role: "assistant", content: "第一段\n第二段", timestamp: 2, streaming: true },
            { role: "user", content: "新问题", timestamp: 3 },
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 960, behavior: "auto" });
    });

    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 1400;
    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "上一轮问题", timestamp: 1 },
            { id: "msg-assistant-stream-1", role: "assistant", content: "第一段\n第二段", timestamp: 2 },
            { role: "user", content: "新问题", timestamp: 3 },
            { id: "msg-assistant-stream-2", role: "assistant", content: "第一段\n第二段\n第三段\n第四段", timestamp: 4, streaming: true },
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

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top, behavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(behavior).toBe("auto");
    expect(top).toBe(1160);

    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 1520;
    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "上一轮问题", timestamp: 1 },
            { id: "msg-assistant-stream-1", role: "assistant", content: "第一段\n第二段", timestamp: 2 },
            { role: "user", content: "新问题", timestamp: 3 },
            { id: "msg-assistant-stream-2", role: "assistant", content: "第一段\n第二段\n第三段\n第四段\n第五段\n第六段", timestamp: 4, streaming: true },
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
    expect(latestAssistantAnchor).toBeTruthy();
    latestAssistantAnchor.getBoundingClientRect = () => ({
      top: 40,
      left: 0,
      right: 560,
      bottom: 400,
      width: 560,
      height: 360,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(viewport.scrollTo).toHaveBeenCalled();
    });
    const [{ top: pinnedTop, behavior: pinnedBehavior }] = viewport.scrollTo.mock.calls.at(-1);
    expect(pinnedBehavior).toBe("auto");
    expect(pinnedTop).toBeGreaterThan(900);
    expect(pinnedTop).toBeLessThan(1280);
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
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

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
    const anchorRectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function mockedRect() {
      if (this.getAttribute?.("data-scroll-anchor-id") === "message-2-0-block-0") {
        return {
          top: documentTop - viewport.scrollTop,
          left: 0,
          right: 560,
          bottom: documentTop - viewport.scrollTop + 260,
          width: 560,
          height: 260,
          x: 0,
          y: documentTop - viewport.scrollTop,
          toJSON: () => ({}),
        };
      }

      return originalGetBoundingClientRect.call(this);
    });

    try {
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
    } finally {
      anchorRectSpy.mockRestore();
    }
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
            { role: "user", content: "第二段", timestamp: 2 },
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
    viewport.scrollHeight = 1120;

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
      expect(viewport.scrollTop).toBe(880);
    });

    expect(viewport.scrollTo.mock.calls).not.toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ top: 788, behavior: "auto" })],
      ]),
    );
    expect(viewport.scrollTo.mock.calls.every(([options]) => options?.top === 880 && options?.behavior === "auto")).toBe(true);
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

    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);

    const bottomButton = await screen.findByRole("button", { name: "回到底部" });
    fireEvent.click(bottomButton);

    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "smooth" });
  });

  it("keeps the bottom button hidden on first load until the user scrolls, even when the sentinel reports away-from-bottom", async () => {
    const viewportRef = { current: null };
    const observedEntries = [];

    class IntersectionObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        observedEntries.push(this);
      }

      disconnect() {}

      observe(target) {
        this.targets.push(target);
      }

      unobserve() {}
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

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

    const bottomObserver = observedEntries.find((entry) =>
      entry.targets.some((target) => target?.hasAttribute?.("data-message-bottom-sentinel")),
    );
    const observedTarget = bottomObserver?.targets.find((target) => target?.hasAttribute?.("data-message-bottom-sentinel"));

    expect(bottomObserver?.callback).toBeTypeOf("function");
    expect(observedTarget).toBeTruthy();

    act(() => {
      bottomObserver.callback([
        {
          target: observedTarget,
          isIntersecting: false,
          intersectionRatio: 0,
        },
      ]);
    });

    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();

    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);

    act(() => {
      bottomObserver.callback([
        {
          target: observedTarget,
          isIntersecting: false,
          intersectionRatio: 0,
        },
      ]);
    });

    expect(await screen.findByRole("button", { name: "回到底部" })).toBeInTheDocument();
  });

  it("hides the bottom button again when a layout resize brings the viewport back to the bottom", async () => {
    const viewportRef = { current: null };
    const resizeObservers = [];

    class ResizeObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        resizeObservers.push(this);
      }

      disconnect() {}

      observe(target) {
        this.targets.push(target);
      }

      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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

    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);

    expect(await screen.findByRole("button", { name: "回到底部" })).toBeInTheDocument();

    viewport.scrollTop = 0;
    viewport.scrollHeight = 240;
    fireEvent.scroll(viewport);

    await act(async () => {
      resizeObservers.forEach((observer) => observer.callback([]));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();
    });
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

  it("does not show the bottom button immediately after restoring a non-bottom scroll position", async () => {
    const viewportRef = { current: null };

    const { rerender } = render(
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
          restoredScrollKey=""
          restoredScrollState={null}
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

    rerender(
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
          restoredScrollState={{ scrollTop: 320 }}
          session={createSession({ sessionUser: "command-center" })}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(320);
    });

    expect(screen.queryByRole("button", { name: "回到底部" })).not.toBeInTheDocument();

    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);

    expect(await screen.findByRole("button", { name: "回到底部" })).toBeInTheDocument();
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
    fireEvent.wheel(viewport);
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

  it("continues auto-following a streaming reply after clicking the bottom button", async () => {
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
    viewport.scrollHeight = 1120;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段\n第三段\n第四段\n第五段", timestamp: 2, streaming: true },
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 880, behavior: "auto" });
    });
  });

  it("restores auto-follow in the IntersectionObserver path after manually dragging back to the bottom", async () => {
    const viewportRef = { current: null };
    const observedEntries = [];

    class IntersectionObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        observedEntries.push(this);
      }

      disconnect() {}

      observe(target) {
        this.targets.push(target);
      }

      unobserve() {}
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
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

    const viewport = viewportRef.current;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 240 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, writable: true, value: 1040 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 800 });
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

    const bottomObserver = observedEntries.find((entry) =>
      entry.targets.some((target) => target?.hasAttribute?.("data-message-bottom-sentinel")),
    );
    const observedTarget = bottomObserver?.targets.find((target) => target?.hasAttribute?.("data-message-bottom-sentinel"));

    expect(bottomObserver?.callback).toBeTypeOf("function");
    expect(observedTarget).toBeTruthy();

    fireEvent.pointerDown(viewport);
    viewport.scrollTop = 652;
    act(() => {
      bottomObserver.callback([{ target: observedTarget, isIntersecting: false, intersectionRatio: 0 }]);
    });
    fireEvent.pointerUp(window);

    expect(await screen.findByRole("button", { name: "回到底部" })).toBeInTheDocument();

    fireEvent.pointerDown(viewport);
    viewport.scrollTop = 800;
    act(() => {
      bottomObserver.callback([{ target: observedTarget, isIntersecting: true, intersectionRatio: 1 }]);
    });
    fireEvent.pointerUp(window);
    viewport.scrollTo.mockClear();
    viewport.scrollHeight = 1120;

    rerender(
      <TooltipProvider>
        <ChatPanel
          busy={false}
          formatTime={() => "10:00:00"}
          messageViewportRef={viewportRef}
          messages={[
            { role: "user", content: "继续", timestamp: 1 },
            { id: "msg-assistant-stream", role: "assistant", content: "第一段\n第二段\n第三段\n第四段\n第五段", timestamp: 2, streaming: true },
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
      expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 880, behavior: "auto" });
    });
  });

  it("restores auto-follow in the IntersectionObserver path after wheel scrolling a short reply back to the bottom", async () => {
    const viewportRef = { current: null };
    const observedEntries = [];

    class IntersectionObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        observedEntries.push(this);
      }

      disconnect() {}

      observe(target) {
        this.targets.push(target);
      }

      unobserve() {}
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
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

    const pinnedAnchor = document.querySelector('[data-message-anchor="latest-assistant"]');
    expect(pinnedAnchor).toBeTruthy();
    pinnedAnchor.getBoundingClientRect = () => ({
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

    const bottomObserver = observedEntries.find((entry) =>
      entry.targets.some((target) => target?.hasAttribute?.("data-message-bottom-sentinel")),
    );
    const observedTarget = bottomObserver?.targets.find((target) => target?.hasAttribute?.("data-message-bottom-sentinel"));

    expect(bottomObserver?.callback).toBeTypeOf("function");
    expect(observedTarget).toBeTruthy();

    fireEvent.wheel(viewport);
    viewport.scrollTop = 420;
    fireEvent.scroll(viewport);
    act(() => {
      bottomObserver.callback([{ target: observedTarget, isIntersecting: false, intersectionRatio: 0 }]);
    });

    expect(await screen.findByRole("button", { name: "回到底部" })).toBeInTheDocument();

    fireEvent.wheel(viewport);
    viewport.scrollTop = 720;
    fireEvent.scroll(viewport);
    act(() => {
      bottomObserver.callback([{ target: observedTarget, isIntersecting: true, intersectionRatio: 1 }]);
    });
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
    const textarea = screen.getByPlaceholderText(defaultPromptPlaceholder);

    await user.type(textarea, "@wr");

    expect(screen.queryByText("writer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /writer/i })).not.toBeInTheDocument();
  });
});
