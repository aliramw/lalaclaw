import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceTreeHandler } from "../server/routes/workspace-tree.ts";

const createdRoots = [];

function createResponseRecorder() {
  const calls = [];
  return {
    calls,
    sendJson: vi.fn((res, statusCode, payload) => {
      calls.push({ statusCode, payload });
    }),
  };
}

function createHarness(overrides = {}) {
  const recorder = createResponseRecorder();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-workspace-"));
  createdRoots.push(workspaceRoot);
  const handler = createWorkspaceTreeHandler({
    normalizeSessionUser: vi.fn((value) => String(value || "command-center")),
    resolveAgentWorkspace: vi.fn(() => workspaceRoot),
    resolveSessionAgentId: vi.fn(() => "main"),
    sendJson: recorder.sendJson,
    ...overrides,
  });

  return {
    handler,
    recorder,
    workspaceRoot,
  };
}

describe("createWorkspaceTreeHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (createdRoots.length) {
      fs.rmSync(createdRoots.pop(), { recursive: true, force: true });
    }
  });

  it("lists a single workspace directory level with folders first", () => {
    const harness = createHarness();
    fs.mkdirSync(path.join(harness.workspaceRoot, "src"));
    fs.writeFileSync(path.join(harness.workspaceRoot, "package.json"), "{}");
    fs.writeFileSync(path.join(harness.workspaceRoot, ".env"), "secret");

    harness.handler({ headers: { host: "127.0.0.1:3000" }, url: "/api/workspace-tree" }, {});

    expect(harness.recorder.calls[0]).toMatchObject({
      statusCode: 200,
      payload: {
        ok: true,
        path: harness.workspaceRoot,
        items: [
          expect.objectContaining({ name: "src", kind: "目录" }),
          expect.objectContaining({ name: "package.json", kind: "文件" }),
        ],
      },
    });
    expect(harness.recorder.calls[0].payload.items).toHaveLength(2);
  });

  it("lists nested children for a requested workspace directory", () => {
    const harness = createHarness();
    const srcDir = path.join(harness.workspaceRoot, "src");
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, "App.jsx"), "export default null");

    harness.handler(
      { headers: { host: "127.0.0.1:3000" }, url: `/api/workspace-tree?path=${encodeURIComponent(srcDir)}` },
      {},
    );

    expect(harness.recorder.calls[0]).toMatchObject({
      statusCode: 200,
      payload: {
        ok: true,
        path: srcDir,
        items: [expect.objectContaining({ name: "App.jsx", kind: "文件" })],
      },
    });
  });

  it("rejects paths outside the workspace root", () => {
    const harness = createHarness();
    const outsidePath = path.join(os.tmpdir(), "not-allowed");

    harness.handler(
      { headers: { host: "127.0.0.1:3000" }, url: `/api/workspace-tree?path=${encodeURIComponent(outsidePath)}` },
      {},
    );

    expect(harness.recorder.calls[0]).toMatchObject({
      statusCode: 403,
      payload: {
        ok: false,
        error: "Path is outside the workspace root",
      },
    });
  });

  it("filters across the workspace and returns a pruned tree of matching files", () => {
    const harness = createHarness();
    const docsDir = path.join(harness.workspaceRoot, "docs");
    const testsDir = path.join(harness.workspaceRoot, "tests");
    fs.mkdirSync(docsDir);
    fs.mkdirSync(testsDir);
    fs.writeFileSync(path.join(harness.workspaceRoot, "README.md"), "# readme");
    fs.writeFileSync(path.join(harness.workspaceRoot, "package.json"), "{}");
    fs.writeFileSync(path.join(docsDir, "guide.md"), "# guide");
    fs.writeFileSync(path.join(docsDir, "notes.txt"), "notes");
    fs.writeFileSync(path.join(testsDir, "test01.js"), "export default null");
    fs.writeFileSync(path.join(testsDir, "testA.js"), "export default null");

    harness.handler(
      { headers: { host: "127.0.0.1:3000" }, url: "/api/workspace-tree?filter=test??.*,.md" },
      {},
    );

    expect(harness.recorder.calls[0]).toMatchObject({
      statusCode: 200,
      payload: {
        ok: true,
        filter: "test??.*,.md",
        path: harness.workspaceRoot,
        items: [
          expect.objectContaining({
            name: "docs",
            kind: "目录",
            children: [expect.objectContaining({ name: "guide.md", kind: "文件" })],
          }),
          expect.objectContaining({
            name: "tests",
            kind: "目录",
            children: [expect.objectContaining({ name: "test01.js", kind: "文件" })],
          }),
          expect.objectContaining({ name: "README.md", kind: "文件" }),
        ],
      },
    });
    expect(harness.recorder.calls[0].payload.items).toHaveLength(3);
  });
});
