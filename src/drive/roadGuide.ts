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

/** Distance from a junction node where the play area may flare. Not a wider street. */
export const JUNCTION_APPROACH_METERS = 24;

/** How early a shared node’s exits may affect heading and road choice. */
export const JUNCTION_CHOICE_METERS = 32;

/**
 * Drawn car, matching the model in the map: about 1.96 m wide and 4.17 m long.
 * The corridor check uses the body, not only the center point.
 */
export const CAR_BODY_WIDTH_METERS = 1.96;
export const CAR_BODY_LENGTH_METERS = 4.17;

/**
 * Room for a small projection or heading wobble. This is not extra carriageway
 * and must stay well under a meter so the car cannot drift through a building.
 */
export const TRACK_SLACK_METERS = 0.45;

/**
 * Distance to a shared node where the heading may ease onto a gentle continuation.
 * This is not a point far ahead on the current way. Sampling the tangent there
 * cut the inside of Gustav Adolfs Torg and met the boundary within about 10 m.
 */
export const CURVE_LOOKAHEAD_METERS = 16;

/** Fastest heading assist toward the road. Player steering reduces this. */
export const CURVE_ASSIST_DEGREES_PER_SECOND = 50;

/**
 * Once a leave has been shown and the center is this close to the limit,
 * another outward step is refused. The slack above still covers the first wobble.
 */
const EDGE_HOLD_METERS = 0.35;

/**
 * Offset that is left as the player placed it. Past this, the heading eases
 * back toward the road so a bend does not walk into the boundary.
 */
const OFFSET_COMFORT_METERS = 2.4;
const OFFSET_BIAS_DEGREES_PER_METER = 2.2;
const OFFSET_BIAS_MAX_DEGREES = 7;
const METERS_PER_DEGREE = 111320;

export const BOUNDARY_MESSAGE = "Preliminär körgräns. Exakt vägkant och byggnader saknas.";

/** The tagged width is known and the body has left that carriageway. Buildings are still unknown. */
export const MEASURED_LEAVE_MESSAGE = "Bilen lämnar den uppmätta körbanan. Byggnader känns inte av.";

