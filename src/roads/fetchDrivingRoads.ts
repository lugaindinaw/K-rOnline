import { isInSweden } from "../geo/sweden";
import {
  ROAD_AREA_RADIUS_METERS,
  buildDrivingRoadQuery,
  capRoads,
  clampRoadRadius,
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
const completed = new Map<string, RoadLoadResult>();

export function roadRequestKey(center: RoadPoint, radiusMeters = ROAD_AREA_RADIUS_METERS): string {
  return `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${clampRoadRadius(radiusMeters)}`;
}

export function clearRoadCache(): void {
  inflight.clear();
  completed.clear();
}

export type RoadLoadResult =
  | { ok: true; area: RoadArea }
  | { ok: false; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function linkKey(ids?: ReadonlySet<string>): string {
  if (!ids || ids.size === 0) {
    return "";
  }
  let hash = 0;
  for (const id of ids) {
    let item = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
      item ^= id.charCodeAt(index);
      item = Math.imul(item, 16777619);
    }
    hash ^= item;
  }
  return `|${ids.size}:${hash >>> 0}`;
}

async function requestRoads(
  center: RoadPoint,
  radiusMeters: number,
  fetchImpl: FetchLike,
  endpoints: readonly string[],
  linkedNodeIds?: ReadonlySet<string>,
  endpointNodeIds?: ReadonlySet<string>,
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
      const capped = capRoads(inSweden, undefined, linkedNodeIds, endpointNodeIds);
      const connecting = capped.omitted.filter((road) => road.reason === "sömgräns");
      if (connecting.length > 0) {
        const sample = connecting
          .slice(0, 8)
          .map((road) => `${road.id} ${road.name ?? "utan namn"} noder ${road.nodeIds.slice(0, 4).join(",")}`)
          .join("; ");
        console.info(
          `[koronline] ${connecting.length} anslutande vägsträckor valdes bort av sömgränsen: ${sample}`,
        );
      }
      return {
        ok: true,
        area: {
          center,
          radiusMeters,
          roads: capped.roads,
          matched: inSweden.length,
          truncated: capped.truncated,
          omitted: capped.omitted,
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
    /** Nodes already on the map. A dropped way that meets one of them stays. */
    linkedNodeIds?: ReadonlySet<string>;
    /** Loose ends already on the map. A way that continues one of them is kept first. */
    endpointNodeIds?: ReadonlySet<string>;
  },
): Promise<RoadLoadResult> {
  const radiusMeters = options?.radiusMeters ?? ROAD_AREA_RADIUS_METERS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const endpoints = options?.endpoints ?? OVERPASS_ENDPOINTS;
  const key = `${roadRequestKey(center, radiusMeters)}|${endpoints.join("|")}${linkKey(options?.linkedNodeIds)}${linkKey(options?.endpointNodeIds)}`;
  const cached = completed.get(key);
  if (cached?.ok) {
    return Promise.resolve(cached);
  }
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const promise = requestRoads(
    center,
    radiusMeters,
    fetchImpl,
    endpoints,
    options?.linkedNodeIds,
    options?.endpointNodeIds,
  )
    .then((result) => {
      if (result.ok) {
        completed.set(key, result);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
