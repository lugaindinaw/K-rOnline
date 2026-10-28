import {
  nearestPlacement,
  pathHeading,
  sampleEdge,
  type RoadEdge,
  type RoadNetwork,
  type RoadPlacement,
} from "../roads/roadNetwork";
import type { RoadPoint } from "../roads/drivingRoads";

export const MAX_SPEED_MPS = 12;
export const ACCEL_MPS2 = 4.5;
export const BRAKE_MPS2 = 8;
export const COAST_MPS2 = 0.6;
export const MAX_STEP_SECONDS = 0.05;
export const MAX_FRAME_SECONDS = 0.25;
export const YAW_DEGREES_PER_SECOND = 120;
/** How far the car may sit to either side of the centerline it is already following. */
export const MAX_LATERAL_METERS = 3.2;
const STEER_DEGREES_SLOW = 26;
const STEER_DEGREES_FAST = 11;
const MAX_TRANSFERS = 32;
const STOP_SNAP_METERS = 2;

export type DriveInput = {
  accelerate: boolean;
  brake: boolean;
  /** -1 is left, +1 is right. Omitted means straight. */
  steer?: number;
};

export type DriveChoice = {
  index: number;
  edgeId: string;
  label: string;
  reverse: boolean;
};

export type VehicleMode = "driving" | "choose" | "ended";

export type VehicleState = {
  edgeId: string;
  distanceMeters: number;
  speedMps: number;
  position: RoadPoint;
  headingDegrees: number;
  /** Meters left of the centerline. Right is negative. */
  offsetMeters: number;
  mode: VehicleMode;
  message: string | null;
  choices: DriveChoice[];
  roadName: string | null;
  /**
   * True only when the free position lies in the tracked way's carriageway.
   * The junction exercise may use that sample. A flare or a miss stays false.
   */
  measurementReliable?: boolean;
};

export type VehicleStatus = {
  placed: boolean;
  speedKmh: number;
  roadName: string | null;
  message: string | null;
  choices: DriveChoice[];
  mode: VehicleMode | "idle";
};

export const IDLE_VEHICLE: VehicleStatus = {
  placed: false,
  speedKmh: 0,
  roadName: null,
  message: null,
  choices: [],
  mode: "idle",
};

function clampStep(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return Math.min(MAX_STEP_SECONDS, dtSeconds);
}

function clampFrame(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return Math.min(MAX_FRAME_SECONDS, dtSeconds);
}

export function stoppingDistanceMeters(speedMps: number): number {
  const speed = Math.max(0, speedMps);
  return (speed * speed) / (2 * BRAKE_MPS2);
}

export function turnToward(
  currentDegrees: number,
  targetDegrees: number,
  dtSeconds: number,
  maxDegreesPerSecond = YAW_DEGREES_PER_SECOND,
): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return ((currentDegrees % 360) + 360) % 360;
  }
  const from = ((currentDegrees % 360) + 360) % 360;
  const to = ((targetDegrees % 360) + 360) % 360;
  let delta = to - from;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  const maxStep = Math.max(0, maxDegreesPerSecond) * dtSeconds;
  const step = Math.max(-maxStep, Math.min(maxStep, delta));
  return (from + step + 360) % 360;
}

export function steerAngleDegrees(speedMps: number, steer: number): number {
  if (!Number.isFinite(steer) || steer === 0) {
    return 0;
  }
  const command = Math.max(-1, Math.min(1, steer));
  const speed = Math.max(0, Math.min(MAX_SPEED_MPS, speedMps));
  const span = speed / MAX_SPEED_MPS;
  const magnitude = STEER_DEGREES_SLOW + (STEER_DEGREES_FAST - STEER_DEGREES_SLOW) * span;
  return command * magnitude;
}

function steerCommand(input: DriveInput): number {
  const steer = input.steer ?? 0;
  if (!Number.isFinite(steer)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, steer));
}

