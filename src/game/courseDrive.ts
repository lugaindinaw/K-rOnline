import type { PracticeReview } from "./cityPractice";
import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";

export type CourseCar = {
  id: string;
  position: RoadPoint;
  headingDegrees: number;
};

export type CourseFrame = {
  speedMps: number;
  headingDegrees: number;
  offsetMeters: number;
  highway: string | null;
  cars: readonly CourseCar[];
};

export type CourseFacts = {
  maxSpeedKmh: number;
  maxSpeedOnLinkKmh: number;
  maxSpeedOnMotorwayKmh: number;
  joinSpeedKmh: number | null;
  leftMostMeters: number | null;
  rightMostMeters: number | null;
  sawRightSide: boolean;
  sawMotorwayRight: boolean;
  sawMotorwayLeft: boolean;
  motorwayLeftMeters: number | null;
  motorwayRightMeters: number | null;
  headingSpanDegrees: number;
  lastHeading: number | null;
  headingUnwrapped: number;
  headingLow: number;
  headingHigh: number;
  metOncoming: boolean;
  metWhileRight: boolean;
  hitOncoming: boolean;
  closestOncomingMeters: number | null;
  leadSeen: boolean;
  closestLeadMeters: number | null;
  goodGap: boolean;
  tooClose: boolean;
  safeOvertake: boolean;
  unsafeOvertake: boolean;
  sawConflict: boolean;
  conflictCross: boolean;
  sawMotorway: boolean;
  sawExit: boolean;
  aheadIds: string[];
};

export const EMPTY_COURSE: CourseFacts = {
  maxSpeedKmh: 0,
  maxSpeedOnLinkKmh: 0,
  maxSpeedOnMotorwayKmh: 0,
  joinSpeedKmh: null,
  leftMostMeters: null,
  rightMostMeters: null,
  sawRightSide: false,
  sawMotorwayRight: false,
  sawMotorwayLeft: false,
  motorwayLeftMeters: null,
  motorwayRightMeters: null,
  headingSpanDegrees: 0,
  lastHeading: null,
  headingUnwrapped: 0,
  headingLow: 0,
  headingHigh: 0,
  metOncoming: false,
  metWhileRight: false,
  hitOncoming: false,
  closestOncomingMeters: null,
  leadSeen: false,
  closestLeadMeters: null,
  goodGap: false,
  tooClose: false,
  safeOvertake: false,
  unsafeOvertake: false,
  sawConflict: false,
  conflictCross: false,
  sawMotorway: false,
  sawExit: false,
  aheadIds: [],
};

