import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conditional and duplicate Tailwind classes", () => {
    expect(cn("px-2", false && "hidden", "px-4", ["text-sm"])).toBe("px-4 text-sm");
  });
});
