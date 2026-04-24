import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDashboardService, mergeConversationMessages } from "../server/services/dashboard.ts";
const { version: lalaclawVersion } = require("../package.json");

function createService(overrides = {}) {
  return createDashboardService({
    HOST: "127.0.0.1",
    PORT: 3000,
    PROJECT_ROOT: "/workspace/project",
    callOpenClawGateway: vi.fn(async () => ({ agents: { list: [] } })),
    clip: (value, length = 999) => String(value || "").slice(0, length),
    collectAvailableAgents: vi.fn((_, preferred = []) => preferred),
    collectAvailableSkills: vi.fn(() => []),
    collectAllowedSubagents: vi.fn(() => []),
    collectAvailableModels: vi.fn((_, preferred = []) => preferred),
    collectArtifacts: vi.fn(() => [{ title: "artifact" }]),
    collectConversationMessages: vi.fn(() => []),
    collectFiles: vi.fn(() => [{ path: "src/App.jsx" }]),
    collectLatestRunUsage: vi.fn(() => null),
    collectSnapshots: vi.fn(() => [{ id: "snapshot-1" }]),
    collectTaskRelationships: vi.fn(() => []),
    collectTaskTimeline: vi.fn(() => [{ id: "run-1" }]),
    collectToolHistory: vi.fn(() => [{ name: "tool" }]),
    config: {
      mode: "mock",
      model: "gpt-5",
      baseUrl: "http://127.0.0.1:18789",
      workspaceRoot: "/workspace/openclaw",
      logsDir: "/workspace/logs",
      localConfig: null,
    },
    extractTextSegments: vi.fn((content) => content?.map((item) => item.text || "") || []),
    fetchBrowserPeek: vi.fn(async () => ({ summary: "browser", items: [{ label: "state", value: "ok" }] })),
    formatTokenBadge: vi.fn((usage) => (usage ? "↑5 ↓7" : "")),
    formatTimestamp: vi.fn((value) => `ts-${value}`),
    getCommandCenterSessionKey: vi.fn((agentId, sessionUser) => `agent:${agentId}:${sessionUser}`),
    getDefaultModelForAgent: vi.fn(() => "gpt-5"),
    getHermesModelContextWindow: vi.fn(async () => 1050000),
    getHermesSessionStats: vi.fn(async () => null),
    getHermesStatus: vi.fn(async () => ({
      installPath: "/Users/marila/.hermes/hermes-agent",
      model: "gpt-5.4",
      provider: "OpenAI Codex",
    })),
    getLocalSessionFileEntries: vi.fn(() => []),
    getLocalSessionConversation: vi.fn(() => []),
    getSessionPreferences: vi.fn(() => ({})),
    getTranscriptPath: vi.fn(() => "/workspace/openclaw/session.jsonl"),
    invokeOpenClawTool: vi.fn(async () => ({ details: { statusText: "status-text" } })),
    listDirectoryPreview: vi.fn((root) =>
      root === "/workspace/project"
        ? [{ name: "src", kind: "dir" }]
        : [{ name: "agent.log", kind: "file" }],
    ),
    countWorkspaceFiles: vi.fn((root) => (root === "/workspace/agents/main" ? 12 : 5)),
    listWorkspaceFiles: vi.fn((root) =>
      root === "/workspace/agents/main"
        ? [{ path: "/workspace/agents/main/src/App.jsx", fullPath: "/workspace/agents/main/src/App.jsx", kind: "文件" }]
        : [{ path: `${root}/agent.log`, fullPath: `${root}/agent.log`, kind: "文件" }],
    ),
    normalizeSessionUser: vi.fn((value) => String(value || "")),
    parseSessionStatusText: vi.fn(() => null),
    readJsonLines: vi.fn(() => []),
    readTextIfExists: vi.fn(() => "line-1\nline-2\nline-3"),
    resolveAgentDisplayName: vi.fn((agentId) => `Agent ${agentId}`),
    resolveModeForAgent: vi.fn((agentId) => (agentId === "hermes" ? "hermes" : "openclaw")),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveSessionFastMode: vi.fn(() => false),
    resolveSessionModel: vi.fn(() => "gpt-5"),
    resolveSessionRecord: vi.fn(() => null),
    resolveSessionThinkMode: vi.fn(() => "off"),
    buildAgentGraph: vi.fn(() => [{ id: "main" }]),
    tailLines: vi.fn((text) => String(text || "").split("\n").slice(-5)),
    ...overrides,
  });
}

