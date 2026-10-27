import { describe, expect, it } from "vitest";
import {
  ACCEL_MPS2,
  BRAKE_MPS2,
  COAST_MPS2,
  MAX_FRAME_SECONDS,
  MAX_SPEED_MPS,
  YAW_DEGREES_PER_SECOND,
  steerAngleDegrees,
} from "./drive";
import { FREE_WHEELBASE_METERS, stepFreeVehicle, type FreeVehicleState } from "./freeDrive";
import { buildRoadNetwork, nearestPlacement } from "../roads/roadNetwork";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";

const origin: RoadPoint = { lat: 59.33, lng: 18.07 };

function parked(headingDegrees = 0, speedMps = 0, position: RoadPoint = origin): FreeVehicleState {
  return { position, headingDegrees, speedMps };
}

function northOf(point: RoadPoint, meters: number): RoadPoint {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

function eastOf(point: RoadPoint, meters: number): RoadPoint {
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat, lng: point.lng + meters / (111320 * Math.max(0.2, cosine)) };
}

function signedDelta(from: number, to: number): number {
  let delta = to - from;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  return delta;
}

describe("stepFreeVehicle", () => {
  it("stays still when speed is zero and no throttle is given", () => {
    const start = parked(25, 0);
    const next = stepFreeVehicle(start, { accelerate: false, brake: false, steer: 1 }, 1);
    expect(next.speedMps).toBe(0);
    expect(next.position).toEqual(start.position);
    expect(next.headingDegrees).toBe(25);
    expect(distanceMeters(start.position, next.position)).toBe(0);
  });

  it("increases speed when accelerating and moves along its own heading", () => {
    const dt = 0.05;
    const steps = 20;
    let state = parked();
    for (let index = 0; index < steps; index += 1) {
      state = stepFreeVehicle(state, { accelerate: true, brake: false }, dt);
    }
    expect(state.speedMps).toBeCloseTo(ACCEL_MPS2 * steps * dt, 5);
    expect(state.headingDegrees).toBe(0);
    expect(state.position.lat).toBeGreaterThan(origin.lat);
    expect(state.position.lng).toBeCloseTo(origin.lng, 8);
    expect(distanceMeters(origin, state.position)).toBeGreaterThan(0);
    expect(distanceMeters(origin, state.position)).toBeLessThan(MAX_SPEED_MPS * steps * dt);
  });

  it("decreases speed when braking, and braking wins over throttle", () => {
    const start = parked(0, 10);
    const braked = stepFreeVehicle(start, { accelerate: false, brake: true }, 0.05);
    expect(braked.speedMps).toBeCloseTo(10 - BRAKE_MPS2 * 0.05, 5);
    const both = stepFreeVehicle(start, { accelerate: true, brake: true }, 0.05);
    expect(both.speedMps).toBeCloseTo(braked.speedMps, 5);
    const coast = stepFreeVehicle(start, { accelerate: false, brake: false }, 0.05);
    expect(coast.speedMps).toBeCloseTo(10 - COAST_MPS2 * 0.05, 5);
    expect(coast.speedMps).toBeGreaterThan(braked.speedMps);
  });

  it("turns left and right in the map plane without a road", () => {
    const dt = 0.05;
    const steps = 40;
    let straight = parked(0, 8);
    let left = parked(0, 8);
    let right = parked(0, 8);
    for (let index = 0; index < steps; index += 1) {
      straight = stepFreeVehicle(straight, { accelerate: true, brake: false, steer: 0 }, dt);
      left = stepFreeVehicle(left, { accelerate: true, brake: false, steer: -1 }, dt);
      right = stepFreeVehicle(right, { accelerate: true, brake: false, steer: 1 }, dt);
    }
    expect(signedDelta(0, left.headingDegrees)).toBeLessThan(-5);
    expect(signedDelta(0, right.headingDegrees)).toBeGreaterThan(5);
    expect(left.position.lng).toBeLessThan(straight.position.lng);
    expect(right.position.lng).toBeGreaterThan(straight.position.lng);
    expect(left.position.lat).toBeGreaterThan(origin.lat);
    expect(right.position.lat).toBeGreaterThan(origin.lat);
    expect(left.speedMps).toBeCloseTo(right.speedMps, 5);
  });

  it("limits one step of yaw and matches the bicycle turn from speed and steer angle", () => {
    const start = parked(0, 8);
    const dt = 0.05;
    const turned = stepFreeVehicle(start, { accelerate: false, brake: false, steer: -1 }, dt);
    const speed = 8 - COAST_MPS2 * dt;
    const angle = steerAngleDegrees(speed, -1);
    const radiansPerSecond = (speed / FREE_WHEELBASE_METERS) * Math.tan((angle * Math.PI) / 180);
    const uncapped = radiansPerSecond * (180 / Math.PI) * dt;
    const cap = YAW_DEGREES_PER_SECOND * dt;
    const expectedYaw = Math.max(-cap, Math.min(cap, uncapped));
    expect(Math.abs(uncapped)).toBeLessThanOrEqual(cap);
    expect(signedDelta(0, turned.headingDegrees)).toBeCloseTo(expectedYaw, 5);
    expect(Math.abs(signedDelta(0, turned.headingDegrees))).toBeLessThanOrEqual(cap + 1e-6);
    const traveled = distanceMeters(start.position, turned.position);
    expect(traveled).toBeCloseTo(speed * dt, 3);
    expect(traveled).toBeLessThan(0.5);
  });

  it("does not move the car onto a road centerline", () => {
    const end = northOf(origin, 200);
    const network = buildRoadNetwork([
      {
        id: "rak",
        osmWayId: "rak",
        name: "Rak",
        highway: "residential",
        oneway: "forward",
        coordinates: [origin, end],
        nodeIds: ["1", "2"],
      },
    ]);
    const beside = eastOf(origin, 30);
    let state = parked(0, 8, beside);
    for (let index = 0; index < 20; index += 1) {
      state = stepFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05);
    }
    const placement = nearestPlacement(network, state.position, 80);
    expect(placement).not.toBeNull();
    expect(placement?.gapMeters ?? 0).toBeGreaterThan(25);
    expect(state.position.lng).toBeGreaterThan(origin.lng);
    expect(Math.abs(state.position.lng - beside.lng)).toBeLessThan(Math.abs(beside.lng - origin.lng));
    expect(state.position).not.toEqual(origin);
    expect(state.position).not.toEqual(end);
  });

  it("treats a long frame as the same small steps and keeps the speed cap", () => {
    const input = { accelerate: true, brake: false, steer: -1 };
    const capped = stepFreeVehicle(parked(0, 8), input, 10);
    const framed = stepFreeVehicle(parked(0, 8), input, MAX_FRAME_SECONDS);
    expect(capped.speedMps).toBeCloseTo(framed.speedMps, 5);
    expect(capped.position.lat).toBeCloseTo(framed.position.lat, 8);
    expect(capped.position.lng).toBeCloseTo(framed.position.lng, 8);
    expect(capped.headingDegrees).toBeCloseTo(framed.headingDegrees, 5);
    expect(distanceMeters(origin, capped.position)).toBeLessThan(MAX_SPEED_MPS * MAX_FRAME_SECONDS);

    let state = parked(0, 11);
    for (let index = 0; index < 40; index += 1) {
      state = stepFreeVehicle(state, { accelerate: true, brake: false }, 0.05);
      expect(state.speedMps).toBeLessThanOrEqual(MAX_SPEED_MPS + 1e-9);
    }
    expect(state.speedMps).toBeCloseTo(MAX_SPEED_MPS, 2);
  });
});
