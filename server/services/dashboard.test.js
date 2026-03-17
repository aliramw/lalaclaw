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
});
