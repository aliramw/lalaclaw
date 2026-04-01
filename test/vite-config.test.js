import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadViteConfig() {
  vi.resetModules();
  const imported = await import("../vite.config.mjs");
  return imported.default;
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv();
});

describe("vite dev server proxy", () => {
  it("falls back to the standard local dev ports when no shared config is present", async () => {
    const missingConfigPath = path.join(os.tmpdir(), `lalaclaw-missing-${Date.now()}.env.local`);

    restoreEnv();
    process.env.LALACLAW_CONFIG_FILE = missingConfigPath;
    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.FRONTEND_HOST;
    delete process.env.FRONTEND_PORT;

    const viteConfig = await loadViteConfig();

    expect(viteConfig.server?.host).toBe("127.0.0.1");
    expect(viteConfig.server?.port).toBe(5173);
    expect(viteConfig.server?.proxy?.["/api"]?.target).toBe("http://127.0.0.1:3000");
    expect(viteConfig.server?.proxy?.["/api/runtime/ws"]?.target).toBe("http://127.0.0.1:3000");
    expect(viteConfig.server?.proxy?.["/api/runtime/ws"]?.ws).toBe(true);
  });

  it("reuses the shared lalaclaw dev ports for the frontend server and API proxy", async () => {
    const configPath = path.join(os.tmpdir(), `lalaclaw-vite-${Date.now()}.env.local`);

    fs.writeFileSync(configPath, [
      "HOST=127.0.0.1",
      "PORT=5000",
      "FRONTEND_HOST=127.0.0.1",
      "FRONTEND_PORT=5001",
    ].join("\n"));

    restoreEnv();
    process.env.LALACLAW_CONFIG_FILE = configPath;
    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.FRONTEND_HOST;
    delete process.env.FRONTEND_PORT;

    try {
      const viteConfig = await loadViteConfig();

      expect(viteConfig.server?.host).toBe("127.0.0.1");
      expect(viteConfig.server?.port).toBe(5001);
      expect(viteConfig.server?.proxy?.["/api"]?.target).toBe("http://127.0.0.1:5000");
      expect(viteConfig.server?.proxy?.["/api/runtime/ws"]?.target).toBe("http://127.0.0.1:5000");
      expect(viteConfig.server?.proxy?.["/api/runtime/ws"]?.ws).toBe(true);
    } finally {
      fs.rmSync(configPath, { force: true });
    }
  });
});
