import { distanceMeters, highwayClass, type RoadPoint } from "../roads/drivingRoads";
import {
  bearingDegrees,
  pathHeading,
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
export const ESTIMATED_LANE_METERS = 3.5;

/**
 * Play width when width is missing, by simplified road class.
 * These are not surveyed edges. A one-lane tag must not shrink the road below
 * this: Gustav Adolfs Torg is often unclassified with lanes=1 and no width,
 * and a 3.5 m ribbon stops the car before the junction.
 */
export const ESTIMATED_CARRIAGEWAY_BY_CLASS: Record<string, number> = {
  motorway: 20,
  trunk: 16,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  unclassified: 9,
  residential: 8,
  living_street: 7,
};

export const ESTIMATED_CARRIAGEWAY_METERS = ESTIMATED_CARRIAGEWAY_BY_CLASS.residential ?? 8;

/** How far the play area may flare around a node that joins two OSM ways. Not an intersection survey. */
export const JUNCTION_DISK_METERS = 16;

/** Distance from a junction node where connected ways become available to steering. */
export const JUNCTION_APPROACH_METERS = 24;

/**
 * Distance to a shared node where the heading may ease onto a gentle continuation.
 * This is not a point far ahead on the current way. Sampling the tangent there
 * cut the inside of Gustav Adolfs Torg and met the boundary within about 10 m.
 */
export const CURVE_LOOKAHEAD_METERS = 16;

/** Fastest heading assist toward the road. Player steering reduces this. */
export const CURVE_ASSIST_DEGREES_PER_SECOND = 50;

/**
 * Offset that is left as the player placed it. Past this, the heading eases
 * back toward the road so a bend does not walk into the boundary.
 */
const OFFSET_COMFORT_METERS = 2.4;
const OFFSET_BIAS_DEGREES_PER_METER = 2.2;
const OFFSET_BIAS_MAX_DEGREES = 7;
const METERS_PER_DEGREE = 111320;

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

export function estimatedCarriagewayMeters(highway?: string | null): number {
  if (!highway) {
    return ESTIMATED_CARRIAGEWAY_METERS;
  }
  return ESTIMATED_CARRIAGEWAY_BY_CLASS[highwayClass(highway)] ?? ESTIMATED_CARRIAGEWAY_METERS;
}

export function corridorOf(edge: {
  widthMeters?: number | null;
  lanes?: number | null;
  highway?: string | null;
}): Corridor {
  const width = edge.widthMeters;
  if (typeof width === "number" && width >= 2 && width <= 40) {
    return { halfMeters: width / 2, basis: "width" };
  }
  const fallback = estimatedCarriagewayMeters(edge.highway);
  const lanes = edge.lanes;
  if (typeof lanes === "number" && lanes >= 1 && lanes <= 8) {
    const fromLanes = lanes * ESTIMATED_LANE_METERS;
    if (fromLanes > fallback + 0.05) {
      return { halfMeters: fromLanes / 2, basis: "lanes" };
    }
  }
  return { halfMeters: fallback / 2, basis: "estimate" };
}

/**
 * Ease the heading toward the road ahead. One frame never jumps to that heading.
 * Full steering leaves only a small assist, so the player still turns.
 * This does not move the car sideways.
 */
export function followRoadCurve(
  headingDegrees: number,
  roadAheadDegrees: number,
  steer: number,
  dtSeconds: number,
): number {
  const dt = !Number.isFinite(dtSeconds) || dtSeconds <= 0 ? 0 : Math.min(0.25, dtSeconds);
  const heading = wrapDegrees(headingDegrees);
  if (dt === 0) {
    return heading;
  }
  const error = signedDelta(heading, wrapDegrees(roadAheadDegrees));
  if (Math.abs(error) < 1.5) {
    return heading;
  }
  const steerAbs = Math.max(0, Math.min(1, Number.isFinite(steer) ? Math.abs(steer) : 0));
  const authority = 1 - 0.8 * steerAbs;
  const maxStep = CURVE_ASSIST_DEGREES_PER_SECOND * dt * authority;
  const step = Math.max(-maxStep, Math.min(maxStep, error * 0.7));
  return wrapDegrees(heading + step);
}

/** Heading used for the next free step. The position is left where it is. */
export function headingForFreeStep(
  state: VehicleState,
  steer: number,
  dtSeconds: number,
  network: RoadNetwork,
): number {
  const edge = network.edgesById.get(state.edgeId);
  if (!edge || !playOf(network, edge, state.position).inside) {
    return wrapDegrees(state.headingDegrees);
  }
  const place = placementOnEdge(edge, state.position);
  const ahead = headingAhead(network, edge, place.distanceMeters, steer);
  const offset = signedOffsetMeters(edge, state.position, place.distanceMeters);
  return followRoadCurve(state.headingDegrees, headingWithOffset(ahead, offset, steer), steer, dtSeconds);
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
  return Math.abs(signedDelta(from, to));
}

function signedDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function wrapDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    return 0;
  }
  return ((degrees % 360) + 360) % 360;
}

