import { describe, expect, it } from "vitest";
import * as appStorage from "@/features/app/storage/app-storage";

describe("app-storage core API", () => {
  it("only exposes the remaining core storage and merge contracts", () => {
    expect(Object.keys(appStorage).sort()).toEqual([
      "loadStoredState",
      "persistUiStateSnapshot",
    ]);
  });
});
