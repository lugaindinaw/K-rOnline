import type { RoadPoint } from "../roads/drivingRoads";

/**
 * Practice figures for one exercise on the street the car is already on.
 * They are not a national database of pedestrians, crossings or railways.
 * A hill grade is separate and is a simulated slope, because the road extract has no reliable height.
 */
export type PracticeKind = "person" | "cyclist" | "signal" | "works" | "railway";

export type SceneActor = {
  id: string;
  kind: PracticeKind;
  position: RoadPoint;
  headingDegrees: number;
  label: string;
  gapMeters: number;
  ahead: boolean;
};

export type PracticeSceneState = {
  moment: string | null;
  edgeId: string | null;
  anchor: RoadPoint | null;
  headingDegrees: number;
  signalOpen: boolean;
};

export const EMPTY_SCENE: PracticeSceneState = {
  moment: null,
  edgeId: null,
  anchor: null,
  headingDegrees: 0,
  signalOpen: false,
};

export type SceneUpdate = {
  state: PracticeSceneState;
  actors: SceneActor[];
  signal: "red" | "green" | null;
};

const METERS_PER_DEGREE = 111320;

export function updatePracticeScene(
  state: PracticeSceneState,
  input: {
    moment: string | null;
    edgeId: string;
    distanceMeters: number;
    edgeLengthMeters: number;
    position: RoadPoint;
    headingDegrees: number;
    speedMps: number;
    timeSeconds: number;
  },
): SceneUpdate {
  const moment = input.moment;
  const kinds = kindsFor(moment);
  if (kinds.length === 0 || !Number.isFinite(input.position.lat)) {
    return { state: { ...EMPTY_SCENE, moment }, actors: [], signal: null };
  }
  const same = state.moment === moment && state.edgeId === input.edgeId && state.anchor != null;
  const heading = same ? state.headingDegrees : input.headingDegrees;
  const anchor = same ? state.anchor! : translate(input.position, input.headingDegrees, 18);
  const wasOpen = same ? state.signalOpen : false;
  let signalOpen = wasOpen;
  const actors: SceneActor[] = [];
  const time = Number.isFinite(input.timeSeconds) ? input.timeSeconds : 0;
  for (const kind of kinds) {
    const position = placeKind(kind, anchor, heading, time);
    const seen = bearingGap(input.position, position, input.headingDegrees);
    actors.push({
      id: `ovning-${kind}`,
      kind,
      position,
      headingDegrees: heading,
      label: labelFor(kind, wasOpen),
      gapMeters: seen.gapMeters,
      ahead: seen.ahead,
    });
    if (kind === "signal" && seen.ahead && seen.gapMeters < 12 && input.speedMps < 0.9) {
      signalOpen = true;
    }
  }
  const signal = kinds.includes("signal") ? (wasOpen ? "green" : "red") : null;
  return {
    state: { moment, edgeId: input.edgeId, anchor, headingDegrees: heading, signalOpen },
    actors,
    signal,
  };
}

function placeKind(kind: PracticeKind, anchor: RoadPoint, heading: number, timeSeconds: number): RoadPoint {
  if (kind === "person") {
    return shift(anchor, heading, Math.sin(timeSeconds * 0.8) * 3.2);
  }
  if (kind === "cyclist") {
    return shift(translate(anchor, heading, 6 + Math.min(8, timeSeconds * 1.4)), heading, -1.6);
  }
  return anchor;
}

function kindsFor(moment: string | null): PracticeKind[] {
  if (moment === "crossing") {
    return ["person", "cyclist"];
  }
  if (moment === "lights") {
    return ["signal"];
  }
  if (moment === "works") {
    return ["works"];
  }
  if (moment === "railway") {
    return ["railway"];
  }
  return [];
}

function bearingGap(
  from: RoadPoint,
  to: RoadPoint,
  headingDegrees: number,
): { gapMeters: number; ahead: boolean } {
  const cosine = Math.cos((from.lat * Math.PI) / 180);
  const north = (to.lat - from.lat) * METERS_PER_DEGREE;
  const east = (to.lng - from.lng) * METERS_PER_DEGREE * Math.max(0.2, cosine);
  const gapMeters = Math.hypot(north, east);
  const heading = (headingDegrees * Math.PI) / 180;
  const forward = north * Math.cos(heading) + east * Math.sin(heading);
  return { gapMeters, ahead: forward > 1.5 };
}

function labelFor(kind: PracticeKind, signalOpen: boolean): string {
  if (kind === "person") {
    return "Gående";
  }
  if (kind === "cyclist") {
    return "Cykel";
  }
  if (kind === "signal") {
    return signalOpen ? "Grönt" : "Rött";
  }
  if (kind === "works") {
    return "Vägarbete";
  }
  return "Järnväg";
}

function translate(position: RoadPoint, headingDegrees: number, distanceMeters: number): RoadPoint {
  if (!Number.isFinite(distanceMeters) || distanceMeters === 0) {
    return position;
  }
  const heading = (headingDegrees * Math.PI) / 180;
  const cosine = Math.cos((position.lat * Math.PI) / 180);
  return {
    lat: position.lat + (distanceMeters * Math.cos(heading)) / METERS_PER_DEGREE,
    lng: position.lng + (distanceMeters * Math.sin(heading)) / (METERS_PER_DEGREE * Math.max(0.2, cosine)),
  };
}

function shift(position: RoadPoint, headingDegrees: number, metersRight: number): RoadPoint {
  return translate(position, headingDegrees + 90, metersRight);
}
