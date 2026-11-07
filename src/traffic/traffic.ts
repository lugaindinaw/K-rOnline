import { seedCourseTraffic } from "./courseTraffic";
import { listChoices, turnToward } from "../drive/drive";
import { postedLimitKmh } from "../drive/roadSpeed";
import { distanceMeters, highwayRank, type RoadPoint } from "../roads/drivingRoads";
import {
  bearingDegrees,
  nearestPlacement,
  sampleEdge,
  type EdgeSignal,
  type RoadEdge,
  type RoadNetwork,
} from "../roads/roadNetwork";

export const TRAFFIC_SPEED_MPS = 8;
export const TRAFFIC_GAP_METERS = 22;
export const TRAFFIC_STOP_METERS = 8;
/** How far ahead a traffic car notices the player and starts to slow. */
export const PLAYER_NOTICE_METERS = 28;
export const MAX_TRAFFIC = 8;
const TRAFFIC_ACCEL_MPS2 = 4;
const JUNCTION_APPROACH_METERS = 30;
const JUNCTION_CREEP_MPS = 3;
const MIN_EDGE_METERS = 30;
const SPAWN_CLEARANCE_METERS = 40;
const REJOIN_METERS = 25;
const MAX_TRANSFERS = 8;
const EQUAL_TURN_DEGREES = 8;
const SHARP_TURN_DEGREES = 150;
const CONNECTED_METERS = 3;
export const SIGNAL_STOP_METERS = 8;
export const SIGNAL_CYCLE_SECONDS = 48;
export const SIGNAL_GREEN_SECONDS = 20;
export const SIGNAL_YELLOW_SECONDS = 4;

export type RoadEndKind = "continuation" | "branch" | "crossing" | "dead-end";

export type TrafficCar = {
  id: string;
  edgeId: string;
  distanceMeters: number;
  speedMps: number;
  position: RoadPoint;
  headingDegrees: number;
  /** Own cruise speed. Absent cars use the road's cruise. */
  cruiseMps?: number;
};

export type TrafficLead = {
  edgeId: string;
  distanceMeters: number;
  position: RoadPoint;
  headingDegrees?: number;
};

export function trafficCount(usableEdges: number): number {
  if (!Number.isFinite(usableEdges) || usableEdges <= 0) {
    return 0;
  }
  return Math.min(MAX_TRAFFIC, Math.max(1, Math.floor(usableEdges / 10)));
}

function clampFrame(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return Math.min(0.25, dtSeconds);
}

