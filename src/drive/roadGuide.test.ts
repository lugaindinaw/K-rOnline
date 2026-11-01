import { describe, expect, it } from "vitest";
import { vehicleFromPlacement } from "./drive";
import { advanceFreeVehicle } from "./freeDrive";
import {
  BOUNDARY_MESSAGE,
  DROPPED_LINK_MESSAGE,
  ROAD_END_MESSAGE,
  CAR_BODY_WIDTH_METERS,
  ESTIMATED_CARRIAGEWAY_METERS,
  ESTIMATED_LANE_METERS,
  MEASURED_LEAVE_MESSAGE,
  TRACK_SLACK_METERS,
  UNCERTAIN_WIDTH_MESSAGE,
  bodyExtentMeters,
  clearanceOf,
  corridorOf,
  estimatedCarriagewayMeters,
  explainContinuation,
  followRoadCurve,
  guideFreePose,
} from "./roadGuide";
import { buildRoadNetwork, placementOnEdge, pointAlong, recordOmittedLinks } from "../roads/roadNetwork";
import { distanceMeters, type OneWay, type RoadPoint, type RoadSegment } from "../roads/drivingRoads";

const origin: RoadPoint = { lat: 59.33, lng: 18.07 };

function northOf(point: RoadPoint, meters: number): RoadPoint {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

function southOf(point: RoadPoint, meters: number): RoadPoint {
  return northOf(point, -meters);
}

function eastOf(point: RoadPoint, meters: number): RoadPoint {
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat, lng: point.lng + meters / (111320 * Math.max(0.2, cosine)) };
}

function segment(
  id: string,
  nodes: string[],
  coordinates: RoadPoint[],
  options?: { name?: string; oneway?: OneWay; widthMeters?: number; lanes?: number; highway?: string },
): RoadSegment {
  return {
    id,
    osmWayId: id,
    name: options?.name ?? id,
    highway: options?.highway ?? "residential",
    oneway: options?.oneway ?? "both",
    coordinates,
    nodeIds: nodes,
    widthMeters: options?.widthMeters ?? null,
    lanes: options?.lanes ?? null,
  };
}

function edgeNamed(network: ReturnType<typeof buildRoadNetwork>, wayId: string, direction: "forward" | "backward") {
  const edge = network.edges.find((item) => item.osmWayId === wayId && item.id.endsWith(direction));
  if (!edge) {
    throw new Error(`missing ${wayId} ${direction}`);
  }
  return edge;
}

describe("corridorOf", () => {
  it("uses a measured width, and does not let one lane shrink a city street", () => {
    expect(corridorOf({ widthMeters: 8, lanes: 2, highway: "residential" })).toEqual({
      halfMeters: 4,
      basis: "width",
    });
    expect(corridorOf({ widthMeters: null, lanes: 4, highway: "residential" })).toEqual({
      halfMeters: (4 * ESTIMATED_LANE_METERS) / 2,
      basis: "lanes",
    });
    expect(corridorOf({ widthMeters: null, lanes: 1, highway: "unclassified" })).toEqual({
      halfMeters: estimatedCarriagewayMeters("unclassified") / 2,
      basis: "estimate",
    });
    expect(corridorOf({ widthMeters: null, lanes: null, highway: "tertiary" })).toEqual({
      halfMeters: estimatedCarriagewayMeters("tertiary") / 2,
      basis: "estimate",
    });
    expect(corridorOf({ widthMeters: null, lanes: null })).toEqual({
      halfMeters: ESTIMATED_CARRIAGEWAY_METERS / 2,
      basis: "estimate",
    });
    expect(estimatedCarriagewayMeters("unclassified")).toBeGreaterThan(3.5);
  });

  it("keeps the car body inside a measured width and does not widen a narrower tag", () => {
    const fitted = clearanceOf({ widthMeters: 6, highway: "residential" }, 0);
    expect(fitted.basis).toBe("width");
    expect(fitted.roadHoldsCar).toBe(true);
    expect(fitted.centerLimit).toBeLessThan(3);
    expect(fitted.centerLimit).toBeGreaterThan(3 - CAR_BODY_WIDTH_METERS / 2 - 0.2);
    expect(fitted.centerLimit).toBeLessThanOrEqual(3 + TRACK_SLACK_METERS);
    const yawed = clearanceOf({ widthMeters: 6, highway: "residential" }, 90);
    expect(yawed.centerLimit).toBeLessThan(fitted.centerLimit);
    const tracking = clearanceOf({ widthMeters: 6, highway: "residential" }, 5);
    expect(tracking.centerLimit).toBeCloseTo(fitted.centerLimit, 5);
    expect(bodyExtentMeters(5)).toBeCloseTo(CAR_BODY_WIDTH_METERS / 2, 5);
    expect(bodyExtentMeters(20)).toBeGreaterThan(CAR_BODY_WIDTH_METERS / 2);
    const tooNarrow = clearanceOf({ widthMeters: 1.7, highway: "residential" }, 0);
    expect(tooNarrow.roadHoldsCar).toBe(false);
    expect(tooNarrow.centerLimit).toBeLessThanOrEqual(1.7 / 2 + TRACK_SLACK_METERS);
  });
});

