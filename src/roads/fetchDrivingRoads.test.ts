import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRoadCache, fetchDrivingRoads } from "./fetchDrivingRoads";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchDrivingRoads", () => {
  beforeEach(() => {
    clearRoadCache();
  });

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

  it("reuses a successful area instead of calling the service again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          {
            type: "way",
            id: 7,
            nodes: [1, 2],
            tags: { highway: "residential", name: "Storgatan" },
            geometry: [
              { lat: 65.258, lon: 19.654 },
              { lat: 65.2583, lon: 19.654 },
            ],
          },
        ],
      }),
    );
    const center = { lat: 65.258, lng: 19.654 };
    const options = { fetchImpl, endpoints: ["https://cache.test/interpreter"] as const };
    const first = await fetchDrivingRoads(center, options);
    const second = await fetchDrivingRoads(center, options);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains when every endpoint fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await fetchDrivingRoads(
      { lat: 59.3293, lng: 18.0686 },
      { fetchImpl, endpoints: ["https://first.test/interpreter", "https://second.test/interpreter"] },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("upptagen");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retry = await fetchDrivingRoads(
      { lat: 59.3293, lng: 18.0686 },
      { fetchImpl, endpoints: ["https://first.test/interpreter", "https://second.test/interpreter"] },
    );
    expect(retry.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("reuses a rounded area around Kiruna without a second request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          {
            type: "way",
            id: 9,
            nodes: [3, 4],
            tags: { highway: "residential", name: "Adolf Hedinsvägen" },
            geometry: [
              { lat: 67.8558, lon: 20.2253 },
              { lat: 67.8562, lon: 20.2253 },
            ],
          },
        ],
      }),
    );
    const options = { fetchImpl, endpoints: ["https://cache.test/interpreter"] as const };
    await fetchDrivingRoads({ lat: 67.8558, lng: 20.2253 }, options);
    await fetchDrivingRoads({ lat: 67.85584, lng: 20.22534 }, options);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
