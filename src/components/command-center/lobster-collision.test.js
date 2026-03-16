import { describe, expect, it } from "vitest";
import { chooseCollisionRerouteTarget, findNearbyCollisionPairs } from "@/components/command-center/lobster-collision";

describe("findNearbyCollisionPairs", () => {
  it("returns nearby pairs without scanning isolated walkers", () => {
    const pairs = findNearbyCollisionPairs(
      [
        { centerX: 40, centerY: 40, fontSize: 48 },
        { centerX: 80, centerY: 72, fontSize: 72 },
        { centerX: 520, centerY: 520, fontSize: 72 },
        { centerX: 560, centerY: 552, fontSize: 72 },
        { centerX: 1200, centerY: 1200, fontSize: 48 },
      ],
      { baseCollisionDistance: 54 },
    );

    expect(pairs).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("returns no pairs for fewer than two walkers", () => {
    expect(findNearbyCollisionPairs([], { baseCollisionDistance: 54 })).toEqual([]);
    expect(findNearbyCollisionPairs([{ centerX: 20, centerY: 20, fontSize: 48 }], { baseCollisionDistance: 54 })).toEqual([]);
  });

  it("reroutes only one eligible walker and prefers companions over the primary lobster", () => {
    const current = {
      fontSize: 48,
      walker: { id: "main-lobster", type: "primary", lastRerouteAt: 0 },
    };
    const other = {
      fontSize: 72,
      walker: { id: "companion-1", type: "companion", lastRerouteAt: 0 },
    };

    expect(
      chooseCollisionRerouteTarget(current, other, {
        now: 2000,
        cooldownMs: 900,
        reroutedWalkerIds: new Set(),
      }),
    ).toBe(other);
  });

  it("skips walkers that already rerouted this tick or are still cooling down", () => {
    const current = {
      fontSize: 48,
      walker: { id: "main-lobster", type: "primary", lastRerouteAt: 1500 },
    };
    const other = {
      fontSize: 72,
      walker: { id: "companion-1", type: "companion", lastRerouteAt: 0 },
    };

    expect(
      chooseCollisionRerouteTarget(current, other, {
        now: 2000,
        cooldownMs: 900,
        reroutedWalkerIds: new Set(["companion-1"]),
      }),
    ).toBeNull();

    expect(
      chooseCollisionRerouteTarget(current, other, {
        now: 2000,
        cooldownMs: 900,
        reroutedWalkerIds: new Set(),
      }),
    ).toBe(other);
  });
});
