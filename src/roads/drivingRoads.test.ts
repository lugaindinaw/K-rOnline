import { describe, expect, it } from "vitest";
import {
  MAX_ROAD_RADIUS_METERS,
  MAX_ROADS_PER_AREA,
  buildDrivingRoadQuery,
  capRoads,
  parseOverpassRoads,
  roadSummary,
  sliceRoadsNear,
} from "./drivingRoads";

const center = { lat: 65.258, lng: 19.654 };

describe("buildDrivingRoadQuery", () => {
  it("asks Overpass for one local area instead of the whole country", () => {
    const query = buildDrivingRoadQuery(center, 600);
    expect(query).toContain("around:600,65.258000,19.654000");
    expect(query).toContain("residential");
    expect(query).not.toContain("55,10,69,24");
    expect(query).not.toContain("out body");
  });

  it("refuses a radius large enough to cover Sweden", () => {
    expect(buildDrivingRoadQuery(center, 500000)).toContain(`around:${MAX_ROAD_RADIUS_METERS},`);
  });
});

describe("parseOverpassRoads", () => {
  it("reads named and unnamed ways and ignores other elements", () => {
    const roads = parseOverpassRoads({
      elements: [
        {
          type: "way",
          id: 10,
          tags: { highway: "primary", name: "Storgatan" },
          geometry: [
            { lat: 65.258, lon: 19.654 },
            { lat: 65.259, lon: 19.656 },
          ],
        },
        {
          type: "way",
          id: 11,
          tags: { highway: "residential" },
          geometry: [
            { lat: 65.257, lon: 19.65 },
            { lat: 65.2575, lon: 19.651 },
          ],
        },
        { type: "node", id: 1, lat: 65.25, lon: 19.65 },
        {
          type: "way",
          id: 12,
          tags: { highway: "footway", name: "Gångstig" },
          geometry: [
            { lat: 65.25, lon: 19.65 },
            { lat: 65.251, lon: 19.651 },
          ],
        },
      ],
    });

    expect(roads.map((road) => road.name)).toEqual(["Storgatan", null]);
    expect(roads[0]?.coordinates[0]).toEqual({ lat: 65.258, lng: 19.654 });
  });
});

describe("sliceRoadsNear", () => {
  it("drops geometry far outside the requested area", () => {
    const sliced = sliceRoadsNear(
      [
        {
          id: "1",
          name: "Lång väg",
          highway: "primary",
          coordinates: [
            { lat: 65.258, lng: 19.654 },
            { lat: 65.259, lng: 19.655 },
            { lat: 60, lng: 15 },
          ],
        },
      ],
      center,
      600,
    );
    expect(sliced).toHaveLength(1);
    expect(sliced[0]?.coordinates).toHaveLength(2);
  });
});

describe("capRoads", () => {
  it("keeps higher road classes when the area is dense", () => {
    const roads = [
      { id: "a", name: "Bostad", highway: "residential", coordinates: [] },
      { id: "b", name: "E4", highway: "motorway", coordinates: [] },
      { id: "c", name: "Landsväg", highway: "tertiary", coordinates: [] },
    ];
    const capped = capRoads(roads, 2);
    expect(capped.truncated).toBe(true);
    expect(capped.roads.map((road) => road.highway)).toEqual(["motorway", "tertiary"]);
    expect(MAX_ROADS_PER_AREA).toBeGreaterThan(2);
  });
});

describe("roadSummary", () => {
  it("lists each name once", () => {
    const summary = roadSummary([
      { id: "1", name: "Storgatan", highway: "primary", coordinates: [] },
      { id: "2", name: "Storgatan", highway: "primary", coordinates: [] },
      { id: "3", name: null, highway: "residential", coordinates: [] },
    ]);
    expect(summary).toEqual({ names: ["Storgatan"], unnamed: 1 });
  });
});
