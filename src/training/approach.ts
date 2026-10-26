import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import type { RoadEdge, RoadNetwork } from "../roads/roadNetwork";
import { roadEndKind } from "../traffic/traffic";

export const EXERCISE_TITLE = "Närma dig en korsning";
export const EXERCISE_INSTRUCTION = "Närma dig korsningen och observera trafiken.";
export const MISSING_JUNCTION_MESSAGE = "Ingen lämplig korsning finns i det laddade vägnätet.";

export const APPROACH_METERS = 40;
const LEAD_IN_METERS = 30;
const MIN_EDGE_METERS = 30;
const RECORD_CLEARANCE_METERS = 4;
const STOP_SPEED_MPS = 0.4;
const MOVE_SPEED_MPS = 1;
const SLOW_DROP_KMH = 4;
export const NEAR_CAR_METERS = 22;

export type ApproachStart = {
  edgeId: string;
  distanceMeters: number;
  lengthMeters: number;
  toNode: string;
  junction: RoadPoint;
  kind: "branch" | "crossing";
  roadName: string | null;
};

export type DriveSample = {
  speedMps: number;
  edgeId: string;
  distanceMeters: number;
  position: RoadPoint;
  mode: "driving" | "choose" | "ended";
  traffic: { position: RoadPoint }[];
};

export type ApproachAttempt = {
  status: "idle" | "running" | "finished";
  completed: boolean;
  endedEarly: boolean;
  moved: boolean;
  reachedApproach: boolean;
  approachSpeedKmh: number | null;
  minApproachKmh: number | null;
  maxApproachKmh: number | null;
  slowedDown: boolean;
  stoppedBefore: boolean;
  continuedWhileNear: boolean;
  sawNearbyCar: boolean;
};

export type ApproachFeedback = {
  good: string[];
  improve: string[];
  events: string[];
};

export function idleAttempt(): ApproachAttempt {
  return {
    status: "idle",
    completed: false,
    endedEarly: false,
    moved: false,
    reachedApproach: false,
    approachSpeedKmh: null,
    minApproachKmh: null,
    maxApproachKmh: null,
    slowedDown: false,
    stoppedBefore: false,
    continuedWhileNear: false,
    sawNearbyCar: false,
  };
}

export function beginAttempt(): ApproachAttempt {
  return { ...idleAttempt(), status: "running" };
}

export function finishAttempt(attempt: ApproachAttempt): ApproachAttempt {
  if (attempt.status !== "running") {
    return attempt;
  }
  return {
    ...attempt,
    status: "finished",
    endedEarly: !attempt.completed,
  };
}

function junctionPoint(edge: RoadEdge): RoadPoint | null {
  return edge.points[edge.points.length - 1] ?? null;
}

export function findApproachStart(network: RoadNetwork): ApproachStart | null {
  const candidates: ApproachStart[] = [];
  for (const edge of network.edges) {
    const kind = roadEndKind(network, edge);
    if ((kind !== "branch" && kind !== "crossing") || edge.lengthMeters < MIN_EDGE_METERS) {
      continue;
    }
    const junction = junctionPoint(edge);
    if (!junction) {
      continue;
    }
    const distanceMeters = Math.max(0, edge.lengthMeters - APPROACH_METERS - LEAD_IN_METERS);
    if (edge.lengthMeters - distanceMeters < 15) {
      continue;
    }
    candidates.push({
      edgeId: edge.id,
      distanceMeters,
      lengthMeters: edge.lengthMeters,
      toNode: edge.toNode,
      junction,
      kind,
      roadName: edge.name,
    });
  }
  candidates.sort((left, right) => {
    const leftRun = left.lengthMeters - left.distanceMeters;
    const rightRun = right.lengthMeters - right.distanceMeters;
    if (rightRun !== leftRun) {
      return rightRun - leftRun;
    }
    return left.edgeId.localeCompare(right.edgeId);
  });
  return candidates[0] ?? null;
}

function kmh(speedMps: number): number {
  return Math.round(Math.max(0, speedMps) * 3.6);
}

function nearby(start: ApproachStart, sample: DriveSample): boolean {
  return sample.traffic.some((car) => distanceMeters(start.junction, car.position) < NEAR_CAR_METERS);
}

