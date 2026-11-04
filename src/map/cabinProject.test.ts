import { describe, expect, it } from "vitest";
import { CABIN_EYE_LOCAL, GAUGE_CENTER_LOCAL, WHEEL_CENTER_LOCAL } from "./cabinMesh";
import { cameraProfile } from "./followCamera";
import { projectCabinPoint } from "./cabinProject";

describe("projectCabinPoint", () => {
  const tilt = cameraProfile("driver").tiltDegrees;
  const aspect = 1.4;
  const lookDown = ((90 - tilt) * Math.PI) / 180;

  it("puts the road look point near the middle of the windshield", () => {
    const ahead = 8;
    const look: [number, number, number] = [
      CABIN_EYE_LOCAL[0],
      CABIN_EYE_LOCAL[1] - Math.tan(lookDown) * ahead,
      CABIN_EYE_LOCAL[2] + ahead,
    ];
    const projected = projectCabinPoint(look, tilt, aspect);
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(0.5, 1);
    expect(projected!.y).toBeCloseTo(0.5, 1);
  });

  it("keeps the hood in the lower windshield and the left pillar on the left", () => {
    const hood = projectCabinPoint([0, 1.02, 1.45], tilt, aspect);
    const pillar = projectCabinPoint([-0.78, 1.22, 0.95], tilt, aspect);
    const wheel = projectCabinPoint(WHEEL_CENTER_LOCAL, tilt, aspect);
    const gauge = projectCabinPoint(GAUGE_CENTER_LOCAL, tilt, aspect);
    expect(hood).not.toBeNull();
    expect(hood!.y).toBeGreaterThan(0.5);
    expect(hood!.y).toBeLessThan(0.9);
    expect(pillar).not.toBeNull();
    expect(pillar!.x).toBeLessThan(0.2);
    expect(wheel).not.toBeNull();
    expect(wheel!.y).toBeGreaterThan(0.55);
    expect(gauge).not.toBeNull();
    expect(gauge!.y).toBeGreaterThan(0.45);
  });

  it("lifts the hood when the body pitches up", () => {
    const level = projectCabinPoint([0, 1.02, 1.45], tilt, aspect);
    const pitched = projectCabinPoint([0, 1.02, 1.45], tilt, aspect, { pitchDegrees: 1.6 });
    expect(pitched!.y).toBeLessThan(level!.y);
  });
});
