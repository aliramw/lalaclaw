import { describe, expect, it } from "vitest";
import { deriveLegacyChatRunState, selectChatRunBusy } from "@/features/chat/state/chat-session-state";

describe("deriveLegacyChatRunState", () => {
  it("keeps busy ownership on the tracked run instead of stale message flags", () => {
    const run = deriveLegacyChatRunState({
      messages: [
        { role: "user", content: "继续", timestamp: 1 },
        { role: "assistant", content: "正在思考…", timestamp: 2, pending: true },
      ],
      rawBusy: false,
      sessionStatus: "待命",
      tabId: "agent:main",
    });

    expect(run.status).toBe("idle");
    expect(selectChatRunBusy(run)).toBe(false);
  });

  it("treats a tracked pending turn as the active run even before stream text arrives", () => {
    const run = deriveLegacyChatRunState({
      conversationKey: "command-center-main:main",
      messages: [
        { role: "user", content: "继续", timestamp: 1 },
      ],
      pendingEntry: {
        key: "command-center-main:main",
        tabId: "agent:main",
        startedAt: 100,
        pendingTimestamp: 120,
        userMessage: { id: "msg-user-1", role: "user", content: "继续", timestamp: 100 },
      },
      rawBusy: true,
      sessionStatus: "运行中",
      tabId: "agent:main",
    });

    expect(run.status).toBe("starting");
    expect(run.runId).toBe("command-center-main:main");
    expect(selectChatRunBusy(run)).toBe(true);
  });

  it("lets runtime status drive the run for active tabs without a local pending bubble", () => {
    const run = deriveLegacyChatRunState({
      allowSessionStatusBusy: true,
      messages: [
        { role: "user", content: "上一句", timestamp: 1 },
        { role: "assistant", content: "上一句回复", timestamp: 2 },
      ],
      rawBusy: false,
      sessionStatus: "运行中",
      tabId: "agent:main::im",
    });

    expect(run.status).toBe("streaming");
    expect(selectChatRunBusy(run)).toBe(true);
    expect(run.streamText).toBe("上一句回复");
  });
});
