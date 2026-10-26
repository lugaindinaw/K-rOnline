import { describe, expect, it } from "vitest";
import { stepVehicle, vehicleFromPlacement } from "../drive/drive";
import { mergeRoadSegments } from "../roads/roadCoverage";
import { buildRoadNetwork } from "../roads/roadNetwork";
import type { OneWay, RoadPoint, RoadSegment } from "../roads/drivingRoads";
import {
  ADVICE_NOTE,
  EXERCISE_INSTRUCTION,
  FEEDBACK_DID_TITLE,
  FEEDBACK_EVENTS_TITLE,
  FEEDBACK_PRACTICE_TITLE,
  MISSING_JUNCTION_MESSAGE,
  approachFeedback,
  beginAttempt,
  findApproachStart,
  finishAttempt,
  idleAttempt,
  observeApproach,
  type ApproachStart,
  type DriveSample,
} from "./approach";

function northOf(point: RoadPoint, meters: number): RoadPoint {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

function eastOf(point: RoadPoint, meters: number): RoadPoint {
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat, lng: point.lng + meters / (111320 * Math.max(0.2, cosine)) };
}

function segment(id: string, nodes: string[], coordinates: RoadPoint[], oneway: OneWay = "forward"): RoadSegment {
  return {
    id,
    osmWayId: id,
    name: id,
    highway: "residential",
    oneway,
    coordinates,
    nodeIds: nodes,
  };
}

function crossing() {
  const start = { lat: 59.3293, lng: 18.0686 };
  const node = northOf(start, 120);
  return buildRoadNetwork([
    segment("in", ["a", "n"], [start, node]),
    segment("ut-n", ["n", "b"], [node, northOf(node, 80)]),
    segment("ut-o", ["n", "c"], [node, eastOf(node, 80)]),
    segment("ut-v", ["n", "d"], [node, eastOf(node, -80)]),
  ]);
}

function sample(start: ApproachStart, distance: number, speedMps: number, mode: DriveSample["mode"] = "driving", traffic: DriveSample["traffic"] = []): DriveSample {
  return {
    speedMps,
    edgeId: start.edgeId,
    distanceMeters: distance,
    position: start.junction,
    mode,
    traffic,
  };
}

