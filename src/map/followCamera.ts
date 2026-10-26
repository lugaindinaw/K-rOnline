import { turnToward } from "../drive/drive";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";

export type CameraView = "chase" | "driver";

/**
 * Look a short distance ahead and stay far enough back that the whole car
 * sits in the lower part of the frame instead of under the camera.
 */
export const CHASE_RANGE_METERS = 26;
export const CHASE_TILT_DEGREES = 58;
export const CHASE_LOOKAHEAD_METERS = 8;
export const FOLLOW_RANGE_METERS = CHASE_RANGE_METERS;
export const FOLLOW_TILT_DEGREES = CHASE_TILT_DEGREES;
export const CAMERA_LOOKAHEAD_METERS = CHASE_LOOKAHEAD_METERS;
/** Eye point just above the hood, ahead of the solid cabin. The model has no interior. */
export const DRIVER_EYE_HEIGHT_METERS = 1.35;
export const DRIVER_LOOKAHEAD_METERS = 22;
export const DRIVER_FORWARD_METERS = 1.4;
export const DRIVER_LEFT_METERS = 0.32;
export const CAMERA_YAW_DEGREES_PER_SECOND = 110;
const CHASE_RESPONSE_PER_SECOND = 8;
const DRIVER_RESPONSE_PER_SECOND = 12;
const NEAR_CAMERA_METERS = 48;
const MAX_NEAR_METERS_PER_SECOND = 30;

export type CameraProfile = {
  rangeMeters: number;
  tiltDegrees: number;
  lookaheadMeters: number;
  leftMeters: number;
  responsePerSecond: number;
};

export function cameraProfile(view: CameraView): CameraProfile {
  if (view === "driver") {
    const back = DRIVER_LOOKAHEAD_METERS - DRIVER_FORWARD_METERS;
    return {
      rangeMeters: Math.hypot(back, DRIVER_EYE_HEIGHT_METERS),
      tiltDegrees: (Math.atan2(back, DRIVER_EYE_HEIGHT_METERS) * 180) / Math.PI,
      lookaheadMeters: DRIVER_LOOKAHEAD_METERS,
      leftMeters: DRIVER_LEFT_METERS,
      responsePerSecond: DRIVER_RESPONSE_PER_SECOND,
    };
  }
  return {
    rangeMeters: CHASE_RANGE_METERS,
    tiltDegrees: CHASE_TILT_DEGREES,
    lookaheadMeters: CHASE_LOOKAHEAD_METERS,
    leftMeters: 0,
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

export function claimCameraJob(ownedJob: number, activeJob: number): { ownedJob: number; interrupt: boolean } {
  if (ownedJob === activeJob) {
    return { ownedJob, interrupt: false };
  }
  return { ownedJob: activeJob + 1, interrupt: true };
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
): FollowCamera {
  const profile = cameraProfile(view);
  const target = viewTarget(car, profile);
  const blended = {
    lat: blend(previous.lat, target.lat, dtSeconds, profile.responsePerSecond),
    lng: blend(previous.lng, target.lng, dtSeconds, profile.responsePerSecond),
  };
  const center =
    distanceMeters(previous, car) < NEAR_CAMERA_METERS
      ? moveToward(previous, blended, MAX_NEAR_METERS_PER_SECOND * Math.max(0, dtSeconds))
      : blended;
  return {
    lat: center.lat,
    lng: center.lng,
    headingDegrees: turnToward(
      previous.headingDegrees,
      car.headingDegrees,
      dtSeconds,
      CAMERA_YAW_DEGREES_PER_SECOND,
    ),
    rangeMeters: blend(previous.rangeMeters, profile.rangeMeters, dtSeconds, profile.responsePerSecond),
    tiltDegrees: blend(previous.tiltDegrees, profile.tiltDegrees, dtSeconds, profile.responsePerSecond),
  };
}
