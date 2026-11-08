import type { PracticeReview } from "./cityPractice";
import type { Gear } from "../drive/gears";
import { gearOf } from "../drive/gears";

/**
 * Scores what the car actually did in one exercise.
 * The hill uses a simulated slope. Pedestrians, the practice signal, the roadworks
 * sign and the railway mark are exercise props on the loaded street, not national coverage.
 * The exam is one connected city drive. It is not Trafikverket's test.
 */
export const MANEUVER_IDS = [
  "handling",
  "hill",
  "lanes",
  "reverse",
  "turn",
  "crossing",
  "lights",
  "hazard",
  "ice",
  "works",
  "railway",
  "exam",
] as const;

export type ManeuverId = (typeof MANEUVER_IDS)[number];

export function isManeuver(moment: string | null | undefined): moment is ManeuverId {
  return typeof moment === "string" && (MANEUVER_IDS as readonly string[]).includes(moment);
}

export type ManeuverActor = {
  kind: string;
  gapMeters: number;
  ahead: boolean;
};

export type ManeuverFrame = {
  dtSeconds: number;
  speedMps: number;
  headingDegrees: number;
  offsetMeters: number;
  brake: boolean;
  indicator: "off" | "left" | "right";
  gear: Gear | string;
  rollMps: number;
  roadName: string | null;
  startRoad: string | null;
  signal: "red" | "green" | null;
  actors: readonly ManeuverActor[];
};

export type ManeuverFacts = {
  maxSpeedKmh: number;
  brakeUsed: boolean;
  indicatorUsed: boolean;
  usedPark: boolean;
  usedReverse: boolean;
  usedNeutral: boolean;
  usedFirst: boolean;
  usedDrive: boolean;
  reverseMeters: number;
  rollMeters: number;
  leftMost: number | null;
  rightMost: number | null;
  headingUnwrapped: number;
  headingLow: number;
  headingHigh: number;
  lastHeading: number | null;
  sawPerson: boolean;
  stoppedNearPerson: boolean;
  passedPerson: boolean;
  sawCyclist: boolean;
  closeToCyclist: boolean;
  sawRed: boolean;
  stoppedAtRed: boolean;
  droveOnGreen: boolean;
  sawWorks: boolean;
  slowAtWorks: boolean;
  asideAtWorks: boolean;
  sawRailway: boolean;
  stoppedAtRailway: boolean;
  passedRailway: boolean;
  leftStartRoad: boolean;
};

export const EMPTY_MANEUVER: ManeuverFacts = {
  maxSpeedKmh: 0,
  brakeUsed: false,
  indicatorUsed: false,
  usedPark: false,
  usedReverse: false,
  usedNeutral: false,
  usedFirst: false,
  usedDrive: false,
  reverseMeters: 0,
  rollMeters: 0,
  leftMost: null,
  rightMost: null,
  headingUnwrapped: 0,
  headingLow: 0,
  headingHigh: 0,
  lastHeading: null,
  sawPerson: false,
  stoppedNearPerson: false,
  passedPerson: false,
  sawCyclist: false,
  closeToCyclist: false,
  sawRed: false,
  stoppedAtRed: false,
  droveOnGreen: false,
  sawWorks: false,
  slowAtWorks: false,
  asideAtWorks: false,
  sawRailway: false,
  stoppedAtRailway: false,
  passedRailway: false,
  leftStartRoad: false,
};