describe("createDashboardService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds a mock snapshot with local conversation and peeks", async () => {
    const localConversation = [{ role: "assistant", content: "hello", timestamp: 1 }];
    const service = createService({
      getLocalSessionConversation: vi.fn(() => localConversation),
      resolveSessionFastMode: vi.fn(() => true),
      resolveSessionThinkMode: vi.fn(() => "minimal"),
      collectAvailableModels: vi.fn(() => ["gpt-5"]),
      collectAvailableAgents: vi.fn(() => ["main"]),
      collectAvailableSkills: vi.fn(() => [{ name: "planning", ownerAgentId: "main" }]),
    });

    const snapshot = await service.buildDashboardSnapshot("demo-user");

    expect(snapshot.session).toMatchObject({
      mode: "mock",
      model: "gpt-5",
      agentId: "main",
      agentLabel: "Agent main",
      sessionUser: "demo-user",
      sessionKey: "agent:main:demo-user",
      workspaceRoot: "/workspace/openclaw",
      fastMode: "开启",
      thinkMode: "minimal",
      availableSkills: [{ name: "planning", ownerAgentId: "main" }],
    });
    expect(snapshot.conversation).toEqual(localConversation);
    expect(snapshot.peeks.workspace.items[2].value).toContain("目录 src");
    expect(snapshot.peeks.workspace.entries).toEqual([
      { path: "/workspace/openclaw/agent.log", fullPath: "/workspace/openclaw/agent.log", kind: "文件" },
    ]);
    expect(snapshot.peeks.workspace.totalCount).toBe(5);
    expect(snapshot.peeks.terminal.items[2].value).toContain("line-1");
  });

  it("builds a hermes snapshot without routing through openclaw state", async () => {
    const localConversation = [{ role: "assistant", content: "hermes says hi", timestamp: 1 }];
    const service = createService({
      config: {
        mode: "openclaw",
        model: "openclaw",
        baseUrl: "http://127.0.0.1:18789",
        workspaceRoot: "/workspace/openclaw",
        logsDir: "/workspace/logs",
        localConfig: null,
      },
      getDefaultModelForAgent: vi.fn((agentId) => (agentId === "hermes" ? "gpt-5.4" : "gpt-5")),
      getLocalSessionConversation: vi.fn(() => localConversation),
      getSessionPreferences: vi.fn(() => ({ hermesSessionId: "hermes-session-1" })),
      getHermesSessionStats: vi.fn(async () => ({
        sessionId: "hermes-session-1",
        inputTokens: 41600,
        outputTokens: 120,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      })),
      getHermesModelContextWindow: vi.fn(async () => 1050000),
      collectAvailableAgents: vi.fn(() => ["main", "hermes"]),
      collectAvailableModels: vi.fn(() => ["gpt-5.4"]),
      resolveSessionAgentId: vi.fn(() => "main"),
    });

    const snapshot = await service.buildDashboardSnapshot("command-center-hermes", { agentId: "hermes" });

    expect(snapshot.session).toMatchObject({
      mode: "hermes",
      model: "gpt-5.4",
      selectedModel: "gpt-5.4",
      agentId: "hermes",
      agentLabel: "Agent hermes",
      sessionUser: "command-center-hermes",
      availableAgents: ["main", "hermes"],
      availableModels: ["gpt-5.4"],
      contextUsed: 41720,
      contextMax: 1050000,
    });
    expect(snapshot.conversation).toEqual(localConversation);
    expect(snapshot.session.runtime).toBe("hermes");
    expect(snapshot.session.auth).toBe("OpenAI Codex");
    expect(snapshot.session.contextDisplay).toBe("41720 / 1050000");
    expect(snapshot.peeks.environment.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "session.mode", value: "hermes" }),
        expect.objectContaining({ label: "session.context", value: "41720 / 1050000" }),
      ]),
    );
  });

  it("uses an explicit hermes session id override when the backend preferences cache is empty", async () => {
    const service = createService({
      getSessionPreferences: vi.fn(() => ({})),
      getHermesSessionStats: vi.fn(async (sessionId) => (
        sessionId === "hermes-session-42"
          ? {
              sessionId,
              inputTokens: 512,
              outputTokens: 32,
              cacheReadTokens: 16,
              cacheWriteTokens: 0,
              reasoningTokens: 8,
            }
          : null
      )),
      getHermesModelContextWindow: vi.fn(async () => 1050000),
    });

    const snapshot = await service.buildDashboardSnapshot("command-center-hermes", {
      agentId: "hermes",
      hermesSessionId: "hermes-session-42",
    });

    expect(snapshot.session).toMatchObject({
      mode: "hermes",
      contextUsed: 568,
      contextMax: 1050000,
      contextDisplay: "568 / 1050000",
    });
  });

  it("keeps attachment-only conversation entries when merging runtime and local messages", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "user",
            content: "",
            timestamp: 10,
            attachments: [
              {
                kind: "image",
                name: "photo.jpg",
                path: "/workspace/media/photo.jpg",
                fullPath: "/workspace/media/photo.jpg",
              },
            ],
          },
        ],
        [],
      ),
    ).toEqual([
      {
        role: "user",
        content: "",
        timestamp: 10,
        attachments: [
          {
            kind: "image",
            name: "photo.jpg",
            path: "/workspace/media/photo.jpg",
            fullPath: "/workspace/media/photo.jpg",
          },
        ],
      },
    ]);
  });

  it("prefers the structured attachment turn over a synthetic attachment prompt duplicate", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "user",
            content: "给我改成米白色的布衣\n\n附件 avatar.JPG.png (image/png, 217 KB) 已附加。",
            timestamp: 10,
          },
        ],
        [
          {
            role: "user",
            content: "给我改成米白色的布衣",
            timestamp: 10,
            attachments: [
              {
                kind: "image",
                name: "avatar.JPG.png",
                path: "/workspace/media/avatar.JPG.png",
                fullPath: "/workspace/media/avatar.JPG.png",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "给我改成米白色的布衣",
        timestamp: 10,
        attachments: [
          {
            kind: "image",
            name: "avatar.JPG.png",
            path: "/workspace/media/avatar.JPG.png",
            fullPath: "/workspace/media/avatar.JPG.png",
          },
        ],
      },
    ]);
  });

  it("keeps the richer local image payload when the transcript turn only adds a materialized file path", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "user",
            content: "修改这张图。把上衣改成姜黄色",
            timestamp: 10,
            attachments: [
              {
                kind: "image",
                name: "wukong-mibai-eyes-brave.png",
                mimeType: "image/png",
                path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
                fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
              },
            ],
          },
        ],
        [
          {
            role: "user",
            content: "修改这张图。把上衣改成姜黄色",
            timestamp: 10,
            attachments: [
              {
                id: "img-1",
                kind: "image",
                name: "wukong-mibai-eyes-brave.png",
                mimeType: "image/png",
                path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
                fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
                dataUrl: "data:image/png;base64,local-rich",
                previewUrl: "data:image/png;base64,local-preview",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "修改这张图。把上衣改成姜黄色",
        timestamp: 10,
        attachments: [
          {
            id: "img-1",
            kind: "image",
            name: "wukong-mibai-eyes-brave.png",
            mimeType: "image/png",
            path: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
            fullPath: "/Users/marila/.openclaw/media/web-uploads/2026-03-25/1774370829820-673f7668-wukong-mibai-eyes-brave.png",
            dataUrl: "data:image/png;base64,local-rich",
            previewUrl: "data:image/png;base64,local-preview",
          },
        ],
      },
    ]);
  });

  it("collapses a delayed synthetic attachment prompt even after an assistant reply", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "user",
            content: "看得到图吗",
            timestamp: 1_000,
            attachments: [
              {
                kind: "image",
                name: "image.png",
                path: "/workspace/media/image.png",
                fullPath: "/workspace/media/image.png",
              },
            ],
          },
          {
            role: "assistant",
            content: "能，这次我看得到你发来的图片附件了。",
            timestamp: 1_001,
          },
        ],
        [
          {
            role: "user",
            content: "看得到图吗\n\n附件 image.png (image/png, 1829 KB) 已附加。",
            timestamp: 1_002,
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "看得到图吗",
        timestamp: 1_000,
        attachments: [
          {
            kind: "image",
            name: "image.png",
            path: "/workspace/media/image.png",
            fullPath: "/workspace/media/image.png",
          },
        ],
      },
      {
        role: "assistant",
        content: "能，这次我看得到你发来的图片附件了。",
        timestamp: 1_001,
      },
    ]);
  });

  it("collapses delayed duplicate assistant greetings when no real user turn happened in between", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "assistant",
            content: "我是 Tom Cruise，今晚我盯着，咱们直接干。你要我现在处理什么，给我一句话目标就行。",
            timestamp: 1_000,
            tokenBadge: "↑3.8k ↓99 R24.3k",
          },
        ],
        [
          {
            role: "assistant",
            content: "我是 Tom Cruise，今晚我盯着，咱们直接干。你要我现在处理什么，给我一句话目标就行。",
            timestamp: 1_025,
            tokenBadge: "↑3.8k ↓99 R24.3k",
          },
        ],
      ),
    ).toEqual([
      {
        role: "assistant",
        content: "我是 Tom Cruise，今晚我盯着，咱们直接干。你要我现在处理什么，给我一句话目标就行。",
        timestamp: 1_000,
        tokenBadge: "↑3.8k ↓99 R24.3k",
      },
    ]);
  });

  it("prefers the richer local attachment payload when gateway and local user turns replay the same image message", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "user",
            content: "只用一句话说你看到了什么",
            timestamp: 10,
            attachments: [
              {
                kind: "image",
                name: "avatar.png",
                mimeType: "image/png",
              },
            ],
          },
        ],
        [
          {
            role: "user",
            content: "只用一句话说你看到了什么",
            timestamp: 10,
            attachments: [
              {
                kind: "image",
                name: "avatar.png",
                mimeType: "image/png",
                dataUrl: "data:image/png;base64,AAAA",
                previewUrl: "data:image/png;base64,AAAA",
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        role: "user",
        content: "只用一句话说你看到了什么",
        timestamp: 10,
        attachments: [
          {
            kind: "image",
            name: "avatar.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,AAAA",
            previewUrl: "data:image/png;base64,AAAA",
          },
        ],
      },
    ]);
  });

  it("builds an openclaw snapshot from transcript data and fallback browser state", async () => {
    const entries = [
      {
        type: "message",
        message: {
          role: "assistant",
          model: "gpt-4.1",
          timestamp: 40,
        },
      },
    ];
    const service = createService({
      config: {
        mode: "openclaw",
        model: "gpt-5",
        baseUrl: "http://127.0.0.1:18789",
        workspaceRoot: "/workspace/openclaw",
        logsDir: "/workspace/logs",
        localConfig: null,
      },
      resolveSessionRecord: vi.fn(() => ({ sessionId: "session-1", updatedAt: 123 })),
      resolveAgentWorkspace: vi.fn(() => "/workspace/agents/main"),
      readJsonLines: vi.fn(() => entries),
      collectConversationMessages: vi.fn(() => [
        { role: "assistant", content: "gateway", timestamp: 20 },
      ]),
      getLocalSessionConversation: vi.fn(() => [
        { role: "user", content: "local", timestamp: 10 },
      ]),
      collectLatestRunUsage: vi.fn(() => ({ input: 5, output: 7, cacheRead: 0, cacheWrite: 0 })),
      parseSessionStatusText: vi.fn(() => ({
        sessionKey: "parsed-key",
        modelDisplay: "gpt-5.1",
        thinkMode: "high",
        contextUsed: 100,
        contextMax: 200,
        contextDisplay: "100 / 200",
        runtimeDisplay: "online",
        queueDisplay: "empty",
        updatedLabel: "1m ago",
        tokensInput: 10,
        tokensOutput: 20,
        authDisplay: "team-key",
        versionDisplay: "1.2.3",
        time: "2026-03-15 18:00",
      })),
      fetchBrowserPeek: vi.fn(async () => {
        throw new Error("peek failed");
      }),
      callOpenClawGateway: vi.fn(async () => ({
        config: {
          agents: {
            list: [
              {
                id: "main",
                subagents: {
                  allowAgents: ["expert"],
                },
              },
              {
                id: "expert",
                skills: ["coding"],
              },
            ],
          },
        },
      })),
      collectAvailableModels: vi.fn(() => ["gpt-5", "gpt-5.1"]),
      collectAvailableAgents: vi.fn(() => ["main"]),
      collectAvailableSkills: vi.fn((runtimeConfig, agentId) => {
        const currentAgent = runtimeConfig?.agents?.list?.find((agent) => agent.id === agentId);
        return (currentAgent?.subagents?.allowAgents || []).map((value) => ({ name: "coding", ownerAgentId: value }));
      }),
      collectTaskRelationships: vi.fn(() => [{ id: "rel-1", type: "child_agent", sourceAgentId: "main", targetAgentId: "expert" }]),
    });

    const snapshot = await service.buildDashboardSnapshot("demo-user");

    expect(snapshot.session).toMatchObject({
      mode: "openclaw",
      model: "gpt-5.1",
      selectedModel: "gpt-5",
      workspaceRoot: "/workspace/agents/main",
      sessionKey: "parsed-key",
      thinkMode: "high",
      contextDisplay: "100 / 200",
      runtime: "online",
      queue: "empty",
      tokens: "↑5 ↓7",
      auth: "team-key",
      version: "1.2.3",
      time: "2026-03-15 18:00",
      availableSkills: [{ name: "coding", ownerAgentId: "expert" }],
    });
    expect(snapshot.peeks.environment.items.find((item) => item.label === "LALACLAW.VERSION")).toEqual({
      label: "LALACLAW.VERSION",
      value: lalaclawVersion,
    });
    expect(snapshot.peeks.environment.items.find((item) => item.label === "OPENCLAW.VERSION")).toEqual({
      label: "OPENCLAW.VERSION",
      value: "1.2.3",
    });
    expect(snapshot.conversation).toEqual([
      { role: "user", content: "local", timestamp: 10 },
      { role: "assistant", content: "gateway", timestamp: 20 },
    ]);
    expect(snapshot.peeks.browser).toEqual({
      summary: "浏览器状态暂时不可用。",
      items: [{ label: "状态", value: "读取失败" }],
    });
    expect(snapshot.peeks.workspace.entries).toEqual([
      { path: "/workspace/agents/main/src/App.jsx", fullPath: "/workspace/agents/main/src/App.jsx", kind: "文件" },
    ]);
    expect(snapshot.peeks.workspace.totalCount).toBe(12);
    expect(snapshot.taskTimeline).toEqual([{ id: "run-1" }]);
    expect(snapshot.taskRelationships).toEqual([{ id: "rel-1", type: "child_agent", sourceAgentId: "main", targetAgentId: "expert" }]);
    expect(snapshot.agents).toEqual([{ id: "main" }]);
  });

  it("falls back to gateway config version for OPENCLAW.VERSION", async () => {
    const service = createService({
      config: {
        mode: "openclaw",
        model: "gpt-5",
        baseUrl: "http://127.0.0.1:18789",
        workspaceRoot: "/workspace/openclaw",
        logsDir: "/workspace/logs",
        localConfig: null,
      },
      resolveSessionRecord: vi.fn(() => ({ sessionId: "session-1", updatedAt: 123 })),
      parseSessionStatusText: vi.fn(() => ({
        sessionKey: "parsed-key",
        modelDisplay: "gpt-5.1",
      })),
      callOpenClawGateway: vi.fn(async () => ({
        config: {
          version: "9.9.9",
          agents: {
            list: [],
          },
        },
      })),
    });

    const snapshot = await service.buildDashboardSnapshot("demo-user");

    expect(snapshot.session.version).toBe("9.9.9");
    expect(snapshot.peeks.environment.items.find((item) => item.label === "LALACLAW.VERSION")).toEqual({
      label: "LALACLAW.VERSION",
      value: lalaclawVersion,
    });
    expect(snapshot.peeks.environment.items.find((item) => item.label === "OPENCLAW.VERSION")).toEqual({
      label: "OPENCLAW.VERSION",
      value: "9.9.9",
    });
  });

  it("passes injected workspace files into file and timeline projection", async () => {
    const collectFiles = vi.fn(() => [{ path: "USER.md" }]);
    const collectTaskTimeline = vi.fn(() => [{ id: "run-1" }]);
    const injectedFiles = [{ path: "/workspace/writer/USER.md" }];
    const localFileEntries = [{ type: "message", message: { role: "user", content: [{ type: "text", text: "/workspace/project/assets/ref.png" }] } }];
    const service = createService({
      collectFiles,
      collectTaskTimeline,
      getLocalSessionFileEntries: vi.fn(() => localFileEntries),
      config: {
        mode: "openclaw",
        model: "gpt-5",
        baseUrl: "http://127.0.0.1:18789",
        workspaceRoot: "/workspace/openclaw",
        logsDir: "/workspace/logs",
        localConfig: null,
      },
      resolveSessionRecord: vi.fn(() => ({
        sessionId: "session-1",
        updatedAt: 123,
        systemPromptReport: {
          injectedWorkspaceFiles: injectedFiles,
        },
      })),
    });

    await service.buildDashboardSnapshot("demo-user");

    expect(collectFiles).toHaveBeenCalledWith(
      localFileEntries,
      ["/workspace/project", "/workspace/openclaw"],
      { injectedFiles },
    );
    expect(collectTaskTimeline).toHaveBeenCalledWith(
      [],
      ["/workspace/project", "/workspace/openclaw"],
      { injectedFiles },
    );
  });
});
