import { turnToward } from "../drive/drive";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";

export type CameraView = "chase" | "driver";

/**
 * Low rear follow, the kind a driving game uses. Tilt 0 is straight down and
 * 90 is the horizon, so 72 sits a few metres above the trunk and looks along
 * the road. The whole car stays in frame and the street ahead stays visible.
 */
export const CHASE_RANGE_METERS = 12;
export const CHASE_TILT_DEGREES = 72;
export const CHASE_LOOKAHEAD_METERS = 2.4;
/** Puts the chase camera on the driver's side so the body and both near wheels read. */
export const CHASE_LEFT_METERS = 1.2;
export const FOLLOW_RANGE_METERS = CHASE_RANGE_METERS;
export const FOLLOW_TILT_DEGREES = CHASE_TILT_DEGREES;
export const CAMERA_LOOKAHEAD_METERS = CHASE_LOOKAHEAD_METERS;
/**
 * Seated eye height. The look point sits just under the eyes, down the road,
 * so the view runs forward instead of down onto the city.
 */
export const DRIVER_EYE_HEIGHT_METERS = 1.25;
/**
 * The look sits just under the horizon so the road fills the lower windshield.
 * The cabin itself is drawn in front of the map, so this point is the road, not the hood.
 */
export const DRIVER_LOOK_ABOVE_GROUND_METERS = 0.1;
export const DRIVER_LOOKAHEAD_METERS = 8;
/** Wide enough for the road ahead, narrow enough that the hood stays in the lower windshield. */
export const DRIVER_VERTICAL_FOV_DEGREES = 50;
export const CHASE_VERTICAL_FOV_DEGREES = 48;
export const DRIVER_FORWARD_METERS = 0.2;
export const DRIVER_LEFT_METERS = 0.38;
export const CAMERA_YAW_DEGREES_PER_SECOND = 110;
/** Driver aim turns slower than the chase camera so the view does not twitch with the car. */
export const DRIVER_YAW_DEGREES_PER_SECOND = 62;
const CHASE_RESPONSE_PER_SECOND = 8;
const DRIVER_RESPONSE_PER_SECOND = 4.5;
const DRIVER_MAX_METERS_PER_SECOND = 16;
const NEAR_CAMERA_METERS = 48;
const MAX_NEAR_METERS_PER_SECOND = 30;

export type CameraProfile = {
  rangeMeters: number;
  tiltDegrees: number;
  lookaheadMeters: number;
  leftMeters: number;
  responsePerSecond: number;
};

/** Distance multiplies the chase range. Positive height raises the camera. */
export type ChaseTune = {
  distance: number;
  heightDegrees: number;
};

export function chaseAim(tune: ChaseTune = { distance: 1, heightDegrees: 0 }): {
  rangeMeters: number;
  tiltDegrees: number;
} {
  const distance = Math.min(1.8, Math.max(0.65, Number.isFinite(tune.distance) ? tune.distance : 1));
  const height = Math.min(12, Math.max(-8, Number.isFinite(tune.heightDegrees) ? tune.heightDegrees : 0));
  return {
    rangeMeters: CHASE_RANGE_METERS * distance,
    tiltDegrees: Math.min(82, Math.max(64, CHASE_TILT_DEGREES - height)),
  };
}

export function cameraProfile(view: CameraView, tune?: ChaseTune): CameraProfile {
  if (view === "driver") {
    const back = DRIVER_LOOKAHEAD_METERS - DRIVER_FORWARD_METERS;
    const drop = DRIVER_EYE_HEIGHT_METERS - DRIVER_LOOK_ABOVE_GROUND_METERS;
    return {
      rangeMeters: Math.hypot(back, drop),
      tiltDegrees: (Math.atan2(back, drop) * 180) / Math.PI,
      lookaheadMeters: DRIVER_LOOKAHEAD_METERS,
      leftMeters: DRIVER_LEFT_METERS,
      responsePerSecond: DRIVER_RESPONSE_PER_SECOND,
    };
  }
  const aim = chaseAim(tune);
  return {
    rangeMeters: aim.rangeMeters,
    tiltDegrees: aim.tiltDegrees,
    lookaheadMeters: CHASE_LOOKAHEAD_METERS,
    leftMeters: CHASE_LEFT_METERS,
    responsePerSecond: CHASE_RESPONSE_PER_SECOND,
  };
}

