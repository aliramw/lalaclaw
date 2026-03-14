import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  parseFastCommand,
  parseSessionResetCommand,
  parseSlashCommandState,
} = require("../server/formatters");

describe("chat-commands", () => {
  it("parses fast and think slash commands", () => {
    expect(parseSlashCommandState("/fast on")).toEqual({ kind: "fastMode", value: true });
    expect(parseSlashCommandState("/fast off")).toEqual({ kind: "fastMode", value: false });
    expect(parseSlashCommandState("/think HIGH", (value) => String(value || "").toLowerCase())).toEqual({
      kind: "thinkMode",
      value: "high",
    });
    expect(parseSlashCommandState("/think turbo", () => "")).toBeNull();
  });

  it("parses explicit fast command actions", () => {
    expect(parseFastCommand("/fast")).toEqual({ kind: "fast", action: "status" });
    expect(parseFastCommand("/fast on")).toEqual({ kind: "fast", action: "on" });
    expect(parseFastCommand("/fast off")).toEqual({ kind: "fast", action: "off" });
    expect(parseFastCommand("/fast maybe")).toEqual({ kind: "fast", action: "invalid" });
    expect(parseFastCommand("hello")).toBeNull();
  });

  it("parses reset/new commands with optional tail prompts", () => {
    expect(parseSessionResetCommand("/new")).toEqual({ kind: "new", tail: "" });
    expect(parseSessionResetCommand("/reset continue work")).toEqual({
      kind: "reset",
      tail: "continue work",
    });
    expect(parseSessionResetCommand("continue work")).toBeNull();
  });
});
