import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import type { RoadSign, RoadSignKind } from "../roads/roadSigns";

/**
 * Facts a later driving test can read. This is not a score and not a pass
 * or fail. Mirror glances and people on foot or bike are not sensed yet;
 * the fields stay null so the shape is already there.
 */
export type IndicatorState = "off" | "left" | "right";

export type DriveObservation = {
  speedMps: number;
  offsetMeters: number | null;
  /** Meters from the body to the carriageway edge. Negative means the body is outside. */
  edgeClearanceMeters: number | null;
  nearestTrafficMeters: number | null;
  signAhead: RoadSignKind | null;
  signalAhead: boolean;
  indicator: IndicatorState;
  mirrorChecked: null;
  vulnerableRoadUserMeters: null;
};

const AHEAD_METERS = 70;
const AHEAD_DEGREES = 50;
const BODY_HALF_METERS = 0.98;

export type ObservationInput = {
  position: RoadPoint;
  headingDegrees: number;
  speedMps: number;
  offsetMeters?: number | null;
  roadHalfMeters?: number | null;
  traffic?: readonly RoadPoint[];
  signs?: readonly Pick<RoadSign, "kind" | "position">[];
  signals?: readonly RoadPoint[];
  indicator?: IndicatorState;
};

function signedDelta(from: number, to: number): number {
  let delta = ((to - from) % 360 + 360) % 360;
  if (delta > 180) {
    delta -= 360;
  }
  return delta;
}

function bearing(from: RoadPoint, to: RoadPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function nearestAhead(position: RoadPoint, headingDegrees: number, points: readonly RoadPoint[]): number | null {
  let best: number | null = null;
  for (const point of points) {
    const gap = distanceMeters(position, point);
    if (gap > AHEAD_METERS || gap < 0.5) {
      continue;
    }
    if (Math.abs(signedDelta(headingDegrees, bearing(position, point))) > AHEAD_DEGREES) {
      continue;
    }
    if (best == null || gap < best) {
      best = gap;
    }
  }
  return best;
}

export function observeDrive(input: ObservationInput): DriveObservation {
  const speed = Number.isFinite(input.speedMps) ? Math.max(0, input.speedMps) : 0;
  const offset = typeof input.offsetMeters === "number" && Number.isFinite(input.offsetMeters) ? input.offsetMeters : null;
  const half = typeof input.roadHalfMeters === "number" && Number.isFinite(input.roadHalfMeters) ? input.roadHalfMeters : null;
  const signs = input.signs ?? [];
  let signAhead: RoadSignKind | null = null;
  let signGap = Infinity;
  for (const sign of signs) {
    const gap = nearestAhead(input.position, input.headingDegrees, [sign.position]);
    if (gap != null && gap < signGap) {
      signGap = gap;
      signAhead = sign.kind;
    }
  }
  const traffic = (input.traffic ?? [])
    .map((point) => distanceMeters(input.position, point))
    .filter((gap) => gap >= 0.5);
  return {
    speedMps: speed,
    offsetMeters: offset,
    edgeClearanceMeters: offset == null || half == null ? null : half - Math.abs(offset) - BODY_HALF_METERS,
    nearestTrafficMeters: traffic.length === 0 ? null : Math.min(...traffic),
    signAhead,
    signalAhead: nearestAhead(input.position, input.headingDegrees, input.signals ?? []) != null,
    indicator: input.indicator ?? "off",
    mirrorChecked: null,
    vulnerableRoadUserMeters: null,
  };
}
