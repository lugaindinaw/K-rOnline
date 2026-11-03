import { distanceMeters, type RoadPoint } from "./drivingRoads";

export type RoadSignKind = "stop" | "give_way" | "maxspeed" | "oneway";

export type RoadSign = {
  id: string;
  kind: RoadSignKind;
  position: RoadPoint;
  label: string;
  facingDegrees: number | null;
};

const MIN_SPEED_KMH = 5;
const MAX_SPEED_KMH = 130;

function finitePoint(lat: unknown, lon: unknown): RoadPoint | null {
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lng: lon };
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

function readSpeedKmh(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text || text.includes(";") || text.includes("mph") || text.includes("kn")) {
    return null;
  }
  const match = /^(\d+)(?:\s*km\/h)?$/.exec(text);
  if (!match?.[1]) {
    return null;
  }
  const kmh = Number(match[1]);
  if (!Number.isInteger(kmh) || kmh < MIN_SPEED_KMH || kmh > MAX_SPEED_KMH) {
    return null;
  }
  return kmh;
}

function readOneWaySign(value: unknown): "forward" | "backward" | null {
  if (value === "yes" || value === "1" || value === "true" || value === true) {
    return "forward";
  }
  if (value === "-1" || value === "reverse") {
    return "backward";
  }
  return null;
}

function wayLine(element: {
  geometry?: unknown;
  nodes?: unknown;
}): { points: RoadPoint[]; nodeIds: string[] } | null {
  if (!Array.isArray(element.geometry) || element.geometry.length < 2) {
    return null;
  }
  const points: RoadPoint[] = [];
  const nodeIds: string[] = [];
  const nodes = Array.isArray(element.nodes) ? element.nodes : [];
  for (let index = 0; index < element.geometry.length; index += 1) {
    const point = element.geometry[index];
    if (typeof point !== "object" || point === null) {
      return null;
    }
    const placed = finitePoint((point as { lat?: unknown }).lat, (point as { lon?: unknown }).lon);
    if (!placed) {
      return null;
    }
    points.push(placed);
    const node = nodes[index];
    if (typeof node === "number" && Number.isFinite(node)) {
      nodeIds.push(String(node));
    } else if (typeof node === "string" && node.trim()) {
      nodeIds.push(node);
    } else {
      nodeIds.push("");
    }
  }
  return { points, nodeIds };
}

function pointAlong(points: RoadPoint[], meters: number): { point: RoadPoint; facing: number | null } {
  let remaining = Math.max(0, meters);
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) {
      continue;
    }
    const span = distanceMeters(from, to);
    const facing = bearing(from, to);
    if (span >= remaining) {
      if (span < 0.5) {
        return { point: from, facing };
      }
      return { point: offset(from, facing ?? 0, remaining), facing };
    }
    remaining -= span;
  }
  const last = points[points.length - 1] ?? points[0];
  const prev = points[points.length - 2] ?? last;
  if (!last || !prev) {
    return { point: { lat: 0, lng: 0 }, facing: null };
  }
  return { point: last, facing: bearing(prev, last) };
}

/** Stop, give-way, posted speed and one-way signs. Tags that are missing or not a plain sign are skipped. */
export function parseOverpassSigns(payload: unknown): RoadSign[] {
  if (typeof payload !== "object" || payload === null || !("elements" in payload)) {
    return [];
  }
  const elements = payload.elements;
  if (!Array.isArray(elements)) {
    return [];
  }
  const signs: RoadSign[] = [];
  const seen = new Set<string>();
  const add = (sign: RoadSign) => {
    if (seen.has(sign.id)) {
      return;
    }
    seen.add(sign.id);
    signs.push(sign);
  };
  for (const element of elements) {
    if (typeof element !== "object" || element === null) {
      continue;
    }
    const record = element as {
      type?: unknown;
      id?: unknown;
      lat?: unknown;
      lon?: unknown;
      tags?: unknown;
      geometry?: unknown;
      nodes?: unknown;
    };
    if (typeof record.id !== "number" && typeof record.id !== "string") {
      continue;
    }
    const tags = record.tags;
    if (typeof tags !== "object" || tags === null) {
      continue;
    }
    const tagRecord = tags as {
      highway?: unknown;
      maxspeed?: unknown;
      oneway?: unknown;
    };
    const elementId = String(record.id);
    if (record.type === "node" && tagRecord.highway === "stop") {
      const position = finitePoint(record.lat, record.lon);
      if (position) {
        add({ id: `stop:${elementId}`, kind: "stop", position, label: "STOP", facingDegrees: null });
      }
      continue;
    }
    if (record.type === "node" && tagRecord.highway === "give_way") {
      const position = finitePoint(record.lat, record.lon);
      if (position) {
        add({ id: `yield:${elementId}`, kind: "give_way", position, label: "VÄJ", facingDegrees: null });
      }
      continue;
    }
    if (record.type !== "way") {
      continue;
    }
    const line = wayLine(record);
    if (!line) {
      continue;
    }
    const speed = readSpeedKmh(tagRecord.maxspeed);
    if (speed !== null) {
      const placed = pointAlong(line.points, 8);
      add({
        id: `maxspeed:${elementId}`,
        kind: "maxspeed",
        position: placed.point,
        label: String(speed),
        facingDegrees: placed.facing,
      });
    }
    const oneway = readOneWaySign(tagRecord.oneway);
    if (oneway === "forward") {
      const first = line.points[0];
      const next = line.points[1];
      if (first) {
        add({
          id: `oneway:${elementId}`,
          kind: "oneway",
          position: first,
          label: "ENKEL",
          facingDegrees: next ? bearing(first, next) : null,
        });
      }
    } else if (oneway === "backward") {
      const last = line.points[line.points.length - 1];
      const prev = line.points[line.points.length - 2];
      if (last) {
        add({
          id: `oneway:${elementId}`,
          kind: "oneway",
          position: last,
          label: "ENKEL",
          facingDegrees: prev ? bearing(last, prev) : null,
        });
      }
    }
  }
  return signs;
}

export function describeSignCoverage(signs: readonly RoadSign[]): string {
  const counts: Record<RoadSignKind, number> = { stop: 0, give_way: 0, maxspeed: 0, oneway: 0 };
  const seen = new Set<string>();
  for (const sign of signs) {
    if (seen.has(sign.id)) {
      continue;
    }
    seen.add(sign.id);
    counts[sign.kind] += 1;
  }
  const total = counts.stop + counts.give_way + counts.maxspeed + counts.oneway;
  if (total === 0) {
    return "Inga stopp-, väjnings-, hastighets- eller enkelriktningsskyltar fanns i det hämtade området.";
  }
  return `Skyltar från OpenStreetMap: ${counts.stop} stopplikt, ${counts.give_way} väjningsplikt, ${counts.maxspeed} hastighetsgräns, ${counts.oneway} enkelriktat. Bara taggade skyltar visas.`;
}
