import { describe, expect, it } from "vitest";
import { isMaps3dLibrary } from "./maps3dTypes";

describe("isMaps3dLibrary", () => {
  it("accepts a constructor and rejects incomplete payloads", () => {
    expect(isMaps3dLibrary({ Map3DElement: class {} })).toBe(true);
    expect(isMaps3dLibrary({ Map3DElement: "nope" })).toBe(false);
    expect(isMaps3dLibrary(null)).toBe(false);
  });
});
