import { describe, expect, it } from "vitest";
import { createSessionStore, normalizeSessionUser, normalizeThinkMode } from "../server/core/session-store.ts";

describe("session-store", () => {
  it("normalizes session users and think modes", () => {
    expect(normalizeSessionUser("  Foo Bar/@baz  ")).toBe("Foo-Bar-baz");
    expect(normalizeSessionUser(":::")).toBe("command-center");
    expect(normalizeThinkMode(" HIGH ")).toBe("high");
    expect(normalizeThinkMode("turbo")).toBe("");
  });

  it("merges preferences and drops invalid fields", () => {
    const store = createSessionStore({
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: (agentId) => (agentId === "worker" ? "gpt-5-mini" : "gpt-5"),
      resolveCanonicalModelId: (value) => (value === "mini" ? "gpt-5-mini" : value),
    });

    expect(
      store.setSessionPreferences("Alice / demo", {
        agentId: "worker",
        model: "mini",
        fastMode: true,
        thinkMode: "HIGH",
      }),
    ).toEqual({
      agentId: "worker",
      model: "mini",
      fastMode: true,
      thinkMode: "high",
    });

    expect(store.resolveSessionAgentId("Alice / demo")).toBe("worker");
    expect(store.resolveSessionModel("Alice / demo")).toBe("gpt-5-mini");
    expect(store.resolveSessionFastMode("Alice / demo")).toBe(true);
    expect(store.resolveSessionThinkMode("Alice / demo")).toBe("high");

    expect(
      store.setSessionPreferences("Alice / demo", {
        model: "",
        agentId: "",
        fastMode: "yes",
        thinkMode: "turbo",
      }),
    ).toEqual({});
    expect(store.getSessionPreferences("Alice / demo")).toEqual({});
    expect(store.resolveSessionAgentId("Alice / demo")).toBe("main");
    expect(store.resolveSessionModel("Alice / demo")).toBe("gpt-5");
    expect(store.resolveSessionThinkMode("Alice / demo")).toBe("off");
  });

  it("stores normalized local conversations ordered by timestamp", () => {
    const store = createSessionStore({
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "gpt-5",
      resolveCanonicalModelId: (value) => value,
    });

    const merged = store.appendLocalSessionConversation("demo", [
      { role: "assistant", content: "  后到  ", timestamp: 30, tokenBadge: "↑2" },
      { role: "user", content: "先到", timestamp: 10 },
      { role: "", content: "无效", timestamp: 20 },
      { role: "assistant", content: "   ", timestamp: 40 },
    ]);

    expect(merged).toEqual([
      { role: "user", content: "先到", timestamp: 10 },
      { role: "assistant", content: "后到", timestamp: 30, tokenBadge: "↑2" },
    ]);
    expect(store.getLocalSessionConversation("demo")).toEqual(merged);
  });

  it("stores local file entries with text and attachment paths", () => {
    const store = createSessionStore({
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "gpt-5",
      resolveCanonicalModelId: (value) => value,
    });

    const merged = store.appendLocalSessionFileEntries("demo", [
      {
        role: "user",
        content: "看这张图 /tmp/ref.png",
        timestamp: 20,
        attachments: [{ name: "ref.png", path: "/tmp/ref.png", fullPath: "/tmp/ref.png", kind: "image" }],
      },
      {
        role: "user",
        content: "   ",
        timestamp: 10,
        attachments: [],
      },
    ]);

    expect(merged).toEqual([
      {
        type: "message",
        timestamp: 20,
        message: {
          role: "user",
          timestamp: 20,
          content: [{ type: "text", text: "看这张图 /tmp/ref.png" }],
          attachments: [{ id: "", kind: "image", name: "ref.png", path: "/tmp/ref.png", fullPath: "/tmp/ref.png" }],
        },
      },
    ]);
    expect(store.getLocalSessionFileEntries("demo")).toEqual(merged);
  });

  it("clears local conversation and file caches independently from preferences", () => {
    const store = createSessionStore({
      getDefaultAgentId: () => "main",
      getDefaultModelForAgent: () => "gpt-5",
      resolveCanonicalModelId: (value) => value,
    });

    store.setSessionPreferences("demo", { fastMode: true, thinkMode: "high" });
    store.appendLocalSessionConversation("demo", [{ role: "assistant", content: "hello", timestamp: 1 }]);
    store.appendLocalSessionFileEntries("demo", [{ role: "user", content: "touch notes.md", timestamp: 2, attachments: [] }]);

    store.clearLocalSessionConversation("demo");
    store.clearLocalSessionFileEntries("demo");

    expect(store.getLocalSessionConversation("demo")).toEqual([]);
    expect(store.getLocalSessionFileEntries("demo")).toEqual([]);
    expect(store.getSessionPreferences("demo")).toEqual({ fastMode: true, thinkMode: "high" });
  });
});
