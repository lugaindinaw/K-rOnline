export const ROAD_AREA_RADIUS_METERS = 600;
export const MIN_ROAD_RADIUS_METERS = 200;
export const MAX_ROAD_RADIUS_METERS = 1500;
export const MAX_ROADS_PER_AREA = 500;

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

export type OneWay = "forward" | "backward" | "both";

export type RoadSegment = {
  id: string;
  osmWayId: string;
  name: string | null;
  highway: string;
  oneway: OneWay;
  coordinates: RoadPoint[];
  nodeIds: string[] | null;
  /** Carriageway width in meters when the OSM `width` tag is a plain meter value. */
  widthMeters?: number | null;
  /** Lane count from the OSM `lanes` tag. This is not a width. */
  lanes?: number | null;
};

export type OmittedRoad = {
  id: string;
  name: string | null;
  highway: string;
  nodeIds: string[];
  /** `sömgräns` means the way meets the kept network but the extra-road limit was full. */
  reason: "klassgräns" | "sömgräns";
};

export type RoadArea = {
  center: RoadPoint;
  radiusMeters: number;
  roads: RoadSegment[];
  matched: number;
  truncated: boolean;
  /** Ways left out of this area. Connecting ones explain a stop at a shared node. */
  omitted: OmittedRoad[];
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
  return `[out:json][timeout:20];way["highway"~"^(${HIGHWAY_PATTERN})$"](around:${radius},${lat},${lng});out geom;`;
}

function readMeterValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim().toLowerCase().replace(",", ".");
  if (text.includes("ft") || text.includes("feet") || text.includes("'")) {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)(?:\s*m)?$/.exec(text);
  if (!match?.[1]) {
    return null;
  }
  const meters = Number(match[1]);
  return Number.isFinite(meters) ? meters : null;
}

function readLaneCount(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const match = /^(\d+)/.exec(text);
  if (!match?.[1]) {
    return null;
  }
  const lanes = Number(match[1]);
  return Number.isInteger(lanes) ? lanes : null;
}

function readOneWay(value: unknown): OneWay {
  if (value === "yes" || value === "1" || value === "true" || value === true) {
    return "forward";
  }
  if (value === "-1" || value === "reverse") {
    return "backward";
  }
  return "both";
}

export type TrafficControlReport = {
  oneway: OneWay | "unknown";
  stop: "unknown";
  giveWay: "unknown";
  signal: "unknown";
};

const UNKNOWN_CONTROLS: TrafficControlReport = {
  oneway: "unknown",
  stop: "unknown",
  giveWay: "unknown",
  signal: "unknown",
};

export function readTrafficControls(tags: unknown): TrafficControlReport {
  if (typeof tags !== "object" || tags === null) {
    return { ...UNKNOWN_CONTROLS };
  }
  const oneway = (tags as { oneway?: unknown }).oneway;
  if (oneway === "yes" || oneway === "1" || oneway === "true" || oneway === true) {
    return { ...UNKNOWN_CONTROLS, oneway: "forward" };
  }
  if (oneway === "-1" || oneway === "reverse") {
    return { ...UNKNOWN_CONTROLS, oneway: "backward" };
  }
  if (oneway === "no") {
    return { ...UNKNOWN_CONTROLS, oneway: "both" };
  }
  return { ...UNKNOWN_CONTROLS };
}

