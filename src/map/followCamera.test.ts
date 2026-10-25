import { describe, expect, it } from "vitest";
import { distanceMeters } from "../roads/drivingRoads";
import {
  CAMERA_LOOKAHEAD_METERS,
  CAMERA_YAW_DEGREES_PER_SECOND,
  FOLLOW_RANGE_METERS,
  followCameraFromView,
  followCameraStep,
} from "./followCamera";

const places = [
  { name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Kiruna", lat: 67.8558, lng: 20.2253 },
  { name: "Glommersträsk", lat: 65.258, lng: 19.654 },
];

function headingDelta(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return Math.min(raw, 360 - raw);
}

describe("followCameraStep", () => {
  it("eases toward a point ahead of the car and limits how fast the view spins", () => {
    for (const place of places) {
      const car = { ...place, headingDegrees: 0 };
      const overview = followCameraFromView(
        { center: { lat: place.lat - 0.01, lng: place.lng }, heading: 90, range: 900, tilt: 20 },
        car,
      );
      const first = followCameraStep(overview, car, 0.05);
      expect(first.lat).toBeGreaterThan(overview.lat);
      expect(first.lat).toBeLessThan(car.lat + CAMERA_LOOKAHEAD_METERS / 111320);
      expect(headingDelta(first.headingDegrees, overview.headingDegrees)).toBeLessThanOrEqual(
        CAMERA_YAW_DEGREES_PER_SECOND * 0.05 + 0.001,
      );
      expect(headingDelta(first.headingDegrees, 90)).toBeGreaterThan(1);

      let camera = overview;
      for (let step = 0; step < 80; step += 1) {
        camera = followCameraStep(camera, car, 0.05);
      }
      const ahead = { lat: car.lat + CAMERA_LOOKAHEAD_METERS / 111320, lng: car.lng };
      expect(distanceMeters(camera, ahead)).toBeLessThan(8);
      expect(headingDelta(camera.headingDegrees, 0)).toBeLessThan(2);
      expect(camera.rangeMeters).toBeLessThan(FOLLOW_RANGE_METERS + 5);
      expect(camera.rangeMeters).toBeGreaterThan(FOLLOW_RANGE_METERS - 5);
    }
  });
});
