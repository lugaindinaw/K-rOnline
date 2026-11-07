import { describe, expect, it } from "vitest";
import { MAX_SPEED_MPS } from "./drive";
import { postedLimitKmh, speedCapMps } from "./roadSpeed";

describe("road speed", () => {
  it("keeps city streets on the existing cap", () => {
    expect(postedLimitKmh({ highway: "residential", maxspeedKmh: null })).toBeNull();
    expect(postedLimitKmh({ highway: "tertiary" })).toBeNull();
    expect(speedCapMps({ highway: "unclassified" })).toBe(MAX_SPEED_MPS);
  });

  it("uses the posted rural and motorway limits and leaves room to go too fast", () => {
    expect(postedLimitKmh({ highway: "secondary", maxspeedKmh: 70 })).toBe(70);
    expect(speedCapMps({ highway: "secondary", maxspeedKmh: 70 }) * 3.6).toBeCloseTo(90, 5);
    expect(postedLimitKmh({ highway: "motorway", maxspeedKmh: 100 })).toBe(100);
    expect(speedCapMps({ highway: "motorway", maxspeedKmh: 100 }) * 3.6).toBeCloseTo(115, 5);
    expect(postedLimitKmh({ highway: "motorway_link", maxspeedKmh: 80 })).toBe(80);
    expect(postedLimitKmh({ highway: "motorway" })).toBe(110);
  });
});