describe("followRoadCurve", () => {
  it("turns toward a bend gradually and leaves the turn to the player", () => {
    let heading = 0;
    for (let index = 0; index < 10; index += 1) {
      heading = followRoadCurve(heading, 40, 0, 0.05);
    }
    expect(heading).toBeGreaterThan(12);
    expect(heading).toBeLessThan(32);
    const assisted = followRoadCurve(0, 40, 0, 0.05);
    const steered = followRoadCurve(0, 40, 1, 0.05);
    expect(steered).toBeLessThan(assisted);
    expect(followRoadCurve(10, 10, 0, 0.05)).toBeCloseTo(10, 5);
  });
});

describe("guideFreePose", () => {
  const junction = origin;
  const network = buildRoadNetwork([
    segment("söder", ["s", "n"], [southOf(junction, 80), junction], { name: "Söder" }),
    segment("norr", ["n", "b"], [junction, northOf(junction, 80)], { name: "Norr" }),
    segment("öster", ["n", "e"], [junction, eastOf(junction, 80)], { name: "Öster" }),
    segment("bredvid", ["p", "q"], [eastOf(northOf(junction, 20), 18), eastOf(northOf(junction, 70), 18)], {
      name: "Bredvid",
    }),
  ]);
  const south = edgeNamed(network, "söder", "forward");
  const north = edgeNamed(network, "norr", "forward");
  const east = edgeNamed(network, "öster", "forward");

  it("continues straight onto the connected road without snapping to its centerline", () => {
    const before = vehicleFromPlacement({ edge: south, distanceMeters: south.lengthMeters - 12, gapMeters: 0 });
    const beside = eastOf(before.position, 2);
    const moved = eastOf(northOf(junction, 8), 2);
    const next = guideFreePose(
      { ...before, position: beside },
      { position: moved, headingDegrees: 0, speedMps: 8 },
      network,
      0.05,
    );
    expect(next.edgeId).toBe(north.id);
    expect(next.position).toEqual(moved);
    expect(distanceMeters(next.position, pointAlong(north, next.distanceMeters))).toBeGreaterThan(1);
    expect(next.speedMps).toBeGreaterThan(5);
    expect(next.mode).toBe("driving");
    expect(next.choices).toEqual([]);
    expect(next.measurementReliable).toBe(true);
  });

  it("follows steering onto the connected side road and ignores a nearer unconnected road", () => {
    const before = vehicleFromPlacement({ edge: south, distanceMeters: south.lengthMeters - 10, gapMeters: 0 });
    const moved = northOf(eastOf(junction, 8), 1.2);
    const next = guideFreePose(
      before,
      { position: moved, headingDegrees: 90, speedMps: 7 },
      network,
      0.05,
    );
    expect(next.edgeId).toBe(east.id);
    expect(next.edgeId).not.toContain("bredvid");
    expect(next.position).toEqual(moved);
    expect(distanceMeters(next.position, pointAlong(east, next.distanceMeters))).toBeGreaterThan(0.5);
    expect(next.speedMps).toBe(7);
  });

  it("does not adopt a parallel road that does not share the junction node", () => {
    const before = vehicleFromPlacement({ edge: south, distanceMeters: south.lengthMeters - 8, gapMeters: 0 });
    const parallel = eastOf(northOf(junction, 30), 18);
    const next = guideFreePose(
      before,
      { position: parallel, headingDegrees: 0, speedMps: 8 },
      network,
      0.05,
    );
    expect(next.edgeId).not.toContain("bredvid");
    expect(distanceMeters(next.position, parallel)).toBeGreaterThan(5);
    expect(next.position).not.toEqual(pointAlong(south, south.lengthMeters));
  });

  it("stops a perpendicular exit at the preliminary boundary instead of the centerline", () => {
    const narrow = buildRoadNetwork([
      segment("smal", ["a", "b"], [origin, northOf(origin, 100)], { widthMeters: 6, name: "Smal" }),
    ]);
    const edge = edgeNamed(narrow, "smal", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 40, gapMeters: 0 });
    const center = state.position;
    for (let index = 0; index < 40; index += 1) {
      const step = {
        position: eastOf(state.position, 1.2),
        headingDegrees: 90,
        speedMps: 6,
      };
      state = guideFreePose(state, step, narrow, 0.05);
    }
    const gap = placementOnEdge(edge, state.position).gapMeters;
    expect(gap).toBeGreaterThan(0.7);
    expect(gap).toBeLessThan(2);
    expect(distanceMeters(state.position, center)).toBeGreaterThan(0.7);
    expect(state.edgeId).toBe(edge.id);
    expect(state.message).toBe(MEASURED_LEAVE_MESSAGE);
    expect(state.measurementReliable).toBe(true);
    expect(placementOnEdge(edge, state.position).gapMeters).toBeLessThan(4);
  });

  it("does not treat the junction flare outside the carriageway as a measured distance", () => {
    const before = vehicleFromPlacement({ edge: south, distanceMeters: south.lengthMeters - 6, gapMeters: 0 });
    const flared = eastOf(before.position, 8);
    const next = guideFreePose(before, { position: flared, headingDegrees: 0, speedMps: 4 }, network, 0.05);
    expect(next.position).toEqual(flared);
    expect(next.measurementReliable).toBe(false);
  });
});

