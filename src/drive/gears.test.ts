import { describe, expect, it } from "vitest";
import { cycleGear, gearFromKey, gearMotion } from "./gears";
import { gripLimitedSteerDegrees } from "./driveFeel";
import { stepFreeVehicle } from "./freeDrive";
import { surfaceGrip } from "./surface";

const start = { position: { lat: 59.33, lng: 18.06 }, headingDegrees: 0, speedMps: 0 };

describe("gears", () => {
  it("keeps drive identical to an omitted gear", () => {
    const plain = stepFreeVehicle(start, { accelerate: true, brake: false }, 0.5);
    const drive = stepFreeVehicle(start, { accelerate: true, brake: false, gear: "D" }, 0.5);
    expect(drive.speedMps).toBeCloseTo(plain.speedMps, 6);
    expect(drive.position.lat).toBeCloseTo(plain.position.lat, 8);
  });

  it("reverses and caps the speed", () => {
    let state = start;
    for (let step = 0; step < 40; step += 1) {
      state = stepFreeVehicle(state, { accelerate: true, brake: false, gear: "R" }, 0.05);
    }
    expect(state.position.lat).toBeLessThan(start.position.lat);
    expect(state.speedMps).toBeLessThanOrEqual(6.01);
    expect(gearMotion("R").reverse).toBe(true);
  });

  it("coasts in neutral even with the accelerator held", () => {
    const rolling = { ...start, speedMps: 5 };
    const next = stepFreeVehicle(rolling, { accelerate: true, brake: false, gear: "N" }, 0.5);
    expect(next.speedMps).toBeLessThan(5);
  });

  it("rolls backward on a simulated hill and holds with the brake", () => {
    let loose = start;
    for (let step = 0; step < 20; step += 1) {
      loose = stepFreeVehicle(loose, { accelerate: false, brake: false, gradeMps2: 1.4 }, 0.05);
    }
    expect(loose.position.lat).toBeLessThan(start.position.lat);
    const held = stepFreeVehicle(start, { accelerate: false, brake: true, gradeMps2: 1.4 }, 1);
    expect(held.position.lat).toBeCloseTo(start.position.lat, 6);
  });

  it("reads the gear keys without using the number row", () => {
    expect(gearFromKey("KeyR", "r")).toBe("R");
    expect(gearFromKey("KeyF", "f")).toBe("D");
    expect(gearFromKey("Digit1", "1")).toBeNull();
    expect(cycleGear("D")).toBe("P");
  });
});

describe("surface grip", () => {
  it("reduces steering lock and braking on ice", () => {
    const dry = gripLimitedSteerDegrees(15, 26, 2.6, 1);
    const ice = gripLimitedSteerDegrees(15, 26, 2.6, surfaceGrip("ice").grip);
    expect(ice).toBeLessThan(dry);
    const fast = { ...start, speedMps: 10 };
    const braked = stepFreeVehicle(fast, { accelerate: false, brake: true }, 0.25);
    const sliding = stepFreeVehicle(fast, { accelerate: false, brake: true, brakeScale: surfaceGrip("ice").brakeScale }, 0.25);
    expect(sliding.speedMps).toBeGreaterThan(braked.speedMps);
  });
});
