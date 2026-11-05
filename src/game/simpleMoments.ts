import { finishCityReview, reviewCityDrive, type PracticeReview } from "./cityPractice";

export type MomentId = "city" | "safety" | "parking" | "roundabout" | "rural" | "motorway" | "night";

export type SafetyChecks = {
  left: boolean;
  right: boolean;
  brake: boolean;
  gas: boolean;
};

export const EMPTY_CHECKS: SafetyChecks = { left: false, right: false, brake: false, gas: false };

export type MomentSnapshot = {
  moment: MomentId;
  lines: readonly string[];
  speedKmh: number;
  roadName: string | null;
  startRoad: string | null;
  trafficCount: number;
  nearestCarMeters: number | null;
  speedNearCarKmh: number | null;
  goal: "left" | "right" | null;
  indicator: "off" | "left" | "right";
  checks: SafetyChecks;
};

function lineValue(lines: readonly string[], prefix: string): string | null {
  const found = lines.find((line) => line.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : null;
}

function maxSpeed(lines: readonly string[]): number {
  const value = Number.parseInt(lineValue(lines, "Högsta fart:") ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function offsetMeters(lines: readonly string[]): number | null {
  const text = lineValue(lines, "Största avstånd från mittlinjen:");
  if (!text || text === "inte uppmätt") {
    return null;
  }
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function point(title: string, ok: boolean, detail: string) {
  return { title, mark: ok ? ("bra" as const) : ("träna" as const), detail };
}

export function momentTitle(moment: MomentId, goal: "left" | "right" | null): string {
  if (moment === "city") {
    return goal === "left" ? "Sväng vänster" : goal === "right" ? "Sväng höger" : "Välj sväng";
  }
  if (moment === "safety") return "Säkerhetskontroll";
  if (moment === "parking") return "Parkering";
  if (moment === "roundabout") return "Rondell";
  if (moment === "rural") return "Landsväg";
  if (moment === "motorway") return "Motorväg";
  return "Mörkerkörning";
}

export function momentMission(moment: MomentId, goal: "left" | "right" | null): string {
  if (moment === "city") {
    if (goal === "left") {
      return "Kör fram till korsningen, stanna vid väjningsplikt och sväng vänster. Tänd blinkers med Q.";
    }
    if (goal === "right") {
      return "Kör fram till korsningen, stanna vid väjningsplikt och sväng höger. Tänd blinkers med E.";
    }
    return "Välj vänster eller höger. Stanna vid väjningsplikt och sväng dit.";
  }
  if (moment === "roundabout") {
    return "Förenklad rondell: blinka höger med E, sakta in om en bil är nära och sväng höger ut.";
  }
  if (moment === "safety") {
    return "Prova reglagen innan du kör: vänster blinkers, höger blinkers, broms och gas.";
  }
  if (moment === "parking") {
    return "Kör en kort bit och stanna. Håll S tills bilen står stilla.";
  }
  if (moment === "rural") {
    return "Kör rakt och håll en jämn fart kring 35 km/h. Stanna i körfältet.";
  }
  if (moment === "motorway") {
    return "Håll en jämn fart nära bilens toppfart, omkring 40 km/h, och bli kvar i körfältet. Den här prototypen kör inte i riktig motorvägsfart.";
  }
  return "Det är mörkt. Kör en kort bit, håll dig i körfältet och tänd blinkers med Q eller E.";
}

const NIGHT_SPEED_KMH = 12;

export function freshIndicatorSide(
  previous: "off" | "left" | "right" | null,
  indicator: "off" | "left" | "right",
): "left" | "right" | null {
  if (previous == null || indicator === "off" || indicator === previous) {
    return null;
  }
  return indicator;
}

function nightBlinked(input: MomentSnapshot): boolean {
  return input.checks.left || input.checks.right || lineValue(input.lines, "Blinkers före sväng:") === "använd";
}

function reviewNight(input: MomentSnapshot): PracticeReview {
  const speed = maxSpeed(input.lines);
  const offset = offsetMeters(input.lines);
  const blinked = nightBlinked(input);
  const fastEnough = speed >= NIGHT_SPEED_KMH;
  const inLane = offset != null && offset <= 4;
  const points = [
    point(
      "Fart",
      fastEnough,
      fastEnough
        ? `Högsta fart ${speed} km/h. I mörker räcker en lugn fart.`
        : "Håll W och kom upp i minst 12 km/h. Kör lugnt så du hinner se vägen.",
    ),
    point(
      "Placering",
      inLane,
      offset == null
        ? "Sidoläget mäts när bilen rullar. Håll dig nära mittlinjen."
        : inLane
          ? `${offset.toFixed(1)} m från mittlinjen. Du höll dig i körfältet.`
          : `${offset.toFixed(1)} m från mittlinjen. Styr tillbaka mot körfältet med A eller D.`,
    ),
    point(
      "Blinkers",
      blinked,
      blinked
        ? "Blinkersen tändes under körningen."
        : "Tryck Q eller E och tänd blinkers innan du svänger.",
    ),
  ];
  const waiting = !fastEnough ? points[0] : !blinked ? points[2] : !inLane ? points[1] : null;
  return {
    score: Math.round((points.filter((item) => item.mark === "bra").length / points.length) * 100),
    points,
    live: waiting?.detail ?? "Mörkersträckan är körd.",
  };
}

export function reviewMoment(input: MomentSnapshot): PracticeReview {
  if (input.moment === "city" || input.moment === "roundabout") {
    return reviewCityDrive({
      lines: input.lines,
      roadName: input.roadName,
      startRoad: input.startRoad,
      trafficCount: input.trafficCount,
      nearestCarMeters: input.nearestCarMeters,
      speedNearCarKmh: input.speedNearCarKmh,
      goal: input.moment === "roundabout" ? "right" : input.goal,
      indicator: input.indicator,
    });
  }
  const speed = maxSpeed(input.lines);
  const offset = offsetMeters(input.lines);
  if (input.moment === "safety") {
    const points = [
      point("Vänster blinkers", input.checks.left, input.checks.left ? "Vänster blinkers provades." : "Tryck Q eller knappen för vänster blinkers."),
      point("Höger blinkers", input.checks.right, input.checks.right ? "Höger blinkers provades." : "Tryck E eller knappen för höger blinkers."),
      point("Broms", input.checks.brake, input.checks.brake ? "Bromsen provades." : "Tryck S eller Broms."),
      point("Gas", input.checks.gas, input.checks.gas ? "Gasen provades." : "Tryck W eller Gas en kort stund."),
    ];
    const waiting = points.find((item) => item.mark === "träna");
    const good = points.filter((item) => item.mark === "bra").length;
    return {
      score: Math.round((good / points.length) * 100),
      points,
      live: waiting?.detail ?? "Reglagen är provade.",
    };
  }
  if (input.moment === "parking") {
    const moved = speed >= 4;
    const stopped = input.speedKmh === 0 && input.checks.brake && moved;
    const points = [
      point("Rulla fram", moved, moved ? `Högsta fart ${speed} km/h.` : "Gasa en kort bit med W."),
      point("Stanna", stopped, stopped ? "Bilen stannade med broms." : "Håll S tills mätaren visar 0."),
      point(
        "Placering",
        offset != null && offset <= 4,
        offset == null ? "Sidoläget mäts när bilen rullar." : `${offset.toFixed(1)} m från mittlinjen. Håll dig på vägen när du stannar.`,
      ),
    ];
    const good = points.filter((item) => item.mark === "bra").length;
    return {
      score: Math.round((good / points.length) * 100),
      points,
      live: points.find((item) => item.mark === "träna")?.detail ?? "Parkeringen är klar.",
    };
  }
  if (input.moment === "night") {
    return reviewNight(input);
  }
  const target = input.moment === "motorway" ? 40 : input.moment === "rural" ? 35 : 12;
  const fastEnough = speed >= target;
  const inLane = offset != null && offset <= 4;
  const points = [
    point(
      "Fart",
      fastEnough,
      fastEnough ? `Högsta fart ${speed} km/h.` : `Kom upp i minst ${target} km/h. Håll W.`,
    ),
    point(
      "Körfält",
      inLane,
      offset == null ? "Sidoläget mäts när bilen rullar." : `${offset.toFixed(1)} m från mittlinjen.`,
    ),
  ];
  const good = points.filter((item) => item.mark === "bra").length;
  return {
    score: Math.round((good / points.length) * 100),
    points,
    live: points.find((item) => item.mark === "träna")?.detail ?? "Sträckan är körd.",
  };
}

export function momentComplete(input: MomentSnapshot): boolean {
  if (input.moment === "city" || input.moment === "roundabout") {
    return Boolean(input.startRoad && input.roadName && input.roadName !== input.startRoad && maxSpeed(input.lines) > 0);
  }
  if (input.moment === "safety") {
    return input.checks.left && input.checks.right && input.checks.brake && input.checks.gas;
  }
  if (input.moment === "parking") {
    return maxSpeed(input.lines) >= 4 && input.speedKmh === 0 && input.checks.brake;
  }
  if (input.moment === "night") {
    const offset = offsetMeters(input.lines);
    return maxSpeed(input.lines) >= NIGHT_SPEED_KMH && offset != null && offset <= 4 && nightBlinked(input);
  }
  const target = input.moment === "motorway" ? 40 : input.moment === "rural" ? 35 : 12;
  const offset = offsetMeters(input.lines);
  return maxSpeed(input.lines) >= target && offset != null && offset <= 4;
}

export function finishMoment(review: PracticeReview): PracticeReview {
  return finishCityReview(review);
}
