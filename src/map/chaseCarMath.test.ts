import { describe, expect, it } from "vitest";
import {
  carYawRadians,
  chaseSceneCamera,
  enuOffsetMeters,
  frontWheelSteerRadians,
  wheelSpinRadians,
} from "./chaseCarMath";

describe("chaseCarMath", () => {
  it("maps north to −Z and east to +X", () => {
    const north = enuOffsetMeters({ lat: 59.33, lng: 18.07 }, { lat: 59.33 + 1 / 111320, lng: 18.07 });
    expect(north.z).toBeCloseTo(-1, 3);
    expect(north.x).toBeCloseTo(0, 3);
    const east = enuOffsetMeters(
      { lat: 59.33, lng: 18.07 },
      { lat: 59.33, lng: 18.07 + 1 / (111320 * Math.cos((59.33 * Math.PI) / 180)) },
    );
    expect(east.x).toBeCloseTo(1, 2);
    expect(east.z).toBeCloseTo(0, 2);
  });

  it("faces a north-bound car down −Z", () => {
    expect(carYawRadians(0)).toBeCloseTo(Math.PI, 5);
    expect(carYawRadians(90)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("steers the front wheels with the stick", () => {
    expect(frontWheelSteerRadians(0)).toBeCloseTo(0, 8);
    expect(frontWheelSteerRadians(1)).toBeLessThan(0);
    expect(frontWheelSteerRadians(-1)).toBeGreaterThan(0);
  });

  it("spins the tires with road speed", () => {
    expect(wheelSpinRadians(0, 0.05)).toBe(0);
    expect(wheelSpinRadians(36, 0.05)).toBeCloseTo(0.5 / 0.35, 5);
  });

  it("puts the chase camera behind the look point and the car near the origin", () => {
    const scene = chaseSceneCamera({
      lookLat: 59.33,
      lookLng: 18.07,
      lookAltitude: 12,
      carLat: 59.33,
      carLng: 18.07,
      headingDegrees: 0,
      rangeMeters: 22,
      tiltDegrees: 67,
      fovDegrees: 46,
      steer: 0,
      speedKmh: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
    });
    expect(scene.camera.z).toBeGreaterThan(5);
    expect(scene.camera.y).toBeGreaterThan(1);
    expect(scene.car.x).toBeCloseTo(0, 5);
    expect(scene.car.z).toBeCloseTo(0, 5);
    expect(scene.yawRadians).toBeCloseTo(Math.PI, 5);
  });
});
