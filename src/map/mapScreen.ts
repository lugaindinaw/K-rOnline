export type MapPhase = "loading" | "ready" | "error";

export type MapScreen =
  | { kind: "missing-key" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function resolveMapScreen(input: {
  apiKey: string | null;
  phase: MapPhase;
  errorMessage?: string;
}): MapScreen {
  if (!input.apiKey) {
    return { kind: "missing-key" };
  }
  if (input.phase === "error") {
    return {
      kind: "error",
      message: input.errorMessage?.trim() || "3D-kartan kunde inte visas.",
    };
  }
  if (input.phase === "loading") {
    return { kind: "loading" };
  }
  return { kind: "ready" };
}

const INTERNAL_MAP_FAILURE =
  /Cannot read properties of|is not a function|is not defined/;

export function publicMapError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Okänt fel vid laddning av 3D-kartan.";
  const redacted = raw.replace(/key=[^&\s]+/gi, "key=(dold)");
  if (INTERNAL_MAP_FAILURE.test(redacted)) {
    return "3D-kartan kunde inte initieras. Kontrollera nyckeln, faktureringen och att Maps JavaScript API är aktiverat.";
  }
  return redacted;
}
