import { distanceMeters, type RoadPoint } from "../roads/drivingRoads";
import type { RoadEdge, RoadNetwork } from "../roads/roadNetwork";
import { roadEndKind } from "../traffic/traffic";

export const EXERCISE_TITLE = "Närma dig en korsning";
export const EXERCISE_INSTRUCTION = "Närma dig korsningen och observera trafiken.";
export const MISSING_JUNCTION_MESSAGE = "Ingen lämplig korsning finns i det laddade vägnätet.";

export const APPROACH_METERS = 40;
const LEAD_IN_METERS = 30;
const MIN_EDGE_METERS = 30;
/** Samples closer than this can be the simulation's own brake. Max stop distance at 12 m/s is 9 m. */
const DRIVER_CLEARANCE_METERS = 10;
const MARK_TOLERANCE_METERS = 3;
const MAX_MARK_GAP_METERS = 8;
const JUNCTION_MATCH_METERS = 25;
const MAX_PATH_HOPS = 4;
const SPEED_MARKS = [40, 30, 20] as const;
const STOP_SPEED_MPS = 0.4;
const MOVE_SPEED_MPS = 1;
const SLOW_DROP_KMH = 4;
export const NEAR_CAR_METERS = 22;

export const FEEDBACK_DID_TITLE = "Det här gjorde du";
export const FEEDBACK_PRACTICE_TITLE = "Det här kan du träna på";
export const FEEDBACK_EVENTS_TITLE = "Händelser under övningen";
export const ADVICE_NOTE =
  "Råden är träningsförslag utifrån registrerade händelser, inte en officiell bedömning eller ett godkänt- eller underkäntresultat.";

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
  /** Live network after a refetch. Absent samples keep the original edge. */
  network?: RoadNetwork | null;
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
  /** Speed near 40, 30 and 20 m. Null means that distance was not measured. */
  speedAt40Kmh: number | null;
  speedAt30Kmh: number | null;
  speedAt20Kmh: number | null;
  slowdownKnown: boolean;
  slowedDown: boolean;
  /** Speed fell inside the last 10 m, where the simulation may brake by itself. */
  simZoneSlowdown: boolean;
  stoppedBefore: boolean;
  /** The simulation set speed to 0 at the junction point. */
  simulatedStop: boolean;
  lookedForTraffic: boolean;
  continuedWhileNear: boolean;
  sawNearbyCar: boolean;
  /** Last reliable distance to the target junction. Not a measurement result. */
  previousRemainingMeters: number | null;
};

export type ApproachFeedback = {
  did: string[];
  practice: string[];
  events: string[];
  adviceNote: string;
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
    speedAt40Kmh: null,
    speedAt30Kmh: null,
    speedAt20Kmh: null,
    slowdownKnown: false,
    slowedDown: false,
    simZoneSlowdown: false,
    stoppedBefore: false,
    simulatedStop: false,
    lookedForTraffic: false,
    continuedWhileNear: false,
    sawNearbyCar: false,
    previousRemainingMeters: null,
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

function junctionStillPresent(network: RoadNetwork, start: ApproachStart): boolean {
  return network.edges.some((edge) => {
    if (edge.toNode !== start.toNode) {
      return false;
    }
    const end = edge.points[edge.points.length - 1];
    return end !== undefined && distanceMeters(end, start.junction) <= JUNCTION_MATCH_METERS;
  });
}

function isReverseEdge(current: RoadEdge, candidate: RoadEdge): boolean {
  return (
    candidate.osmWayId === current.osmWayId &&
    candidate.fromNode === current.toNode &&
    candidate.toNode === current.fromNode
  );
}

function extraDistanceToNode(network: RoadNetwork, fromEdge: RoadEdge, targetNode: string): number | null {
  const queue: { node: string; distance: number; hops: number; prev: RoadEdge }[] = [
    { node: fromEdge.toNode, distance: 0, hops: 0, prev: fromEdge },
  ];
  const used = new Set<string>([fromEdge.id]);
  let found: number | null = null;
  let steps = 0;
  while (queue.length > 0 && steps < 64) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    steps += 1;
    if (item.node === targetNode) {
      if (found !== null) {
        return null;
      }
      found = item.distance;
      continue;
    }
    if (item.hops >= MAX_PATH_HOPS) {
      continue;
    }
    for (const edge of network.outgoing.get(item.node) ?? []) {
      if (used.has(edge.id) || isReverseEdge(item.prev, edge)) {
        continue;
      }
      used.add(edge.id);
      queue.push({
        node: edge.toNode,
        distance: item.distance + edge.lengthMeters,
        hops: item.hops + 1,
        prev: edge,
      });
    }
  }
  return steps >= 64 ? null : found;
}

