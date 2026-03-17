/* global afterEach, describe, expect, it */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDashboardService } = require("./dashboard");
const { createTranscriptProjector } = require("./transcript");

function buildTestTranscriptProjector(rootDir) {
  return createTranscriptProjector({
    PROJECT_ROOT: rootDir,
    LOCAL_OPENCLAW_DIR: rootDir,
    config: { agentId: "main", workspaceRoot: rootDir },
    fileExists: (filePath) => fs.existsSync(filePath),
    readJsonIfExists: (filePath) => {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    },
    readTextIfExists: (filePath) => {
      if (!fs.existsSync(filePath)) {
        return "";
      }
      return fs.readFileSync(filePath, "utf8");
    },
    normalizeThinkMode: (value) => value,
    parseCompactNumber: () => 0,
    parseTokenDisplay: () => null,
    formatTokenBadge: () => "",
    clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
    formatTimestamp: (value) => String(value),
  });
}

describe("createDashboardService", () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) {
      fs.rmSync(tempDirs.pop(), { force: true, recursive: true });
    }
  });

  it("loads conversation history from fallback transcript files when the indexed session file is missing", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const sessionKey = `agent:main:openai-user:${sessionUser}`;
    const sessionRecord = {
      updatedAt: 1773722999708,
      sessionId: "missing-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [sessionKey]: sessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "fallback.jsonl"),
      [
        JSON.stringify({ type: "session", id: "fallback", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:40:01.000Z",
          message: {
            role: "toolResult",
            content: [{ type: "text", text: `status: ${sessionKey}` }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "user",
            timestamp: 1773722986181,
            content: [{ type: "text", text: "你你你" }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:59.626Z",
          message: {
            role: "assistant",
            timestamp: 1773722999626,
            content: [{ type: "text", text: "在。 你说。" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = buildTestTranscriptProjector(rootDir);
    const dashboard = createDashboardService({
      HOST: "127.0.0.1",
      PORT: 3000,
      PROJECT_ROOT: rootDir,
      callOpenClawGateway: async () => ({}),
      clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      collectArtifacts: () => [],
      collectConversationMessages: projector.collectConversationMessages,
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: { mode: "openclaw", workspaceRoot: rootDir, model: "openai-codex/gpt-5.4", localConfig: {} },
      extractTextSegments: projector.extractTextSegments,
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => `agent:main:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: projector.readJsonLines,
      readTextIfExists: (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => sessionRecord,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(sessionUser, { agentId: "main" });

    expect(snapshot.session.sessionUser).toBe(sessionUser);
    expect(snapshot.conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "你你你" }),
        expect.objectContaining({ role: "assistant", content: "在。 你说。" }),
      ]),
    );
  });

  it("marks a DingTalk session as running when the latest transcript turn is still waiting for an assistant reply", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-running-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const sessionKey = `agent:main:openai-user:${sessionUser}`;
    const sessionRecord = {
      updatedAt: 1773722999708,
      sessionId: "missing-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [sessionKey]: sessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "fallback.jsonl"),
      [
        JSON.stringify({ type: "session", id: "fallback", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:40:01.000Z",
          message: {
            role: "toolResult",
            content: [{ type: "text", text: `status: ${sessionKey}` }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "user",
            timestamp: 1773722986181,
            content: [{ type: "text", text: "我测试一下" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = buildTestTranscriptProjector(rootDir);
    const dashboard = createDashboardService({
      HOST: "127.0.0.1",
      PORT: 3000,
      PROJECT_ROOT: rootDir,
      callOpenClawGateway: async () => ({}),
      clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      collectArtifacts: () => [],
      collectConversationMessages: projector.collectConversationMessages,
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: { mode: "openclaw", workspaceRoot: rootDir, model: "openai-codex/gpt-5.4", localConfig: {} },
      extractTextSegments: projector.extractTextSegments,
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => `agent:main:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: projector.readJsonLines,
      readTextIfExists: (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => sessionRecord,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(sessionUser, { agentId: "main" });

    expect(snapshot.session.status).toBe("运行中");
    expect(snapshot.conversation.at(-1)).toMatchObject({ role: "user", content: "我测试一下" });
  });

  it("strips Feishu sender ids from displayed user messages", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-feishu-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionUser = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    const sessionRecord = {
      updatedAt: 1773743862000,
      sessionId: "feishu-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [sessionUser]: sessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "feishu-session-id.jsonl"),
      [
        JSON.stringify({ type: "session", id: "feishu-session-id", timestamp: "2026-03-17T07:57:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T07:57:42.000Z",
          message: {
            role: "user",
            timestamp: 1773743862000,
            content: [{ type: "text", text: "ou_d249239ddfd11c4c3c4f5f1581c97a58: 肥水" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = buildTestTranscriptProjector(rootDir);
    const dashboard = createDashboardService({
      HOST: "127.0.0.1",
      PORT: 3000,
      PROJECT_ROOT: rootDir,
      callOpenClawGateway: async () => ({}),
      clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      collectArtifacts: () => [],
      collectConversationMessages: projector.collectConversationMessages,
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: { mode: "openclaw", workspaceRoot: rootDir, model: "openai-codex/gpt-5.4", localConfig: {} },
      extractTextSegments: projector.extractTextSegments,
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: () => sessionUser,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: projector.readJsonLines,
      readTextIfExists: (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => sessionRecord,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(sessionUser, { agentId: "main" });

    expect(snapshot.conversation.at(-1)).toMatchObject({ role: "user", content: "肥水" });
  });

  it("keeps the local Feishu user turn while filtering mirrored replay artifacts from transcript history", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-feishu-mirror-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionUser = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    const sessionRecord = {
      updatedAt: 1773743864914,
      sessionId: "feishu-mirror-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [sessionUser]: sessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "feishu-mirror-session-id.jsonl"),
      [
        JSON.stringify({ type: "session", id: "feishu-mirror-session-id", timestamp: "2026-03-17T08:04:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T08:04:02.489Z",
          message: {
            role: "assistant",
            timestamp: 1773734642489,
            content: [{ type: "text", text: "marila：来自lalaclaw" }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T08:04:04.912Z",
          message: {
            role: "user",
            timestamp: 1773734644912,
            content: [{ type: "text", text: "[Tue 2026-03-17 16:04 GMT+8] marila：来自lalaclaw" }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T08:04:04.914Z",
          message: {
            role: "assistant",
            timestamp: 1773734644914,
            content: [{ type: "text", text: "[[reply_to_current]] 收到。你继续说。" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = buildTestTranscriptProjector(rootDir);
    const dashboard = createDashboardService({
      HOST: "127.0.0.1",
      PORT: 3000,
      PROJECT_ROOT: rootDir,
      callOpenClawGateway: async () => ({}),
      clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      collectArtifacts: () => [],
      collectConversationMessages: projector.collectConversationMessages,
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: { mode: "openclaw", workspaceRoot: rootDir, model: "openai-codex/gpt-5.4", localConfig: {} },
      extractTextSegments: projector.extractTextSegments,
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: () => sessionUser,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [
        {
          role: "user",
          timestamp: 1773734642000,
          content: "来自lalaclaw",
        },
      ],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: projector.readJsonLines,
      readTextIfExists: (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""),
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => sessionRecord,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(sessionUser, { agentId: "main" });

    expect(snapshot.conversation).toEqual([
      {
        role: "user",
        timestamp: 1773734642000,
        content: "来自lalaclaw",
      },
      {
        role: "assistant",
        timestamp: 1773734644914,
        content: "收到。你继续说。",
      },
    ]);
  });
});
