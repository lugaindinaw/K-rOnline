import { describe, expect, it } from "vitest";
import { readGoogleMapsApiKey } from "./googleMapsKey";

describe("readGoogleMapsApiKey", () => {
  it("returns null when the variable is missing or blank", () => {
    expect(readGoogleMapsApiKey({})).toBeNull();
    expect(readGoogleMapsApiKey({ VITE_GOOGLE_MAPS_API_KEY: "  " })).toBeNull();
  });

  it("rejects placeholder values", () => {
    expect(
      readGoogleMapsApiKey({ VITE_GOOGLE_MAPS_API_KEY: "your_key_here" }),
    ).toBeNull();
  });

  it("returns a trimmed key", () => {
    expect(
      readGoogleMapsApiKey({ VITE_GOOGLE_MAPS_API_KEY: "  test-key  " }),
    ).toBe("test-key");
  });
});