export type FollowCamera = {
  lat: number;
  lng: number;
  headingDegrees: number;
  rangeMeters: number;
  tiltDegrees: number;
};

export type FollowView = {
  center?: { lat?: number; lng?: number } | null;
  heading?: number;
  range?: number;
  tilt?: number;
};

function lookAhead(position: RoadPoint, headingDegrees: number, meters: number): RoadPoint {
  const heading = (headingDegrees * Math.PI) / 180;
  const cosine = Math.cos((position.lat * Math.PI) / 180);
  return {
    lat: position.lat + (meters * Math.cos(heading)) / 111320,
    lng: position.lng + (meters * Math.sin(heading)) / (111320 * Math.max(0.2, cosine)),
  };
}

function blend(current: number, target: number, dtSeconds: number, responsePerSecond: number): number {
  const gain = 1 - Math.exp(-responsePerSecond * Math.max(0, dtSeconds));
  return current + (target - current) * gain;
}

function moveToward(from: RoadPoint, to: RoadPoint, maxMeters: number): RoadPoint {
  const distance = distanceMeters(from, to);
  if (!Number.isFinite(distance) || distance <= maxMeters || distance < 0.05) {
    return to;
  }
  const scale = maxMeters / distance;
  return {
    lat: from.lat + (to.lat - from.lat) * scale,
    lng: from.lng + (to.lng - from.lng) * scale,
  };
}

/**
 * If the map cannot tilt up to the horizon, shorten the range so the eye
 * stays near seated height above the look point instead of hanging in the air.
 */
export function streetLevelRange(actualTiltDegrees: number): number {
  const tilt = Math.min(89, Math.max(50, actualTiltDegrees));
  const range = DRIVER_EYE_HEIGHT_METERS / Math.cos((tilt * Math.PI) / 180);
  return Math.min(cameraProfile("driver").rangeMeters, Math.max(3.5, range));
}

export function framedDriverCamera(
  requested: { rangeMeters: number; tiltDegrees: number },
  appliedTiltDegrees: number,
): { rangeMeters: number; tiltDegrees: number; lookOnRoad: boolean } {
  const tilt = Number.isFinite(appliedTiltDegrees) ? appliedTiltDegrees : requested.tiltDegrees;
  if (tilt < requested.tiltDegrees - 2) {
    return { rangeMeters: streetLevelRange(tilt), tiltDegrees: tilt, lookOnRoad: true };
  }
  return {
    rangeMeters: requested.rangeMeters,
    tiltDegrees: requested.tiltDegrees,
    lookOnRoad: false,
  };
}

export function approachDriverPose(
  current: { rangeMeters: number; tiltDegrees: number },
  dtSeconds: number,
): { rangeMeters: number; tiltDegrees: number } {
  const profile = cameraProfile("driver");
  return {
    rangeMeters: blend(current.rangeMeters, profile.rangeMeters, dtSeconds, profile.responsePerSecond),
    tiltDegrees: blend(current.tiltDegrees, profile.tiltDegrees, dtSeconds, profile.responsePerSecond),
  };
}

export function claimCameraJob(ownedJob: number, activeJob: number): { ownedJob: number; interrupt: boolean } {
  if (ownedJob === activeJob) {
    return { ownedJob, interrupt: false };
  }
  return { ownedJob: activeJob + 1, interrupt: true };
}

/**
 * Chase aims at the road surface the tires use. Driver aims just above it.
 * `heldMeters` is the last altitude the map was already using when no ground
 * sample has arrived yet.
 */
