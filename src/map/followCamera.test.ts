import { describe, expect, it } from "vitest";
import { distanceMeters } from "../roads/drivingRoads";
import {
  CAMERA_LOOKAHEAD_METERS,
  CAMERA_YAW_DEGREES_PER_SECOND,
  DRIVER_EYE_HEIGHT_METERS,
  DRIVER_FORWARD_METERS,
  DRIVER_LOOKAHEAD_METERS,
  FOLLOW_RANGE_METERS,
  cameraProfile,
  claimCameraJob,
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

describe("claimCameraJob", () => {
  it("interrupts an in-flight camera fly once and then keeps the chase", () => {
    const first = claimCameraJob(0, 2);
    expect(first.interrupt).toBe(true);
    expect(first.ownedJob).toBe(3);
    const steady = claimCameraJob(first.ownedJob, first.ownedJob);
    expect(steady).toEqual({ ownedJob: 3, interrupt: false });
  });
});

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
      expect(camera.lat).toBeGreaterThan(car.lat);
    }
  });

  it("does not spin or jump when the car heading changes suddenly", () => {
    for (const place of places) {
      const car = { ...place, headingDegrees: 0 };
      let camera = followCameraFromView({ center: place, heading: 0, range: FOLLOW_RANGE_METERS, tilt: 62 }, car);
      for (let step = 0; step < 40; step += 1) {
        camera = followCameraStep(camera, car, 0.05);
      }
      const turned = followCameraStep(camera, { ...car, headingDegrees: 90 }, 0.05);
      expect(headingDelta(turned.headingDegrees, camera.headingDegrees)).toBeLessThanOrEqual(
        CAMERA_YAW_DEGREES_PER_SECOND * 0.05 + 0.001,
      );
      expect(distanceMeters(turned, camera)).toBeLessThan(2);
    }
  });

  it("keeps a driver view near eye height and eases into it", () => {
    const driver = cameraProfile("driver");
    const back = DRIVER_LOOKAHEAD_METERS - DRIVER_FORWARD_METERS;
    expect(driver.tiltDegrees).toBeGreaterThan(80);
    expect(driver.tiltDegrees).toBeLessThan(89);
    expect(driver.rangeMeters).toBeCloseTo(Math.hypot(back, DRIVER_EYE_HEIGHT_METERS), 5);
    expect(driver.leftMeters).toBeGreaterThan(0);

    for (const place of places) {
      const car = { ...place, headingDegrees: 0 };
      let camera = followCameraFromView(
        { center: place, heading: 0, range: FOLLOW_RANGE_METERS, tilt: 64 },
        car,
      );
      for (let step = 0; step < 30; step += 1) {
        camera = followCameraStep(camera, car, 0.05, "chase");
      }
      const before = camera;
      const switched = followCameraStep(camera, car, 0.05, "driver");
      expect(Math.abs(switched.rangeMeters - before.rangeMeters)).toBeLessThan(3);
      expect(Math.abs(switched.tiltDegrees - before.tiltDegrees)).toBeLessThan(12);
      expect(Math.abs(driver.tiltDegrees - before.tiltDegrees)).toBeGreaterThan(15);
      expect(headingDelta(switched.headingDegrees, before.headingDegrees)).toBeLessThanOrEqual(
        CAMERA_YAW_DEGREES_PER_SECOND * 0.05 + 0.001,
      );
      for (let step = 0; step < 80; step += 1) {
        camera = followCameraStep(camera, car, 0.05, "driver");
      }
      expect(camera.lat).toBeGreaterThan(car.lat);
      expect(camera.lng).toBeLessThan(car.lng);
      expect(distanceMeters(camera, car)).toBeGreaterThan(DRIVER_LOOKAHEAD_METERS - 4);
      expect(distanceMeters(camera, car)).toBeLessThan(DRIVER_LOOKAHEAD_METERS + 4);
      expect(camera.tiltDegrees).toBeGreaterThan(80);
    }
  });
});
