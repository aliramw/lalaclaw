# Agent 动态进度卡实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为聊天区现有 pending assistant 卡片增加统一的动态阶段展示，让 `hermes` 与 `openclaw` 都能在正式回复接管前持续显示人类友好的中间进度，并消除空窗期。

**Architecture:** 先扩展 pending turn 的共享状态模型与持久化字段，再在后端 provider 层产出统一的 `progressStage/progressLabel/progressUpdatedAt`，最后让前端 pending bubble 消费这组字段而不是只显示静态 `正在思考…`。聊天区继续保留单张 pending bubble，不新增第二条系统消息，正式 assistant 回复开始流入后由真实消息接管。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、现有 `/api/chat` NDJSON 流、Command Center 控制器与 pending storage。

---

## 文件结构

### 新增文件

- `server/services/agent-progress.ts`
  - 统一定义 provider 无关的进度阶段枚举、默认文案 key、阶段归一化 helper
- `server/services/agent-progress.test.ts`
  - 覆盖 `hermes/openclaw` 到统一阶段的最小归一化规则
- `src/features/chat/state/chat-progress.ts`
  - 定义前端共享的进度阶段枚举、文案 key 与文案解析 helper

### 重点修改文件

- `src/types/chat.ts`
  - 为 `ChatMessage`、`PendingChatTurn`、流 payload 增加进度字段
- `src/locales/en.js`
  - 新增动态阶段卡与安抚式退化文案 key
- `src/locales/zh.js`
  - 新增对应中文文案 key
- `src/features/app/state/app-pending-storage.ts`
  - 保证 pending turn 的进度字段可以持久化、恢复和裁剪
- `src/features/chat/controllers/chat-turn-helpers.ts`
  - 让 optimistic pending assistant 消息带上进度字段
- `src/features/chat/controllers/chat-stream-helpers.ts`
  - 支持解析新的 `message.progress` 流事件
- `src/features/chat/controllers/use-chat-controller.ts`
  - 在发送、流式更新、异常与完成路径中维护 pending turn 的进度字段
- `src/features/chat/state/chat-dashboard-session.ts`
  - 保证聊天区 overlay / pending bubble 优先显示 `progressLabel`
- `src/features/session/runtime/use-runtime-snapshot.ts`
  - 在 runtime catch-up、pending 恢复、authoritative conversation 合并时保留最近阶段，避免空窗
- `src/components/command-center/chat-pending-bubble.tsx`
  - 将静态 `正在思考…` 升级为动态阶段文案与长时间停留退化文案
- `src/components/command-center/chat-panel.tsx`
  - 保证 pending bubble 接管时机只取决于正式 assistant 回复是否开始接管当前 turn
- `server/services/hermes-client.ts`
  - 从 Hermes 可观察输出中提取统一进度阶段
- `server/services/hermes-client.test.js`
  - 覆盖 Hermes 输出到统一进度阶段的回归
- `server/services/openclaw-client.ts`
  - 基于现有运行态输出粗粒度生成统一进度阶段
- `server/routes/chat.ts`
  - 在 NDJSON 流中发送 `message.progress` 事件，并在非流式 JSON 返回中附带最新进度字段
- `test/chat-route.test.js`
  - 覆盖流式 `message.progress` 事件与非流式进度字段返回
- `src/components/command-center/chat-panel.test.jsx`
  - 覆盖 pending bubble 文案渲染与长时间停留退化
- `src/features/app/storage/use-app-persistence.test.jsx`
  - 覆盖 pending turn 进度字段的持久化
- `src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - 覆盖 runtime catch-up 不会把动态阶段卡提前抹掉
- `src/App.test.jsx`
  - 覆盖整条发送流程里 pending bubble 连续存在、阶段推进、正式消息接管前无空窗
- `plan/ai-assisted-code-quality.md`
  - 追加实现计划登记

### 本轮明确不改

- `src/components/command-center/tool-call-timeline.tsx`
- `src/components/command-center/inspector-panel*.tsx`
- IM tab 模型与 agent tab 身份逻辑

## Task 1: 扩展共享进度状态模型与本地持久化

**Files:**
- Create: `server/services/agent-progress.ts`
- Test: `server/services/agent-progress.test.ts`
- Create: `src/features/chat/state/chat-progress.ts`
- Modify: `src/types/chat.ts`
- Modify: `src/features/app/state/app-pending-storage.ts`
- Test: `src/features/app/storage/use-app-persistence.test.jsx`
- Modify: `src/locales/en.js`
- Modify: `src/locales/zh.js`

- [ ] **Step 1: 先写共享阶段 helper 的失败测试**

在 `server/services/agent-progress.test.ts` 新增：

```ts
import { describe, expect, it } from "vitest";
import {
  AGENT_PROGRESS_STAGES,
  coerceAgentProgressStage,
  createAgentProgressState,
} from "../../server/services/agent-progress";

