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
import { vehicleFromPlacement } from "./drive";
import { gripLimitedSteerDegrees, MAX_LATERAL_ACCEL_MPS2 } from "./driveFeel";
import {
  FREE_ROAD_ASSOCIATION_METERS,
  OFF_ROAD_MESSAGE,
  advanceFreeVehicle,
  associateFreePosition,
  describeFreeVehicle,
  FREE_WHEELBASE_METERS,
  stepFreeVehicle,
  type FreeVehicleState,
} from "./freeDrive";
import { buildRoadNetwork, nearestPlacement, pointAlong } from "../roads/roadNetwork";
import { distanceMeters, type RoadPoint, type RoadSegment } from "../roads/drivingRoads";

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
    expect(state.speedMps).toBeGreaterThan(1);
    expect(state.speedMps).toBeLessThan(ACCEL_MPS2 * steps * dt);
    expect(state.headingDegrees).toBe(0);
    expect(state.position.lat).toBeGreaterThan(origin.lat);
    expect(state.position.lng).toBeCloseTo(origin.lng, 8);
    expect(distanceMeters(origin, state.position)).toBeGreaterThan(0);
    expect(distanceMeters(origin, state.position)).toBeLessThan(MAX_SPEED_MPS * steps * dt);
  });

  it("decreases speed when braking, and braking wins over throttle", () => {
    const start = parked(0, 10);
    const braked = stepFreeVehicle(start, { accelerate: false, brake: true }, 0.05);
    expect(braked.speedMps).toBeLessThan(10);
    expect(10 - braked.speedMps).toBeLessThan(BRAKE_MPS2 * 0.05);
    const both = stepFreeVehicle(start, { accelerate: true, brake: true }, 0.05);
    expect(both.speedMps).toBeCloseTo(braked.speedMps, 5);
    const coast = stepFreeVehicle(start, { accelerate: false, brake: false }, 0.05);
    expect(coast.speedMps).toBeLessThan(10);
    expect(10 - coast.speedMps).toBeLessThanOrEqual(COAST_MPS2 * 0.05 + 1e-6);
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
    const speed = turned.speedMps;
    const angle = gripLimitedSteerDegrees(speed, steerAngleDegrees(speed, -1), FREE_WHEELBASE_METERS);
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

  it("widens the turn at speed so the car stays within passenger-car grip", () => {
    const dt = 0.05;
    const slow = stepFreeVehicle(parked(0, 2), { accelerate: false, brake: false, steer: 1 }, dt);
    const fast = stepFreeVehicle(parked(0, MAX_SPEED_MPS), { accelerate: true, brake: false, steer: 1 }, dt);
    const slowYaw = Math.abs(signedDelta(0, slow.headingDegrees));
    const fastYaw = Math.abs(signedDelta(0, fast.headingDegrees));
    const slowDistance = distanceMeters(parked(0, 2).position, slow.position);
    const fastDistance = distanceMeters(parked(0, MAX_SPEED_MPS).position, fast.position);
    expect(slowYaw / slowDistance).toBeGreaterThan(fastYaw / fastDistance);
    const lateral = (fast.speedMps * fastYaw * Math.PI) / 180 / dt;
    expect(lateral).toBeLessThanOrEqual(MAX_LATERAL_ACCEL_MPS2 + 0.6);
    const walking = gripLimitedSteerDegrees(0.4, 26, FREE_WHEELBASE_METERS);
    expect(walking).toBeCloseTo(26, 5);
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

function segment(coordinates: RoadPoint[]): RoadSegment {
  return {
    id: "norr",
    osmWayId: "norr",
    name: "Testvägen",
    highway: "residential",
    oneway: "both",
    coordinates,
    nodeIds: ["a", "b"],
  };
}

describe("advanceFreeVehicle", () => {
  const road = segment([origin, northOf(origin, 200)]);

  it("drives beside the centerline and does not jump back onto it", () => {
    const network = buildRoadNetwork([road]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    if (!edge) {
      throw new Error("missing edge");
    }
    let state = vehicleFromPlacement({ edge, distanceMeters: 30, gapMeters: 0 });
    state = { ...state, position: eastOf(state.position, 2) };
    const startGap = distanceMeters(state.position, pointAlong(edge, 30));
    for (let index = 0; index < 20; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    const center = pointAlong(edge, state.distanceMeters);
    expect(state.speedMps).toBeGreaterThan(1);
    expect(state.position.lat).toBeGreaterThan(origin.lat);
    expect(distanceMeters(state.position, center)).toBeGreaterThan(1);
    expect(distanceMeters(state.position, center)).toBeLessThan(startGap + 1.5);
    expect(state.edgeId).toBe(edge.id);
    expect(state.roadName).toBe("Testvägen");
    expect(state.measurementReliable).toBe(true);
    expect(state.mode).toBe("driving");
    expect(state.choices).toEqual([]);
  });

  it("does not invent a road when the car is far from every centerline", () => {
    const network = buildRoadNetwork([road]);
    const edge = network.edges[0];
    if (!edge) {
      throw new Error("missing edge");
    }
    const state = describeFreeVehicle(
      {
        ...vehicleFromPlacement({ edge, distanceMeters: 10, gapMeters: 0 }),
        position: eastOf(origin, FREE_ROAD_ASSOCIATION_METERS + 30),
      },
      network,
    );
    expect(associateFreePosition(network, state.position)).toBeNull();
    expect(nearestPlacement(network, state.position, FREE_ROAD_ASSOCIATION_METERS)).toBeNull();
    expect(state.edgeId).toBe("");
    expect(state.roadName).toBeNull();
    expect(state.message).toBe(OFF_ROAD_MESSAGE);
    expect(state.position.lng).toBeGreaterThan(origin.lng);
  });

  it("builds the turn while moving and does not spin when stopped", () => {
    const network = buildRoadNetwork([road]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    if (!edge) {
      throw new Error("missing edge");
    }
    const parked = vehicleFromPlacement({ edge, distanceMeters: 40, gapMeters: 0 });
    let stopped = parked;
    for (let index = 0; index < 20; index += 1) {
      stopped = advanceFreeVehicle(stopped, { accelerate: false, brake: true, steer: 1 }, 0.05, network);
    }
    expect(stopped.speedMps).toBe(0);
    expect(stopped.headingDegrees).toBeCloseTo(parked.headingDegrees, 5);
    expect(Math.abs(stopped.steerApplied ?? 0)).toBeGreaterThan(0.8);

    let moving = { ...parked, speedMps: 8 };
    const first = advanceFreeVehicle(moving, { accelerate: true, brake: false, steer: 1 }, 0.05, network);
    expect(Math.abs(first.steerApplied ?? 0)).toBeLessThan(0.45);
    expect(Math.abs(first.headingDegrees - parked.headingDegrees)).toBeLessThan(2);
    for (let index = 0; index < 30; index += 1) {
      moving = advanceFreeVehicle(moving, { accelerate: true, brake: false, steer: 1 }, 0.05, network);
    }
    expect(moving.headingDegrees).toBeGreaterThan(parked.headingDegrees + 8);
    expect(moving.position.lat).toBeGreaterThan(parked.position.lat);
    expect(moving.speedMps).toBeGreaterThanOrEqual(0);
  });
});
