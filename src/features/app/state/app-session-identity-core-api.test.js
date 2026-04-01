import { describe, expect, it } from "vitest";
import * as appSessionIdentity from "@/features/app/state/app-session-identity";

describe("app-session-identity core API", () => {
  it("only exposes the centralized session identity contracts", () => {
    expect(Object.keys(appSessionIdentity).sort()).toEqual([
      "createAgentSessionUser",
      "createAgentTabId",
      "createConversationKey",
      "defaultSessionUser",
      "normalizeAgentId",
      "normalizeStoredConversationKey",
      "parseStoredConversationKey",
      "resolveAgentIdFromTabId",
      "sanitizeSessionUser",
    ]);
  });
});