function mixHeading(from: number, to: number, amount: number): number {
  const blend = Math.max(0, Math.min(1, amount));
  return wrapDegrees(from + signedDelta(from, to) * blend);
}

function headingAhead(network: RoadNetwork, edge: RoadEdge, distance: number, steer: number): number {
  const remaining = edge.lengthMeters - distance;
  const local = pathHeading(null, edge, distance);
  if (Math.abs(steer) > 0.35 || remaining > CURVE_LOOKAHEAD_METERS) {
    return local;
  }
  const next = gentleContinuation(network, edge, local);
  if (!next) {
    return local;
  }
  const nextHeading = pathHeading(null, next, Math.min(next.lengthMeters, Math.max(4, CURVE_LOOKAHEAD_METERS - remaining)));
  return mixHeading(local, nextHeading, 1 - remaining / CURVE_LOOKAHEAD_METERS);
}

/** Positive when the car sits to the right of the road direction. */
function signedOffsetMeters(edge: RoadEdge, point: RoadPoint, distance: number): number {
  const along = Math.min(edge.lengthMeters, Math.max(0, distance));
  const center = pointAlong(edge, along);
  const heading = (pathHeading(null, edge, along) * Math.PI) / 180;
  const north = (point.lat - center.lat) * METERS_PER_DEGREE;
  const east =
    (point.lng - center.lng) * METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180);
  return east * Math.cos(heading) - north * Math.sin(heading);
}

/**
 * A few degrees back toward the road once the car is well off the middle.
 * Full steering removes the bias. The position is not moved.
 */
function headingWithOffset(roadDegrees: number, offsetMeters: number, steer: number): number {
  const steerAbs = Math.max(0, Math.min(1, Number.isFinite(steer) ? Math.abs(steer) : 0));
  const excess = Math.max(0, Math.abs(offsetMeters) - OFFSET_COMFORT_METERS);
  const bias =
    Math.min(OFFSET_BIAS_MAX_DEGREES, excess * OFFSET_BIAS_DEGREES_PER_METER) *
    Math.sign(offsetMeters) *
    (1 - steerAbs);
  return wrapDegrees(roadDegrees - bias);
}

function gentleContinuation(network: RoadNetwork, edge: RoadEdge, fromHeading: number): RoadEdge | null {
  let best: RoadEdge | null = null;
  let bestDelta = 45;
  for (const out of network.outgoing.get(edge.toNode) ?? []) {
    if (out.id === edge.id) {
      continue;
    }
    if (out.toNode === edge.fromNode && out.osmWayId === edge.osmWayId) {
      continue;
    }
    const delta = headingDelta(fromHeading, pathHeading(null, out, Math.min(12, out.lengthMeters)));
    if (delta < bestDelta) {
      best = out;
      bestDelta = delta;
    }
  }
  return best;
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
