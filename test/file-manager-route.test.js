import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createFileManagerHandler } = require("../server/routes/file-manager");

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
});
