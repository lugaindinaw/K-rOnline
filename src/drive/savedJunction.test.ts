import { describe, expect, it } from "vitest";
import { vehicleFromPlacement } from "./drive";
import { advanceFreeVehicle } from "./freeDrive";
import { buildRoadNetwork, pathHeading, placementOnEdge, type RoadEdge, type RoadNetwork } from "../roads/roadNetwork";
import { distanceMeters } from "../roads/drivingRoads";
import { savedStockholmRoads } from "../roads/savedStockholmRoads";
import { EMPTY_DRIVE_FACTS, noteDriveFrame, type DriveFacts } from "../training/driveFacts";

function headingOff(network: RoadNetwork, edgeId: string, distance: number, heading: number): number {
  const edge = network.edgesById.get(edgeId);
  if (!edge) {
    return 180;
  }
  const road = pathHeading(null, edge, Math.min(edge.lengthMeters, Math.max(0, distance)));
  return Math.abs(((heading - road + 540) % 360) - 180);
}

function drive(
  network: RoadNetwork,
  edge: RoadEdge,
  steer: number,
  done: (roadName: string | null, toNode: string | undefined) => boolean,
) {
  let state = vehicleFromPlacement({
    edge,
    distanceMeters: Math.max(3, edge.lengthMeters - 38),
    gapMeters: 0,
  });
  const node = edge.points[edge.points.length - 1]!;
  let maxGap = 0;
  for (let step = 0; step < 420; step += 1) {
    const linked = network.edgesById.get(state.edgeId);
    if (done(state.roadName, linked?.toNode)) {
      break;
    }
    const command = distanceMeters(state.position, node) < 20 ? steer : 0;
    const fast = state.speedMps > 3.4;
    state = advanceFreeVehicle(
      state,
      { accelerate: !fast && state.speedMps < 3, brake: fast, steer: command },
      0.05,
      network,
    );
    const now = network.edgesById.get(state.edgeId);
    if (now) {
      maxGap = Math.max(maxGap, placementOnEdge(now, state.position).gapMeters);
    }
  }
  for (let step = 0; step < 30; step += 1) {
    state = advanceFreeVehicle(state, { accelerate: state.speedMps < 3, brake: false, steer: 0 }, 0.05, network);
    const now = network.edgesById.get(state.edgeId);
    if (now) {
      maxGap = Math.max(maxGap, placementOnEdge(now, state.position).gapMeters);
    }
  }
  return { state, maxGap };
}

describe("saved Gustav Adolfs torg junctions", () => {
  const area = savedStockholmRoads({ lat: 59.3294, lng: 18.0689 });
  const network = buildRoadNetwork([...(area?.roads ?? [])]);
  const longRegering = network.edges.find(
    (edge) => edge.name === "Regeringsgatan" && edge.followsWay && edge.lengthMeters > 40 && edge.toNode === "180925",
  );
  const rightRegering = network.edges.find((edge) => {
    if (edge.name !== "Regeringsgatan" || !edge.followsWay || edge.lengthMeters > 30) {
      return false;
    }
    return (network.outgoing.get(edge.toNode) ?? []).some((out) => out.name === "Jakobsgatan");
  });

  it("turns left from speed without leaving the carriageway", () => {
    expect(longRegering).toBeTruthy();
    let state = vehicleFromPlacement({
      edge: longRegering!,
      distanceMeters: Math.max(3, longRegering!.lengthMeters - 28),
      gapMeters: 0,
    });
    state = { ...state, speedMps: 12 };
    let maxGap = 0;
    for (let step = 0; step < 240 && state.roadName !== "Jakobsgatan"; step += 1) {
      state = advanceFreeVehicle(state, { accelerate: true, brake: false, steer: -1 }, 0.05, network);
      const now = network.edgesById.get(state.edgeId);
      if (now) {
        maxGap = Math.max(maxGap, placementOnEdge(now, state.position).gapMeters);
      }
    }
    expect(state.roadName).toBe("Jakobsgatan");
    expect(state.message).toBeNull();
    expect(maxGap).toBeLessThan(4.5);
  });

  it("turns left onto the connected street and stays near the carriageway", () => {
    expect(longRegering).toBeTruthy();
    const { state, maxGap } = drive(network, longRegering!, -1, (name) => name === "Jakobsgatan");
    expect(state.roadName).toBe("Jakobsgatan");
    expect(state.message).toBeNull();
    expect(maxGap).toBeLessThan(4.5);
    expect(headingOff(network, state.edgeId, state.distanceMeters, state.headingDegrees)).toBeLessThan(30);
  });

  it("goes straight through the same junction", () => {
    expect(longRegering).toBeTruthy();
    const { state, maxGap } = drive(
      network,
      longRegering!,
      0,
      (_name, toNode) => toNode !== longRegering!.toNode && stateStill(toNode),
    );
    expect(state.roadName).toBe("Regeringsgatan");
    expect(state.message).toBeNull();
    expect(maxGap).toBeLessThan(4);
    expect(headingOff(network, state.edgeId, state.distanceMeters, state.headingDegrees)).toBeLessThan(20);
  });

  it("turns right onto Jakobsgatan from the short approach", () => {
    expect(rightRegering).toBeTruthy();
    const { state, maxGap } = drive(network, rightRegering!, 1, (name) => name === "Jakobsgatan");
    expect(state.roadName).toBe("Jakobsgatan");
    expect(state.message).toBeNull();
    expect(maxGap).toBeLessThan(4.5);
    expect(headingOff(network, state.edgeId, state.distanceMeters, state.headingDegrees)).toBeLessThan(30);
  });

  it("records a stop at the give_way node on Regeringsgatan and a pass without one", () => {
    const signs = (area?.signs ?? []).filter((sign) => sign.kind === "give_way");
    expect(signs.map((sign) => sign.id).sort()).toEqual([
      "yield:10304683682",
      "yield:507946854",
      "yield:6205990970",
    ]);
    const edge = network.edges.find((item) => item.nodeIds.includes("507946854") && item.followsWay);
    expect(edge).toBeTruthy();
    const index = edge!.nodeIds.indexOf("507946854");
    const at = edge!.cumulativeMeters[index] ?? 0;
    let state = vehicleFromPlacement({ edge: edge!, distanceMeters: Math.max(0, at - 26), gapMeters: 0 });
    let facts: DriveFacts = EMPTY_DRIVE_FACTS;
    const giveWay = signs.map((sign) => ({ id: sign.id, position: sign.position }));
    for (let step = 0; step < 240; step += 1) {
      const gap = distanceMeters(state.position, signs.find((sign) => sign.id === "yield:507946854")!.position);
      const near = gap < 14;
      const stopped = state.speedMps < 0.4 && near;
      state = advanceFreeVehicle(
        state,
        { accelerate: !near && state.speedMps < 3, brake: near && !stopped, steer: 0 },
        0.05,
        network,
      );
      facts = noteDriveFrame(facts, {
        position: state.position,
        headingDegrees: state.headingDegrees,
        speedMps: state.speedMps,
        brake: near,
        steer: 0,
        offsetMeters: state.offsetMeters,
        indicator: "off",
        giveWay,
      });
      if (stopped && facts.yields.find((item) => item.id === "yield:507946854")?.stopped) {
        break;
      }
    }
    expect(facts.yields.find((item) => item.id === "yield:507946854")?.stopped).toBe(true);
    expect(facts.yields).toHaveLength(3);
  });
});

function stateStill(toNode: string | undefined): boolean {
  return Boolean(toNode);
}
