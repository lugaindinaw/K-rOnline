import { describe, expect, it } from "vitest";
import { STOCKHOLM_CANDIDATE } from "./stockholmCandidate";

describe("STOCKHOLM_CANDIDATE", () => {
  it("keeps Stockholm as a candidate without locking a street", () => {
    expect(STOCKHOLM_CANDIDATE.city).toBe("Stockholm");
    expect(STOCKHOLM_CANDIDATE.streetName).toBeNull();
    expect(STOCKHOLM_CANDIDATE.surfaceCoverage).toBe("observed-at-camera");
    expect(STOCKHOLM_CANDIDATE.viewObservation.photorealistic).toBe(true);
  });

  it("points the camera at central Stockholm in hybrid mode", () => {
    expect(STOCKHOLM_CANDIDATE.camera.center.lat).toBeCloseTo(59.3293, 4);
    expect(STOCKHOLM_CANDIDATE.camera.center.lng).toBeCloseTo(18.0686, 4);
    expect(STOCKHOLM_CANDIDATE.camera.mode).toBe("HYBRID");
    expect(STOCKHOLM_CANDIDATE.camera.rangeMeters).toBeGreaterThan(0);
  });
});
