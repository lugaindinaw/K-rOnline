export type GeographicPosition = {
  lat: number;
  lng: number;
  altitudeMeters: number | null;
};

export function readGeographicPosition(position: unknown): GeographicPosition | null {
  if (typeof position !== "object" || position === null) {
    return null;
  }

  const value = position as {
    lat?: unknown;
    lng?: unknown;
    altitude?: unknown;
  };
  const lat = typeof value.lat === "function" ? value.lat() : value.lat;
  const lng = typeof value.lng === "function" ? value.lng() : value.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  const altitudeMeters =
    typeof value.altitude === "number" && Number.isFinite(value.altitude)
      ? value.altitude
      : null;

  return { lat, lng, altitudeMeters };
}

export function formatGeographicPosition(position: GeographicPosition): string {
  const altitude =
    position.altitudeMeters === null
      ? "höjd saknas"
      : `${position.altitudeMeters.toFixed(1)} m`;
  return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} (${altitude})`;
}
