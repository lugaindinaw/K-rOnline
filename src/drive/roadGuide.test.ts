import { describe, expect, it } from "vitest";
import { vehicleFromPlacement } from "./drive";
import {
  BOUNDARY_MESSAGE,
  ESTIMATED_CARRIAGEWAY_METERS,
  ESTIMATED_LANE_METERS,
  corridorOf,
  guideFreePose,
} from "./roadGuide";
import { buildRoadNetwork, placementOnEdge, pointAlong } from "../roads/roadNetwork";
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
  options?: { name?: string; oneway?: OneWay; widthMeters?: number; lanes?: number },
): RoadSegment {
  return {
    id,
    osmWayId: id,
    name: options?.name ?? id,
    highway: "residential",
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
  it("uses a measured width, estimates meters from a lane count, and otherwise uses a documented fallback", () => {
    expect(corridorOf({ widthMeters: 8, lanes: 2 })).toEqual({ halfMeters: 4, basis: "width" });
    expect(corridorOf({ widthMeters: null, lanes: 2 })).toEqual({
      halfMeters: ESTIMATED_LANE_METERS,
      basis: "lanes",
    });
    expect(corridorOf({ widthMeters: null, lanes: null })).toEqual({
      halfMeters: ESTIMATED_CARRIAGEWAY_METERS / 2,
      basis: "estimate",
    });
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
    expect(gap).toBeGreaterThan(2);
    expect(gap).toBeLessThan(4);
    expect(distanceMeters(state.position, center)).toBeGreaterThan(2);
    expect(state.edgeId).toBe(edge.id);
    expect(state.message).toBe(BOUNDARY_MESSAGE);
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