export function observeApproach(
  attempt: ApproachAttempt,
  start: ApproachStart,
  sample: DriveSample,
): ApproachAttempt {
  if (attempt.status !== "running") {
    return attempt;
  }
  if (!Number.isFinite(sample.speedMps) || !sample.edgeId || !Number.isFinite(sample.distanceMeters)) {
    return attempt;
  }
  const onApproach = sample.edgeId === start.edgeId;
  const remaining = onApproach ? start.lengthMeters - sample.distanceMeters : Number.POSITIVE_INFINITY;
  const inBand = onApproach && remaining <= APPROACH_METERS && remaining > RECORD_CLEARANCE_METERS;
  const completed = onApproach && (sample.mode === "choose" || remaining <= 2);
  let moved = attempt.moved;
  let reachedApproach = attempt.reachedApproach;
  let approachSpeedKmh = attempt.approachSpeedKmh;
  let minApproachKmh = attempt.minApproachKmh;
  let maxApproachKmh = attempt.maxApproachKmh;
  let slowedDown = attempt.slowedDown;
  let stoppedBefore = attempt.stoppedBefore;
  let continuedWhileNear = attempt.continuedWhileNear;
  let sawNearbyCar = attempt.sawNearbyCar;

  if (inBand) {
    const speedKmh = kmh(sample.speedMps);
    reachedApproach = true;
    if (approachSpeedKmh === null) {
      approachSpeedKmh = speedKmh;
    }
    if (moved && maxApproachKmh !== null && speedKmh <= maxApproachKmh - SLOW_DROP_KMH) {
      slowedDown = true;
    }
    if (maxApproachKmh === null || speedKmh > maxApproachKmh) {
      maxApproachKmh = speedKmh;
    }
    if (minApproachKmh === null || speedKmh < minApproachKmh) {
      minApproachKmh = speedKmh;
    }
    if (attempt.moved && sample.speedMps <= STOP_SPEED_MPS) {
      stoppedBefore = true;
    }
    if (sample.speedMps > 0.8) {
      moved = true;
    }
    if (nearby(start, sample)) {
      sawNearbyCar = true;
      if (sample.speedMps > MOVE_SPEED_MPS) {
        continuedWhileNear = true;
      }
    }
  }

  const next: ApproachAttempt = {
    status: completed ? "finished" : "running",
    completed,
    endedEarly: false,
    moved,
    reachedApproach,
    approachSpeedKmh,
    minApproachKmh,
    maxApproachKmh,
    slowedDown,
    stoppedBefore,
    continuedWhileNear,
    sawNearbyCar,
  };
  if (
    next.status === attempt.status &&
    next.completed === attempt.completed &&
    next.moved === attempt.moved &&
    next.reachedApproach === attempt.reachedApproach &&
    next.approachSpeedKmh === attempt.approachSpeedKmh &&
    next.minApproachKmh === attempt.minApproachKmh &&
    next.maxApproachKmh === attempt.maxApproachKmh &&
    next.slowedDown === attempt.slowedDown &&
    next.stoppedBefore === attempt.stoppedBefore &&
    next.continuedWhileNear === attempt.continuedWhileNear &&
    next.sawNearbyCar === attempt.sawNearbyCar
  ) {
    return attempt;
  }
  return next;
}

export function approachFeedback(attempt: ApproachAttempt): ApproachFeedback {
  const good: string[] = [];
  const improve: string[] = [];
  const events: string[] = [];

  if (attempt.approachSpeedKmh === null) {
    events.push("Ingen hastighet registrerades nära korsningen.");
  } else {
    events.push(`Hastighet när korsningen närmade sig: ${attempt.approachSpeedKmh} km/h.`);
    if (attempt.minApproachKmh !== null && attempt.maxApproachKmh !== null && attempt.minApproachKmh !== attempt.maxApproachKmh) {
      events.push(`Lägsta hastighet före korsningen: ${attempt.minApproachKmh} km/h.`);
      events.push(`Högsta hastighet före korsningen: ${attempt.maxApproachKmh} km/h.`);
    }
  }
  if (attempt.slowedDown) {
    const line = "Du sänkte hastigheten före korsningen.";
    good.push(line);
    events.push(line);
  } else if (attempt.reachedApproach) {
    improve.push("Hastigheten sjönk inte före korsningen.");
  }
  if (attempt.stoppedBefore) {
    const line = "Du stannade före korsningen.";
    good.push(line);
    events.push(line);
  } else if (attempt.reachedApproach) {
    improve.push("Du stannade inte före korsningen.");
  }
  if (attempt.sawNearbyCar && !attempt.continuedWhileNear) {
    events.push("En annan bil var nära korsningen.");
  }
  if (!attempt.sawNearbyCar && (attempt.reachedApproach || attempt.completed)) {
    events.push("Ingen annan bil registrerades nära korsningen.");
  }
  if (attempt.continuedWhileNear) {
    const line = "Du fortsatte medan en annan bil befann sig nära korsningen.";
    improve.push(line);
    events.push(line);
  }
  if (attempt.completed) {
    const line = "Övningen slutfördes.";
    good.push(line);
    events.push(line);
  } else if (attempt.endedEarly) {
    events.push("Övningen avslutades innan korsningen.");
    improve.push("Korsningen nåddes inte.");
  }
  if (good.length === 0) {
    good.push("Inget särskilt registrerades.");
  }
  if (improve.length === 0) {
    improve.push("Inget att förbättra utifrån det som registrerades.");
  }
  return { good, improve, events };
}