export function noteManeuverFrame(facts: ManeuverFacts, frame: ManeuverFrame): ManeuverFacts {
  const dt = Number.isFinite(frame.dtSeconds) ? Math.min(0.25, Math.max(0, frame.dtSeconds)) : 0;
  const speed = Math.max(0, Number.isFinite(frame.speedMps) ? frame.speedMps : 0);
  const speedKmh = Math.round(speed * 3.6);
  const gear = gearOf(frame.gear);
  const next: ManeuverFacts = {
    ...facts,
    maxSpeedKmh: Math.max(facts.maxSpeedKmh, speedKmh),
    brakeUsed: facts.brakeUsed || frame.brake,
    indicatorUsed: facts.indicatorUsed || frame.indicator !== "off",
    usedPark: facts.usedPark || gear === "P",
    usedReverse: facts.usedReverse || gear === "R",
    usedNeutral: facts.usedNeutral || gear === "N",
    usedFirst: facts.usedFirst || gear === "1",
    usedDrive: facts.usedDrive || gear === "D",
    reverseMeters: facts.reverseMeters + (gear === "R" ? speed * dt : 0),
    rollMeters: facts.rollMeters + (frame.rollMps > 0.15 ? frame.rollMps * dt : 0),
  };
  if (speedKmh >= 4 && Number.isFinite(frame.offsetMeters)) {
    next.leftMost = next.leftMost == null ? frame.offsetMeters : Math.max(next.leftMost, frame.offsetMeters);
    next.rightMost = next.rightMost == null ? frame.offsetMeters : Math.min(next.rightMost, frame.offsetMeters);
  }
  if (speed >= 2 && Number.isFinite(frame.headingDegrees)) {
    if (next.lastHeading == null) {
      next.lastHeading = frame.headingDegrees;
    } else {
      next.headingUnwrapped += signedDelta(next.lastHeading, frame.headingDegrees);
      next.lastHeading = frame.headingDegrees;
      next.headingLow = Math.min(next.headingLow, next.headingUnwrapped);
      next.headingHigh = Math.max(next.headingHigh, next.headingUnwrapped);
    }
  }
  for (const actor of frame.actors) {
    noteActor(next, actor, speed);
  }
  if (frame.signal === "red") {
    next.sawRed = true;
    const signal = frame.actors.find((actor) => actor.kind === "signal");
    if (signal && signal.ahead && signal.gapMeters < 18 && speed < 1) {
      next.stoppedAtRed = true;
    }
  }
  if (frame.signal === "green" && next.stoppedAtRed && speed >= 4) {
    next.droveOnGreen = true;
  }
  if (
    next.maxSpeedKmh > 0 &&
    frame.roadName &&
    frame.startRoad &&
    frame.roadName !== frame.startRoad
  ) {
    next.leftStartRoad = true;
  }
  return next;
}

function noteActor(facts: ManeuverFacts, actor: ManeuverActor, speedMps: number): void {
  const gap = actor.gapMeters;
  if (actor.kind === "person") {
    if (gap < 28) {
      facts.sawPerson = true;
    }
    if (actor.ahead && gap < 9 && speedMps < 1.2) {
      facts.stoppedNearPerson = true;
    }
    if (facts.sawPerson && (!actor.ahead || gap > 14) && speedMps > 2) {
      facts.passedPerson = true;
    }
  }
  if (actor.kind === "cyclist") {
    if (gap < 16) {
      facts.sawCyclist = true;
    }
    if (gap < 4 && speedMps > 4) {
      facts.closeToCyclist = true;
    }
  }
  if (actor.kind === "works" && actor.ahead && gap < 14) {
    facts.sawWorks = true;
    if (speedMps < 6) {
      facts.slowAtWorks = true;
    }
    if (facts.leftMost != null && facts.rightMost != null) {
      const swing = facts.leftMost - facts.rightMost;
      if (swing >= 0.7 || Math.abs(facts.leftMost) >= 0.7 || Math.abs(facts.rightMost) >= 0.7) {
        facts.asideAtWorks = true;
      }
    }
  }
  if (actor.kind === "railway") {
    if (gap < 30) {
      facts.sawRailway = true;
    }
    if (actor.ahead && gap >= 4 && gap < 12 && speedMps < 1) {
      facts.stoppedAtRailway = true;
    }
    if (facts.sawRailway && facts.stoppedAtRailway && (!actor.ahead || gap < 3) && speedMps > 2) {
      facts.passedRailway = true;
    }
  }
}

export function headingSpan(facts: ManeuverFacts): number {
  return facts.headingHigh - facts.headingLow;
}

export function reviewManeuver(
  moment: ManeuverId,
  facts: ManeuverFacts,
  live: { speedKmh: number; roadName: string | null; startRoad: string | null },
): PracticeReview {
  const points = pointsFor(moment, facts, live);
  const good = points.filter((item) => item.mark === "bra").length;
  return {
    score: points.length === 0 ? 0 : Math.round((good / points.length) * 100),
    points,
    live: points.find((item) => item.mark === "träna")?.detail ?? "Övningen är körd.",
  };
}

export function maneuverPassed(
  moment: ManeuverId,
  facts: ManeuverFacts,
  live: { speedKmh: number; roadName: string | null; startRoad: string | null },
): boolean {
  return reviewManeuver(moment, facts, live).points.every((item) => item.mark === "bra");
}

