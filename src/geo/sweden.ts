import { SWEDEN_OUTLINE } from "./swedenOutline";

/** Waterfront towns sit just outside the simplified coastline. */
export const SWEDEN_BORDER_BUFFER_METERS = 8000;

function ringContains(
  lng: number,
  lat: number,
  ring: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToRingMeters(
  lat: number,
  lng: number,
  ring: readonly (readonly [number, number])[],
): number {
  const latRadians = (lat * Math.PI) / 180;
  const xScale = 111320 * Math.cos(latRadians);
  const yScale = 110570;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lng1, lat1] = ring[index];
    const [lng2, lat2] = ring[index + 1];
    const x1 = (lng1 - lng) * xScale;
    const y1 = (lat1 - lat) * yScale;
    const x2 = (lng2 - lng) * xScale;
    const y2 = (lat2 - lat) * yScale;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, (-x1 * dx - y1 * dy) / lengthSquared));
    const distance = Math.hypot(x1 + t * dx, y1 + t * dy);
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

export function isInSweden(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  for (const ring of SWEDEN_OUTLINE) {
    if (ringContains(lng, lat, ring)) {
      return true;
    }
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (const ring of SWEDEN_OUTLINE) {
    nearest = Math.min(nearest, distanceToRingMeters(lat, lng, ring));
  }
  return nearest <= SWEDEN_BORDER_BUFFER_METERS;
}
