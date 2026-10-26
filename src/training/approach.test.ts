import { describe, expect, it } from "vitest";
import { stepVehicle, vehicleFromPlacement } from "../drive/drive";
import { buildRoadNetwork } from "../roads/roadNetwork";
import type { OneWay, RoadPoint, RoadSegment } from "../roads/drivingRoads";
import {
  EXERCISE_INSTRUCTION,
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
    expect(again.minApproachKmh).toBeNull();
    expect(again.slowedDown).toBe(false);
    expect(again.stoppedBefore).toBe(false);
    expect(again.continuedWhileNear).toBe(false);
    expect(again.completed).toBe(false);
    expect(again.sawNearbyCar).toBe(false);
  });

  it("records a lower speed and a stop before the junction", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 30, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 18, 2));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 12, 0));
    expect(attempt.reachedApproach).toBe(true);
    expect(attempt.approachSpeedKmh).toBe(29);
    expect(attempt.minApproachKmh).toBe(0);
    expect(attempt.slowedDown).toBe(true);
    expect(attempt.stoppedBefore).toBe(true);
    expect(attempt.completed).toBe(false);
    const held = observeApproach(attempt, start, sample(start, start.lengthMeters - 12, 0));
    expect(held).toBe(attempt);
  });

  it("does not treat the forced stop at the node as an early stop", () => {
    const start = findApproachStart(crossing())!;
    let attempt = beginAttempt();
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters - 20, 8));
    attempt = observeApproach(attempt, start, sample(start, start.lengthMeters, 0, "choose"));
    expect(attempt.stoppedBefore).toBe(false);
    expect(attempt.slowedDown).toBe(false);
    expect(attempt.completed).toBe(true);
    expect(attempt.status).toBe("finished");
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
    expect(feedback.good).toContain("Du sänkte hastigheten före korsningen.");
    expect(feedback.good).toContain("Du stannade före korsningen.");
    expect(feedback.good).toContain("Övningen slutfördes.");
    expect(feedback.events).toContain("En annan bil var nära korsningen.");
    expect(feedback.improve.join(" ")).not.toContain("väjningsplikt");
    expect(feedback.events.join(" ")).not.toContain("stopplikt");
    expect(feedback.good.join(" ")).not.toContain("väjningsplikt");
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
    expect(feedback.improve).toContain("Du fortsatte medan en annan bil befann sig nära korsningen.");
    expect(feedback.events).toContain("Du fortsatte medan en annan bil befann sig nära korsningen.");
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
    expect(early.events).toContain("Ingen hastighet registrerades nära korsningen.");
    expect(early.events).toContain("Övningen avslutades innan korsningen.");
    expect(early.improve).toContain("Korsningen nåddes inte.");
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