function offsetPoint(position: RoadPoint, headingDegrees: number, leftMeters: number): RoadPoint {
  if (leftMeters === 0) {
    return position;
  }
  const heading = ((headingDegrees - 90) * Math.PI) / 180;
  const cosine = Math.cos((position.lat * Math.PI) / 180);
  return {
    lat: position.lat + (leftMeters * Math.cos(heading)) / 111320,
    lng: position.lng + (leftMeters * Math.sin(heading)) / (111320 * Math.max(0.2, cosine)),
  };
}

function placeOffset(position: RoadPoint, roadHeading: number, offsetMeters: number): { position: RoadPoint; offsetMeters: number } {
  const offset = Math.max(-MAX_LATERAL_METERS, Math.min(MAX_LATERAL_METERS, offsetMeters));
  return { offsetMeters: offset, position: offsetPoint(position, roadHeading, offset) };
}

function automaticContinuation(network: RoadNetwork, edge: RoadEdge): RoadEdge | null {
  const listed = listChoices(network, edge);
  const forward = listed.choices.filter((choice) => !choice.reverse);
  if (forward.length !== 1 || listed.hidden !== 0) {
    return null;
  }
  const only = forward[0];
  return only ? (network.edgesById.get(only.edgeId) ?? null) : null;
}

function mustStopAtEnd(network: RoadNetwork, edge: RoadEdge): boolean {
  return automaticContinuation(network, edge) === null;
}

function isReverse(current: RoadEdge, candidate: RoadEdge): boolean {
  return (
    candidate.osmWayId === current.osmWayId &&
    candidate.fromNode === current.toNode &&
    candidate.toNode === current.fromNode
  );
}

export function listChoices(network: RoadNetwork, edge: RoadEdge): { choices: DriveChoice[]; hidden: number } {
  const outgoing = network.outgoing.get(edge.toNode) ?? [];
  const ranked = outgoing
    .filter((candidate) => candidate.id !== edge.id)
    .map((candidate) => ({ edge: candidate, reverse: isReverse(edge, candidate) }))
    .sort((left, right) => {
      if (left.reverse !== right.reverse) {
        return left.reverse ? 1 : -1;
      }
      const byName = (left.edge.name ?? "").localeCompare(right.edge.name ?? "", "sv");
      if (byName !== 0) {
        return byName;
      }
      return left.edge.id.localeCompare(right.edge.id);
    });
  const visible = ranked.slice(0, 9);
  return {
    hidden: ranked.length - visible.length,
    choices: visible.map((item, index) => ({
      index: index + 1,
      edgeId: item.edge.id,
      reverse: item.reverse,
      label: item.reverse
        ? `Vänd tillbaka${item.edge.name ? ` på ${item.edge.name}` : ""}`
        : (item.edge.name ?? "Namnlös väg"),
    })),
  };
}

function located(edge: RoadEdge, distanceMeters: number, speedMps: number, mode: VehicleMode, message: string | null, choices: DriveChoice[]): VehicleState {
  const sample = sampleEdge(edge, distanceMeters);
  return {
    edgeId: edge.id,
    distanceMeters: Math.min(edge.lengthMeters, Math.max(0, distanceMeters)),
    speedMps,
    position: sample.position,
    headingDegrees: sample.headingDegrees,
    offsetMeters: 0,
    mode,
    message,
    choices,
    roadName: edge.name,
  };
}

export function vehicleFromPlacement(placement: RoadPlacement): VehicleState {
  const state = located(placement.edge, placement.distanceMeters, 0, "driving", null, []);
  const road = placement.edge.name ?? "en väg utan namn";
  return { ...state, message: `Bilen står på ${road}.` };
}

export function vehicleStatus(state: VehicleState | null, message?: string | null): VehicleStatus {
  if (!state) {
    return { ...IDLE_VEHICLE, message: message ?? null };
  }
  return {
    placed: true,
    speedKmh: Math.round(state.speedMps * 3.6),
    roadName: state.roadName,
    message: message === undefined ? state.message : message,
    choices: state.choices,
    mode: state.mode,
  };
}

