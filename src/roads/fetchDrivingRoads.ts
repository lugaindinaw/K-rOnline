import { isInSweden } from "../geo/sweden";
import {
  ROAD_AREA_RADIUS_METERS,
  buildDrivingRoadQuery,
  capRoads,
  parseOverpassRoads,
  roadsInside,
  sliceRoadsNear,
  type RoadArea,
  type RoadPoint,
} from "./drivingRoads";

export const OVERPASS_ENDPOINTS = [
  "/osm/overpass",
  "https://overpass-api.de/api/interpreter",
];

const RETRYABLE_STATUS = new Set([406, 429, 502, 503, 504]);
const inflight = new Map<string, Promise<RoadLoadResult>>();

export type RoadLoadResult =
  | { ok: true; area: RoadArea }
  | { ok: false; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function cacheKey(center: RoadPoint, radiusMeters: number): string {
  return `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${radiusMeters}`;
}

async function requestRoads(
  center: RoadPoint,
  radiusMeters: number,
  fetchImpl: FetchLike,
  endpoints: readonly string[],
): Promise<RoadLoadResult> {
  if (!isInSweden(center.lat, center.lng)) {
    return { ok: false, message: "Punkten ligger utanför Sverige." };
  }

  const query = buildDrivingRoadQuery(center, radiusMeters);
  const body = new URLSearchParams({ data: query });
  for (const endpoint of endpoints) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        signal: AbortSignal.timeout(42000),
      });
      if (RETRYABLE_STATUS.has(response.status)) {
        continue;
      }
      if (!response.ok) {
        return { ok: false, message: "Vägdata kunde inte hämtas för det här området." };
      }
      const payload: unknown = await response.json();
      const remark =
        typeof payload === "object" && payload !== null && "remark" in payload
          ? String((payload as { remark?: unknown }).remark ?? "")
          : "";
      const parsed = parseOverpassRoads(payload);
      if (remark.toLowerCase().includes("error") && parsed.length === 0) {
        continue;
      }
      const nearby = sliceRoadsNear(parsed, center, radiusMeters);
      const inSweden = roadsInside(nearby, (point) => isInSweden(point.lat, point.lng));
      const capped = capRoads(inSweden);
      return {
        ok: true,
        area: {
          center,
          radiusMeters,
          roads: capped.roads,
          matched: inSweden.length,
          truncated: capped.truncated,
          source: "openstreetmap",
        },
      };
    } catch {
      continue;
    }
  }

  return { ok: false, message: "Vägtjänsten är upptagen. Försök igen om en stund." };
}

export function fetchDrivingRoads(
  center: RoadPoint,
  options?: {
    fetchImpl?: FetchLike;
    radiusMeters?: number;
    endpoints?: readonly string[];
  },
): Promise<RoadLoadResult> {
  const radiusMeters = options?.radiusMeters ?? ROAD_AREA_RADIUS_METERS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const endpoints = options?.endpoints ?? OVERPASS_ENDPOINTS;
  const key = `${cacheKey(center, radiusMeters)}|${endpoints.join("|")}`;
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const promise = requestRoads(center, radiusMeters, fetchImpl, endpoints).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