export function cameraLookAltitude(
  view: CameraView,
  groundMeters: number | null,
  heldMeters: number,
  lookOnRoad: boolean,
): number {
  const surface = groundMeters ?? heldMeters;
  if (view === "driver") {
    return surface + (lookOnRoad ? 0.35 : DRIVER_LOOK_ABOVE_GROUND_METERS);
  }
  return surface;
}

/** Ease camera altitude. A late elevation sample must not jump the view. */
export function smoothAltitude(
  current: number,
  target: number,
  dtSeconds: number,
  responsePerSecond = 2.2,
): number {
  if (!Number.isFinite(target)) {
    return Number.isFinite(current) ? current : 0;
  }
  if (!Number.isFinite(current)) {
    return target;
  }
  const blend = 1 - Math.exp(-responsePerSecond * Math.max(0, dtSeconds));
  return current + (target - current) * blend;
}

/** The chase pose a driving game would cut to: behind the car, offset to one side. */
export function settledChase(
  car: RoadPoint & { headingDegrees: number },
  tune?: ChaseTune,
): FollowCamera {
  const profile = cameraProfile("chase", tune);
  const target = viewTarget(car, profile);
  return {
    lat: target.lat,
    lng: target.lng,
    headingDegrees: car.headingDegrees,
    rangeMeters: profile.rangeMeters,
    tiltDegrees: profile.tiltDegrees,
  };
}

export function followCameraFromView(view: FollowView, car: RoadPoint & { headingDegrees: number }): FollowCamera {
  return {
    lat: typeof view.center?.lat === "number" ? view.center.lat : car.lat,
    lng: typeof view.center?.lng === "number" ? view.center.lng : car.lng,
    headingDegrees: typeof view.heading === "number" ? view.heading : car.headingDegrees,
    rangeMeters: typeof view.range === "number" ? view.range : FOLLOW_RANGE_METERS,
    tiltDegrees: typeof view.tilt === "number" ? view.tilt : FOLLOW_TILT_DEGREES,
  };
}

function viewTarget(car: RoadPoint & { headingDegrees: number }, profile: CameraProfile): RoadPoint {
  const ahead = lookAhead(car, car.headingDegrees, profile.lookaheadMeters);
  if (profile.leftMeters === 0) {
    return ahead;
  }
  return lookAhead(ahead, car.headingDegrees - 90, profile.leftMeters);
}

export function followCameraStep(
  previous: FollowCamera,
  car: RoadPoint & { headingDegrees: number },
  dtSeconds: number,
  view: CameraView = "chase",
  tune?: ChaseTune,
): FollowCamera {
  const profile = cameraProfile(view, tune);
  const yawCap = view === "driver" ? DRIVER_YAW_DEGREES_PER_SECOND : CAMERA_YAW_DEGREES_PER_SECOND;
  const headingDegrees = turnToward(previous.headingDegrees, car.headingDegrees, dtSeconds, yawCap);
  const aim = view === "driver" ? { ...car, headingDegrees } : car;
  const target = viewTarget(aim, profile);
  const blended = {
    lat: blend(previous.lat, target.lat, dtSeconds, profile.responsePerSecond),
    lng: blend(previous.lng, target.lng, dtSeconds, profile.responsePerSecond),
  };
  const speedCap = view === "driver" ? DRIVER_MAX_METERS_PER_SECOND : MAX_NEAR_METERS_PER_SECOND;
  const center =
    distanceMeters(previous, car) < NEAR_CAMERA_METERS
      ? moveToward(previous, blended, speedCap * Math.max(0, dtSeconds))
      : blended;
  return {
    lat: center.lat,
    lng: center.lng,
    headingDegrees,
    rangeMeters: blend(previous.rangeMeters, profile.rangeMeters, dtSeconds, profile.responsePerSecond),
    tiltDegrees: blend(previous.tiltDegrees, profile.tiltDegrees, dtSeconds, profile.responsePerSecond),
  };
}