function arrive(network: RoadNetwork, edge: RoadEdge, leftoverMeters: number, speedMps: number): VehicleState {
  let current = edge;
  let leftover = leftoverMeters;
  for (let hop = 0; hop < MAX_TRANSFERS; hop += 1) {
    const listed = listChoices(network, current);
    const forward = listed.choices.filter((choice) => !choice.reverse);
    if (forward.length === 1 && listed.hidden === 0) {
      const only = forward[0];
      const next = only ? network.edgesById.get(only.edgeId) : undefined;
      if (!next || next.id === current.id) {
        break;
      }
      if (leftover <= next.lengthMeters) {
        return located(next, leftover, speedMps, "driving", null, []);
      }
      leftover -= next.lengthMeters;
      current = next;
      continue;
    }
    if (listed.choices.length === 0) {
      return located(current, current.lengthMeters, 0, "ended", "Vägen tar slut i det hämtade området.", []);
    }
    const extra = listed.hidden > 0 ? " Fler anslutningar finns än vad som kan visas." : "";
    return located(
      current,
      current.lengthMeters,
      0,
      "choose",
      `Välj anslutande väg med 1–9.${extra}`,
      listed.choices,
    );
  }
  return located(current, current.lengthMeters, 0, "ended", "Vägen tar slut i det hämtade området.", []);
}

export const REJOIN_METERS = 25;

export function continuePastEnd(network: RoadNetwork, edge: RoadEdge, speedMps: number): VehicleState {
  return arrive(network, edge, 0, speedMps);
}

export function rejoinVehicle(previous: VehicleState, network: RoadNetwork): VehicleState {
  const placement = nearestPlacement(network, previous.position, REJOIN_METERS);
  if (!placement) {
    return {
      ...previous,
      speedMps: 0,
      mode: "ended",
      choices: [],
      message: "Bilen hittar inte vägen i det uppdaterade området.",
    };
  }
  const remaining = placement.edge.lengthMeters - placement.distanceMeters;
  if (remaining <= 8) {
    const continued = continuePastEnd(network, placement.edge, previous.speedMps);
    const continuedEdge = network.edgesById.get(continued.edgeId) ?? placement.edge;
    const roadHeading = pathHeading(
      continued.edgeId === placement.edge.id ? null : placement.edge,
      continuedEdge,
      continued.distanceMeters,
      continued.mode === "driving" ? automaticContinuation(network, continuedEdge) : null,
    );
    const placed = placeOffset(continued.position, roadHeading, previous.offsetMeters ?? 0);
    return {
      ...continued,
      ...placed,
      headingDegrees: previous.headingDegrees,
    };
  }
  const sample = sampleEdge(placement.edge, placement.distanceMeters);
  const road = placement.edge.name ?? "en väg utan namn";
  const placed = placeOffset(
    sample.position,
    pathHeading(null, placement.edge, placement.distanceMeters),
    previous.offsetMeters ?? 0,
  );
  return {
    ...previous,
    edgeId: placement.edge.id,
    distanceMeters: placement.distanceMeters,
    position: placed.position,
    offsetMeters: placed.offsetMeters,
    roadName: placement.edge.name,
    mode: "driving",
    choices: [],
    speedMps: previous.speedMps,
    message: previous.speedMps > 0 ? null : `Bilen står på ${road}.`,
  };
}

