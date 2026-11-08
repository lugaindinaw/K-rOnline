export type Gear = "P" | "R" | "N" | "1" | "2" | "3" | "D";

export const GEAR_ORDER: readonly Gear[] = ["P", "R", "N", "1", "2", "3", "D"];

/** A missing gear is drive, so older calls keep the same acceleration. */
export function gearOf(value: string | undefined | null): Gear {
  if (value === "P" || value === "R" || value === "N" || value === "1" || value === "2" || value === "3" || value === "D") {
    return value;
  }
  return "D";
}

export function cycleGear(current: Gear): Gear {
  const index = GEAR_ORDER.indexOf(gearOf(current));
  return GEAR_ORDER[(index + 1) % GEAR_ORDER.length] ?? "D";
}

export type GearMotion = {
  powered: boolean;
  reverse: boolean;
  /** Scales throttle only. Brake stays a brake. */
  accelScale: number;
  /** Null keeps the road's own speed cap. */
  capMps: number | null;
};

export function gearMotion(gear: Gear | string | undefined | null): GearMotion {
  const selected = gearOf(gear);
  if (selected === "P" || selected === "N") {
    return { powered: false, reverse: false, accelScale: 0, capMps: null };
  }
  if (selected === "R") {
    return { powered: true, reverse: true, accelScale: 0.7, capMps: 6 };
  }
  if (selected === "1") {
    return { powered: true, reverse: false, accelScale: 1, capMps: 8 };
  }
  if (selected === "2") {
    return { powered: true, reverse: false, accelScale: 1, capMps: 14 };
  }
  if (selected === "3") {
    return { powered: true, reverse: false, accelScale: 1, capMps: 22 };
  }
  return { powered: true, reverse: false, accelScale: 1, capMps: null };
}

/** Keyboard gears. Digits stay junction choices. */
export function gearFromKey(code: string, key: string): Gear | "cycle" | null {
  const token = code || "";
  const letter = key.length === 1 ? key.toLowerCase() : "";
  if (token === "KeyG" || letter === "g") {
    return "cycle";
  }
  if (token === "KeyR" || letter === "r") {
    return "R";
  }
  if (token === "KeyN" || letter === "n") {
    return "N";
  }
  if (token === "KeyF" || letter === "f") {
    return "D";
  }
  if (token === "KeyP" || letter === "p") {
    return "P";
  }
  return null;
}
