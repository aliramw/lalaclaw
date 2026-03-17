/* global afterEach, describe, expect, it */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTranscriptProjector } = require("./transcript");

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
    expect(results[0].sessionUser).toContain("sendername");
  });
});
