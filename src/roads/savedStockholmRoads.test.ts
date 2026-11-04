import { describe, expect, it } from "vitest";
import { savedCourseStart, savedStockholmRoads } from "./savedStockholmRoads";

describe("saved Stockholm roads", () => {
  it("keeps a real centerline copy near the square and does not invent a width", () => {
    const area = savedStockholmRoads({ lat: 59.3293, lng: 18.0686 });
    expect(area).not.toBeNull();
    expect(area!.source).toBe("saved-openstreetmap");
    expect(area!.roads.length).toBeGreaterThan(10);
    expect(area!.roads.every((road) => road.widthMeters == null)).toBe(true);
    expect(area!.roads.some((road) => road.name === "Regeringsgatan")).toBe(true);
    expect(area!.signs.every((sign) => sign.kind === "give_way")).toBe(true);
    expect(savedStockholmRoads({ lat: 67.8558, lng: 20.2253 })).toBeNull();
  });

  it("offers a start with a junction ahead", () => {
    const area = savedStockholmRoads({ lat: 59.3293, lng: 18.0686 });
    const start = savedCourseStart(area!.roads);
    expect(start).not.toBeNull();
    expect(start!.distanceMeters).toBeGreaterThan(5);
  });
});
