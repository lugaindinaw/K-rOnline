export const ROAD_AREA_RADIUS_METERS = 600;
export const MIN_ROAD_RADIUS_METERS = 200;
export const MAX_ROAD_RADIUS_METERS = 1500;
export const MAX_ROADS_PER_AREA = 120;

const DRIVING_HIGHWAYS = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
] as const;

const HIGHWAY_PATTERN = DRIVING_HIGHWAYS.join("|");

const HIGHWAY_RANK: Record<string, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 6,
  living_street: 7,
};

const HIGHWAY_LABELS: Record<string, string> = {
  motorway: "motorväg",
  trunk: "stamväg",
  primary: "primärväg",
  secondary: "sekundärväg",
  tertiary: "tertiärväg",
  unclassified: "mindre väg",
  residential: "bostadsgata",
  living_street: "gårdsgata",
};

export type RoadPoint = {
  lat: number;
  lng: number;
};

export type RoadSegment = {
  id: string;
  name: string | null;
  highway: string;
  coordinates: RoadPoint[];
};

export type RoadArea = {
  center: RoadPoint;
  radiusMeters: number;
  roads: RoadSegment[];
  matched: number;
  truncated: boolean;
  source: "openstreetmap";
};

export function clampRoadRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters)) {
    return ROAD_AREA_RADIUS_METERS;
  }
  return Math.min(MAX_ROAD_RADIUS_METERS, Math.max(MIN_ROAD_RADIUS_METERS, Math.round(radiusMeters)));
}

export function buildDrivingRoadQuery(
  center: RoadPoint,
  radiusMeters = ROAD_AREA_RADIUS_METERS,
): string {
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error("Ogiltig koordinat.");
  }
  const radius = clampRoadRadius(radiusMeters);
  const lat = center.lat.toFixed(6);
  const lng = center.lng.toFixed(6);
  return `[out:json][timeout:20];way["highway"~"^(${HIGHWAY_PATTERN})$"](around:${radius},${lat},${lng});out tags geom;`;
}

export function distanceMeters(from: RoadPoint, to: RoadPoint): number {
  const earthRadius = 6371000;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function highwayClass(highway: string): string {
  return highway.endsWith("_link") ? highway.slice(0, -5) : highway;
}

export function highwayRank(highway: string): number {
  return HIGHWAY_RANK[highwayClass(highway)] ?? 8;
}

export function highwayLabel(highway: string): string {
  return HIGHWAY_LABELS[highwayClass(highway)] ?? highwayClass(highway);
}

export function parseOverpassRoads(payload: unknown): RoadSegment[] {
  if (typeof payload !== "object" || payload === null || !("elements" in payload)) {
    return [];
  }
  const elements = payload.elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  const roads: RoadSegment[] = [];
  for (const element of elements) {
    if (typeof element !== "object" || element === null) {
      continue;
    }
    const record = element as {
      type?: unknown;
      id?: unknown;
      tags?: unknown;
      geometry?: unknown;
    };
    if (record.type !== "way" || (typeof record.id !== "number" && typeof record.id !== "string")) {
      continue;
    }
    const tags = record.tags;
    if (typeof tags !== "object" || tags === null) {
      continue;
    }
    const highway = (tags as { highway?: unknown }).highway;
    if (typeof highway !== "string" || !DRIVING_HIGHWAYS.includes(highway as (typeof DRIVING_HIGHWAYS)[number])) {
      continue;
    }
    if (!Array.isArray(record.geometry)) {
      continue;
    }
    const coordinates: RoadPoint[] = [];
    for (const point of record.geometry) {
      if (typeof point !== "object" || point === null) {
        continue;
      }
      const lat = (point as { lat?: unknown }).lat;
      const lon = (point as { lon?: unknown }).lon;
      if (typeof lat !== "number" || typeof lon !== "number") {
        continue;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      coordinates.push({ lat, lng: lon });
    }
    if (coordinates.length < 2) {
      continue;
    }
    const name = (tags as { name?: unknown }).name;
    roads.push({
      id: String(record.id),
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      highway,
      coordinates,
    });
  }
  return roads;
}

export function sliceRoadsNear(
  roads: RoadSegment[],
  center: RoadPoint,
  radiusMeters: number,
): RoadSegment[] {
  const radius = clampRoadRadius(radiusMeters);
  const sliced: RoadSegment[] = [];
  for (const road of roads) {
    let current: RoadPoint[] = [];
    let part = 0;
    const flush = () => {
      if (current.length >= 2) {
        sliced.push({
          ...road,
          id: part === 0 ? road.id : `${road.id}:${part}`,
          coordinates: current,
        });
        part += 1;
      }
      current = [];
    };
    for (const point of road.coordinates) {
      if (distanceMeters(center, point) <= radius) {
        current.push(point);
      } else {
        flush();
      }
    }
    flush();
  }
  return sliced;
}

export function capRoads(
  roads: RoadSegment[],
  maxRoads = MAX_ROADS_PER_AREA,
): { roads: RoadSegment[]; truncated: boolean } {
  if (roads.length <= maxRoads) {
    return { roads, truncated: false };
  }
  const ranked = [...roads].sort(
    (left, right) => highwayRank(left.highway) - highwayRank(right.highway) || left.id.localeCompare(right.id),
  );
  return { roads: ranked.slice(0, maxRoads), truncated: true };
}

export function roadsInside(
  roads: RoadSegment[],
  isInside: (point: RoadPoint) => boolean,
): RoadSegment[] {
  return roads.filter((road) => road.coordinates.some((point) => isInside(point)));
}

export function roadSummary(roads: RoadSegment[]): { names: string[]; unnamed: number } {
  const names: string[] = [];
  const seen = new Set<string>();
  let unnamed = 0;
  for (const road of roads) {
    if (!road.name) {
      unnamed += 1;
      continue;
    }
    if (seen.has(road.name)) {
      continue;
    }
    seen.add(road.name);
    names.push(road.name);
  }
  return { names, unnamed };
}
