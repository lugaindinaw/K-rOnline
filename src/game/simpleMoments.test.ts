import { describe, expect, it } from "vitest";
import { EMPTY_CHECKS, momentComplete, reviewMoment, type MomentSnapshot } from "./simpleMoments";

function snap(overrides: Partial<MomentSnapshot>): MomentSnapshot {
  return {
    moment: "safety",
    lines: [],
    speedKmh: 0,
    roadName: "Regeringsgatan",
    startRoad: "Regeringsgatan",
    trafficCount: 0,
    nearestCarMeters: null,
    speedNearCarKmh: null,
    goal: null,
    indicator: "off",
    checks: EMPTY_CHECKS,
    ...overrides,
  };
}

describe("simple moments", () => {
  it("finishes the safety check only after every control is tried", () => {
    expect(momentComplete(snap({}))).toBe(false);
    const done = snap({ checks: { left: true, right: true, brake: true, gas: true } });
    expect(momentComplete(done)).toBe(true);
    expect(reviewMoment(done).score).toBe(100);
  });

  it("finishes parking when the car has moved and then stopped", () => {
    const rolling = snap({
      moment: "parking",
      lines: ["Högsta fart: 8 km/h", "Största avstånd från mittlinjen: 0.4 m"],
      speedKmh: 8,
      checks: { ...EMPTY_CHECKS, gas: true },
    });
    expect(momentComplete(rolling)).toBe(false);
    expect(
      momentComplete({ ...rolling, speedKmh: 0, checks: { ...EMPTY_CHECKS, gas: true, brake: true } }),
    ).toBe(true);
  });

  it("asks the city driver to stop at the yield before the turn", () => {
    const review = reviewMoment(
      snap({
        moment: "city",
        goal: "left",
        lines: [
          "Högsta fart: 12 km/h",
          "Broms använd: nej",
          "Blinkers före sväng: ingen sväng ännu",
          "Väjningsplikt nod 507946854: 11 m framför bilen",
        ],
        indicator: "off",
      }),
    );
    expect(review.live).toContain("väjningsplikten");
  });
});
