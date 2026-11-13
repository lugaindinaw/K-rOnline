import type { RoadPoint } from "../roads/drivingRoads";

/** Grab3D wheel radius. The mesh is centered on the hub and the axle is local X. */
export const WHEEL_RADIUS_METERS = 0.35;
/** Hub height above the tire contact. The body origin is the contact, not the hub. */
export const WHEEL_HUB_HEIGHT_METERS = 0.35;
/** Front-wheel steer at full lock. Matches the slow-speed yaw of the car. */
export const WHEEL_STEER_DEGREES = 28;

export type WheelSpec = {
  name: string;
  /** Meters to the model's right. */
  x: number;
  /** Meters forward of the origin. */
  z: number;
  steers: boolean;
};

/**
 * Hub positions from public/car.glb. Front wheels are the +Z axle.
 * The names in the file put the positive-X wheel on the model's right.
 */
export const CAR_WHEELS: readonly WheelSpec[] = [
  { name: "front-right", x: 0.77, z: 1.382237, steers: true },
  { name: "front-left", x: -0.77, z: 1.382237, steers: true },
  { name: "rear-right", x: 0.77, z: -1.397763, steers: false },
  { name: "rear-left", x: -0.77, z: -1.397763, steers: false },
];

/** Horizontal hub offset. Heading 0 is north and positive heading turns east. */
export function wheelHubOffset(headingDegrees: number, wheel: Pick<WheelSpec, "x" | "z">): { north: number; east: number } {
  const heading = (headingDegrees * Math.PI) / 180;
  return {
    north: wheel.z * Math.cos(heading) - wheel.x * Math.sin(heading),
    east: wheel.z * Math.sin(heading) + wheel.x * Math.cos(heading),
  };
}

export function wheelHubPosition(origin: RoadPoint, headingDegrees: number, wheel: Pick<WheelSpec, "x" | "z">): RoadPoint {
  const offset = wheelHubOffset(headingDegrees, wheel);
  const cosine = Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + offset.north / 111320,
    lng: origin.lng + offset.east / (111320 * Math.max(0.2, cosine)),
  };
}

/**
 * Degrees a tire turns for a distance along the road. Maps has no separate
 * axle channel: roll is the body lean and is applied before the model stands
 * up, so this value is not written to the wheel orientation.
 */
export function wheelSpinDegrees(travelMeters: number, radiusMeters = WHEEL_RADIUS_METERS): number {
  if (!Number.isFinite(travelMeters) || radiusMeters <= 0) {
    return 0;
  }
  return (travelMeters / radiusMeters) * (180 / Math.PI);
}

export function wheelSteerDegrees(steer: number, steers: boolean): number {
  if (!steers || !Number.isFinite(steer)) {
    return 0;
  }
  const locked = Math.min(1, Math.max(-1, steer));
  return locked * WHEEL_STEER_DEGREES;
}
