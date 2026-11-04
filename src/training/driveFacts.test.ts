import { describe, expect, it } from "vitest";
import { noteDriveFrame, driveFactsText, EMPTY_DRIVE_FACTS, yieldAheadNote, type DriveFacts } from "./driveFacts";

const here = { lat: 59.33, lng: 18.06 };

function frame(overrides: Partial<Parameters<typeof noteDriveFrame>[1]> = {}) {
  return {
    position: here,
    headingDegrees: 0,
    speedMps: 4,
    brake: false,
    steer: 0,
    offsetMeters: 0.4,
    indicator: "off" as const,
    giveWay: [] as { id: string; position: { lat: number; lng: number } }[],
    ...overrides,
  };
}

describe("drive facts", () => {
  it("records speed, brake, steering and offset without grading a test", () => {
    let facts: DriveFacts = EMPTY_DRIVE_FACTS;
    facts = noteDriveFrame(facts, frame({ speedMps: 6, brake: true, steer: -0.8, offsetMeters: -1.2 }));
    const text = driveFactsText(facts).join(" ");
    expect(facts.maxSpeedMps).toBe(6);
    expect(facts.brakeUsed).toBe(true);
    expect(facts.steerLeft).toBe(true);
    expect(facts.maxAbsOffsetMeters).toBeCloseTo(1.2, 5);
    expect(text).toContain("Högsta fart");
    expect(text).not.toContain("godkänd");
    expect(text).toContain("Inga väjningspliktsnoder");
  });

  it("records a yield stop only for a supplied give_way node", () => {
    const sign = { id: "yield:507946854", position: { lat: here.lat + 20 / 111320, lng: here.lng } };
    let facts = noteDriveFrame(EMPTY_DRIVE_FACTS, frame({ giveWay: [sign], speedMps: 3 }));
    expect(facts.yields[0]?.approached).toBe(true);
    expect(yieldAheadNote(facts)).toContain("507946854");
    facts = noteDriveFrame(facts, frame({ giveWay: [sign], position: { lat: here.lat + 8 / 111320, lng: here.lng }, speedMps: 0 }));
    expect(facts.yields[0]?.stopped).toBe(true);
    facts = noteDriveFrame(
      facts,
      frame({
        giveWay: [sign],
        position: { lat: here.lat - 8 / 111320, lng: here.lng },
        headingDegrees: 0,
        speedMps: 3,
      }),
    );
    expect(facts.yields[0]?.passed).toBe(true);
    expect(driveFactsText(facts).join(" ")).toContain("bilen stannade");
    expect(yieldAheadNote(facts)).toBeNull();
  });

  it("records a pass without a stop, and whether the indicator was on before the turn", () => {
    const sign = { id: "yield:1", position: { lat: here.lat + 12 / 111320, lng: here.lng } };
    let facts = noteDriveFrame(EMPTY_DRIVE_FACTS, frame({ giveWay: [sign], speedMps: 5 }));
    facts = noteDriveFrame(facts, frame({ giveWay: [sign], position: { lat: here.lat + 4 / 111320, lng: here.lng }, speedMps: 5 }));
    facts = noteDriveFrame(facts, frame({ giveWay: [sign], position: { lat: here.lat - 10 / 111320, lng: here.lng }, speedMps: 5 }));
    expect(facts.yields[0]?.stopped).toBe(false);
    expect(facts.yields[0]?.passed).toBe(true);
    expect(driveFactsText(facts).join(" ")).toContain("passerade utan stopp");

    let turning = noteDriveFrame(EMPTY_DRIVE_FACTS, frame({ steer: -1, indicator: "left", headingDegrees: 0 }));
    turning = noteDriveFrame(turning, frame({ steer: -1, indicator: "left", headingDegrees: 330 }));
    expect(turning.indicatorBeforeTurn).toBe(true);
    let missed = noteDriveFrame(EMPTY_DRIVE_FACTS, frame({ steer: 1, indicator: "off", headingDegrees: 0 }));
    missed = noteDriveFrame(missed, frame({ steer: 1, indicator: "off", headingDegrees: 30 }));
    expect(missed.indicatorBeforeTurn).toBe(false);
  });
});