function pointsFor(
  moment: ManeuverId,
  facts: ManeuverFacts,
  live: { speedKmh: number },
): PracticeReview["points"] {
  const stopped = live.speedKmh === 0 && facts.brakeUsed && facts.maxSpeedKmh >= 8;
  if (moment === "handling") {
    return [
      point("Ettan", facts.usedFirst, facts.usedFirst ? "Ettan är vald." : "Välj växel 1 på knappen."),
      point(
        "Drive",
        facts.usedDrive && facts.maxSpeedKmh >= 8,
        facts.maxSpeedKmh >= 8 ? `Högsta fart ${facts.maxSpeedKmh} km/h i drive.` : "Välj D med F och gasa en kort bit.",
      ),
      point(
        "Back",
        facts.usedReverse && facts.reverseMeters >= 2,
        facts.reverseMeters >= 2
          ? `Backade ${facts.reverseMeters.toFixed(0)} m.`
          : "Välj R och rulla en kort bit bakåt.",
      ),
      point("Stanna", stopped, stopped ? "Bilen stannade med broms." : "Bromsa tills mätaren visar 0."),
    ];
  }
  if (moment === "hill") {
    const held = facts.brakeUsed && facts.rollMeters <= 2.5 && facts.maxSpeedKmh >= 8;
    return [
      point(
        "Håll",
        facts.brakeUsed,
        facts.brakeUsed ? "Bromsen höll bilen." : "Håll bromsen så bilen inte rullar bakåt i backen.",
      ),
      point(
        "Rull",
        facts.rollMeters <= 2.5,
        facts.rollMeters <= 2.5
          ? `Bilen rullade ${facts.rollMeters.toFixed(1)} m bakåt.`
          : `Bilen rullade ${facts.rollMeters.toFixed(1)} m bakåt. Håll broms eller gas i drive.`,
      ),
      point(
        "Iväg",
        held,
        facts.maxSpeedKmh >= 8 ? `Högsta fart ${facts.maxSpeedKmh} km/h uppför.` : "Gasa i drive när bromsen håller, och kör iväg.",
      ),
    ];
  }
  if (moment === "lanes") {
    const swung = laneSwing(facts);
    return [
      point("Fart", facts.maxSpeedKmh >= 12, facts.maxSpeedKmh >= 12 ? `Högsta fart ${facts.maxSpeedKmh} km/h.` : "Kör minst 12 km/h."),
      point(
        "Filbyte",
        swung,
        swung
          ? "Du har varit till vänster och till höger om mittlinjen."
          : "Styr vänster och höger så bilen byter sida. Stanna kvar på vägen.",
      ),
    ];
  }
  if (moment === "reverse") {
    const backed = facts.reverseMeters >= 8;
    return [
      point("Backa", backed, backed ? `Backade ${facts.reverseMeters.toFixed(0)} m.` : "Välj R och backa minst 8 meter."),
      point("Stanna", backed && stopped, stopped ? "Bilen stannade efter backningen." : "Bromsa tills mätaren visar 0."),
    ];
  }
  if (moment === "turn") {
    const span = headingSpan(facts);
    const turned = span >= 120;
    const backed = facts.reverseMeters >= 4;
    return [
      point("Backa", backed, backed ? `Backade ${facts.reverseMeters.toFixed(0)} m.` : "Backa en bit med R medan du styr."),
      point("Vänd", turned, turned ? `Riktningen ändrades ${Math.round(span)} grader.` : "Sväng tills bilen har vänt minst 120 grader."),
      point("Stanna", turned && stopped, stopped ? "Bilen står stilla efter vändningen." : "Stanna när vändningen är klar."),
    ];
  }
  if (moment === "crossing") {
    const cyclistOk = facts.sawCyclist && !facts.closeToCyclist;
    return [
      point(
        "Gående",
        facts.stoppedNearPerson && facts.passedPerson,
        facts.stoppedNearPerson
          ? facts.passedPerson
            ? "Du stannade för den gående och körde vidare."
            : "Kör vidare när den gående har passerat."
          : "Stanna när den gående är framför bilen.",
      ),
      point(
        "Cykel",
        cyclistOk,
        facts.closeToCyclist
          ? "Du kom för nära cyklisten i fart. Släpp gasen och lämna lucka."
          : facts.sawCyclist
            ? "Du lämnade lucka till cyklisten."
            : "Kör fram till cyklisten och håll avstånd.",
      ),
      point("Placering", inLane(facts), placementText(facts)),
    ];
  }
  if (moment === "lights") {
    return [
      point(
        "Rött",
        facts.stoppedAtRed && facts.sawRed,
        facts.stoppedAtRed ? "Du stannade vid rött." : "Stanna vid den röda signalen. Den slår om när bilen står stilla.",
      ),
      point("Grönt", facts.droveOnGreen, facts.droveOnGreen ? "Du körde när det blev grönt." : "Kör vidare först när signalen visar grönt."),
      point("Placering", inLane(facts), placementText(facts)),
    ];
  }
  if (moment === "hazard") {
    const pace = facts.maxSpeedKmh >= 12 && facts.maxSpeedKmh <= 36;
    return [
      point(
        "Fart",
        pace,
        pace
          ? `Högsta fart ${facts.maxSpeedKmh} km/h i regn och dimma.`
          : facts.maxSpeedKmh > 36
            ? `${facts.maxSpeedKmh} km/h är för fort när sikten är dålig. Sikta på 12–36 km/h.`
            : "Kör, men håll 12–36 km/h i regn och dimma.",
      ),
      point("Placering", inLane(facts), placementText(facts)),
    ];
  }
  if (moment === "ice") {
    const pace = facts.maxSpeedKmh >= 8 && facts.maxSpeedKmh <= 22;
    return [
      point(
        "Fart",
        pace,
        pace
          ? `Högsta fart ${facts.maxSpeedKmh} km/h på halka.`
          : facts.maxSpeedKmh > 22
            ? `${facts.maxSpeedKmh} km/h är för fort på halka. Håll 8–22 km/h.`
            : "Rulla igång och håll 8–22 km/h. Bromssträckan är längre.",
      ),
      point("Placering", inLane(facts), placementText(facts)),
    ];
  }
  if (moment === "works") {
    return [
      point("Sakta", facts.sawWorks && facts.slowAtWorks, facts.slowAtWorks ? "Du sänkte farten vid vägarbetet." : "Sakta ner under 22 km/h vid vägarbetet."),
      point(
        "Placering",
        facts.asideAtWorks && inLane(facts),
        facts.asideAtWorks ? "Du flyttade bilen i sidled och stannade på vägen." : "Håll ut lite och stanna kvar på körbanan.",
      ),
    ];
  }
  if (moment === "railway") {
    return [
      point(
        "Stanna",
        facts.stoppedAtRailway,
        facts.stoppedAtRailway ? "Du stannade före järnvägskorsningen." : "Stanna helt före märket Järnväg.",
      ),
      point("Kör", facts.passedRailway, facts.passedRailway ? "Du körde över efter stoppet." : "Kör vidare när du har stannat."),
    ];
  }
  const pace = facts.maxSpeedKmh >= 10 && facts.maxSpeedKmh <= 45;
  return [
    point("Fart", pace, pace ? `Högsta fart ${facts.maxSpeedKmh} km/h.` : "Kör genom situationen i högst 45 km/h."),
    point("Broms", facts.brakeUsed, facts.brakeUsed ? "Du använde bromsen." : "Bromsa någonstans under färden."),
    point("Blinkers", facts.indicatorUsed, facts.indicatorUsed ? "Du använde blinkers." : "Blanka innan du svänger."),
    point("Placering", inLane(facts), placementText(facts)),
    point(
      "Gata",
      facts.leftStartRoad,
      facts.leftStartRoad ? "Du lämnade startgatan." : "Sväng ut från Regeringsgatan. Provet är inte klart på samma gata.",
    ),
  ];
}

