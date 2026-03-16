import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const cli = require("../bin/lalaclaw.js");

describe("LalaClaw CLI helpers", () => {
  it("parses commands, config-file options, and JSON output mode", () => {
    const parsed = cli.parseArgs(["doctor", "--config-file", "./tmp/dev.env", "--defaults", "--json"]);

    expect(parsed.command).toBe("doctor");
    expect(parsed.options.defaults).toBe(true);
    expect(parsed.options.json).toBe(true);
    expect(parsed.options.configFile).toBe(path.resolve(process.cwd(), "./tmp/dev.env"));
  });

  it("parses write-example mode for init", () => {
    const parsed = cli.parseArgs(["init", "--write-example", "--config-file", "./tmp/example.env"]);

    expect(parsed.command).toBe("init");
    expect(parsed.options.writeExample).toBe(true);
    expect(parsed.options.configFile).toBe(path.resolve(process.cwd(), "./tmp/example.env"));
  });

  it("parses non-interactive init overrides", () => {
    const parsed = cli.parseArgs([
      "init",
      "--defaults",
      "--profile",
      "remote-gateway",
      "--host",
      "0.0.0.0",
      "--port",
      "3100",
      "--frontend-port",
      "5200",
      "--base-url",
      "https://gateway.example.com",
      "--api-key",
      "secret",
      "--model",
      "openclaw-pro",
      "--agent-id",
      "ops",
      "--api-style",
      "responses",
      "--api-path",
      "/v1/responses",
    ]);

    expect(parsed.command).toBe("init");
    expect(parsed.options).toMatchObject({
      defaults: true,
      profile: "remote-gateway",
      host: "0.0.0.0",
      backendPort: "3100",
      frontendPort: "5200",
      openclawBaseUrl: "https://gateway.example.com",
      openclawApiKey: "secret",
      openclawModel: "openclaw-pro",
      openclawAgentId: "ops",
      openclawApiStyle: "responses",
      openclawApiPath: "/v1/responses",
    });
  });

  it("derives local-openclaw config from the detected local setup", () => {
    const localOpenClaw = {
      exists: true,
      path: "/Users/example/.openclaw/openclaw.json",
      token: "token-123",
      defaultAgentId: "planner",
      defaultModel: "openclaw-pro",
    };

    expect(cli.resolveRuntimeProfile({}, localOpenClaw)).toBe("local-openclaw");
    expect(cli.resolveConfig({}, localOpenClaw)).toMatchObject({
      profile: "local-openclaw",
      host: "127.0.0.1",
      backendPort: "3000",
      frontendPort: "5173",
      openclawAgentId: "planner",
      openclawModel: "openclaw-pro",
      openclawApiStyle: "chat",
      openclawApiPath: "/v1/chat/completions",
    });
  });

  it("derives remote gateway config from explicit env values", () => {
    const config = cli.resolveConfig(
      {
        HOST: "0.0.0.0",
        PORT: "3100",
        FRONTEND_HOST: "127.0.0.1",
        FRONTEND_PORT: "5200",
        OPENCLAW_BASE_URL: "https://gateway.example.com",
        OPENCLAW_API_KEY: "secret",
        OPENCLAW_MODEL: "openclaw-remote",
        OPENCLAW_AGENT_ID: "ops",
        OPENCLAW_API_STYLE: "responses",
        OPENCLAW_API_PATH: "/v1/responses",
      },
      {
        exists: false,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "",
        defaultAgentId: "main",
        defaultModel: "openclaw",
      },
    );

    expect(config).toMatchObject({
      profile: "remote-gateway",
      host: "0.0.0.0",
      backendPort: "3100",
      frontendPort: "5200",
      openclawBaseUrl: "https://gateway.example.com",
      openclawApiStyle: "responses",
      openclawApiPath: "/v1/responses",
    });
  });

  it("applies explicit config overrides on top of detected values", () => {
    const nextConfig = cli.applyConfigOverrides(
      {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "local-openclaw",
        commandCenterForceMock: "0",
        openclawBaseUrl: "",
        openclawApiKey: "",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      {
        profile: "mock",
        backendPort: "3900",
        frontendPort: "5300",
      },
    );

    expect(nextConfig).toMatchObject({
      profile: "mock",
      commandCenterForceMock: "1",
      backendPort: "3900",
      frontendPort: "5300",
      openclawApiPath: "/v1/chat/completions",
    });
  });

  it("updates the default API path when only the API style changes", () => {
    const nextConfig = cli.applyConfigOverrides(
      {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "remote-gateway",
        commandCenterForceMock: "0",
        openclawBaseUrl: "https://gateway.example.com",
        openclawApiKey: "secret",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      {
        openclawApiStyle: "responses",
      },
    );

    expect(nextConfig.openclawApiStyle).toBe("responses");
    expect(nextConfig.openclawApiPath).toBe("/v1/responses");
  });

  it("renders an env file for mock mode with stable defaults", () => {
    const output = cli.renderEnvFile({
      host: "127.0.0.1",
      backendPort: "3000",
      frontendHost: "127.0.0.1",
      frontendPort: "5173",
      profile: "mock",
      openclawModel: "openclaw",
      openclawAgentId: "main",
      openclawApiStyle: "chat",
      openclawApiPath: "/v1/chat/completions",
    });

    expect(output).toContain("COMMANDCENTER_FORCE_MOCK=1");
    expect(output).toContain("OPENCLAW_MODEL=openclaw");
    expect(output).toContain("# OPENCLAW_BASE_URL=");
  });

  it("reads the checked-in example env template", () => {
    const template = cli.readExampleEnvTemplate();

    expect(template).toContain("HOST=127.0.0.1");
    expect(template).toContain("OPENCLAW_MODEL=openclaw");
    expect(fs.existsSync(cli.EXAMPLE_ENV_FILE)).toBe(true);
  });

  it("reports validation errors for an invalid remote gateway config", () => {
    const issues = cli.validateConfig(
      {
        host: "",
        backendPort: "99999",
        frontendHost: "",
        frontendPort: "abc",
        profile: "remote-gateway",
        openclawBaseUrl: "ftp://gateway.example.com",
        openclawApiKey: "",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "invalid",
        openclawApiPath: "v1/responses",
      },
      {
        exists: false,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "",
      },
    );

    expect(issues.errors).toEqual(
      expect.arrayContaining([
        "HOST is required.",
        "FRONTEND_HOST is required.",
        "PORT must be an integer between 1 and 65535. Received: 99999",
        "FRONTEND_PORT must be an integer between 1 and 65535. Received: abc",
        'OPENCLAW_API_STYLE must be "chat" or "responses". Received: invalid',
        'OPENCLAW_API_PATH must start with "/". Received: v1/responses',
        "OPENCLAW_BASE_URL must use http or https. Received: ftp://gateway.example.com",
      ]),
    );
    expect(issues.warnings).toContain("OPENCLAW_API_KEY is empty. Some remote gateways require a token.");
  });

  it("accepts a valid local-openclaw config and emits a helpful note", () => {
    const issues = cli.validateConfig(
      {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "local-openclaw",
        openclawBaseUrl: "",
        openclawApiKey: "",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      {
        exists: true,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "token-123",
      },
      "/usr/local/bin/openclaw",
    );

    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([]);
    expect(issues.notes).toContain("Using local OpenClaw config from /Users/example/.openclaw/openclaw.json.");
  });

  it("requires the openclaw CLI for a local-openclaw profile", () => {
    const issues = cli.validateConfig(
      {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "local-openclaw",
        openclawBaseUrl: "",
        openclawApiKey: "",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      {
        exists: true,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "token-123",
      },
      "",
    );

    expect(issues.errors).toContain(
      "Local OpenClaw profile selected, but the `openclaw` CLI was not found. Install it or set OPENCLAW_BIN.",
    );
  });

  it("probes a remote gateway health endpoint successfully", async () => {
    const result = await cli.probeOpenClawGateway(
      {
        profile: "remote-gateway",
        openclawBaseUrl: "https://gateway.example.com",
        openclawApiKey: "secret",
      },
      async (url, options) => {
        expect(url).toBe("https://gateway.example.com/healthz");
        expect(options.headers.Authorization).toBe("Bearer secret");
        return { ok: true, status: 200 };
      },
    );

    expect(result.ok).toBe(true);
    expect(result.endpoint).toBe("health");
    expect(result.status).toBe(200);
  });

  it("reports credential errors from a remote gateway probe", async () => {
    const result = await cli.probeOpenClawGateway(
      {
        profile: "remote-gateway",
        openclawBaseUrl: "https://gateway.example.com",
        openclawApiKey: "wrong-token",
      },
      async () => ({ ok: false, status: 401 }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("rejected credentials");
    expect(result.status).toBe(401);
  });

  it("builds a lightweight chat-style runtime validation request", () => {
    const request = cli.buildRemoteValidationRequest({
      openclawBaseUrl: "https://gateway.example.com",
      openclawApiKey: "secret",
      openclawAgentId: "main",
      openclawModel: "openclaw",
      openclawApiStyle: "chat",
      openclawApiPath: "/v1/chat/completions",
    });

    expect(request.endpoint).toBe("https://gateway.example.com/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer secret");
    expect(request.headers["x-openclaw-agent-id"]).toBe("main");
    expect(request.payload).toMatchObject({
      model: "openclaw",
      max_tokens: 1,
      user: "lalaclaw-doctor",
      stream: false,
    });
  });

  it("builds a lightweight responses-style runtime validation request", () => {
    const request = cli.buildRemoteValidationRequest({
      openclawBaseUrl: "https://gateway.example.com",
      openclawApiKey: "secret",
      openclawAgentId: "ops",
      openclawModel: "openclaw-pro",
      openclawApiStyle: "responses",
      openclawApiPath: "/v1/responses",
    });

    expect(request.endpoint).toBe("https://gateway.example.com/v1/responses");
    expect(request.headers["x-openclaw-agent-id"]).toBe("ops");
    expect(request.payload).toMatchObject({
      model: "openclaw-pro",
      max_output_tokens: 1,
    });
  });

  it("accepts a successful remote runtime validation request", async () => {
    const result = await cli.validateRemoteRuntimeConfig(
      {
        profile: "remote-gateway",
        openclawBaseUrl: "https://gateway.example.com",
        openclawApiKey: "secret",
        openclawAgentId: "main",
        openclawModel: "openclaw",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      async (url, options) => {
        expect(url).toBe("https://gateway.example.com/v1/chat/completions");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toMatchObject({ model: "openclaw", max_tokens: 1 });
        return {
          ok: true,
          status: 200,
        };
      },
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Remote model openclaw and agent main were accepted");
  });

  it("reports remote runtime validation failures for rejected model or agent ids", async () => {
    const result = await cli.validateRemoteRuntimeConfig(
      {
        profile: "remote-gateway",
        openclawBaseUrl: "https://gateway.example.com",
        openclawApiKey: "secret",
        openclawAgentId: "missing-agent",
        openclawModel: "missing-model",
        openclawApiStyle: "responses",
        openclawApiPath: "/v1/responses",
      },
      async () => ({
        ok: false,
        status: 400,
        text: async () => '{"error":"unknown agent or model"}',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toContain("unknown agent or model");
  });

  it("builds a doctor report that can be serialized to JSON", () => {
    const report = cli.buildDoctorReport({
      envFilePath: "/tmp/.env.local",
      envFileExists: true,
      nodeVersion: "22.22.0",
      nodeMatches: true,
      localOpenClaw: {
        exists: true,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "token-123",
        workspaceRoot: "/Users/example/.openclaw/workspace",
      },
      openclawBinary: "/usr/local/bin/openclaw",
      frontendPortFree: true,
      backendPortFree: false,
      config: {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "remote-gateway",
        openclawBaseUrl: "https://gateway.example.com",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      validation: {
        errors: [],
        warnings: ["OPENCLAW_API_KEY is empty. Some remote gateways require a token."],
        notes: [],
      },
      gatewayProbe: {
        ok: true,
        message: "Remote gateway responded from https://gateway.example.com/healthz with HTTP 200.",
      },
      remoteValidation: {
        ok: true,
        message: "Remote model openclaw and agent main were accepted by https://gateway.example.com/v1/chat/completions.",
      },
    });

    expect(report).toMatchObject({
      envFilePath: "/tmp/.env.local",
      envFileExists: true,
      node: {
        version: "22.22.0",
        matches: true,
      },
      localOpenClaw: {
        exists: true,
        tokenDetected: true,
      },
      ports: {
        backend: {
          available: false,
        },
      },
      runtime: {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "remote-gateway",
        gatewayUrl: "https://gateway.example.com",
      },
      summary: {
        status: "warn",
        exitCode: 0,
        warningCount: 2,
        errorCount: 0,
      },
      probes: {
        gateway: {
          ok: true,
        },
        runtime: {
          ok: true,
        },
      },
    });
  });

  it("marks doctor summary as error when runtime validation fails", () => {
    const report = cli.buildDoctorReport({
      envFilePath: "/tmp/.env.local",
      envFileExists: true,
      nodeVersion: "22.22.0",
      nodeMatches: true,
      localOpenClaw: {
        exists: false,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "",
        workspaceRoot: "",
      },
      openclawBinary: "",
      frontendPortFree: true,
      backendPortFree: true,
      config: {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "remote-gateway",
        openclawBaseUrl: "https://gateway.example.com",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      validation: {
        errors: [],
        warnings: [],
        notes: [],
      },
      gatewayProbe: {
        ok: true,
        message: "Remote gateway responded from https://gateway.example.com/healthz with HTTP 200.",
      },
      remoteValidation: {
        ok: false,
        message: "Remote runtime validation failed at https://gateway.example.com/v1/chat/completions with HTTP 404.",
      },
    });

    expect(report.summary).toMatchObject({
      status: "error",
      exitCode: 1,
      warningCount: 0,
      errorCount: 1,
    });
    expect(report.summary.errors[0]).toContain("Remote runtime validation failed");
  });
});
