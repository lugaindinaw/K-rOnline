import { postedLimitKmh } from "../drive/roadSpeed";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import {
  nearestPlacement,
  pathHeading,
  sampleEdge,
  type RoadEdge,
  type RoadNetwork,
} from "../roads/roadNetwork";
import type { TrafficCar } from "./traffic";

function cruiseOf(edge: { highway?: string | null; maxspeedKmh?: number | null }): number {
  const posted = postedLimitKmh(edge);
  if (posted == null) {
    return 8;
  }
  const cruise = posted >= 100 ? posted - 8 : posted >= 70 ? posted - 10 : posted;
  return Math.max(8, cruise / 3.6);
}

function headingDelta(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

function continuation(network: RoadNetwork, edge: RoadEdge): RoadEdge | null {
  const heading = pathHeading(null, edge, Math.max(0, edge.lengthMeters - 1));
  let best: { edge: RoadEdge; delta: number } | null = null;
  for (const out of network.outgoing.get(edge.toNode) ?? []) {
    if (out.id === edge.id || out.fromNode !== edge.toNode) {
      continue;
    }
    const delta = headingDelta(heading, pathHeading(null, out, Math.min(12, out.lengthMeters)));
    if (!best || delta < best.delta) {
      best = { edge: out, delta };
    }
  }
  if (!best || best.delta > 70) {
    return null;
  }
  return best.edge;
}

function travel(
  network: RoadNetwork,
  edge: RoadEdge,
  distance: number,
  meters: number,
): { edge: RoadEdge; distance: number } {
  let current = edge;
  let cursor = Math.min(edge.lengthMeters, Math.max(0, distance));
  let left = Math.max(0, meters);
  for (let hop = 0; hop < 12 && left > 0; hop += 1) {
    const room = current.lengthMeters - cursor;
    if (left <= room) {
      return { edge: current, distance: cursor + left };
    }
    left -= Math.max(0, room);
    const next = continuation(network, current);
    if (!next) {
      return { edge: current, distance: Math.max(0, current.lengthMeters - 8) };
    }
    current = next;
    cursor = 0;
  }
  return { edge: current, distance: cursor };
}

function makeCar(edge: RoadEdge, distance: number, id: string, cruise: number): TrafficCar {
  const along = Math.min(edge.lengthMeters, Math.max(0, distance));
  const sample = sampleEdge(edge, along);
  return {
    id,
    edgeId: edge.id,
    distanceMeters: along,
    speedMps: cruise,
    position: sample.position,
    headingDegrees: sample.headingDegrees,
    cruiseMps: cruise,
  };
}

function oppositeNear(
  network: RoadNetwork,
  edge: RoadEdge,
  target: { edge: RoadEdge; distance: number },
): { edge: RoadEdge; distance: number } | null {
  const sample = sampleEdge(target.edge, target.distance);
  const heading = sample.headingDegrees;
  let best: { edge: RoadEdge; distance: number; gap: number } | null = null;
  for (const other of network.edges) {
    if (other.id === edge.id) {
      continue;
    }
    if (other.osmWayId !== edge.osmWayId && other.name !== edge.name) {
      continue;
    }
    const otherHeading = pathHeading(null, other, Math.min(other.lengthMeters / 2, 20));
    if (headingDelta(heading, otherHeading) < 120) {
      continue;
    }
    const steps = Math.max(2, Math.ceil(other.lengthMeters / 25));
    for (let index = 0; index <= steps; index += 1) {
      const distance = (other.lengthMeters * index) / steps;
      const point = sampleEdge(other, distance).position;
      const gap = distanceMeters(point, sample.position);
      if (gap > 18) {
        continue;
      }
      if (!best || gap < best.gap) {
        best = { edge: other, distance, gap };
      }
    }
  }
  return best;
}

function farEnough(point: RoadPoint, player: RoadPoint): boolean {
  return distanceMeters(point, player) >= 25;
}

/**
 * Puts a slower car ahead, and on a two-way rural road an oncoming car.
 * Replaces earlier course cars so a new start does not keep the old ones.
 */
export function seedCourseTraffic(
  network: RoadNetwork,
  cars: readonly TrafficCar[],
  player: RoadPoint | null,
): TrafficCar[] {
  const kept = cars.filter((car) => !car.id.startsWith("kurs-"));
  if (!player) {
    return kept;
  }
  const nearest = nearestPlacement(network, player, 50);
  if (!nearest) {
    return kept;
  }
  const edge = nearest.edge;
  const rural = edge.name === "Färentunavägen" && edge.highway === "secondary";
  const motorway = edge.highway === "motorway" || edge.highway === "motorway_link";
  if (!rural && !motorway) {
    return kept;
  }
  const added: TrafficCar[] = [];
  if (rural) {
    const slow = travel(network, edge, nearest.distanceMeters, 90);
    const slowCar = makeCar(slow.edge, slow.distance, "kurs-framfor", 50 / 3.6);
    if (farEnough(slowCar.position, player)) {
      added.push(slowCar);
    }
    const meetAt = travel(network, edge, nearest.distanceMeters, 420);
    const opposite = oppositeNear(network, edge, meetAt);
    if (opposite) {
      const oncoming = makeCar(opposite.edge, opposite.distance, "kurs-mote", 60 / 3.6);
      if (farEnough(oncoming.position, player)) {
        added.push(oncoming);
      }
    }
    return [...kept, ...added];
  }
  let cursor = { edge, distance: nearest.distanceMeters };
  for (let hop = 0; hop < 14 && cursor.edge.highway !== "motorway"; hop += 1) {
    const next = continuation(network, cursor.edge);
    if (!next) {
      break;
    }
    cursor = { edge: next, distance: 6 };
  }
  const leadAt =
    cursor.edge.highway === "motorway"
      ? travel(network, cursor.edge, cursor.distance, 55)
      : travel(network, edge, nearest.distanceMeters, 120);
  const cruise = cruiseOf(leadAt.edge);
  const lead = makeCar(leadAt.edge, leadAt.distance, "kurs-framfor", cruise);
  if (farEnough(lead.position, player)) {
    added.push(lead);
  }
  return [...kept, ...added];
}
