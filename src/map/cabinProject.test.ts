import { describe, expect, it } from "vitest";
import { CABIN_EYE_LOCAL, WHEEL_CENTER_LOCAL } from "./cabinMesh";
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

  it("keeps the hood below the road ahead", () => {
    const hood = projectCabinPoint([0, 0.6, 2.25], tilt, aspect);
    const road = projectCabinPoint(
      [CABIN_EYE_LOCAL[0], 0.05, CABIN_EYE_LOCAL[2] + 12],
      tilt,
      aspect,
    );
    const pillar = projectCabinPoint([-0.78, 1.22, 0.95], tilt, aspect);
    const wheel = projectCabinPoint(WHEEL_CENTER_LOCAL, tilt, aspect);
    expect(hood).not.toBeNull();
    expect(road).not.toBeNull();
    expect(road!.y).toBeGreaterThan(0.28);
    expect(road!.y).toBeLessThan(hood!.y);
    expect(hood!.y).toBeGreaterThan(0.55);
    expect(pillar).not.toBeNull();
    expect(pillar!.x).toBeLessThan(0.25);
    expect(wheel).not.toBeNull();
    expect(wheel!.y).toBeGreaterThan(hood!.y);
  });

  it("lifts the hood when the body pitches up", () => {
    const level = projectCabinPoint([0, 1.02, 1.45], tilt, aspect);
    const pitched = projectCabinPoint([0, 1.02, 1.45], tilt, aspect, { pitchDegrees: 1.6 });
    expect(pitched!.y).toBeLessThan(level!.y);
  });
});
