import { describe, expect, it } from "vitest";
import * as appPendingStorage from "@/features/app/state/app-pending-storage";

describe("app-pending-storage core API", () => {
  it("only exposes the centralized pending storage contracts", () => {
    expect(Object.keys(appPendingStorage).sort()).toEqual([
      "loadPendingChatTurns",
      "pendingChatStorageKey",
      "pruneCompletedPendingChatTurns",
      "sanitizePendingChatTurnsMap",
    ]);
  });
});
