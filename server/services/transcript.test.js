/* global afterEach, describe, expect, it */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { createTranscriptProjector } from "./transcript.ts";

function createTestProjector(rootDir) {
  return createTranscriptProjector({
    PROJECT_ROOT: rootDir,
    LOCAL_OPENCLAW_DIR: rootDir,
    config: { agentId: "main" },
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

describe("searchSessionsForAgent", () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) {
      fs.rmSync(tempDirs.pop(), { force: true, recursive: true });
    }
  });

  it("keeps returning channel-specific sessions even when recent global sessions are from another channel", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessions = {};

    for (let index = 0; index < 100; index += 1) {
      sessions[`agent:main:openai-user:webchat:${index}`] = {
        updatedAt: 200000 - index,
        sessionId: `web-${index}`,
        lastChannel: "webchat",
        origin: { provider: "webchat" },
        deliveryContext: { channel: "webchat" },
      };
    }

    for (let index = 0; index < 5; index += 1) {
      sessions[`agent:main:openai-user:dingtalk-connector:default:398058:${index}`] = {
        updatedAt: 100000 - index,
        sessionId: `ding-${index}`,
        lastChannel: "dingtalk-connector",
        origin: { provider: "dingtalk-connector" },
        deliveryContext: { channel: "dingtalk-connector" },
      };
    }

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "dingtalk-connector",
      limit: 12,
      term: "",
    });

    expect(results).toHaveLength(5);
    expect(results.every((entry) => entry.sessionUser.includes("dingtalk-connector"))).toBe(true);
  });

  it("finds the latest main-agent session even when it uses the direct agent session key", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify({
      "agent:main:main": {
        updatedAt: 200,
        sessionId: "main-latest",
        modelProvider: "openai-codex",
        model: "gpt-5.4",
      },
      "agent:main:openai-user:command-center": {
        updatedAt: 100,
        sessionId: "command-center-older",
      },
    }), "utf8");

    fs.writeFileSync(
      path.join(sessionsDir, "main-latest.jsonl"),
      [
        JSON.stringify({ type: "session", id: "main-latest", timestamp: "2026-04-13T00:00:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-04-13T00:00:01.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "HEARTBEAT_OK" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const latest = projector.findLatestSessionForAgent("main");

    expect(latest.sessionKey).toBe("agent:main:main");
    expect(latest.sessionUser).toBe("main");
    expect(latest.sessionRecord.modelProvider).toBe("openai-codex");
    expect(latest.sessionRecord.model).toBe("gpt-5.4");
  });

  it("falls back to matching transcript files when the indexed sessionId file is missing", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = 'agent:main:openai-user:{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773722999708,
        sessionId: "missing-session-id",
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "orphan-session.jsonl"),
      [
        JSON.stringify({ type: "session", id: "orphan-session", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:40:01.000Z",
          message: {
            role: "toolResult",
            content: [
              {
                type: "text",
                text: `status: ${sessionKey}`,
              },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "你你你",
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "dingtalk-connector",
      limit: 12,
      term: "你你你",
    });

    expect(results).toHaveLength(1);
    expect(results[0].preview).toContain("你你你");
    expect(results[0].sessionUser).toBe("agent:main:dingtalk-connector:direct:398058");
    expect(results[0].displaySessionUser).toBe("dingtalk-connector:__default__:direct:398058:马锐拉");
  });

  it("strips markdown markers from the session search preview", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = 'agent:main:openai-user:{"channel":"dingtalk-connector","accountid":"__default__","chattype":"direct","peerid":"398058","sendername":"马锐拉"}';
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773722999708,
        sessionId: "ding-preview",
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "ding-preview.jsonl"),
      [
        JSON.stringify({ type: "session", id: "ding-preview", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "- **改配置**：给主模型 `openai-codex/gpt-5.4` 加了 fallback",
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "dingtalk-connector",
      limit: 12,
      term: "",
    });

    expect(results).toHaveLength(1);
    expect(results[0].preview).toBe("改配置：给主模型 openai-codex/gpt-5.4 加了 fallback");
  });

  it("returns native Feishu sessions and formats their display session id", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773733112684,
        sessionId: "feishu-session",
        lastChannel: "feishu",
        origin: {
          label: "飞书小助手",
          provider: "feishu",
          surface: "feishu",
          to: "user:ou_d249239ddfd11c4c3c4f5f1581c97a58",
        },
        deliveryContext: {
          channel: "feishu",
          to: "user:ou_d249239ddfd11c4c3c4f5f1581c97a58",
          accountId: "default",
        },
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "feishu-session.jsonl"),
      [
        JSON.stringify({ type: "session", id: "feishu-session", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "宝塔镇河妖",
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "feishu",
      limit: 12,
      term: "宝塔镇河妖",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sessionUser).toBe(sessionKey);
    expect(results[0].displaySessionUser).toBe("feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58");
    expect(results[0].title).toBe("飞书小助手");
    expect(results[0].preview).toContain("宝塔镇河妖");
  });

  it("strips Feishu metadata envelopes from the session search preview", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = "agent:main:feishu:direct:ou_d249239ddfd11c4c3c4f5f1581c97a58";
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773733112684,
        sessionId: "feishu-preview",
        lastChannel: "feishu",
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "feishu-preview.jsonl"),
      [
        JSON.stringify({ type: "session", id: "feishu-preview", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Conversation info (untrusted metadata):",
                  "```json",
                  "{\"message_id\":\"om_x100\",\"sender_id\":\"ou_d249239ddfd11c4c3c4f5f1581c97a58\"}",
                  "```",
                  "",
                  "Sender (untrusted metadata):",
                  "```json",
                  "{\"label\":\"ou_d249239ddfd11c4c3c4f5f1581c97a58\"}",
                  "```",
                  "",
                  "[message_id: om_x100]",
                  "ou_d249239ddfd11c4c3c4f5f1581c97a58: 肥水",
                ].join("\n"),
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "feishu",
      limit: 12,
      term: "",
    });

    expect(results).toHaveLength(1);
    expect(results[0].preview).toBe("肥水");
  });

  it("returns native WeCom sessions and formats their display session id", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = "agent:main:wecom:direct:marila";
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773738213334,
        sessionId: "wecom-session",
        lastChannel: "wecom",
        origin: {
          label: "user:marila",
          provider: "wecom",
          surface: "wecom",
          to: "wecom:marila",
        },
        deliveryContext: {
          channel: "wecom",
          to: "wecom:marila",
          accountId: "default",
        },
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "wecom-session.jsonl"),
      [
        JSON.stringify({ type: "session", id: "wecom-session", timestamp: "2026-03-17T09:03:16.146Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T09:03:16.156Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "宝塔镇河妖",
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "wecom",
      limit: 12,
      term: "宝塔镇河妖",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sessionUser).toBe(sessionKey);
    expect(results[0].displaySessionUser).toBe("wecom:direct:marila");
    expect(results[0].title).toBe("marila");
    expect(results[0].preview).toContain("宝塔镇河妖");
  });

  it("returns native Weixin sessions and formats their display session id", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = "agent:main:openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat";
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773733112684,
        sessionId: "weixin-session",
        lastChannel: "openclaw-weixin",
        origin: {
          label: "Marila 微信",
          provider: "openclaw-weixin",
          surface: "weixin",
          to: "o9cq807-naavqdpr-tmdjv3v8bck@im.wechat",
        },
        deliveryContext: {
          channel: "openclaw-weixin",
          to: "o9cq807-naavqdpr-tmdjv3v8bck@im.wechat",
          accountId: "default",
        },
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "weixin-session.jsonl"),
      [
        JSON.stringify({ type: "session", id: "weixin-session", timestamp: "2026-03-17T04:40:00.000Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T04:49:46.186Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: "宝塔镇河妖",
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "openclaw-weixin",
      limit: 12,
      term: "宝塔镇河妖",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sessionUser).toBe(sessionKey);
    expect(results[0].displaySessionUser).toBe("openclaw-weixin:direct:o9cq807-naavqdpr-tmdjv3v8bck@im.wechat");
    expect(results[0].title).toBe("Marila 微信");
    expect(results[0].preview).toContain("宝塔镇河妖");
  });

  it("strips WeCom metadata envelopes from the session search preview", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-search-"));
    tempDirs.push(rootDir);
    const sessionsDir = path.join(rootDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = "agent:main:wecom:direct:marila";
    const sessions = {
      [sessionKey]: {
        updatedAt: 1773738213334,
        sessionId: "wecom-preview",
        lastChannel: "wecom",
      },
    };

    fs.writeFileSync(path.join(sessionsDir, "sessions.json"), JSON.stringify(sessions), "utf8");
    fs.writeFileSync(
      path.join(sessionsDir, "wecom-preview.jsonl"),
      [
        JSON.stringify({ type: "session", id: "wecom-preview", timestamp: "2026-03-17T09:03:16.146Z" }),
        JSON.stringify({
          type: "message",
          timestamp: "2026-03-17T09:03:16.156Z",
          message: {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Conversation info (untrusted metadata):",
                  "```json",
                  "{\"message_id\":\"44e64d31\",\"sender_id\":\"marila\",\"sender\":\"marila\"}",
                  "```",
                  "",
                  "Sender (untrusted metadata):",
                  "```json",
                  "{\"label\":\"marila\",\"id\":\"marila\"}",
                  "```",
                  "",
                  "hi",
                ].join("\n"),
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const projector = createTestProjector(rootDir);
    const results = projector.searchSessionsForAgent("main", {
      channel: "wecom",
      limit: 12,
      term: "",
    });

    expect(results).toHaveLength(1);
    expect(results[0].preview).toBe("hi");
  });
});

describe("collectConversationMessages", () => {
  it("drops delivery-mirror assistant echoes even before any replayed inbound user turn arrives", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-03-19T04:54:58.000Z",
          message: {
            role: "assistant",
            model: "delivery-mirror",
            timestamp: 1773867298000,
            content: [{ type: "text", text: "marila：f安琪儿" }],
          },
        },
        {
          type: "message",
          timestamp: "2026-03-19T04:55:00.000Z",
          message: {
            role: "assistant",
            timestamp: 1773867300000,
            content: [{ type: "text", text: "[[reply_to_current]] 你是想让我处理安琪儿相关的事情？" }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "assistant",
          content: "你是想让我处理安琪儿相关的事情？",
          timestamp: 1773867300000,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("drops Feishu mirrored assistant echoes and their replayed inbound user turns", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-03-17T08:04:02.489Z",
          message: {
            role: "assistant",
            timestamp: 1773734642489,
            content: [{ type: "text", text: "marila：来自lalaclaw" }],
          },
        },
        {
          type: "message",
          timestamp: "2026-03-17T08:04:04.912Z",
          message: {
            role: "user",
            timestamp: 1773734644912,
            content: [{ type: "text", text: "[Tue 2026-03-17 16:04 GMT+8] marila：来自lalaclaw" }],
          },
        },
        {
          type: "message",
          timestamp: "2026-03-17T08:04:04.914Z",
          message: {
            role: "assistant",
            timestamp: 1773734644914,
            content: [{ type: "text", text: "[[reply_to_current]] 收到。你继续说。" }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "user",
          content: "来自lalaclaw",
          timestamp: 1773734644912,
        },
        {
          role: "assistant",
          content: "收到。你继续说。",
          timestamp: 1773734644914,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("drops Feishu mirrored assistant echoes that add an operator prefix before the replayed user turn", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-03-17T08:25:51.239Z",
          message: {
            role: "assistant",
            timestamp: 1773735951239,
            content: [{ type: "text", text: "marila：皮蛋" }],
          },
        },
        {
          type: "message",
          timestamp: "2026-03-17T08:25:53.694Z",
          message: {
            role: "user",
            timestamp: 1773735953694,
            content: [{ type: "text", text: "[Tue 2026-03-17 16:25 GMT+8] 皮蛋" }],
          },
        },
        {
          type: "message",
          timestamp: "2026-03-17T08:26:13.534Z",
          message: {
            role: "assistant",
            timestamp: 1773735973534,
            content: [{ type: "text", text: "[[reply_to_current]] 收到，皮蛋。\n你们这是今天统一用蛋系代号是吧。要办啥，直接说。" }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "user",
          content: "皮蛋",
          timestamp: 1773735953694,
        },
        {
          role: "assistant",
          content: "收到，皮蛋。\n你们这是今天统一用蛋系代号是吧。要办啥，直接说。",
          timestamp: 1773735973534,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("strips queued busy wrappers from inbound Feishu follow-up prompts", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-03-19T05:36:50.000Z",
          message: {
            role: "user",
            timestamp: 1773879410000,
            content: [{
              type: "text",
              text: [
                "[Queued messages while agent was busy]",
                "",
                "---",
                "Queued #1",
                "Conversation info (untrusted metadata):",
                "```json",
                "{",
                '  "message_id": "om_x100b5485e2007ca0b366563c7c2cd35",',
                '  "sender_id": "ou_d249239ddfd11c4c3c4f5f1581c97a58"',
                "}",
                "```",
                "",
                "Sender (untrusted metadata):",
                "```json",
                "{",
                '  "label": "ou_d249239ddfd11c4c3c4f5f1581c97a58"',
                "}",
                "```",
                "",
                "[message_id: om_x100b5485e2007ca0b366563c7c2cd35]",
                "ou_d249239ddfd11c4c3c4f5f1581c97a58: 今天吧",
              ].join("\n"),
            }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "user",
          content: "今天吧",
          timestamp: 1773879410000,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("keeps queued busy batches readable by flattening each queued inbound item", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-03-19T05:37:20.000Z",
          message: {
            role: "user",
            timestamp: 1773879440000,
            content: [{
              type: "text",
              text: [
                "[Queued messages while agent was busy]",
                "",
                "2 messages queued while the current run was still working.",
                "",
                "---",
                "Queued #1",
                "Conversation info (untrusted metadata):",
                "```json",
                '{"message_id":"om_x101"}',
                "```",
                "",
                "[message_id: om_x101]",
                "ou_d249239ddfd11c4c3c4f5f1581c97a58: 第一条",
                "",
                "---",
                "Queued #2",
                "Conversation info (untrusted metadata):",
                "```json",
                '{"message_id":"om_x102"}',
                "```",
                "",
                "[message_id: om_x102]",
                "ou_d249239ddfd11c4c3c4f5f1581c97a58: 第二条",
              ].join("\n"),
            }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "user",
          content: "第一条\n\n第二条",
          timestamp: 1773879440000,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("projects aborted-run wrappers into a system note plus the real Weixin follow-up prompt", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-04-01T06:58:43.924Z",
          message: {
            role: "user",
            timestamp: 1775026723922,
            content: [{
              type: "text",
              text: [
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
            }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "system",
          content: "Note: The previous agent run was aborted by the user. Resume carefully or ask for clarification.",
          timestamp: 1775026723922,
        },
        {
          role: "user",
          content: "好了吗",
          timestamp: 1775026723922,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("converts inbound Weixin image wrappers into structured attachments and drops generated helper text", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-conversation-"));
    try {
      const projector = createTestProjector(rootDir);
      const mediaPath = "/Users/marila/.openclaw/media/inbound/74d991a4-9848-40b7-8c86-2a7673517083.jpg";

      const conversation = projector.collectConversationMessages([
        {
          type: "message",
          timestamp: "2026-03-24T06:23:58.000Z",
          message: {
            role: "user",
            timestamp: 1774304638000,
            content: [{
              type: "text",
              text: [
                `[media attached: ${mediaPath} (image/*)] To send an image back, prefer the message tool (media/path/filePath).`,
                "If you must inline, use MEDIA:https://example.com/image.jpg (spaces ok, quote if needed) or a safe relative path like MEDIA:./image.jpg.",
                "Avoid absolute paths (MEDIA:/...) and ~ paths - they are blocked for security. Keep caption in the text body.",
                "System: [2026-03-24 06:15:43 GMT+8] Exec completed (neat-mea, code 0) :: BASE_SIZE (1024, 1024)",
                "IMAGE_SAVED:/tmp/bird_shirt_dingtalk_square_1774304100.png TEXT: OUT_SIZE (1024, 1024)",
                "",
                "Conversation info (untrusted metadata):",
                "```json",
                "{",
                '  "message_id": "openclaw-weixin:1774304638228-baa39fc9",',
                '  "timestamp": "Tue 2026-03-24 06:23 GMT+8"',
                "}",
                "```",
              ].join("\n"),
            }],
          },
        },
      ]);

      expect(conversation).toEqual([
        {
          role: "user",
          content: "",
          attachments: [
            {
              kind: "image",
              mimeType: "image/*",
              name: "74d991a4-9848-40b7-8c86-2a7673517083.jpg",
              path: "/Users/marila/.openclaw/media/inbound/74d991a4-9848-40b7-8c86-2a7673517083.jpg",
              fullPath: "/Users/marila/.openclaw/media/inbound/74d991a4-9848-40b7-8c86-2a7673517083.jpg",
            },
          ],
          timestamp: 1774304638000,
        },
      ]);
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
