import type { RoadPoint } from "../roads/drivingRoads";
import { nearestPlacement, type RoadNetwork } from "../roads/roadNetwork";
import {
  ACCEL_MPS2,
  BRAKE_MPS2,
  COAST_MPS2,
  MAX_FRAME_SECONDS,
  MAX_SPEED_MPS,
  MAX_STEP_SECONDS,
  YAW_DEGREES_PER_SECOND,
  steerAngleDegrees,
  type DriveInput,
  type VehicleState,
} from "./drive";

/**
 * Distance between the axles of the free model. The drawn car is about 4.2 m
 * long. This value only sets how quickly the heading changes with speed and
 * steer angle. It is not a road width and not an OpenStreetMap measurement.
 */
export const FREE_WHEELBASE_METERS = 2.6;
const METERS_PER_DEGREE = 111320;

/**
 * Pose of a car that moves in the map plane.
 * Heading 0 points north and 90 points east, matching the road network.
 * The visible car uses this pose. It is not written back onto a centerline.
 */
export type FreeVehicleState = {
  position: RoadPoint;
  headingDegrees: number;
  speedMps: number;
};

/** Nearest centerline within this distance. Farther than this, the car is not linked to a road. */
export const FREE_ROAD_ASSOCIATION_METERS = 40;

export const OFF_ROAD_MESSAGE = "Bilen är utanför de hämtade vägarna.";

/** Link to a centerline. This is not a position, and applying it must not move the car. */
export type FreeRoadAssociation = {
  edgeId: string;
  distanceMeters: number;
  gapMeters: number;
  roadName: string | null;
};

export function associateFreePosition(
  network: RoadNetwork,
  position: RoadPoint,
  maxGapMeters = FREE_ROAD_ASSOCIATION_METERS,
): FreeRoadAssociation | null {
  const nearest = nearestPlacement(network, position, maxGapMeters);
  if (!nearest) {
    return null;
  }
  return {
    edgeId: nearest.edge.id,
    distanceMeters: nearest.distanceMeters,
    gapMeters: nearest.gapMeters,
    roadName: nearest.edge.name,
  };
}

function roadMessage(previous: string | null, associated: boolean, moving: boolean): string | null {
  if (!associated) {
    return OFF_ROAD_MESSAGE;
  }
  if (moving) {
    return null;
  }
  return previous === OFF_ROAD_MESSAGE ? null : previous;
}

/** Refresh the nearest-road label without changing the car's pose. */
export function describeFreeVehicle(state: VehicleState, network: RoadNetwork): VehicleState {
  const association = associateFreePosition(network, state.position);
  return {
    ...state,
    position: state.position,
    headingDegrees: state.headingDegrees,
    speedMps: state.speedMps,
    offsetMeters: 0,
    edgeId: association?.edgeId ?? "",
    distanceMeters: association?.distanceMeters ?? 0,
    roadName: association?.roadName ?? null,
    mode: "driving",
    choices: [],
    message: roadMessage(state.message, association !== null, state.speedMps > 0),
  };
}

/**
 * One frame of the visible car. Position, heading and speed come only from
 * stepFreeVehicle. The nearest OpenStreetMap edge is recorded for the label
 * and for traffic distance. It is not copied onto the car.
 * Junction choice and road-edge limits are not applied here.
 * The along-track distance is not reliable enough for the junction exercise.
 */
export function advanceFreeVehicle(
  state: VehicleState,
  input: DriveInput,
  dtSeconds: number,
  network: RoadNetwork,
): VehicleState {
  const moved = stepFreeVehicle(
    {
      position: state.position,
      headingDegrees: state.headingDegrees,
      speedMps: state.speedMps,
    },
    input,
    dtSeconds,
  );
  return describeFreeVehicle(
    {
      ...state,
      position: moved.position,
      headingDegrees: moved.headingDegrees,
      speedMps: moved.speedMps,
    },
    network,
  );
}

export function stepFreeVehicle(
  state: FreeVehicleState,
  input: DriveInput,
  dtSeconds: number,
): FreeVehicleState {
  let left = clampFrame(dtSeconds);
  if (left === 0) {
    return normalized(state);
  }
  let current = normalized(state);
  while (left > 1e-6) {
    const slice = Math.min(MAX_STEP_SECONDS, left);
    current = stepOnce(current, input, slice);
    left -= slice;
  }
  return current;
}

function stepOnce(state: FreeVehicleState, input: DriveInput, dtSeconds: number): FreeVehicleState {
  const dt = clampStep(dtSeconds);
  if (dt === 0) {
    return state;
  }
  const speedMps = nextSpeed(state.speedMps, input, dt);
  const headingDegrees = turnBySteer(state.headingDegrees, speedMps, input, dt);
  const position = translate(state.position, headingDegrees, speedMps * dt);
  return { position, headingDegrees, speedMps };
}

function nextSpeed(speedMps: number, input: DriveInput, dt: number): number {
  const speed = Math.max(0, Number.isFinite(speedMps) ? speedMps : 0);
  const brake = input.brake;
  const accelerate = input.accelerate && !brake;
  if (brake) {
    return Math.max(0, speed - BRAKE_MPS2 * dt);
  }
  if (accelerate) {
    return Math.min(MAX_SPEED_MPS, speed + ACCEL_MPS2 * dt);
  }
  return Math.max(0, speed - COAST_MPS2 * dt);
}

function turnBySteer(headingDegrees: number, speedMps: number, input: DriveInput, dt: number): number {
  const yaw = yawDegrees(speedMps, steerCommand(input), dt);
  return wrapDegrees(headingDegrees + yaw);
}

function yawDegrees(speedMps: number, steer: number, dt: number): number {
  const angle = steerAngleDegrees(speedMps, steer);
  const radiansPerSecond = (Math.max(0, speedMps) / FREE_WHEELBASE_METERS) * Math.tan((angle * Math.PI) / 180);
  const degrees = radiansPerSecond * (180 / Math.PI) * dt;
  const cap = YAW_DEGREES_PER_SECOND * dt;
  return Math.max(-cap, Math.min(cap, degrees));
}

function translate(position: RoadPoint, headingDegrees: number, distanceMeters: number): RoadPoint {
  if (!Number.isFinite(distanceMeters) || distanceMeters === 0) {
    return position;
  }
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) {
    return position;
  }
  const heading = (headingDegrees * Math.PI) / 180;
  const north = distanceMeters * Math.cos(heading);
  const east = distanceMeters * Math.sin(heading);
  const cosine = Math.cos((position.lat * Math.PI) / 180);
  return {
    lat: position.lat + north / METERS_PER_DEGREE,
    lng: position.lng + east / (METERS_PER_DEGREE * Math.max(0.2, cosine)),
  };
}

function steerCommand(input: DriveInput): number {
  const steer = input.steer ?? 0;
  if (!Number.isFinite(steer)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, steer));
}

function wrapDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    return 0;
  }
  return ((degrees % 360) + 360) % 360;
}

function clampFrame(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return Math.min(MAX_FRAME_SECONDS, dtSeconds);
}

function clampStep(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return Math.min(MAX_STEP_SECONDS, dtSeconds);
}

function normalized(state: FreeVehicleState): FreeVehicleState {
  const headingDegrees = wrapDegrees(state.headingDegrees);
  const speedMps = Math.max(0, Number.isFinite(state.speedMps) ? state.speedMps : 0);
  if (headingDegrees === state.headingDegrees && speedMps === state.speedMps) {
    return state;
  }
  return { ...state, headingDegrees, speedMps };
}