describe("curve following", () => {
  it("drives through a bend without stopping or returning to the centerline", () => {
    const points: RoadPoint[] = [origin];
    const nodes = ["0"];
    let cursor = origin;
    let bearing = 0;
    for (let index = 1; index <= 8; index += 1) {
      bearing += 6;
      const heading = (bearing * Math.PI) / 180;
      const cosine = Math.cos((cursor.lat * Math.PI) / 180);
      cursor = {
        lat: cursor.lat + (12 * Math.cos(heading)) / 111320,
        lng: cursor.lng + (12 * Math.sin(heading)) / (111320 * Math.max(0.2, cosine)),
      };
      points.push(cursor);
      nodes.push(String(index));
    }
    const network = buildRoadNetwork([
      segment("kurva", nodes, points, { name: "Kurvan", highway: "unclassified", lanes: 1 }),
    ]);
    const edge = edgeNamed(network, "kurva", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 10, gapMeters: 0 });
    state = { ...state, position: eastOf(state.position, 1.6) };
    for (let index = 0; index < 70; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    const linked = network.edgesById.get(state.edgeId) ?? edge;
    const gap = placementOnEdge(linked, state.position).gapMeters;
    expect(state.speedMps).toBeGreaterThan(4);
    expect(state.headingDegrees).toBeGreaterThan(12);
    expect(state.headingDegrees).toBeLessThan(70);
    expect(gap).toBeGreaterThan(0.4);
    expect(gap).toBeLessThan(6);
    expect(state.message).not.toBe(BOUNDARY_MESSAGE);
    expect(state.position).not.toEqual(pointAlong(linked, state.distanceMeters));
  });

  it("drives through a short mild kink without stopping on the inside", () => {
    const bend = northOf(eastOf(origin, 12.4 * Math.sin((352 * Math.PI) / 180)), 12.4 * Math.cos((352 * Math.PI) / 180));
    const end = northOf(eastOf(bend, 80 * Math.sin((340 * Math.PI) / 180)), 80 * Math.cos((340 * Math.PI) / 180));
    const network = buildRoadNetwork([
      segment("första", ["a", "b"], [origin, bend], { name: "Regeringsgatan", highway: "residential" }),
      segment("andra", ["b", "c"], [bend, end], { name: "Regeringsgatan", highway: "residential" }),
    ]);
    const first = edgeNamed(network, "första", "forward");
    let state = vehicleFromPlacement({ edge: first, distanceMeters: 1, gapMeters: 0 });
    state = { ...state, position: eastOf(state.position, -1.2), speedMps: 10, headingDegrees: 352 };
    let slowest = state.speedMps;
    for (let step = 0; step < 120; step += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
      slowest = Math.min(slowest, state.speedMps);
    }
    const linked = network.edgesById.get(state.edgeId);
    expect(linked?.osmWayId).toBe("andra");
    expect(state.roadName).toBe("Regeringsgatan");
    expect(state.speedMps).toBeGreaterThan(8);
    expect(slowest).toBeGreaterThan(6);
    expect(state.message).not.toBe(BOUNDARY_MESSAGE);
    expect(placementOnEdge(linked!, state.position).gapMeters).toBeLessThan(3.2);
  });

  it("follows a tight city bend onto the connected street", () => {
    const pieces: Array<[number, number]> = [
      [8.3, 331.6],
      [4.59, 326.6],
      [4.46, 327.5],
      [3.59, 343.3],
      [3.17, 352.5],
      [4, 9.1],
      [4.96, 32.9],
      [6.09, 51.1],
      [8.95, 59.1],
      [12.74, 62.1],
      [3.25, 60.5],
      [2.7, 48.1],
      [2.06, 15.5],
      [1.71, 355.6],
      [4.3, 344.2],
    ];
    const points: RoadPoint[] = [origin];
    const nodes = ["0"];
    let cursor = origin;
    pieces.forEach(([length, heading], index) => {
      const radians = (heading * Math.PI) / 180;
      const cosine = Math.cos((cursor.lat * Math.PI) / 180);
      cursor = {
        lat: cursor.lat + (length * Math.cos(radians)) / 111320,
        lng: cursor.lng + (length * Math.sin(radians)) / (111320 * Math.max(0.2, cosine)),
      };
      points.push(cursor);
      nodes.push(String(index + 1));
    });
    const join = nodes[nodes.length - 1] ?? "end";
    const streetHeading = 344.2;
    const streetRadians = (streetHeading * Math.PI) / 180;
    const cosine = Math.cos((cursor.lat * Math.PI) / 180);
    const streetEnd = {
      lat: cursor.lat + (40 * Math.cos(streetRadians)) / 111320,
      lng: cursor.lng + (40 * Math.sin(streetRadians)) / (111320 * Math.max(0.2, cosine)),
    };
    const network = buildRoadNetwork([
      segment("torg", nodes, points, { name: "Gustav Adolfs Torg", highway: "unclassified", lanes: 1, oneway: "forward" }),
      segment("reg", [join, "reg-end"], [cursor, streetEnd], {
        name: "Regeringsgatan",
        highway: "tertiary",
        lanes: 1,
        oneway: "forward",
      }),
    ]);
    const edge = edgeNamed(network, "torg", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 2, gapMeters: 0 });
    state = { ...state, position: eastOf(state.position, 1.2) };
    for (let index = 0; index < 200; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    const linked = network.edgesById.get(state.edgeId) ?? edge;
    const gap = placementOnEdge(linked, state.position).gapMeters;
    expect(state.roadName).toBe("Regeringsgatan");
    expect(state.speedMps).toBeGreaterThan(4);
    expect(state.message).not.toBe(BOUNDARY_MESSAGE);
    expect(gap).toBeGreaterThan(0.2);
    expect(gap).toBeLessThan(4.5);
    expect(state.position).not.toEqual(pointAlong(linked, state.distanceMeters));
  });

  it("drives a narrow measured road from the center without stopping", () => {
    const network = buildRoadNetwork([
      segment("smal", ["a", "b"], [origin, northOf(origin, 160)], {
        name: "Smal",
        highway: "residential",
        widthMeters: 3.6,
      }),
    ]);
    const edge = edgeNamed(network, "smal", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 8, gapMeters: 0 });
    for (let index = 0; index < 70; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    const gap = placementOnEdge(edge, state.position).gapMeters;
    expect(state.speedMps).toBeGreaterThan(6);
    expect(state.message).toBeNull();
    expect(gap).toBeLessThan(0.8);
    expect(state.roadName).toBe("Smal");
  });

  it("stops beside a measured edge and marks a too-narrow tag as uncertain", () => {
    const fitted = buildRoadNetwork([
      segment("smal", ["a", "b"], [origin, northOf(origin, 80)], { name: "Smal", widthMeters: 3.6 }),
    ]);
    const edge = edgeNamed(fitted, "smal", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 30, gapMeters: 0 });
    for (let index = 0; index < 20; index += 1) {
      state = guideFreePose(
        state,
        { position: eastOf(state.position, 0.45), headingDegrees: 0, speedMps: 6 },
        fitted,
        0.05,
      );
    }
    const gap = placementOnEdge(edge, state.position).gapMeters;
    expect(gap).toBeGreaterThan(0.6);
    expect(gap).toBeLessThan(1.7);
    expect(state.message).toBe(MEASURED_LEAVE_MESSAGE);
    expect(state.position).not.toEqual(pointAlong(edge, state.distanceMeters));

    const tight = buildRoadNetwork([
      segment("trång", ["a", "b"], [origin, northOf(origin, 80)], { name: "Trång", widthMeters: 1.7 }),
    ]);
    const narrowEdge = edgeNamed(tight, "trång", "forward");
    let narrow = vehicleFromPlacement({ edge: narrowEdge, distanceMeters: 10, gapMeters: 0 });
    for (let index = 0; index < 40; index += 1) {
      narrow = advanceFreeVehicle(narrow, { accelerate: true, brake: false, steer: 0 }, 0.05, tight);
    }
    expect(narrow.speedMps).toBeGreaterThan(4);
    expect(narrow.message).not.toBe(UNCERTAIN_WIDTH_MESSAGE);
    for (let index = 0; index < 16; index += 1) {
      narrow = guideFreePose(
        narrow,
        { position: eastOf(narrow.position, 0.4), headingDegrees: narrow.headingDegrees, speedMps: 5 },
        tight,
        0.05,
      );
    }
    const tightGap = placementOnEdge(narrowEdge, narrow.position).gapMeters;
    expect(narrow.message).toBe(UNCERTAIN_WIDTH_MESSAGE);
    expect(tightGap).toBeGreaterThan(0.4);
    expect(tightGap).toBeLessThan(1.7 / 2 + TRACK_SLACK_METERS + 0.15);
  });

  it("stops and says so when the body leaves a measured road with no side street", () => {
    const network = buildRoadNetwork([
      segment("smal", ["a", "b"], [origin, northOf(origin, 160)], {
        name: "Smal",
        widthMeters: 4,
        highway: "residential",
      }),
    ]);
    const edge = edgeNamed(network, "smal", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 30, gapMeters: 0 });
    state = { ...state, speedMps: 8 };
    for (let index = 0; index < 50; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 1 }, 0.05, network);
    }
    expect(state.roadName).toBe("Smal");
    expect(state.speedMps).toBeLessThan(2);
    expect(state.message).toBe(MEASURED_LEAVE_MESSAGE);
    expect(placementOnEdge(edge, state.position).gapMeters).toBeGreaterThan(0.5);
    expect(state.position).not.toEqual(pointAlong(edge, state.distanceMeters));
  });

  it("drives on when steering is released after the body has left a measured road", () => {
    const network = buildRoadNetwork([
      segment("smal", ["a", "b"], [origin, northOf(origin, 160)], {
        name: "Smal",
        widthMeters: 4,
        highway: "residential",
      }),
    ]);
    const edge = edgeNamed(network, "smal", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 30, gapMeters: 0 });
    state = { ...state, speedMps: 8 };
    for (let index = 0; index < 40; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 1 }, 0.05, network);
    }
    expect(state.speedMps).toBe(0);
    expect(state.message).toBe(MEASURED_LEAVE_MESSAGE);
    for (let index = 0; index < 80; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    expect(state.roadName).toBe("Smal");
    expect(state.speedMps).toBeGreaterThan(6);
    expect(state.message).toBeNull();
    expect(placementOnEdge(edge, state.position).gapMeters).toBeGreaterThan(0.3);
    expect(state.position).not.toEqual(pointAlong(edge, state.distanceMeters));
  });

  it("lets a held steer turn away from the road heading", () => {
    const network = buildRoadNetwork([
      segment("rak", ["a", "b"], [origin, northOf(origin, 200)], { name: "Raka" }),
    ]);
    const edge = edgeNamed(network, "rak", "forward");
    let state = vehicleFromPlacement({ edge, distanceMeters: 20, gapMeters: 0 });
    state = { ...state, speedMps: 8 };
    for (let index = 0; index < 20; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 1 }, 0.05, network);
    }
    expect(state.headingDegrees).toBeGreaterThan(15);
  });
});

