import { describe, expect, it } from "vitest";
import { createRoadOverlays, type PolylineDrawOptions } from "./roadOverlays";

describe("createRoadOverlays", () => {
  it("draws each road on the ground without reading a photorealistic tile", () => {
    const drawn: PolylineDrawOptions[] = [];
    const parent: { append: (child: { remove: () => void }) => void } = {
      append: () => undefined,
    };
    class Polyline {
      constructor(options: PolylineDrawOptions) {
        drawn.push(options);
      }
      remove(): void {}
    }
    const lines = createRoadOverlays(parent, Polyline, [
      {
        id: "1",
        name: "Storgatan",
        highway: "primary",
        coordinates: [
          { lat: 65.25, lng: 19.65 },
          { lat: 65.26, lng: 19.66 },
        ],
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(drawn[0]?.altitudeMode).toBe("CLAMP_TO_GROUND");
    expect(drawn[0]?.path).toHaveLength(2);
    expect(drawn[0]?.drawsOccludedSegments).toBe(true);
  });
});
