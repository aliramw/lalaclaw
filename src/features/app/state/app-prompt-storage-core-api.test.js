import { describe, expect, it } from "vitest";
import * as appPromptStorage from "@/features/app/state/app-prompt-storage";

describe("app-prompt-storage core API", () => {
  it("only exposes the centralized prompt storage contracts", () => {
    expect(Object.keys(appPromptStorage).sort()).toEqual([
      "cleanWrappedUserMessage",
      "extractUserPromptHistory",
      "loadStoredPromptDrafts",
      "loadStoredPromptHistory",
      "promptDraftStorageKey",
      "promptHistoryLimit",
      "promptHistoryStorageKey",
      "sanitizePromptDraftsMap",
      "sanitizePromptHistoryMap",
    ]);
  });
});
