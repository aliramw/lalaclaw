import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import path from "node:path";

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

export default defineConfig({
  define: {
    "globalThis.__LALACLAW_DEV_INFO__": JSON.stringify(getDevWorkspaceInfo()),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/runtime/ws": {
        target: "http://127.0.0.1:5000",
        ws: true,
      },
      "/api": {
        target: "http://127.0.0.1:5000",
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