/** Distance along the roads to the saved junction node, or null when that node cannot be followed. */
function resolveRemaining(start: ApproachStart, sample: DriveSample): number | null {
  const network = sample.network ?? null;
  if (network) {
    if (!junctionStillPresent(network, start)) {
      return null;
    }
    const edge = network.edgesById.get(sample.edgeId);
    if (!edge || sample.distanceMeters < 0 || sample.distanceMeters > edge.lengthMeters + 0.5) {
      return null;
    }
    const along = edge.lengthMeters - sample.distanceMeters;
    if (edge.toNode === start.toNode) {
      return along;
    }
    const extra = extraDistanceToNode(network, edge, start.toNode);
    return extra === null ? null : along + extra;
  }
  if (sample.edgeId !== start.edgeId) {
    return null;
  }
  return start.lengthMeters - sample.distanceMeters;
}

function passedMark(previous: number | null, remaining: number, mark: number): boolean {
  if (previous === null || !(previous > mark)) {
    return false;
  }
  if (previous - remaining > MAX_MARK_GAP_METERS) {
    return false;
  }
  return Math.abs(remaining - mark) <= MARK_TOLERANCE_METERS;
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
  const resolved = resolveRemaining(start, sample);
  const known = resolved !== null && Number.isFinite(resolved);
  const remaining = known ? resolved : Number.POSITIVE_INFINITY;
  const previousRemaining = attempt.previousRemainingMeters;
  const inDriverZone = known && remaining <= APPROACH_METERS && remaining > DRIVER_CLEARANCE_METERS;
  const completed = known && remaining <= 2 && (sample.mode === "choose" || sample.mode === "ended");
  let moved = attempt.moved;
  let reachedApproach = attempt.reachedApproach;
  let approachSpeedKmh = attempt.approachSpeedKmh;
  let minApproachKmh = attempt.minApproachKmh;
  let maxApproachKmh = attempt.maxApproachKmh;
  let speedAt40Kmh = attempt.speedAt40Kmh;
  let speedAt30Kmh = attempt.speedAt30Kmh;
  let speedAt20Kmh = attempt.speedAt20Kmh;
  let slowdownKnown = attempt.slowdownKnown;
  let slowedDown = attempt.slowedDown;
  let simZoneSlowdown = attempt.simZoneSlowdown;
  let stoppedBefore = attempt.stoppedBefore;
  let simulatedStop = attempt.simulatedStop;
  let lookedForTraffic = attempt.lookedForTraffic;
  let continuedWhileNear = attempt.continuedWhileNear;
  let sawNearbyCar = attempt.sawNearbyCar;

  if (known && remaining <= APPROACH_METERS) {
    lookedForTraffic = true;
    if (nearby(start, sample)) {
      sawNearbyCar = true;
      if (sample.speedMps > MOVE_SPEED_MPS && remaining > DRIVER_CLEARANCE_METERS) {
        continuedWhileNear = true;
      }
    }
  }
  if (known && (sample.mode === "choose" || sample.mode === "ended") && remaining <= 2) {
    simulatedStop = true;
  }
  if (
    known &&
    remaining <= DRIVER_CLEARANCE_METERS &&
    attempt.maxApproachKmh !== null &&
    kmh(sample.speedMps) <= attempt.maxApproachKmh - SLOW_DROP_KMH
  ) {
    simZoneSlowdown = true;
  }
  if (known && sample.speedMps > 0.8) {
    const speedKmh = kmh(sample.speedMps);
    if (speedAt40Kmh === null && passedMark(previousRemaining, remaining, SPEED_MARKS[0])) {
      speedAt40Kmh = speedKmh;
    }
    if (speedAt30Kmh === null && passedMark(previousRemaining, remaining, SPEED_MARKS[1])) {
      speedAt30Kmh = speedKmh;
    }
    if (speedAt20Kmh === null && passedMark(previousRemaining, remaining, SPEED_MARKS[2])) {
      speedAt20Kmh = speedKmh;
    }
  }

  if (inDriverZone) {
    const speedKmh = kmh(sample.speedMps);
    reachedApproach = true;
    if (approachSpeedKmh === null) {
      approachSpeedKmh = speedKmh;
    }
    if (moved && maxApproachKmh !== null) {
      slowdownKnown = true;
      if (speedKmh <= maxApproachKmh - SLOW_DROP_KMH) {
        slowedDown = true;
      }
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
    speedAt40Kmh,
    speedAt30Kmh,
    speedAt20Kmh,
    slowdownKnown,
    slowedDown,
    simZoneSlowdown,
    stoppedBefore,
    simulatedStop,
    lookedForTraffic,
    continuedWhileNear,
    sawNearbyCar,
    previousRemainingMeters: known ? remaining : null,
  };
  if (
    next.status === attempt.status &&
    next.completed === attempt.completed &&
    next.moved === attempt.moved &&
    next.reachedApproach === attempt.reachedApproach &&
    next.approachSpeedKmh === attempt.approachSpeedKmh &&
    next.minApproachKmh === attempt.minApproachKmh &&
    next.maxApproachKmh === attempt.maxApproachKmh &&
    next.speedAt40Kmh === attempt.speedAt40Kmh &&
    next.speedAt30Kmh === attempt.speedAt30Kmh &&
    next.speedAt20Kmh === attempt.speedAt20Kmh &&
    next.slowdownKnown === attempt.slowdownKnown &&
    next.slowedDown === attempt.slowedDown &&
    next.simZoneSlowdown === attempt.simZoneSlowdown &&
    next.stoppedBefore === attempt.stoppedBefore &&
    next.simulatedStop === attempt.simulatedStop &&
    next.lookedForTraffic === attempt.lookedForTraffic &&
    next.continuedWhileNear === attempt.continuedWhileNear &&
    next.sawNearbyCar === attempt.sawNearbyCar
  ) {
    attempt.previousRemainingMeters = known ? remaining : null;
    return attempt;
  }
  return next;
}

function speedMarkLine(meters: number, speedKmh: number | null): string | null {
  if (speedKmh === null) {
    return null;
  }
  return `Hastigheten var ${speedKmh} km/h ungefär ${meters} meter före korsningen.`;
}

export function approachFeedback(attempt: ApproachAttempt): ApproachFeedback {
  const did: string[] = [];
  const practice: string[] = [];
  const events: string[] = [];
  const passedWithoutStop = attempt.completed && !attempt.stoppedBefore;

  const at40 = speedMarkLine(40, attempt.speedAt40Kmh);
  const at30 = speedMarkLine(30, attempt.speedAt30Kmh);
  const at20 = speedMarkLine(20, attempt.speedAt20Kmh);
  if (at40) {
    did.push(at40);
    events.push(at40);
  }
  if (at30) {
    did.push(at30);
    events.push(at30);
  } else {
    events.push("Hastigheten omkring 30 meter före korsningen är okänd.");
  }
  if (at20) {
    did.push(at20);
    events.push(at20);
  }
  if (
    attempt.minApproachKmh !== null &&
    attempt.maxApproachKmh !== null &&
    attempt.minApproachKmh !== attempt.maxApproachKmh
  ) {
    events.push(`Lägsta uppmätta hastighet före korsningen: ${attempt.minApproachKmh} km/h.`);
    events.push(`Högsta uppmätta hastighet före korsningen: ${attempt.maxApproachKmh} km/h.`);
  }

  if (attempt.slowedDown) {
    did.push("Du minskade hastigheten när du närmade dig korsningen.");
    events.push("Hastigheten minskade under närmandet.");
  } else if (attempt.slowdownKnown && attempt.simZoneSlowdown) {
    events.push("Hastigheten minskade inte före de sista 10 metrarna.");
    events.push(
      "Närmare korsningen sjönk farten. Det kan vara simuleringens egen inbromsning och räknas inte som att du minskade hastigheten.",
    );
    practice.push("Råd: Du kan träna på att minska hastigheten före korsningen.");
  } else if (attempt.slowdownKnown) {
    events.push("Hastigheten minskade inte under närmandet.");
    practice.push("Råd: Du kan träna på att minska hastigheten före korsningen.");
  } else {
    events.push("Om hastigheten minskade under närmandet är okänt.");
  }

  if (attempt.stoppedBefore) {
    did.push("Du stannade före korsningen.");
    events.push("Bilen stannade före korsningen.");
  } else if (passedWithoutStop) {
    events.push("Bilen nådde korsningen utan att stanna före den.");
    practice.push("Råd: Du kan träna på att stanna före korsningen.");
  } else if (attempt.reachedApproach || attempt.lookedForTraffic) {
    events.push(
      "Inget förarstopp före korsningen registrerades. Korsningen nåddes inte, så det går inte att säga att bilen passerade utan att stanna.",
    );
  } else {
    events.push("Om bilen stannade före korsningen är okänt.");
  }
  if (attempt.simulatedStop && !attempt.stoppedBefore) {
    events.push("Stoppet vid korsningspunkten gjordes av simuleringen.");
  }

  if (attempt.sawNearbyCar) {
    events.push("En annan bil befann sig nära korsningen under din körning.");
  } else if (attempt.lookedForTraffic || attempt.completed) {
    events.push("Ingen annan bil registrerades nära korsningen.");
  } else {
    events.push("Om en annan bil var nära korsningen är okänt.");
  }
  if (attempt.continuedWhileNear) {
    events.push("Bilen fortsatte medan den andra bilen var nära korsningen.");
    practice.push("Råd: Du kan träna på att observera trafiken när en annan bil är nära korsningen.");
  }

  if (attempt.completed) {
    did.push("Du nådde korsningen och övningen slutfördes.");
    events.push("Korsningen nåddes och övningen slutfördes.");
  } else if (attempt.endedEarly || attempt.status === "finished") {
    did.push("Du nådde inte korsningen under det här försöket.");
    events.push("Korsningen nåddes inte.");
    practice.push("Råd: Kör fram till korsningen om du vill öva hela närmandet.");
  }

  if (did.length === 0) {
    did.push("Inget särskilt registrerades under försöket.");
  }
  if (practice.length === 0) {
    practice.push("Inget särskilt att träna på utifrån det som registrerades.");
  }
  return { did, practice, events, adviceNote: ADVICE_NOTE };
}
