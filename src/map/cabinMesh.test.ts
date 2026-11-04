import { describe, expect, it } from "vitest";
import { DRIVER_EYE_HEIGHT_METERS } from "./followCamera";
import {
  CABIN_EYE_LOCAL,
  GAUGE_CENTER_LOCAL,
  WHEEL_CENTER_LOCAL,
  WHEEL_DIAMETER_METERS,
  cabinBoxes,
  cabinBoxesForPose,
  shellBoxes,
  windshieldOpen,
} from "./cabinMesh";
import { cabinPoseFromCamera, localOnCabin } from "./cabinView";

describe("cabin mesh", () => {
  it("keeps the driver's eyes at seated height and leaves the upper windshield open", () => {
    expect(CABIN_EYE_LOCAL[1]).toBe(DRIVER_EYE_HEIGHT_METERS);
    expect(WHEEL_DIAMETER_METERS).toBeGreaterThan(0.34);
    expect(WHEEL_DIAMETER_METERS).toBeLessThan(0.4);
    const names = new Set(shellBoxes().map((part) => part.name));
    for (const name of ["dash", "hood", "pillar-left", "pillar-right", "door-left", "mirror-rear", "mirror-left", "wiper-left", "shifter", "pedal-brake"]) {
      expect(names.has(name)).toBe(true);
    }
    const [eyeX, , eyeZ] = CABIN_EYE_LOCAL;
    expect(windshieldOpen([eyeX, 1.2, eyeZ + 4])).toBe(true);
    expect(windshieldOpen([eyeX, 0.78, 0.74])).toBe(false);
    const needle = cabinBoxesForPose(0, 40).find((part) => part.name === "needle");
    const neutral = cabinBoxes().find((part) => part.name === "needle");
    expect(needle?.center[0]).not.toBe(neutral?.center[0]);
    expect(GAUGE_CENTER_LOCAL[2]).toBeGreaterThan(WHEEL_CENTER_LOCAL[2]);
  });
});

describe("cabinPoseFromCamera", () => {
  it("puts the cabin origin on the ground under a north-facing eye", () => {
    const pose = cabinPoseFromCamera({
      lat: 59.33,
      lng: 18.07,
      altitude: 25,
      headingDegrees: 0,
      rangeMeters: 10,
      tiltDegrees: 90,
    });
    expect(pose.altitude).toBeCloseTo(25 - CABIN_EYE_LOCAL[1], 5);
    expect(pose.headingDegrees).toBe(0);
    expect(pose.lat).toBeLessThan(59.33);
    const eye = localOnCabin(pose, CABIN_EYE_LOCAL);
    expect(eye.lat).toBeCloseTo(59.33 - 10 / 111320, 6);
    expect(eye.lng).toBeCloseTo(18.07, 5);
    expect(eye.altitude).toBeCloseTo(25, 5);
  });
});
