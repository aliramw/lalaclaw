import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createDashboardService } = require("../server/services");

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
    getLocalSessionFileEntries: vi.fn(() => []),
    getLocalSessionConversation: vi.fn(() => []),
    getTranscriptPath: vi.fn(() => "/workspace/openclaw/session.jsonl"),
    invokeOpenClawTool: vi.fn(async () => ({ details: { statusText: "status-text" } })),
    listDirectoryPreview: vi.fn((root) =>
      root === "/workspace/project"
        ? [{ name: "src", kind: "dir" }]
        : [{ name: "agent.log", kind: "file" }],
    ),
    normalizeSessionUser: vi.fn((value) => String(value || "")),
    parseSessionStatusText: vi.fn(() => null),
    readJsonLines: vi.fn(() => []),
    readTextIfExists: vi.fn(() => "line-1\nline-2\nline-3"),
    resolveAgentDisplayName: vi.fn((agentId) => `Agent ${agentId}`),
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
    expect(snapshot.peeks.terminal.items[2].value).toContain("line-1");
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
    expect(snapshot.conversation).toEqual([
      { role: "user", content: "local", timestamp: 10 },
      { role: "assistant", content: "gateway", timestamp: 20 },
    ]);
    expect(snapshot.peeks.browser).toEqual({
      summary: "浏览器状态暂时不可用。",
      items: [{ label: "状态", value: "读取失败" }],
    });
    expect(snapshot.taskTimeline).toEqual([{ id: "run-1" }]);
    expect(snapshot.taskRelationships).toEqual([{ id: "rel-1", type: "child_agent", sourceAgentId: "main", targetAgentId: "expert" }]);
    expect(snapshot.agents).toEqual([{ id: "main" }]);
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