function headingDelta(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

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

function point(title: string, ok: boolean, detail: string) {
  return { title, mark: ok ? ("bra" as const) : ("träna" as const), detail };
}

function roundKmh(speed: number): number {
  return Math.round(speed);
}

export function noteCourseFrame(facts: CourseFacts, frame: CourseFrame, position: RoadPoint): CourseFacts {
  const next: CourseFacts = { ...facts, aheadIds: [...facts.aheadIds] };
  const speedKmh = Math.max(0, frame.speedMps) * 3.6;
  const highway = frame.highway ?? "";
  const onLink = highway.endsWith("_link");
  const onMotorway = highway === "motorway";
  next.maxSpeedKmh = Math.max(next.maxSpeedKmh, speedKmh);
  if (onLink && !facts.sawMotorway) {
    next.maxSpeedOnLinkKmh = Math.max(facts.maxSpeedOnLinkKmh, speedKmh);
  }
  if (onMotorway) {
    if (!facts.sawMotorway) {
      next.joinSpeedKmh = speedKmh;
    }
    next.sawMotorway = true;
    next.maxSpeedOnMotorwayKmh = Math.max(facts.maxSpeedOnMotorwayKmh, speedKmh);
  }
  if (facts.sawMotorway && onLink) {
    next.sawExit = true;
  }
  if (speedKmh >= 20 && Number.isFinite(frame.offsetMeters)) {
    next.leftMostMeters =
      facts.leftMostMeters == null ? frame.offsetMeters : Math.max(facts.leftMostMeters, frame.offsetMeters);
    next.rightMostMeters =
      facts.rightMostMeters == null ? frame.offsetMeters : Math.min(facts.rightMostMeters, frame.offsetMeters);
    if (frame.offsetMeters < -0.35) {
      next.sawRightSide = true;
    }
    if (onMotorway && speedKmh >= 60 && frame.offsetMeters > 0.8) {
      next.sawMotorwayLeft = true;
    }
    if (onMotorway && speedKmh >= 60 && frame.offsetMeters < -0.8) {
      next.sawMotorwayRight = true;
    }
    if (onMotorway && speedKmh >= 60) {
      next.motorwayLeftMeters =
        facts.motorwayLeftMeters == null
          ? frame.offsetMeters
          : Math.max(facts.motorwayLeftMeters, frame.offsetMeters);
      next.motorwayRightMeters =
        facts.motorwayRightMeters == null
          ? frame.offsetMeters
          : Math.min(facts.motorwayRightMeters, frame.offsetMeters);
    }
    if (facts.lastHeading == null) {
      next.lastHeading = frame.headingDegrees;
    } else {
      next.headingUnwrapped = facts.headingUnwrapped + signedDelta(facts.lastHeading, frame.headingDegrees);
      next.lastHeading = frame.headingDegrees;
      next.headingLow = Math.min(facts.headingLow, next.headingUnwrapped);
      next.headingHigh = Math.max(facts.headingHigh, next.headingUnwrapped);
      next.headingSpanDegrees = next.headingHigh - next.headingLow;
    }
  }
  return noteCars(next, facts, frame, position, speedKmh, onMotorway);
}

function noteCars(
  next: CourseFacts,
  previous: CourseFacts,
  frame: CourseFrame,
  position: RoadPoint,
  speedKmh: number,
  onMotorway: boolean,
): CourseFacts {
  const aheadNow: string[] = [];
  let oncomingClose = false;
  for (const car of frame.cars) {
    const gap = distanceMeters(position, car.position);
    if (!Number.isFinite(gap)) {
      continue;
    }
    const oncoming = headingDelta(frame.headingDegrees, car.headingDegrees) > 125;
    if (oncoming && gap < 90) {
      oncomingClose = true;
    }
  }
  for (const car of frame.cars) {
    const gap = distanceMeters(position, car.position);
    if (!Number.isFinite(gap) || gap < 0.4) {
      continue;
    }
    const direction = bearing(position, car.position);
    const ahead = headingDelta(frame.headingDegrees, direction) < 55;
    const same = headingDelta(frame.headingDegrees, car.headingDegrees) < 50;
    const oncoming = headingDelta(frame.headingDegrees, car.headingDegrees) > 125;
    if (oncoming && ahead && gap < 28) {
      next.metOncoming = true;
      next.closestOncomingMeters =
        next.closestOncomingMeters == null ? gap : Math.min(next.closestOncomingMeters, gap);
      if (frame.offsetMeters <= 0.2) {
        next.metWhileRight = true;
      }
      if (gap < 1.15) {
        next.hitOncoming = true;
      }
    }
    if (!same || !ahead) {
      continue;
    }
    next.leadSeen = true;
    aheadNow.push(car.id);
    next.closestLeadMeters = next.closestLeadMeters == null ? gap : Math.min(next.closestLeadMeters, gap);
    if (onMotorway && speedKmh >= 75 && gap >= 12 && gap <= 60) {
      next.goodGap = true;
    }
    if (onMotorway && speedKmh >= 75 && gap < 8) {
      next.tooClose = true;
    }
    if (oncomingClose && gap < 70) {
      next.sawConflict = true;
      if (frame.offsetMeters > 0.55) {
        next.conflictCross = true;
      }
    }
  }
  for (const id of previous.aheadIds) {
    if (aheadNow.includes(id)) {
      continue;
    }
    const car = frame.cars.find((item) => item.id === id);
    if (!car) {
      continue;
    }
    const gap = distanceMeters(position, car.position);
    const direction = bearing(position, car.position);
    const behind = headingDelta(frame.headingDegrees, direction) > 110;
    const same = headingDelta(frame.headingDegrees, car.headingDegrees) < 50;
    if (!same || !behind || gap > 45) {
      continue;
    }
    if (frame.offsetMeters > 0.45) {
      if (oncomingClose) {
        next.unsafeOvertake = true;
      } else {
        next.safeOvertake = true;
      }
    }
  }
  next.aheadIds = aheadNow;
  return next;
}

function heldBack(facts: CourseFacts): boolean {
  return facts.sawConflict && !facts.conflictCross && !facts.unsafeOvertake;
}

export function reviewCourse(moment: "rural" | "motorway", facts: CourseFacts): PracticeReview {
  if (moment === "motorway") {
    return reviewMotorway(facts);
  }
  return reviewRural(facts);
}

function reviewRural(facts: CourseFacts): PracticeReview {
  const speed = roundKmh(facts.maxSpeedKmh);
  const speedOk = speed >= 58 && speed <= 82;
  const placed =
    facts.sawRightSide &&
    facts.leftMostMeters != null &&
    facts.leftMostMeters <= 0.45 &&
    facts.rightMostMeters != null &&
    facts.rightMostMeters >= -4.8;
  const curved = facts.headingSpanDegrees >= 15 && facts.leftMostMeters != null && facts.leftMostMeters <= 0.8;
  const met = facts.metOncoming && facts.metWhileRight && !facts.hitOncoming;
  const overtake = !facts.unsafeOvertake && (facts.safeOvertake || heldBack(facts));
  const points = [
    point(
      "Fart",
      speedOk,
      speedOk
        ? `Högsta fart ${speed} km/h. Gränsen på Färentunavägen är 70.`
        : speed > 82
          ? `${speed} km/h är över gränsen 70. Släpp gasen.`
          : `Kom upp kring 70 km/h. Nu är högsta farten ${speed} km/h.`,
    ),
    point(
      "Placering",
      placed,
      placed
        ? "Du höll höger sida och lämnade mötande körfält."
        : "Håll till höger om mittlinjen. Vänster sida är mötande körfält.",
    ),
    point(
      "Kurva",
      curved,
      curved
        ? `Vägen svängde ${Math.round(facts.headingSpanDegrees)} grader och du följde den.`
        : "Följ kurvan och håll dig på höger sida.",
    ),
    point(
      "Möte",
      met,
      facts.hitOncoming
        ? "Mötet blev för tätt. Håll höger och lämna plats."
        : met
          ? "Du mötte en bil och låg kvar på höger sida."
          : "En mötande bil kommer. Håll höger när den passerar.",
    ),
    point(
      "Omkörning",
      overtake,
      facts.unsafeOvertake
        ? "Omkörningen skedde när mötande körfält inte var fritt."
        : facts.safeOvertake
          ? "Omkörningen gjordes när ingen möttes i det andra körfältet."
          : heldBack(facts)
            ? "Du stannade på höger sida medan mötet pågick."
            : "Kör ikapp bilen framför. Kör om bara när mötande körfält är fritt, annars stanna bakom.",
    ),
  ];
  return {
    score: Math.round((points.filter((item) => item.mark === "bra").length / points.length) * 100),
    points,
    live: points.find((item) => item.mark === "träna")?.detail ?? "Landsvägssträckan är körd.",
  };
}

function reviewMotorway(facts: CourseFacts): PracticeReview {
  const ramp = roundKmh(facts.maxSpeedOnLinkKmh);
  const joined = facts.joinSpeedKmh == null ? 0 : roundKmh(facts.joinSpeedKmh);
  const rampOk = ramp >= 60 || joined >= 70;
  const speed = roundKmh(facts.maxSpeedOnMotorwayKmh);
  const speedOk = speed >= 90 && speed <= 112;
  const soFar = roundKmh(facts.maxSpeedKmh);
  const swing =
    facts.motorwayLeftMeters != null && facts.motorwayRightMeters != null
      ? facts.motorwayLeftMeters - facts.motorwayRightMeters
      : 0;
  const lanes =
    facts.sawMotorwayLeft &&
    facts.sawMotorwayRight &&
    swing >= 2.2 &&
    facts.motorwayLeftMeters != null &&
    facts.motorwayLeftMeters < 6;
  const gapOk = facts.goodGap && !facts.tooClose;
  const exitOk = facts.sawMotorway && facts.sawExit;
  const points = [
    point(
      "Påfart",
      rampOk,
      rampOk
        ? `Du accelererade på påfarten till ${Math.max(ramp, joined)} km/h.`
        : "Accelerera på påfarten. Påfartens gräns är 80 km/h.",
    ),
    point(
      "Fart",
      speedOk,
      speedOk
        ? `Högsta fart på motorvägen ${speed} km/h. Gränsen här är 100.`
        : speed > 112
          ? `${speed} km/h är över gränsen 100.`
          : facts.sawMotorway
            ? `Håll motorvägsfart kring 100 km/h. Högsta fart på motorvägen är ${speed} km/h.`
            : `Fortsätt från påfarten upp på motorvägen. Högsta fart hittills är ${soFar} km/h.`,
    ),
    point(
      "Körfält",
      lanes,
      lanes
        ? "Du bytte körfält på motorvägen och stannade på körbanan."
        : "Lägg dig i höger körfält och byt sedan ett körfält åt vänster. Använd A och D.",
    ),
    point(
      "Avstånd",
      gapOk,
      facts.tooClose
        ? "Avståndet till bilen framför blev för kort i motorvägsfart."
        : gapOk
          ? "Du höll ett avstånd till bilen framför."
          : "Håll ett avstånd till bilen framför, ungefär ett par sekunder.",
    ),
    point(
      "Avfart",
      exitOk,
      exitOk ? "Du lämnade motorvägen via avfarten." : "Ta avfarten till höger när den kommer. Styr höger mot länken.",
    ),
  ];
  return {
    score: Math.round((points.filter((item) => item.mark === "bra").length / points.length) * 100),
    points,
    live: points.find((item) => item.mark === "träna")?.detail ?? "Motorvägssträckan är körd.",
  };
}

export function courseComplete(moment: "rural" | "motorway", facts: CourseFacts): boolean {
  return reviewCourse(moment, facts).points.every((item) => item.mark === "bra");
}
