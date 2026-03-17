import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createOpenClawClient } = require("../server/services");

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
    loadGatewaySdk: overrides.loadGatewaySdk,
  });
}

describe("createOpenClawClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("dispatches fast text-only conversations through the direct HTTP API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: "快速输出", usage: { total_tokens: 9 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const execFileAsync = vi.fn();
    const client = createClient({ execFileAsync });
    const result = await client.dispatchOpenClaw(
      [{ role: "user", content: "快一点" }],
      true,
      "command-center",
    );

    expect(result).toEqual({
      outputText: "快速输出",
      usage: { total_tokens: 9 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it("retries a transient gateway connection refusal before succeeding", async () => {
    vi.useFakeTimers();
    const connectionError = new TypeError("fetch failed");
    connectionError.cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:18789"), {
      code: "ECONNREFUSED",
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: "重连成功", usage: { total_tokens: 3 } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    const resultPromise = client.dispatchOpenClaw(
      [{ role: "user", content: "快一点" }],
      true,
      "command-center",
    );

    await vi.advanceTimersByTimeAsync(250);

    await expect(resultPromise).resolves.toEqual({
      outputText: "重连成功",
      usage: { total_tokens: 3 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("streams text-only conversations through gateway chat events", async () => {
    const deltas = [];
    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");
        expect(params).toMatchObject({
          sessionKey: "main:command-center",
          message: "继续",
          thinking: "medium",
        });

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "流式" }],
              },
            },
          });
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "流式输出" }],
              },
            },
          });
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "流式输出" }],
              },
            },
          });
        });

        return {
          runId: params.idempotencyKey,
          status: "started",
        };
      }
    }

    const client = createClient({
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const result = await client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        thinkMode: "medium",
        onDelta: (delta) => deltas.push(delta),
      },
    );

    expect(deltas).toEqual(["流式", "输出"]);
    expect(result).toEqual({
      outputText: "流式输出",
      usage: null,
    });
  });

  it("falls back to polling the same run instead of starting a duplicate run", async () => {
    const deltas = [];
    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "流式" }],
              },
            },
          });
          this.opts.onClose?.(1011, "stream interrupted");
        });

        return {
          runId: params.idempotencyKey,
          acceptedAt: 123,
          status: "started",
        };
      }
    }

    const execFileAsync = vi
      .fn()
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: "completed" }) })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          messages: [
            {
              role: "assistant",
              timestamp: 125,
              content: [{ type: "text", text: "流式输出" }],
              usage: { output_tokens: 7 },
            },
          ],
        }),
      });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const result = await client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    expect(deltas).toEqual(["流式", "输出"]);
    expect(result).toEqual({
      outputText: "流式输出",
      usage: { output_tokens: 7 },
    });
    expect(execFileAsync).toHaveBeenCalledTimes(2);
    expect(execFileAsync.mock.calls[0][1]).toContain("agent.wait");
    expect(execFileAsync.mock.calls[1][1]).toContain("chat.history");
    expect(execFileAsync.mock.calls.flatMap((call) => call[1])).not.toContain("agent");
  });

  it("fills in silent stream gaps by polling the session history before the final event arrives", async () => {
    vi.useFakeTimers();
    const deltas = [];

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "流式" }],
              },
            },
          });
        });

        setTimeout(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "流式输出" }],
              },
            },
          });
        }, 6000);

        return {
          runId: params.idempotencyKey,
          acceptedAt: 123,
          status: "started",
        };
      }
    }

    const execFileAsync = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        messages: [
          {
            role: "assistant",
            timestamp: 125,
            content: [{ type: "text", text: "流式输出" }],
            usage: { output_tokens: 7 },
          },
        ],
      }),
    });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(deltas).toEqual(["流式", "输出"]);
    expect(result.outputText).toBe("流式输出");
    expect(execFileAsync).toHaveBeenCalled();
    expect(execFileAsync.mock.calls.flatMap((call) => call[1])).toContain("chat.history");
  });

  it("does not reuse a stale assistant reply from an older turn while filling a silent stream gap", async () => {
    vi.useFakeTimers();
    const deltas = [];

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新" }],
              },
            },
          });
        });

        setTimeout(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新回答" }],
              },
            },
          });
        }, 6000);

        return {
          runId: params.idempotencyKey,
          acceptedAt: 2_000,
          status: "started",
        };
      }
    }

    const execFileAsync = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        messages: [
          {
            role: "assistant",
            timestamp: "2026-03-16T07:07:00.000Z",
            content: [{ type: "text", text: "旧回答" }],
            usage: { output_tokens: 7 },
          },
          {
            role: "assistant",
            timestamp: "2026-03-16T07:07:05.000Z",
            content: [{ type: "text", text: "新回答" }],
            usage: { output_tokens: 9 },
          },
        ],
      }),
    });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(deltas).toEqual(["新", "回答"]);
    expect(result.outputText).toBe("新回答");
  });

  it("fills a silent stream gap from the assistant that follows the current user turn even when timestamps are missing", async () => {
    vi.useFakeTimers();
    const deltas = [];

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新" }],
              },
            },
          });
        });

        setTimeout(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新回答" }],
              },
            },
          });
        }, 6000);

        return {
          runId: params.idempotencyKey,
          acceptedAt: 2_000,
          status: "started",
        };
      }
    }

    const execFileAsync = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        messages: [
          {
            role: "user",
            timestamp: "2026-03-16T07:06:55.000Z",
            content: [{ type: "text", text: "旧问题" }],
          },
          {
            role: "assistant",
            timestamp: "2026-03-16T07:07:00.000Z",
            content: [{ type: "text", text: "旧回答" }],
          },
          {
            role: "user",
            timestamp: "2026-03-16T07:07:04.000Z",
            content: [{ type: "text", text: "继续" }],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "新回答" }],
            usage: { output_tokens: 9 },
          },
        ],
      }),
    });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(deltas).toEqual(["新", "回答"]);
    expect(result.outputText).toBe("新回答");
  });

  it("does not reuse chat history from an older turn when the current user turn is not yet present in history", async () => {
    vi.useFakeTimers();
    const deltas = [];

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新" }],
              },
            },
          });
        });

        setTimeout(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新回答" }],
              },
            },
          });
        }, 6000);

        return {
          runId: params.idempotencyKey,
          acceptedAt: 2_000,
          status: "started",
        };
      }
    }

    const execFileAsync = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        messages: [
          {
            role: "user",
            timestamp: "2026-03-16T07:06:55.000Z",
            content: [{ type: "text", text: "旧问题" }],
          },
          {
            role: "assistant",
            timestamp: "2026-03-16T07:07:00.000Z",
            content: [{ type: "text", text: "旧回答" }],
          },
        ],
      }),
    });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(deltas).toEqual(["新", "回答"]);
    expect(result.outputText).toBe("新回答");
  });

  it("does not reuse an older identical prompt turn before the current prompt is persisted", async () => {
    vi.useFakeTimers();
    const deltas = [];

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新" }],
              },
            },
          });
        });

        setTimeout(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "新回答" }],
              },
            },
          });
        }, 6000);

        return {
          runId: params.idempotencyKey,
          acceptedAt: 2_000,
          status: "started",
        };
      }
    }

    const execFileAsync = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        messages: [
          {
            role: "user",
            timestamp: "2026-03-16T07:06:55.000Z",
            content: [{ type: "text", text: "继续" }],
          },
          {
            role: "assistant",
            timestamp: "2026-03-16T07:07:00.000Z",
            content: [{ type: "text", text: "旧回答" }],
          },
        ],
      }),
    });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(deltas).toEqual(["新", "回答"]);
    expect(result.outputText).toBe("新回答");
  });

  it("surfaces an aborted session during silent polling instead of waiting for the stream timeout", async () => {
    vi.useFakeTimers();

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");
        return {
          runId: params.idempotencyKey,
          acceptedAt: 2_000,
          status: "started",
        };
      }
    }

    const execFileAsync = vi.fn(async (_cmd, args) => {
      if (args.includes("agent.wait")) {
        return {
          stdout: JSON.stringify({
            status: "aborted",
            error: "Request was aborted",
          }),
        };
      }

      if (args.includes("chat.history")) {
        return {
          stdout: JSON.stringify({
            messages: [],
          }),
        };
      }

      throw new Error(`Unexpected gateway call: ${args.join(" ")}`);
    });

    const client = createClient({
      execFileAsync,
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "查看一下 ~/projects/wudaokou 这个目录下的文件" }],
      false,
      "command-center",
    );
    const rejection = expect(promise).rejects.toThrow("Request was aborted");

    await vi.advanceTimersByTimeAsync(1600);

    await rejection;
    expect(execFileAsync.mock.calls.some(([, args]) => args.includes("agent.wait"))).toBe(true);
    expect(execFileAsync.mock.calls.some(([, args]) => args.includes("chat.history"))).toBe(true);
  });

  it("ignores unrelated run ids on the same session stream", async () => {
    vi.useFakeTimers();
    const deltas = [];

    class FakeGatewayClient {
      constructor(opts) {
        this.opts = opts;
      }

      start() {
        queueMicrotask(() => this.opts.onHelloOk?.({}));
      }

      stop() {}

      async request(method, params) {
        expect(method).toBe("chat.send");

        queueMicrotask(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "前半段" }],
              },
            },
          });
        });

        setTimeout(() => {
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: "replayed-run-id",
              sessionKey: params.sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "串线内容" }],
              },
            },
          });
          this.opts.onEvent?.({
            event: "chat",
            payload: {
              runId: params.idempotencyKey,
              sessionKey: params.sessionKey,
              state: "final",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "前半段后半段" }],
              },
            },
          });
        }, 10);

        return {
          runId: params.idempotencyKey,
          acceptedAt: 2_000,
          status: "started",
        };
      }
    }

    const client = createClient({
      loadGatewaySdk: async () => ({
        GatewayClient: FakeGatewayClient,
        GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "gateway-client" },
        GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
        VERSION: "test-version",
      }),
    });

    const promise = client.dispatchOpenClawStream(
      [{ role: "user", content: "继续" }],
      false,
      "command-center",
      {
        onDelta: (delta) => deltas.push(delta),
      },
    );

    await vi.advanceTimersByTimeAsync(20);

    const result = await promise;

    expect(deltas).toEqual(["前半段", "后半段"]);
    expect(result.outputText).toBe("前半段后半段");
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
