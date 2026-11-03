import { describe, expect, it } from "vitest";
import { describeSignCoverage, parseOverpassSigns } from "./roadSigns";

describe("parseOverpassSigns", () => {
  it("reads stop, yield, a numeric speed and an explicit one-way, and skips everything else", () => {
    const signs = parseOverpassSigns({
      elements: [
        { type: "node", id: 1, lat: 59.33, lon: 18.06, tags: { highway: "stop" } },
        { type: "node", id: 2, lat: 59.331, lon: 18.061, tags: { highway: "give_way" } },
        { type: "node", id: 3, lat: 59.332, lon: 18.062, tags: { highway: "crossing", crossing: "traffic_signals" } },
        {
          type: "way",
          id: 10,
          nodes: [4, 5],
          tags: { highway: "residential", maxspeed: "50", oneway: "yes" },
          geometry: [
            { lat: 59.33, lon: 18.06 },
            { lat: 59.331, lon: 18.06 },
          ],
        },
        {
          type: "way",
          id: 11,
          nodes: [6, 7],
          tags: { highway: "residential", maxspeed: "SE:urban", oneway: "no" },
          geometry: [
            { lat: 59.34, lon: 18.07 },
            { lat: 59.341, lon: 18.07 },
          ],
        },
        {
          type: "way",
          id: 12,
          nodes: [8, 9],
          tags: { highway: "residential", maxspeed: "30 mph", oneway: "alternating" },
          geometry: [
            { lat: 59.35, lon: 18.08 },
            { lat: 59.351, lon: 18.08 },
          ],
        },
      ],
    });
    expect(signs.map((sign) => sign.kind).sort()).toEqual(["give_way", "maxspeed", "oneway", "stop"]);
    expect(signs.find((sign) => sign.kind === "maxspeed")?.label).toBe("50");
    expect(signs.find((sign) => sign.kind === "stop")?.label).toBe("STOP");
    expect(signs.find((sign) => sign.kind === "give_way")?.label).toBe("VÄJ");
    expect(signs.find((sign) => sign.kind === "oneway")?.id).toBe("oneway:10");
    expect(describeSignCoverage(signs)).toContain("1 stopplikt");
    expect(describeSignCoverage([])).toContain("Inga stopp-");
  });

  it("places a backward one-way sign at the end of the way", () => {
    const signs = parseOverpassSigns({
      elements: [
        {
          type: "way",
          id: 20,
          tags: { highway: "residential", oneway: "-1" },
          geometry: [
            { lat: 59.33, lon: 18.06 },
            { lat: 59.332, lon: 18.06 },
          ],
        },
      ],
    });
    expect(signs).toHaveLength(1);
    expect(signs[0]?.position.lat).toBeCloseTo(59.332, 5);
  });
});
