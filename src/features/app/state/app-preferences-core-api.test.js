import { describe, expect, it } from "vitest";
import * as appPreferences from "@/features/app/state/app-preferences";

describe("app-preferences core API", () => {
  it("only exposes the centralized UI preference defaults and sanitizers", () => {
    expect(Object.keys(appPreferences).sort()).toEqual([
      "defaultChatFontSize",
      "defaultComposerSendMode",
      "defaultInspectorPanelWidth",
      "defaultTab",
      "maxInspectorPanelWidth",
      "minInspectorPanelWidth",
      "sanitizeInspectorPanelWidth",
      "sanitizeUserLabel",
    ]);
  });
});
