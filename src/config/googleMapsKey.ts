const PLACEHOLDER_KEYS = new Set([
  "",
  "your_key_here",
  "your-api-key",
  "changeme",
]);

export function readGoogleMapsApiKey(
  env: Record<string, string | undefined>,
): string | null {
  const raw = env.VITE_GOOGLE_MAPS_API_KEY;
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (PLACEHOLDER_KEYS.has(trimmed.toLowerCase())) {
    return null;
  }

  return trimmed;
}
