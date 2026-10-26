import { turnToward } from "../drive/drive";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";

export const FOLLOW_RANGE_METERS = 160;
export const FOLLOW_TILT_DEGREES = 58;
export const CAMERA_LOOKAHEAD_METERS = 6;
export const CAMERA_YAW_DEGREES_PER_SECOND = 90;
const CAMERA_RESPONSE_PER_SECOND = 6;
const NEAR_CAMERA_METERS = 40;
const MAX_NEAR_METERS_PER_SECOND = 24;

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

function blend(current: number, target: number, dtSeconds: number): number {
  const gain = 1 - Math.exp(-CAMERA_RESPONSE_PER_SECOND * Math.max(0, dtSeconds));
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

export function followCameraStep(
  previous: FollowCamera,
  car: RoadPoint & { headingDegrees: number },
  dtSeconds: number,
): FollowCamera {
  const target = lookAhead(car, car.headingDegrees, CAMERA_LOOKAHEAD_METERS);
  const blended = {
    lat: blend(previous.lat, target.lat, dtSeconds),
    lng: blend(previous.lng, target.lng, dtSeconds),
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
    rangeMeters: blend(previous.rangeMeters, FOLLOW_RANGE_METERS, dtSeconds),
    tiltDegrees: blend(previous.tiltDegrees, FOLLOW_TILT_DEGREES, dtSeconds),
  };
}