function laneSwing(facts: ManeuverFacts): boolean {
  if (facts.leftMost == null || facts.rightMost == null) {
    return false;
  }
  return facts.leftMost >= 0.8 && facts.rightMost <= -0.8 && facts.leftMost - facts.rightMost >= 2.2 && facts.leftMost <= 4.5;
}

function inLane(facts: ManeuverFacts): boolean {
  if (facts.leftMost == null || facts.rightMost == null) {
    return false;
  }
  return Math.max(Math.abs(facts.leftMost), Math.abs(facts.rightMost)) <= 4;
}

function placementText(facts: ManeuverFacts): string {
  if (facts.leftMost == null || facts.rightMost == null) {
    return "Sidoläget mäts när bilen rullar. Håll dig på körbanan.";
  }
  const worst = Math.max(Math.abs(facts.leftMost), Math.abs(facts.rightMost));
  return worst <= 4
    ? `${worst.toFixed(1)} m från mittlinjen.`
    : `${worst.toFixed(1)} m från mittlinjen. Tillbaka till körbanan.`;
}

function point(title: string, ok: boolean, detail: string): PracticeReview["points"][number] {
  return { title, mark: ok ? "bra" : "träna", detail };
}

function signedDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function maneuverTitle(moment: ManeuverId): string {
  switch (moment) {
    case "handling":
      return "Grundläggande bilhantering";
    case "hill":
      return "Start i backe";
    case "lanes":
      return "Körfält och filbyte";
    case "reverse":
      return "Backning";
    case "turn":
      return "Vändning";
    case "crossing":
      return "Gående och cyklister";
    case "lights":
      return "Trafikljus";
    case "hazard":
      return "Regn och dimma";
    case "ice":
      return "Halka";
    case "works":
      return "Vägarbete";
    case "railway":
      return "Järnvägskorsning";
    case "exam":
      return "Simulerat körprov";
  }
}

