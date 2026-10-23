import { describe, expect, it } from "vitest";
import { formatGeographicPosition, readGeographicPosition } from "./coordinates";

describe("readGeographicPosition", () => {
  it("reads a literal position", () => {
    expect(readGeographicPosition({ lat: 59.3293, lng: 18.0686, altitude: 12 })).toEqual({
      lat: 59.3293,
      lng: 18.0686,
      altitudeMeters: 12,
    });
  });

  it("reads Google-style accessor methods", () => {
    expect(
      readGeographicPosition({
        lat: () => 59.33,
        lng: () => 18.07,
      }),
    ).toEqual({
      lat: 59.33,
      lng: 18.07,
      altitudeMeters: null,
    });
  });

  it("rejects positions outside the valid range", () => {
    expect(readGeographicPosition({ lat: 91, lng: 18 })).toBeNull();
    expect(readGeographicPosition(null)).toBeNull();
  });
});

describe("formatGeographicPosition", () => {
  it("includes altitude when it exists", () => {
    expect(
      formatGeographicPosition({ lat: 59.3293, lng: 18.0686, altitudeMeters: 4 }),
    ).toBe("59.32930, 18.06860 (4.0 m)");
  });
});
