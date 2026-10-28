import {
  ROAD_AREA_RADIUS_METERS,
  distanceMeters,
  type OneWay,
  type RoadPoint,
  type RoadSegment,
} from "./drivingRoads";

export const PREFETCH_MARGIN_METERS = 200;
export const PREFETCH_AHEAD_METERS = 400;
export const MAX_COVERAGE_AREAS = 8;
export const EXTEND_LOADING_MESSAGE = "Hämtar nästa vägavsnitt…";
export const EXTEND_FAILED_SUFFIX = "Vägen framåt kunde inte hämtas.";
export const EXTEND_EMPTY_MESSAGE = "Inga körbara vägar hittades framåt.";

export type CoverageCircle = {
  center: RoadPoint;
  radiusMeters: number;
};

type Chain = {
  id: string;
  osmWayId: string;
  name: string | null;
  highway: string;
  oneway: OneWay;
  coordinates: RoadPoint[];
  nodeIds: string[];
  widthMeters: number | null;
  lanes: number | null;
};

export function coverageMargin(point: RoadPoint, areas: readonly CoverageCircle[]): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const area of areas) {
    best = Math.max(best, area.radiusMeters - distanceMeters(point, area.center));
  }
  return best;
}

export function isNearCoverage(point: RoadPoint, areas: readonly CoverageCircle[]): boolean {
  const outsideLimit = PREFETCH_AHEAD_METERS + PREFETCH_MARGIN_METERS;
  return areas.some((area) => distanceMeters(point, area.center) <= area.radiusMeters + outsideLimit);
}

export function shouldPrefetch(point: RoadPoint, areas: readonly CoverageCircle[]): boolean {
  if (!isNearCoverage(point, areas)) {
    return false;
  }
  return coverageMargin(point, areas) < PREFETCH_MARGIN_METERS;
}

export function prefetchCenter(
  position: RoadPoint,
  headingDegrees: number,
  aheadMeters = PREFETCH_AHEAD_METERS,
): RoadPoint {
  const distance = Math.max(0, Math.min(aheadMeters, ROAD_AREA_RADIUS_METERS));
  const heading = (headingDegrees * Math.PI) / 180;
  const lat = position.lat + (distance * Math.cos(heading)) / 111320;
  const cosine = Math.cos((position.lat * Math.PI) / 180);
  const lng = position.lng + (distance * Math.sin(heading)) / (111320 * Math.max(0.2, cosine));
  return { lat, lng };
}

export function pruneCoverage<T extends { center: RoadPoint }>(
  areas: readonly T[],
  focus: RoadPoint,
  maxAreas = MAX_COVERAGE_AREAS,
): T[] {
  if (areas.length <= maxAreas) {
    return [...areas];
  }
  return [...areas]
    .sort((left, right) => distanceMeters(left.center, focus) - distanceMeters(right.center, focus))
    .slice(0, maxAreas);
}

function tryStitch(base: Chain, extra: Chain): Chain | null {
  if (base.osmWayId !== extra.osmWayId || base.oneway !== extra.oneway) {
    return null;
  }
  const at = base.nodeIds.indexOf(extra.nodeIds[0] ?? "");
  if (at < 0) {
    return null;
  }
  const overlap = Math.min(base.nodeIds.length - at, extra.nodeIds.length);
  for (let index = 0; index < overlap; index += 1) {
    if (base.nodeIds[at + index] !== extra.nodeIds[index]) {
      return null;
    }
  }
  return {
    ...base,
    name: base.name ?? extra.name,
    widthMeters: base.widthMeters ?? extra.widthMeters,
    lanes: base.lanes ?? extra.lanes,
    nodeIds: [...base.nodeIds, ...extra.nodeIds.slice(overlap)],
    coordinates: [...base.coordinates, ...extra.coordinates.slice(overlap)],
  };
}

function stitchGroup(chains: Chain[]): Chain[] {
  let pool = [...chains];
  let changed = true;
  while (changed) {
    changed = false;
    for (let left = 0; left < pool.length && !changed; left += 1) {
      for (let right = 0; right < pool.length; right += 1) {
        const base = pool[left];
        const extra = pool[right];
        if (!base || !extra || left === right) {
          continue;
        }
        const stitched = tryStitch(base, extra) ?? tryStitch(extra, base);
        if (!stitched) {
          continue;
        }
        pool = pool.filter((_, index) => index !== left && index !== right);
        pool.push(stitched);
        changed = true;
        break;
      }
    }
  }
  return pool;
}

export function mergeRoadSegments(roads: readonly RoadSegment[]): RoadSegment[] {
  const unlinked: RoadSegment[] = [];
  const byWay = new Map<string, Chain[]>();
  const seenUnlinked = new Set<string>();
  for (const road of roads) {
    if (!road.nodeIds || road.nodeIds.length !== road.coordinates.length || road.nodeIds.length < 2) {
      if (!seenUnlinked.has(road.id)) {
        seenUnlinked.add(road.id);
        unlinked.push(road);
      }
      continue;
    }
    const chain: Chain = {
      ...road,
      nodeIds: road.nodeIds,
      widthMeters: road.widthMeters ?? null,
      lanes: road.lanes ?? null,
    };
    const group = byWay.get(road.osmWayId) ?? [];
    group.push(chain);
    byWay.set(road.osmWayId, group);
  }

  const merged: RoadSegment[] = [];
  for (const [osmWayId, chains] of byWay) {
    const stitched = stitchGroup(chains);
    stitched.forEach((chain, index) => {
      merged.push({
        ...chain,
        id: stitched.length === 1 ? osmWayId : `${osmWayId}:${index}`,
        osmWayId,
      });
    });
  }
  return [...merged, ...unlinked];
}

export function extendFailureMessage(message: string): string {
  return `${message} ${EXTEND_FAILED_SUFFIX}`;
}
