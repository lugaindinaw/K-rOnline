import { describe, expect, it } from "vitest";
import { buildRoadNetwork, sampleEdge } from "../roads/roadNetwork";
import { distanceMeters, type OneWay, type RoadPoint, type RoadSegment } from "../roads/drivingRoads";
import {
  TRAFFIC_GAP_METERS,
  TRAFFIC_SPEED_MPS,
  TRAFFIC_STOP_METERS,
  createTraffic,
  refreshTraffic,
  rejoinTraffic,
  roadEndKind,
  stepTraffic,
  trafficCount,
  type TrafficCar,
} from "./traffic";

const places = [
  { name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Kiruna", lat: 67.8558, lng: 20.2253 },
  { name: "Glommersträsk", lat: 65.258, lng: 19.654 },
];

function northOf(point: RoadPoint, meters: number): RoadPoint {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

function eastOf(point: RoadPoint, meters: number): RoadPoint {
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat, lng: point.lng + meters / (111320 * Math.max(0.2, cosine)) };
}

function segment(
  id: string,
  nodes: string[],
  coordinates: RoadPoint[],
  oneway: OneWay = "forward",
): RoadSegment {
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

function onRoad(car: TrafficCar, network: ReturnType<typeof buildRoadNetwork>): void {
  const edge = network.edgesById.get(car.edgeId);
  expect(edge).toBeTruthy();
  expect(Number.isFinite(car.position.lat)).toBe(true);
  expect(Number.isFinite(car.position.lng)).toBe(true);
  expect(car.distanceMeters).toBeGreaterThanOrEqual(0);
  expect(car.distanceMeters).toBeLessThanOrEqual((edge?.lengthMeters ?? 0) + 0.001);
  const sample = sampleEdge(edge!, car.distanceMeters);
  expect(distanceMeters(car.position, sample.position)).toBeLessThan(0.05);
}

describe("trafficCount", () => {
  it("scales with the number of usable edges and stays empty without roads", () => {
    expect(trafficCount(0)).toBe(0);
    expect(trafficCount(Number.NaN)).toBe(0);
    expect(trafficCount(4)).toBe(1);
    expect(trafficCount(25)).toBe(2);
    expect(trafficCount(80)).toBe(5);
  });
});

describe("stepTraffic", () => {
  it("cruises along the centerline at each Swedish test place", () => {
    for (const place of places) {
      const start = { lat: place.lat, lng: place.lng };
      const network = buildRoadNetwork([
        segment("gata", ["1", "2"], [start, northOf(start, 200)]),
      ]);
      const edge = network.edges.find((item) => item.id.endsWith(":forward"));
      const first = sampleEdge(edge!, 20);
      let cars: TrafficCar[] = [
        {
          id: "trafik-1",
          edgeId: edge!.id,
          distanceMeters: 20,
          speedMps: TRAFFIC_SPEED_MPS,
          position: first.position,
          headingDegrees: first.headingDegrees,
        },
      ];
      for (let step = 0; step < 20; step += 1) {
        cars = stepTraffic(network, cars, null, 0.05);
      }
      const car = cars[0]!;
      onRoad(car, network);
      expect(car.speedMps).toBeCloseTo(TRAFFIC_SPEED_MPS, 5);
      expect(car.distanceMeters).toBeCloseTo(20 + TRAFFIC_SPEED_MPS, 1);
      expect(car.edgeId).toBe(edge!.id);
    }
  });

  it("stays on the endpoint when the road ends", () => {
    const start = { lat: places[0]!.lat, lng: places[0]!.lng };
    const end = northOf(start, 100);
    const network = buildRoadNetwork([segment("gata", ["1", "2"], [start, end])]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"))!;
    const sample = sampleEdge(edge, 96);
    let cars: TrafficCar[] = [
      {
        id: "trafik-1",
        edgeId: edge.id,
        distanceMeters: 96,
        speedMps: TRAFFIC_SPEED_MPS,
        position: sample.position,
        headingDegrees: sample.headingDegrees,
      },
    ];
    for (let step = 0; step < 6; step += 1) {
      cars = stepTraffic(network, cars, null, 0.25);
    }
    const car = cars[0]!;
    onRoad(car, network);
    expect(car.edgeId).toBe(edge.id);
    expect(car.distanceMeters).toBeCloseTo(edge.lengthMeters, 2);
    expect(distanceMeters(car.position, end)).toBeLessThan(1);
    const held = stepTraffic(network, cars, null, 0.2)[0]!;
    expect(held.distanceMeters).toBeCloseTo(edge.lengthMeters, 2);
    expect(distanceMeters(held.position, car.position)).toBeLessThan(0.05);
  });

  it("continues onto the next connected segment without leaving the polyline", () => {
    const start = { lat: places[2]!.lat, lng: places[2]!.lng };
    const corner = northOf(start, 80);
    const east = eastOf(corner, 80);
    const network = buildRoadNetwork([
      segment("ett", ["1", "2"], [start, corner]),
      segment("två", ["2", "3"], [corner, east]),
    ]);
    const first = network.edges.find((item) => item.osmWayId === "ett" && item.id.endsWith(":forward"))!;
    const sample = sampleEdge(first, first.lengthMeters - 4);
    let cars: TrafficCar[] = [
      {
        id: "trafik-1",
        edgeId: first.id,
        distanceMeters: first.lengthMeters - 4,
        speedMps: TRAFFIC_SPEED_MPS,
        position: sample.position,
        headingDegrees: sample.headingDegrees,
      },
    ];
    for (let step = 0; step < 4; step += 1) {
      cars = stepTraffic(network, cars, null, 0.25);
    }
    const car = cars[0]!;
    onRoad(car, network);
    expect(car.edgeId).not.toBe(first.id);
    expect(car.edgeId).toContain("två");
    expect(distanceMeters(car.position, corner)).toBeGreaterThan(1);
    expect(distanceMeters(car.position, corner)).toBeLessThan(20);
  });

  it("holds a steady gap behind another traffic car and behind the player", () => {
    const start = { lat: places[1]!.lat, lng: places[1]!.lng };
    const network = buildRoadNetwork([segment("gata", ["1", "2"], [start, northOf(start, 400)])]);
    const edge = network.edges.find((item) => item.id.endsWith(":forward"))!;
    const leaderSample = sampleEdge(edge, 120);
    const followerSample = sampleEdge(edge, 104);
    let cars: TrafficCar[] = [
      {
        id: "ledare",
        edgeId: edge.id,
        distanceMeters: 120,
        speedMps: TRAFFIC_SPEED_MPS,
        position: leaderSample.position,
        headingDegrees: leaderSample.headingDegrees,
      },
      {
        id: "foljare",
        edgeId: edge.id,
        distanceMeters: 104,
        speedMps: TRAFFIC_SPEED_MPS,
        position: followerSample.position,
        headingDegrees: followerSample.headingDegrees,
      },
    ];
    for (let step = 0; step < 40; step += 1) {
      cars = stepTraffic(network, cars, null, 0.05);
    }
    const leader = cars.find((car) => car.id === "ledare")!;
    const follower = cars.find((car) => car.id === "foljare")!;
    onRoad(leader, network);
    onRoad(follower, network);
    const gap = leader.distanceMeters - follower.distanceMeters;
    expect(gap).toBeGreaterThan(TRAFFIC_STOP_METERS - 0.5);
    expect(gap).toBeLessThan(TRAFFIC_GAP_METERS + 4);
    expect(follower.distanceMeters).toBeLessThan(leader.distanceMeters);

    const playerSample = sampleEdge(edge, 80);
    let behind: TrafficCar[] = [
      {
        id: "trafik-1",
        edgeId: edge.id,
        distanceMeters: 64,
        speedMps: TRAFFIC_SPEED_MPS,
        position: sampleEdge(edge, 64).position,
        headingDegrees: playerSample.headingDegrees,
      },
    ];
    for (let step = 0; step < 40; step += 1) {
      behind = stepTraffic(
        network,
        behind,
        { edgeId: edge.id, distanceMeters: 80, position: playerSample.position },
        0.05,
      );
    }
    const car = behind[0]!;
    onRoad(car, network);
    expect(car.distanceMeters).toBeLessThan(80);
    expect(80 - car.distanceMeters).toBeGreaterThan(TRAFFIC_STOP_METERS - 0.5);
  });

  it("ignores a missing edge and an empty network", () => {
    const start = { lat: places[0]!.lat, lng: places[0]!.lng };
    const network = buildRoadNetwork([segment("gata", ["1", "2"], [start, northOf(start, 80)])]);
    const orphan: TrafficCar = {
      id: "trafik-1",
      edgeId: "saknas",
      distanceMeters: 10,
      speedMps: TRAFFIC_SPEED_MPS,
      position: start,
      headingDegrees: 0,
    };
    const held = stepTraffic(network, [orphan], null, 0.2)[0]!;
    expect(held.position).toEqual(start);
    expect(held.speedMps).toBe(0);
    expect(stepTraffic(buildRoadNetwork([]), [orphan], null, 0.2)[0]?.position).toEqual(start);
    expect(createTraffic(buildRoadNetwork([]), null)).toEqual([]);
    expect(refreshTraffic([orphan], buildRoadNetwork([]), null)).toEqual([]);
  });
});

describe("createTraffic", () => {
  it("places cars on the network, away from the player, and drops cars from another town", () => {
    const stockholm = places[0]!;
    const roads = [
      segment("norr", ["1", "2"], [stockholm, northOf(stockholm, 180)]),
      segment("oster", ["1", "3"], [stockholm, eastOf(stockholm, 180)]),
    ];
    const network = buildRoadNetwork(roads);
    const player = northOf(stockholm, 12);
    const cars = createTraffic(network, player);
    expect(cars.length).toBeGreaterThan(0);
    expect(cars.length).toBeLessThanOrEqual(trafficCount(network.edges.length));
    for (const car of cars) {
      onRoad(car, network);
      expect(distanceMeters(car.position, player)).toBeGreaterThan(30);
    }
    const farStart = northOf(stockholm, 3000);
    const distant = buildRoadNetwork([
      ...Array.from({ length: 8 }, (_, index) =>
        segment(
          `nara-${index}`,
          [`a${index}`, `b${index}`],
          [eastOf(stockholm, index * 12), northOf(eastOf(stockholm, index * 12), 160)],
          "forward",
        ),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        segment(
          `fjarr-${index}`,
          [`c${index}`, `d${index}`],
          [eastOf(farStart, index * 12), northOf(eastOf(farStart, index * 12), 160)],
          "forward",
        ),
      ),
    ]);
    const nearby = createTraffic(distant, player);
    expect(nearby.length).toBe(trafficCount(distant.edges.length));
    for (const car of nearby) {
      onRoad(car, distant);
      expect(car.edgeId).toContain("nara-");
      expect(distanceMeters(car.position, player)).toBeGreaterThan(30);
      expect(distanceMeters(car.position, player)).toBeLessThan(280);
    }
    const kiruna = places[1]!;
    const far = buildRoadNetwork([
      segment("malm", ["9", "8"], [kiruna, northOf(kiruna, 160)]),
    ]);
    const moved = rejoinTraffic(cars, far, kiruna);
    expect(moved.length).toBeGreaterThan(0);
    for (const car of moved) {
      onRoad(car, far);
      expect(distanceMeters(car.position, kiruna)).toBeLessThan(200);
    }
  });
});

function crossingRoads(extra = true) {
  const start = { lat: places[0]!.lat, lng: places[0]!.lng };
  const node = northOf(start, 90);
  const roads = [
    segment("in", ["a", "n"], [start, node], "forward"),
    segment("ut-n", ["n", "b"], [node, northOf(node, 80)], "forward"),
    segment("ut-o", ["n", "c"], [node, eastOf(node, 80)], "forward"),
  ];
  if (extra) {
    roads.push(segment("ut-v", ["n", "d"], [node, eastOf(node, -80)], "forward"));
    roads.push(segment("fjar", ["x", "y"], [northOf(start, 2500), northOf(start, 2600)], "forward"));
  }
  return buildRoadNetwork(roads);
}

function carAt(network: ReturnType<typeof buildRoadNetwork>, edgeId: string, distance: number, id: string): TrafficCar {
  const edge = network.edgesById.get(edgeId)!;
  const sample = sampleEdge(edge, distance);
  return {
    id,
    edgeId,
    distanceMeters: distance,
    speedMps: TRAFFIC_SPEED_MPS,
    position: sample.position,
    headingDegrees: sample.headingDegrees,
  };
}

describe("junctions", () => {
  it("tells a continuation, a branch, a crossing and a dead end apart", () => {
    const start = { lat: places[2]!.lat, lng: places[2]!.lng };
    const node = northOf(start, 70);
    const straight = buildRoadNetwork([
      segment("in", ["a", "n"], [start, node], "forward"),
      segment("ut", ["n", "b"], [node, northOf(node, 70)], "forward"),
    ]);
    const branch = buildRoadNetwork([
      segment("in", ["a", "n"], [start, node], "forward"),
      segment("ut", ["n", "b"], [node, northOf(node, 70)], "forward"),
      segment("sida", ["n", "c"], [node, eastOf(node, 70)], "forward"),
    ]);
    const crossing = crossingRoads();
    const dead = buildRoadNetwork([segment("slut", ["a", "n"], [start, node], "forward")]);
    expect(roadEndKind(straight, straight.edges.find((edge) => edge.osmWayId === "in")!)).toBe("continuation");
    expect(roadEndKind(branch, branch.edges.find((edge) => edge.osmWayId === "in")!)).toBe("branch");
    expect(roadEndKind(crossing, crossing.edges.find((edge) => edge.osmWayId === "in")!)).toBe("crossing");
    expect(roadEndKind(dead, dead.edges[0]!)).toBe("dead-end");
  });

  it("slows down on the way into a crossing and stays on the approach", () => {
    const network = crossingRoads();
    const approach = network.edges.find((edge) => edge.osmWayId === "in")!;
    let cars = [carAt(network, approach.id, approach.lengthMeters - 24, "trafik-1")];
    const started = cars[0]!.speedMps;
    for (let step = 0; step < 8; step += 1) {
      cars = stepTraffic(network, cars, null, 0.05);
    }
    const car = cars[0]!;
    onRoad(car, network);
    expect(car.edgeId).toBe(approach.id);
    expect(car.speedMps).toBeLessThan(started);
    expect(car.distanceMeters).toBeLessThanOrEqual(approach.lengthMeters);
  });

  it("stops before a crossing when another car is too close to continue", () => {
    const start = { lat: places[0]!.lat, lng: places[0]!.lng };
    const node = northOf(start, 90);
    const network = buildRoadNetwork([
      segment("in", ["a", "n"], [start, node], "forward"),
      segment("ut-n", ["n", "b"], [node, northOf(node, 80)], "forward"),
      segment("ut-o", ["n", "c"], [node, eastOf(node, 10)], "forward"),
      segment("ut-v", ["n", "d"], [node, eastOf(node, -80)], "forward"),
    ]);
    const approach = network.edges.find((edge) => edge.osmWayId === "in")!;
    const exit = network.edges.find((edge) => edge.osmWayId === "ut-o")!;
    let cars = [
      carAt(network, approach.id, approach.lengthMeters - 18, "trafik-2"),
      carAt(network, exit.id, exit.lengthMeters, "trafik-1"),
    ];
    for (let step = 0; step < 12; step += 1) {
      cars = stepTraffic(network, cars, null, 0.25);
    }
    const waiting = cars.find((car) => car.id === "trafik-2")!;
    onRoad(waiting, network);
    expect(waiting.edgeId).toBe(approach.id);
    expect(waiting.speedMps).toBeLessThan(1);
    expect(waiting.distanceMeters).toBeLessThanOrEqual(approach.lengthMeters);
    expect(distanceMeters(waiting.position, sampleEdge(approach, approach.lengthMeters).position)).toBeLessThan(20);
    expect(Number.isFinite(waiting.position.lat)).toBe(true);
    expect(Number.isFinite(waiting.position.lng)).toBe(true);
  });

  it("continues onto a connected edge when the crossing is clear", () => {
    const network = crossingRoads();
    const approach = network.edges.find((edge) => edge.osmWayId === "in")!;
    let cars = [carAt(network, approach.id, approach.lengthMeters - 8, "trafik-1")];
    for (let step = 0; step < 10; step += 1) {
      cars = stepTraffic(network, cars, null, 0.25);
    }
    const car = cars[0]!;
    onRoad(car, network);
    const edge = network.edgesById.get(car.edgeId)!;
    expect(car.edgeId).not.toBe(approach.id);
    expect(edge.fromNode).toBe(approach.toNode);
    expect(edge.osmWayId).not.toBe("fjar");
    expect(distanceMeters(car.position, sampleEdge(approach, approach.lengthMeters).position)).toBeGreaterThan(1);
    expect(distanceMeters(car.position, sampleEdge(approach, approach.lengthMeters).position)).toBeLessThan(25);
  });
});