/** The tagged width is narrower than the car, so the edge cannot be treated as exact. */
export const UNCERTAIN_WIDTH_MESSAGE =
  "Körgränsen är osäker. Den uppmätta bredden rymmer inte hela bilen.";

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
  if (typeof width === "number" && width >= 1 && width <= 40) {
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
 * How far the body reaches from the center when the car is yawed relative to the road.
 * A few degrees of tracking lag still uses the car's width. The length only sticks
 * out once the car is clearly angled across the carriageway.
 */
export function bodyExtentMeters(yawDegrees: number): number {
  let yaw = Math.abs(signedDelta(0, yawDegrees));
  if (yaw > 90) {
    yaw = 180 - yaw;
  }
  const halfWidth = CAR_BODY_WIDTH_METERS / 2;
  if (yaw <= 8) {
    return halfWidth;
  }
  const radians = (yaw * Math.PI) / 180;
  const angled = halfWidth * Math.cos(radians) + (CAR_BODY_LENGTH_METERS / 2) * Math.sin(radians);
  const blend = Math.min(1, (yaw - 8) / 16);
  return halfWidth + (angled - halfWidth) * blend;
}

export type Clearance = {
  centerLimit: number;
  roadHalf: number;
  roadHoldsCar: boolean;
  basis: CorridorBasis;
};

/**
 * How far the center may sit from the centerline before the body leaves the
 * carriageway. A measured width is never replaced by a wider guess. When the
 * tagged width is narrower than the car, the center stays inside that width
 * and the edge is marked uncertain.
 */
export function clearanceOf(
  edge: { widthMeters?: number | null; lanes?: number | null; highway?: string | null },
  yawDegrees = 0,
): Clearance {
  const corridor = corridorOf(edge);
  const roadHalf = corridor.halfMeters;
  const roadHoldsCar = roadHalf + 0.05 >= CAR_BODY_WIDTH_METERS / 2;
  const extent = bodyExtentMeters(yawDegrees);
  const centerLimit = roadHoldsCar
    ? roadHalf - extent + TRACK_SLACK_METERS
    : roadHalf + TRACK_SLACK_METERS * 0.5;
  return {
    centerLimit: Math.min(roadHalf + TRACK_SLACK_METERS, Math.max(0.35, centerLimit)),
    roadHalf,
    roadHoldsCar,
    basis: corridor.basis,
  };
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
  const play = edge ? playOf(network, edge, state.position, state.headingDegrees) : null;
  if (!edge || !play) {
    return wrapDegrees(state.headingDegrees);
  }
  const steerAbs = Math.max(0, Math.min(1, Number.isFinite(steer) ? Math.abs(steer) : 0));
  const againstEdge = play.placement.gapMeters >= play.limit - EDGE_HOLD_METERS;
  if (!play.inside && (steerAbs > 0.35 || play.placement.gapMeters > play.limit + 6)) {
    return wrapDegrees(state.headingDegrees);
  }
  if (play.inside && steerAbs > 0.35 && againstEdge) {
    return wrapDegrees(state.headingDegrees);
  }
  const place = play.placement;
  const ahead = headingAhead(network, edge, place.distanceMeters, steer);
  const offset = signedOffsetMeters(edge, state.position, place.distanceMeters);
  const room = clearanceOf(edge, 0).centerLimit;
  return followRoadCurve(
    state.headingDegrees,
    headingWithOffset(ahead, offset, steer, room),
    steer,
    dtSeconds,
  );
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
  const inside = (point: RoadPoint) =>
    allowed.some((edge) => playOf(network, edge, point, moved.headingDegrees).inside);
  const accepted = acceptPosition(state.position, moved.position, inside, (point) =>
    gapOutside(network, active, allowed, point, moved.headingDegrees),
  );
  const chosen = chooseEdge(network, allowed, accepted, moved.headingDegrees, active);
  const offRoad = !chosen && gapToNearest(network, accepted) > FREE_ROAD_ASSOCIATION_METERS;
  const rejected = distanceMeters(accepted, moved.position) > 0.05;
  const besideRoad = !chosen && !offRoad;
  const linked = chosen ?? (besideRoad ? active : null);
  let pose = accepted;
  let play = linked ? playOf(network, linked, pose, moved.headingDegrees) : null;
  const pushingOut = active
    ? placementOnEdge(active, moved.position).gapMeters > placementOnEdge(active, state.position).gapMeters + 0.002
    : false;
  const nearLimit = Boolean(play && play.placement.gapMeters >= play.limit - EDGE_HOLD_METERS);
  const holdingEdge = isBoundaryMessage(state.message) && pushingOut && (nearLimit || besideRoad) && !rejected;
  const walkingOut = besideRoad && pushingOut;
  if (holdingEdge || walkingOut) {
    pose = state.position;
    play = linked ? playOf(network, linked, pose, moved.headingDegrees) : null;
  }
  // A network refresh calls this with the same point. That must not count as leaving.
  const blocked = rejected || holdingEdge || walkingOut;
  const placement = linked ? placementOnEdge(linked, pose) : null;
  const ribbon = Boolean(chosen && play?.ribbon && play.holdsCar);
  const speedMps = blocked ? slowed(state.position, pose, moved.speedMps, dtSeconds) : moved.speedMps;
  return {
    ...state,
    position: pose,
    headingDegrees: moved.headingDegrees,
    speedMps,
    offsetMeters: 0,
    edgeId: linked?.id ?? "",
    distanceMeters: placement?.distanceMeters ?? 0,
    roadName: linked?.name ?? null,
    mode: "driving",
    choices: [],
    message: messageFor(state.message, offRoad, blocked, speedMps, boundaryMessage(active)),
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
    if (!nearNode(active, nodeId, position, JUNCTION_CHOICE_METERS)) {
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

function nearNode(edge: RoadEdge, nodeId: string, position: RoadPoint, reach = JUNCTION_APPROACH_METERS): boolean {
  const point = nodeId === edge.fromNode ? edge.points[0] : nodeId === edge.toNode ? edge.points[edge.points.length - 1] : null;
  if (!point) {
    return false;
  }
  return distanceMeters(position, point) <= reach;
}

function isJunctionNode(network: RoadNetwork, nodeId: string): boolean {
  const ways = new Set((network.outgoing.get(nodeId) ?? []).map((edge) => edge.osmWayId));
  return ways.size >= 2;
}

function playOf(
  network: RoadNetwork,
  edge: RoadEdge,
  point: RoadPoint,
  headingDegrees?: number,
): { inside: boolean; ribbon: boolean; placement: RoadPlacement; limit: number; holdsCar: boolean } {
  const placement = placementOnEdge(edge, point);
  const roadHeading = pathHeading(null, edge, placement.distanceMeters);
  const yaw = headingDegrees === undefined ? 0 : headingDelta(roadHeading, headingDegrees);
  const clearance = clearanceOf(edge, yaw);
  const limit = lateralLimit(network, edge, placement.distanceMeters, clearance.centerLimit);
  return {
    placement,
    limit,
    holdsCar: clearance.roadHoldsCar,
    inside: placement.gapMeters <= limit + 0.05,
    ribbon: placement.gapMeters <= clearance.roadHalf + 0.25,
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
    .filter((edge) => playOf(network, edge, position, headingDegrees).inside)
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
  if (remaining > JUNCTION_CHOICE_METERS) {
    return local;
  }
  const next = continuationForSteer(network, edge, local, steer);
  if (!next) {
    return local;
  }
  const nextHeading = pathHeading(null, next, Math.min(next.lengthMeters, 12));
  const preview = previewMeters(signedDelta(local, nextHeading));
  if (remaining > preview) {
    return local;
  }
  const approach = 1 - remaining / preview;
  const steerBlend = Math.abs(steer) <= 0.35 ? 1 : Math.min(1, Math.abs(steer));
  return mixHeading(local, nextHeading, approach * steerBlend);
}

/** A mild bend is followed near the node. A sharp steered exit may begin earlier. */
function previewMeters(turnDegrees: number): number {
  const turn = Math.abs(turnDegrees);
  if (turn <= 15) {
    return 8;
  }
  return Math.min(JUNCTION_CHOICE_METERS, 8 + (turn - 15) * 0.4);
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
function headingWithOffset(
  roadDegrees: number,
  offsetMeters: number,
  steer: number,
  centerLimit: number,
): number {
  const steerAbs = Math.max(0, Math.min(1, Number.isFinite(steer) ? Math.abs(steer) : 0));
  const comfort = Math.min(OFFSET_COMFORT_METERS, Math.max(0.35, centerLimit * 0.5));
  const excess = Math.max(0, Math.abs(offsetMeters) - comfort);
  const room = Math.max(0.45, centerLimit - comfort);
  const urgency = Math.max(0, Math.min(1, excess / room));
  const maxBias = OFFSET_BIAS_MAX_DEGREES + 6 * urgency;
  const gain = OFFSET_BIAS_DEGREES_PER_METER + 3 * urgency;
  const bias = Math.min(maxBias, excess * gain) * Math.sign(offsetMeters) * (1 - steerAbs);
  return wrapDegrees(roadDegrees - bias);
}

function exitsFrom(network: RoadNetwork, edge: RoadEdge): RoadEdge[] {
  const exits: RoadEdge[] = [];
  for (const out of network.outgoing.get(edge.toNode) ?? []) {
    if (out.id === edge.id) {
      continue;
    }
    if (out.toNode === edge.fromNode && out.osmWayId === edge.osmWayId) {
      continue;
    }
    exits.push(out);
  }
  return exits;
}

function exitHeading(edge: RoadEdge): number {
  return pathHeading(null, edge, Math.min(12, edge.lengthMeters));
}

/** Straight or gentle shared-node continuation. A side street beyond 45° is left for steering. */
function gentleContinuation(exits: readonly RoadEdge[], fromHeading: number): RoadEdge | null {
  let best: RoadEdge | null = null;
  let bestDelta = 45;
  for (const out of exits) {
    const delta = headingDelta(fromHeading, exitHeading(out));
    if (delta < bestDelta) {
      best = out;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * With little steering, follow a gentle continuation. With a real steer,
 * aim at a shared-node exit on that side even when the turn is past 45°.
 * The heading blend stays gradual. The position is not moved here.
 */
function continuationForSteer(
  network: RoadNetwork,
  edge: RoadEdge,
  fromHeading: number,
  steer: number,
): RoadEdge | null {
  const exits = exitsFrom(network, edge);
  const command = Math.max(-1, Math.min(1, Number.isFinite(steer) ? steer : 0));
  if (Math.abs(command) <= 0.35) {
    return gentleContinuation(exits, fromHeading);
  }
  const side = Math.sign(command);
  const target = side * (30 + 70 * Math.abs(command));
  let best: RoadEdge | null = null;
  let bestScore = 55;
  for (const out of exits) {
    const turn = signedDelta(fromHeading, exitHeading(out));
    if (Math.sign(turn) !== side || Math.abs(turn) < 12 || Math.abs(turn) > 150) {
      continue;
    }
    const score = Math.abs(turn - target);
    if (score < bestScore) {
      best = out;
      bestScore = score;
    }
  }
  return best;
}

function gapOutside(
  network: RoadNetwork,
  active: RoadEdge | null,
  allowed: readonly RoadEdge[],
  point: RoadPoint,
  headingDegrees?: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  const edges = allowed.length > 0 ? allowed : active ? [active] : [];
  for (const edge of edges) {
    const play = playOf(network, edge, point, headingDegrees);
    best = Math.min(best, Math.max(0, play.placement.gapMeters - play.limit));
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

function boundaryMessage(edge: RoadEdge | null): string {
  if (!edge) {
    return BOUNDARY_MESSAGE;
  }
  const clearance = clearanceOf(edge, 0);
  if (!clearance.roadHoldsCar) {
    return UNCERTAIN_WIDTH_MESSAGE;
  }
  if (clearance.basis === "width") {
    return MEASURED_LEAVE_MESSAGE;
  }
  return BOUNDARY_MESSAGE;
}

function isBoundaryMessage(message: string | null): boolean {
  return (
    message === BOUNDARY_MESSAGE ||
    message === MEASURED_LEAVE_MESSAGE ||
    message === UNCERTAIN_WIDTH_MESSAGE
  );
}

function messageFor(
  previous: string | null,
  offRoad: boolean,
  blocked: boolean,
  speedMps: number,
  boundary: string,
): string | null {
  if (offRoad) {
    return OFF_ROAD_MESSAGE;
  }
  if (blocked) {
    return boundary;
  }
  if (speedMps > 0) {
    return null;
  }
  if (previous === OFF_ROAD_MESSAGE || isBoundaryMessage(previous)) {
    return null;
  }
  return previous;
}
