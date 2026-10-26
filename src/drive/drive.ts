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
const MAX_TRANSFERS = 32;
const STOP_SNAP_METERS = 2;

export type DriveInput = {
  accelerate: boolean;
  brake: boolean;
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
  mode: VehicleMode;
  message: string | null;
  choices: DriveChoice[];
  roadName: string | null;
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
    return continuePastEnd(network, placement.edge, previous.speedMps);
  }
  const sample = sampleEdge(placement.edge, placement.distanceMeters);
  const road = placement.edge.name ?? "en väg utan namn";
  return {
    ...previous,
    edgeId: placement.edge.id,
    distanceMeters: placement.distanceMeters,
    position: sample.position,
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
    return arrive(network, edge, 0, 0);
  }
  const distance = state.distanceMeters + speed * dt;
  const moved =
    distance > edge.lengthMeters
      ? arrive(network, edge, distance - edge.lengthMeters, speed)
      : located(edge, distance, speed, "driving", null, []);
  if (moved.mode !== "driving") {
    return moved;
  }
  const currentEdge = network.edgesById.get(moved.edgeId) ?? edge;
  const previousEdge = currentEdge.id === edge.id ? null : edge;
  const steered = {
    ...moved,
    headingDegrees: turnToward(
      state.headingDegrees,
      pathHeading(
        previousEdge,
        currentEdge,
        moved.distanceMeters,
        automaticContinuation(network, currentEdge),
      ),
      dt,
    ),
  };
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
  return located(edge, 0, 0, "driving", `Bilen står på ${edge.name ?? "en väg utan namn"}.`, []);
}

export function driveInputFromKeys(keys: ReadonlySet<string>): DriveInput {
  return {
    accelerate: keys.has("KeyW") || keys.has("ArrowUp"),
    brake: keys.has("KeyS") || keys.has("ArrowDown"),
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
