import { describe, expect, it } from "vitest";
import { distanceMeters } from "../roads/drivingRoads";
import {
  MIRROR_LOOK_METERS,
  SPEEDO_MAX_KMH,
  WHEEL_LOCK_DEGREES,
  mirrorCamera,
  mirrorSitsBehind,
  needleDegrees,
  stepCockpit,
  wheelRotationDegrees,
} from "./cockpit";

describe("cockpit controls", () => {
  it("turns the wheel with the steering and follows the speed", () => {
    expect(wheelRotationDegrees(0)).toBe(0);
    expect(wheelRotationDegrees(1)).toBe(WHEEL_LOCK_DEGREES);
    expect(wheelRotationDegrees(-1)).toBe(-WHEEL_LOCK_DEGREES);
    expect(needleDegrees(0)).toBeLessThan(0);
    expect(needleDegrees(SPEEDO_MAX_KMH)).toBeGreaterThan(100);
    expect(needleDegrees(SPEEDO_MAX_KMH + 40)).toBe(needleDegrees(SPEEDO_MAX_KMH));

    const first = stepCockpit({ wheelDegrees: 0, needleDegrees: needleDegrees(0) }, { steer: 1, speedKmh: 50 }, 0.05);
    expect(first.wheelDegrees).toBeGreaterThan(0);
    expect(first.wheelDegrees).toBeLessThan(WHEEL_LOCK_DEGREES);
    expect(first.needleDegrees).toBeGreaterThan(needleDegrees(0));
    expect(first.needleDegrees).toBeLessThan(needleDegrees(50));

    let motion = first;
    for (let step = 0; step < 80; step += 1) {
      motion = stepCockpit(motion, { steer: -1, speedKmh: 0 }, 0.05);
    }
    expect(motion.wheelDegrees).toBeLessThan(-WHEEL_LOCK_DEGREES + 2);
    expect(Math.abs(motion.needleDegrees - needleDegrees(0))).toBeLessThan(2);
  });

  it("points the mirror back along the road, behind the car", () => {
    const car = { lat: 59.3293, lng: 18.0686, headingDegrees: 0 };
    const mirror = mirrorCamera(car);
    expect(mirror.lat).toBeLessThan(car.lat);
    expect(mirror.headingDegrees).toBeCloseTo(180, 5);
    expect(distanceMeters(mirror, car)).toBeGreaterThan(MIRROR_LOOK_METERS - 2);
    expect(distanceMeters(mirror, car)).toBeLessThan(MIRROR_LOOK_METERS + 2);
    expect(mirrorSitsBehind(car)).toBe(true);
    expect(mirrorSitsBehind({ ...car, headingDegrees: 90 })).toBe(true);
  });
});
