import { ACCEL_MPS2, BRAKE_MPS2, COAST_MPS2, MAX_SPEED_MPS, type DriveInput } from "./drive";
import { gearMotion, gearOf } from "./gears";

/** How fast the front wheels catch the key. Full lock takes about half a second. */
export const STEER_RESPONSE_PER_SECOND = 5.5;
/** How fast the gas and brake force may change, in m/s³. */
export const LONGITUDINAL_JERK_MPS3 = 18;
/** Sideways acceleration a passenger car can hold through a bend, in m/s². */
export const MAX_LATERAL_ACCEL_MPS2 = 5.5;
export const BODY_PITCH_MAX_DEGREES = 1.6;
export const BODY_ROLL_MAX_DEGREES = 2.4;

export type BodyAttitude = {
  /** Positive lifts the nose under power. */
  pitchDegrees: number;
  /** Positive rolls into a right turn. */
  rollDegrees: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function finiteDt(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return 0;
  }
  return Math.min(0.25, dtSeconds);
}

/**
 * Full lock only fits at low speed. Above walking pace the steer angle is
 * reduced so the turn stays inside a passenger car's sideways grip.
 */
export function gripLimitedSteerDegrees(
  speedMps: number,
  steerDegrees: number,
  wheelbaseMeters: number,
  grip = 1,
): number {
  if (!Number.isFinite(steerDegrees) || steerDegrees === 0) {
    return 0;
  }
  const speed = Math.max(0, Number.isFinite(speedMps) ? speedMps : 0);
  const wheelbase = Math.max(0.5, Number.isFinite(wheelbaseMeters) ? wheelbaseMeters : 0.5);
  if (speed < 1) {
    return steerDegrees;
  }
  const hold = clamp(Number.isFinite(grip) ? grip : 1, 0.2, 1);
  const maxTan = (MAX_LATERAL_ACCEL_MPS2 * hold * wheelbase) / (speed * speed);
  const maxAngle = (Math.atan(Math.max(0, maxTan)) * 180) / Math.PI;
  return clamp(steerDegrees, -maxAngle, maxAngle);
}

export function clampSteer(steer: number): number {
  return clamp(steer, -1, 1);
}

/** The steered wheels ease toward the keys. One frame never snaps to full lock. */
export function easeSteer(current: number, target: number, dtSeconds: number): number {
  const from = clampSteer(current);
  const to = clampSteer(target);
  const dt = finiteDt(dtSeconds);
  if (dt === 0) {
    return from;
  }
  const gain = 1 - Math.exp(-STEER_RESPONSE_PER_SECOND * dt);
  return from + (to - from) * gain;
}

export function targetAccelMps2(input: DriveInput): number {
  const motion = gearMotion(input.gear);
  if (gearOf(input.gear) === "P") {
    return -BRAKE_MPS2 * 0.6;
  }
  if (input.brake) {
    return -BRAKE_MPS2 * brakeScaleOf(input.brakeScale);
  }
  if (input.accelerate && motion.powered) {
    return ACCEL_MPS2 * motion.accelScale;
  }
  return -COAST_MPS2;
}

function brakeScaleOf(scale: number | undefined): number {
  if (scale == null || !Number.isFinite(scale)) {
    return 1;
  }
  return clamp(scale, 0.2, 1);
}

/** Gas and brake build up. A stopped car does not keep a stored brake force. */
export function easeAccel(current: number, input: DriveInput, dtSeconds: number, speedMps: number): number {
  const from = Number.isFinite(current) ? current : 0;
  const dt = finiteDt(dtSeconds);
  if (dt === 0) {
    return from;
  }
  const target = targetAccelMps2(input);
  const maxDelta = LONGITUDINAL_JERK_MPS3 * dt;
  const next = from + clamp(target - from, -maxDelta, maxDelta);
  const speed = Math.max(0, Number.isFinite(speedMps) ? speedMps : 0);
  if (speed <= 0 && next < 0 && !input.brake) {
    return 0;
  }
  return next;
}

export function speedAfterAccel(
  speedMps: number,
  accelMps2: number,
  dtSeconds: number,
  capMps = MAX_SPEED_MPS,
): number {
  const speed = Math.max(0, Number.isFinite(speedMps) ? speedMps : 0);
  const dt = finiteDt(dtSeconds);
  const accel = Number.isFinite(accelMps2) ? accelMps2 : 0;
  const cap = Number.isFinite(capMps) && capMps > 0 ? capMps : MAX_SPEED_MPS;
  return clamp(speed + accel * dt, 0, cap);
}

/**
 * A small pitch and roll for the body. The amounts stay under a few degrees
 * so the cabin moves without shifting the driver's eye height.
 */
export function bodyAttitude(accelMps2: number, steer: number, speedMps: number): BodyAttitude {
  const accel = Number.isFinite(accelMps2) ? accelMps2 : 0;
  const pitch = clamp(accel / ACCEL_MPS2, -1.15, 1) * BODY_PITCH_MAX_DEGREES;
  const pace = clamp(Math.max(0, speedMps) / 5, 0, 1);
  const roll = clampSteer(steer) * BODY_ROLL_MAX_DEGREES * pace;
  return { pitchDegrees: pitch, rollDegrees: roll };
}

/** Whole kilometres per hour, matching the number on the speedometer. */
export function displayedSpeedKmh(speedMps: number): number {
  if (!Number.isFinite(speedMps) || speedMps <= 0) {
    return 0;
  }
  return Math.round(Math.min(160, speedMps) * 3.6);
}
