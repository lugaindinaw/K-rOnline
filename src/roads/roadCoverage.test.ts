import { describe, expect, it } from "vitest";
import { buildRoadNetwork } from "./roadNetwork";
import {
  EXTEND_EMPTY_MESSAGE,
  coverageMargin,
  extendFailureMessage,
  isNearCoverage,
  mergeRoadSegments,
  prefetchCenter,
  pruneCoverage,
  shouldPrefetch,
} from "./roadCoverage";
import { distanceMeters, type OneWay, type RoadPoint, type RoadSegment } from "./drivingRoads";

const places = [
  { name: "Stockholm", point: { lat: 59.3293, lng: 18.0686 } },
  { name: "Kiruna", point: { lat: 67.8558, lng: 20.2253 } },
  { name: "Glommersträsk", point: { lat: 65.258, lng: 19.654 } },
];

function segment(
  id: string,
  nodes: string[] | null,
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

function northOf(point: RoadPoint, meters: number): RoadPoint {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

describe("road coverage", () => {
  it("prefetches near the area edge and keeps the new center ahead of the car", () => {
    for (const place of places) {
      const areas = [{ center: place.point, radiusMeters: 600 }];
      expect(shouldPrefetch(place.point, areas)).toBe(false);
      const nearEdge = northOf(place.point, 450);
      expect(coverageMargin(nearEdge, areas)).toBeLessThan(200);
      expect(shouldPrefetch(nearEdge, areas)).toBe(true);
      const next = prefetchCenter(nearEdge, 0);
      expect(distanceMeters(nearEdge, next)).toBeGreaterThan(300);
      expect(next.lat).toBeGreaterThan(nearEdge.lat);
    }
    expect(shouldPrefetch(places[0]!.point, [])).toBe(false);
    const stockholm = [{ center: places[0]!.point, radiusMeters: 600 }];
    expect(shouldPrefetch(places[1]!.point, stockholm)).toBe(false);
    expect(shouldPrefetch(places[2]!.point, stockholm)).toBe(false);
    expect(isNearCoverage(places[1]!.point, stockholm)).toBe(false);
    expect(isNearCoverage(northOf(places[0]!.point, 450), stockholm)).toBe(true);
  });

  it("stitches a continued way and refuses a nearby way with different nodes", () => {
    for (const place of places) {
      const start = place.point;
      const middle = northOf(start, 80);
      const end = northOf(start, 160);
      const beside = { lat: middle.lat + 0.00002, lng: middle.lng + 0.00002 };
      const merged = mergeRoadSegments([
        segment("10", ["1", "2"], [start, middle], { name: place.name }),
        segment("10", ["2", "3"], [middle, end], { name: place.name }),
        segment("11", ["9", "8"], [beside, northOf(beside, 40)], { name: "Bredvid" }),
      ]);
      const network = buildRoadNetwork(merged);
      const forward = network.edges.find((edge) => edge.osmWayId === "10" && edge.id.endsWith(":forward"));
      expect(forward?.points).toHaveLength(3);
      expect(forward?.fromNode).toBe("1");
      expect(forward?.toNode).toBe("3");
      expect((network.outgoing.get("2") ?? []).some((edge) => edge.osmWayId === "11")).toBe(false);
    }
  });

  it("leaves a gap in the same way unconnected when the node chains do not meet", () => {
    const start = places[2]!.point;
    const merged = mergeRoadSegments([
      segment("gata", ["1", "2"], [start, northOf(start, 30)]),
      segment("gata", ["4", "5"], [northOf(start, 90), northOf(start, 120)]),
    ]);
    expect(merged).toHaveLength(2);
    const network = buildRoadNetwork(merged);
    expect((network.outgoing.get("2") ?? []).some((edge) => edge.fromNode === "2" && edge.toNode === "5")).toBe(false);
  });

  it("drops the farthest fetched areas and explains a failed extension", () => {
    const focus = places[1]!.point;
    const areas = Array.from({ length: 10 }, (_, index) => ({
      center: northOf(focus, index * 1000),
      radiusMeters: 600,
      index,
    }));
    const kept = pruneCoverage(areas, focus, 8);
    expect(kept).toHaveLength(8);
    expect(kept.some((area) => area.index === 9)).toBe(false);
    expect(kept.some((area) => area.index === 0)).toBe(true);
    expect(extendFailureMessage("Vägtjänsten är upptagen. Försök igen om en stund.")).toContain(
      "kunde inte hämtas",
    );
    expect(EXTEND_EMPTY_MESSAGE).toContain("Inga körbara vägar");
  });
});