describe("junction steering", () => {
  const junction = northOf(origin, 70);
  const network = buildRoadNetwork([
    segment("söder", ["s", "j"], [origin, junction], { name: "Södergatan", highway: "residential" }),
    segment("norr", ["j", "n"], [junction, northOf(junction, 80)], { name: "Norrgatan", highway: "residential" }),
    segment("öster", ["j", "e"], [junction, eastOf(junction, 80)], { name: "Östergatan", highway: "tertiary" }),
    segment("väster", ["j", "w"], [junction, eastOf(junction, -80)], { name: "Västergatan", highway: "tertiary" }),
  ]);
  const south = edgeNamed(network, "söder", "forward");

  function drive(steer: number) {
    let state = vehicleFromPlacement({ edge: south, distanceMeters: 8, gapMeters: 0 });
    state = { ...state, position: eastOf(state.position, 1.1) };
    const wanted = steer === 0 ? "Norrgatan" : steer > 0 ? "Östergatan" : "Västergatan";
    for (let index = 0; index < 220 && state.roadName !== wanted; index += 1) {
      const linked = network.edgesById.get(state.edgeId);
      const remaining = linked && state.roadName === "Södergatan" ? linked.lengthMeters - state.distanceMeters : 99;
      const command = steer !== 0 && remaining < 16 ? steer : 0;
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: command }, 0.05, network);
    }
    for (let index = 0; index < 30; index += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    return state;
  }

  it("continues straight onto the gentle connection without steering", () => {
    const state = drive(0);
    const linked = network.edgesById.get(state.edgeId);
    expect(state.roadName).toBe("Norrgatan");
    expect(state.speedMps).toBeGreaterThan(4);
    expect(state.message).toBeNull();
    expect(linked).toBeTruthy();
    expect(state.position).not.toEqual(pointAlong(linked!, state.distanceMeters));
    expect(placementOnEdge(linked!, state.position).gapMeters).toBeGreaterThan(0.3);
  });

  it("turns right onto a shared-node street past 45 degrees", () => {
    const state = drive(1);
    expect(state.roadName).toBe("Östergatan");
    expect(state.speedMps).toBeGreaterThan(4);
    expect(state.message).toBeNull();
    const linked = network.edgesById.get(state.edgeId);
    expect(linked).toBeTruthy();
    expect(state.position).not.toEqual(pointAlong(linked!, state.distanceMeters));
  });

  it("follows the only continuation when the street itself bends past 45 degrees", () => {
    const bend = northOf(origin, 50);
    const heading = (60 * Math.PI) / 180;
    const next = {
      lat: bend.lat + (80 * Math.cos(heading)) / 111320,
      lng: bend.lng + (80 * Math.sin(heading)) / (111320 * Math.cos((bend.lat * Math.PI) / 180)),
    };
    const network = buildRoadNetwork([
      segment("kort", ["a", "b"], [origin, bend], { name: "Runebergsgatan", highway: "residential", oneway: "forward" }),
      segment("lång", ["b", "c"], [bend, next], { name: "Runebergsgatan", highway: "residential", oneway: "forward" }),
    ]);
    const edge = edgeNamed(network, "kort", "forward");
    const report = explainContinuation(network, edge, 0);
    expect(report.followed).toBe(true);
    expect(report.detail).toContain(edge.osmWayId);
    expect(report.detail).toContain(edge.toNode);
    let state = vehicleFromPlacement({ edge, distanceMeters: 8, gapMeters: 0 });
    for (let step = 0; step < 160; step += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    expect(network.edgesById.get(state.edgeId)?.osmWayId).toBe("lång");
    expect(state.speedMps).toBeGreaterThan(6);
    expect(state.message).toBeNull();
    expect(state.position).not.toEqual(pointAlong(network.edgesById.get(state.edgeId)!, state.distanceMeters));
  });

  it("says when a street ends because no other way shares the node", () => {
    const network = buildRoadNetwork([
      segment("slut", ["a", "b"], [origin, northOf(origin, 40)], { name: "Slutgatan", oneway: "forward" }),
    ]);
    const edge = edgeNamed(network, "slut", "forward");
    const report = explainContinuation(network, edge, 0);
    expect(report.followed).toBe(false);
    expect(report.message).toBe(ROAD_END_MESSAGE);
    expect(report.detail).toContain("slut");
    expect(report.detail).toContain(edge.toNode);
    let state = vehicleFromPlacement({ edge, distanceMeters: 30, gapMeters: 0 });
    state = { ...state, speedMps: 10 };
    for (let step = 0; step < 80; step += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    expect(state.speedMps).toBeLessThan(2);
    expect(state.message).toBe(ROAD_END_MESSAGE);
  });

  it("says when the next street was removed by the road cap", () => {
    const network = buildRoadNetwork([
      segment("slut", ["a", "b"], [origin, northOf(origin, 40)], { name: "Slutgatan", oneway: "forward" }),
    ]);
    const edge = edgeNamed(network, "slut", "forward");
    recordOmittedLinks(network, [
      {
        id: "borta",
        name: "Nästa gata",
        highway: "residential",
        nodeIds: [edge.toNode, "c"],
        reason: "klassgräns",
      },
    ]);
    const report = explainContinuation(network, edge, 0);
    expect(report.followed).toBe(false);
    expect(report.message).toBe(DROPPED_LINK_MESSAGE);
    expect(report.detail).toContain("borta");
    expect(report.detail).toContain(edge.toNode);
    let state = vehicleFromPlacement({ edge, distanceMeters: 30, gapMeters: 0 });
    state = { ...state, speedMps: 10 };
    for (let step = 0; step < 80; step += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: 0 }, 0.05, network);
    }
    expect(state.speedMps).toBeLessThan(2);
    expect(state.message).toBe(DROPPED_LINK_MESSAGE);
  });

  it("turns left onto a shared-node street past 45 degrees", () => {
    const state = drive(-1);
    expect(state.roadName).toBe("Västergatan");
    expect(state.speedMps).toBeGreaterThan(4);
    expect(state.message).toBeNull();
    const linked = network.edgesById.get(state.edgeId);
    expect(linked).toBeTruthy();
    expect(state.position).not.toEqual(pointAlong(linked!, state.distanceMeters));
  });
});
