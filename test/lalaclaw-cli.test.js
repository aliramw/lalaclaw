import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const cli = require("../bin/lalaclaw.js");
const sourceCheckoutRoot = path.resolve(process.cwd());

describe("LalaClaw CLI helpers", () => {
  it("parses commands, config-file options, and JSON output mode", () => {
    const parsed = cli.parseArgs(["doctor", "--config-file", "./tmp/dev.env", "--defaults", "--json"]);

    expect(parsed.command).toBe("doctor");
    expect(parsed.options.defaults).toBe(true);
    expect(parsed.options.json).toBe(true);
    expect(parsed.options.configFile).toBe(path.resolve(process.cwd(), "./tmp/dev.env"));
  });

  it("parses doctor fix mode", () => {
    const parsed = cli.parseArgs(["doctor", "--fix"]);

    expect(parsed.command).toBe("doctor");
    expect(parsed.options.fix).toBe(true);
  });



  it("supports -h/--help aliases", () => {
    expect(cli.parseArgs(["-h"]).options.help).toBe(true);
    expect(cli.parseArgs(["--help"]).options.help).toBe(true);
  });

  it("supports -v/--version aliases", () => {
    expect(cli.parseArgs(["-v"]).options.version).toBe(true);
    expect(cli.parseArgs(["--version"]).options.version).toBe(true);
    expect(typeof cli.PACKAGE_VERSION).toBe("string");
    expect(cli.PACKAGE_VERSION.length).toBeGreaterThan(0);
  });

  it("parses status and stop commands without extra options", () => {
    expect(cli.parseArgs(["status"]).command).toBe("status");
    expect(cli.parseArgs(["stop"]).command).toBe("stop");
    expect(cli.parseArgs(["restart"]).command).toBe("restart");
  });

  it("parses access token commands and rotate mode", () => {
    expect(cli.parseArgs(["access", "token"]).command).toBe("access token");
    expect(cli.parseArgs(["access", "token", "--rotate"]).options.rotate).toBe(true);
  });

  it("parses write-example mode for init", () => {
    const parsed = cli.parseArgs(["init", "--write-example", "--config-file", "./tmp/example.env"]);

    expect(parsed.command).toBe("init");
    expect(parsed.options.writeExample).toBe(true);
    expect(parsed.options.configFile).toBe(path.resolve(process.cwd(), "./tmp/example.env"));
  });

  it("parses no-background mode for init", () => {
    const parsed = cli.parseArgs(["init", "--no-background"]);

    expect(parsed.command).toBe("init");
    expect(parsed.options.noBackground).toBe(true);
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
      backendPort: "5678",
      frontendPort: "4321",
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

  it("derives token access settings from env values", () => {
    const config = cli.resolveConfig(
      {
        COMMANDCENTER_ACCESS_MODE: "token",
        COMMANDCENTER_ACCESS_TOKENS: "demo-token",
        COMMANDCENTER_ACCESS_TOKENS_FILE: "/tmp/access-tokens.txt",
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
      accessMode: "token",
      accessTokens: "demo-token",
      accessTokensFile: "/tmp/access-tokens.txt",
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

  it("applies a resolved OPENCLAW_BIN only for local-openclaw profiles", () => {
    const logs = [];
    const nextConfig = cli.applyResolvedOpenClawBin(
      {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "local-openclaw",
        openclawBin: "",
        openclawModel: "openclaw",
        openclawAgentId: "main",
        openclawApiStyle: "chat",
        openclawApiPath: "/v1/chat/completions",
      },
      "/Users/example/.npm-global/bin/openclaw",
      "",
      (message) => logs.push(message),
    );

    expect(nextConfig.openclawBin).toBe("/Users/example/.npm-global/bin/openclaw");
    expect(logs).toEqual([
      "INFO  Resolved OpenClaw CLI to /Users/example/.npm-global/bin/openclaw; writing OPENCLAW_BIN for non-interactive launches.",
    ]);
    expect(
      cli.applyResolvedOpenClawBin(
        {
          profile: "mock",
          openclawBin: "",
        },
        "/Users/example/.npm-global/bin/openclaw",
        "",
      ).openclawBin,
    ).toBe("");
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



  it("applies host/port/profile overrides for runtime commands", () => {
    const { childEnv, config } = cli.buildChildEnv(
      "/tmp/does-not-exist.env",
      {
        host: "0.0.0.0",
        backendPort: "3300",
        frontendPort: "5300",
        profile: "mock",
      },
    );

    expect(config.host).toBe("0.0.0.0");
    expect(config.backendPort).toBe("3300");
    expect(config.frontendPort).toBe("5300");
    expect(config.profile).toBe("mock");
    expect(childEnv.HOST).toBe("0.0.0.0");
    expect(childEnv.PORT).toBe("3300");
    expect(childEnv.FRONTEND_PORT).toBe("5300");
    expect(childEnv.COMMANDCENTER_FORCE_MOCK).toBe("1");
  });
  it("renders an env file for mock mode with stable defaults", () => {
    const output = cli.renderEnvFile({
      host: "127.0.0.1",
      backendPort: "3000",
      frontendHost: "127.0.0.1",
      frontendPort: "5173",
      profile: "mock",
      openclawBin: "",
      openclawModel: "openclaw",
      openclawAgentId: "main",
      openclawApiStyle: "chat",
      openclawApiPath: "/v1/chat/completions",
    });

    expect(output).toContain("COMMANDCENTER_FORCE_MOCK=1");
    expect(output).toContain("# OPENCLAW_BIN=");
    expect(output).toContain("OPENCLAW_MODEL=openclaw");
    expect(output).toContain("# OPENCLAW_BASE_URL=");
  });

  it("renders an env file with an explicit OPENCLAW_BIN", () => {
    const output = cli.renderEnvFile({
      host: "127.0.0.1",
      backendPort: "3000",
      frontendHost: "127.0.0.1",
      frontendPort: "5173",
      profile: "local-openclaw",
      openclawBin: "/Users/example/.npm-global/bin/openclaw",
      openclawModel: "openclaw",
      openclawAgentId: "main",
      openclawApiStyle: "chat",
      openclawApiPath: "/v1/chat/completions",
    });

    expect(output).toContain("OPENCLAW_BIN=/Users/example/.npm-global/bin/openclaw");
  });

  it("renders token access settings into the env file", () => {
    const output = cli.renderEnvFile({
      host: "127.0.0.1",
      backendPort: "3000",
      frontendHost: "127.0.0.1",
      frontendPort: "5173",
      profile: "mock",
      openclawBin: "",
      openclawModel: "openclaw",
      openclawAgentId: "main",
      openclawApiStyle: "chat",
      openclawApiPath: "/v1/chat/completions",
      accessMode: "token",
      accessTokens: "demo-token",
      accessTokensFile: "/tmp/access-tokens.txt",
    });

    expect(output).toContain("COMMANDCENTER_ACCESS_MODE=token");
    expect(output).toContain("COMMANDCENTER_ACCESS_TOKENS=demo-token");
    expect(output).toContain("COMMANDCENTER_ACCESS_TOKENS_FILE=/tmp/access-tokens.txt");
  });

  it("reads the checked-in example env template", () => {
    const template = cli.readExampleEnvTemplate();

    expect(template).toContain("HOST=127.0.0.1");
    expect(template).toContain("OPENCLAW_MODEL=openclaw");
    expect(fs.existsSync(cli.EXAMPLE_ENV_FILE)).toBe(true);
  });

  it("resolves the default config directory under XDG config home", () => {
    const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const previousConfigDir = process.env.LALACLAW_CONFIG_DIR;

    process.env.XDG_CONFIG_HOME = "/tmp/lalaclaw-xdg";
    delete process.env.LALACLAW_CONFIG_DIR;

    try {
      expect(cli.resolveDefaultConfigDir()).toBe(path.join("/tmp/lalaclaw-xdg", "lalaclaw"));
    } finally {
      if (previousXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
      }
      if (previousConfigDir === undefined) {
        delete process.env.LALACLAW_CONFIG_DIR;
      } else {
        process.env.LALACLAW_CONFIG_DIR = previousConfigDir;
      }
    }
  });

  it("prefers the user config file over the legacy project env file", () => {
    const previousConfigFile = process.env.LALACLAW_CONFIG_FILE;
    const previousConfigDir = process.env.LALACLAW_CONFIG_DIR;

    delete process.env.LALACLAW_CONFIG_FILE;
    process.env.LALACLAW_CONFIG_DIR = path.join(os.tmpdir(), "lalaclaw-config-test");

    try {
      expect(cli.resolveDefaultEnvFile()).toBe(path.join(process.env.LALACLAW_CONFIG_DIR, ".env.local"));
    } finally {
      if (previousConfigFile === undefined) {
        delete process.env.LALACLAW_CONFIG_FILE;
      } else {
        process.env.LALACLAW_CONFIG_FILE = previousConfigFile;
      }
      if (previousConfigDir === undefined) {
        delete process.env.LALACLAW_CONFIG_DIR;
      } else {
        process.env.LALACLAW_CONFIG_DIR = previousConfigDir;
      }
    }
  });

  it("uses an explicit config file override when provided", () => {
    const previousConfigFile = process.env.LALACLAW_CONFIG_FILE;
    const explicitPath = path.join(os.tmpdir(), "lalaclaw-explicit.env");
    process.env.LALACLAW_CONFIG_FILE = explicitPath;

    try {
      expect(cli.resolveDefaultEnvFile()).toBe(explicitPath);
    } finally {
      if (previousConfigFile === undefined) {
        delete process.env.LALACLAW_CONFIG_FILE;
      } else {
        process.env.LALACLAW_CONFIG_FILE = previousConfigFile;
      }
    }
  });

  it("detects source checkouts for local development commands", () => {
    expect(cli.isSourceCheckout(sourceCheckoutRoot)).toBe(true);
    expect(cli.isSourceCheckout(path.join(os.tmpdir(), "lalaclaw-packed-app"))).toBe(false);
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

  it("reports the built app URL separately from the dev frontend URL", () => {
    expect(
      cli.getRuntimeUrls({
        host: "127.0.0.1",
        backendPort: "5000",
        frontendHost: "127.0.0.1",
        frontendPort: "5001",
      }),
    ).toMatchObject({
      appUrl: "http://127.0.0.1:5000",
      apiUrl: "http://127.0.0.1:5000/api",
      devFrontendUrl: "http://127.0.0.1:5001",
      backendUrl: "http://127.0.0.1:5000",
      frontendUrl: "http://127.0.0.1:5001",
    });
  });

  it("uses launchd background startup on macOS unless it is explicitly disabled", () => {
    expect(cli.shouldAutoStartBackgroundService({}, "darwin", path.join(os.tmpdir(), "lalaclaw-packed-app"))).toBe(true);
    expect(cli.shouldAutoStartBackgroundService({ noBackground: true }, "darwin", path.join(os.tmpdir(), "lalaclaw-packed-app"))).toBe(false);
    expect(cli.shouldAutoStartBackgroundService({}, "linux", path.join(os.tmpdir(), "lalaclaw-packed-app"))).toBe(false);
    expect(cli.shouldAutoStartBackgroundService({}, "darwin", sourceCheckoutRoot)).toBe(true);
  });

  it("builds the production app before starting the background service from a source checkout", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-build-ready-"));
    const srcDir = path.join(tempRoot, "src");
    const nodeModulesDir = path.join(tempRoot, "node_modules");
    const distDir = path.join(tempRoot, "dist");
    const viteConfigPath = path.join(tempRoot, "vite.config.mjs");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "main.jsx"), "export default null;\n", "utf8");
    fs.writeFileSync(viteConfigPath, "export default {};\n", "utf8");

    const calls = [];
    try {
      const status = cli.ensureBackgroundServiceBuildReady((command, args, options) => {
        calls.push({ command, args, options });
        fs.mkdirSync(distDir, { recursive: true });
        fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html>", "utf8");
        return { status: 0 };
      }, tempRoot);

      expect(status).toEqual({
        ready: true,
        built: true,
      });
      expect(calls).toEqual([
        {
          command: process.platform === "win32" ? "npm.cmd" : "npm",
          args: ["run", "build"],
          options: {
            cwd: tempRoot,
            env: process.env,
            stdio: "inherit",
          },
        },
      ]);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails background startup preparation when a source checkout is missing node_modules", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-build-missing-modules-"));
    const srcDir = path.join(tempRoot, "src");
    const viteConfigPath = path.join(tempRoot, "vite.config.mjs");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "main.jsx"), "export default null;\n", "utf8");
    fs.writeFileSync(viteConfigPath, "export default {};\n", "utf8");

    try {
      expect(() => cli.ensureBackgroundServiceBuildReady(() => ({ status: 0 }), tempRoot)).toThrow(
        "Source checkout detected, but node_modules is missing. Run `npm ci` before `lalaclaw init` can start the background service.",
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("colors CLI status labels when terminal colors are supported", () => {
    const previousNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR;

    try {
      expect(cli.formatCliLevel("OK   ", { isTTY: true })).toContain("\u001B[32mOK   \u001B[0m");
      expect(cli.formatCliLevel("WARN ", { isTTY: true })).toContain("\u001B[33mWARN \u001B[0m");
      expect(cli.formatCliLevel("INFO ", { isTTY: true })).toContain("\u001B[36mINFO \u001B[0m");
      expect(cli.formatCliLevel("ERROR", { isTTY: true })).toContain("\u001B[31mERROR\u001B[0m");
      expect(cli.formatCliLevel("ERROR", { isTTY: false })).toBe("ERROR");
      process.env.NO_COLOR = "1";
      expect(cli.formatCliLevel("WARN ", { isTTY: true })).toBe("WARN ");
    } finally {
      if (previousNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previousNoColor;
      }
    }
  });

  it("detects whether interactive prompting is available", () => {
    expect(cli.canPromptInteractively({ isTTY: true }, { isTTY: true })).toBe(true);
    expect(cli.canPromptInteractively({ isTTY: false }, { isTTY: true })).toBe(false);
    expect(cli.canPromptInteractively({ isTTY: true }, { isTTY: false })).toBe(false);
  });

  it("accepts the widened supported Node.js ranges in doctor checks", () => {
    expect(cli.SUPPORTED_NODE_VERSION_RANGE).toBe("^20.19.0 || ^22.12.0 || >=24.0.0");
    expect(cli.isNodeVersionSupported("20.19.0")).toBe(true);
    expect(cli.isNodeVersionSupported("20.25.1")).toBe(true);
    expect(cli.isNodeVersionSupported("22.12.0")).toBe(true);
    expect(cli.isNodeVersionSupported("22.22.0")).toBe(true);
    expect(cli.isNodeVersionSupported("24.0.0")).toBe(true);
    expect(cli.isNodeVersionSupported("25.1.0")).toBe(true);
    expect(cli.isNodeVersionSupported("20.18.9")).toBe(false);
    expect(cli.isNodeVersionSupported("22.11.9")).toBe(false);
    expect(cli.isNodeVersionSupported("23.0.0")).toBe(false);
  });

  it("waits until a port becomes occupied", async () => {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", resolve);
    });
    const { port } = probe.address();
    await new Promise((resolve, reject) => {
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const server = net.createServer();
    const startServer = setTimeout(() => {
      server.listen(port, "127.0.0.1");
    }, 100);

    try {
      await expect(cli.waitForPortInUse("Frontend port", "127.0.0.1", String(port), null, 2000)).resolves.toBeUndefined();
    } finally {
      clearTimeout(startServer);
      await new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
    }
  });

  it("fails fast when the watched process exits before the port is ready", async () => {
    await expect(
      cli.waitForPortInUse("Server port", "127.0.0.1", "65530", { exitCode: 1 }, 1000),
    ).rejects.toThrow("Server port process exited before 127.0.0.1:65530 became ready (code 1).");
  });

  it("fails fast when the watched process emits a startup error", async () => {
    const child = new EventEmitter();
    child.exitCode = null;
    setTimeout(() => {
      child.emit("error", new Error("spawn failed"));
    }, 20);

    await expect(
      cli.waitForPortInUse("Server port", "127.0.0.1", "65530", child, 1000),
    ).rejects.toThrow("Server port process failed before 127.0.0.1:65530 became ready: spawn failed");
  });

  it("runs doctor preflight before starting the built app", async () => {
    const doctorCalls = [];
    const portCalls = [];
    const runChildCalls = [];
    const child = new EventEmitter();
    child.on = child.addListener.bind(child);

    await cli.runStart("/tmp/.env.local", { profile: "mock", backendPort: "3900" }, {
      buildChildEnv: () => ({
        childEnv: { PORT: "3900" },
        config: {
          host: "127.0.0.1",
          backendPort: "3900",
          profile: "mock",
        },
      }),
      existsSync: () => true,
      runStartDoctorCheck: async (envFilePath, options) => {
        doctorCalls.push({ envFilePath, options });
      },
      ensurePortAvailable: async (label, host, port) => {
        portCalls.push({ label, host, port });
      },
      runChild: (command, args, env) => {
        runChildCalls.push({ command, args, env });
        return child;
      },
    });

    expect(doctorCalls).toEqual([
      {
        envFilePath: "/tmp/.env.local",
        options: { profile: "mock", backendPort: "3900" },
      },
    ]);
    expect(portCalls).toEqual([
      {
        label: "Backend port",
        host: "127.0.0.1",
        port: "3900",
      },
    ]);
    expect(runChildCalls).toEqual([
      {
        command: process.execPath,
        args: ["server.js"],
        env: { PORT: "3900" },
      },
    ]);
  });

  it("blocks start when the doctor preflight reports errors", async () => {
    await expect(
      cli.runStart("/tmp/.env.local", {}, {
        buildChildEnv: () => ({
          childEnv: {},
          config: {
            host: "127.0.0.1",
            backendPort: "5678",
            profile: "local-openclaw",
          },
        }),
        runStartDoctorCheck: async () => {
          throw new Error("Startup blocked by doctor errors. Run `lalaclaw doctor` to review and fix the failing checks.");
        },
        existsSync: () => true,
        ensurePortAvailable: async () => {
          throw new Error("should not reach port check");
        },
        runChild: () => {
          throw new Error("should not spawn server");
        },
      }),
    ).rejects.toThrow("Startup blocked by doctor errors. Run `lalaclaw doctor` to review and fix the failing checks.");
  });

  it("prints doctor output and rejects startup when preflight finds errors", async () => {
    const logs = [];
    const printedReports = [];
    const report = {
      summary: {
        exitCode: 1,
      },
    };

    await expect(
      cli.runStartDoctorCheck("/tmp/.env.local", { profile: "local-openclaw" }, {
        log: (message) => logs.push(message),
        collectDoctorDataImpl: async (envFilePath, options) => {
          expect(envFilePath).toBe("/tmp/.env.local");
          expect(options).toEqual({ profile: "local-openclaw" });
          return report;
        },
        printDoctorReportImpl: (nextReport) => printedReports.push(nextReport),
      }),
    ).rejects.toThrow("Startup blocked by doctor errors. Run `lalaclaw doctor` to review and fix the failing checks.");

    expect(logs).toEqual(["INFO  Running doctor preflight before startup..."]);
    expect(printedReports).toEqual([report]);
  });

  it("requires full dev markers before treating a folder as a source checkout", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-source-check-"));
    try {
      const srcDir = path.join(tempRoot, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "main.jsx"), "export default null;\n", "utf8");

      expect(cli.isSourceCheckout(tempRoot)).toBe(false);

      fs.writeFileSync(path.join(tempRoot, "vite.config.mjs"), "export default {};\n", "utf8");

      expect(cli.isSourceCheckout(tempRoot)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("opens external URLs with the platform browser launcher", () => {
    const calls = [];
    cli.openExternalUrl("http://127.0.0.1:5000", (command, args, options) => {
      calls.push({ command, args, options });
      return { unref() {} };
    }, "darwin");

    expect(calls).toEqual([
      {
        command: "open",
        args: ["http://127.0.0.1:5000"],
        options: {
          detached: true,
          stdio: "ignore",
        },
      },
    ]);
  });

  it("renders a launchd plist that starts the CLI with the chosen env file", () => {
    const plist = cli.renderLaunchdPlist({
      nodePath: "/opt/homebrew/bin/node",
      cliPath: "/Users/example/.npm-global/lib/node_modules/lalaclaw/bin/lalaclaw.js",
      workingDirectory: "/Users/example/.npm-global/lib/node_modules/lalaclaw",
      envFilePath: "/Users/example/.config/lalaclaw/.env.local",
      stdoutPath: "/Users/example/.config/lalaclaw/logs/lalaclaw-launchd.out.log",
      stderrPath: "/Users/example/.config/lalaclaw/logs/lalaclaw-launchd.err.log",
      pathEnv: "/opt/homebrew/bin:/Users/example/.npm-global/bin:/usr/bin:/bin",
    });

    expect(plist).toContain("<string>ai.lalaclaw.app</string>");
    expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(plist).toContain("<string>start</string>");
    expect(plist).toContain("<string>--config-file</string>");
    expect(plist).toContain("<string>/Users/example/.config/lalaclaw/.env.local</string>");
    expect(plist).toContain("<key>EnvironmentVariables</key>");
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).toContain("<string>/opt/homebrew/bin:/Users/example/.npm-global/bin:/usr/bin:/bin</string>");
    expect(plist).toContain("/Users/example/.config/lalaclaw/logs/lalaclaw-launchd.out.log");
  });

  it("builds PATH values by prepending required runtime directories", () => {
    expect(
      cli.buildPathEnv("/usr/bin:/bin", ["/opt/homebrew/bin", "/usr/bin", "", "/Users/example/.npm-global/bin"]),
    ).toBe("/opt/homebrew/bin:/usr/bin:/Users/example/.npm-global/bin:/bin");
  });

  it("passes OPENCLAW_BIN from the env file into child processes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-child-env-"));
    const envFilePath = path.join(tempDir, ".env.local");

    fs.writeFileSync(
      envFilePath,
      [
        "HOST=127.0.0.1",
        "PORT=3000",
        "FRONTEND_HOST=127.0.0.1",
        "FRONTEND_PORT=5173",
        "OPENCLAW_BIN=/Users/example/.npm-global/bin/openclaw",
        "OPENCLAW_BASE_URL=https://gateway.example.com",
        "OPENCLAW_API_KEY=secret",
        "OPENCLAW_MODEL=openclaw",
        "OPENCLAW_AGENT_ID=main",
        "OPENCLAW_API_STYLE=chat",
        "OPENCLAW_API_PATH=/v1/chat/completions",
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const result = cli.buildChildEnv(envFilePath);
      expect(result.config.openclawBin).toBe("/Users/example/.npm-global/bin/openclaw");
      expect(result.childEnv.OPENCLAW_BIN).toBe("/Users/example/.npm-global/bin/openclaw");
      expect(result.childEnv.PATH.split(path.delimiter)).toEqual(
        expect.arrayContaining([
          path.dirname(process.execPath),
          "/Users/example/.npm-global/bin",
        ]),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("passes token access settings from the env file into child processes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-cli-access-"));
    const envFilePath = path.join(tempDir, ".env.local");
    fs.writeFileSync(
      envFilePath,
      [
        "HOST=127.0.0.1",
        "PORT=5678",
        "FRONTEND_HOST=127.0.0.1",
        "FRONTEND_PORT=4321",
        "COMMANDCENTER_FORCE_MOCK=1",
        "COMMANDCENTER_ACCESS_MODE=token",
        "COMMANDCENTER_ACCESS_TOKENS=demo-token",
        "COMMANDCENTER_ACCESS_TOKENS_FILE=/tmp/access-tokens.txt",
      ].join("\n"),
      "utf8",
    );

    const { childEnv, config } = cli.buildChildEnv(envFilePath);

    expect(config.accessMode).toBe("token");
    expect(config.accessTokens).toBe("demo-token");
    expect(config.accessTokensFile).toBe("/tmp/access-tokens.txt");
    expect(childEnv.LALACLAW_CONFIG_FILE).toBe(envFilePath);
    expect(childEnv.COMMANDCENTER_ACCESS_MODE).toBe("token");
    expect(childEnv.COMMANDCENTER_ACCESS_TOKENS).toBe("demo-token");
    expect(childEnv.COMMANDCENTER_ACCESS_TOKENS_FILE).toBe("/tmp/access-tokens.txt");
  });

  it("reads inline browser access tokens from the env file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-access-read-"));
    const envFilePath = path.join(tempDir, ".env.local");
    fs.writeFileSync(
      envFilePath,
      [
        "COMMANDCENTER_ACCESS_MODE=token",
        "COMMANDCENTER_ACCESS_TOKENS=first-token,second-token",
      ].join("\n"),
      "utf8",
    );

    const state = cli.readAccessTokenState(envFilePath);

    expect(state.config.accessMode).toBe("token");
    expect(state.inlineTokens).toEqual(["first-token", "second-token"]);
    expect(state.fileTokens).toEqual([]);
  });

  it("rotates browser access tokens inline when no token file is configured", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-access-rotate-inline-"));
    const envFilePath = path.join(tempDir, ".env.local");
    fs.writeFileSync(envFilePath, "COMMANDCENTER_ACCESS_MODE=off\n", "utf8");

    const { nextConfig, resolvedAccessTokensFile } = cli.writeAccessTokenState(envFilePath, cli.resolveConfig({}, {
      exists: false,
      path: "/Users/example/.openclaw/openclaw.json",
      token: "",
      defaultAgentId: "main",
      defaultModel: "openclaw",
    }), "rotated-inline-token");

    expect(resolvedAccessTokensFile).toBe("");
    expect(nextConfig.accessMode).toBe("token");
    expect(nextConfig.accessTokens).toBe("rotated-inline-token");
    expect(fs.readFileSync(envFilePath, "utf8")).toContain("COMMANDCENTER_ACCESS_TOKENS=rotated-inline-token");
  });

  it("rotates browser access tokens into the configured token file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-access-rotate-file-"));
    const envFilePath = path.join(tempDir, ".env.local");
    const tokensFilePath = path.join(tempDir, "tokens.txt");
    fs.writeFileSync(
      envFilePath,
      [
        "COMMANDCENTER_ACCESS_MODE=token",
        `COMMANDCENTER_ACCESS_TOKENS_FILE=${tokensFilePath}`,
      ].join("\n"),
      "utf8",
    );

    const state = cli.readAccessTokenState(envFilePath);
    const result = cli.writeAccessTokenState(envFilePath, state.config, "rotated-file-token");

    expect(result.resolvedAccessTokensFile).toBe(tokensFilePath);
    expect(fs.readFileSync(tokensFilePath, "utf8")).toBe("rotated-file-token\n");
    expect(fs.readFileSync(envFilePath, "utf8")).toContain(`COMMANDCENTER_ACCESS_TOKENS_FILE=${tokensFilePath}`);
  });

  it("clears remote gateway env vars when child processes run in local-openclaw mode", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-local-openclaw-env-"));
    const envFilePath = path.join(tempDir, ".env.local");
    const openclawConfigDir = path.join(tempDir, ".openclaw");
    const originalHomedir = os.homedir;
    const previousBaseUrl = process.env.OPENCLAW_BASE_URL;
    const previousApiKey = process.env.OPENCLAW_API_KEY;

    os.homedir = () => tempDir;
    process.env.OPENCLAW_BASE_URL = "https://stale-gateway.example.com";
    process.env.OPENCLAW_API_KEY = "stale-secret";

    fs.mkdirSync(openclawConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(openclawConfigDir, "openclaw.json"),
      JSON.stringify({
        gateway: {
          auth: { token: "token-123" },
          port: 18789,
        },
        agents: {
          defaults: {
            model: { primary: "openclaw" },
          },
          list: [
            {
              id: "main",
              default: true,
              model: { primary: "openclaw" },
            },
          ],
        },
      }),
      "utf8",
    );

    fs.writeFileSync(
      envFilePath,
      [
        "HOST=127.0.0.1",
        "PORT=3000",
        "FRONTEND_HOST=127.0.0.1",
        "FRONTEND_PORT=5173",
        "COMMANDCENTER_FORCE_MOCK=0",
        "OPENCLAW_BIN=/Users/example/.npm-global/bin/openclaw",
        "OPENCLAW_MODEL=openclaw",
        "OPENCLAW_AGENT_ID=main",
        "OPENCLAW_API_STYLE=chat",
        "OPENCLAW_API_PATH=/v1/chat/completions",
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const result = cli.buildChildEnv(envFilePath);
      expect(result.config.profile).toBe("local-openclaw");
      expect(result.childEnv.OPENCLAW_BASE_URL).toBeUndefined();
      expect(result.childEnv.OPENCLAW_API_KEY).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      os.homedir = originalHomedir;
      if (previousBaseUrl === undefined) {
        delete process.env.OPENCLAW_BASE_URL;
      } else {
        process.env.OPENCLAW_BASE_URL = previousBaseUrl;
      }
      if (previousApiKey === undefined) {
        delete process.env.OPENCLAW_API_KEY;
      } else {
        process.env.OPENCLAW_API_KEY = previousApiKey;
      }
    }
  });

  it("requires absolute OPENCLAW_BIN paths to be executable", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-openclaw-bin-"));
    const openclawPath = path.join(tempDir, "openclaw");

    fs.writeFileSync(openclawPath, "#!/bin/sh\nexit 0\n", "utf8");

    try {
      fs.chmodSync(openclawPath, 0o644);
      if (process.platform === "win32") {
        expect(cli.findExecutable(openclawPath)).toBe(openclawPath);
      } else {
        expect(cli.findExecutable(openclawPath)).toBe("");
      }

      fs.chmodSync(openclawPath, 0o755);
      expect(cli.findExecutable(openclawPath)).toBe(openclawPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads launchd service status from launchctl output", () => {
    const status = cli.readLaunchdServiceStatus((command, args) => {
      expect(command).toBe("launchctl");
      expect(args).toEqual(["print", `gui/${process.getuid()}/ai.lalaclaw.app`]);
      return {
        status: 0,
        stdout: "state = running\npid = 123",
        stderr: "",
      };
    });

    expect(status.installed).toBeTypeOf("boolean");
    expect(status.running).toBe(true);
    expect(status.details).toContain("state = running");
  });

  it("stops the launchd service with bootout when a plist exists", () => {
    const previousConfigDir = process.env.LALACLAW_CONFIG_DIR;
    const tempConfigDir = path.join(os.tmpdir(), "lalaclaw-stop-test");
    process.env.LALACLAW_CONFIG_DIR = tempConfigDir;
    const plistPath = cli.resolveLaunchdPlistPath();

    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, "plist", "utf8");

    try {
      const result = cli.stopLaunchdService((command, args) => {
        expect(command).toBe("launchctl");
        expect(args).toEqual(["bootout", `gui/${process.getuid()}`, plistPath]);
        return {
          status: 0,
          stdout: "",
          stderr: "",
        };
      });

      expect(result).toMatchObject({
        installed: true,
        stopped: true,
        plistPath,
      });
    } finally {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      if (previousConfigDir === undefined) {
        delete process.env.LALACLAW_CONFIG_DIR;
      } else {
        process.env.LALACLAW_CONFIG_DIR = previousConfigDir;
      }
    }
  });

  it("writes and reads windows background service state", () => {
    const previousConfigFile = process.env.LALACLAW_CONFIG_FILE;
    const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-win-state-"));
    const envFile = path.join(tempConfigDir, ".env.local");
    process.env.LALACLAW_CONFIG_FILE = envFile;

    try {
      const statePath = cli.writeWindowsBackgroundServiceState(envFile, {
        pid: 4321,
        port: "3900",
        host: "127.0.0.1",
      });

      expect(statePath).toBe(cli.resolveWindowsBackgroundServiceStatePath(envFile));
      expect(cli.readWindowsBackgroundServiceState(envFile)).toMatchObject({
        pid: 4321,
        port: "3900",
        host: "127.0.0.1",
      });
    } finally {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      if (previousConfigFile === undefined) {
        delete process.env.LALACLAW_CONFIG_FILE;
      } else {
        process.env.LALACLAW_CONFIG_FILE = previousConfigFile;
      }
    }
  });

  it("registers windows background backend state for detached server processes", () => {
    const previousPlatform = process.platform;
    const previousConfigFile = process.env.LALACLAW_CONFIG_FILE;
    const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-win-register-"));
    const envFile = path.join(tempConfigDir, ".env.local");
    process.env.LALACLAW_CONFIG_FILE = envFile;

    Object.defineProperty(process, "platform", { value: "win32" });

    try {
      const statePath = cli.registerWindowsBackgroundService(
        envFile,
        { pid: 6789 },
        { backendPort: "3900", host: "127.0.0.1" },
      );

      expect(statePath).toBe(cli.resolveWindowsBackgroundServiceStatePath(envFile));
      expect(cli.readWindowsBackgroundServiceState(envFile)).toMatchObject({
        pid: 6789,
        port: "3900",
        host: "127.0.0.1",
      });
    } finally {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      if (previousConfigFile === undefined) {
        delete process.env.LALACLAW_CONFIG_FILE;
      } else {
        process.env.LALACLAW_CONFIG_FILE = previousConfigFile;
      }
      Object.defineProperty(process, "platform", { value: previousPlatform });
    }
  });

  it("stops a registered windows background backend by managed pid", () => {
    const previousConfigFile = process.env.LALACLAW_CONFIG_FILE;
    const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-stop-win-"));
    const envFile = path.join(tempConfigDir, ".env.local");
    process.env.LALACLAW_CONFIG_FILE = envFile;

    try {
      cli.writeWindowsBackgroundServiceState(envFile, {
        pid: 7890,
        port: "3900",
        host: "127.0.0.1",
      });

      const calls = [];
      const result = cli.stopWindowsBackgroundService(envFile, (command, args) => {
        calls.push({ command, args });
        if (command === "powershell") {
          return {
            status: 0,
            stdout: "node server.js --lalaclaw-background-service\n",
            stderr: "",
          };
        }
        if (command === "taskkill") {
          return { status: 0, stdout: "", stderr: "" };
        }

        throw new Error(`Unexpected command: ${command}`);
      });

      expect(result).toMatchObject({
        configured: true,
        pid: 7890,
        port: "3900",
        stopped: true,
        stale: false,
        failedPids: [],
      });
      expect(calls).toEqual([
        {
          command: "powershell",
          args: ["-NoProfile", "-Command", '(Get-CimInstance Win32_Process -Filter "ProcessId = 7890").CommandLine'],
        },
        { command: "taskkill", args: ["/pid", "7890", "/t", "/f"] },
      ]);
      expect(cli.readWindowsBackgroundServiceState(envFile)).toBeNull();
    } finally {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      if (previousConfigFile === undefined) {
        delete process.env.LALACLAW_CONFIG_FILE;
      } else {
        process.env.LALACLAW_CONFIG_FILE = previousConfigFile;
      }
    }
  });

  it("clears stale windows background state instead of killing an unrelated process", () => {
    const previousConfigFile = process.env.LALACLAW_CONFIG_FILE;
    const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-stop-win-stale-"));
    const envFile = path.join(tempConfigDir, ".env.local");
    process.env.LALACLAW_CONFIG_FILE = envFile;

    try {
      cli.writeWindowsBackgroundServiceState(envFile, {
        pid: 7890,
        port: "3900",
        host: "127.0.0.1",
      });

      const calls = [];
      const result = cli.stopWindowsBackgroundService(envFile, (command, args) => {
        calls.push({ command, args });
        if (command === "powershell") {
          return {
            status: 0,
            stdout: "node some-other-server.js\n",
            stderr: "",
          };
        }

        throw new Error(`Unexpected command: ${command}`);
      });

      expect(result).toMatchObject({
        configured: true,
        pid: 7890,
        port: "3900",
        stopped: false,
        stale: true,
      });
      expect(calls).toEqual([
        {
          command: "powershell",
          args: ["-NoProfile", "-Command", '(Get-CimInstance Win32_Process -Filter "ProcessId = 7890").CommandLine'],
        },
      ]);
      expect(cli.readWindowsBackgroundServiceState(envFile)).toBeNull();
    } finally {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      if (previousConfigFile === undefined) {
        delete process.env.LALACLAW_CONFIG_FILE;
      } else {
        process.env.LALACLAW_CONFIG_FILE = previousConfigFile;
      }
    }
  });

  it("restarts the launchd service with kickstart when a plist exists", () => {
    const previousConfigDir = process.env.LALACLAW_CONFIG_DIR;
    const tempConfigDir = path.join(os.tmpdir(), "lalaclaw-restart-test");
    process.env.LALACLAW_CONFIG_DIR = tempConfigDir;
    const plistPath = cli.resolveLaunchdPlistPath();

    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, "plist", "utf8");

    try {
      const result = cli.restartLaunchdService((command, args) => {
        expect(command).toBe("launchctl");
        expect(args).toEqual(["kickstart", "-k", `gui/${process.getuid()}/ai.lalaclaw.app`]);
        return {
          status: 0,
          stdout: "",
          stderr: "",
        };
      });

      expect(result).toMatchObject({
        installed: true,
        restarted: true,
        plistPath,
      });
    } finally {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      if (previousConfigDir === undefined) {
        delete process.env.LALACLAW_CONFIG_DIR;
      } else {
        process.env.LALACLAW_CONFIG_DIR = previousConfigDir;
      }
    }
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
      sofficeBinary: "/opt/homebrew/bin/soffice",
      libreOfficeInstallCommand: "brew install --cask libreoffice",
      libreOfficeFixSupported: true,
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
        requiredRange: "^20.19.0 || ^22.12.0 || >=24.0.0",
        matches: true,
      },
      localOpenClaw: {
        exists: true,
        tokenDetected: true,
      },
      presentationPreview: {
        available: true,
        binaryPath: "/opt/homebrew/bin/soffice",
        installCommand: "brew install --cask libreoffice",
        fixSupported: true,
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
        appUrl: "http://127.0.0.1:3000",
        apiUrl: "http://127.0.0.1:3000/api",
        devFrontendUrl: "http://127.0.0.1:5173",
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
      sofficeBinary: "",
      libreOfficeInstallCommand: "brew install --cask libreoffice",
      libreOfficeFixSupported: true,
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
      warningCount: 1,
      errorCount: 1,
    });
    expect(report.summary.warnings[0]).toContain("LibreOffice-backed preview is unavailable");
    expect(report.summary.errors[0]).toContain("Remote runtime validation failed");
  });

  it("warns when the Node.js version falls outside the supported range", () => {
    const report = cli.buildDoctorReport({
      envFilePath: "/tmp/.env.local",
      envFileExists: true,
      nodeVersion: "20.18.0",
      nodeMatches: false,
      localOpenClaw: {
        exists: true,
        path: "/Users/example/.openclaw/openclaw.json",
        token: "token-123",
        workspaceRoot: "/Users/example/.openclaw/workspace",
      },
      openclawBinary: "/usr/local/bin/openclaw",
      sofficeBinary: "/opt/homebrew/bin/soffice",
      libreOfficeInstallCommand: "brew install --cask libreoffice",
      libreOfficeFixSupported: true,
      frontendPortFree: true,
      backendPortFree: true,
      config: {
        host: "127.0.0.1",
        backendPort: "3000",
        frontendHost: "127.0.0.1",
        frontendPort: "5173",
        profile: "local-openclaw",
        openclawBaseUrl: "",
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
    });

    expect(report.summary.warnings).toContain("Node.js 20.18.0 is outside the supported range ^20.19.0 || ^22.12.0 || >=24.0.0.");
  });
});
