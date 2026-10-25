const ELEVATION_ENDPOINT = "https://api.open-meteo.com/v1/elevation";

export function readElevations(payload: unknown): number[] {
  if (typeof payload !== "object" || payload === null || !("elevation" in payload)) {
    return [];
  }
  const values = (payload as { elevation?: unknown }).elevation;
  if (!Array.isArray(values)) {
    return [];
  }
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function readGroundElevation(
  lat: number,
  lng: number,
  fetchImpl: FetchLike = fetch,
): Promise<number | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const url = new URL(ELEVATION_ENDPOINT);
  url.searchParams.set("latitude", lat.toFixed(5));
  url.searchParams.set("longitude", lng.toFixed(5));
  try {
    const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return null;
    }
    const [elevation] = readElevations(await response.json());
    return elevation ?? null;
  } catch {
    return null;
  }
}
