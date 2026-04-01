import { describe, expect, it } from "vitest";
import * as appChatScrollStorage from "@/features/app/state/app-chat-scroll-storage";

describe("app-chat-scroll-storage core API", () => {
  it("only exposes the centralized chat scroll storage contracts", () => {
    expect(Object.keys(appChatScrollStorage).sort()).toEqual([
      "chatScrollStorageKey",
      "loadStoredChatScrollTops",
      "persistChatScrollTops",
    ]);
  });
});
