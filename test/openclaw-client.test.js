import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createOpenClawClient } = require("../server/openclaw-client");

function createClient(overrides = {}) {
  return createOpenClawClient({
    config: overrides.config || {
      mode: "openclaw",
      baseUrl: "http://127.0.0.1:18789",
      apiKey: "secret",
      apiPath: "/v1/chat/completions",
      apiStyle: "chat",
      browserControlPort: 18791,
      logsDir: "/tmp/logs",
    },
    execFileAsync: overrides.execFileAsync || vi.fn(),
    PROJECT_ROOT: overrides.PROJECT_ROOT || process.cwd(),
    OPENCLAW_BIN: overrides.OPENCLAW_BIN || "openclaw",
    clip: overrides.clip || ((value, length = 999) => String(value || "").slice(0, length)),
    normalizeSessionUser: overrides.normalizeSessionUser || ((value) => String(value || "")),
    normalizeChatMessage: overrides.normalizeChatMessage || ((message) => {
      if (typeof message === "string") return message;
      if (Array.isArray(message?.content)) {
        return message.content
          .filter((item) => item?.type === "text")
          .map((item) => item.text || "")
          .join("\n")
          .trim();
      }
      return String(message?.content || "");
    }),
    getMessageAttachments: overrides.getMessageAttachments || ((message) => message.attachments || []),
    describeAttachmentForModel: overrides.describeAttachmentForModel || ((attachment) => attachment.name || attachment.kind || ""),
    buildOpenClawMessageContent: overrides.buildOpenClawMessageContent || ((message) => message.content),
    getCommandCenterSessionKey: overrides.getCommandCenterSessionKey || ((agentId, sessionUser) => `${agentId}:${sessionUser}`),
    resolveSessionAgentId: overrides.resolveSessionAgentId || (() => "main"),
    resolveSessionModel: overrides.resolveSessionModel || (() => "gpt-5"),
    readTextIfExists: overrides.readTextIfExists || (() => ""),
    tailLines: overrides.tailLines || (() => []),
  });
}

describe("createOpenClawClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches image attachments through the direct HTTP API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: "已分析图片", usage: { total_tokens: 12 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    const result = await client.dispatchOpenClaw(
      [
        {
          role: "user",
          content: "看这张图",
          attachments: [{ kind: "image", dataUrl: "data:image/png;base64,AAAA", name: "screen.png" }],
        },
      ],
      false,
      "command-center",
    );

    expect(result).toEqual({
      outputText: "已分析图片",
      usage: { total_tokens: 12 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18789/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
          "x-openclaw-agent-id": "main",
        }),
      }),
    );
  });

  it("dispatches text-only conversations through gateway session calls", async () => {
    const execFileAsync = vi
      .fn()
      .mockResolvedValueOnce({ stdout: JSON.stringify({ runId: "run-1", acceptedAt: 123 }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: "completed" }) })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          messages: [
            {
              role: "assistant",
              timestamp: 125,
              content: [{ type: "text", text: "会话输出" }],
              usage: { output_tokens: 5 },
            },
          ],
        }),
      });

    const client = createClient({ execFileAsync });
    const result = await client.dispatchOpenClaw(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
    );

    expect(result).toEqual({
      outputText: "会话输出",
      usage: { output_tokens: 5 },
    });
    expect(execFileAsync).toHaveBeenCalledTimes(3);
    expect(execFileAsync.mock.calls[0][1]).toContain("agent");
    expect(execFileAsync.mock.calls[1][1]).toContain("agent.wait");
    expect(execFileAsync.mock.calls[2][1]).toContain("chat.history");
  });

  it("returns mock browser peek details when running outside openclaw mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient({
      config: {
        mode: "mock",
        baseUrl: "http://127.0.0.1:18789",
        apiKey: "",
        apiPath: "/v1/chat/completions",
        apiStyle: "chat",
        browserControlPort: 18791,
        logsDir: "/tmp/logs",
      },
    });

    expect(await client.fetchBrowserPeek()).toEqual({
      summary: "未连接 OpenClaw。",
      items: [{ label: "控制台", value: "当前处于 mock 模式" }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
