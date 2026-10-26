import { describe, expect, it } from "vitest";
import {
  ACCEL_MPS2,
  BRAKE_MPS2,
  COAST_MPS2,
  MAX_SPEED_MPS,
  YAW_DEGREES_PER_SECOND,
  choiceIndexFromKey,
  driveInputFromKeys,
  isTextEntry,
  rejoinVehicle,
  selectBranch,
  stepVehicle,
  vehicleFromPlacement,
} from "./drive";
import { buildRoadNetwork, nearestPlacement } from "../roads/roadNetwork";
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

describe("rejoinVehicle", () => {
  it("keeps speed on the same road after the fetched area grows", () => {
    const short = buildRoadNetwork([segment("gata", ["1", "2"], [start, junction], { name: "Gatan" })]);
    const edge = short.edges.find((item) => item.id.endsWith(":forward"));
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters - 1, gapMeters: 0 });
    state = { ...state, speedMps: 8, mode: "ended", message: "Vägen tar slut i det hämtade området." };
    const extended = buildRoadNetwork([
      segment("gata", ["1", "2", "3"], [start, junction, east], { name: "Gatan" }),
    ]);
    const rejoined = rejoinVehicle(state, extended);
    expect(rejoined.mode).toBe("driving");
    expect(rejoined.speedMps).toBe(8);
    expect(rejoined.edgeId).toContain("gata");
    expect(rejoined.message).toBeNull();
    expect(rejoined.position.lat).toBeGreaterThan(junction.lat - 0.00001);
  });

  it("clears the dead-end message when the same road now continues", () => {
    const short = buildRoadNetwork([segment("gata", ["1", "2"], [start, junction], { name: "Gatan" })]);
    const edge = short.edges.find((item) => item.id.endsWith(":forward"));
    const stopped = {
      ...vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters / 2, gapMeters: 0 }),
      speedMps: 0,
      mode: "ended" as const,
      message: "Vägen tar slut i det hämtade området.",
    };
    const extended = buildRoadNetwork([
      segment("gata", ["1", "2", "3"], [start, junction, east], { name: "Gatan" }),
    ]);
    const rejoined = rejoinVehicle(stopped, extended);
    expect(rejoined.mode).toBe("driving");
    expect(rejoined.speedMps).toBe(0);
    expect(rejoined.message).toBe("Bilen står på Gatan.");
  });

  it("keeps the current heading when the network refreshes mid-edge", () => {
    const short = buildRoadNetwork([segment("gata", ["1", "2"], [start, junction], { name: "Gatan" })]);
    const edge = short.edges.find((item) => item.id.endsWith(":forward"));
    const driving = {
      ...vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters / 2, gapMeters: 0 }),
      speedMps: 8,
      headingDegrees: 25,
    };
    const extended = buildRoadNetwork([
      segment("gata", ["1", "2", "3"], [start, junction, east], { name: "Gatan" }),
    ]);
    const rejoined = rejoinVehicle(driving, extended);
    expect(rejoined.mode).toBe("driving");
    expect(rejoined.headingDegrees).toBe(25);
    expect(rejoined.speedMps).toBe(8);
  });

  it("offers a real connecting road after the next area arrives and ignores a nearby node", () => {
    const first = buildRoadNetwork([
      segment("ett", ["1", "2"], [start, junction], { name: "Ett", oneway: "forward" }),
    ]);
    const edge = first.edgesById.get("ett:0-1:forward");
    let stopped = vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters, gapMeters: 0 });
    stopped = { ...stopped, mode: "ended", speedMps: 6, message: "Vägen tar slut i det hämtade området." };
    const beside = { lat: junction.lat + 0.00003, lng: junction.lng + 0.00003 };
    const extended = buildRoadNetwork([
      segment("ett", ["1", "2"], [start, junction], { name: "Ett", oneway: "forward" }),
      segment("två", ["2", "3"], [junction, east], { name: "Två", oneway: "forward" }),
      segment("nära", ["9", "8"], [beside, { lat: beside.lat, lng: beside.lng + 0.001 }], { name: "Bredvid" }),
    ]);
    const rejoined = rejoinVehicle(stopped, extended);
    expect(rejoined.mode).toBe("driving");
    expect(rejoined.roadName).toBe("Två");
    expect(rejoined.edgeId).toContain("två");
    expect((extended.outgoing.get("2") ?? []).some((item) => item.osmWayId === "nära")).toBe(false);
  });
});

