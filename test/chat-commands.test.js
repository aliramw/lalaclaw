import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  parseFastCommand,
  parseModelCommand,
  parseSessionResetCommand,
  parseSlashCommandState,
} = require("../server/formatters");

describe("chat-commands", () => {
  it("parses fast and think slash commands", () => {
    expect(parseSlashCommandState("/fast on")).toEqual({ kind: "fastMode", value: true });
    expect(parseSlashCommandState("/fast: off")).toEqual({ kind: "fastMode", value: false });
    expect(parseSlashCommandState("/fast off")).toEqual({ kind: "fastMode", value: false });
    expect(parseSlashCommandState("/think HIGH", (value) => String(value || "").toLowerCase())).toEqual({
      kind: "thinkMode",
      value: "high",
    });
    expect(parseSlashCommandState("/t: medium", (value) => String(value || "").toLowerCase())).toEqual({
      kind: "thinkMode",
      value: "medium",
    });
    expect(parseSlashCommandState("/think turbo", () => "")).toBeNull();
  });

  it("parses explicit fast command actions", () => {
    expect(parseFastCommand("/fast")).toEqual({ kind: "fast", action: "status" });
    expect(parseFastCommand("/fast: status")).toEqual({ kind: "fast", action: "status" });
    expect(parseFastCommand("/fast on")).toEqual({ kind: "fast", action: "on" });
    expect(parseFastCommand("/fast off")).toEqual({ kind: "fast", action: "off" });
    expect(parseFastCommand("/fast maybe")).toEqual({ kind: "fast", action: "invalid" });
    expect(parseFastCommand("hello")).toBeNull();
  });

  it("parses model slash commands", () => {
    expect(parseModelCommand("/model")).toEqual({ kind: "model", action: "status" });
    expect(parseModelCommand("/model: status")).toEqual({ kind: "model", action: "status" });
    expect(parseModelCommand("/model status")).toEqual({ kind: "model", action: "status" });
    expect(parseModelCommand("/models")).toEqual({ kind: "model", action: "list" });
    expect(parseModelCommand("/model list")).toEqual({ kind: "model", action: "list" });
    expect(parseModelCommand("/model gpt-5-mini")).toEqual({ kind: "model", action: "set", value: "gpt-5-mini" });
    expect(parseModelCommand("hello")).toBeNull();
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
