import { describe, expect, it } from "vitest";
import { buildRoadNetwork, pathHeading, sampleEdge } from "./roadNetwork";
import { courseStart, savedCourseArea } from "./savedRoadCourses";
import { seedCourseTraffic } from "../traffic/courseTraffic";

function headingDelta(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

describe("saved road courses", () => {
  it("starts the rural exercise on the 70 km/h two-lane road", () => {
    const area = savedCourseArea("rural");
    const network = buildRoadNetwork(area.roads);
    const start = courseStart(area.roads, "rural");
    expect(start).not.toBeNull();
    const edge = network.edgesById.get(start!.edgeId);
    expect(edge?.name).toBe("Färentunavägen");
    expect(edge?.highway).toBe("secondary");
    expect(edge?.maxspeedKmh).toBe(70);
    expect(edge?.lanes).toBe(2);
    const opposite = network.edges.some(
      (item) =>
        item.osmWayId === edge?.osmWayId &&
        item.id !== edge?.id &&
        headingDelta(pathHeading(null, edge!, 10), pathHeading(null, item, 10)) > 120,
    );
    expect(opposite).toBe(true);
    const player = sampleEdge(edge!, start!.distanceMeters).position;
    const cars = seedCourseTraffic(network, [], player);
    expect(cars.some((car) => car.id === "kurs-framfor")).toBe(true);
    expect(cars.some((car) => car.id === "kurs-mote")).toBe(true);
  });

  it("starts the motorway exercise on the on-ramp and can reach the carriageway and an exit", () => {
    const area = savedCourseArea("motorway");
    const network = buildRoadNetwork(area.roads);
    const start = courseStart(area.roads, "motorway");
    expect(start).not.toBeNull();
    let edge = network.edgesById.get(start!.edgeId);
    expect(edge?.highway).toBe("motorway_link");
    expect(edge?.maxspeedKmh).toBe(80);
    let sawMotorway = false;
    let exitTurn: number | null = null;
    const seen = new Set<string>();
    for (let hop = 0; hop < 16 && edge; hop += 1) {
      if (seen.has(edge.id)) {
        break;
      }
      seen.add(edge.id);
      if (edge.highway === "motorway") {
        sawMotorway = true;
        expect(edge.lanes).toBeGreaterThanOrEqual(2);
        expect(edge.maxspeedKmh).toBeGreaterThanOrEqual(100);
      }
      const heading = pathHeading(null, edge, Math.max(0, edge.lengthMeters - 1));
      const candidates = (network.outgoing.get(edge.toNode) ?? []).filter(
        (item) => item.fromNode === edge!.toNode && item.id !== edge!.id,
      );
      if (sawMotorway && edge.highway === "motorway") {
        for (const item of candidates) {
          if (item.highway !== "motorway_link") {
            continue;
          }
          const signed = ((pathHeading(null, item, 12) - heading + 540) % 360) - 180;
          exitTurn = signed;
        }
      }
      edge = candidates.sort(
        (left, right) =>
          headingDelta(heading, pathHeading(null, left, 8)) - headingDelta(heading, pathHeading(null, right, 8)),
      )[0];
    }
    expect(sawMotorway).toBe(true);
    expect(exitTurn).not.toBeNull();
    expect(exitTurn!).toBeGreaterThanOrEqual(12);
    const player = sampleEdge(network.edgesById.get(start!.edgeId)!, start!.distanceMeters).position;
    const cars = seedCourseTraffic(network, [], player);
    const lead = cars.find((car) => car.id === "kurs-framfor");
    expect(lead).toBeTruthy();
    expect(network.edgesById.get(lead!.edgeId)?.highway).toBe("motorway");
    expect(lead!.speedMps * 3.6).toBeGreaterThan(80);
  });
});