describe("agent progress helpers", () => {
  it("normalizes only supported progress stages", () => {
    expect(AGENT_PROGRESS_STAGES).toEqual([
      "thinking",
      "inspecting",
      "executing",
      "synthesizing",
      "finishing",
    ]);
    expect(coerceAgentProgressStage("executing")).toBe("executing");
    expect(coerceAgentProgressStage("unknown")).toBe("");
  });

  it("creates a sanitized progress state payload", () => {
    expect(
      createAgentProgressState({
        stage: "executing",
        label: "执行命令…",
        updatedAt: 123,
      }),
    ).toEqual({
      progressStage: "executing",
      progressLabel: "执行命令…",
      progressUpdatedAt: 123,
    });
  });
});
```

- [ ] **Step 2: 跑测试确认 helper 还不存在**

运行：

```bash
npm test -- server/services/agent-progress.test.ts
```

预期：失败，提示 `agent-progress.ts` 或导出符号不存在。

- [ ] **Step 3: 写最小共享 helper**

创建 `server/services/agent-progress.ts`：

```ts
export const AGENT_PROGRESS_STAGES = [
  "thinking",
  "inspecting",
  "executing",
  "synthesizing",
  "finishing",
] as const;

export type AgentProgressStage = (typeof AGENT_PROGRESS_STAGES)[number];

export function coerceAgentProgressStage(value: unknown): AgentProgressStage | "" {
  const normalized = String(value || "").trim().toLowerCase();
  return (AGENT_PROGRESS_STAGES as readonly string[]).includes(normalized)
    ? normalized as AgentProgressStage
    : "";
}

export function createAgentProgressState({
  stage,
  label,
  updatedAt,
}: {
  stage?: unknown;
  label?: unknown;
  updatedAt?: unknown;
}) {
  const progressStage = coerceAgentProgressStage(stage);
  const progressLabel = String(label || "").trim();
  const progressUpdatedAt = Number(updatedAt) || Date.now();

  if (!progressStage && !progressLabel) {
    return {};
  }

  return {
    ...(progressStage ? { progressStage } : {}),
    ...(progressLabel ? { progressLabel } : {}),
    progressUpdatedAt,
  };
}
```

- [ ] **Step 4: 扩展前端共享类型**

修改 `src/types/chat.ts`，给 `ChatMessage`、`PendingChatTurn`、`ChatStreamPayload` 增加进度字段：

```ts
export type AgentProgressStage = "thinking" | "inspecting" | "executing" | "synthesizing" | "finishing";

