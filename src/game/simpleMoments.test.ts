import { describe, expect, it } from "vitest";
import { EMPTY_CHECKS, freshIndicatorSide, goalStreet, momentComplete, reviewMoment, type MomentSnapshot } from "./simpleMoments";

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
    targetRoad: null,
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

  it("scores the night drive on speed and lane, and skips blinkers when the task has no turn", () => {
    const straight = snap({
      moment: "night",
      lines: ["Högsta fart: 18 km/h", "Största avstånd från mittlinjen: 1.2 m", "Blinkers före sväng: ingen sväng ännu"],
      checks: { ...EMPTY_CHECKS, left: true },
    });
    expect(momentComplete(straight)).toBe(true);
    const review = reviewMoment(straight);
    expect(review.score).toBe(100);
    expect(review.points.map((point) => point.title)).toEqual(["Fart", "Placering"]);
    const turnedWithoutBlinker = reviewMoment(
      snap({
        moment: "night",
        lines: ["Högsta fart: 8 km/h", "Största avstånd från mittlinjen: 1.2 m", "Blinkers före sväng: inte använd"],
      }),
    );
    expect(turnedWithoutBlinker.points.map((point) => point.title)).toEqual(["Fart", "Placering"]);
    expect(turnedWithoutBlinker.points.find((point) => point.title === "Fart")?.detail).toContain("12 km/h");
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

  it("picks Jakobsgatan as the goal when that street is loaded", () => {
    expect(goalStreet(["Regeringsgatan", "Jakobsgatan", "Strömgatan"])).toBe("Jakobsgatan");
    expect(goalStreet(["Regeringsgatan"])).toBeNull();
  });

  it("finishes the goal drive only on the named street", () => {
    const rolling = snap({
      moment: "independent",
      targetRoad: "Jakobsgatan",
      roadName: "Regeringsgatan",
      startRoad: "Regeringsgatan",
      lines: ["Högsta fart: 16 km/h", "Största avstånd från mittlinjen: 1.1 m"],
    });
    expect(momentComplete(rolling)).toBe(false);
    expect(reviewMoment(rolling).live).toContain("Jakobsgatan");
    const arrived = { ...rolling, roadName: "Jakobsgatan" };
    expect(momentComplete(arrived)).toBe(true);
    expect(reviewMoment(arrived).score).toBe(100);
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
