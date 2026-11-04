import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";

/** Full lock of the on-screen wheel. Positive is a right turn. */
export const WHEEL_LOCK_DEGREES = 115;
export const SPEEDO_MAX_KMH = 160;
const NEEDLE_START_DEGREES = -120;
const NEEDLE_SWEEP_DEGREES = 240;
/** Look-at point behind the car, and how far the mirror camera sits from it. */
export const MIRROR_LOOK_METERS = 22;
export const MIRROR_RANGE_METERS = 16;
export const MIRROR_TILT_DEGREES = 72;

export type CockpitPose = {
  lat: number;
  lng: number;
  headingDegrees: number;
  speedKmh: number;
  /** -1 is left, +1 is right. This is the smoothed steer the car is using. */
  steer: number;
  altitude: number;
  placed: boolean;
  pitchDegrees: number;
  rollDegrees: number;
  /** Map tilt while the driver camera is active. 90 looks at the horizon. */
  viewTiltDegrees: number;
};

export type CockpitMotion = {
  wheelDegrees: number;
  needleDegrees: number;
};

export type MirrorCamera = {
  lat: number;
  lng: number;
  headingDegrees: number;
  rangeMeters: number;
  tiltDegrees: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function offset(point: RoadPoint, headingDegrees: number, meters: number): RoadPoint {
  const heading = (headingDegrees * Math.PI) / 180;
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return {
    lat: point.lat + (meters * Math.cos(heading)) / 111320,
    lng: point.lng + (meters * Math.sin(heading)) / (111320 * Math.max(0.2, cosine)),
  };
}

export function wheelRotationDegrees(steer: number): number {
  return clamp(steer, -1, 1) * WHEEL_LOCK_DEGREES;
}

export function needleDegrees(speedKmh: number): number {
  const span = clamp(speedKmh, 0, SPEEDO_MAX_KMH) / SPEEDO_MAX_KMH;
  return NEEDLE_START_DEGREES + span * NEEDLE_SWEEP_DEGREES;
}

function ease(current: number, target: number, dtSeconds: number, responsePerSecond: number): number {
  const gain = 1 - Math.exp(-responsePerSecond * Math.max(0, dtSeconds));
  return current + (target - current) * gain;
}

/** Wheel and needle catch up smoothly instead of jumping with the keys. */
export function stepCockpit(
  motion: CockpitMotion,
  pose: { steer: number; speedKmh: number },
  dtSeconds: number,
): CockpitMotion {
  const dt = Number.isFinite(dtSeconds) ? Math.min(Math.max(dtSeconds, 0), 0.1) : 0;
  return {
    wheelDegrees: ease(motion.wheelDegrees, wheelRotationDegrees(pose.steer), dt, 10),
    needleDegrees: ease(motion.needleDegrees, needleDegrees(pose.speedKmh), dt, 18),
  };
}

/**
 * A camera just behind the car, looking further back. The player's own
 * body stays behind this camera so the mirror shows the road behind.
 */
export function mirrorCamera(car: RoadPoint & { headingDegrees: number }): MirrorCamera {
  const headingDegrees = (((car.headingDegrees + 180) % 360) + 360) % 360;
  const look = offset(car, headingDegrees, MIRROR_LOOK_METERS);
  return {
    lat: look.lat,
    lng: look.lng,
    headingDegrees,
    rangeMeters: MIRROR_RANGE_METERS,
    tiltDegrees: MIRROR_TILT_DEGREES,
  };
}

/** A side mirror looks back along that side of the car. Left is the driver's side. */
export function sideMirrorCamera(
  car: RoadPoint & { headingDegrees: number },
  side: "left" | "right",
): MirrorCamera {
  const sign = side === "left" ? -1 : 1;
  const headingDegrees = (((car.headingDegrees + 180 + sign * 16) % 360) + 360) % 360;
  const look = offset(car, headingDegrees, 16);
  return {
    lat: look.lat,
    lng: look.lng,
    headingDegrees,
    rangeMeters: 14,
    tiltDegrees: 78,
  };
}

export function mirrorSitsBehind(car: RoadPoint & { headingDegrees: number }): boolean {
  const view = mirrorCamera(car);
  const camera = offset(view, view.headingDegrees + 180, view.rangeMeters);
  const behind = offset(car, (car.headingDegrees + 180) % 360, 1);
  return distanceMeters(camera, behind) < distanceMeters(camera, car);
}