function readWayGeometry(
  geometry: unknown,
  nodes: unknown,
): { coordinates: RoadPoint[]; nodeIds: string[] | null } | null {
  if (!Array.isArray(geometry)) {
    return null;
  }
  const nodeList = Array.isArray(nodes) && nodes.length === geometry.length ? nodes : null;
  const coordinates: RoadPoint[] = [];
  const nodeIds: string[] = [];
  let linked = nodeList !== null;
  for (let index = 0; index < geometry.length; index += 1) {
    const point = geometry[index];
    if (typeof point !== "object" || point === null) {
      linked = false;
      continue;
    }
    const lat = (point as { lat?: unknown }).lat;
    const lon = (point as { lon?: unknown }).lon;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      linked = false;
      continue;
    }
    coordinates.push({ lat, lng: lon });
    if (!nodeList) {
      continue;
    }
    const node = nodeList[index];
    if (typeof node === "number" && Number.isFinite(node)) {
      nodeIds.push(String(node));
    } else if (typeof node === "string" && node.trim()) {
      nodeIds.push(node);
    } else {
      linked = false;
    }
  }
  if (coordinates.length < 2) {
    return null;
  }
  return {
    coordinates,
    nodeIds: linked && nodeIds.length === coordinates.length ? nodeIds : null,
  };
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
      nodes?: unknown;
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
    const geometry = readWayGeometry(record.geometry, record.nodes);
    if (!geometry) {
      continue;
    }
    const tagRecord = tags as { name?: unknown; oneway?: unknown; width?: unknown; lanes?: unknown };
    const name = tagRecord.name;
    const wayId = String(record.id);
    roads.push({
      id: wayId,
      osmWayId: wayId,
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      highway,
      oneway: readOneWay(tagRecord.oneway),
      coordinates: geometry.coordinates,
      nodeIds: geometry.nodeIds,
      widthMeters: readMeterValue(tagRecord.width),
      lanes: readLaneCount(tagRecord.lanes),
    });
  }
  return roads;
}

/** One node just outside the circle stays, so a street is not cut between two close nodes. */
const NEXT_NODE_METERS = 80;

export function sliceRoadsNear(
  roads: RoadSegment[],
  center: RoadPoint,
  radiusMeters: number,
): RoadSegment[] {
  const radius = clampRoadRadius(radiusMeters);
  const sliced: RoadSegment[] = [];
  for (const road of roads) {
    const linked = road.nodeIds !== null && road.nodeIds.length === road.coordinates.length;
    let current: RoadPoint[] = [];
    let currentNodes: string[] = [];
    let part = 0;
    const flush = () => {
      if (current.length >= 2) {
        sliced.push({
          ...road,
          id: part === 0 ? road.id : `${road.id}:${part}`,
          osmWayId: road.osmWayId,
          coordinates: current,
          nodeIds: linked ? currentNodes : null,
        });
        part += 1;
      }
      current = [];
      currentNodes = [];
    };
    road.coordinates.forEach((point, index) => {
      const previous = current[current.length - 1];
      const inside = distanceMeters(center, point) <= radius;
      const bridges =
        !inside && previous !== undefined && distanceMeters(previous, point) <= NEXT_NODE_METERS;
      if (inside || bridges) {
        current.push(point);
        if (linked && road.nodeIds) {
          currentNodes.push(road.nodeIds[index] ?? "");
        }
      }
      if (!inside) {
        flush();
      }
    });
    flush();
  }
  return sliced;
}

function namedNodeIds(road: RoadSegment): string[] {
  if (!road.name) {
    return [];
  }
  return (road.nodeIds ?? []).filter((nodeId) => nodeId.length > 0);
}

/**
 * A dense area keeps the higher road classes. A later piece of a street that is
 * already kept stays too, so a short OSM way is not a hole in the same road.
 */
function restoreNamedLinks(kept: RoadSegment[], dropped: RoadSegment[]): RoadSegment[] {
  const nodesByName = new Map<string, Set<string>>();
  for (const road of kept) {
    const name = road.name;
    if (!name) {
      continue;
    }
    const nodes = nodesByName.get(name) ?? new Set<string>();
    for (const nodeId of namedNodeIds(road)) {
      nodes.add(nodeId);
    }
    nodesByName.set(name, nodes);
  }
  const restored: RoadSegment[] = [];
  const pending = [...dropped];
  let grew = true;
  while (grew) {
    grew = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const road = pending[index];
      const name = road?.name;
      if (!road || !name) {
        continue;
      }
      const nodes = nodesByName.get(name);
      const own = namedNodeIds(road);
      if (!nodes || !own.some((nodeId) => nodes.has(nodeId))) {
        continue;
      }
      for (const nodeId of own) {
        nodes.add(nodeId);
      }
      restored.push(road);
      pending.splice(index, 1);
      grew = true;
    }
  }
  return restored;
}

