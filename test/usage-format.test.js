import { describe, expect, it } from "vitest";
import {
  clip,
  collectLatestRunUsage,
  formatTokenBadge,
  formatTimestamp,
  parseCompactNumber,
  parseTokenDisplay,
  tailLines,
} from "../server/formatters/usage-format.ts";

describe("usage-format", () => {
  it("clips values and parses compact numbers/tokens", () => {
    expect(clip("abcdefgh", 5)).toBe("abcd…");
    expect(parseCompactNumber("1.5k")).toBe(1500);
    expect(parseCompactNumber("12m")).toBe(12000000);
    expect(parseTokenDisplay("1.5k in / 320 out")).toEqual({
      input: 1500,
      output: 320,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("formats token badges and extracts usage from the latest run", () => {
    expect(
      formatTokenBadge({
        input: 1500,
        output: 320,
        cacheRead: 12,
        cacheWrite: 3,
      }),
    ).toBe("↑1.5k ↓320 R12 W3");

    expect(
      collectLatestRunUsage([
        { message: { role: "assistant", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } } },
        { message: { role: "user" } },
        { message: { role: "assistant", usage: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5 } } },
        { message: { role: "assistant", usage: { input: 6, output: 7, cacheRead: 8, cacheWrite: 9 } } },
      ]),
    ).toEqual({
      input: 8,
      output: 10,
      cacheRead: 12,
      cacheWrite: 14,
      count: 2,
    });
  });

  it("formats timestamps and tails log lines", () => {
    expect(formatTimestamp(Date.UTC(2026, 2, 15, 10, 0))).toMatch(/\d{2}\/\d{2}\s\d{2}:\d{2}/);
    expect(tailLines("a\nb\nc\nd", 2)).toEqual(["c", "d"]);
    expect(tailLines("", 2)).toEqual([]);
  });
});
