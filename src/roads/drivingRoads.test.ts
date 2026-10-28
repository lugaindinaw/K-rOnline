import { describe, expect, it } from "vitest";
import {
  MAX_ROAD_RADIUS_METERS,
  MAX_ROADS_PER_AREA,
  buildDrivingRoadQuery,
  capRoads,
  parseOverpassRoads,
  readTrafficControls,
  roadSummary,
  sliceRoadsNear,
  type RoadSegment,
} from "./drivingRoads";

function road(partial: Pick<RoadSegment, "id" | "name" | "highway"> & Partial<RoadSegment>): RoadSegment {
  return {
    osmWayId: partial.id,
    oneway: "both",
    coordinates: [],
    nodeIds: null,
    ...partial,
  };
}

const center = { lat: 65.258, lng: 19.654 };

describe("buildDrivingRoadQuery", () => {
  it("asks Overpass for one local area instead of the whole country", () => {
    const query = buildDrivingRoadQuery(center, 600);
    expect(query).toContain("around:600,65.258000,19.654000");
    expect(query).toContain("residential");
    expect(query).not.toContain("55,10,69,24");
    expect(query).not.toContain("out body");
    expect(query.endsWith("out geom;")).toBe(true);
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
    expect(roads[0]?.nodeIds).toBeNull();
  });

  it("keeps OSM node ids aligned with the geometry and reads oneway", () => {
    const roads = parseOverpassRoads({
      elements: [
        {
          type: "way",
          id: 10,
          nodes: [1, 2, 3],
          tags: { highway: "residential", name: "Storgatan", oneway: "yes" },
          geometry: [
            { lat: 65.258, lon: 19.654 },
            { lat: 65.2582, lon: 19.654 },
            { lat: 65.2584, lon: 19.6544 },
          ],
        },
        {
          type: "way",
          id: 11,
          nodes: [4],
          tags: { highway: "residential", oneway: "-1" },
          geometry: [
            { lat: 65.257, lon: 19.65 },
            { lat: 65.2572, lon: 19.651 },
          ],
        },
      ],
    });

    expect(roads[0]).toMatchObject({
      osmWayId: "10",
      oneway: "forward",
      nodeIds: ["1", "2", "3"],
    });
    expect(roads[1]).toMatchObject({ oneway: "backward", nodeIds: null });
  });

  it("keeps a meter width and a lane count, and ignores widths that are not meters", () => {
    const roads = parseOverpassRoads({
      elements: [
        {
          type: "way",
          id: 20,
          nodes: [1, 2],
          tags: { highway: "residential", width: "8.5 m", lanes: "2" },
          geometry: [
            { lat: 65.258, lon: 19.654 },
            { lat: 65.2582, lon: 19.654 },
          ],
        },
        {
          type: "way",
          id: 21,
          nodes: [3, 4],
          tags: { highway: "residential", width: "30 ft", lanes: "3;1" },
          geometry: [
            { lat: 65.257, lon: 19.65 },
            { lat: 65.2572, lon: 19.65 },
          ],
        },
      ],
    });
    expect(roads[0]).toMatchObject({ widthMeters: 8.5, lanes: 2 });
    expect(roads[1]).toMatchObject({ widthMeters: null, lanes: 3 });
  });

  it("reads a reliable oneway tag and leaves stop, yield and signals unknown", () => {
    expect(readTrafficControls(null)).toEqual({
      oneway: "unknown",
      stop: "unknown",
      giveWay: "unknown",
      signal: "unknown",
    });
    expect(readTrafficControls({ highway: "residential" })).toMatchObject({
      oneway: "unknown",
      stop: "unknown",
      giveWay: "unknown",
      signal: "unknown",
    });
    expect(
      readTrafficControls({
        highway: "residential",
        oneway: "yes",
        stop: "all",
        give_way: "yes",
        traffic_signals: "signal",
      }),
    ).toEqual({
      oneway: "forward",
      stop: "unknown",
      giveWay: "unknown",
      signal: "unknown",
    });
    expect(readTrafficControls({ oneway: "maybe" }).oneway).toBe("unknown");
  });
});

describe("sliceRoadsNear", () => {
  it("drops geometry far outside the requested area", () => {
    const sliced = sliceRoadsNear(
      [
        road({
          id: "1",
          name: "Lång väg",
          highway: "primary",
          nodeIds: ["10", "11", "12"],
          coordinates: [
            { lat: 65.258, lng: 19.654 },
            { lat: 65.259, lng: 19.655 },
            { lat: 60, lng: 15 },
          ],
        }),
      ],
      center,
      600,
    );
    expect(sliced).toHaveLength(1);
    expect(sliced[0]?.coordinates).toHaveLength(2);
    expect(sliced[0]?.nodeIds).toEqual(["10", "11"]);
    expect(sliced[0]?.osmWayId).toBe("1");
  });
});

describe("capRoads", () => {
  it("keeps higher road classes when the area is dense", () => {
    const roads = [
      road({ id: "a", name: "Bostad", highway: "residential" }),
      road({ id: "b", name: "E4", highway: "motorway" }),
      road({ id: "c", name: "Landsväg", highway: "tertiary" }),
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
      road({ id: "1", name: "Storgatan", highway: "primary" }),
      road({ id: "2", name: "Storgatan", highway: "primary" }),
      road({ id: "3", name: null, highway: "residential" }),
    ]);
    expect(summary).toEqual({ names: ["Storgatan"], unnamed: 1 });
  });
});
