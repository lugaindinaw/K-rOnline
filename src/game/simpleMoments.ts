import { finishCityReview, reviewCityDrive, type PracticeReview } from "./cityPractice";
import { EMPTY_COURSE, courseComplete, reviewCourse, type CourseFacts } from "./courseDrive";
import {
  EMPTY_MANEUVER,
  isManeuver,
  maneuverJudged,
  maneuverMission,
  maneuverPassed,
  maneuverTitle,
  reviewManeuver,
  type ManeuverFacts,
  type ManeuverId,
} from "./maneuvers";

export type MomentId =
  | "city"
  | "safety"
  | "parking"
  | "roundabout"
  | "rural"
  | "motorway"
  | "night"
  | "independent"
  | ManeuverId;

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
  targetRoad: string | null;
  course?: CourseFacts;
  maneuver?: ManeuverFacts;
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
  if (isManeuver(moment)) {
    return maneuverTitle(moment);
  }
  if (moment === "city") {
    return goal === "left" ? "Sväng vänster" : goal === "right" ? "Sväng höger" : "Välj sväng";
  }
  if (moment === "safety") return "Säkerhetskontroll";
  if (moment === "parking") return "Parkering";
  if (moment === "roundabout") return "Rondell";
  if (moment === "rural") return "Landsväg";
  if (moment === "motorway") return "Motorväg";
  if (moment === "independent") return "Körning mot mål";
  if (moment === "night") return "Mörkerkörning";
  return "Övning";
}

export function goalStreet(names: readonly (string | null | undefined)[]): string | null {
  const unique = [...new Set(names.filter((name): name is string => Boolean(name && name !== "Regeringsgatan")))];
  if (unique.includes("Jakobsgatan")) {
    return "Jakobsgatan";
  }
  return unique[0] ?? null;
}

export function momentJudged(moment: MomentId): readonly string[] {
  if (isManeuver(moment)) {
    return maneuverJudged(moment);
  }
  if (moment === "city" || moment === "roundabout") {
    return [
      "Fart: håll låg fart genom korsningen. För hög fart gör att du inte hinner stanna eller styra.",
      "Placering: stanna på körbanan. Att skära över är fel placering.",
      "Blinkers: tänd den innan svängen så att andra ser vart du ska.",
      "Väjningsplikt: stanna om skylten kräver det. Att köra utan att lämna företräde är fel.",
    ];
  }
  if (moment === "safety") {
    return ["Blinkers, broms och gas ska provas innan du kör. Då vet du att reglagen svarar."];
  }
  if (moment === "parking") {
    return ["Rulla fram och stanna helt. En parkering är inte klar förrän bilen står stilla."];
  }
  if (moment === "independent") {
    return [
      "Målet är en annan namngiven gata. Övningen är klar först när bilen är där.",
      "Håll dig på körbanan dit. Att lämna vägen är fel placering.",
    ];
  }
  if (moment === "night") {
    return ["Fart och körfält. Uppgiften har ingen sväng, så blinkers bedöms inte."];
  }
  if (moment === "rural") {
    return [
      "Fart: håll omkring 70 km/h. Det är den skyltade gränsen på den här landsvägen.",
      "Placering: kör på höger sida. Vänster körfält är för mötande.",
      "Kurva: följ vägens böj och bli kvar på höger sida.",
      "Möte: håll höger när en bil kommer emot.",
      "Omkörning: kör om bara när mötande körfält är fritt. Annars stannar du bakom.",
    ];
  }
  if (moment === "motorway") {
    return [
      "Påfart: accelerera på påfarten. Gränsen där är 80 km/h.",
      "Fart: på Arlandaleden är gränsen 100 km/h.",
      "Körfält: håll höger och byt sedan ett körfält.",
      "Avstånd: lämna lucka till bilen framför.",
      "Avfart: lämna motorvägen på avfarten.",
    ];
  }
  return ["Fart och körfält. Håll en jämn fart och lämna inte körbanan."];
}

