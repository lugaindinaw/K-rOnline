import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import {
  bearingDegrees,
  placementOnEdge,
  pointAlong,
  type RoadEdge,
  type RoadNetwork,
  type RoadPlacement,
} from "../roads/roadNetwork";
import { type VehicleState } from "./drive";

/** Farther than this from every fetched centerline, the car is not linked to a road. */
export const FREE_ROAD_ASSOCIATION_METERS = 40;

export const OFF_ROAD_MESSAGE = "Bilen är utanför de hämtade vägarna.";

/**
 * Meters per lane when OSM has a lane count but no width tag.
 * The lane count can be measured. This length is not.
 */
export const ESTIMATED_LANE_METERS = 3.25;

/**
 * Carriageway used when both width and lanes are missing.
 * This is a play estimate for one lane in each direction, not a surveyed edge.
 */
export const ESTIMATED_CARRIAGEWAY_METERS = 6.5;

/** How far the play area may flare around a node that joins two OSM ways. Not an intersection survey. */
export const JUNCTION_DISK_METERS = 12;

/** Distance from a junction node where connected ways become available to steering. */
export const JUNCTION_APPROACH_METERS = 18;

export const BOUNDARY_MESSAGE = "Preliminär körgräns. Exakt vägkant och byggnader saknas.";

export type CorridorBasis = "width" | "lanes" | "estimate";

export type Corridor = {
  halfMeters: number;
  basis: CorridorBasis;
};

type FreePose = {
  position: RoadPoint;
  headingDegrees: number;
  speedMps: number;
};

export function corridorOf(edge: { widthMeters?: number | null; lanes?: number | null }): Corridor {
  const width = edge.widthMeters;
  if (typeof width === "number" && width >= 2 && width <= 40) {
    return { halfMeters: width / 2, basis: "width" };
  }
  const lanes = edge.lanes;
  if (typeof lanes === "number" && lanes >= 1 && lanes <= 8) {
    return { halfMeters: (lanes * ESTIMATED_LANE_METERS) / 2, basis: "lanes" };
  }
  return { halfMeters: ESTIMATED_CARRIAGEWAY_METERS / 2, basis: "estimate" };
}

/**
 * Keep a free pose inside the connected road corridor.
 * The accepted position is never replaced by a centerline point.
 * A way that does not share a node with the current way cannot be selected.
 */
export function guideFreePose(
  state: VehicleState,
  moved: FreePose,
  network: RoadNetwork,
  dtSeconds: number,
): VehicleState {
  const active = network.edgesById.get(state.edgeId) ?? null;
  const allowed = allowedEdges(network, active, state.position, moved.headingDegrees);
  const inside = (point: RoadPoint) => allowed.some((edge) => playOf(network, edge, point).inside);
  const accepted = acceptPosition(state.position, moved.position, inside, (point) =>
    gapOutside(network, active, allowed, point),
  );
  const chosen = chooseEdge(network, allowed, accepted, moved.headingDegrees, active);
  const placement = chosen ? placementOnEdge(chosen, accepted) : null;
  const ribbon = chosen ? playOf(network, chosen, accepted).ribbon : false;
  const blocked = distanceMeters(accepted, moved.position) > 0.2;
  const speedMps = blocked ? slowed(state.position, accepted, moved.speedMps, dtSeconds) : moved.speedMps;
  const offRoad = !chosen && gapToNearest(network, accepted) > FREE_ROAD_ASSOCIATION_METERS;
  return {
    ...state,
    position: accepted,
    headingDegrees: moved.headingDegrees,
    speedMps,
    offsetMeters: 0,
    edgeId: chosen?.id ?? "",
    distanceMeters: placement?.distanceMeters ?? 0,
    roadName: chosen?.name ?? null,
    mode: "driving",
    choices: [],
    message: messageFor(state.message, offRoad, blocked, speedMps),
    measurementReliable: ribbon,
  };
}

function allowedEdges(
  network: RoadNetwork,
  active: RoadEdge | null,
  position: RoadPoint,
  headingDegrees: number,
): RoadEdge[] {
  if (!active) {
    return recoverEdges(network, position, headingDegrees);
  }
  const list: RoadEdge[] = [active];
  const reverse = counterpart(network, active);
  if (reverse) {
    list.push(reverse);
  }
  for (const nodeId of [active.fromNode, active.toNode]) {
    if (!nearNode(active, nodeId, position)) {
      continue;
    }
    for (const edge of network.outgoing.get(nodeId) ?? []) {
      if (!list.includes(edge)) {
        list.push(edge);
      }
    }
  }
  return list;
}

function recoverEdges(network: RoadNetwork, position: RoadPoint, headingDegrees: number): RoadEdge[] {
  const containing = network
    .edgesNear(position, 24)
    .filter((edge) => playOf(network, edge, position).ribbon);
  const chosen = chooseEdge(network, containing, position, headingDegrees, null);
  return chosen ? [chosen] : [];
}

function counterpart(network: RoadNetwork, edge: RoadEdge): RoadEdge | null {
  const outgoing = network.outgoing.get(edge.toNode) ?? [];
  return (
    outgoing.find((other) => other.toNode === edge.fromNode && other.osmWayId === edge.osmWayId) ?? null
  );
}

function nearNode(edge: RoadEdge, nodeId: string, position: RoadPoint): boolean {
  const point = nodeId === edge.fromNode ? edge.points[0] : nodeId === edge.toNode ? edge.points[edge.points.length - 1] : null;
  if (!point) {
    return false;
  }
  return distanceMeters(position, point) <= JUNCTION_APPROACH_METERS;
}

function isJunctionNode(network: RoadNetwork, nodeId: string): boolean {
  const ways = new Set((network.outgoing.get(nodeId) ?? []).map((edge) => edge.osmWayId));
  return ways.size >= 2;
}

