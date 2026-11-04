import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import type { IndicatorState } from "../drive/indicators";

/**
 * Facts a later assessment can read. Nothing here is a score, a pass, or a
 * driving test. Only give_way nodes that were actually supplied are tracked.
 */
export type YieldFact = {
  id: string;
  nearestMeters: number;
  approached: boolean;
  stopped: boolean;
  passed: boolean;
};

export type DriveFacts = {
  maxSpeedMps: number;
  brakeUsed: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  maxAbsOffsetMeters: number | null;
  /** Null until the heading has changed by a real turn. */
  indicatorBeforeTurn: boolean | null;
  yields: YieldFact[];
  turnBaseHeading: number | null;
  turnIndicator: IndicatorState;
};

export type DriveFrame = {
  position: RoadPoint;
  headingDegrees: number;
  speedMps: number;
  brake: boolean;
  steer: number;
  offsetMeters: number | null;
  indicator: IndicatorState;
  giveWay: readonly { id: string; position: RoadPoint }[];
};

const STOP_MPS = 0.45;
const TURN_DEGREES = 25;

export const EMPTY_DRIVE_FACTS: DriveFacts = {
  maxSpeedMps: 0,
  brakeUsed: false,
  steerLeft: false,
  steerRight: false,
  maxAbsOffsetMeters: null,
  indicatorBeforeTurn: null,
  yields: [],
  turnBaseHeading: null,
  turnIndicator: "off",
};

function signedDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function bearing(from: RoadPoint, to: RoadPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function updateYields(facts: DriveFacts, frame: DriveFrame): YieldFact[] {
  return frame.giveWay.map((sign) => {
    const prior = facts.yields.find((item) => item.id === sign.id);
    const gap = distanceMeters(frame.position, sign.position);
    const ahead = Math.abs(signedDelta(frame.headingDegrees, bearing(frame.position, sign.position)));
    const approached = Boolean(prior?.approached) || (gap <= 28 && gap >= 0.8 && ahead <= 70);
    const stopped = Boolean(prior?.stopped) || (approached && !prior?.passed && gap <= 22 && frame.speedMps <= STOP_MPS);
    const behind = ahead > 100;
    const leaving = Boolean(
      prior?.approached &&
        ((behind && prior.nearestMeters < 12 && gap > prior.nearestMeters + 3) ||
          (prior.nearestMeters < 16 && gap > prior.nearestMeters + 4 && gap > 14)),
    );
    return {
      id: sign.id,
      nearestMeters: gap,
      approached,
      stopped,
      passed: Boolean(prior?.passed) || leaving,
    };
  });
}

function updateTurn(facts: DriveFacts, frame: DriveFrame): Pick<DriveFacts, "indicatorBeforeTurn" | "turnBaseHeading" | "turnIndicator"> {
  const steer = Number.isFinite(frame.steer) ? frame.steer : 0;
  let base = facts.turnBaseHeading;
  let indicator = facts.turnIndicator;
  let before = facts.indicatorBeforeTurn;
  if (base == null && Math.abs(steer) > 0.45) {
    base = frame.headingDegrees;
    indicator = frame.indicator;
  }
  if (base == null) {
    return { indicatorBeforeTurn: before, turnBaseHeading: null, turnIndicator: indicator };
  }
  const delta = signedDelta(base, frame.headingDegrees);
  if (Math.abs(delta) >= TURN_DEGREES) {
    const direction = delta > 0 ? "right" : "left";
    before = indicator === direction;
    return { indicatorBeforeTurn: before, turnBaseHeading: null, turnIndicator: "off" };
  }
  if (Math.abs(steer) < 0.2 && Math.abs(delta) < 12) {
    return { indicatorBeforeTurn: before, turnBaseHeading: null, turnIndicator: "off" };
  }
  return { indicatorBeforeTurn: before, turnBaseHeading: base, turnIndicator: indicator };
}

export function noteDriveFrame(facts: DriveFacts, frame: DriveFrame): DriveFacts {
  const speed = Number.isFinite(frame.speedMps) ? Math.max(0, frame.speedMps) : 0;
  const steer = Number.isFinite(frame.steer) ? frame.steer : 0;
  const offset =
    typeof frame.offsetMeters === "number" && Number.isFinite(frame.offsetMeters) ? Math.abs(frame.offsetMeters) : null;
  const turn = updateTurn(facts, frame);
  return {
    maxSpeedMps: Math.max(facts.maxSpeedMps, speed),
    brakeUsed: facts.brakeUsed || (frame.brake && speed > 0.3),
    steerLeft: facts.steerLeft || steer < -0.35,
    steerRight: facts.steerRight || steer > 0.35,
    maxAbsOffsetMeters:
      offset == null ? facts.maxAbsOffsetMeters : Math.max(facts.maxAbsOffsetMeters ?? 0, offset),
    yields: updateYields(facts, frame),
    ...turn,
  };
}

export function yieldAheadNote(facts: DriveFacts): string | null {
  const ahead = facts.yields
    .filter((item) => item.approached && !item.passed)
    .sort((left, right) => left.nearestMeters - right.nearestMeters);
  const next = ahead[0];
  if (!next) {
    return null;
  }
  const node = next.id.replace(/^yield:/, "");
  return `Väjningsplikt från OpenStreetMap, nod ${node}, ${Math.max(0, Math.round(next.nearestMeters))} m framför bilen.`;
}

function yieldLine(fact: YieldFact): string {
  const node = fact.id.replace(/^yield:/, "");
  if (!fact.approached) {
    return `Väjningsplikt nod ${node}: inte nådd`;
  }
  if (!fact.passed) {
    return `Väjningsplikt nod ${node}: ${Math.max(0, Math.round(fact.nearestMeters))} m framför bilen`;
  }
  if (fact.stopped) {
    return `Väjningsplikt nod ${node}: bilen stannade`;
  }
  return `Väjningsplikt nod ${node}: passerade utan stopp`;
}

/** Plain lines for the panel. Not a grade. */
export function driveFactsText(facts: DriveFacts): string[] {
  const lines = [
    `Högsta fart: ${Math.round(facts.maxSpeedMps * 3.6)} km/h`,
    `Broms använd: ${facts.brakeUsed ? "ja" : "nej"}`,
    `Styrning: ${facts.steerLeft || facts.steerRight ? `${facts.steerLeft ? "vänster" : ""}${facts.steerLeft && facts.steerRight ? " och " : ""}${facts.steerRight ? "höger" : ""}` : "rak"}`,
    `Största avstånd från mittlinjen: ${facts.maxAbsOffsetMeters == null ? "inte uppmätt" : `${facts.maxAbsOffsetMeters.toFixed(1)} m`}`,
    `Blinkers före sväng: ${facts.indicatorBeforeTurn == null ? "ingen sväng ännu" : facts.indicatorBeforeTurn ? "använd" : "inte använd"}`,
  ];
  if (facts.yields.length === 0) {
    lines.push("Inga väjningspliktsnoder i det här området.");
  } else {
    lines.push(...facts.yields.map(yieldLine));
  }
  return lines;
}
