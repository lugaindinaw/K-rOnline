import { describe, expect, it } from "vitest";
import { ACCEL_MPS2, BRAKE_MPS2, MAX_SPEED_MPS } from "./drive";
import {
  BODY_PITCH_MAX_DEGREES,
  BODY_ROLL_MAX_DEGREES,
  bodyAttitude,
  displayedSpeedKmh,
  easeAccel,
  easeSteer,
  speedAfterAccel,
} from "./driveFeel";

describe("drive feel", () => {
  it("builds steering instead of snapping to full lock", () => {
    const first = easeSteer(0, 1, 0.05);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.45);
    let steer = 0;
    for (let step = 0; step < 20; step += 1) {
      steer = easeSteer(steer, -1, 0.05);
    }
    expect(steer).toBeLessThan(-0.9);
    expect(easeSteer(0.4, 1, 0)).toBe(0.4);
  });

  it("ramps gas and brake so one frame cannot apply the full force", () => {
    const gas = easeAccel(0, { accelerate: true, brake: false }, 0.05, 0);
    expect(gas).toBeGreaterThan(0);
    expect(gas).toBeLessThan(ACCEL_MPS2);
    expect(speedAfterAccel(0, gas, 0.05)).toBeLessThan(ACCEL_MPS2 * 0.05);
    expect(speedAfterAccel(0, gas, 0.05)).toBeGreaterThan(0);

    const brake = easeAccel(0, { accelerate: false, brake: true }, 0.05, 10);
    expect(brake).toBeLessThan(0);
    expect(brake).toBeGreaterThan(-BRAKE_MPS2);
    const slowed = speedAfterAccel(10, brake, 0.05);
    expect(slowed).toBeLessThan(10);
    expect(10 - slowed).toBeLessThan(BRAKE_MPS2 * 0.05);

    let accel = 0;
    let speed = 0;
    for (let step = 0; step < 40; step += 1) {
      accel = easeAccel(accel, { accelerate: true, brake: false }, 0.05, speed);
      speed = speedAfterAccel(speed, accel, 0.05);
    }
    expect(speed).toBeGreaterThan(4);
    expect(speed).toBeLessThanOrEqual(MAX_SPEED_MPS);
    expect(easeAccel(-4, { accelerate: false, brake: false }, 0.05, 0)).toBe(0);
  });

  it("leans the body a little and keeps the speedometer on the real speed", () => {
    const power = bodyAttitude(ACCEL_MPS2, 0, 8);
    const braking = bodyAttitude(-BRAKE_MPS2, 0, 8);
    expect(power.pitchDegrees).toBeGreaterThan(0);
    expect(power.pitchDegrees).toBeLessThanOrEqual(BODY_PITCH_MAX_DEGREES);
    expect(braking.pitchDegrees).toBeLessThan(0);
    expect(Math.abs(braking.pitchDegrees)).toBeLessThanOrEqual(BODY_PITCH_MAX_DEGREES * 1.15 + 0.01);

    expect(bodyAttitude(0, 1, 0).rollDegrees).toBe(0);
    const right = bodyAttitude(0, 1, 8);
    const left = bodyAttitude(0, -1, 8);
    expect(right.rollDegrees).toBeGreaterThan(0);
    expect(right.rollDegrees).toBeLessThanOrEqual(BODY_ROLL_MAX_DEGREES);
    expect(left.rollDegrees).toBeLessThan(0);

    expect(displayedSpeedKmh(0)).toBe(0);
    expect(displayedSpeedKmh(12)).toBe(43);
    expect(displayedSpeedKmh(-3)).toBe(0);
  });
});
