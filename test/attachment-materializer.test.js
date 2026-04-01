import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { materializeInlineAttachments } from "../server/services/attachment-materializer.ts";

function buildLocalDayStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("materializeInlineAttachments", () => {
  const tempRoots = [];

  afterEach(() => {
    while (tempRoots.length) {
      const tempRoot = tempRoots.pop();
      if (tempRoot && fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
    vi.restoreAllMocks();
  });

  it("writes inline data-url attachments to disk and backfills path fields", () => {
    const now = new Date("2026-03-25T00:40:00+08:00");
    vi.setSystemTime(now);
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-attachment-materializer-"));
    tempRoots.push(rootDir);

    const [attachment] = materializeInlineAttachments(
      [
        {
          id: "image-1",
          kind: "image",
          name: "wukong-mibai-eyes-brave.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,QUFBQQ==",
        },
      ],
      { rootDir },
    );

    expect(attachment.fullPath).toMatch(
      new RegExp(`${rootDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/media/web-uploads/${buildLocalDayStamp(now)}/.+-wukong-mibai-eyes-brave\\.png$`),
    );
    expect(attachment.path).toBe(attachment.fullPath);
    expect(fs.existsSync(attachment.fullPath)).toBe(true);
    expect(fs.readFileSync(attachment.fullPath).toString("utf8")).toBe("AAAA");
  });

  it("keeps existing attachment paths untouched", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "lalaclaw-attachment-materializer-"));
    tempRoots.push(rootDir);

    const [attachment] = materializeInlineAttachments(
      [
        {
          id: "image-1",
          kind: "image",
          name: "avatar.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,QUFBQQ==",
          fullPath: "/existing/avatar.png",
          path: "/existing/avatar.png",
        },
      ],
      { rootDir },
    );

    expect(attachment.fullPath).toBe("/existing/avatar.png");
    expect(attachment.path).toBe("/existing/avatar.png");
    expect(fs.existsSync(path.join(rootDir, "media", "web-uploads"))).toBe(false);
  });
});
