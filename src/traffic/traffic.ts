import { listChoices, turnToward } from "../drive/drive";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import {
  bearingDegrees,
  nearestPlacement,
  sampleEdge,
  type RoadEdge,
  type RoadNetwork,
} from "../roads/roadNetwork";

export const TRAFFIC_SPEED_MPS = 8;
export const TRAFFIC_GAP_METERS = 22;
export const TRAFFIC_STOP_METERS = 8;
export const MAX_TRAFFIC = 5;
const TRAFFIC_ACCEL_MPS2 = 4;
const JUNCTION_APPROACH_METERS = 30;
const JUNCTION_CREEP_MPS = 3;
const MIN_EDGE_METERS = 30;
const SPAWN_CLEARANCE_METERS = 40;
const REJOIN_METERS = 25;
const MAX_TRANSFERS = 8;

export type RoadEndKind = "continuation" | "branch" | "crossing" | "dead-end";

export type TrafficCar = {
  id: string;
  edgeId: string;
  distanceMeters: number;
  speedMps: number;
  position: RoadPoint;
  headingDegrees: number;
};

export type TrafficLead = {
  edgeId: string;
  distanceMeters: number;
  position: RoadPoint;
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

function nextEdge(network: RoadNetwork, edge: RoadEdge): RoadEdge | null {
  const forward = [...forwardChoices(network, edge)].sort((left, right) => left.id.localeCompare(right.id));
  const choice = forward[0];
  if (choice) {
    return choice;
  }
  const listed = listChoices(network, edge);
  const reverse = listed.choices.find((item) => item.reverse);
  const turned = reverse ? network.edgesById.get(reverse.edgeId) : undefined;
  return turned && turned.fromNode === edge.toNode ? turned : null;
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

function junctionSpeed(remaining: number, blocked: boolean, kind: RoadEndKind, speed: number): number {
  if (!isDecision(kind)) {
    return TRAFFIC_SPEED_MPS;
  }
  if (blocked) {
    if (remaining <= JUNCTION_APPROACH_METERS) {
      return 0;
    }
    return targetSpeed(Math.max(0, remaining), speed);
  }
  if (remaining >= JUNCTION_APPROACH_METERS) {
    return TRAFFIC_SPEED_MPS;
  }
  const ratio = Math.max(0, remaining) / JUNCTION_APPROACH_METERS;
  return JUNCTION_CREEP_MPS + (TRAFFIC_SPEED_MPS - JUNCTION_CREEP_MPS) * ratio;
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

function targetSpeed(ahead: number | null, speed: number): number {
  const needed = (Math.max(0, speed) * Math.max(0, speed)) / (2 * TRAFFIC_ACCEL_MPS2) + TRAFFIC_STOP_METERS;
  if (ahead !== null && ahead <= needed) {
    return 0;
  }
  if (ahead === null || ahead >= TRAFFIC_GAP_METERS) {
    return TRAFFIC_SPEED_MPS;
  }
  const span = TRAFFIC_GAP_METERS - TRAFFIC_STOP_METERS;
  return TRAFFIC_SPEED_MPS * ((ahead - TRAFFIC_STOP_METERS) / span);
}

function stepOne(
  network: RoadNetwork,
  car: TrafficCar,
  cars: readonly TrafficCar[],
  player: TrafficLead | null,
  dt: number,
): TrafficCar {
  const edge = network.edgesById.get(car.edgeId);
  if (!edge) {
    return { ...car, speedMps: 0 };
  }
  const leads: TrafficLead[] = cars
    .filter((other) => other.id !== car.id)
    .map((other) => ({ edgeId: other.edgeId, distanceMeters: other.distanceMeters, position: other.position }));
  if (player) {
    leads.push(player);
  }
  const ahead = closestAhead(network, car, leads);
  const kind = roadEndKind(network, edge);
  const remaining = edge.lengthMeters - car.distanceMeters;
  const blocked = junctionBlocked(network, edge, car, cars, player);
  const desired = Math.min(
    targetSpeed(ahead, car.speedMps),
    junctionSpeed(remaining, blocked, kind, car.speedMps),
  );
  const delta = Math.max(-TRAFFIC_ACCEL_MPS2 * dt, Math.min(TRAFFIC_ACCEL_MPS2 * dt, desired - car.speedMps));
  const speed = Math.max(0, Math.min(TRAFFIC_SPEED_MPS, car.speedMps + delta));
  const travel = car.distanceMeters + speed * dt;
  const capped = blocked ? Math.min(travel, edge.lengthMeters) : travel;
  const moved = moveAlong(network, edge, capped, isDecision(kind) ? 1 : MAX_TRANSFERS);
  const sample = sampleEdge(moved.edge, moved.distance);
  return {
    ...car,
    edgeId: moved.edge.id,
    distanceMeters: moved.distance,
    speedMps: speed,
    position: sample.position,
    headingDegrees: turnToward(car.headingDegrees, sample.headingDegrees, dt),
  };
}

export function stepTraffic(
  network: RoadNetwork,
  cars: readonly TrafficCar[],
  player: TrafficLead | null,
  dtSeconds: number,
): TrafficCar[] {
  const dt = clampFrame(dtSeconds);
  if (dt === 0 || cars.length === 0) {
    return [...cars];
  }
  return cars.map((car) => stepOne(network, car, cars, player, dt));
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
  return slots
    .map((slot, index) => ({
      slot,
      index,
      gap: distanceMeters(sampleEdge(slot.edge, slot.distance).position, player),
    }))
    .sort((left, right) => left.gap - right.gap || left.index - right.index)
    .map((item) => item.slot);
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
  if (cars.length === 0) {
    return createTraffic(network, player);
  }
  return rejoinTraffic(cars, network, player);
}
