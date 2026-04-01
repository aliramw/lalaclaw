import { describe, expect, it } from "vitest";
import * as appStorage from "@/features/app/storage/app-storage";
import * as appUiStateStorage from "@/features/app/storage/app-ui-state-storage";

describe("app-storage shell compatibility", () => {
  it("re-exports the same ui state storage functions by identity", () => {
    expect(appStorage.loadStoredState).toBe(appUiStateStorage.loadStoredState);
    expect(appStorage.persistUiStateSnapshot).toBe(appUiStateStorage.persistUiStateSnapshot);
  });
});
