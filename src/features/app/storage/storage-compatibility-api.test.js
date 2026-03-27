import { describe, expect, it } from "vitest";
import * as storageApi from "@/features/app/storage";

describe("storage compatibility API", () => {
  it("only exposes the small compatibility surface", () => {
    expect(Object.keys(storageApi).sort()).toEqual([
      "defaultInspectorPanelWidth",
      "loadStoredTheme",
      "maxInspectorPanelWidth",
      "minInspectorPanelWidth",
      "themeStorageKey",
      "useAppPersistence",
    ]);
  });
});
