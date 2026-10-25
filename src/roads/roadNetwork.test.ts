import { describe, expect, it } from "vitest";
import { explainRoads, nearestPlacement, placementWithRunway, pointAlong, buildRoadNetwork } from "./roadNetwork";
import type { OneWay, RoadPoint, RoadSegment } from "./drivingRoads";

const a: RoadPoint = { lat: 59.33, lng: 18.07 };
const b: RoadPoint = { lat: 59.3304, lng: 18.07 };
const c: RoadPoint = { lat: 59.3304, lng: 18.071 };
const bend: RoadPoint = { lat: 59.3302, lng: 18.0706 };

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

describe("buildRoadNetwork", () => {
  it("connects roads only when they share an OpenStreetMap node", () => {
    const network = buildRoadNetwork([
      segment("storgatan", ["1", "2", "3"], [a, b, { lat: 59.3308, lng: 18.07 }], { name: "Storgatan" }),
      segment("kungs", ["2", "4"], [b, c], { name: "Kungsgatan" }),
      segment("nära", ["9", "10"], [{ lat: 59.3304002, lng: 18.07 }, { lat: 59.3304002, lng: 18.072 }], {
        name: "Bredvid",
      }),
    ]);

    const fromJunction = network.outgoing.get("2") ?? [];
    expect(fromJunction.some((edge) => edge.osmWayId === "kungs")).toBe(true);
    expect(fromJunction.some((edge) => edge.osmWayId === "storgatan")).toBe(true);
    expect(fromJunction.some((edge) => edge.osmWayId === "nära")).toBe(false);
    const throughStreet = network.edges.find((edge) => edge.id === "storgatan:0-1:forward");
    const afterJunction = network.edges.find((edge) => edge.id === "storgatan:1-2:forward");
    expect(throughStreet?.toNode).toBe("2");
    expect(afterJunction?.fromNode).toBe("2");
    expect(afterJunction?.points[0]).toEqual(b);
  });

  it("keeps intermediate geometry on a road that does not meet another road", () => {
    const network = buildRoadNetwork([segment("bent", ["1", "2", "3"], [a, bend, b])]);
    const forward = network.edges.find((edge) => edge.id.endsWith(":forward"));
    expect(forward?.points).toEqual([a, bend, b]);
    expect(pointAlong(forward!, forward!.cumulativeMeters[1] ?? 0)).toEqual(bend);
  });

  it("follows oneway tags and does not invent the opposite direction", () => {
    const forward = buildRoadNetwork([
      segment("enkel", ["1", "2"], [a, b], { oneway: "forward" }),
    ]);
    expect(forward.edges.map((edge) => edge.id)).toEqual(["enkel:0-1:forward"]);
    expect(forward.outgoing.has("2")).toBe(false);

    const backward = buildRoadNetwork([
      segment("bak", ["1", "2"], [a, b], { oneway: "backward" }),
    ]);
    expect(backward.edges.map((edge) => `${edge.fromNode}->${edge.toNode}`)).toEqual(["2->1"]);
  });

  it("reports missing nodes and a start point far from every road", () => {
    const missing = explainRoads(
      [{ ...segment("lös", ["1", "2"], [a, b]), nodeIds: null }],
      a,
    );
    expect(missing.placement).toBeNull();
    expect(missing.message).toContain("saknar noder");

    const network = buildRoadNetwork([segment("gata", ["1", "2"], [a, b])]);
    expect(nearestPlacement(network, { lat: 60.5, lng: 17 }, 100)).toBeNull();
    const placed = nearestPlacement(network, { lat: 59.3302, lng: 18.07005 }, 100);
    expect(placed?.edge.osmWayId).toBe("gata");
    expect(placed?.gapMeters).toBeLessThan(10);
    const nearEnd = placementWithRunway({ edge: placed!.edge, distanceMeters: placed!.edge.lengthMeters - 1, gapMeters: 0 });
    expect(placed!.edge.lengthMeters - nearEnd.distanceMeters).toBeGreaterThanOrEqual(25);
  });
});
