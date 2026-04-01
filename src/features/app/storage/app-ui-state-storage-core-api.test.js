import { describe, expect, it } from "vitest";
import * as appUiStateStorage from "@/features/app/storage/app-ui-state-storage";

describe("app-ui-state-storage core API", () => {
  it("only exposes the ui state storage read/write implementation", () => {
    expect(Object.keys(appUiStateStorage).sort()).toEqual([
      "loadStoredState",
      "persistUiStateSnapshot",
    ]);
  });
});
