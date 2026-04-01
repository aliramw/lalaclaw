# Chat Tool Cards In Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render tool-call activity directly in the chat transcript for both live streaming turns and historical turns without interleaving tool cards into assistant markdown bubbles.

**Architecture:** Keep `messages` and `taskTimeline` as separate inputs and derive a chat render list that inserts one tool-activity block per user turn. Extract the existing inspector tool timeline UI into a shared component, then let chat compose that shared component through a chat-specific wrapper that stays outside assistant markdown rendering.

**Tech Stack:** React, TypeScript/TSX, Vitest, Testing Library, existing command-center surfaces and i18n messages

---

## File Structure

### New files

- `src/components/command-center/tool-call-timeline.tsx`
  Shared `ToolIoCodeBlock`, `ToolCallCard`, and `ToolCallTimeline` extracted from inspector-specific code.
- `src/components/command-center/tool-call-timeline.test.jsx`
  Focused regression coverage for the shared tool timeline component behavior.
- `src/components/command-center/chat-turn-activity.tsx`
  Chat-specific wrapper that renders one turn-scoped tool-activity block aligned with assistant-side content.
- `src/components/command-center/chat-panel-render-items.ts`
  Pure helpers for normalizing timeline runs, matching them to user turns, and producing stable render items for chat.

### Modified files

- `src/components/command-center/inspector-panel-timeline.tsx`
  Replace local tool-card implementation with imports from the shared component.
- `src/components/command-center/chat-panel.tsx`
  Accept `taskTimeline`, derive mixed render items, and render `ChatTurnActivityBlock` before the first assistant bubble in each turn.
- `src/components/command-center/chat-panel.test.jsx`
  Add targeted regressions for historical turns, streaming stability, pending-plus-tools, and no-tools fallback behavior.
- `src/App.tsx`
  Thread `taskTimeline` into `ChatPanel`.

### Files intentionally not changed

- `src/features/chat/controllers/use-chat-controller.ts`
- `src/features/session/runtime/use-runtime-snapshot.ts`
- `server/services/runtime-hub.ts`
- `server/services/transcript.ts`

Those modules remain unchanged in this plan to keep the scope at render/view-model level.

## Task 1: Extract Shared Tool Timeline UI

**Files:**
- Create: `src/components/command-center/tool-call-timeline.tsx`
- Create: `src/components/command-center/tool-call-timeline.test.jsx`
- Modify: `src/components/command-center/inspector-panel-timeline.tsx`
- Test: `src/components/command-center/tool-call-timeline.test.jsx`
- Regression: `src/components/command-center/inspector-panel.test.jsx`

- [ ] **Step 1: Write the failing shared-component test**

Add a new focused test file at `src/components/command-center/tool-call-timeline.test.jsx`:

```jsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";

function renderToolTimeline(tools) {
  return render(
    <I18nProvider>
      <TooltipProvider>
        <ToolCallTimeline
          resolvedTheme="light"
          messages={{
            inspector: {
              timeline: {
                collapse: "收起详情",
                expand: "查看详情",
                input: "输入",
                output: "输出",
                none: "无",
                noOutput: "暂无输出",
              },
            },
          }}
          tools={tools}
        />
      </TooltipProvider>
    </I18nProvider>,
  );
}

describe("ToolCallTimeline", () => {
  it("collapses a single tool card without hiding sibling cards", async () => {
    renderToolTimeline([
      { id: "tool-1", name: "edit_file", status: "完成", input: '{"path":"src/App.tsx"}', output: "ok", timestamp: 1000 },
      { id: "tool-2", name: "gateway", status: "完成", input: '{"action":"latest"}', output: "newest", timestamp: 2000 },
    ]);

    const user = userEvent.setup();
    const editToggle = screen.getByRole("button", { name: "edit_file 收起详情" });
    await user.click(editToggle);

    expect(screen.getByRole("button", { name: "edit_file 查看详情" })).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "gateway 收起详情" }).closest(".space-y-3")).getByText("输入")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npx vitest run src/components/command-center/tool-call-timeline.test.jsx
```

Expected: FAIL with a module resolution error such as `Cannot find module '@/components/command-center/tool-call-timeline'`.

- [ ] **Step 3: Write the minimal shared implementation**

Create `src/components/command-center/tool-call-timeline.tsx` with the extracted shared implementation:

```tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Badge } from "@/components/ui/badge";
import { CopyCodeButton } from "@/components/command-center/inspector-panel-primitives";
import { Prism, usePrismLanguage } from "@/lib/prism-languages";
import { cn } from "@/lib/utils";
import { getLocalizedStatusLabel, normalizeStatusKey } from "@/features/session/status-display";
import { looksLikeJson } from "@/components/command-center/inspector-panel-utils";

const darkToolIoTheme = themes.dracula;
const lightToolIoTheme = themes.vsLight;

export function ToolIoCodeBlock({ emptyText, label, resolvedTheme = "light", value }) {
  const content = String(value || emptyText || "").trim() || String(emptyText || "");
  const language = looksLikeJson(content) ? "json" : "text";
  const theme = resolvedTheme === "dark" ? darkToolIoTheme : lightToolIoTheme;
  const highlightedLanguage = usePrismLanguage(language);

  return (
    <div className={cn("rounded-lg border", resolvedTheme === "dark" ? "border-border bg-background/90" : "border-slate-200 bg-[#fbfcfe]")}>
      <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] font-medium", resolvedTheme === "dark" ? "border-border/70 text-muted-foreground" : "border-slate-200 text-slate-500")}>
        <span>{label}</span>
        <CopyCodeButton content={content} />
      </div>
      <Highlight prism={Prism} theme={theme} code={content} language={highlightedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className={cn("tool-io-code overflow-x-auto px-0 py-2 whitespace-pre-wrap", resolvedTheme === "dark" ? "text-zinc-50" : "text-slate-800")}>
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className="min-h-5 px-3">
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export function ToolCallCard({ isFirst = false, isLast = false, messages, resolvedTheme = "light", tool }) {
  const [open, setOpen] = useState(true);
  const normalizedStatus = normalizeStatusKey(tool.status);
  const localizedStatus = getLocalizedStatusLabel(tool.status, messages);

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <div className="relative flex justify-center">
        {!isFirst ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-0 h-[0.625rem] w-px bg-border/70" /> : null}
        <div aria-hidden="true" className={cn("relative mt-[0.625rem] h-2.5 w-2.5 rounded-full border", normalizedStatus === "failed" ? "border-rose-400/60 bg-rose-400/20" : resolvedTheme === "dark" ? "border-emerald-400/50 bg-emerald-400/20" : "border-emerald-500/50 bg-emerald-500/15")} />
        {!isLast ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-[calc(0.625rem+0.625rem)] bottom-0 w-px bg-border/70" /> : null}
      </div>
      <div className={cn("min-w-0 space-y-3", !isLast && "pb-4")}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${tool.name} ${open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-muted/20"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium">{tool.name}</div>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </div>
          <Badge variant={normalizedStatus === "failed" ? "default" : "success"} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
            {localizedStatus}
          </Badge>
        </button>

        {open ? (
          <div className="space-y-2 text-xs leading-6">
            <ToolIoCodeBlock label={messages.inspector.timeline.input} value={tool.input} emptyText={messages.inspector.timeline.none} resolvedTheme={resolvedTheme} />
            <ToolIoCodeBlock label={messages.inspector.timeline.output} value={tool.output || tool.detail} emptyText={messages.inspector.timeline.noOutput} resolvedTheme={resolvedTheme} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ToolCallTimeline({ messages, resolvedTheme = "light", tools = [] }) {
  if (!tools.length) {
    return null;
  }

  const orderedTools = tools
    .map((tool, index) => ({ tool, index }))
    .sort((left, right) => {
      const leftTimestamp = Number(left.tool?.timestamp || 0);
      const rightTimestamp = Number(right.tool?.timestamp || 0);
      if (leftTimestamp && rightTimestamp && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return left.index - right.index;
    })
    .map(({ tool }) => tool);

  return (
    <div className="space-y-0">
      {orderedTools.map((tool, toolIndex) => (
        <ToolCallCard
          key={tool.id || `${tool.name}-${tool.timestamp}`}
          isFirst={toolIndex === 0}
          isLast={toolIndex === orderedTools.length - 1}
          messages={messages}
          resolvedTheme={resolvedTheme}
          tool={tool}
        />
      ))}
    </div>
  );
}
```

Update `src/components/command-center/inspector-panel-timeline.tsx` to import the extracted shared component instead of keeping local copies:

```tsx
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";
```

