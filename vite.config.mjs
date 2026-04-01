import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function getPackageName(id) {
  const normalized = id.split("\\").join("/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  const packagePath = normalized.slice(markerIndex + marker.length);
  const [scopeOrName, nestedName] = packagePath.split("/");
  if (!scopeOrName) {
    return "";
  }

  return scopeOrName.startsWith("@") ? `${scopeOrName}/${nestedName || ""}` : scopeOrName;
}

function readGitValue(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function getDevWorkspaceInfo() {
  const cwd = process.cwd();
  const branch = readGitValue("git branch --show-current");
  const commit = readGitValue("git rev-parse --short HEAD");

  return {
    branch: branch || (commit ? `detached@${commit}` : "detached"),
    commit,
    cwd,
    worktree: path.basename(cwd),
  };
}

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function resolveSharedDevServerConfig() {
  const fallback = {
    backendHost: "127.0.0.1",
    backendPort: 3000,
    frontendHost: "127.0.0.1",
    frontendPort: 5173,
  };

  try {
    const lalaclawCli = require("./bin/lalaclaw.js");
    const envFilePath = lalaclawCli.resolveDefaultEnvFile();
    const envValues = lalaclawCli.readEnvFile(envFilePath);
    const backendHost = String(process.env.HOST || envValues.HOST || fallback.backendHost).trim() || fallback.backendHost;
    const frontendHost = String(process.env.FRONTEND_HOST || envValues.FRONTEND_HOST || backendHost).trim() || backendHost;

    return {
      backendHost,
      backendPort: normalizePort(process.env.PORT || envValues.PORT, fallback.backendPort),
      frontendHost,
      frontendPort: normalizePort(process.env.FRONTEND_PORT || envValues.FRONTEND_PORT, fallback.frontendPort),
    };
  } catch {
    return fallback;
  }
}

const sharedDevServerConfig = resolveSharedDevServerConfig();
const backendProxyTarget = `http://${sharedDevServerConfig.backendHost}:${sharedDevServerConfig.backendPort}`;

export default defineConfig({
  define: {
    "globalThis.__LALACLAW_DEV_INFO__": JSON.stringify(getDevWorkspaceInfo()),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: sharedDevServerConfig.frontendHost,
    port: sharedDevServerConfig.frontendPort,
    strictPort: true,
    proxy: {
      "/api/runtime/ws": {
        target: backendProxyTarget,
        ws: true,
      },
      "/api": {
        target: backendProxyTarget,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return null;
          }

          const packageName = getPackageName(id);
          if (!packageName) {
            return "vendor";
          }

          if (["react", "react-dom", "scheduler"].includes(packageName)) {
            return "react-vendor";
          }

          if (packageName === "@monaco-editor/react" || packageName === "monaco-editor") {
            return "monaco-vendor";
          }

          if (packageName.startsWith("@radix-ui/")) {
            return "radix-vendor";
          }

          if (packageName === "lucide-react") {
            return "icons-vendor";
          }

          if (["clsx", "class-variance-authority", "tailwind-merge"].includes(packageName)) {
            return "ui-utils-vendor";
          }

          if (packageName === "katex" || packageName.startsWith("katex/")) {
            return "katex-vendor";
          }

          if (packageName === "xlsx") {
            return "xlsx-vendor";
          }

          if (packageName === "docx-preview") {
            return "docx-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      ".server-build/**",
      "tests/e2e/**",
      "playwright.config.js",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 50,
        functions: 52,
        statements: 50,
        branches: 40,
      },
      exclude: [
        "dist/**",
        "coverage/**",
        "test/**",
        "docs/**",
      ],
    },
    environment: "jsdom",
    globals: true,
    setupFiles: "./test/setup.js",
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
});
