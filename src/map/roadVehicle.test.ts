import { describe, expect, it } from "vitest";
import { CAR_HEIGHT_METERS, CAR_LENGTH_METERS, CAR_SCALE, CAR_WIDTH_METERS, TRAFFIC_SCALE } from "./roadVehicle";

describe("car scale", () => {
  it("keeps the mesh at the authored passenger-car size", () => {
    expect(CAR_SCALE).toBe(1);
    expect(TRAFFIC_SCALE).toBe(1);
    expect(CAR_LENGTH_METERS).toBeGreaterThan(3.5);
    expect(CAR_LENGTH_METERS).toBeLessThan(5);
    expect(CAR_WIDTH_METERS).toBeGreaterThan(1.5);
    expect(CAR_WIDTH_METERS).toBeLessThan(2.2);
    expect(CAR_HEIGHT_METERS).toBeGreaterThan(1.3);
    expect(CAR_HEIGHT_METERS).toBeLessThan(1.9);
  });
});
