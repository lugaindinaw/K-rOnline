import { distanceMeters, type RoadPoint, type RoadSegment, type TrafficSignal } from "../roads/drivingRoads";
import { signalColor } from "../traffic/traffic";

export const SIGNAL_SETBACK_METERS = 7;
export const SIGNAL_RIGHT_METERS = 4;

export type SignalHead = {
  id: string;
  nodeId: string;
  position: RoadPoint;
  facingDegrees: number;
  kind: "signal" | "continuous_green";
};

export function signalLampColor(
  facingDegrees: number,
  timeSeconds: number,
  kind: SignalHead["kind"],
): "red" | "yellow" | "green" {
  if (kind === "continuous_green") {
    return "green";
  }
  return signalColor(facingDegrees, timeSeconds);
}

function bearing(from: RoadPoint, to: RoadPoint): number | null {
  if (distanceMeters(from, to) < 0.5) {
    return null;
  }
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function offset(point: RoadPoint, headingDegrees: number, meters: number): RoadPoint {
  const heading = (headingDegrees * Math.PI) / 180;
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return {
    lat: point.lat + (meters * Math.cos(heading)) / 111320,
    lng: point.lng + (meters * Math.sin(heading)) / (111320 * Math.max(0.2, cosine)),
  };
}

function quadrant(heading: number): number {
  return ((Math.round(heading / 90) % 4) + 4) % 4;
}

function approachAllowed(
  road: RoadSegment,
  travel: "forward" | "backward",
  signal: TrafficSignal,
): boolean {
  if (signal.direction && signal.direction !== travel) {
    return false;
  }
  if (road.oneway === "forward" && travel === "backward") {
    return false;
  }
  if (road.oneway === "backward" && travel === "forward") {
    return false;
  }
  return true;
}

/**
 * One head per approach quadrant. The spot comes from the signal node's own
 * coordinate and the incoming way, so a later road fetch does not slide it.
 * Blinkers and nodes that are not on a fetched way produce no head.
 */
export function placeSignalHeads(
  signals: readonly TrafficSignal[],
  roads: readonly RoadSegment[],
): SignalHead[] {
  const heads: SignalHead[] = [];
  const seen = new Set<string>();
  const ordered = [...signals].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  for (const signal of ordered) {
    if (signal.kind === "other" || seen.has(signal.nodeId)) {
      continue;
    }
    seen.add(signal.nodeId);
    const approaches = new Map<number, { heading: number; roadId: string }>();
    const ways = [...roads].sort((left, right) => left.osmWayId.localeCompare(right.osmWayId));
    for (const road of ways) {
      if (!road.nodeIds || road.nodeIds.length !== road.coordinates.length) {
        continue;
      }
      road.nodeIds.forEach((nodeId, index) => {
        if (nodeId !== signal.nodeId) {
          return;
        }
        const here = road.coordinates[index];
        const previous = road.coordinates[index - 1];
        const next = road.coordinates[index + 1];
        if (here && previous && approachAllowed(road, "forward", signal)) {
          const heading = bearing(previous, here);
          if (heading !== null) {
            const bucket = quadrant(heading);
            const current = approaches.get(bucket);
            if (!current || road.osmWayId.localeCompare(current.roadId) < 0) {
              approaches.set(bucket, { heading, roadId: road.osmWayId });
            }
          }
        }
        if (here && next && approachAllowed(road, "backward", signal)) {
          const heading = bearing(next, here);
          if (heading !== null) {
            const bucket = quadrant(heading);
            const current = approaches.get(bucket);
            if (!current || road.osmWayId.localeCompare(current.roadId) < 0) {
              approaches.set(bucket, { heading, roadId: road.osmWayId });
            }
          }
        }
      });
    }
    for (const [bucket, approach] of approaches) {
      const setback = offset(signal.position, approach.heading + 180, SIGNAL_SETBACK_METERS);
      heads.push({
        id: `${signal.nodeId}:${bucket}`,
        nodeId: signal.nodeId,
        position: offset(setback, approach.heading + 90, SIGNAL_RIGHT_METERS),
        facingDegrees: approach.heading,
        kind: signal.kind === "continuous_green" ? "continuous_green" : "signal",
      });
    }
  }
  return heads.sort((left, right) => left.id.localeCompare(right.id));
}
