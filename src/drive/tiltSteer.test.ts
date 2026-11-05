import { describe, expect, it } from "vitest";
import { requestTiltPermission, steerFromTilt } from "./tiltSteer";

describe("tilt steering", () => {
  it("ignores a small tilt and reaches full lock at 32 degrees", () => {
    expect(steerFromTilt({ beta: 0, gamma: 4 }, false)).toBe(0);
    expect(steerFromTilt({ beta: 0, gamma: 32 }, false)).toBe(1);
    expect(steerFromTilt({ beta: 0, gamma: -32 }, false)).toBe(-1);
  });

  it("uses the side-to-side axis for the way the phone is held", () => {
    expect(steerFromTilt({ beta: 32, gamma: 0 }, true)).toBe(1);
    expect(steerFromTilt({ beta: 0, gamma: 32 }, true)).toBe(0);
    expect(steerFromTilt({ beta: null, gamma: null }, false)).toBe(0);
  });

  it("asks for permission only when the browser requires it", async () => {
    expect(await requestTiltPermission()).toBe(true);
    expect(await requestTiltPermission(async () => "granted")).toBe(true);
    expect(await requestTiltPermission(async () => "denied")).toBe(false);
    expect(await requestTiltPermission(async () => Promise.reject(new Error("nope")))).toBe(false);
  });
});