const SEAM_ROAD_LIMIT = 60;

function sharesNode(road: RoadSegment, nodes: ReadonlySet<string>): boolean {
  return (road.nodeIds ?? []).some((nodeId) => nodeId.length > 0 && nodes.has(nodeId));
}

function nodeList(road: RoadSegment): string[] {
  return (road.nodeIds ?? []).filter((nodeId) => nodeId.length > 0);
}

/** First and last nodes that no other road in the set uses. */
export function endpointNodeIds(roads: readonly RoadSegment[]): Set<string> {
  const counts = new Map<string, number>();
  const tips: string[] = [];
  for (const road of roads) {
    const ids = nodeList(road);
    const first = ids[0];
    const last = ids[ids.length - 1];
    if (first) {
      tips.push(first);
    }
    if (last && last !== first) {
      tips.push(last);
    }
    for (const nodeId of new Set(ids)) {
      counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
    }
  }
  const ends = new Set<string>();
  for (const nodeId of tips) {
    if ((counts.get(nodeId) ?? 0) === 1) {
      ends.add(nodeId);
    }
  }
  return ends;
}

/**
 * Roads the class cap removed, but that meet a street already on the map.
 * A road at a loose end is kept ahead of a road that only crosses the middle.
 */
function restoreSeam(
  dropped: readonly RoadSegment[],
  linkedNodeIds: ReadonlySet<string>,
  endpointIds: ReadonlySet<string>,
): RoadSegment[] {
  const ranked = [...dropped].sort((left, right) => {
    const leftEnd = sharesNode(left, endpointIds) ? 0 : 1;
    const rightEnd = sharesNode(right, endpointIds) ? 0 : 1;
    return leftEnd - rightEnd || highwayRank(left.highway) - highwayRank(right.highway) || left.id.localeCompare(right.id);
  });
  const restored: RoadSegment[] = [];
  for (const road of ranked) {
    if (restored.length >= SEAM_ROAD_LIMIT) {
      break;
    }
    if (sharesNode(road, linkedNodeIds)) {
      restored.push(road);
    }
  }
  return restored;
}

export function capRoads(
  roads: RoadSegment[],
  maxRoads = MAX_ROADS_PER_AREA,
  linkedNodeIds?: ReadonlySet<string>,
  endpointIds?: ReadonlySet<string>,
): { roads: RoadSegment[]; truncated: boolean; omitted: OmittedRoad[] } {
  if (roads.length <= maxRoads && (!linkedNodeIds || linkedNodeIds.size === 0)) {
    return { roads, truncated: false, omitted: [] };
  }
  const ranked = [...roads].sort(
    (left, right) => highwayRank(left.highway) - highwayRank(right.highway) || left.id.localeCompare(right.id),
  );
  const kept = ranked.slice(0, maxRoads);
  const dropped = ranked.slice(maxRoads);
  const localEnds = endpointNodeIds(kept);
  const seamNodes = new Set([...(linkedNodeIds ?? []), ...localEnds]);
  const priorityEnds = new Set([...(endpointIds ?? []), ...localEnds]);
  const seam = seamNodes.size > 0 ? restoreSeam(dropped, seamNodes, priorityEnds) : [];
  const seamIds = new Set(seam.map((road) => road.id));
  const restored = restoreNamedLinks(
    [...kept, ...seam],
    dropped.filter((road) => !seamIds.has(road.id)),
  );
  const selected = [...kept, ...seam, ...restored];
  const selectedIds = new Set(selected.map((road) => road.id));
  const omitted: OmittedRoad[] = [];
  for (const road of ranked) {
    if (selectedIds.has(road.id)) {
      continue;
    }
    const connecting = sharesNode(road, seamNodes);
    omitted.push({
      id: road.id,
      name: road.name,
      highway: road.highway,
      nodeIds: nodeList(road),
      reason: connecting ? "sömgräns" : "klassgräns",
    });
  }
  return { roads: selected, truncated: omitted.length > 0, omitted };
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
