import { isInSweden } from "../geo/sweden";

export const PLACE_EXAMPLES = ["Göteborg", "Malmö", "Kiruna", "Visby", "Glommersträsk"] as const;

export type SwedishPlace = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: string;
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export function buildNominatimSearchUrl(query: string): string | null {
  const text = query.trim();
  if (text.length < 2 || text.length > 80) {
    return null;
  }
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "se");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", text);
  return url.toString();
}

export function parseNominatimPlaces(payload: unknown): SwedishPlace[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const places: SwedishPlace[] = [];
  for (const item of payload) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as {
      place_id?: unknown;
      lat?: unknown;
      lon?: unknown;
      display_name?: unknown;
      type?: unknown;
      addresstype?: unknown;
      address?: { country_code?: unknown };
    };
    const country = record.address?.country_code;
    if (typeof country === "string" && country.toLowerCase() !== "se") {
      continue;
    }
    const lat = typeof record.lat === "string" ? Number(record.lat) : record.lat;
    const lng = typeof record.lon === "string" ? Number(record.lon) : record.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !isInSweden(lat, lng)) {
      continue;
    }
    const displayName = typeof record.display_name === "string" ? record.display_name : "";
    const label = displayName
      .split(",")
      .slice(0, 3)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
    if (!label) {
      continue;
    }
    const kindValue = record.addresstype ?? record.type;
    places.push({
      id: String(record.place_id ?? `${lat},${lng}`),
      label,
      lat,
      lng,
      kind: typeof kindValue === "string" ? kindValue : "plats",
    });
  }
  return places;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function searchSwedishPlaces(
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ places: SwedishPlace[]; message: string | null }> {
  const url = buildNominatimSearchUrl(query);
  if (!url) {
    return { places: [], message: "Skriv minst två tecken." };
  }
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "Accept-Language": "sv" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return { places: [], message: "Platssökningen svarade inte. Försök igen." };
    }
    const places = parseNominatimPlaces(await response.json());
    if (places.length === 0) {
      return { places: [], message: "Ingen plats i Sverige matchade sökningen." };
    }
    return { places, message: null };
  } catch {
    return { places: [], message: "Platssökningen svarade inte. Försök igen." };
  }
}
