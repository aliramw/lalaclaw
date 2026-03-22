import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import {
  LOCAL_OPENCLAW_DIR,
  buildRuntimeConfig,
  collectAllowedSubagents,
  collectAvailableAgents,
  collectAvailableModels,
  collectAvailableSkills,
  resolveAgentModel,
  resolveCanonicalModelId,
} from "../server/core/config.ts";

function withEnv(nextEnv, run) {
  const previous = {
    COMMANDCENTER_FORCE_MOCK: process.env.COMMANDCENTER_FORCE_MOCK,
    OPENCLAW_BASE_URL: process.env.OPENCLAW_BASE_URL,
    OPENCLAW_MODEL: process.env.OPENCLAW_MODEL,
    OPENCLAW_AGENT_ID: process.env.OPENCLAW_AGENT_ID,
    OPENCLAW_API_KEY: process.env.OPENCLAW_API_KEY,
    OPENCLAW_API_STYLE: process.env.OPENCLAW_API_STYLE,
    OPENCLAW_API_PATH: process.env.OPENCLAW_API_PATH,
  };

  Object.entries(nextEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

describe("config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares the supported Node.js ranges required by the current toolchain", () => {
    expect(packageJson.engines?.node).toBe("^20.19.0 || ^22.12.0 || >=24.0.0");
  });

  it("resolves canonical model ids from exact matches, aliases, and suffixes", () => {
    const localConfig = {
      agents: {
        defaults: {
          models: {
            "openai/gpt-5": { alias: "gpt5" },
            "openai/gpt-5-mini": { alias: "mini" },
          },
        },
      },
    };

    expect(resolveCanonicalModelId("openai/gpt-5", localConfig)).toBe("openai/gpt-5");
    expect(resolveCanonicalModelId("gpt5", localConfig)).toBe("openai/gpt-5");
    expect(resolveCanonicalModelId("gpt-5-mini", localConfig)).toBe("openai/gpt-5-mini");
    expect(resolveCanonicalModelId("custom-model", localConfig)).toBe("custom-model");
    expect(resolveAgentModel({ model: { primary: "mini" } }, localConfig)).toBe("openai/gpt-5-mini");
  });

  it("collects available agents and models without duplicates", () => {
    const localConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5" },
          models: {
            "openai/gpt-5": {},
            "openai/gpt-5-mini": { alias: "mini" },
            "openrouter/minimax/minimax-m2.5": { alias: "minimax" },
          },
        },
        list: [
          { id: "main", default: true, model: { primary: "openai/gpt-5" } },
          { id: "worker", model: { primary: "mini" } },
          { id: "worker", model: { primary: "mini" } },
        ],
      },
    };

    expect(collectAvailableModels(localConfig, ["mini", "openai/gpt-5"])).toEqual([
      "openai/gpt-5-mini",
      "openai/gpt-5",
      "openrouter/minimax/minimax-m2.5",
    ]);
    expect(collectAvailableAgents(localConfig, ["worker", "main"])).toEqual(["worker", "main"]);
  });

  it("collects only the configured sub agents allowed by the current agent", () => {
    const localConfig = {
      agents: {
        list: [
          {
            id: "main",
            subagents: {
              allowAgents: ["writer", "reviewer", "writer", "missing"],
            },
          },
          { id: "writer" },
          { id: "reviewer" },
          { id: "expert" },
        ],
      },
    };

    expect(collectAllowedSubagents(localConfig, "main")).toEqual(["writer", "reviewer"]);
    expect(collectAllowedSubagents(localConfig, "expert")).toEqual([]);
  });

  it("collects skills from the current agent, allowed sub agents, and installed skill inventories", () => {
    const npmSkillsDir = `${process.env.HOME || ""}/.npm-global/lib/node_modules/openclaw/skills`;
    const summarizeSkillPath = `${npmSkillsDir}/summarize/SKILL.md`;

    const localConfig = {
      agents: {
        defaults: {
          workspace: "/tmp/workspace",
        },
        list: [
          {
            id: "main",
            subagents: {
              allowAgents: ["writer", "reviewer", "missing"],
            },
            skills: ["planning"],
          },
          { id: "writer", skills: ["drafting", "planning"] },
          { id: "reviewer", skills: ["checks"] },
          { id: "expert", skills: ["coding"] },
        ],
      },
    };

    vi.spyOn(fs, "existsSync").mockImplementation((filePath) => {
      const normalized = String(filePath);
      return [
        "/tmp/workspace/skills",
        "/tmp/workspace/skills/agent-browser/SKILL.md",
        "/tmp/workspace/.clawhub/lock.json",
        npmSkillsDir,
        summarizeSkillPath,
      ].includes(normalized);
    });
    vi.spyOn(fs, "readdirSync").mockImplementation((filePath) => {
      const normalized = String(filePath);
      if (normalized === "/tmp/workspace/skills") {
        return [{ name: "agent-browser", isDirectory: () => true }];
      }
      if (normalized === npmSkillsDir) {
        return [{ name: "summarize", isDirectory: () => true }];
      }
      return [];
    });
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath) => {
      if (String(filePath) === "/tmp/workspace/.clawhub/lock.json") {
        return JSON.stringify({
          skills: {
            "chat-with-anyone": {},
          },
        });
      }
      return "";
    });

    expect(collectAvailableSkills(localConfig, "main")).toEqual([
      { name: "planning", ownerAgentId: "main" },
      { name: "drafting", ownerAgentId: "writer" },
      { name: "checks", ownerAgentId: "reviewer" },
      { name: "agent-browser", ownerAgentId: "" },
      { name: "summarize", ownerAgentId: "" },
      { name: "chat-with-anyone", ownerAgentId: "" },
    ]);
    expect(collectAvailableSkills(localConfig, "expert")).toEqual([
      { name: "coding", ownerAgentId: "expert" },
      { name: "agent-browser", ownerAgentId: "" },
      { name: "summarize", ownerAgentId: "" },
      { name: "chat-with-anyone", ownerAgentId: "" },
    ]);
  });

  it("builds runtime config from local openclaw config and respects force mock mode", () => {
    const localConfig = {
      gateway: {
        port: 19333,
        auth: { token: "local-token" },
      },
      agents: {
        defaults: {
          workspace: "/tmp/workspace",
          model: { primary: "openai/gpt-5" },
          models: {
            "openai/gpt-5": {},
            "openai/gpt-5-mini": { alias: "mini" },
          },
        },
        list: [
          { id: "main", default: true, model: { primary: "openai/gpt-5" } },
          { id: "worker", model: { primary: "mini" } },
        ],
      },
    };

    vi.spyOn(fs, "existsSync").mockImplementation((filePath) => String(filePath).endsWith(".openclaw/openclaw.json"));
    vi.spyOn(fs, "readFileSync").mockImplementation(() => JSON.stringify(localConfig));

    const activeConfig = withEnv(
      {
        COMMANDCENTER_FORCE_MOCK: "0",
        OPENCLAW_BASE_URL: "",
        OPENCLAW_MODEL: "mini",
        OPENCLAW_AGENT_ID: "worker",
        OPENCLAW_API_KEY: undefined,
        OPENCLAW_API_STYLE: "responses",
        OPENCLAW_API_PATH: "/v1/responses",
      },
      () => buildRuntimeConfig(),
    );

    expect(activeConfig).toMatchObject({
      mode: "openclaw",
      model: "openai/gpt-5-mini",
      agentId: "worker",
      baseUrl: "http://127.0.0.1:19333",
      apiKey: "local-token",
      apiStyle: "responses",
      apiPath: "/v1/responses",
      localDetected: true,
      forceMockMode: false,
      workspaceRoot: "/tmp/workspace",
      logsDir: `${LOCAL_OPENCLAW_DIR}/logs`,
      availableModels: ["openai/gpt-5-mini", "openai/gpt-5"],
      availableAgents: ["worker", "main"],
    });

    const mockConfig = withEnv(
      {
        COMMANDCENTER_FORCE_MOCK: "1",
        OPENCLAW_BASE_URL: "",
        OPENCLAW_MODEL: "",
        OPENCLAW_AGENT_ID: undefined,
        OPENCLAW_API_KEY: undefined,
        OPENCLAW_API_STYLE: undefined,
        OPENCLAW_API_PATH: undefined,
      },
      () => buildRuntimeConfig(),
    );

    expect(mockConfig.mode).toBe("mock");
    expect(mockConfig.baseUrl).toBe("");
    expect(mockConfig.localDetected).toBe(false);
    expect(mockConfig.forceMockMode).toBe(true);
  });
});
