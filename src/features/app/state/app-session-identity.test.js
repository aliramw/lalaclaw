import { describe, expect, it } from "vitest";
import {
  createConversationKey,
  normalizeStoredConversationKey,
  parseStoredConversationKey,
} from "@/features/app/state/app-session-identity";

describe("app-session-identity stored conversation keys", () => {
  it("parses a stored conversation key into session user and agent id", () => {
    expect(parseStoredConversationKey("command-center-expert:expert")).toEqual({
      sessionUser: "command-center-expert",
      agentId: "expert",
    });
  });

  it("returns null for malformed stored conversation keys", () => {
    expect(parseStoredConversationKey("")).toBeNull();
    expect(parseStoredConversationKey("missing-separator")).toBeNull();
    expect(parseStoredConversationKey(":main")).toBeNull();
    expect(parseStoredConversationKey("command-center:")).toBeNull();
  });

  it("canonicalizes legacy IM stored conversation keys through the shared normalize path", () => {
    const dingtalkSessionUser = '{"channel":"dingtalk-connector","peerid":"398058","sendername":"马锐拉"}';
    expect(normalizeStoredConversationKey(`${dingtalkSessionUser}:main`)).toBe(
      createConversationKey("agent:main:dingtalk-connector:direct:398058", "main"),
    );
  });

  it("passes through non-conversation strings unchanged", () => {
    expect(normalizeStoredConversationKey("bad-key")).toBe("bad-key");
  });
});
