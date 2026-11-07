import { highwayClass } from "../roads/drivingRoads";
import { MAX_SPEED_MPS } from "./drive";

export type SpeedRoad = {
  highway?: string | null;
  maxspeedKmh?: number | null;
};

/**
 * The posted limit when the way has one. Motorways, trunk roads and ordinary
 * rural classes get the Swedish default when the tag is missing. City streets
 * stay without a limit here so the existing city cap is unchanged.
 */
export function postedLimitKmh(road: SpeedRoad | null | undefined): number | null {
  const posted = road?.maxspeedKmh;
  if (typeof posted === "number" && posted >= 20 && posted <= 130) {
    return posted;
  }
  const kind = highwayClass(road?.highway ?? "");
  if (kind === "motorway") {
    return 110;
  }
  if (kind === "trunk") {
    return 90;
  }
  if (kind === "primary" || kind === "secondary") {
    return 70;
  }
  return null;
}

/**
 * How fast the free car may go on this road. The cap sits a little above the
 * sign so a driver can be marked for going too fast. City streets keep the
 * existing cap.
 */
export function speedCapMps(road: SpeedRoad | null | undefined): number {
  const posted = postedLimitKmh(road);
  if (posted == null) {
    return MAX_SPEED_MPS;
  }
  const extra = posted >= 100 ? 15 : 20;
  return Math.max(MAX_SPEED_MPS, (posted + extra) / 3.6);
}
