import { describe, expect, it } from "vitest";
import { distanceMeters } from "../roads/drivingRoads";
import {
  CAR_WHEELS,
  WHEEL_HUB_HEIGHT_METERS,
  WHEEL_RADIUS_METERS,
  wheelHubOffset,
  wheelHubPosition,
  wheelSpinDegrees,
  wheelSteerDegrees,
} from "./wheelContact";

describe("wheel contact", () => {
  it("keeps four hubs around a passenger-car footprint", () => {
    expect(CAR_WHEELS.filter((wheel) => wheel.steers)).toHaveLength(2);
    expect(CAR_WHEELS.filter((wheel) => !wheel.steers)).toHaveLength(2);
    for (const wheel of CAR_WHEELS) {
      expect(Math.abs(wheel.x)).toBeGreaterThan(0.6);
      expect(Math.abs(wheel.x)).toBeLessThan(1);
      expect(Math.abs(wheel.z)).toBeGreaterThan(1);
      expect(Math.abs(wheel.z)).toBeLessThan(1.8);
    }
    expect(WHEEL_RADIUS_METERS).toBeCloseTo(WHEEL_HUB_HEIGHT_METERS, 5);
  });

  it("puts the front axle ahead and the right wheel to the east when heading north", () => {
    const front = CAR_WHEELS.find((wheel) => wheel.z > 0 && wheel.x > 0);
    expect(front).toBeTruthy();
    const offset = wheelHubOffset(0, front!);
    expect(offset.north).toBeGreaterThan(1);
    expect(offset.east).toBeGreaterThan(0.6);
    const eastbound = wheelHubOffset(90, front!);
    expect(eastbound.east).toBeGreaterThan(1);
    expect(eastbound.north).toBeLessThan(-0.6);
  });

  it("moves the hub with the car and rolls one circumference per turn", () => {
    const origin = { lat: 59.33, lng: 18.07 };
    const wheel = CAR_WHEELS[0]!;
    const hub = wheelHubPosition(origin, 0, wheel);
    expect(distanceMeters(hub, origin)).toBeGreaterThan(1.4);
    expect(distanceMeters(hub, origin)).toBeLessThan(1.8);
    expect(wheelSpinDegrees(2 * Math.PI * WHEEL_RADIUS_METERS)).toBeCloseTo(360, 5);
    expect(wheelSteerDegrees(-1, true)).toBeLessThan(0);
    expect(wheelSteerDegrees(1, false)).toBe(0);
  });
});