Delete the old in-file `ToolIoCodeBlock`, `ToolCallCard`, and `ToolCallTimeline` declarations after the import is wired up.

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
npx vitest run src/components/command-center/tool-call-timeline.test.jsx src/components/command-center/inspector-panel.test.jsx -t "tool"
```

Expected: PASS, including the new shared-component test and existing inspector tool-card regressions.

- [ ] **Step 5: Commit**

```bash
git add src/components/command-center/tool-call-timeline.tsx src/components/command-center/tool-call-timeline.test.jsx src/components/command-center/inspector-panel-timeline.tsx
git commit -m "refactor: share tool timeline ui"
```

## Task 2: Render Historical Tool Activity Inside Chat

**Files:**
- Create: `src/components/command-center/chat-panel-render-items.ts`
- Create: `src/components/command-center/chat-turn-activity.tsx`
- Modify: `src/components/command-center/chat-panel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/command-center/chat-panel.test.jsx`
- Test: `src/components/command-center/chat-panel.test.jsx`

- [ ] **Step 1: Write the failing historical-turn chat test**

Add this test to `src/components/command-center/chat-panel.test.jsx`:

```jsx
it("renders tool activity before the corresponding assistant reply", () => {
  render(
    <TooltipProvider>
      <ChatPanel
        busy={false}
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[
          { id: "msg-user-1", role: "user", content: "帮我改文件", timestamp: 1000 },
          { id: "msg-assistant-1", role: "assistant", content: "已经处理好了。", timestamp: 3000 },
        ]}
        onPromptChange={() => {}}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt=""
        promptRef={null}
        session={createSession()}
        taskTimeline={[
          {
            id: "run-1",
            timestamp: 2000,
            prompt: "帮我改文件",
            status: "已完成",
            toolsSummary: "edit_file(完成)",
            tools: [{ id: "tool-1", name: "edit_file", status: "完成", input: '{"path":"src/App.tsx"}', output: "ok", timestamp: 2000 }],
            outcome: "处理完成",
          },
        ]}
      />
    </TooltipProvider>,
  );

  const toolToggle = screen.getByRole("button", { name: "edit_file 收起详情" });
  const assistantText = screen.getByText("已经处理好了。");
  expect(toolToggle.compareDocumentPosition(assistantText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2: Run the historical chat test and verify it fails**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "renders tool activity before the corresponding assistant reply"
```

Expected: FAIL because chat does not render any tool activity yet.

- [ ] **Step 3: Write the minimal render-item derivation and chat wrapper**

Create `src/components/command-center/chat-panel-render-items.ts`:

```ts
type ChatMessage = {
  id?: string;
  role?: string;
  timestamp?: number;
  content?: string;
  pending?: boolean;
  streaming?: boolean;
};

type TimelineRun = {
  id?: string;
  timestamp?: number;
  tools?: Record<string, unknown>[];
};

export type ChatRenderItem =
  | { type: "message"; key: string; message: ChatMessage; index: number }
  | { type: "tool-activity"; key: string; turnMessageId: string; runs: TimelineRun[] };

function getMessageId(message: ChatMessage, index: number) {
  return String(message.id || `${message.role || "message"}-${message.timestamp || index}`);
}

function normalizeRuns(taskTimeline: unknown[] = []): TimelineRun[] {
  return taskTimeline
    .filter((run): run is TimelineRun => Boolean(run && typeof run === "object" && Number((run as TimelineRun).timestamp || 0) > 0))
    .sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0));
}

export function buildChatRenderItems(messages: ChatMessage[] = [], taskTimeline: unknown[] = []): ChatRenderItem[] {
  const runs = normalizeRuns(taskTimeline);
  const userIndexes = messages.reduce<number[]>((result, message, index) => {
    if (message?.role === "user") {
      result.push(index);
    }
    return result;
  }, []);

  if (!runs.length || !userIndexes.length) {
    return messages.map((message, index) => ({ type: "message", key: getMessageId(message, index), message, index }));
  }

  const insertedTurnIds = new Set<string>();
  const items: ChatRenderItem[] = [];

  messages.forEach((message, index) => {
    const messageId = getMessageId(message, index);
    const previousUserIndex = [...userIndexes].reverse().find((candidate) => candidate <= index);
    const nextUserIndex = userIndexes.find((candidate) => candidate > index);
    const currentUser = typeof previousUserIndex === "number" ? messages[previousUserIndex] : null;
    const start = Number(currentUser?.timestamp || 0);
    const end = typeof nextUserIndex === "number" ? Number(messages[nextUserIndex]?.timestamp || 0) : Number.POSITIVE_INFINITY;
    const turnRuns = start
      ? runs.filter((run) => {
          const runTimestamp = Number(run.timestamp || 0);
          return runTimestamp >= start && runTimestamp < end;
        })
      : [];

    const firstAssistantInTurn = message?.role === "assistant" && turnRuns.length && !insertedTurnIds.has(getMessageId(currentUser || {}, previousUserIndex || 0));

    if (firstAssistantInTurn && currentUser) {
      const turnMessageId = getMessageId(currentUser, previousUserIndex || 0);
      items.push({ type: "tool-activity", key: `tool-activity:${turnMessageId}`, turnMessageId, runs: turnRuns });
      insertedTurnIds.add(turnMessageId);
    }

    items.push({ type: "message", key: messageId, message, index });
  });

  return items;
}
```

Create `src/components/command-center/chat-turn-activity.tsx`:

```tsx
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";
import { CardSurface as Card, CardContentSurface as CardContent } from "@/components/command-center/chat-panel-surfaces";

export function ChatTurnActivityBlock({ messages, resolvedTheme = "light", runs = [] }) {
  const tools = runs.flatMap((run) => (Array.isArray(run?.tools) ? run.tools : []));
  if (!tools.length) {
    return null;
  }

  return (
    <div className="group/message flex w-fit max-w-full">
      <div className="flex max-w-full flex-col items-start">
        <Card data-bubble-layout="full" className="w-[700px] max-w-[calc(100vw-12rem)] border-border/70 bg-muted/15">
          <CardContent className="px-3 py-3">
            <ToolCallTimeline tools={tools} messages={messages} resolvedTheme={resolvedTheme} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Thread `taskTimeline` into `ChatPanelProps` and `App.tsx`:

```tsx
type ChatPanelProps = {
  // ...
  taskTimeline?: Array<Record<string, unknown>>;
};
```

```tsx
<ChatPanel
  // ...
  taskTimeline={taskTimeline}
/>
```

In `src/components/command-center/chat-panel.tsx`, replace the flat message-only render loop with a render-items loop:

```tsx
const renderItems = useMemo(
  () => buildChatRenderItems(messages, taskTimeline),
  [messages, taskTimeline],
);
```

```tsx
return renderItems.map((item) => {
  if (item.type === "tool-activity") {
    return (
      <ChatTurnActivityBlock
        key={item.key}
        messages={i18n}
        resolvedTheme={resolvedTheme}
        runs={item.runs}
      />
    );
  }

  const message = item.message;
  const index = item.index;
  // existing MessageBubble rendering path, using `message` and `index`
});
```

- [ ] **Step 4: Run the historical chat test and verify it passes**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "renders tool activity before the corresponding assistant reply"
```

Expected: PASS with the new tool block appearing before the assistant reply.

- [ ] **Step 5: Commit**

```bash
git add src/components/command-center/chat-panel-render-items.ts src/components/command-center/chat-turn-activity.tsx src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel.test.jsx src/App.tsx
git commit -m "feat: show historical tool activity in chat"
```

## Task 3: Keep Streaming Assistant Updates From Interleaving Tool Cards

**Files:**
- Modify: `src/components/command-center/chat-panel.tsx`
- Modify: `src/components/command-center/chat-panel.test.jsx`
- Test: `src/components/command-center/chat-panel.test.jsx`

- [ ] **Step 1: Write the failing streaming-stability test**

Add this test to `src/components/command-center/chat-panel.test.jsx`:

```jsx
it("keeps tool activity as a separate block while the assistant reply keeps streaming", () => {
  const { rerender } = render(
    <TooltipProvider>
      <ChatPanel
        busy
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[
          { id: "msg-user-1", role: "user", content: "继续执行", timestamp: 1000 },
          { id: "msg-assistant-1", role: "assistant", content: "第一段", timestamp: 3000, streaming: true },
        ]}
        onPromptChange={() => {}}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt=""
        promptRef={null}
        session={createSession()}
        taskTimeline={[
          {
            id: "run-1",
            timestamp: 2000,
            prompt: "继续执行",
            status: "进行中",
            toolsSummary: "edit_file(执行中)",
            tools: [{ id: "tool-1", name: "edit_file", status: "执行中", input: '{"path":"src/App.tsx"}', output: "", timestamp: 2000 }],
            outcome: "执行仍在进行，等待最终回复。",
          },
        ]}
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
          { id: "msg-user-1", role: "user", content: "继续执行", timestamp: 1000 },
          { id: "msg-assistant-1", role: "assistant", content: "第一段\n第二段", timestamp: 3000, streaming: true },
        ]}
        onPromptChange={() => {}}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt=""
        promptRef={null}
        session={createSession()}
        taskTimeline={[
          {
            id: "run-1",
            timestamp: 2000,
            prompt: "继续执行",
            status: "进行中",
            toolsSummary: "edit_file(完成) · gateway(执行中)",
            tools: [
              { id: "tool-1", name: "edit_file", status: "完成", input: '{"path":"src/App.tsx"}', output: "ok", timestamp: 2000 },
              { id: "tool-2", name: "gateway", status: "执行中", input: '{"action":"latest"}', output: "", timestamp: 2500 },
            ],
            outcome: "执行仍在进行，等待最终回复。",
          },
        ]}
      />
    </TooltipProvider>,
  );

  expect(screen.getAllByRole("button", { name: /收起详情|查看详情/ }).filter((button) => /edit_file|gateway/.test(button.getAttribute("aria-label") || ""))).toHaveLength(2);
  expect(screen.getByText("第一段")).toBeInTheDocument();
  expect(screen.getByText("第二段")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the streaming-stability test and verify it fails**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "keeps tool activity as a separate block while the assistant reply keeps streaming"
```

Expected: FAIL because the initial implementation usually duplicates the tool block or couples it too tightly to the flat message render loop.

- [ ] **Step 3: Write the minimal stable-key rendering logic**

In `src/components/command-center/chat-panel.tsx`, compute render items once and preserve per-turn keys:

```tsx
const renderItems = useMemo(
  () => buildChatRenderItems(messages, taskTimeline),
  [messages, taskTimeline],
);
```

Render the activity block with a stable key derived from the user turn instead of the tool status text:

```tsx
if (item.type === "tool-activity") {
  return (
    <ChatTurnActivityBlock
      key={item.key}
      messages={i18n}
      resolvedTheme={resolvedTheme}
      runs={item.runs}
    />
  );
}
```

Keep `MessageBubble` rendering on the existing message identity:

```tsx
const messageId = getConversationMessageId(message, index);

return (
  <MessageBubble
    key={messageId}
    // existing props
  />
);
```

In `src/components/command-center/chat-panel-render-items.ts`, make the insertion logic idempotent per turn:

```ts
const insertedTurnIds = new Set<string>();

if (firstAssistantInTurn && currentUser) {
  const turnMessageId = getMessageId(currentUser, previousUserIndex || 0);
  if (!insertedTurnIds.has(turnMessageId)) {
    items.push({ type: "tool-activity", key: `tool-activity:${turnMessageId}`, turnMessageId, runs: turnRuns });
    insertedTurnIds.add(turnMessageId);
  }
}
```

- [ ] **Step 4: Run the streaming-stability test and verify it passes**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "keeps tool activity as a separate block while the assistant reply keeps streaming"
```

Expected: PASS with one stable activity block and updated assistant streaming text.

- [ ] **Step 5: Commit**

```bash
git add src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel.test.jsx src/components/command-center/chat-panel-render-items.ts
git commit -m "fix: keep chat tool activity stable during streaming"
```

## Task 4: Cover Pending-Plus-Tools and No-Tools Fallback

**Files:**
- Modify: `src/components/command-center/chat-panel.tsx`
- Modify: `src/components/command-center/chat-panel.test.jsx`
- Modify: `src/components/command-center/chat-panel-render-items.ts`
- Test: `src/components/command-center/chat-panel.test.jsx`

- [ ] **Step 1: Write the failing pending-plus-tools test**

Add this test to `src/components/command-center/chat-panel.test.jsx`:

```jsx
it("shows tool activity and the pending assistant bubble before final prose arrives", () => {
  render(
    <TooltipProvider>
      <ChatPanel
        busy
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[
          { id: "msg-user-1", role: "user", content: "开始处理", timestamp: 1000 },
          { id: "msg-assistant-pending", role: "assistant", content: "正在思考…", timestamp: 3000, pending: true },
        ]}
        onPromptChange={() => {}}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt=""
        promptRef={null}
        session={createSession()}
        taskTimeline={[
          {
            id: "run-1",
            timestamp: 2000,
            prompt: "开始处理",
            status: "进行中",
            toolsSummary: "edit_file(执行中)",
            tools: [{ id: "tool-1", name: "edit_file", status: "执行中", input: '{"path":"src/App.tsx"}', output: "", timestamp: 2000 }],
            outcome: "执行仍在进行，等待最终回复。",
          },
        ]}
      />
    </TooltipProvider>,
  );

  expect(screen.getByRole("button", { name: "edit_file 收起详情" })).toBeInTheDocument();
  expect(screen.getByText("正在思考…")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the pending-plus-tools test and verify it fails**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "shows tool activity and the pending assistant bubble before final prose arrives"
```

Expected: FAIL because the first implementation usually inserts tool activity only before settled assistant bubbles.

- [ ] **Step 3: Write the failing no-tools fallback test**

Add this test to `src/components/command-center/chat-panel.test.jsx`:

```jsx
it("keeps assistant-only turns unchanged when no timeline tools match the turn", () => {
  render(
    <TooltipProvider>
      <ChatPanel
        busy={false}
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[
          { id: "msg-user-1", role: "user", content: "只回复文字", timestamp: 1000 },
          { id: "msg-assistant-1", role: "assistant", content: "这里只有正文。", timestamp: 2000 },
        ]}
        onPromptChange={() => {}}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt=""
        promptRef={null}
        session={createSession()}
        taskTimeline={[]}
      />
    </TooltipProvider>,
  );

  expect(screen.queryByRole("button", { name: /收起详情|查看详情/ })).not.toBeInTheDocument();
  expect(screen.getByText("这里只有正文。")).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the no-tools fallback test and verify it fails only if the new render model regressed plain turns**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "keeps assistant-only turns unchanged when no timeline tools match the turn"
```

Expected: PASS if plain turns are still untouched. If it fails, fix the regression before continuing.

- [ ] **Step 5: Write the minimal edge-case handling**

In `src/components/command-center/chat-panel-render-items.ts`, treat pending assistant bubbles as valid insertion anchors for the turn activity block:

```ts
const firstAssistantInTurn =
  message?.role === "assistant"
  && turnRuns.length
  && !insertedTurnIds.has(getMessageId(currentUser || {}, previousUserIndex || 0));
```

That condition should not exclude `pending` or `streaming` assistant messages.

Keep the safe fallback path intact:

```ts
if (!runs.length || !userIndexes.length) {
  return messages.map((message, index) => ({ type: "message", key: getMessageId(message, index), message, index }));
}
```

In `src/components/command-center/chat-turn-activity.tsx`, keep the wrapper a no-op when no tools are present:

```tsx
const tools = runs.flatMap((run) => (Array.isArray(run?.tools) ? run.tools : []));
if (!tools.length) {
  return null;
}
```

- [ ] **Step 6: Run the edge-case tests and verify they pass**

Run:

```bash
npx vitest run src/components/command-center/chat-panel.test.jsx -t "shows tool activity and the pending assistant bubble before final prose arrives|keeps assistant-only turns unchanged when no timeline tools match the turn"
```

Expected: PASS for both tests.

- [ ] **Step 7: Run focused validation**

Run:

```bash
npx vitest run src/components/command-center/tool-call-timeline.test.jsx
npx vitest run src/components/command-center/chat-panel.test.jsx
npx vitest run src/components/command-center/inspector-panel.test.jsx
```

Expected: PASS for all three commands with no newly introduced failures.

- [ ] **Step 8: Commit**

```bash
git add src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel.test.jsx src/components/command-center/chat-panel-render-items.ts src/components/command-center/chat-turn-activity.tsx
git commit -m "test: cover chat tool activity edge cases"
```

## Spec Coverage Check

- Chat-visible tool cards in history: covered by Task 2.
- Streaming stability without card interleaving: covered by Task 3.
- Pending bubble plus tool activity before prose: covered by Task 4.
- No-tools safe fallback: covered by Task 4.
- Reuse of existing inspector tool-card UI: covered by Task 1.
- Scope kept out of runtime/session protocol changes: enforced by the file list and non-goals.

## Placeholder Scan

The plan intentionally avoids `TBD`, `TODO`, "add appropriate handling", and similar placeholders. Every task includes exact file paths, code snippets, commands, expected failures, expected passes, and commit messages.

## Type Consistency Check

- Shared tool timeline component name stays `ToolCallTimeline` across Task 1 through Task 4.
- Chat wrapper name stays `ChatTurnActivityBlock`.
- Render helper type stays `ChatRenderItem`.
- Prop name stays `taskTimeline`.

These names should not drift during implementation.
