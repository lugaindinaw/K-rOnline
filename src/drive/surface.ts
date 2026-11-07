export type Surface = "clear" | "rain" | "fog" | "ice";

export const SURFACE_ORDER: readonly Surface[] = ["clear", "rain", "fog", "ice"];

export function surfaceOf(value: string | undefined | null): Surface {
  if (value === "rain" || value === "fog" || value === "ice") {
    return value;
  }
  return "clear";
}

export function cycleSurface(current: Surface): Surface {
  const index = SURFACE_ORDER.indexOf(surfaceOf(current));
  return SURFACE_ORDER[(index + 1) % SURFACE_ORDER.length] ?? "clear";
}

export function surfaceLabel(surface: Surface): string {
  if (surface === "rain") {
    return "Regn";
  }
  if (surface === "fog") {
    return "Dimma";
  }
  if (surface === "ice") {
    return "Halka";
  }
  return "Klart";
}

/**
 * Grip multiplies the sideways acceleration the tyres can hold.
 * Brake scale multiplies braking. Clear is 1, so a dry road is unchanged.
 */
export function surfaceGrip(surface: Surface | undefined | null): { grip: number; brakeScale: number } {
  const name = surfaceOf(surface);
  if (name === "rain") {
    return { grip: 0.72, brakeScale: 0.75 };
  }
  if (name === "ice") {
    return { grip: 0.38, brakeScale: 0.45 };
  }
  if (name === "fog") {
    return { grip: 0.9, brakeScale: 0.95 };
  }
  return { grip: 1, brakeScale: 1 };
}
