import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createFileManagerHandler, createFileManagerHandlers } = require("../server/routes/file-manager");

describe("createFileManagerHandler", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    vi.restoreAllMocks();
  });

  it("reveals files in Finder on macOS", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commandcenter-reveal-"));
    const filePath = path.join(tempDir, "demo.txt");
    await fs.writeFile(filePath, "hello");

    const execFileAsync = vi.fn(async () => ({}));
    const sendJson = vi.fn();
    const handler = createFileManagerHandler({
      execFileAsync,
      parseRequestBody: vi.fn(async () => ({ path: filePath })),
      sendJson,
      platform: "darwin",
    });

    await handler({}, {});

    expect(execFileAsync).toHaveBeenCalledWith("open", ["-R", filePath]);
    expect(sendJson).toHaveBeenCalledWith(
      {},
      200,
      expect.objectContaining({
        ok: true,
        label: "Finder",
        path: filePath,
      }),
    );
  });

  it("opens directories in Finder on macOS", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commandcenter-open-directory-"));

    const execFileAsync = vi.fn(async () => ({}));
    const sendJson = vi.fn();
    const handler = createFileManagerHandler({
      execFileAsync,
      parseRequestBody: vi.fn(async () => ({ path: tempDir })),
      sendJson,
      platform: "darwin",
    });

    await handler({}, {});

    expect(execFileAsync).toHaveBeenCalledWith("open", [tempDir]);
    expect(sendJson).toHaveBeenCalledWith(
      {},
      200,
      expect.objectContaining({
        ok: true,
        label: "Finder",
        path: tempDir,
      }),
    );
  });

  it("saves pasted clipboard uploads into the requested directory without overwriting existing files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commandcenter-paste-"));
    await fs.writeFile(path.join(tempDir, "clip.png"), "existing");

    const sendJson = vi.fn();
    const { handleFileManagerPaste } = createFileManagerHandlers({
      execFileAsync: vi.fn(async () => ({})),
      parseRequestBody: vi.fn(async () => ({
        directoryPath: tempDir,
        entries: [
          {
            kind: "upload",
            name: "clip.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      })),
      sendJson,
    });

    await handleFileManagerPaste({}, {});

    const savedPath = path.join(tempDir, "clip-1.png");
    expect(await fs.readFile(savedPath, "utf8")).toBe("hello");
    expect(sendJson).toHaveBeenCalledWith(
      {},
      200,
      expect.objectContaining({
        ok: true,
        directoryPath: tempDir,
        items: [expect.objectContaining({ path: savedPath, name: "clip-1.png", kind: "文件" })],
      }),
    );
  });

  it("renames files in place", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commandcenter-rename-file-"));
    const filePath = path.join(tempDir, "demo.txt");
    await fs.writeFile(filePath, "hello");

    const sendJson = vi.fn();
    const { handleFileManagerRename } = createFileManagerHandlers({
      execFileAsync: vi.fn(async () => ({})),
      parseRequestBody: vi.fn(async () => ({ path: filePath, nextName: "renamed.md" })),
      sendJson,
    });

    await handleFileManagerRename({}, {});

    const renamedPath = path.join(tempDir, "renamed.md");
    expect(await fs.readFile(renamedPath, "utf8")).toBe("hello");
    await expect(fs.access(filePath)).rejects.toThrow();
    expect(sendJson).toHaveBeenCalledWith(
      {},
      200,
      expect.objectContaining({
        ok: true,
        path: filePath,
        nextPath: renamedPath,
        name: "renamed.md",
        kind: "文件",
      }),
    );
  });

  it("rejects invalid rename targets", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commandcenter-rename-invalid-"));
    const filePath = path.join(tempDir, "demo.txt");
    await fs.writeFile(filePath, "hello");

    const sendJson = vi.fn();
    const { handleFileManagerRename } = createFileManagerHandlers({
      execFileAsync: vi.fn(async () => ({})),
      parseRequestBody: vi.fn(async () => ({ path: filePath, nextName: "../oops.txt" })),
      sendJson,
    });

    await handleFileManagerRename({}, {});

    expect(sendJson).toHaveBeenCalledWith({}, 400, { ok: false, error: "Invalid target name" });
  });
});
