import { describe, expect, it } from "vitest";
import { distanceMeters } from "../roads/drivingRoads";
import {
  CAMERA_LOOKAHEAD_METERS,
  CAMERA_YAW_DEGREES_PER_SECOND,
  DRIVER_EYE_HEIGHT_METERS,
  DRIVER_FORWARD_METERS,
  DRIVER_LOOK_ABOVE_GROUND_METERS,
  DRIVER_LOOKAHEAD_METERS,
  DRIVER_YAW_DEGREES_PER_SECOND,
  FOLLOW_RANGE_METERS,
  approachDriverPose,
  cameraProfile,
  claimCameraJob,
  streetLevelRange,
  cameraLookAltitude,
  chaseAim,
  chaseCameraPosition,
  followCameraFromView,
  followCameraStep,
  DRIVER_STREET_LOOKAHEAD_METERS,
  DRIVER_STREET_RANGE_METERS,
  DRIVER_STREET_TILT_DEGREES,
  lookAhead,
  settledChase,
  settledFollow,
  smoothAltitude,
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
      expect(distanceMeters(camera, car)).toBeGreaterThan(CAMERA_LOOKAHEAD_METERS - 3);
      expect(distanceMeters(camera, car)).toBeLessThan(CAMERA_LOOKAHEAD_METERS + 3);
      expect(headingDelta(camera.headingDegrees, 0)).toBeLessThan(2);
      expect(camera.rangeMeters).toBeLessThan(FOLLOW_RANGE_METERS + 5);
      expect(camera.rangeMeters).toBeGreaterThan(FOLLOW_RANGE_METERS - 5);
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
    const drop = DRIVER_EYE_HEIGHT_METERS - DRIVER_LOOK_ABOVE_GROUND_METERS;
    expect(drop).toBeGreaterThan(1);
    expect(drop).toBeLessThan(1.3);
    expect(driver.tiltDegrees).toBeGreaterThan(79);
    expect(driver.tiltDegrees).toBeLessThan(85);
    expect(driver.rangeMeters).toBeCloseTo(Math.hypot(back, drop), 5);
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
      expect(Math.abs(switched.rangeMeters - before.rangeMeters)).toBeLessThan(6);
      expect(Math.abs(switched.tiltDegrees - before.tiltDegrees)).toBeLessThan(16);
      expect(before.tiltDegrees).toBeGreaterThan(60);
      expect(before.tiltDegrees).toBeLessThan(driver.tiltDegrees);
      expect(before.rangeMeters).toBeGreaterThan(driver.rangeMeters);
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

  it("turns the driver view more slowly than the chase camera", () => {
    const place = places[0]!;
    const car = { ...place, headingDegrees: 0 };
    let camera = followCameraFromView({ center: place, heading: 0, range: 20, tilt: 86 }, car);
    for (let step = 0; step < 40; step += 1) {
      camera = followCameraStep(camera, car, 0.05, "driver");
    }
    const settled = camera.tiltDegrees;
    const turned = followCameraStep(camera, { ...car, headingDegrees: 25 }, 0.05, "driver");
    expect(headingDelta(turned.headingDegrees, camera.headingDegrees)).toBeLessThanOrEqual(
      DRIVER_YAW_DEGREES_PER_SECOND * 0.05 + 0.001,
    );
    expect(headingDelta(turned.headingDegrees, camera.headingDegrees)).toBeLessThan(
      CAMERA_YAW_DEGREES_PER_SECOND * 0.05,
    );
    expect(distanceMeters(turned, camera)).toBeLessThan(1.2);
    expect(Math.abs(turned.tiltDegrees - settled)).toBeLessThan(0.5);
    expect(turned.tiltDegrees).toBeGreaterThan(80);
  });

  it("settles an overview camera at seated height", () => {
    let pose = { rangeMeters: 700, tiltDegrees: 67 };
    for (let step = 0; step < 50; step += 1) {
      pose = approachDriverPose(pose, 0.05);
    }
    const driver = cameraProfile("driver");
    expect(pose.tiltDegrees).toBeGreaterThan(80);
    expect(Math.abs(pose.rangeMeters - driver.rangeMeters)).toBeLessThan(1);
    expect(streetLevelRange(67.5)).toBeLessThan(6);
    expect(streetLevelRange(88)).toBeLessThanOrEqual(driver.rangeMeters + 0.01);
  });

  it("aims the chase camera at the road and eases altitude instead of snapping", () => {
    expect(cameraLookAltitude("chase", 12, 40, false)).toBe(12);
    expect(cameraLookAltitude("chase", null, 40, false)).toBe(40);
    expect(cameraLookAltitude("driver", 12, 40, false)).toBeCloseTo(12 + DRIVER_LOOK_ABOVE_GROUND_METERS, 5);
    const first = smoothAltitude(40, 12, 0.05);
    expect(first).toBeLessThan(40);
    expect(first).toBeGreaterThan(30);
    expect(smoothAltitude(first, 12, 0)).toBe(first);
    let altitude = 40;
    for (let step = 0; step < 80; step += 1) {
      altitude = smoothAltitude(altitude, 12, 0.05);
    }
    expect(altitude).toBeCloseTo(12, 1);
  });

  it("raises and lengthens the chase camera without turning it into a top-down view", () => {
    const base = chaseAim();
    expect(base.tiltDegrees).toBeGreaterThan(58);
    expect(base.tiltDegrees).toBeLessThan(80);
    expect(base.rangeMeters).toBeGreaterThan(8);
    expect(base.rangeMeters).toBeLessThan(40);
    const higher = chaseAim({ distance: 1, heightDegrees: 6 });
    const closer = chaseAim({ distance: 0.7, heightDegrees: 0 });
    expect(higher.tiltDegrees).toBeLessThan(base.tiltDegrees);
    expect(higher.tiltDegrees).toBeGreaterThan(60);
    expect(closer.rangeMeters).toBeLessThan(base.rangeMeters);
  });

  it("cuts the outside camera to a low rear three-quarter view of the car", () => {
    const car = { lat: 59.33, lng: 18.07, headingDegrees: 20 };
    const pose = settledChase(car);
    expect(pose.rangeMeters).toBeGreaterThan(8);
    expect(pose.rangeMeters).toBeLessThan(40);
    expect(pose.tiltDegrees).toBeGreaterThan(58);
    expect(pose.tiltDegrees).toBeLessThan(80);
    expect(pose.headingDegrees).toBe(20);
    const offset = distanceMeters(pose, car);
    expect(offset).toBeGreaterThan(2);
    expect(offset).toBeLessThan(8);
  });

  it("cuts the driver camera to the seat instead of easing in from the sky", () => {
    const car = { lat: 59.33, lng: 18.07, headingDegrees: 0 };
    const chase = settledFollow(car, "chase");
    const seat = settledFollow(car, "driver");
    const drop = DRIVER_EYE_HEIGHT_METERS - DRIVER_LOOK_ABOVE_GROUND_METERS;
    const back = DRIVER_LOOKAHEAD_METERS - DRIVER_FORWARD_METERS;
    expect(chase.rangeMeters).toBeCloseTo(FOLLOW_RANGE_METERS, 5);
    expect(seat.rangeMeters).toBeCloseTo(Math.hypot(back, drop), 5);
    expect(seat.tiltDegrees).toBeGreaterThan(79);
    expect(seat.tiltDegrees).toBeLessThan(85);
  });

  it("puts the chase camera a few metres above the road behind the look point", () => {
    const pose = settledChase({ lat: 59.33, lng: 18.07, headingDegrees: 0 });
    const camera = chaseCameraPosition(pose, 20);
    expect(camera.altitude - 20).toBeGreaterThan(1.5);
    expect(camera.altitude - 20).toBeLessThan(16);
    expect(camera.lat).toBeLessThan(pose.lat);
  });

  it("aims the driver windshield down the street instead of into the roof", () => {
    const car = { lat: 59.33, lng: 18.07, headingDegrees: 0 };
    const look = lookAhead(car, car.headingDegrees, DRIVER_STREET_LOOKAHEAD_METERS);
    expect(look.lat).toBeGreaterThan(car.lat);
    expect(DRIVER_STREET_TILT_DEGREES).toBeGreaterThan(64);
    expect(DRIVER_STREET_TILT_DEGREES).toBeLessThan(88);
    expect(DRIVER_STREET_RANGE_METERS).toBeGreaterThan(20);
    expect(DRIVER_STREET_RANGE_METERS).toBeLessThan(90);
  });
});