function stepVehicleOnce(
  network: RoadNetwork,
  state: VehicleState,
  input: DriveInput,
  dtSeconds: number,
): VehicleState {
  if (state.mode !== "driving") {
    return state;
  }
  const edge = network.edgesById.get(state.edgeId);
  if (!edge) {
    return {
      ...state,
      speedMps: 0,
      mode: "ended",
      message: "Vägsträckan finns inte längre i det hämtade området.",
      choices: [],
    };
  }
  const dt = clampStep(dtSeconds);
  if (dt === 0) {
    return state;
  }
  const remaining = edge.lengthMeters - state.distanceMeters;
  const stopping = mustStopAtEnd(network, edge) && remaining <= stoppingDistanceMeters(state.speedMps);
  const brake = input.brake || stopping;
  const accelerate = input.accelerate && !brake;
  let speed = state.speedMps;
  if (brake) {
    speed = Math.max(0, speed - BRAKE_MPS2 * dt);
  } else if (accelerate) {
    speed = Math.min(MAX_SPEED_MPS, speed + ACCEL_MPS2 * dt);
  } else {
    speed = Math.max(0, speed - COAST_MPS2 * dt);
  }
  if (stopping && speed <= 0 && remaining <= STOP_SNAP_METERS) {
    const arrived = arrive(network, edge, 0, 0);
    const arrivedEdge = network.edgesById.get(arrived.edgeId) ?? edge;
    const roadHeading = pathHeading(null, arrivedEdge, arrived.distanceMeters);
    const placed = placeOffset(arrived.position, roadHeading, state.offsetMeters ?? 0);
    return {
      ...arrived,
      ...placed,
      headingDegrees: turnToward(state.headingDegrees, roadHeading, dt),
    };
  }
  const distance = state.distanceMeters + speed * dt;
  const moved =
    distance > edge.lengthMeters
      ? arrive(network, edge, distance - edge.lengthMeters, speed)
      : located(edge, distance, speed, "driving", null, []);
  const currentEdge = network.edgesById.get(moved.edgeId) ?? edge;
  const previousEdge = currentEdge.id === edge.id ? null : edge;
  const roadHeading = pathHeading(
    previousEdge,
    currentEdge,
    moved.distanceMeters,
    moved.mode === "driving" ? automaticContinuation(network, currentEdge) : null,
  );
  const angle = steerAngleDegrees(speed, steerCommand(input));
  const headingDegrees = turnToward(state.headingDegrees, roadHeading + angle, dt);
  const lateral = -speed * Math.tan((angle * Math.PI) / 180) * dt;
  const placed = placeOffset(moved.position, roadHeading, (state.offsetMeters ?? 0) + lateral);
  const steered = {
    ...moved,
    ...placed,
    headingDegrees,
  };
  if (steered.mode !== "driving") {
    return steered;
  }
  return steered.speedMps > 0 ? steered : { ...steered, message: state.message };
}

export function stepVehicle(
  network: RoadNetwork,
  state: VehicleState,
  input: DriveInput,
  dtSeconds: number,
): VehicleState {
  let left = clampFrame(dtSeconds);
  if (left === 0 || state.mode !== "driving") {
    return state;
  }
  let current = state;
  while (left > 1e-6 && current.mode === "driving") {
    const slice = Math.min(MAX_STEP_SECONDS, left);
    current = stepVehicleOnce(network, current, input, slice);
    left -= slice;
  }
  return current;
}

export function selectBranch(network: RoadNetwork, state: VehicleState, index: number): VehicleState {
  if (state.mode !== "choose") {
    return state;
  }
  const choice = state.choices.find((item) => item.index === index);
  const edge = choice ? network.edgesById.get(choice.edgeId) : undefined;
  if (!edge) {
    return state;
  }
  const placed = located(edge, 0, 0, "driving", `Bilen står på ${edge.name ?? "en väg utan namn"}.`, []);
  const carried = placeOffset(placed.position, placed.headingDegrees, state.offsetMeters ?? 0);
  return {
    ...placed,
    ...carried,
    headingDegrees: state.headingDegrees,
  };
}

export function driveInputFromKeys(keys: ReadonlySet<string>): DriveInput {
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  return {
    accelerate: keys.has("KeyW") || keys.has("ArrowUp"),
    brake: keys.has("KeyS") || keys.has("ArrowDown"),
    steer: left === right ? 0 : left ? -1 : 1,
  };
}

export function choiceIndexFromKey(code: string): number | null {
  if (!/^Digit[1-9]$/.test(code)) {
    return null;
  }
  return Number(code.slice(5));
}

export function isTextEntry(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