export function momentMission(moment: MomentId, goal: "left" | "right" | null, targetRoad?: string | null): string {
  if (isManeuver(moment)) {
    return maneuverMission(moment);
  }
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
    return "Färentunavägen är en tvåfilig landsväg med 70 km/h. Håll höger, möt trafiken, följ kurvan och kör om bara när det är fritt.";
  }
  if (moment === "motorway") {
    return "Du står på påfarten till Arlandaleden. Accelerera, håll omkring 100 km/h, byt körfält, håll avstånd och styr höger där avfarten viker av.";
  }
  if (moment === "independent") {
    const target = targetRoad ?? "nästa gata";
    return `Kör till ${target}. Du startar på Regeringsgatan. Välj den anslutna gatan och håll dig på körbanan.`;
  }
  if (moment === "night") {
    return "Det är mörkt. Kör en kort bit och håll dig i körfältet.";
  }
  return "Kör övningen och följ det som bedöms.";
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

function reviewNight(input: MomentSnapshot): PracticeReview {
  const speed = maxSpeed(input.lines);
  const offset = offsetMeters(input.lines);
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
  ];
  const waiting = !fastEnough ? points[0] : !inLane ? points[1] : null;
  return {
    score: Math.round((points.filter((item) => item.mark === "bra").length / points.length) * 100),
    points,
    live: waiting?.detail ?? "Mörkersträckan är körd.",
  };
}

export function reviewMoment(input: MomentSnapshot): PracticeReview {
  if (isManeuver(input.moment)) {
    return reviewManeuver(input.moment, input.maneuver ?? EMPTY_MANEUVER, {
      speedKmh: input.speedKmh,
      roadName: input.roadName,
      startRoad: input.startRoad,
    });
  }
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
  if (input.moment === "rural" || input.moment === "motorway") {
    return reviewCourse(input.moment, input.course ?? EMPTY_COURSE);
  }
  if (input.moment === "independent") {
    const target = input.targetRoad;
    const arrived = Boolean(target && input.roadName === target && maxSpeed(input.lines) > 0);
    const offset = offsetMeters(input.lines);
    const inLane = offset != null && offset <= 4;
    const points = [
      point(
        "Mål",
        arrived,
        arrived
          ? `Du körde till ${target}.`
          : `Du är på ${input.roadName ?? "starten"}. Kör vidare till ${target ?? "målgatan"}. Övningen är inte klar förrän du är framme.`,
      ),
      point(
        "Placering",
        inLane,
        offset == null
          ? "Sidoläget mäts när bilen rullar."
          : inLane
            ? `${offset.toFixed(1)} m från mittlinjen.`
            : `${offset.toFixed(1)} m från mittlinjen. Tillbaka till körbanan, annars är placeringen fel.`,
      ),
    ];
    const good = points.filter((item) => item.mark === "bra").length;
    return {
      score: Math.round((good / points.length) * 100),
      points,
      live: points.find((item) => item.mark === "träna")?.detail ?? "Målet är nått.",
    };
  }
  const target = 12;
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
  if (isManeuver(input.moment)) {
    return maneuverPassed(input.moment, input.maneuver ?? EMPTY_MANEUVER, {
      speedKmh: input.speedKmh,
      roadName: input.roadName,
      startRoad: input.startRoad,
    });
  }
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
    return maxSpeed(input.lines) >= NIGHT_SPEED_KMH && offset != null && offset <= 4;
  }
  if (input.moment === "rural" || input.moment === "motorway") {
    return courseComplete(input.moment, input.course ?? EMPTY_COURSE);
  }
  if (input.moment === "independent") {
    return Boolean(
      input.targetRoad &&
        input.startRoad &&
        input.roadName === input.targetRoad &&
        input.roadName !== input.startRoad &&
        maxSpeed(input.lines) > 0,
    );
  }
  const offset = offsetMeters(input.lines);
  return maxSpeed(input.lines) >= 12 && offset != null && offset <= 4;
}

export function finishMoment(review: PracticeReview): PracticeReview {
  return finishCityReview(review);
}