const places = [
  { name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Kiruna", lat: 67.8558, lng: 20.2253 },
  { name: "Glommersträsk", lat: 65.258, lng: 19.654 },
];

function northOf(point: RoadPoint, meters: number): RoadPoint {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

function eastOf(point: RoadPoint, meters: number): RoadPoint {
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat, lng: point.lng + meters / (111320 * Math.max(0.2, cosine)) };
}

describe("steering and stops", () => {
  it("changes speed smoothly, and braking wins when both pedals are held", () => {
    const network = buildRoadNetwork([
      segment("norr", ["1", "2"], [start, northOf(start, 400)], { name: "Norrvägen", oneway: "forward" }),
    ]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: 0, gapMeters: 0 });
    const dt = 0.05;
    let previous = state.speedMps;
    for (let index = 0; index < 80; index += 1) {
      state = stepVehicle(network, state, { accelerate: true, brake: false }, dt);
      expect(state.speedMps).toBeGreaterThanOrEqual(previous - 1e-6);
      expect(state.speedMps - previous).toBeLessThanOrEqual(ACCEL_MPS2 * dt + 1e-6);
      expect(state.speedMps).toBeLessThanOrEqual(MAX_SPEED_MPS);
      previous = state.speedMps;
    }
    expect(state.speedMps).toBeCloseTo(MAX_SPEED_MPS, 5);
    previous = state.speedMps;
    for (let index = 0; index < 40; index += 1) {
      state = stepVehicle(network, state, { accelerate: true, brake: true }, dt);
      expect(state.speedMps).toBeLessThanOrEqual(previous + 1e-6);
      expect(previous - state.speedMps).toBeLessThanOrEqual(BRAKE_MPS2 * dt + 1e-6);
      expect(state.speedMps).toBeGreaterThanOrEqual(0);
      previous = state.speedMps;
    }
    expect(state.speedMps).toBe(0);
    expect(state.mode).toBe("driving");
  });

  it("follows a bend without leaving the road or spinning in one frame", () => {
    for (const place of places) {
      const corner = northOf(place, 80);
      const end = eastOf(corner, 80);
      const network = buildRoadNetwork([
        segment(place.name, ["1", "2", "3"], [place, corner, end], { name: place.name, oneway: "forward" }),
      ]);
      const edge = network.edges.find((item) => item.id.endsWith(":forward"));
      const cornerDistance = edge!.cumulativeMeters[1] ?? 0;
      let state = vehicleFromPlacement({
        edge: edge!,
        distanceMeters: cornerDistance - 0.2,
        gapMeters: 0,
      });
      state = { ...state, speedMps: 12, headingDegrees: 0 };
      const before = state.headingDegrees;
      state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
      expect(state.mode).toBe("driving");
      expect(headingDelta(state.headingDegrees, before)).toBeLessThanOrEqual(YAW_DEGREES_PER_SECOND * 0.05 + 0.001);
      expect(nearestPlacement(network, state.position, 5)?.gapMeters ?? 99).toBeLessThan(0.5);
      for (let index = 0; index < 20; index += 1) {
        state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
        expect(nearestPlacement(network, state.position, 5)?.gapMeters ?? 99).toBeLessThan(0.5);
      }
      expect(headingDelta(state.headingDegrees, 90)).toBeLessThan(8);
      expect(state.position.lng).toBeGreaterThan(corner.lng);
      expect(Math.abs(state.position.lat - corner.lat)).toBeLessThan(0.0002);
    }
  });

  it("starts a sharp turn before the corner and stays on the centerline", () => {
    for (const place of places) {
      const corner = northOf(place, 80);
      const end = eastOf(corner, 80);
      const network = buildRoadNetwork([
        segment(`${place.name}-sväng`, ["1", "2", "3"], [place, corner, end], {
          name: place.name,
          oneway: "forward",
        }),
      ]);
      const edge = network.edges.find((item) => item.id.endsWith(":forward"));
      const cornerDistance = edge!.cumulativeMeters[1] ?? 0;
      let state = vehicleFromPlacement({
        edge: edge!,
        distanceMeters: cornerDistance - 3,
        gapMeters: 0,
      });
      state = { ...state, speedMps: 4, headingDegrees: 0, message: null };
      let turned = false;
      for (let index = 0; index < 12 && state.distanceMeters < cornerDistance - 0.4; index += 1) {
        const before = state.headingDegrees;
        state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
        expect(headingDelta(state.headingDegrees, before)).toBeLessThanOrEqual(YAW_DEGREES_PER_SECOND * 0.05 + 0.001);
        expect(nearestPlacement(network, state.position, 5)?.gapMeters ?? 99).toBeLessThan(0.5);
        if (state.headingDegrees > 5 && state.headingDegrees < 55) {
          turned = true;
        }
      }
      expect(turned).toBe(true);
      expect(state.distanceMeters).toBeLessThan(cornerDistance);
    }
  });

  it("follows a gentle bend without sliding off the centerline", () => {
    const origin: RoadPoint = { lat: places[0]!.lat, lng: places[0]!.lng };
    const points = [origin];
    let cursor = origin;
    let bearing = 0;
    for (let index = 0; index < 5; index += 1) {
      const radians = (bearing * Math.PI) / 180;
      const cosine = Math.cos((cursor.lat * Math.PI) / 180);
      cursor = {
        lat: cursor.lat + (Math.cos(radians) * 20) / 111320,
        lng: cursor.lng + (Math.sin(radians) * 20) / (111320 * Math.max(0.2, cosine)),
      };
      points.push(cursor);
      bearing += 12;
    }
    const network = buildRoadNetwork([
      segment("böj", ["1", "2", "3", "4", "5", "6"], points, { name: "Böjen", oneway: "forward" }),
    ]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: 0, gapMeters: 0 });
    state = { ...state, speedMps: 10 };
    for (let index = 0; index < 100; index += 1) {
      const before = state.headingDegrees;
      state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
      expect(state.mode).toBe("driving");
      expect(headingDelta(state.headingDegrees, before)).toBeLessThanOrEqual(YAW_DEGREES_PER_SECOND * 0.05 + 0.001);
      expect(nearestPlacement(network, state.position, 8)?.gapMeters ?? 99).toBeLessThan(1);
    }
    expect(state.headingDegrees).toBeGreaterThan(8);
    expect(state.headingDegrees).toBeLessThan(50);
  });

  it("slows down when the accelerator is released", () => {
    const network = buildRoadNetwork([
      segment("norr", ["1", "2"], [start, northOf(start, 200)], { oneway: "forward" }),
    ]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: 10, gapMeters: 0 });
    state = { ...state, speedMps: 8, message: null };
    const dt = 0.05;
    for (let index = 0; index < 10; index += 1) {
      const before = state.speedMps;
      state = stepVehicle(network, state, { accelerate: false, brake: false }, dt);
      expect(before - state.speedMps).toBeCloseTo(COAST_MPS2 * dt, 5);
      expect(state.speedMps).toBeGreaterThan(0);
    }
  });

  it("turns onto the only connecting road without jumping to a nearby segment", () => {
    const corner = northOf(start, 50);
    const end = eastOf(corner, 40);
    const beside = { lat: corner.lat + 0.00004, lng: corner.lng + 0.00004 };
    const network = buildRoadNetwork([
      segment("ett", ["1", "2"], [start, corner], { name: "Ett", oneway: "forward" }),
      segment("två", ["2", "3"], [corner, end], { name: "Två", oneway: "forward" }),
      segment("nära", ["9", "8"], [beside, eastOf(beside, 30)], { name: "Bredvid" }),
    ]);
    const edge = network.edgesById.get("ett:0-1:forward");
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters - 0.3, gapMeters: 0 });
    state = { ...state, speedMps: 8, headingDegrees: 0 };
    state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
    expect(state.edgeId).toContain("två");
    expect(state.mode).toBe("driving");
    expect(headingDelta(state.headingDegrees, 0)).toBeLessThanOrEqual(YAW_DEGREES_PER_SECOND * 0.05 + 0.001);
    expect(nearestPlacement(network, state.position, 20)?.edge.osmWayId).not.toBe("nära");
    const gap = nearestPlacement(network, state.position, 20)?.gapMeters ?? 99;
    expect(gap).toBeLessThan(0.5);
  });

  it("brakes to a controlled stop when the road ends or the edge disappears", () => {
    const end = northOf(start, 200);
    const network = buildRoadNetwork([
      segment("slut", ["1", "2"], [start, end], { name: "Slutgatan", oneway: "forward" }),
    ]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"));
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: edge!.lengthMeters - 40, gapMeters: 0 });
    state = { ...state, speedMps: 12, message: null };
    let speedBeforeStop = state.speedMps;
    for (let index = 0; index < 400 && state.mode === "driving"; index += 1) {
      speedBeforeStop = state.speedMps;
      state = stepVehicle(network, state, { accelerate: false, brake: false }, 0.05);
      expect(state.speedMps).toBeGreaterThanOrEqual(0);
      expect(Math.abs(state.position.lng - start.lng)).toBeLessThan(0.0001);
    }
    expect(speedBeforeStop).toBeLessThan(6);
    expect(state.mode).toBe("ended");
    expect(state.speedMps).toBe(0);
    expect(state.position).toEqual(end);
    expect(state.message).toContain("tar slut");

    const missing = stepVehicle(
      network,
      { ...state, mode: "driving", edgeId: "borta", speedMps: 6, message: null },
      { accelerate: true, brake: false },
      0.05,
    );
    expect(missing.mode).toBe("ended");
    expect(missing.speedMps).toBe(0);
    expect(missing.position).toEqual(state.position);
    expect(missing.message).toContain("finns inte");
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
