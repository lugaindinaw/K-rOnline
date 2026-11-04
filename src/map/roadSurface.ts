import { distanceMeters, highwayClass, type RoadPoint, type RoadSegment } from "../roads/drivingRoads";

/**
 * Painted width for the picture. A measured OSM width is used as given.
 * A lanes=1 tag does not shrink the street below the class estimate: some
 * city squares are tagged that way and are not one-car alleys. This width is
 * the drawing, not the wider play corridor the car is allowed to use.
 */
const VISUAL_METERS_BY_CLASS: Record<string, number> = {
  motorway: 11,
  trunk: 9,
  primary: 8,
  secondary: 7,
  tertiary: 6.5,
  unclassified: 6.2,
  residential: 5.8,
  living_street: 5,
};

const SIDEWALK_METERS = 1.35;
const MARKING_HALF_METERS = 0.07;
export const SURFACE_ROAD_LIMIT = 140;

export type SurfaceKind = "sidewalk" | "asphalt" | "marking";

export type RoadSurface = {
  roadId: string;
  kind: SurfaceKind;
  path: RoadPoint[];
  fillColor: string;
  zIndex: number;
};

export function visualCarriagewayMeters(edge: {
  widthMeters?: number | null;
  lanes?: number | null;
  highway?: string | null;
}): number {
  const width = edge.widthMeters;
  if (typeof width === "number" && width >= 2.4 && width <= 30) {
    return width;
  }
  const estimate = VISUAL_METERS_BY_CLASS[highwayClass(edge.highway ?? "")] ?? VISUAL_METERS_BY_CLASS.residential ?? 5.8;
  const lanes = edge.lanes;
  if (typeof lanes === "number" && lanes >= 2 && lanes <= 6) {
    return Math.max(estimate, lanes * 3.15);
  }
  return estimate;
}

function offsetPoint(point: RoadPoint, headingDegrees: number, meters: number): RoadPoint {
  const heading = (headingDegrees * Math.PI) / 180;
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return {
    lat: point.lat + (meters * Math.cos(heading)) / 111320,
    lng: point.lng + (meters * Math.sin(heading)) / (111320 * Math.max(0.2, cosine)),
  };
}

function bearing(from: RoadPoint, to: RoadPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A closed ring around a centerline. Left side out, right side back. */
export function carriagewayRing(coordinates: readonly RoadPoint[], halfMeters: number): RoadPoint[] | null {
  if (coordinates.length < 2 || !Number.isFinite(halfMeters) || halfMeters < 0.04) {
    return null;
  }
  const left: RoadPoint[] = [];
  const right: RoadPoint[] = [];
  for (let index = 0; index < coordinates.length; index += 1) {
    const point = coordinates[index];
    const before = coordinates[Math.max(0, index - 1)];
    const after = coordinates[Math.min(coordinates.length - 1, index + 1)];
    if (!point || !before || !after || distanceMeters(before, after) < 0.05) {
      continue;
    }
    const heading = bearing(before, after);
    left.push(offsetPoint(point, heading - 90, halfMeters));
    right.push(offsetPoint(point, heading + 90, halfMeters));
  }
  if (left.length < 2 || right.length < 2) {
    return null;
  }
  return [...left, ...right.reverse()];
}

function shiftedCenterline(coordinates: readonly RoadPoint[], sideMeters: number): RoadPoint[] {
  const shifted: RoadPoint[] = [];
  for (let index = 0; index < coordinates.length; index += 1) {
    const point = coordinates[index];
    const before = coordinates[Math.max(0, index - 1)];
    const after = coordinates[Math.min(coordinates.length - 1, index + 1)];
    if (!point || !before || !after || distanceMeters(before, after) < 0.05) {
      continue;
    }
    shifted.push(offsetPoint(point, bearing(before, after) - 90, sideMeters));
  }
  return shifted;
}

export function selectSurfaceRoads(roads: readonly RoadSegment[], anchor: RoadPoint | null, limit = SURFACE_ROAD_LIMIT): RoadSegment[] {
  const ranked = roads.filter((road) => road.coordinates.length >= 2);
  if (!anchor) {
    return ranked.slice(0, limit);
  }
  return ranked
    .map((road) => {
      const mid = road.coordinates[Math.floor(road.coordinates.length / 2)] ?? road.coordinates[0]!;
      return { road, gap: distanceMeters(anchor, mid) };
    })
    .sort((left, right) => left.gap - right.gap || left.road.id.localeCompare(right.road.id))
    .slice(0, limit)
    .map((item) => item.road);
}

export function roadSurfaces(roads: readonly RoadSegment[], anchor: RoadPoint | null = null): RoadSurface[] {
  const surfaces: RoadSurface[] = [];
  for (const road of selectSurfaceRoads(roads, anchor)) {
    const width = visualCarriagewayMeters(road);
    const half = width / 2;
    const sidewalk = carriagewayRing(road.coordinates, half + SIDEWALK_METERS);
    const asphalt = carriagewayRing(road.coordinates, half);
    if (sidewalk) {
      surfaces.push({ roadId: road.id, kind: "sidewalk", path: sidewalk, fillColor: "#c8c2b6", zIndex: 1 });
    }
    if (asphalt) {
      surfaces.push({ roadId: road.id, kind: "asphalt", path: asphalt, fillColor: "#3e4246", zIndex: 2 });
    }
    const edgeInset = half - 0.28;
    if (edgeInset > 0.4) {
      for (const side of [edgeInset, -edgeInset]) {
        const marking = carriagewayRing(shiftedCenterline(road.coordinates, side), MARKING_HALF_METERS);
        if (marking) {
          surfaces.push({ roadId: road.id, kind: "marking", path: marking, fillColor: "#f4f1ea", zIndex: 4 });
        }
      }
    }
    if (road.oneway === "both" && width >= 5.6) {
      const center = carriagewayRing(road.coordinates, MARKING_HALF_METERS);
      if (center) {
        surfaces.push({ roadId: road.id, kind: "marking", path: center, fillColor: "#f4f1ea", zIndex: 4 });
      }
    }
  }
  return surfaces;
}

export type SurfacePolygon = {
  path?: Array<{ lat: number; lng: number }>;
  remove: () => void;
};

export function mountRoadSurfaces(
  parent: { append: (child: SurfacePolygon & HTMLElement) => void },
  Polygon: new (options: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    altitudeMode: "CLAMP_TO_GROUND";
    drawsOccludedSegments: boolean;
    geodesic: boolean;
    zIndex: number;
  }) => SurfacePolygon & HTMLElement,
  surfaces: readonly RoadSurface[],
): SurfacePolygon[] {
  const mounted: SurfacePolygon[] = [];
  for (const surface of surfaces) {
    const polygon = new Polygon({
      fillColor: surface.fillColor,
      strokeColor: surface.fillColor,
      strokeWidth: 1,
      altitudeMode: "CLAMP_TO_GROUND",
      drawsOccludedSegments: true,
      geodesic: true,
      zIndex: surface.zIndex,
    });
    polygon.path = surface.path;
    parent.append(polygon);
    mounted.push(polygon);
  }
  return mounted;
}
