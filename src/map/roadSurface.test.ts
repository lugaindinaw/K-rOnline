import { describe, expect, it } from "vitest";
import type { RoadSegment } from "../roads/drivingRoads";
import { distanceMeters } from "../roads/drivingRoads";
import { carriagewayRing, roadSurfaces, visualCarriagewayMeters } from "./roadSurface";

const origin = { lat: 59.33, lng: 18.07 };

function north(meters: number) {
  return { lat: origin.lat + meters / 111320, lng: origin.lng };
}

function road(partial: Partial<RoadSegment> & Pick<RoadSegment, "id">): RoadSegment {
  return {
    osmWayId: partial.id,
    name: null,
    highway: "residential",
    oneway: "both",
    coordinates: [origin, north(40)],
    nodeIds: null,
    ...partial,
  };
}

describe("visual carriageway", () => {
  it("uses a measured width and does not let a single lane tag shrink the class estimate", () => {
    expect(visualCarriagewayMeters({ widthMeters: 8.5, lanes: 1, highway: "residential" })).toBe(8.5);
    expect(visualCarriagewayMeters({ widthMeters: null, lanes: 1, highway: "unclassified" })).toBeGreaterThan(5.5);
    expect(visualCarriagewayMeters({ widthMeters: null, lanes: 2, highway: "residential" })).toBeGreaterThanOrEqual(6.3);
  });

  it("builds an asphalt ribbon about as wide as the carriageway, with sidewalk outside it", () => {
    const ring = carriagewayRing([origin, north(40)], 3);
    expect(ring).not.toBeNull();
    const left = ring![0]!;
    const right = ring![ring!.length - 1]!;
    expect(distanceMeters(left, right)).toBeGreaterThan(5.5);
    expect(distanceMeters(left, right)).toBeLessThan(6.5);
    const surfaces = roadSurfaces([road({ id: "gata" })]);
    expect(surfaces.some((surface) => surface.kind === "asphalt")).toBe(true);
    expect(surfaces.some((surface) => surface.kind === "sidewalk")).toBe(true);
    expect(surfaces.some((surface) => surface.kind === "marking")).toBe(true);
    const oneWay = roadSurfaces([road({ id: "enkel", oneway: "forward", lanes: 1 })]);
    expect(oneWay.filter((surface) => surface.kind === "marking").length).toBe(2);
  });
});