export function maneuverMission(moment: ManeuverId): string {
  switch (moment) {
    case "handling":
      return "Prova växlarna. 1, D med F, och R. Kör fram en bit, backa en kort bit och stanna med bromsen. P är park och N är fri. G växlar vidare.";
    case "hill":
      return "Backen är simulerad på den här gatan, eftersom kartan saknar lutning. Håll bromsen, välj D och gasa iväg utan att rulla mer än någon meter bakåt.";
    case "lanes":
      return "Kör fram och byt sida. Styr vänster och höger så bilen passerar båda sidor om mittlinjen, och stanna på vägen.";
    case "reverse":
      return "Välj R och backa minst 8 meter. Styr vid behov. Bromsa tills bilen står stilla.";
    case "turn":
      return "Vänd bilen. Backa med R medan du styr, kör fram igen, och stanna när riktningen har ändrats minst 120 grader.";
    case "crossing":
      return "En gående och en cyklist är övningsfigurer på den här gatan, inte ett rikstäckande flöde. Stanna för den gående och lämna lucka till cyklisten.";
    case "lights":
      return "Signalen är en övningslampa på gatan. Den är röd tills du stannar vid den, och blir sedan grön. Kör först då.";
    case "hazard":
      return "Det regnar och sikten är dålig. Greppet och bromsen är sämre. Håll 12–36 km/h och stanna i körfältet.";
    case "ice":
      return "Vägen är hal. Styrningen tar mindre och bromssträckan är längre. Håll 8–22 km/h.";
    case "works":
      return "Vägarbete-märket står på den här gatan som övning, inte som ett riktigt arbete i kartan. Sakta ner under 22 km/h och håll ut lite.";
    case "railway":
      return "Järnväg-märket är en övning på gatan. Kartan har ingen riktig plankorsning här. Stanna helt före märket och kör sedan vidare.";
    case "exam":
      return "Ett simulerat körprov i spelet, inte Trafikverkets prov. Kör genom korsningen: bromsa, blinka, håll körfältet under 45 km/h och lämna Regeringsgatan.";
  }
}

export function maneuverJudged(moment: ManeuverId): readonly string[] {
  switch (moment) {
    case "handling":
      return ["Växlarna ska användas, inte bara synas. Backväxeln räknas när bilen rullar bakåt."];
    case "hill":
      return ["Bromsen ska hålla bilen i den simulerade backen. Att rulla långt bakåt är underkänt i övningen."];
    case "lanes":
      return ["Filbytet räknas när bilen har varit på båda sidor om mittlinjen och fortfarande är på vägen."];
    case "reverse":
      return ["Backningen räknas i meter med växel R, och bilen ska stå stilla efteråt."];
    case "turn":
      return ["Vändningen kräver både backning och en verklig riktningsändring, inte bara att nå en punkt."];
    case "crossing":
      return ["Du ska stanna när den gående är nära framför bilen, och inte köra ikapp cyklisten."];
    case "lights":
      return ["Rött betyder stanna. Grönt tänds efter stoppet. Att köra på rött ger inte poäng."];
    case "hazard":
      return ["Regn och dimma sänker greppet. För hög fart är fel även om du når slutet av gatan."];
    case "ice":
      return ["Halka sänker grepp och broms. Farten ska vara låg och bilen ska stanna i körfältet."];
    case "works":
      return ["Vid vägarbetet ska farten ner och bilen flyttas i sidled utan att lämna vägen."];
    case "railway":
      return ["Stanna helt före märket. Att rulla över utan stopp räknas inte."];
    case "exam":
      return [
        "Provet är en sammanhängande körning i korsningen: fart, broms, blinkers, placering och att lämna startgatan.",
        "Resultatet sparas som träning. Det är inte ett körkort och inte Trafikverkets prov.",
      ];
  }
}
