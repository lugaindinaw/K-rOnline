import { chaseCameraPosition, type FollowCamera } from "./followCamera";

/** Local ENU metres relative to a look point. +X east, +Y up, −Z north. */
export type EnuMeters = { x: number; y: number; z: number };

export type ChaseScenePose = {
  lookLat: number;
  lookLng: number;
  lookAltitude: number;
  carLat: number;
  carLng: number;
  headingDegrees: number;
  rangeMeters: number;
  tiltDegrees: number;
  fovDegrees: number;
  steer: number;
  speedKmh: number;
  pitchDegrees: number;
  rollDegrees: number;
};

/**
 * Convert a geographic offset into metres in a Three.js-friendly ENU frame
 * where −Z is north so a heading of 0° faces away from the camera along −Z.
 */
export function enuOffsetMeters(
  from: { lat: number; lng: number; altitude?: number },
  to: { lat: number; lng: number; altitude?: number },
): EnuMeters {
  const cosine = Math.cos((from.lat * Math.PI) / 180);
  const north = (to.lat - from.lat) * 111320;
  const east = (to.lng - from.lng) * 111320 * Math.max(0.2, cosine);
  const up = (to.altitude ?? 0) - (from.altitude ?? 0);
  return { x: east, y: up, z: -north };
}

/**
 * Grab3D's authored +Z is forward. In our ENU frame north is −Z, so a
 * north-facing car needs a half-turn before heading is applied.
 */
export function carYawRadians(headingDegrees: number): number {
  return Math.PI - (headingDegrees * Math.PI) / 180;
}

/** Front-wheel steer angle in radians for the visible mesh. */
export function frontWheelSteerRadians(steer: number): number {
  const clamped = Math.min(1, Math.max(-1, Number.isFinite(steer) ? steer : 0));
  return -clamped * 0.55;
}

/** Wheel spin for the distance travelled this frame. Tire radius ≈ 0.35 m. */
export function wheelSpinRadians(speedKmh: number, dtSeconds: number, radiusMeters = 0.35): number {
  const speed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) / 3.6 : 0;
  const dt = Number.isFinite(dtSeconds) ? Math.min(Math.max(dtSeconds, 0), 0.1) : 0;
  return (speed * dt) / Math.max(0.05, radiusMeters);
}

/** Three.js camera pose that matches Maps center/range/tilt for the chase. */
export function chaseSceneCamera(pose: ChaseScenePose): {
  camera: EnuMeters;
  look: EnuMeters;
  fovDegrees: number;
  car: EnuMeters;
  yawRadians: number;
} {
  const follow: FollowCamera = {
    lat: pose.lookLat,
    lng: pose.lookLng,
    headingDegrees: pose.headingDegrees,
    rangeMeters: pose.rangeMeters,
    tiltDegrees: pose.tiltDegrees,
  };
  const absolute = chaseCameraPosition(follow, pose.lookAltitude);
  const camera = enuOffsetMeters(
    { lat: pose.lookLat, lng: pose.lookLng, altitude: pose.lookAltitude },
    { lat: absolute.lat, lng: absolute.lng, altitude: absolute.altitude },
  );
  const car = enuOffsetMeters(
    { lat: pose.lookLat, lng: pose.lookLng, altitude: pose.lookAltitude },
    { lat: pose.carLat, lng: pose.carLng, altitude: pose.lookAltitude },
  );
  return {
    camera,
    look: { x: 0, y: 0, z: 0 },
    fovDegrees: pose.fovDegrees,
    car,
    yawRadians: carYawRadians(pose.headingDegrees),
  };
}
