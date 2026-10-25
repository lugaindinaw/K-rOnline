import { describe, expect, it } from "vitest";
import { readElevations } from "./groundElevation";

describe("readElevations", () => {
  it("reads finite elevations and ignores anything else", () => {
    expect(readElevations({ elevation: [546, 24] })).toEqual([546, 24]);
    expect(readElevations({ elevation: ["546"] })).toEqual([]);
    expect(readElevations(null)).toEqual([]);
  });
});