function playOf(
  network: RoadNetwork,
  edge: RoadEdge,
  point: RoadPoint,
): { inside: boolean; ribbon: boolean; placement: RoadPlacement } {
  const placement = placementOnEdge(edge, point);
  const half = corridorOf(edge).halfMeters;
  const limit = lateralLimit(network, edge, placement.distanceMeters, half);
  return {
    placement,
    inside: placement.gapMeters <= limit + 0.05,
    ribbon: placement.gapMeters <= half + 0.25,
  };
}

function lateralLimit(network: RoadNetwork, edge: RoadEdge, distanceAlong: number, half: number): number {
  let limit = half;
  const ends = [
    { node: edge.fromNode, along: distanceAlong },
    { node: edge.toNode, along: edge.lengthMeters - distanceAlong },
  ];
  for (const end of ends) {
    if (!isJunctionNode(network, end.node) || end.along >= JUNCTION_APPROACH_METERS || end.along < 0) {
      continue;
    }
    const blend = 1 - end.along / JUNCTION_APPROACH_METERS;
    limit = Math.max(limit, half + (JUNCTION_DISK_METERS - half) * blend);
  }
  return limit;
}

function chooseEdge(
  network: RoadNetwork,
  allowed: readonly RoadEdge[],
  position: RoadPoint,
  headingDegrees: number,
  active: RoadEdge | null,
): RoadEdge | null {
  const ranked = allowed
    .filter((edge) => playOf(network, edge, position).inside)
    .map((edge) => {
      const place = placementOnEdge(edge, position);
      return {
        edge,
        delta: headingDelta(headingDegrees, edgeHeading(edge)),
        interior: place.distanceMeters > 2 && place.distanceMeters < edge.lengthMeters - 2,
        leaving: edge.lengthMeters - place.distanceMeters <= 2.5,
      };
    })
    .sort((left, right) => {
      if (Math.abs(left.delta - right.delta) > 8) {
        return left.delta - right.delta;
      }
      if (left.interior !== right.interior) {
        return left.interior ? -1 : 1;
      }
      if (left.leaving !== right.leaving) {
        return left.leaving ? 1 : -1;
      }
      return left.edge.id.localeCompare(right.edge.id);
    });
  const best = ranked[0];
  if (!best) {
    return null;
  }
  const current = active ? ranked.find((item) => item.edge.id === active.id) : undefined;
  if (
    current &&
    current.delta <= best.delta + 8 &&
    current.interior === best.interior &&
    current.leaving === best.leaving
  ) {
    return current.edge;
  }
  return best.edge;
}

function edgeHeading(edge: RoadEdge): number {
  const ahead = pointAlong(edge, Math.min(edge.lengthMeters, 12));
  const start = edge.points[0];
  if (!start || distanceMeters(start, ahead) < 0.05) {
    return 0;
  }
  return (bearingDegrees(start, ahead) + 360) % 360;
}

function headingDelta(from: number, to: number): number {
  const raw = Math.abs(from - to) % 360;
  return Math.min(raw, 360 - raw);
}

function gapOutside(
  network: RoadNetwork,
  active: RoadEdge | null,
  allowed: readonly RoadEdge[],
  point: RoadPoint,
): number {
  let best = Number.POSITIVE_INFINITY;
  const edges = allowed.length > 0 ? allowed : active ? [active] : [];
  for (const edge of edges) {
    const play = playOf(network, edge, point);
    best = Math.min(best, Math.max(0, play.placement.gapMeters - lateralLimit(network, edge, play.placement.distanceMeters, corridorOf(edge).halfMeters)));
  }
  if (Number.isFinite(best)) {
    return best;
  }
  return gapToNearest(network, point);
}

function gapToNearest(network: RoadNetwork, point: RoadPoint): number {
  let best = Number.POSITIVE_INFINITY;
  for (const edge of network.edgesNear(point, FREE_ROAD_ASSOCIATION_METERS)) {
    best = Math.min(best, placementOnEdge(edge, point).gapMeters);
  }
  return best;
}

function acceptPosition(
  previous: RoadPoint,
  candidate: RoadPoint,
  inside: (point: RoadPoint) => boolean,
  outsideGap: (point: RoadPoint) => number,
): RoadPoint {
  if (inside(candidate)) {
    return candidate;
  }
  if (inside(previous)) {
    return pullBack(previous, candidate, inside);
  }
  if (outsideGap(candidate) + 0.05 < outsideGap(previous)) {
    return candidate;
  }
  return previous;
}

function pullBack(
  previous: RoadPoint,
  candidate: RoadPoint,
  inside: (point: RoadPoint) => boolean,
): RoadPoint {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 10; step += 1) {
    const mid = (low + high) / 2;
    const point = lerp(previous, candidate, mid);
    if (inside(point)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return lerp(previous, candidate, low);
}

function lerp(from: RoadPoint, to: RoadPoint, t: number): RoadPoint {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
}

function slowed(previous: RoadPoint, accepted: RoadPoint, speedMps: number, dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return speedMps;
  }
  const traveled = distanceMeters(previous, accepted);
  return Math.max(0, Math.min(speedMps, traveled / dtSeconds));
}

function messageFor(previous: string | null, offRoad: boolean, blocked: boolean, speedMps: number): string | null {
  if (offRoad) {
    return OFF_ROAD_MESSAGE;
  }
  if (blocked) {
    return BOUNDARY_MESSAGE;
  }
  if (speedMps > 0) {
    return null;
  }
  if (previous === OFF_ROAD_MESSAGE || previous === BOUNDARY_MESSAGE) {
    return null;
  }
  return previous;
}
