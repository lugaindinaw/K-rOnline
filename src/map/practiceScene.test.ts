import { describe, expect, it } from "vitest";
import { EMPTY_SCENE, updatePracticeScene } from "./practiceScene";

const here = { lat: 59.33, lng: 18.07 };

describe("practice figures", () => {
  it("places a pedestrian ahead and keeps a red signal until the car has stopped", () => {
    const first = updatePracticeScene(EMPTY_SCENE, {
      moment: "crossing",
      edgeId: "gata",
      distanceMeters: 10,
      edgeLengthMeters: 80,
      position: here,
      headingDegrees: 0,
      speedMps: 4,
      timeSeconds: 1,
    });
    const person = first.actors.find((actor) => actor.kind === "person");
    expect(person?.label).toBe("Gående");
    expect(person?.ahead).toBe(true);
    expect(person?.gapMeters).toBeGreaterThan(14);
    expect(person?.gapMeters).toBeLessThan(22);

    const red = updatePracticeScene(EMPTY_SCENE, {
      moment: "lights",
      edgeId: "gata",
      distanceMeters: 10,
      edgeLengthMeters: 80,
      position: here,
      headingDegrees: 0,
      speedMps: 0,
      timeSeconds: 1,
    });
    expect(red.signal).toBe("red");
    expect(red.state.signalOpen).toBe(false);

    const close = {
      ...here,
      lat: here.lat + 10 / 111320,
    };
    const stopping = updatePracticeScene(red.state, {
      moment: "lights",
      edgeId: "gata",
      distanceMeters: 30,
      edgeLengthMeters: 80,
      position: close,
      headingDegrees: 0,
      speedMps: 0.2,
      timeSeconds: 2,
    });
    expect(stopping.signal).toBe("red");
    expect(stopping.state.signalOpen).toBe(true);
    const green = updatePracticeScene(stopping.state, {
      moment: "lights",
      edgeId: "gata",
      distanceMeters: 30,
      edgeLengthMeters: 80,
      position: close,
      headingDegrees: 0,
      speedMps: 0,
      timeSeconds: 3,
    });
    expect(green.signal).toBe("green");
    expect(green.actors[0]?.label).toBe("Grönt");
  });
});
