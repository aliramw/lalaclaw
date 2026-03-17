import { describe, expect, it } from "vitest";
import { normalizeStatusKey } from "@/features/session/status-display";

describe("normalizeStatusKey", () => {
  it("treats 运行中 as a running status", () => {
    expect(normalizeStatusKey("运行中")).toBe("running");
  });
});
