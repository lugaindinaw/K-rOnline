import { describe, expect, it, vi } from "vitest";
import { fetchDrivingRoads } from "./fetchDrivingRoads";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchDrivingRoads", () => {
  it("does not call the network for a point outside Sweden", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchDrivingRoads(
      { lat: 52.52, lng: 13.405 },
      { fetchImpl, endpoints: ["https://example.test/interpreter"] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Sverige");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the next endpoint when the first is busy", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ remark: "busy" }, 502))
      .mockResolvedValueOnce(
        jsonResponse({
          elements: [
            {
              type: "way",
              id: 42,
              tags: { highway: "residential", name: "Ängsvägen" },
              geometry: [
                { lat: 65.2581, lon: 19.6542 },
                { lat: 65.2584, lon: 19.655 },
              ],
            },
          ],
        }),
      );

    const result = await fetchDrivingRoads(
      { lat: 65.258, lng: 19.654 },
      {
        fetchImpl,
        endpoints: ["https://first.test/interpreter", "https://second.test/interpreter"],
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.area.roads.map((road) => road.name)).toEqual(["Ängsvägen"]);
      expect(result.area.source).toBe("openstreetmap");
      expect(result.area.radiusMeters).toBe(600);
    }
  });
});
