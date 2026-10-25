import { describe, expect, it } from "vitest";
import {
  ACCEL_MPS2,
  BRAKE_MPS2,
  COAST_MPS2,
  choiceIndexFromKey,
  driveInputFromKeys,
  isTextEntry,
  selectBranch,
  stepVehicle,
  vehicleFromPlacement,
} from "./drive";
import { buildRoadNetwork } from "../roads/roadNetwork";
import type { OneWay, RoadPoint, RoadSegment } from "../roads/drivingRoads";

const start: RoadPoint = { lat: 59.33, lng: 18.07 };
const north: RoadPoint = { lat: 59.332, lng: 18.07 };
const junction: RoadPoint = { lat: 59.3304, lng: 18.07 };
const east: RoadPoint = { lat: 59.3304, lng: 18.071 };
const west: RoadPoint = { lat: 59.3304, lng: 18.069 };

function segment(
  id: string,
  nodes: string[],
  coordinates: RoadPoint[],
  options?: { name?: string | null; oneway?: OneWay },
): RoadSegment {
  return {
    id,
    osmWayId: id,
    name: options?.name ?? null,
    highway: "residential",
    oneway: options?.oneway ?? "both",
    coordinates,
    nodeIds: nodes,
  };
}

function headingDelta(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

describe("stepVehicle", () => {
  it("accelerates and brakes along the road geometry", () => {
    const network = buildRoadNetwork([segment("norr", ["1", "2"], [start, north], { name: "Norrvägen" })]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    expect(edge).toBeDefined();
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: 0, gapMeters: 0 });
    const dt = 0.05;
    const steps = 20;
    for (let index = 0; index < steps; index += 1) {
      state = stepVehicle(network, state, { accelerate: true, brake: false }, dt);
    }
    const expectedSpeed = ACCEL_MPS2 * steps * dt;
    const expectedDistance = (ACCEL_MPS2 * dt * dt * steps * (steps + 1)) / 2;
    expect(state.speedMps).toBeCloseTo(expectedSpeed, 5);
    expect(state.distanceMeters).toBeCloseTo(expectedDistance, 5);
    expect(state.position.lng).toBeCloseTo(start.lng, 6);
    expect(state.position.lat).toBeGreaterThan(start.lat);
    expect(headingDelta(state.headingDegrees, 0)).toBeLessThan(1);

    for (let index = 0; index < 10; index += 1) {
      state = stepVehicle(network, state, { accelerate: false, brake: true }, dt);
    }
    let speed = expectedSpeed;
    for (let index = 0; index < 10; index += 1) {
      speed = Math.max(0, speed - BRAKE_MPS2 * dt);
    }
    expect(state.speedMps).toBeCloseTo(speed, 5);
    expect(state.position.lng).toBeCloseTo(start.lng, 6);
    expect(state.mode).toBe("driving");
  });

  it("takes the only connecting road past a shared node", () => {
    const network = buildRoadNetwork([
      segment("ett", ["1", "2"], [start, junction], { name: "Ett", oneway: "forward" }),
      segment("två", ["2", "3"], [junction, east], { name: "Två", oneway: "forward" }),
    ]);
    const edge = network.edgesById.get("ett:0-1:forward");
    expect(edge).toBeDefined();
    const dt = 0.05;
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters - 0.1, gapMeters: 0 });
    state = { ...state, speedMps: 10 };
    state = stepVehicle(network, state, { accelerate: false, brake: false }, dt);
    const speed = 10 - COAST_MPS2 * dt;
    expect(state.mode).toBe("driving");
    expect(state.edgeId).toBe("två:0-1:forward");
    expect(state.distanceMeters).toBeCloseTo(speed * dt - 0.1, 5);
    expect(state.roadName).toBe("Två");
  });

  it("stops at a junction with several roads until one is chosen", () => {
    const network = buildRoadNetwork([
      segment("ett", ["1", "2"], [start, junction], { name: "Ett", oneway: "forward" }),
      segment("andra", ["2", "3"], [junction, east], { name: "Andra", oneway: "forward" }),
      segment("tredje", ["2", "4"], [junction, west], { name: "Tredje", oneway: "forward" }),
    ]);
    const edge = network.edgesById.get("ett:0-1:forward");
    expect(edge).toBeDefined();
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters - 0.1, gapMeters: 0 });
    state = { ...state, speedMps: 10 };
    state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
    expect(state.mode).toBe("choose");
    expect(state.speedMps).toBe(0);
    expect(state.distanceMeters).toBeCloseTo(edge!.lengthMeters, 5);
    expect(state.position).toEqual(junction);
    expect(state.choices.map((choice) => choice.label)).toEqual(["Andra", "Tredje"]);
    state = stepVehicle(network, state, { accelerate: true, brake: false }, 0.05);
    expect(state.speedMps).toBe(0);
    const chosen = selectBranch(network, state, 2);
    expect(chosen.roadName).toBe("Tredje");
    expect(chosen.distanceMeters).toBe(0);
    expect(chosen.mode).toBe("driving");
  });

  it("stops at a dead end and offers a turnaround only when that edge exists", () => {
    const oneway = buildRoadNetwork([
      segment("slut", ["1", "2"], [start, junction], { name: "Slutgatan", oneway: "forward" }),
    ]);
    const oneEdge = oneway.edgesById.get("slut:0-1:forward");
    let ended = vehicleFromPlacement({
      edge: oneEdge!,
      distanceMeters: oneEdge!.lengthMeters - 0.1,
      gapMeters: 0,
    });
    ended = { ...ended, speedMps: 10 };
    ended = stepVehicle(oneway, ended, { accelerate: false, brake: false }, 0.05);
    expect(ended.mode).toBe("ended");
    expect(ended.speedMps).toBe(0);
    expect(ended.message).toContain("tar slut");
    expect(ended.position).toEqual(junction);

    const both = buildRoadNetwork([segment("gata", ["1", "2"], [start, junction], { name: "Gatan" })]);
    const forward = both.edges.find((edge) => edge.id.endsWith(":forward"));
    let turning = vehicleFromPlacement({
      edge: forward!,
      distanceMeters: forward!.lengthMeters - 0.1,
      gapMeters: 0,
    });
    turning = { ...turning, speedMps: 10 };
    turning = stepVehicle(both, turning, { accelerate: false, brake: false }, 0.05);
    expect(turning.mode).toBe("choose");
    expect(turning.choices.map((choice) => choice.label)).toEqual(["Vänd tillbaka på Gatan"]);
    const back = selectBranch(both, turning, 1);
    expect(back.edgeId.endsWith(":backward")).toBe(true);
    expect(back.position).toEqual(junction);
  });
});

describe("keyboard mapping", () => {
  it("reads gas, brake and branch keys without treating text entry as driving", () => {
    expect(driveInputFromKeys(new Set(["KeyW"]))).toEqual({ accelerate: true, brake: false });
    expect(driveInputFromKeys(new Set(["ArrowDown"]))).toEqual({ accelerate: false, brake: true });
    expect(choiceIndexFromKey("Digit3")).toBe(3);
    expect(choiceIndexFromKey("KeyW")).toBeNull();
    expect(isTextEntry(null)).toBe(false);
  });
});
