import { describe, expect, it } from "vitest";
import { EMPTY_CHECKS, freshIndicatorSide, momentComplete, reviewMoment, type MomentSnapshot } from "./simpleMoments";

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

  it("ignores a blinker that was already on when the exercise starts", () => {
    expect(freshIndicatorSide(null, "left")).toBeNull();
    expect(freshIndicatorSide("left", "left")).toBeNull();
    expect(freshIndicatorSide("off", "left")).toBe("left");
    expect(freshIndicatorSide("left", "right")).toBe("right");
  });

  it("finishes the night drive when speed, lane and a blinker are all done", () => {
    const base = snap({
      moment: "night",
      lines: ["Högsta fart: 18 km/h", "Största avstånd från mittlinjen: 1.2 m", "Blinkers före sväng: ingen sväng ännu"],
    });
    expect(momentComplete(base)).toBe(false);
    const missingBlinker = reviewMoment(base);
    expect(missingBlinker.live).toContain("Q eller E");
    expect(missingBlinker.points.find((point) => point.title === "Blinkers")?.mark).toBe("träna");
    const done = { ...base, checks: { ...EMPTY_CHECKS, left: true } };
    expect(momentComplete(done)).toBe(true);
    const review = reviewMoment(done);
    expect(review.score).toBe(100);
    expect(review.points.map((point) => point.title)).toEqual(["Fart", "Placering", "Blinkers"]);
  });

  it("tells the night driver to steer back when the car leaves the lane", () => {
    const review = reviewMoment(
      snap({
        moment: "night",
        lines: ["Högsta fart: 20 km/h", "Största avstånd från mittlinjen: 6.4 m"],
        checks: { ...EMPTY_CHECKS, right: true },
      }),
    );
    expect(review.points.find((point) => point.title === "Placering")?.detail).toContain("6.4 m");
    expect(review.points.find((point) => point.title === "Placering")?.detail).toContain("A eller D");
    expect(momentComplete(snap({
      moment: "night",
      lines: ["Högsta fart: 20 km/h", "Största avstånd från mittlinjen: 6.4 m"],
      checks: { ...EMPTY_CHECKS, right: true },
    }))).toBe(false);
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
