import { describe, expect, it } from "vitest";
import type { RoadSegment, TrafficSignal } from "../roads/drivingRoads";
import { SIGNAL_GREEN_SECONDS, signalColor } from "../traffic/traffic";
import { placeSignalHeads, signalLampColor } from "./signalPosts";
import { syncById } from "./streetFurniture";

function road(id: string, nodes: string[], coordinates: RoadSegment["coordinates"], oneway: RoadSegment["oneway"] = "both"): RoadSegment {
  return {
    id,
    osmWayId: id,
    name: id,
    highway: "residential",
    oneway,
    coordinates,
    nodeIds: nodes,
  };
}

const signal: TrafficSignal = {
  nodeId: "n",
  position: { lat: 59.3308, lng: 18.07 },
  direction: null,
  kind: "signal",
};

describe("placeSignalHeads", () => {
  const north = road("norr", ["a", "n", "b"], [
    { lat: 59.33, lng: 18.07 },
    { lat: 59.3308, lng: 18.07 },
    { lat: 59.3316, lng: 18.07 },
  ]);

  it("places a head only for a real signal on a fetched way", () => {
    expect(placeSignalHeads([], [north])).toEqual([]);
    expect(
      placeSignalHeads([{ ...signal, nodeId: "saknas" }], [north]),
    ).toEqual([]);
    expect(placeSignalHeads([{ ...signal, kind: "other" }], [north])).toEqual([]);
    const heads = placeSignalHeads([signal], [north]);
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.every((head) => head.nodeId === "n")).toBe(true);
    expect(heads.every((head) => head.kind === "signal")).toBe(true);
  });

  it("keeps the same spot when the road list is rebuilt", () => {
    const first = placeSignalHeads([signal], [north]);
    const second = placeSignalHeads([signal], [{ ...north, id: "norr:1" }]);
    expect(second.map((head) => head.position)).toEqual(first.map((head) => head.position));
    expect(second.map((head) => head.id)).toEqual(first.map((head) => head.id));
  });

  it("uses the same color as the traffic cycle", () => {
    expect(signalLampColor(0, 0, "signal")).toBe(signalColor(0, 0));
    expect(signalLampColor(90, 0, "signal")).toBe("red");
    expect(signalLampColor(0, SIGNAL_GREEN_SECONDS, "signal")).toBe("yellow");
    expect(signalLampColor(0, SIGNAL_GREEN_SECONDS + 4, "signal")).toBe("red");
    expect(signalLampColor(90, 0, "continuous_green")).toBe("green");
  });
});

describe("syncById", () => {
  it("leaves an existing object in place and drops ids that left the data", () => {
    const removed: string[] = [];
    const created: string[] = [];
    const current = new Map<string, { remove: () => void }>([
      ["a", { remove: () => removed.push("a") }],
      ["b", { remove: () => removed.push("b") }],
    ]);
    syncById(current, [{ id: "b" }, { id: "c" }], (item) => {
      created.push(item.id);
      return { remove: () => removed.push(item.id) };
    });
    expect(removed).toEqual(["a"]);
    expect(created).toEqual(["c"]);
    expect([...current.keys()]).toEqual(["b", "c"]);
  });
});