function headingDelta(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

function forwardChoices(network: RoadNetwork, edge: RoadEdge): RoadEdge[] {
  const listed = listChoices(network, edge);
  return listed.choices.flatMap((choice) => {
    if (choice.reverse) {
      return [];
    }
    const next = network.edgesById.get(choice.edgeId);
    return next && next.fromNode === edge.toNode ? [next] : [];
  });
}

export function roadEndKind(network: RoadNetwork, edge: RoadEdge): RoadEndKind {
  const listed = listChoices(network, edge);
  const forward = listed.choices.filter((choice) => !choice.reverse);
  if (forward.length >= 3 || listed.hidden > 0) {
    return "crossing";
  }
  if (forward.length === 2) {
    return "branch";
  }
  if (forward.length === 1) {
    return "continuation";
  }
  return "dead-end";
}

function isDecision(kind: RoadEndKind): boolean {
  return kind === "branch" || kind === "crossing";
}

function exitHeading(edge: RoadEdge): number {
  return sampleEdge(edge, 0).headingDegrees;
}

function signedTurn(from: number, to: number): number {
  let delta = ((to - from) % 360 + 360) % 360;
  if (delta > 180) {
    delta -= 360;
  }
  return delta;
}

function connectsCleanly(current: RoadEdge, next: RoadEdge): boolean {
  const end = current.points[current.points.length - 1];
  const start = next.points[0];
  return Boolean(end && start && distanceMeters(end, start) <= CONNECTED_METERS);
}

/**
 * Follow the exit closest to the current heading.
 * Equally sharp exits prefer the same street, then the higher road class, then a right turn.
 * The OSM id is not used.
 */
function nextEdge(network: RoadNetwork, edge: RoadEdge): RoadEdge | null {
  const heading = sampleEdge(edge, edge.lengthMeters).headingDegrees;
  const ranked = forwardChoices(network, edge)
    .map((exit) => ({ exit, turn: headingDelta(exitHeading(exit), heading) }))
    .sort((left, right) => left.turn - right.turn);
  const best = ranked[0];
  if (best) {
    const band = ranked.filter((item) => item.turn <= best.turn + EQUAL_TURN_DEGREES);
    band.sort((left, right) => {
      const leftName = edge.name && left.exit.name === edge.name ? 0 : 1;
      const rightName = edge.name && right.exit.name === edge.name ? 0 : 1;
      if (leftName !== rightName) {
        return leftName - rightName;
      }
      const leftWay = left.exit.osmWayId === edge.osmWayId ? 0 : 1;
      const rightWay = right.exit.osmWayId === edge.osmWayId ? 0 : 1;
      if (leftWay !== rightWay) {
        return leftWay - rightWay;
      }
      const rank = highwayRank(left.exit.highway) - highwayRank(right.exit.highway);
      if (rank !== 0) {
        return rank;
      }
      const length = right.exit.lengthMeters - left.exit.lengthMeters;
      if (Math.abs(length) > 1) {
        return length;
      }
      return signedTurn(heading, exitHeading(right.exit)) - signedTurn(heading, exitHeading(left.exit));
    });
    const rest = ranked.filter((item) => item.turn > best.turn + EQUAL_TURN_DEGREES);
    const choice = [...band, ...rest].find(
      (item) => item.turn <= SHARP_TURN_DEGREES && connectsCleanly(edge, item.exit),
    );
    if (choice) {
      return choice.exit;
    }
  }
  const listed = listChoices(network, edge);
  const reverse = listed.choices.find((item) => item.reverse);
  const turned = reverse ? network.edgesById.get(reverse.edgeId) : undefined;
  return turned && turned.fromNode === edge.toNode && connectsCleanly(edge, turned) ? turned : null;
}

export function signalColor(headingDegrees: number, timeSeconds: number): "red" | "yellow" | "green" {
  const heading = ((headingDegrees % 360) + 360) % 360;
  const toNorthSouth = Math.min(heading, Math.abs(180 - heading), 360 - heading);
  const axis = toNorthSouth < 45 ? 0 : 1;
  const period = SIGNAL_CYCLE_SECONDS;
  const elapsed = ((timeSeconds % period) + period) % period;
  const local = axis === 0 ? elapsed : (elapsed + period / 2) % period;
  if (local < SIGNAL_GREEN_SECONDS) {
    return "green";
  }
  if (local < SIGNAL_GREEN_SECONDS + SIGNAL_YELLOW_SECONDS) {
    return "yellow";
  }
  return "red";
}

function nextSignalAhead(network: RoadNetwork, edge: RoadEdge, distance: number): EdgeSignal | null {
  const list = network.signalsByEdge.get(edge.id);
  if (!list) {
    return null;
  }
  return list.find((item) => item.distanceMeters > distance + 0.3) ?? null;
}

function vehicleBlocksExit(
  edge: RoadEdge,
  past: number,
  next: RoadEdge | null,
  edgeId: string,
  distance: number,
): boolean {
  if (edgeId === edge.id && distance > past + 0.5 && distance < past + TRAFFIC_GAP_METERS) {
    return true;
  }
  const tail = edge.lengthMeters - past;
  return Boolean(next && tail <= TRAFFIC_GAP_METERS && edgeId === next.id && distance >= 0 && distance < TRAFFIC_GAP_METERS - tail);
}

function exitOccupied(
  network: RoadNetwork,
  edge: RoadEdge,
  past: number,
  car: TrafficCar,
  cars: readonly TrafficCar[],
  player: TrafficLead | null,
): boolean {
  const next = edge.lengthMeters - past <= TRAFFIC_GAP_METERS ? nextEdge(network, edge) : null;
  const blocks = (edgeId: string, distance: number) => vehicleBlocksExit(edge, past, next, edgeId, distance);
  if (player && blocks(player.edgeId, player.distanceMeters)) {
    return true;
  }
  return cars.some((other) => other.id !== car.id && blocks(other.edgeId, other.distanceMeters));
}

/** How fast other cars cruise. City streets stay at the existing pace. */
export function roadCruiseMps(edge: { highway?: string | null; maxspeedKmh?: number | null }): number {
  const posted = postedLimitKmh(edge);
  if (posted == null) {
    return TRAFFIC_SPEED_MPS;
  }
  const cruise = posted >= 100 ? posted - 8 : posted >= 70 ? posted - 10 : posted;
  return Math.max(TRAFFIC_SPEED_MPS, cruise / 3.6);
}

function speedForLine(room: number, speed: number, cruise = TRAFFIC_SPEED_MPS): number {
  if (room <= 0.4) {
    return 0;
  }
  const braking = TRAFFIC_ACCEL_MPS2 * 0.85;
  if (speed * speed > 2 * braking * room) {
    return 0;
  }
  return Math.min(cruise, Math.sqrt(2 * TRAFFIC_ACCEL_MPS2 * room));
}

function moveAlong(
  network: RoadNetwork,
  edge: RoadEdge,
  distance: number,
  maxHops: number,
): { edge: RoadEdge; distance: number } {
  let current = edge;
  let cursor = distance;
  for (let hop = 0; hop < maxHops; hop += 1) {
    if (cursor <= current.lengthMeters) {
      return { edge: current, distance: Math.max(0, cursor) };
    }
    const next = nextEdge(network, current);
    if (!next || next.id === current.id || next.fromNode !== current.toNode) {
      return { edge: current, distance: current.lengthMeters };
    }
    cursor -= current.lengthMeters;
    current = next;
  }
  return { edge: current, distance: Math.min(current.lengthMeters, Math.max(0, cursor)) };
}

function endpoint(edge: RoadEdge): RoadPoint | null {
  return edge.points[edge.points.length - 1] ?? null;
}

function junctionBlocked(
  network: RoadNetwork,
  edge: RoadEdge,
  car: TrafficCar,
  cars: readonly TrafficCar[],
  player: TrafficLead | null,
): boolean {
  if (!isDecision(roadEndKind(network, edge))) {
    return false;
  }
  const node = endpoint(edge);
  if (!node) {
    return true;
  }
  const ourGap = edge.lengthMeters - car.distanceMeters;
  if (player && !(player.edgeId === car.edgeId && player.distanceMeters <= car.distanceMeters + 0.5)) {
    const playerGap = distanceMeters(node, player.position);
    if (Number.isFinite(playerGap) && playerGap < TRAFFIC_GAP_METERS) {
      return true;
    }
  }
  const exits = new Set(forwardChoices(network, edge).map((item) => item.id));
  for (const other of cars) {
    if (other.id === car.id) {
      continue;
    }
    if (other.edgeId === car.edgeId && other.distanceMeters <= car.distanceMeters + 0.5) {
      continue;
    }
    const gap = distanceMeters(node, other.position);
    if (!Number.isFinite(gap) || gap >= TRAFFIC_GAP_METERS) {
      continue;
    }
    if (exits.has(other.edgeId) && other.distanceMeters < TRAFFIC_GAP_METERS) {
      return true;
    }
    if (gap + 0.5 < ourGap) {
      return true;
    }
    if (other.id < car.id && gap <= ourGap + 1) {
      return true;
    }
  }
  return false;
}

function junctionSpeed(
  remaining: number,
  blocked: boolean,
  kind: RoadEndKind,
  speed: number,
  cruise = TRAFFIC_SPEED_MPS,
): number {
  if (!isDecision(kind)) {
    return cruise;
  }
  if (blocked) {
    if (remaining <= JUNCTION_APPROACH_METERS) {
      return 0;
    }
    return targetSpeed(Math.max(0, remaining), speed, TRAFFIC_GAP_METERS, cruise);
  }
  if (remaining >= JUNCTION_APPROACH_METERS) {
    return cruise;
  }
  const ratio = Math.max(0, remaining) / JUNCTION_APPROACH_METERS;
  return JUNCTION_CREEP_MPS + (cruise - JUNCTION_CREEP_MPS) * ratio;
}

function distanceAhead(network: RoadNetwork, car: TrafficCar, lead: TrafficLead): number | null {
  if (lead.edgeId === car.edgeId) {
    const delta = lead.distanceMeters - car.distanceMeters;
    return delta > 0.5 ? delta : null;
  }
  const edge = network.edgesById.get(car.edgeId);
  const next = edge ? nextEdge(network, edge) : null;
  if (!edge || !next || lead.edgeId !== next.id) {
    return null;
  }
  const remaining = edge.lengthMeters - car.distanceMeters;
  if (remaining > TRAFFIC_GAP_METERS) {
    return null;
  }
  return remaining + Math.max(0, lead.distanceMeters);
}

function closestAhead(network: RoadNetwork, car: TrafficCar, leads: readonly TrafficLead[]): number | null {
  let best: number | null = null;
  for (const lead of leads) {
    const along = distanceAhead(network, car, lead);
    const gap = distanceMeters(car.position, lead.position);
    const inFront = headingDelta(bearingDegrees(car.position, lead.position), car.headingDegrees) < 70;
    const near = Number.isFinite(gap) && gap < TRAFFIC_STOP_METERS && inFront ? gap : null;
    const candidate = along === null ? near : near === null ? along : Math.min(along, near);
    if (candidate === null) {
      continue;
    }
    if (best === null || candidate < best) {
      best = candidate;
    }
  }
  return best;
}

function targetSpeed(
  ahead: number | null,
  speed: number,
  noticeMeters = TRAFFIC_GAP_METERS,
  cruise = TRAFFIC_SPEED_MPS,
): number {
  if (ahead === null || ahead >= noticeMeters) {
    return cruise;
  }
  if (ahead <= TRAFFIC_STOP_METERS) {
    return 0;
  }
  const room = ahead - TRAFFIC_STOP_METERS;
  // Brake a little earlier than the acceleration limit, so a discrete step still stops short of the car ahead.
  const braking = TRAFFIC_ACCEL_MPS2 * 0.85;
  if (speed * speed > 2 * braking * room) {
    return 0;
  }
  return Math.min(cruise, Math.sqrt(2 * TRAFFIC_ACCEL_MPS2 * room));
}

/** Distance to the player when they are in front of this car, on any street. */
function playerNotice(car: TrafficCar, player: TrafficLead | null): number | null {
  if (!player) {
    return null;
  }
  const gap = distanceMeters(car.position, player.position);
  if (!Number.isFinite(gap) || gap < 0.8 || gap > PLAYER_NOTICE_METERS) {
    return null;
  }
  const bearing = bearingDegrees(car.position, player.position);
  if (headingDelta(bearing, car.headingDegrees) > 75) {
    return null;
  }
  if (
    player.headingDegrees != null &&
    headingDelta(player.headingDegrees, car.headingDegrees) > 120
  ) {
    return null;
  }
  return gap;
}

function stepOne(
  network: RoadNetwork,
  car: TrafficCar,
  cars: readonly TrafficCar[],
  player: TrafficLead | null,
  dt: number,
  timeSeconds: number,
): TrafficCar {
  const edge = network.edgesById.get(car.edgeId);
  if (!edge) {
    return { ...car, speedMps: 0 };
  }
  const leads: TrafficLead[] = cars
    .filter((other) => other.id !== car.id)
    .map((other) => ({ edgeId: other.edgeId, distanceMeters: other.distanceMeters, position: other.position }));
  const sameWay =
    player?.headingDegrees == null || headingDelta(player.headingDegrees, car.headingDegrees) <= 120;
  if (player && sameWay) {
    leads.push(player);
  }
  const cruise = Math.min(roadCruiseMps(edge), car.cruiseMps ?? Number.POSITIVE_INFINITY);
  const ahead = closestAhead(network, car, leads);
  const kind = roadEndKind(network, edge);
  const remaining = edge.lengthMeters - car.distanceMeters;
  const blocked = junctionBlocked(network, edge, car, cars, player);
  const signal = nextSignalAhead(network, edge, car.distanceMeters);
  const stopAt = signal ? Math.max(0, signal.distanceMeters - SIGNAL_STOP_METERS) : null;
  const beforeLine = stopAt !== null && car.distanceMeters <= stopAt + 0.3;
  const lineRoom = stopAt === null ? null : stopAt - car.distanceMeters;
  const occupied =
    signal !== null && beforeLine
      ? exitOccupied(network, edge, signal.distanceMeters, car, cars, player)
      : false;
  let holdAt: number | null = null;
  let easeYellow = false;
  if (signal && beforeLine && lineRoom !== null) {
    if (signal.kind === "continuous_green") {
      holdAt = occupied ? stopAt : null;
    } else {
      const color = signalColor(sampleEdge(edge, signal.distanceMeters).headingDegrees, timeSeconds);
      const canStop = car.speedMps * car.speedMps <= 2 * TRAFFIC_ACCEL_MPS2 * Math.max(0, lineRoom);
      if (color === "red" || occupied) {
        holdAt = stopAt;
      } else if (color === "yellow" && canStop) {
        holdAt = stopAt;
      } else if (color === "yellow") {
        easeYellow = true;
      }
    }
  }
  let desired = Math.min(
    targetSpeed(ahead, car.speedMps, TRAFFIC_GAP_METERS, cruise),
    targetSpeed(playerNotice(car, sameWay ? player : null), car.speedMps, PLAYER_NOTICE_METERS, cruise),
    junctionSpeed(remaining, blocked, kind, car.speedMps, cruise),
  );
  if (holdAt !== null && lineRoom !== null) {
    desired = Math.min(desired, speedForLine(lineRoom, car.speedMps, cruise));
  }
  if (easeYellow) {
    desired = Math.min(desired, Math.max(JUNCTION_CREEP_MPS, 5));
  }
  const delta = Math.max(-TRAFFIC_ACCEL_MPS2 * dt, Math.min(TRAFFIC_ACCEL_MPS2 * dt, desired - car.speedMps));
  const speed = Math.max(0, Math.min(cruise, car.speedMps + delta));
  const travel = car.distanceMeters + speed * dt;
  let capped = blocked ? Math.min(travel, edge.lengthMeters) : travel;
  if (holdAt !== null) {
    capped = Math.min(capped, holdAt);
  }
  const moved = moveAlong(network, edge, capped, isDecision(kind) ? 1 : MAX_TRANSFERS);
  const sample = sampleEdge(moved.edge, moved.distance);
  return {
    ...car,
    edgeId: moved.edge.id,
    distanceMeters: moved.distance,
    speedMps: speed,
    position: sample.position,
    headingDegrees: turnToward(car.headingDegrees, sample.headingDegrees, dt),
    cruiseMps: car.cruiseMps,
  };
}

export function stepTraffic(
  network: RoadNetwork,
  cars: readonly TrafficCar[],
  player: TrafficLead | null,
  dtSeconds: number,
  timeSeconds = 0,
): TrafficCar[] {
  const dt = clampFrame(dtSeconds);
  if (dt === 0 || cars.length === 0) {
    return [...cars];
  }
  return cars.map((car) => stepOne(network, car, cars, player, dt, timeSeconds));
}

function carOnEdge(edge: RoadEdge, distance: number, id: string, speed: number): TrafficCar {
  const sample = sampleEdge(edge, distance);
  return {
    id,
    edgeId: edge.id,
    distanceMeters: Math.min(edge.lengthMeters, Math.max(0, distance)),
    speedMps: speed,
    position: sample.position,
    headingDegrees: sample.headingDegrees,
  };
}

function spawnSlots(network: RoadNetwork): Array<{ edge: RoadEdge; distance: number }> {
  const edges = network.edges
    .filter((edge) => edge.lengthMeters >= MIN_EDGE_METERS && edge.points.length >= 2)
    .sort((left, right) => {
      const leftForward = left.id.endsWith(":forward") ? 0 : 1;
      const rightForward = right.id.endsWith(":forward") ? 0 : 1;
      if (leftForward !== rightForward) {
        return leftForward - rightForward;
      }
      return left.id.localeCompare(right.id);
    });
  const slots: Array<{ edge: RoadEdge; distance: number }> = [];
  const spacing = TRAFFIC_GAP_METERS + 16;
  for (const edge of edges) {
    for (let distance = 18; distance <= edge.lengthMeters - 12; distance += spacing) {
      slots.push({ edge, distance });
    }
  }
  return slots;
}

function tooClose(position: RoadPoint, others: readonly RoadPoint[], clearance: number): boolean {
  return others.some((other) => distanceMeters(position, other) < clearance);
}

function slotsAround(
  slots: Array<{ edge: RoadEdge; distance: number }>,
  player: RoadPoint | null,
  count: number,
): Array<{ edge: RoadEdge; distance: number }> {
  if (!player) {
    const stride = Math.max(1, Math.floor(slots.length / count));
    const order = [...slots.keys()];
    const indexes = stride === 1 ? order : order.filter((index) => index % stride === 0).concat(order);
    return indexes.flatMap((index) => {
      const slot = slots[index];
      return slot ? [slot] : [];
    });
  }
  const around = slots
    .map((slot, index) => ({
      slot,
      index,
      gap: distanceMeters(sampleEdge(slot.edge, slot.distance).position, player),
    }))
    .filter((item) => item.gap >= SPAWN_CLEARANCE_METERS && item.gap <= 220);
  const pool = around.length > 0 ? around : slots.map((slot, index) => ({
    slot,
    index,
    gap: distanceMeters(sampleEdge(slot.edge, slot.distance).position, player),
  }));
  return pool.sort((left, right) => left.gap - right.gap || left.index - right.index).map((item) => item.slot);
}

export function createTraffic(network: RoadNetwork, player: RoadPoint | null): TrafficCar[] {
  const count = trafficCount(network.edges.length);
  if (count === 0) {
    return [];
  }
  const slots = spawnSlots(network);
  if (slots.length === 0) {
    return [];
  }
  const chosen: TrafficCar[] = [];
  for (const slot of slotsAround(slots, player, count)) {
    if (chosen.length >= count) {
      break;
    }
    const car = carOnEdge(slot.edge, slot.distance, `trafik-${chosen.length + 1}`, TRAFFIC_SPEED_MPS);
    const occupied = chosen.map((item) => item.position);
    if (player && tooClose(car.position, [player], SPAWN_CLEARANCE_METERS)) {
      continue;
    }
    if (tooClose(car.position, occupied, TRAFFIC_GAP_METERS)) {
      continue;
    }
    chosen.push(car);
  }
  return chosen;
}

export function rejoinTraffic(
  cars: readonly TrafficCar[],
  network: RoadNetwork,
  player: RoadPoint | null,
): TrafficCar[] {
  if (network.edges.length === 0) {
    return [];
  }
  const kept: TrafficCar[] = [];
  for (const car of cars) {
    const edge = network.edgesById.get(car.edgeId);
    if (edge) {
      const placed = carOnEdge(
        edge,
        Math.min(edge.lengthMeters, Math.max(0, car.distanceMeters)),
        car.id,
        car.speedMps,
      );
      kept.push({ ...placed, headingDegrees: car.headingDegrees });
      continue;
    }
    const near = nearestPlacement(network, car.position, REJOIN_METERS);
    if (!near) {
      continue;
    }
    const placed = carOnEdge(near.edge, near.distanceMeters, car.id, car.speedMps);
    kept.push({ ...placed, headingDegrees: car.headingDegrees });
  }
  const limit = trafficCount(network.edges.length);
  if (kept.length >= limit) {
    return kept.slice(0, limit);
  }
  const used = new Set(kept.map((car) => car.id));
  let serial = kept.length;
  for (const candidate of createTraffic(network, player)) {
    if (kept.length >= limit) {
      break;
    }
    if (tooClose(candidate.position, kept.map((car) => car.position), TRAFFIC_GAP_METERS)) {
      continue;
    }
    let id = candidate.id;
    while (used.has(id)) {
      serial += 1;
      id = `trafik-${serial}`;
    }
    used.add(id);
    kept.push({ ...candidate, id });
  }
  return kept;
}

export function refreshTraffic(
  cars: readonly TrafficCar[],
  network: RoadNetwork,
  player: RoadPoint | null,
): TrafficCar[] {
  if (network.edges.length === 0) {
    return [];
  }
  const base = cars.length === 0 ? createTraffic(network, player) : rejoinTraffic(cars, network, player);
  return seedCourseTraffic(network, base, player);
}
