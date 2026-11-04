import { describe, expect, it } from "vitest";
import { observeDrive } from "./driveObservation";

const here = { lat: 59.33, lng: 18.06 };

describe("observeDrive", () => {
  it("records speed, clearance and what is ahead without scoring a test", () => {
    const ahead = { lat: here.lat + 30 / 111320, lng: here.lng };
    const behind = { lat: here.lat - 20 / 111320, lng: here.lng };
    const observation = observeDrive({
      position: here,
      headingDegrees: 0,
      speedMps: 8,
      offsetMeters: 0.4,
      roadHalfMeters: 3,
      traffic: [ahead, behind],
      signs: [
        { kind: "stop", position: ahead },
        { kind: "give_way", position: behind },
      ],
      signals: [ahead],
      indicator: "left",
    });
    expect(observation.speedMps).toBe(8);
    expect(observation.edgeClearanceMeters).toBeCloseTo(3 - 0.4 - 0.98, 5);
    expect(observation.signAhead).toBe("stop");
    expect(observation.signalAhead).toBe(true);
    expect(observation.nearestTrafficMeters).toBeLessThan(35);
    expect(observation.indicator).toBe("left");
    expect(observation.mirrorChecked).toBeNull();
    expect(observation.vulnerableRoadUserMeters).toBeNull();
  });

  it("ignores a sign that is not in front of the car", () => {
    const beside = { lat: here.lat, lng: here.lng + 20 / (111320 * Math.cos((here.lat * Math.PI) / 180)) };
    const observation = observeDrive({
      position: here,
      headingDegrees: 0,
      speedMps: 0,
      signs: [{ kind: "give_way", position: beside }],
      signals: [beside],
    });
    expect(observation.signAhead).toBeNull();
    expect(observation.signalAhead).toBe(false);
    expect(observation.edgeClearanceMeters).toBeNull();
    expect(observation.indicator).toBe("off");
  });
});
