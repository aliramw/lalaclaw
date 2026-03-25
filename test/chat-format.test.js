import { describe, expect, it } from "vitest";
import {
  buildOpenClawMessageContent,
  describeAttachmentForModel,
  getMessageAttachments,
  normalizeChatMessage,
  summarizeMessages,
} from "../server/formatters/chat-format.ts";

describe("chat-format", () => {
  it("normalizes chat messages and sanitizes attachments", () => {
    expect(
      normalizeChatMessage({
        content: ["hello", { type: "text", text: "world" }, { type: "toolCall", text: "ignored" }],
      }),
    ).toBe("hello\nworld");

    expect(
      getMessageAttachments({
        attachments: [
          { name: " plan.md ", kind: "text", textContent: "todo" },
          { kind: "image" },
        ],
      }),
    ).toEqual([
      {
        id: "",
        kind: "text",
        name: "plan.md",
        path: "",
        fullPath: "",
        mimeType: "",
        size: 0,
        dataUrl: "",
        textContent: "todo",
        truncated: false,
      },
    ]);
  });

  it("builds model content for chat and responses styles", () => {
    const message = {
      content: "请处理附件",
      attachments: [
        { name: "notes.txt", kind: "text", textContent: "todo", truncated: true, fullPath: "/tmp/notes.txt" },
        { name: "screen.png", kind: "image", dataUrl: "data:image/png;base64,AAAA", fullPath: "/tmp/screen.png" },
      ],
    };

    expect(describeAttachmentForModel(message.attachments[0])).toContain("[内容已截断]");
    expect(describeAttachmentForModel(message.attachments[1])).toContain("路径: /tmp/screen.png");
    expect(buildOpenClawMessageContent(message, "chat")).toEqual([
      { type: "text", text: "请处理附件" },
      { type: "text", text: "附件 notes.txt\n路径: /tmp/notes.txt\n内容:\ntodo\n[内容已截断]" },
      { type: "text", text: "附件 screen.png 已附加。\n路径: /tmp/screen.png" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
    expect(buildOpenClawMessageContent(message, "responses")).toEqual([
      { type: "input_text", text: "请处理附件" },
      { type: "input_text", text: "附件 notes.txt\n路径: /tmp/notes.txt\n内容:\ntodo\n[内容已截断]" },
      { type: "input_text", text: "附件 screen.png 已附加。\n路径: /tmp/screen.png" },
      { type: "input_image", image_url: "data:image/png;base64,AAAA" },
    ]);
  });

  it("summarizes recent messages with attachment names", () => {
    expect(
      summarizeMessages([
        { role: "system", content: "ignore" },
        { role: "user", content: "  hello   world  " },
        { role: "assistant", content: "", attachments: [{ name: "report.md" }] },
      ]),
    ).toBe("user: hello world | assistant: 附件消息 [report.md]");
  });
});
