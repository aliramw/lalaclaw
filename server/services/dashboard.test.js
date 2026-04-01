import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardService, mergeConversationMessages } from "./dashboard.ts";
import { createTranscriptProjector } from "./transcript.ts";

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
    vi.useRealTimers();
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
    const sessionKey = "agent:main:dingtalk-connector:direct:398058";
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
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : sessionKey,
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

    expect(snapshot.session.sessionUser).toBe(sessionKey);
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
    const sessionKey = "agent:main:dingtalk-connector:direct:398058";
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
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : sessionKey,
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

  it("scopes fallback transcript history to the requested session when another IM session shares the same file tail", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-fallback-scope-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionUser = '{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const sessionKey = "agent:main:dingtalk-connector:direct:398058";
    const otherSessionKey = "agent:main:dingtalk-connector:direct:998877";
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
          timestamp: "2026-03-17T04:40:10.000Z",
          message: {
            role: "user",
            timestamp: 1773722410000,
            content: [{ type: "text", text: "当前会话消息" }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:40:15.000Z",
          message: {
            role: "assistant",
            timestamp: 1773722415000,
            content: [{ type: "text", text: "当前会话回复" }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:40:20.000Z",
          message: {
            role: "toolResult",
            content: [{ type: "text", text: `status: ${otherSessionKey}` }],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:40:25.000Z",
          message: {
            role: "user",
            timestamp: 1773722425000,
            content: [{ type: "text", text: "别的会话消息" }],
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
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : sessionKey,
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

    expect(snapshot.session.status).toBe("就绪");
    expect(snapshot.conversation).toEqual([
      {
        role: "user",
        timestamp: 1773722410000,
        content: "当前会话消息",
      },
      {
        role: "assistant",
        timestamp: 1773722415000,
        content: "当前会话回复",
      },
    ]);
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

  it("resolves bootstrap Feishu runtime requests to the latest real Feishu session", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-feishu-bootstrap-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const bootstrapSessionUser = "feishu:direct:default";
    const nativeDefaultSessionUser = "agent:main:feishu:direct:default";
    const nativeSessionUser = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    const nativeSessionRecord = {
      updatedAt: 1773865223983,
      sessionId: "feishu-native-session-id",
    };
    const defaultSessionRecord = {
      updatedAt: 1773868913020,
      sessionId: "feishu-default-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [nativeSessionUser]: nativeSessionRecord,
        [nativeDefaultSessionUser]: defaultSessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "feishu-native-session-id.jsonl"),
      [
        JSON.stringify({ type: "session", id: "feishu-native-session-id", timestamp: "2026-03-19T04:16:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-19T04:16:04.000Z",
          message: {
            role: "assistant",
            timestamp: 1773865164000,
            content: [{ type: "text", text: "收到 👌" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "feishu-default-session-id.jsonl"),
      JSON.stringify({ type: "session", id: "feishu-default-session-id", timestamp: "2026-03-19T02:00:00.000Z" }),
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
      getCommandCenterSessionKey: (agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : `agent:${agentId}:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      listImSessionsForAgent: projector.listImSessionsForAgent,
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
      resolveSessionRecord: (agentId, sessionKey) => {
        const sessions = {
          [nativeSessionUser]: nativeSessionRecord,
          [nativeDefaultSessionUser]: defaultSessionRecord,
        };
        return sessions[sessionKey] || null;
      },
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(bootstrapSessionUser, { agentId: "main" });

    expect(snapshot.session.sessionUser).toBe(nativeSessionUser);
  });

  it("resolves bootstrap WeCom runtime requests to the latest real WeCom direct session", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-wecom-bootstrap-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const bootstrapSessionUser = "wecom:direct:default";
    const nativeDefaultSessionUser = "agent:main:wecom:direct:default";
    const nativeSessionUser = "agent:main:wecom:direct:marila";
    const nativeSessionRecord = {
      updatedAt: 1773865214025,
      sessionId: "wecom-native-session-id",
    };
    const defaultSessionRecord = {
      updatedAt: 1773868913020,
      sessionId: "wecom-default-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [nativeSessionUser]: nativeSessionRecord,
        [nativeDefaultSessionUser]: defaultSessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "wecom-native-session-id.jsonl"),
      [
        JSON.stringify({ type: "session", id: "wecom-native-session-id", timestamp: "2026-03-19T04:20:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-19T04:20:06.000Z",
          message: {
            role: "assistant",
            timestamp: 1773865206000,
            content: [{ type: "text", text: "在，啥事？" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "wecom-default-session-id.jsonl"),
      JSON.stringify({ type: "session", id: "wecom-default-session-id", timestamp: "2026-03-19T02:00:00.000Z" }),
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
      getCommandCenterSessionKey: (agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : `agent:${agentId}:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      listImSessionsForAgent: projector.listImSessionsForAgent,
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
      resolveSessionRecord: (agentId, sessionKey) => {
        const sessions = {
          [nativeSessionUser]: nativeSessionRecord,
          [nativeDefaultSessionUser]: defaultSessionRecord,
        };
        return sessions[sessionKey] || null;
      },
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(bootstrapSessionUser, { agentId: "main" });

    expect(snapshot.session.sessionUser).toBe(nativeSessionUser);
  });

  it("resolves a default WeCom bootstrap tab to the latest group session when the group is the active conversation", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-wecom-group-bootstrap-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const bootstrapSessionUser = "wecom:direct:default";
    const nativeGroupSessionUser = "agent:main:wecom:group:marila";
    const nativeDirectSessionUser = "agent:main:wecom:direct:marila";
    const nativeGroupSessionRecord = {
      updatedAt: 1773868913020,
      sessionId: "wecom-group-session-id",
    };
    const nativeDirectSessionRecord = {
      updatedAt: 1773865214025,
      sessionId: "wecom-direct-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [nativeGroupSessionUser]: nativeGroupSessionRecord,
        [nativeDirectSessionUser]: nativeDirectSessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "wecom-group-session-id.jsonl"),
      [
        JSON.stringify({ type: "session", id: "wecom-group-session-id", timestamp: "2026-03-19T04:25:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-19T04:25:06.000Z",
          message: {
            role: "assistant",
            timestamp: 1773866706000,
            content: [{ type: "text", text: "群里最新消息" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "wecom-direct-session-id.jsonl"),
      JSON.stringify({ type: "session", id: "wecom-direct-session-id", timestamp: "2026-03-19T04:20:00.000Z" }),
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
      getCommandCenterSessionKey: (agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : `agent:${agentId}:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      listImSessionsForAgent: projector.listImSessionsForAgent,
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
      resolveSessionRecord: (agentId, sessionKey) => {
        const sessions = {
          [nativeGroupSessionUser]: nativeGroupSessionRecord,
          [nativeDirectSessionUser]: nativeDirectSessionRecord,
        };
        return sessions[sessionKey] || null;
      },
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(bootstrapSessionUser, { agentId: "main" });

    expect(snapshot.session.sessionUser).toBe(nativeGroupSessionUser);
  });

  it("resolves bootstrap Weixin runtime requests to the latest real Weixin session", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-weixin-bootstrap-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const bootstrapSessionUser = "openclaw-weixin:direct:default";
    const nativeDefaultSessionUser = "agent:main:openclaw-weixin:direct:default";
    const nativeSessionUser = "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat";
    const nativeSessionRecord = {
      updatedAt: 1774255203918,
      sessionId: "weixin-native-session-id",
    };
    const defaultSessionRecord = {
      updatedAt: 1774251203918,
      sessionId: "weixin-default-session-id",
    };

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        [nativeSessionUser]: nativeSessionRecord,
        [nativeDefaultSessionUser]: defaultSessionRecord,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "weixin-native-session-id.jsonl"),
      [
        JSON.stringify({ type: "session", id: "weixin-native-session-id", timestamp: "2026-03-23T10:00:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-23T10:00:06.000Z",
          message: {
            role: "assistant",
            timestamp: 1774255206000,
            content: [{ type: "text", text: "微信里最新一条" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sessionsDir, "weixin-default-session-id.jsonl"),
      JSON.stringify({ type: "session", id: "weixin-default-session-id", timestamp: "2026-03-23T09:00:00.000Z" }),
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
      getCommandCenterSessionKey: (agentId, nextSessionUser) => String(nextSessionUser || "").startsWith("agent:") ? nextSessionUser : `agent:${agentId}:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: projector.getTranscriptEntriesForSession,
      getTranscriptPath: projector.getTranscriptPath,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      listImSessionsForAgent: projector.listImSessionsForAgent,
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
      resolveSessionRecord: (_agentId, sessionKey) => {
        const sessions = {
          [nativeSessionUser]: nativeSessionRecord,
          [nativeDefaultSessionUser]: defaultSessionRecord,
        };
        return sessions[sessionKey] || null;
      },
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot(bootstrapSessionUser, { agentId: "main" });

    expect(snapshot.session.sessionUser).toBe(nativeSessionUser);
  });

  it("includes runtime hub debug info in the environment peek", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runtime-hub-"));
    tempDirs.push(rootDir);

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
      collectConversationMessages: () => [],
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: { mode: "mock", workspaceRoot: rootDir, model: "openai-codex/gpt-5.4", localConfig: {} },
      extractTextSegments: () => [],
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => `agent:main:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: () => [],
      getTranscriptPath: () => "",
      getRuntimeHubDebugInfo: ({ sessionUser, agentId }) => ({
        gatewayConnected: true,
        channelCount: 2,
        subscriberCount: 3,
        channel: {
          key: `${agentId}::${sessionUser}`,
          agentId,
          sessionUser,
          subscriberCount: 1,
          pollIntervalMs: 8000,
          hasSnapshot: true,
          lastRefreshReason: "gateway_refresh:chat:final",
          lastGatewayEvent: "chat:final",
        },
      }),
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: () => [],
      readTextIfExists: () => "",
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => null,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot("command-center", { agentId: "main" });
    const environmentItems = snapshot.peeks.environment.items;

    expect(environmentItems).toEqual(expect.arrayContaining([
      { label: "runtimeHub.gatewayConnected", value: "true" },
      { label: "runtimeHub.channelCount", value: "2" },
      { label: "runtimeHub.subscriberCount", value: "3" },
      { label: "runtimeHub.channel.key", value: "main::command-center" },
      { label: "runtimeHub.channel.lastRefreshReason", value: "gateway_refresh:chat:final" },
      { label: "runtimeHub.channel.lastGatewayEvent", value: "chat:final" },
    ]));
  });

  it("includes OpenClaw diagnostics in the environment peek", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-openclaw-diagnostics-"));
    tempDirs.push(rootDir);
    const logsDir = path.join(rootDir, "logs");
    const localConfigPath = path.join(rootDir, "openclaw.json");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(localConfigPath, JSON.stringify({ gateway: { port: 18789 } }), "utf8");
    fs.writeFileSync(path.join(logsDir, "gateway.log"), "gateway ready\n", "utf8");

    const dashboard = createDashboardService({
      HOST: "127.0.0.1",
      PORT: 3000,
      PROJECT_ROOT: rootDir,
      callOpenClawGateway: async (method) => {
        if (method === "config.get") {
          return {
            config: {
              agents: { list: [] },
              gateway: { version: "1.2.3" },
            },
          };
        }
        return {};
      },
      clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      collectArtifacts: () => [],
      collectConversationMessages: () => [],
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: {
        mode: "openclaw",
        workspaceRoot: rootDir,
        model: "openai-codex/gpt-5.4",
        localConfig: {},
        localConfigPath,
        logsDir,
        baseUrl: "http://127.0.0.1:18789",
        gatewayPort: 18789,
        healthPort: 18792,
        apiPath: "/v1/chat/completions",
        apiStyle: "chat",
      },
      extractTextSegments: () => [],
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => `agent:main:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: () => [],
      getTranscriptPath: () => "",
      getRuntimeHubDebugInfo: () => null,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      listImSessionsForAgent: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: () => [],
      readTextIfExists: () => "",
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => null,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    const snapshot = await dashboard.buildDashboardSnapshot("command-center", { agentId: "main" });
    const environmentItems = snapshot.peeks.environment.items;

    expect(environmentItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "LALACLAW.VERSION", value: expect.any(String) }),
      expect.objectContaining({ label: "LALACLAW.FRONTEND_URL", value: "http://127.0.0.1:5173" }),
      expect.objectContaining({ label: "LALACLAW.SERVER_URL", value: "http://127.0.0.1:3000" }),
      expect.objectContaining({ label: "LALACLAW.ACCESS_MODE", value: "off" }),
      expect.objectContaining({ label: "LALACLAW.GATEWAY_AUTH", value: "none" }),
      expect.objectContaining({ label: "openclaw.version", value: "1.2.3" }),
      expect.objectContaining({ label: "openclaw.runtime.profile", value: "openclaw" }),
      expect.objectContaining({ label: "openclaw.config.path", value: localConfigPath, previewable: true }),
      expect.objectContaining({ label: "openclaw.config.status", value: "ok" }),
      expect.objectContaining({ label: "openclaw.workspace.root", value: rootDir, revealable: true }),
      expect.objectContaining({ label: "openclaw.workspace.status", value: "ok" }),
      expect.objectContaining({ label: "openclaw.gateway.status", value: "ok" }),
      expect.objectContaining({ label: "openclaw.gateway.baseUrl", value: "http://127.0.0.1:18789" }),
      expect.objectContaining({ label: "openclaw.gateway.healthUrl", value: "http://127.0.0.1:18789/healthz" }),
      expect.objectContaining({ label: "openclaw.doctor.summary", value: "healthy" }),
      expect.objectContaining({ label: "openclaw.doctor.logs", value: "ok" }),
      expect.objectContaining({ label: "openclaw.logs.dir", value: logsDir, revealable: true }),
      expect.objectContaining({ label: "openclaw.logs.gatewayPath", value: path.join(logsDir, "gateway.log"), previewable: true }),
      expect.objectContaining({ label: "openclaw.logs.supervisorPath", value: path.join(logsDir, "supervisor.log") }),
      expect.objectContaining({ label: "openclaw.remote.target", value: "local" }),
      expect.objectContaining({ label: "openclaw.remote.writeAccess", value: "local" }),
      expect.objectContaining({ label: "openclaw.remote.auditCount", value: "0" }),
    ]));
    expect(environmentItems.find((item) => item.label === "openclaw.logs.supervisorPath")).not.toHaveProperty("previewable");
    expect(environmentItems.find((item) => item.label === "gateway.apiPath")).not.toHaveProperty("previewable");
  });

  it("falls back to local config when config.get stalls so runtime snapshots still resolve", async () => {
    vi.useFakeTimers();

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-live-config-timeout-"));
    tempDirs.push(rootDir);

    const dashboard = createDashboardService({
      HOST: "127.0.0.1",
      PORT: 3000,
      PROJECT_ROOT: rootDir,
      callOpenClawGateway: async (method) => {
        if (method === "config.get") {
          return await new Promise(() => {});
        }
        return {};
      },
      clip: (text, maxLength = 180) => String(text || "").slice(0, maxLength),
      collectAvailableAgents: () => [],
      collectAvailableSkills: () => [],
      collectAllowedSubagents: () => [],
      collectAvailableModels: () => [],
      collectArtifacts: () => [],
      collectConversationMessages: () => [],
      collectFiles: () => [],
      collectLatestRunUsage: () => null,
      collectSnapshots: () => [],
      collectTaskRelationships: () => [],
      collectTaskTimeline: () => [],
      collectToolHistory: () => [],
      config: {
        mode: "openclaw",
        workspaceRoot: rootDir,
        model: "openai-codex/gpt-5.4",
        localConfig: {},
      },
      extractTextSegments: () => [],
      fetchBrowserPeek: async () => ({ summary: "", items: [] }),
      formatTokenBadge: () => "",
      formatTimestamp: (value) => String(value),
      getCommandCenterSessionKey: (_agentId, nextSessionUser) => `agent:main:openai-user:${nextSessionUser}`,
      getDefaultModelForAgent: () => "openai-codex/gpt-5.4",
      getLocalSessionFileEntries: () => [],
      getLocalSessionConversation: () => [],
      getTranscriptEntriesForSession: () => [],
      getTranscriptPath: () => "",
      getRuntimeHubDebugInfo: () => null,
      invokeOpenClawTool: async () => null,
      listDirectoryPreview: () => [],
      listImSessionsForAgent: () => [],
      normalizeSessionUser: (value) => String(value || "").trim(),
      findLatestSessionForAgent: () => null,
      parseSessionStatusText: () => null,
      readJsonLines: () => [],
      readTextIfExists: () => "",
      resolveAgentDisplayName: () => "Tom Cruise",
      resolveAgentWorkspace: () => rootDir,
      resolveSessionAgentId: () => "main",
      resolveSessionFastMode: () => false,
      resolveSessionModel: () => "openai-codex/gpt-5.4",
      resolveSessionRecord: () => null,
      resolveSessionThinkMode: () => "off",
      buildAgentGraph: () => [],
      tailLines: () => [],
    });

    let settled = false;
    const snapshotPromise = dashboard.buildDashboardSnapshot("command-center", { agentId: "main" }).then((snapshot) => {
      settled = true;
      return snapshot;
    });

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();

    expect(settled).toBe(true);

    const snapshot = await snapshotPromise;
    expect(snapshot.session.sessionUser).toBe("command-center");
    expect(snapshot.session.selectedModel).toBe("openai-codex/gpt-5.4");
  });
});

describe("mergeConversationMessages", () => {
  it("collapses assistant replays that extend the same visible reply", () => {
    expect(
      mergeConversationMessages(
        [
          { role: "user", content: "发0.5.4", timestamp: 1_000 },
          {
            role: "assistant",
            content: "行，我直接把版本提到 0.5.4，然后按规范走一遍：改版本、补 changelog、提交推送、发 GitHub Release、再次 ClawHub。",
            timestamp: 2_000,
          },
        ],
        [
          {
            role: "assistant",
            content: "行，我直接把版本提到 0.5.4，然后按规范走一遍：改版本、补 changelog、提交推送、发 GitHub Release、再次 ClawHub。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
            timestamp: 2_010,
          },
        ],
      ),
    ).toEqual([
      { role: "user", content: "发0.5.4", timestamp: 1_000 },
      {
        role: "assistant",
        content: "行，我直接把版本提到 0.5.4，然后按规范走一遍：改版本、补 changelog、提交推送、发 GitHub Release、再次 ClawHub。版本文件改完了。现在我跑一次测试并把改动提交，推上去。",
        timestamp: 2_010,
      },
    ]);
  });

  it("drops wrapped user duplicates after an aborted-run note was split into a system message", () => {
    expect(
      mergeConversationMessages(
        [
          {
            role: "system",
            content: "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
            timestamp: 1_000,
          },
          {
            role: "user",
            content: "好了吗",
            timestamp: 1_000,
          },
        ],
        [
          {
            role: "user",
            content: [
              "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
              "",
              "Conversation info (untrusted metadata):",
              "```json",
              "{",
              '  "message_id": "openclaw-weixin:1775026722628-fa64a87f",',
              '  "timestamp": "Wed 2026-04-01 14:58 GMT+8"',
              "}",
              "```",
              "",
              "好了吗",
            ].join("\n"),
            timestamp: 1_000,
          },
        ],
      ),
    ).toEqual([
      {
        role: "system",
        content: "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
        timestamp: 1_000,
      },
      {
        role: "user",
        content: "好了吗",
        timestamp: 1_000,
      },
    ]);
  });
});
