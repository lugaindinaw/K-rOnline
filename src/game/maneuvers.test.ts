import { describe, expect, it } from "vitest";
import { LICENSE_MOMENTS } from "./licenseMoments";
import {
  EMPTY_MANEUVER,
  maneuverPassed,
  noteManeuverFrame,
  type ManeuverFacts,
  type ManeuverFrame,
} from "./maneuvers";
import { momentJudged, momentMission, momentTitle, type MomentId } from "./simpleMoments";

function frame(patch: Partial<ManeuverFrame> = {}): ManeuverFrame {
  return {
    dtSeconds: 0.1,
    speedMps: 0,
    headingDegrees: 0,
    offsetMeters: 0,
    brake: false,
    indicator: "off",
    gear: "D",
    rollMps: 0,
    roadName: "Regeringsgatan",
    startRoad: "Regeringsgatan",
    signal: null,
    actors: [],
    ...patch,
  };
}

function drive(frames: ManeuverFrame[]): ManeuverFacts {
  return frames.reduce((facts, item) => noteManeuverFrame(facts, item), EMPTY_MANEUVER);
}

const live = { speedKmh: 0, roadName: "Jakobsgatan", startRoad: "Regeringsgatan" };

describe("maneuver scoring", () => {
  it("passes reverse only after backing up and stopping", () => {
    const moving = drive(Array.from({ length: 30 }, () => frame({ gear: "R", speedMps: 3, dtSeconds: 0.1 })));
    expect(maneuverPassed("reverse", moving, { ...live, speedKmh: 11 })).toBe(false);
    const stopped = noteManeuverFrame(moving, frame({ gear: "R", speedMps: 0, brake: true }));
    expect(stopped.reverseMeters).toBeGreaterThanOrEqual(8);
    expect(maneuverPassed("reverse", stopped, live)).toBe(true);
  });

  it("requires both sides of the lane and a real heading change for a turn", () => {
    const straight = drive([frame({ speedMps: 4, offsetMeters: 0.2 })]);
    expect(maneuverPassed("lanes", straight, { ...live, speedKmh: 14 })).toBe(false);
    const changed = drive([
      frame({ speedMps: 4, offsetMeters: -1.2 }),
      frame({ speedMps: 4, offsetMeters: 1.2 }),
    ]);
    expect(maneuverPassed("lanes", changed, { ...live, speedKmh: 14 })).toBe(true);
    let turning = EMPTY_MANEUVER;
    for (let step = 0; step < 25; step += 1) {
      turning = noteManeuverFrame(turning, frame({ gear: "R", speedMps: 2, dtSeconds: 0.1, headingDegrees: 0 }));
    }
    for (let heading = 20; heading <= 140; heading += 20) {
      turning = noteManeuverFrame(turning, frame({ gear: "D", speedMps: 3, headingDegrees: heading, brake: heading === 140 }));
    }
    expect(maneuverPassed("turn", turning, live)).toBe(true);
  });

  it("keeps the exam failed until the car has left the start street", () => {
    expect(maneuverPassed("exam", EMPTY_MANEUVER, live)).toBe(false);
    const facts = drive([
      frame({ speedMps: 6, offsetMeters: -0.4, brake: true, indicator: "left", roadName: "Regeringsgatan" }),
    ]);
    expect(maneuverPassed("exam", facts, { speedKmh: 20, roadName: "Regeringsgatan", startRoad: "Regeringsgatan" })).toBe(false);
    const left = noteManeuverFrame(facts, frame({ speedMps: 6, offsetMeters: -0.4, roadName: "Jakobsgatan" }));
    expect(maneuverPassed("exam", left, { speedKmh: 20, roadName: "Jakobsgatan", startRoad: "Regeringsgatan" })).toBe(true);
  });

  it("turns the practice signal green only after a stop, then requires the driver to go", () => {
    const waiting = drive([
      frame({
        speedMps: 0,
        signal: "red",
        actors: [{ kind: "signal", gapMeters: 10, ahead: true }],
      }),
    ]);
    expect(waiting.stoppedAtRed).toBe(true);
    expect(maneuverPassed("lights", waiting, live)).toBe(false);
    const going = noteManeuverFrame(
      waiting,
      frame({ speedMps: 5, offsetMeters: -0.3, signal: "green", actors: [{ kind: "signal", gapMeters: 8, ahead: true }] }),
    );
    expect(maneuverPassed("lights", going, { ...live, speedKmh: 18 })).toBe(true);
  });
});

describe("hill, weather and railway", () => {
  it("fails a hill start that rolls and a rain speed that is too high", () => {
    const held = drive([frame({ brake: true, speedMps: 0 }), frame({ speedMps: 4, offsetMeters: -0.2 })]);
    expect(maneuverPassed("hill", held, live)).toBe(true);
    const rolled = drive([
      ...Array.from({ length: 16 }, () => frame({ speedMps: 0, rollMps: 2, dtSeconds: 0.1 })),
      frame({ speedMps: 4, brake: true }),
    ]);
    expect(maneuverPassed("hill", rolled, live)).toBe(false);
    const rain = drive([frame({ speedMps: 8, offsetMeters: -0.4 })]);
    expect(maneuverPassed("hazard", rain, { ...live, speedKmh: 29 })).toBe(true);
    const fast = drive([frame({ speedMps: 12, offsetMeters: -0.4 })]);
    expect(maneuverPassed("hazard", fast, { ...live, speedKmh: 43 })).toBe(false);
    const stopped = drive([
      frame({
        speedMps: 0,
        actors: [{ kind: "railway", gapMeters: 10, ahead: true }],
      }),
    ]);
    expect(maneuverPassed("railway", stopped, live)).toBe(false);
    const passed = noteManeuverFrame(stopped, frame({ speedMps: 3, actors: [{ kind: "railway", gapMeters: 2, ahead: false }] }));
    expect(maneuverPassed("railway", passed, { ...live, speedKmh: 11 })).toBe(true);
  });
});

describe("license menu", () => {
  it("lists every curriculum moment as something that can be started", () => {
    expect(LICENSE_MOMENTS.filter((item) => !item.playable)).toEqual([]);
    for (const item of LICENSE_MOMENTS) {
      const id = item.id as MomentId;
      expect(momentTitle(id, "left").length).toBeGreaterThan(2);
      expect(momentMission(id, "left").length).toBeGreaterThan(20);
      expect(momentJudged(id).length).toBeGreaterThan(0);
    }
    expect(momentMission("exam", null)).toContain("inte Trafikverkets");
    expect(momentMission("hill", null)).toContain("simulerad");
  });
});