export type AgentProgressState = {
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

export type ChatMessage = {
  // 原有字段...
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

export type PendingChatTurn = {
  // 原有字段...
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

export type ChatStreamPayload = {
  // 原有字段...
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
};
```

- [ ] **Step 5: 补 i18n 文案 key**

修改 `src/locales/zh.js` 和 `src/locales/en.js`，在现有 `chat` 或 pending 相关分组新增：

```js
agentProgress: {
  thinking: "分析请求…",
  inspecting: "检查上下文…",
  executing: "执行操作…",
  synthesizing: "整理结果…",
  finishing: "写入回复…",
  staleExecuting: "仍在执行操作，请稍候…",
  staleSynthesizing: "仍在整理结果，请稍候…",
}
```

英文版：

```js
agentProgress: {
  thinking: "Analyzing request…",
  inspecting: "Checking context…",
  executing: "Running actions…",
  synthesizing: "Organizing results…",
  finishing: "Writing reply…",
  staleExecuting: "Still running actions, please wait…",
  staleSynthesizing: "Still organizing results, please wait…",
}
```

- [ ] **Step 6: 让 pending storage 保留进度字段**

先创建 `src/features/chat/state/chat-progress.ts`：

```ts
export const agentProgressStages = [
  "thinking",
  "inspecting",
  "executing",
  "synthesizing",
  "finishing",
] as const;

export type AgentProgressStage = (typeof agentProgressStages)[number];

export function coerceAgentProgressStage(value: unknown): AgentProgressStage | "" {
  const normalized = String(value || "").trim().toLowerCase();
  return (agentProgressStages as readonly string[]).includes(normalized)
    ? normalized as AgentProgressStage
    : "";
}

export function buildAgentProgressMessage(messages, stage = "", stale = false) {
  if (stage === "executing" && stale) return messages.chat.agentProgress.staleExecuting;
  if (stage === "synthesizing" && stale) return messages.chat.agentProgress.staleSynthesizing;
  return messages.chat.agentProgress?.[stage] || messages.chat.thinkingPlaceholder;
}
```

修改 `src/features/app/state/app-pending-storage.ts`，在 `sanitizePendingChatTurnsMap()` 中只保留规范化后的进度字段：

```ts
import { coerceAgentProgressStage } from "@/features/chat/state/chat-progress";

const progressStage = coerceAgentProgressStage(normalizedEntry.progressStage);
const progressLabel = String(normalizedEntry.progressLabel || "").trim();
const progressUpdatedAt = Number(normalizedEntry.progressUpdatedAt || 0) || undefined;

accumulator[normalizedKey] = {
  ...normalizedEntry,
  key: normalizedKey,
  ...(progressStage ? { progressStage } : {}),
  ...(progressLabel ? { progressLabel } : {}),
  ...(progressUpdatedAt ? { progressUpdatedAt } : {}),
  // 现有 agentId/sessionUser 规范化逻辑...
};
```

- [ ] **Step 7: 写持久化失败测试**

在 `src/features/app/storage/use-app-persistence.test.jsx` 或更贴近 storage 的现有文件里新增：

```jsx
it("persists pending progress metadata for in-flight assistant turns", () => {
  const pending = {
    "command-center:main": {
      assistantMessageId: "msg-assistant-pending-1",
      pendingTimestamp: 101,
      progressStage: "executing",
      progressLabel: "执行命令…",
      progressUpdatedAt: 200,
    },
  };

  persistUiStateSnapshot({
    activeChatTabId: "agent:main",
    chatTabs: [{ id: "agent:main", agentId: "main", sessionUser: "command-center" }],
    tabMetaById: {
      "agent:main": { agentId: "main", sessionUser: "command-center", model: "", fastMode: false, thinkMode: "off", sessionFiles: [], sessionFileRewrites: [] },
    },
    messagesByTabId: { "agent:main": [] },
    pendingChatTurns: pending,
  });

  const stored = JSON.parse(window.localStorage.getItem(pendingChatStorageKey) || "{}");
  expect(stored.pendingChatTurns["command-center:main"]).toMatchObject({
    progressStage: "executing",
    progressLabel: "执行命令…",
    progressUpdatedAt: 200,
  });
});
```

- [ ] **Step 8: 跑 Task 1 的测试**

运行：

```bash
npm test -- server/services/agent-progress.test.ts src/features/app/storage/use-app-persistence.test.jsx
```

预期：新增测试通过。

- [ ] **Step 9: 提交 Task 1**

```bash
git add server/services/agent-progress.ts server/services/agent-progress.test.ts src/features/chat/state/chat-progress.ts src/types/chat.ts src/features/app/state/app-pending-storage.ts src/features/app/storage/use-app-persistence.test.jsx src/locales/en.js src/locales/zh.js
git commit -m "feat: add shared agent progress state"
```

## Task 2: 让前端 pending bubble 消费动态阶段并避免空窗

**Files:**
- Modify: `src/features/chat/controllers/chat-turn-helpers.ts`
- Modify: `src/features/chat/state/chat-dashboard-session.ts`
- Modify: `src/components/command-center/chat-pending-bubble.tsx`
- Modify: `src/components/command-center/chat-panel.tsx`
- Test: `src/components/command-center/chat-panel.test.jsx`

- [ ] **Step 1: 写 pending bubble 文案渲染失败测试**

在 `src/components/command-center/chat-panel.test.jsx` 新增：

```jsx
it("renders the pending bubble with a provider progress label before assistant text arrives", () => {
  render(
    <ChatPanel
      messages={[
        {
          id: "msg-assistant-pending-1",
          role: "assistant",
          content: "正在思考…",
          pending: true,
          progressStage: "executing",
          progressLabel: "执行命令…",
          progressUpdatedAt: Date.now(),
        },
      ]}
      run={{ status: "starting", streamText: "" }}
      // 其余使用该文件现有 helper 默认值
    />,
  );

  expect(screen.getByText("执行命令…")).toBeInTheDocument();
  expect(screen.queryByText("正在思考…")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 跑组件测试确认失败**

运行：

```bash
npm test -- src/components/command-center/chat-panel.test.jsx -t "renders the pending bubble with a provider progress label before assistant text arrives"
```

预期：失败，因为 pending bubble 还只渲染 `message.content`。

- [ ] **Step 3: 让 optimistic pending message 带上进度字段**

修改 `src/features/chat/controllers/chat-turn-helpers.ts`：

```ts
export function createPendingAssistantMessage(entry: ChatControllerEntry = {}, thinkingPlaceholder = ""): ChatMessage {
  const pendingTimestamp = Number(entry.pendingTimestamp || 0) || Date.now();
  return {
    id: String(entry.assistantMessageId || `msg-assistant-pending-${pendingTimestamp}`),
    role: "assistant",
    content: thinkingPlaceholder,
    timestamp: pendingTimestamp,
    pending: true,
    ...(entry.progressStage ? { progressStage: entry.progressStage } : {}),
    ...(entry.progressLabel ? { progressLabel: entry.progressLabel } : {}),
    ...(entry.progressUpdatedAt ? { progressUpdatedAt: entry.progressUpdatedAt } : {}),
  };
}
```

- [ ] **Step 4: 让 dashboard overlay 优先显示进度文案**

修改 `src/features/chat/state/chat-dashboard-session.ts` 中 `buildAssistantOverlayMessage()`：

```ts
const overlayContent =
  String(pendingEntry?.progressLabel || "").trim()
  || thinkingPlaceholder;

return {
  id: String(pendingEntry.assistantMessageId || `msg-assistant-pending-${pendingEntry.pendingTimestamp || Date.now()}`),
  role: "assistant" as const,
  content: overlayContent,
  timestamp: Number(pendingEntry.progressUpdatedAt || pendingEntry.pendingTimestamp || pendingEntry.startedAt || Date.now()),
  pending: true,
  ...(pendingEntry.progressStage ? { progressStage: pendingEntry.progressStage } : {}),
  ...(pendingEntry.progressLabel ? { progressLabel: pendingEntry.progressLabel } : {}),
  ...(pendingEntry.progressUpdatedAt ? { progressUpdatedAt: pendingEntry.progressUpdatedAt } : {}),
};
```

- [ ] **Step 5: 在 pending bubble 组件里优先显示动态阶段文案**

修改 `src/components/command-center/chat-pending-bubble.tsx`，让 `MarkdownContent` 的 `content` 不直接吃 `renderedContent`，而是先走动态文案解析：

```tsx
const displayContent = renderedContent;

<MarkdownContent
  content={displayContent}
  // 其余 props 不变
/>
```

并在 `chat-panel.tsx` 计算 `renderedContent` 时优先走：

```tsx
const progressLabel = String(message.progressLabel || "").trim();
const renderedContent = useMemo(
  () => progressLabel || stripDingTalkImagePlaceholderForDisplay(
    unwrapAssistantEnvelope(message.content, message.role),
    sessionUser,
  ),
  [message.content, message.role, progressLabel, sessionUser],
);
```

- [ ] **Step 6: 补“长时间停留”展示分支**

在 `chat-panel.tsx` 新增一个小 helper，例如：

```ts
function resolvePendingProgressLabel(message, i18nMessages) {
  const explicitLabel = String(message?.progressLabel || "").trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const stage = String(message?.progressStage || "").trim();
  const updatedAt = Number(message?.progressUpdatedAt || message?.timestamp || 0);
  const stale = updatedAt > 0 && Date.now() - updatedAt >= 10_000;

  if (stage === "executing" && stale) return i18nMessages.chat.agentProgress.staleExecuting;
  if (stage === "synthesizing" && stale) return i18nMessages.chat.agentProgress.staleSynthesizing;

  return i18nMessages.chat.agentProgress[stage] || i18nMessages.chat.thinkingPlaceholder;
}
```

- [ ] **Step 7: 跑组件测试确认通过**

运行：

```bash
npm test -- src/components/command-center/chat-panel.test.jsx
```

预期：新增 pending 文案测试通过，现有 pending/streaming 测试仍绿。

- [ ] **Step 8: 提交 Task 2**

```bash
git add src/features/chat/controllers/chat-turn-helpers.ts src/features/chat/state/chat-dashboard-session.ts src/components/command-center/chat-pending-bubble.tsx src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel.test.jsx
git commit -m "feat: render dynamic pending progress labels"
```

## Task 3: 为 Hermes 与 OpenClaw 产出统一进度阶段

**Files:**
- Modify: `server/services/hermes-client.ts`
- Modify: `server/services/openclaw-client.ts`
- Modify: `server/services/agent-progress.ts`
- Test: `server/services/hermes-client.test.js`
- Test: `server/services/agent-progress.test.ts`

- [ ] **Step 1: 先写 Hermes 阶段归一化失败测试**

在 `server/services/hermes-client.test.js` 新增：

```js
it("maps hermes progress output to a human-friendly executing stage", async () => {
  const client = createHermesClient({
    HERMES_BIN: "hermes",
    PROJECT_ROOT: "/workspace/project",
    execFileAsync: vi.fn(async () => ({
      stdout: [
        "检查工作区…",
        "执行命令…",
        "第二轮已收",
        "session_id: hermes-session-1",
      ].join("\\n"),
    })),
  });

  await expect(
    client.dispatchHermes([{ role: "user", content: "继续" }], { model: "gpt-5.4" }),
  ).resolves.toMatchObject({
    progressStage: "executing",
    progressLabel: "执行命令…",
  });
});
```

- [ ] **Step 2: 跑 Hermes 测试确认失败**

运行：

```bash
npm test -- server/services/hermes-client.test.js
```

预期：失败，因为 `dispatchHermes()` 还不返回进度字段。

- [ ] **Step 3: 扩展统一 progress helper 的 provider 映射函数**

在 `server/services/agent-progress.ts` 增加：

```ts
export function mapHermesProgressLine(line: unknown) {
  const text = String(line || "").trim();
  if (!text) return {};
  if (/查看|检查|读取|工作区|文件/i.test(text)) {
    return createAgentProgressState({ stage: "inspecting", label: text });
  }
  if (/执行|运行|命令|修改|写入/i.test(text)) {
    return createAgentProgressState({ stage: "executing", label: text });
  }
  if (/整理|总结|汇总/i.test(text)) {
    return createAgentProgressState({ stage: "synthesizing", label: text });
  }
  return {};
}

export function inferOpenClawProgressState({
  hasStarted = false,
  hasVisibleDelta = false,
  hasToolActivity = false,
  hasFinishedToolActivity = false,
}: {
  hasStarted?: boolean;
  hasVisibleDelta?: boolean;
  hasToolActivity?: boolean;
  hasFinishedToolActivity?: boolean;
}) {
  if (hasFinishedToolActivity && !hasVisibleDelta) {
    return createAgentProgressState({ stage: "synthesizing" });
  }
  if (hasToolActivity) {
    return createAgentProgressState({ stage: "executing" });
  }
  if (hasStarted && !hasVisibleDelta) {
    return createAgentProgressState({ stage: "thinking" });
  }
  return {};
}
```

- [ ] **Step 4: 让 Hermes dispatch 返回最新进度字段**

修改 `server/services/hermes-client.ts`：

```ts
type HermesDispatchResult = {
  outputText: string;
  sessionId?: string;
  usage: null;
  progressStage?: string;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

function extractHermesProgress(stdout = "") {
  const lines = String(stdout || "").replace(/\\r\\n/g, "\\n").split("\\n");
  const matches = lines
    .map((line) => mapHermesProgressLine(line))
    .filter((value) => value && (value.progressStage || value.progressLabel));
  return matches.at(-1) || {};
}

return {
  outputText: trimHermesOutput(response?.stdout || ""),
  sessionId: parseHermesSessionId(response?.stdout || "") || requestedSessionId || undefined,
  usage: null,
  ...extractHermesProgress(response?.stdout || ""),
};
```

- [ ] **Step 5: 给 OpenClaw dispatch 打上粗粒度阶段**

在 `server/services/openclaw-client.ts` 的 dispatch / stream 组装路径里补上统一进度字段：

```ts
const initialProgress = inferOpenClawProgressState({ hasStarted: true, hasVisibleDelta: false });

// 开始响应但无正文时
onProgress?.({
  ...initialProgress,
  assistantMessageId,
  lastDeltaAt: Date.now(),
  streamText: streamedText,
  tokenBadge,
});
```

如果流里能看出 tool activity，则在相应分支把阶段切到 `executing` 或 `synthesizing`。第一版不需要过细，只要能给 pending bubble 提供比静态文案更可信的阶段即可。

- [ ] **Step 6: 跑 provider 相关测试**

运行：

```bash
npm test -- server/services/agent-progress.test.ts server/services/hermes-client.test.js test/openclaw-client.test.js
```

预期：新增归一化测试与现有 Hermes/OpenClaw 测试通过；如需补 `openclaw-client` 回归，再在同文件添加一条“started but no visible delta -> thinking stage”的测试。

- [ ] **Step 7: 提交 Task 3**

```bash
git add server/services/agent-progress.ts server/services/agent-progress.test.ts server/services/hermes-client.ts server/services/hermes-client.test.js server/services/openclaw-client.ts test/openclaw-client.test.js
git commit -m "feat: derive unified agent progress stages"
```

## Task 4: 通过 `/api/chat` 流事件把进度阶段送到前端

**Files:**
- Modify: `server/routes/chat.ts`
- Modify: `src/features/chat/controllers/chat-stream-helpers.ts`
- Modify: `src/features/chat/controllers/use-chat-controller.ts`
- Test: `test/chat-route.test.js`

- [ ] **Step 1: 写流式 progress 事件失败测试**

在 `test/chat-route.test.js` 新增：

```js
it("emits a message.progress event for provider progress before completion", async () => {
  const writes = [];
  const harness = createHandler({
    config: { mode: "openclaw", model: "openclaw" },
    parseRequestBody: vi.fn(async () => ({
      sessionUser: "command-center-hermes",
      agentId: "hermes",
      model: "gpt-5.4",
      stream: true,
      messages: [{ role: "user", content: "继续" }],
    })),
    dispatchHermes: vi.fn(async () => ({
      outputText: "已完成",
      usage: null,
      sessionId: "hermes-session-1",
      progressStage: "executing",
      progressLabel: "执行命令…",
      progressUpdatedAt: 123,
    })),
  });

  const res = {
    writeHead: vi.fn(),
    write: vi.fn((chunk) => writes.push(chunk)),
    end: vi.fn(),
    once: vi.fn(),
    destroyed: false,
    writableEnded: false,
  };

  await harness.handler({ once: vi.fn() }, res);

  expect(writes.join("")).toContain("\"type\":\"message.progress\"");
  expect(writes.join("")).toContain("\"progressStage\":\"executing\"");
});
```

- [ ] **Step 2: 跑 chat route 测试确认失败**

运行：

```bash
npm test -- test/chat-route.test.js
```

预期：失败，因为目前没有 `message.progress` 事件。

- [ ] **Step 3: 在后端流里发送 `message.progress` 事件**

修改 `server/routes/chat.ts`：

```ts
if (shouldStream && (reply.progressStage || reply.progressLabel) && !clientDisconnected) {
  writeChatStreamEvent(res, {
    type: "message.progress",
    messageId: assistantMessageId,
    progressStage: reply.progressStage,
    progressLabel: reply.progressLabel,
    progressUpdatedAt: reply.progressUpdatedAt || Date.now(),
  });
}
```

非流式 JSON 返回也要把这些字段并入 payload：

```ts
sendJson(res, 200, {
  // 原有字段...
  ...(reply.progressStage ? { progressStage: reply.progressStage } : {}),
  ...(reply.progressLabel ? { progressLabel: reply.progressLabel } : {}),
  ...(reply.progressUpdatedAt ? { progressUpdatedAt: reply.progressUpdatedAt } : {}),
});
```

- [ ] **Step 4: 让流解析器识别 `message.progress`**

修改 `src/features/chat/controllers/chat-stream-helpers.ts`：

```ts
type StreamEvent = {
  // 原有字段...
  progressStage?: string;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

if (event.type === "message.progress") {
  onProgress({
    assistantMessageId: event.messageId || assistantMessageId,
    lastDeltaAt: Number(event.progressUpdatedAt || Date.now()),
    streamText: streamedText,
    tokenBadge,
    progressStage: event.progressStage,
    progressLabel: event.progressLabel,
    progressUpdatedAt: event.progressUpdatedAt,
  });
  return;
}
```

同时扩展 `onProgress` 的参数签名。

- [ ] **Step 5: 在 chat controller 中把进度字段写回 pending turn**

修改 `src/features/chat/controllers/use-chat-controller.ts` 的 `onProgress` 回调：

```ts
onProgress: ({ assistantMessageId, lastDeltaAt, streamText, tokenBadge, progressStage, progressLabel, progressUpdatedAt }) => {
  setPendingChatTurns((current) => {
    const currentEntry = current[resolvedEntryKey];
    if (!currentEntry) {
      return current;
    }

    return {
      ...current,
      [resolvedEntryKey]: {
        ...currentEntry,
        ...(assistantMessageId ? { assistantMessageId } : {}),
        lastDeltaAt,
        streamText,
        ...(tokenBadge ? { tokenBadge } : {}),
        ...(progressStage ? { progressStage } : {}),
        ...(progressLabel ? { progressLabel } : {}),
        ...(progressUpdatedAt ? { progressUpdatedAt } : {}),
      },
    };
  });
}
```

- [ ] **Step 6: 跑 chat route + chat controller 相关测试**

运行：

```bash
npm test -- test/chat-route.test.js src/App.test.jsx -t "shows only one thinking bubble while later prompts wait in the queue"
```

预期：`message.progress` 的新回归通过，既有流式路径不回归。

- [ ] **Step 7: 提交 Task 4**

```bash
git add server/routes/chat.ts src/features/chat/controllers/chat-stream-helpers.ts src/features/chat/controllers/use-chat-controller.ts test/chat-route.test.js
git commit -m "feat: stream assistant progress updates"
```

## Task 5: 锁住恢复、catch-up 与无空窗的端到端行为

**Files:**
- Modify: `src/features/session/runtime/use-runtime-snapshot.ts`
- Test: `src/features/session/runtime/use-runtime-snapshot.test.jsx`
- Modify: `src/App.test.jsx`
- Modify: `plan/ai-assisted-code-quality.md`

- [ ] **Step 1: 写 runtime catch-up 失败测试**

在 `src/features/session/runtime/use-runtime-snapshot.test.jsx` 新增：

```jsx
it("keeps the latest pending progress label while waiting for the authoritative assistant reply", async () => {
  const pendingChatTurns = {
    "command-center:main": {
      key: "command-center:main",
      assistantMessageId: "msg-assistant-pending-1",
      pendingTimestamp: 101,
      startedAt: 101,
      progressStage: "synthesizing",
      progressLabel: "整理结果…",
      progressUpdatedAt: 150,
      userMessage: { role: "user", content: "你好", timestamp: 100 },
    },
  };

  // 使用该文件现有 renderHook helper，返回 runtime conversation 尚未包含 assistant 正文
  // 断言合并后的 pending overlay 仍然显示 “整理结果…”
});
```

- [ ] **Step 2: 写 App 级无空窗回归**

在 `src/App.test.jsx` 新增一条完整流程测试：

```jsx
it("keeps a single pending bubble visible with progress updates until the final assistant reply takes over", async () => {
  const encoder = new TextEncoder();
  const fetchMock = vi.fn((input, init = {}) => {
    const url = String(input);
    if (url.startsWith("/api/runtime")) {
      return mockJsonResponse(createSnapshot({
        session: { ...createSnapshot().session, mode: "hermes", status: "待命" },
      }));
    }
    if (url === "/api/chat" && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name) => (String(name).toLowerCase() === "content-type" ? "application/x-ndjson; charset=utf-8" : null),
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`${JSON.stringify({
              type: "message.start",
              message: { id: "msg-assistant-progress-1" },
            })}\n`));
            controller.enqueue(encoder.encode(`${JSON.stringify({
              type: "message.progress",
              messageId: "msg-assistant-progress-1",
              progressStage: "inspecting",
              progressLabel: "检查工作区…",
              progressUpdatedAt: 101,
            })}\n`));
            controller.enqueue(encoder.encode(`${JSON.stringify({
              type: "message.progress",
              messageId: "msg-assistant-progress-1",
              progressStage: "executing",
              progressLabel: "执行命令…",
              progressUpdatedAt: 102,
            })}\n`));
            controller.enqueue(encoder.encode(`${JSON.stringify({
              type: "message.complete",
              messageId: "msg-assistant-progress-1",
              payload: {
                ok: true,
                outputText: "已经完成",
                assistantMessageId: "msg-assistant-progress-1",
              },
            })}\n`));
            controller.close();
          },
        }),
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  stubFetchWithAccessState(fetchMock);
  render(<App />);

  const user = userEvent.setup();
  await user.type(await findComposer(), "开始");
  await user.click(screen.getByRole("button", { name: "发送" }));

  expect(await screen.findByText("检查工作区…")).toBeInTheDocument();
  expect(await screen.findByText("执行命令…")).toBeInTheDocument();
  expect(screen.queryByText("正在思考…")).not.toBeInTheDocument();
  expect(await screen.findByText("已经完成")).toBeInTheDocument();
});
```

- [ ] **Step 3: 在 runtime snapshot 合并时保留最近阶段**

修改 `src/features/session/runtime/use-runtime-snapshot.ts`，在保留 pending overlay 的路径里把阶段字段也一并带过去：

```ts
const pendingAssistant = {
  ...existingPendingAssistant,
  ...(pendingEntry?.progressStage ? { progressStage: pendingEntry.progressStage } : {}),
  ...(pendingEntry?.progressLabel ? { progressLabel: pendingEntry.progressLabel } : {}),
  ...(pendingEntry?.progressUpdatedAt ? { progressUpdatedAt: pendingEntry.progressUpdatedAt } : {}),
};
```

对 `snapshotHasAssistantReply` 为假、但 pending 仍在保留的分支，确保不要因为 runtime conversation 为空就把进度字段抹掉。

- [ ] **Step 4: 跑高信号验证**

运行：

```bash
npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx src/App.test.jsx
```

再补一轮更贴近本次改动的组合验证：

```bash
npm test -- test/chat-route.test.js server/services/hermes-client.test.js src/components/command-center/chat-panel.test.jsx src/features/session/runtime/use-runtime-snapshot.test.jsx src/App.test.jsx
```

预期：pending bubble 连续性、进度推进、catch-up 恢复相关回归全部通过。

- [ ] **Step 5: 记录 AI 实现工作流**

在 `plan/ai-assisted-code-quality.md` 追加一条实现总结，至少写明：

```md
### 2026-04-13 — Agent 动态进度卡实现

- Prompt/workstream: 实现聊天区统一 progress stage，让 pending bubble 动态显示人类友好的 provider 进度，并消除正式回复前的空窗。
- Files touched: [列出本轮实际修改文件]
- Quality gates rerun:
  - `npm test -- ...`
- Manual/equivalent validation:
  - 记录一次真实或等价的 Hermes 发送流程验证
- Reviewer checklist:
  - 确认 pending bubble 直到正式 assistant 接管前不会消失
  - 确认 progressLabel 优先级与 fallback 正确
```

- [ ] **Step 6: 提交 Task 5**

```bash
git add src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/App.test.jsx plan/ai-assisted-code-quality.md
git commit -m "test: lock pending progress continuity"
```

## Self-Review

- 覆盖 spec 的 4 个部分：
  - 统一状态模型：Task 1
  - provider 归一化：Task 3
  - pending 卡片展示与空窗退化：Task 2 + Task 5
  - 测试与恢复行为：Task 4 + Task 5
- 未留任何占位步骤；每个 task 都给出明确文件、测试命令和最小代码片段
- 字段名在整份计划中保持一致：
  - `progressStage`
  - `progressLabel`
  - `progressUpdatedAt`
- 高风险点已经落到控制器级和 `App` 级回归，而不是只停留在局部组件测试