describe("approach exercise", () => {
  it("starts and finishes without carrying a result", () => {
    const running = beginAttempt();
    expect(running.status).toBe("running");
    expect(running.completed).toBe(false);
    const finished = finishAttempt(running);
    expect(finished.status).toBe("finished");
    expect(finished.endedEarly).toBe(true);
    expect(finished.completed).toBe(false);
    expect(finishAttempt(finished)).toBe(finished);
    expect(EXERCISE_INSTRUCTION).toBe("Närma dig korsningen och observera trafiken.");
  });

  it("clears recorded values when a new attempt starts", () => {
    const start = findApproachStart(crossing());
    expect(start).toBeTruthy();
    let attempt = observeApproach(beginAttempt(), start!, sample(start!, start!.lengthMeters - 20, 8));
    attempt = finishAttempt(attempt);
    expect(attempt.approachSpeedKmh).not.toBeNull();
    const again = beginAttempt();
    expect(again).toEqual({ ...idleAttempt(), status: "running" });
    expect(again.approachSpeedKmh).toBeNull();
    expect(again.speedAt30Kmh).toBeNull();
    expect(again.speedAt40Kmh).toBeNull();
    expect(again.speedAt20Kmh).toBeNull();
    expect(again.minApproachKmh).toBeNull();
    expect(again.slowdownKnown).toBe(false);
    expect(again.slowedDown).toBe(false);
    expect(again.simZoneSlowdown).toBe(false);
    expect(again.stoppedBefore).toBe(false);
    expect(again.simulatedStop).toBe(false);
    expect(again.continuedWhileNear).toBe(false);
    expect(again.completed).toBe(false);
    expect(again.sawNearbyCar).toBe(false);
    expect(again.previousRemainingMeters).toBeNull();
  });

  it("records a lower speed and a stop before the junction", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 36, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 30, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 18, 2));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 12, 0));
    expect(attempt.reachedApproach).toBe(true);
    expect(attempt.approachSpeedKmh).toBe(29);
    expect(attempt.speedAt30Kmh).toBe(29);
    expect(attempt.minApproachKmh).toBe(0);
    expect(attempt.slowdownKnown).toBe(true);
    expect(attempt.slowedDown).toBe(true);
    expect(attempt.stoppedBefore).toBe(true);
    expect(attempt.simulatedStop).toBe(false);
    expect(attempt.completed).toBe(false);
    const held = observeApproach(attempt, start, sample(start, start.lengthMeters - 12, 0));
    expect(held).toBe(attempt);
    const feedback = approachFeedback(finishAttempt(attempt));
    expect(feedback.did).toContain("Hastigheten var 29 km/h ungefär 30 meter före korsningen.");
    expect(feedback.did).toContain("Du minskade hastigheten när du närmade dig korsningen.");
    expect(feedback.did).toContain("Du stannade före korsningen.");
    expect(feedback.did).toContain("Du nådde inte korsningen under det här försöket.");
    expect(feedback.events).not.toContain("Bilen nådde korsningen utan att stanna före den.");
    expect(feedback.practice.join(" ")).not.toContain("stanna före korsningen");
  });

  it("does not treat the forced stop at the node as an early stop", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 20, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters, 0, "choose"));
    expect(attempt.stoppedBefore).toBe(false);
    expect(attempt.slowedDown).toBe(false);
    expect(attempt.simulatedStop).toBe(true);
    expect(attempt.completed).toBe(true);
    expect(attempt.status).toBe("finished");
    const feedback = approachFeedback(attempt);
    expect(feedback.events).toContain("Bilen nådde korsningen utan att stanna före den.");
    expect(feedback.events).toContain("Stoppet vid korsningspunkten gjordes av simuleringen.");
    expect(feedback.did.join(" ")).not.toContain("stannade inte");
    expect(feedback.practice).toContain("Råd: Du kan träna på att stanna före korsningen.");
  });

  it("describes only the events that were recorded", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 24, 6));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 16, 0));
    attempt = observeApproach(
      attempt,
      start,
      sample(start, start.lengthMeters - 16, 0, "driving", [{ position: start.junction }]),
    );
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters, 0, "choose"));
    const feedback = approachFeedback(attempt);
    expect(feedback.did).toContain("Du minskade hastigheten när du närmade dig korsningen.");
    expect(feedback.did).toContain("Du stannade före korsningen.");
    expect(feedback.did).toContain("Du nådde korsningen och övningen slutfördes.");
    expect(feedback.events).toContain("En annan bil befann sig nära korsningen under din körning.");
    expect(feedback.events).not.toContain("Bilen nådde korsningen utan att stanna före den.");
    const text = [...feedback.did, ...feedback.practice, ...feedback.events, feedback.adviceNote].join(" ");
    expect(text).not.toMatch(/väjningsplikt|stopplikt/);
    expect(text).not.toMatch(/Godkänd|Underkänd/);
  });

  it("records continuing while another car is near the junction", () => {
    const start = findApproachStart(crossing())!;
    const attempt = observeApproach(
      beginAttempt(),
      start,
      sample(start, start.lengthMeters - 20, 6, "driving", [{ position: start.junction }]),
    );
    const feedback = approachFeedback(finishAttempt(attempt));
    expect(attempt.continuedWhileNear).toBe(true);
    expect(attempt.sawNearbyCar).toBe(true);
    expect(feedback.events).toContain("En annan bil befann sig nära korsningen under din körning.");
    expect(feedback.events).toContain("Bilen fortsatte medan den andra bilen var nära korsningen.");
    expect(feedback.practice).toContain("Råd: Du kan träna på att observera trafiken när en annan bil är nära korsningen.");
    expect(feedback.did).toContain("Du nådde inte korsningen under det här försöket.");
    expect(feedback.events).not.toContain("Bilen nådde korsningen utan att stanna före den.");
    expect(feedback.events.join(" ")).not.toContain("väjningsplikt");
  });

  it("reports a missing junction instead of inventing one", () => {
    expect(findApproachStart(buildRoadNetwork([]))).toBeNull();
    const straight = buildRoadNetwork([
      segment("gata", ["1", "2"], [
        { lat: 67.8558, lng: 20.2253 },
        northOf({ lat: 67.8558, lng: 20.2253 }, 200),
      ]),
    ]);
    expect(findApproachStart(straight)).toBeNull();
    expect(MISSING_JUNCTION_MESSAGE).toBe("Ingen lämplig korsning finns i det laddade vägnätet.");
    const early = approachFeedback(finishAttempt(beginAttempt()));
    expect(early.did).toContain("Du nådde inte korsningen under det här försöket.");
    expect(early.events).toContain("Hastigheten omkring 30 meter före korsningen är okänd.");
    expect(early.events).toContain("Om hastigheten minskade under närmandet är okänt.");
    expect(early.events).toContain("Om bilen stannade före korsningen är okänt.");
    expect(early.events).toContain("Om en annan bil var nära korsningen är okänt.");
    expect(early.events).toContain("Korsningen nåddes inte.");
    expect(early.events).not.toContain("Bilen nådde korsningen utan att stanna före den.");
    expect(early.practice).toContain("Råd: Kör fram till korsningen om du vill öva hela närmandet.");
  });

  it("summarises a finished attempt with facts and marked advice", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 36, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 30, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 22, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters, 0, "choose"));
    const feedback = approachFeedback(attempt);
    expect(FEEDBACK_DID_TITLE).toBe("Det här gjorde du");
    expect(FEEDBACK_PRACTICE_TITLE).toBe("Det här kan du träna på");
    expect(FEEDBACK_EVENTS_TITLE).toBe("Händelser under övningen");
    expect(feedback.adviceNote).toBe(ADVICE_NOTE);
    expect(feedback.did).toContain("Hastigheten var 29 km/h ungefär 30 meter före korsningen.");
    expect(feedback.did).toContain("Du nådde korsningen och övningen slutfördes.");
    expect(feedback.events).toContain("Hastigheten minskade inte före de sista 10 metrarna.");
    expect(feedback.events).toContain(
      "Närmare korsningen sjönk farten. Det kan vara simuleringens egen inbromsning och räknas inte som att du minskade hastigheten.",
    );
    expect(feedback.events).toContain("Stoppet vid korsningspunkten gjordes av simuleringen.");
    expect(feedback.events).toContain("Bilen nådde korsningen utan att stanna före den.");
    expect(feedback.events).toContain("Ingen annan bil registrerades nära korsningen.");
    expect(feedback.practice).toContain("Råd: Du kan träna på att minska hastigheten före korsningen.");
    expect(feedback.practice).toContain("Råd: Du kan träna på att stanna före korsningen.");
    expect(feedback.practice.every((line) => line.startsWith("Råd:"))).toBe(true);
  });

  it("reports an unchanged speed when the attempt ends before the simulation brake", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 30, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 20, 8));
    const feedback = approachFeedback(finishAttempt(attempt));
    expect(attempt.simZoneSlowdown).toBe(false);
    expect(feedback.events).toContain("Hastigheten minskade inte under närmandet.");
    expect(feedback.events.join(" ")).not.toContain("simuleringens egen inbromsning");
    expect(feedback.did).toContain("Du nådde inte korsningen under det här försöket.");
    expect(feedback.events).toContain("Ingen annan bil registrerades nära korsningen.");
  });

  it("does not call a simulation stop a driver stop", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 15, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 12, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 6, 0));
    expect(attempt.stoppedBefore).toBe(false);
    expect(attempt.slowedDown).toBe(false);
    expect(attempt.slowdownKnown).toBe(true);
    const feedback = approachFeedback(finishAttempt(attempt));
    expect(feedback.did).toContain("Du nådde inte korsningen under det här försöket.");
    expect(feedback.events).not.toContain("Bilen nådde korsningen utan att stanna före den.");
    expect(feedback.events).toContain("Hastigheten minskade inte före de sista 10 metrarna.");
    expect(attempt.simZoneSlowdown).toBe(true);
    expect(feedback.events).toContain(
      "Inget förarstopp före korsningen registrerades. Korsningen nåddes inte, så det går inte att säga att bilen passerade utan att stanna.",
    );
  });

  it("does not judge yield or stop rules", () => {
    const start = findApproachStart(crossing())!;
    const stopped = finishAttempt(
      observeApproach(beginAttempt(), start, sample(start, start.lengthMeters - 30, 0.2)),
    );
    const passed = observeApproach(
      observeApproach(beginAttempt(), start, sample(start, start.lengthMeters - 30, 8)),
      start,
      sample(start, start.lengthMeters, 0, "choose", [{ position: start.junction }]),
    );
    const missed = approachFeedback(finishAttempt(beginAttempt()));
    for (const feedback of [approachFeedback(stopped), approachFeedback(passed), missed]) {
      const text = [...feedback.did, ...feedback.practice, ...feedback.events, feedback.adviceNote].join(" ");
      expect(text).not.toMatch(/väjningsplikt|stopplikt/);
      expect(text).not.toMatch(/Godkänd|Underkänd/);
    }
  });

  it("keeps the same junction when the next road area changes the edge id", () => {
    const origin = { lat: 59.3293, lng: 18.0686 };
    const mid = northOf(origin, 80);
    const node = northOf(origin, 160);
    const base = [
      segment("gata", ["a", "b", "n"], [origin, mid, node]),
      segment("ut-n", ["n", "c"], [node, northOf(node, 40)]),
      segment("ut-o", ["n", "d"], [node, eastOf(node, 40)]),
    ];
    const start = findApproachStart(buildRoadNetwork(base));
    expect(start?.toNode).toBe("n");
    const extended = buildRoadNetwork(
      mergeRoadSegments([...base, segment("sido", ["b", "s"], [mid, eastOf(mid, 40)])]),
    );
    const approach = extended.edges.find((edge) => edge.toNode === "n" && edge.fromNode === "b");
    expect(approach).toBeTruthy();
    expect(approach!.id).not.toBe(start!.edgeId);
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start!, {
      ...sample(start!, approach!.lengthMeters - 46, 8),
      edgeId: approach!.id,
      network: extended,
    });
    expect(attempt.speedAt40Kmh).toBeNull();
    expect(attempt.previousRemainingMeters).toBeCloseTo(46, 0);
    attempt = observeApproach(attempt, start!, {
      ...sample(start!, approach!.lengthMeters - 39, 10),
      edgeId: approach!.id,
      network: extended,
    });
    expect(start!.toNode).toBe("n");
    expect(attempt.speedAt40Kmh).toBe(36);
    expect(attempt.speedAt30Kmh).toBeNull();
    expect(attempt.speedAt20Kmh).toBeNull();
    const again = observeApproach(attempt, start!, {
      ...sample(start!, approach!.lengthMeters - 37, 6),
      edgeId: approach!.id,
      network: extended,
    });
    expect(again.speedAt40Kmh).toBe(36);
    const arrived = observeApproach(again, start!, {
      ...sample(start!, approach!.lengthMeters, 0, "choose"),
      edgeId: approach!.id,
      network: extended,
    });
    expect(arrived.completed).toBe(true);
    expect(arrived.simulatedStop).toBe(true);
    expect(arrived.stoppedBefore).toBe(false);
    expect(arrived.speedAt40Kmh).toBe(36);
    const upstreamOrigin = northOf(origin, 0);
    const close = northOf(upstreamOrigin, 130);
    const farNode = northOf(upstreamOrigin, 160);
    const splitRoads = [
      segment("gata", ["a", "b", "n"], [upstreamOrigin, close, farNode]),
      segment("sido", ["b", "s"], [close, eastOf(close, 40)]),
      segment("ut-n", ["n", "c"], [farNode, northOf(farNode, 40)]),
      segment("ut-o", ["n", "d"], [farNode, eastOf(farNode, 40)]),
    ];
    const target = findApproachStart(buildRoadNetwork(splitRoads.slice(0, 1).concat(splitRoads.slice(2))))!;
    const split = buildRoadNetwork(mergeRoadSegments(splitRoads));
    const beforeJunction = split.edges.find((edge) => edge.toNode === "b" && edge.fromNode === "a");
    expect(beforeJunction).toBeTruthy();
    expect(beforeJunction!.toNode).not.toBe(target.toNode);
    let across = beginAttempt();
    across = observeApproach(across, target, {
      ...sample(target, beforeJunction!.lengthMeters - 16, 8),
      edgeId: beforeJunction!.id,
      network: split,
    });
    across = observeApproach(across, target, {
      ...sample(target, beforeJunction!.lengthMeters - 8, 10),
      edgeId: beforeJunction!.id,
      network: split,
    });
    expect(target.toNode).toBe("n");
    expect(across.speedAt40Kmh).toBe(36);
    expect(across.speedAt30Kmh).toBeNull();
  });

  it("does not invent a speed when the car skips a mark or the junction disappears", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 55, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 15, 8));
    expect(attempt.speedAt40Kmh).toBeNull();
    expect(attempt.speedAt30Kmh).toBeNull();
    expect(attempt.speedAt20Kmh).toBeNull();
    const parked = observeApproach(
      beginAttempt(),
      start,
      sample(start, start.lengthMeters - 36, 8),
    );
    const stoppedAtMark = observeApproach(parked, start, sample(start, start.lengthMeters - 30, 0));
    expect(stoppedAtMark.speedAt30Kmh).toBeNull();
    const missing = approachFeedback(finishAttempt(stoppedAtMark));
    expect(missing.events).toContain("Hastigheten omkring 30 meter före korsningen är okänd.");
    expect(missing.events.join(" ")).not.toContain("var 0 km/h ungefär 30 meter");
    const measuredZero = approachFeedback({
      ...finishAttempt(beginAttempt()),
      speedAt30Kmh: 0,
    });
    expect(measuredZero.events).toContain("Hastigheten var 0 km/h ungefär 30 meter före korsningen.");
    expect(measuredZero.events).not.toContain("Hastigheten omkring 30 meter före korsningen är okänd.");
    const gone = buildRoadNetwork([
      segment("annan", ["x", "y"], [
        { lat: 65.2, lng: 19.6 },
        northOf({ lat: 65.2, lng: 19.6 }, 100),
      ]),
    ]);
    const lost = observeApproach(beginAttempt(), start, {
      ...sample(start, start.lengthMeters - 30, 8),
      network: gone,
    });
    expect(lost.speedAt30Kmh).toBeNull();
    expect(lost.previousRemainingMeters).toBeNull();
    expect(lost.completed).toBe(false);
  });

  it("still accelerates and brakes on an ordinary road", () => {
    const origin = { lat: 65.258, lng: 19.654 };
    const network = buildRoadNetwork([
      segment("storgatan", ["1", "2"], [origin, northOf(origin, 400)]),
    ]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"))!;
    let state = vehicleFromPlacement({ edge, distanceMeters: 20, gapMeters: 0 });
    for (let step = 0; step < 10; step += 1) {
      state = stepVehicle(network, state, { accelerate: true, brake: false }, 0.05);
    }
    expect(state.speedMps).toBeGreaterThan(1);
    expect(state.edgeId).toBe(edge.id);
    const braking = stepVehicle(network, state, { accelerate: true, brake: true }, 0.05);
    expect(braking.speedMps).toBeLessThan(state.speedMps);
    expect(findApproachStart(network)).toBeNull();
  });
});
