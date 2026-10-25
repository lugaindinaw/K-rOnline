import { distanceMeters, type RoadPoint, type RoadSegment } from "./drivingRoads";

export const START_SNAP_METERS = 100;

export type RoadEdge = {
  id: string;
  osmWayId: string;
  name: string | null;
  highway: string;
  fromNode: string;
  toNode: string;
  points: RoadPoint[];
  lengthMeters: number;
  cumulativeMeters: number[];
};

export type RoadNetwork = {
  edges: RoadEdge[];
  edgesById: Map<string, RoadEdge>;
  outgoing: Map<string, RoadEdge[]>;
  unlinked: number;
};

export type RoadPlacement = {
  edge: RoadEdge;
  distanceMeters: number;
  gapMeters: number;
};

function measure(points: RoadPoint[]): { lengthMeters: number; cumulativeMeters: number[] } {
  const cumulativeMeters = [0];
  let lengthMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) {
      continue;
    }
    lengthMeters += distanceMeters(previous, point);
    cumulativeMeters.push(lengthMeters);
  }
  return { lengthMeters, cumulativeMeters };
}

function junctionNodes(roads: RoadSegment[]): Set<string> {
  const waysByNode = new Map<string, Set<string>>();
  for (const road of roads) {
    if (!road.nodeIds) {
      continue;
    }
    for (const nodeId of new Set(road.nodeIds)) {
      if (!nodeId) {
        continue;
      }
      const ways = waysByNode.get(nodeId) ?? new Set<string>();
      ways.add(road.osmWayId);
      waysByNode.set(nodeId, ways);
    }
  }
  const junctions = new Set<string>();
  for (const [nodeId, ways] of waysByNode) {
    if (ways.size >= 2) {
      junctions.add(nodeId);
    }
  }
  return junctions;
}

function pushEdge(
  edges: RoadEdge[],
  road: RoadSegment,
  nodeIds: string[],
  points: RoadPoint[],
  fromIndex: number,
  toIndex: number,
  forward: boolean,
): void {
  const spanPoints = points.slice(fromIndex, toIndex + 1);
  const spanNodes = nodeIds.slice(fromIndex, toIndex + 1);
  if (spanPoints.length < 2 || spanNodes.length !== spanPoints.length) {
    return;
  }
  const directedPoints = forward ? spanPoints : [...spanPoints].reverse();
  const directedNodes = forward ? spanNodes : [...spanNodes].reverse();
  const fromNode = directedNodes[0];
  const toNode = directedNodes[directedNodes.length - 1];
  if (!fromNode || !toNode) {
    return;
  }
  const measured = measure(directedPoints);
  if (measured.lengthMeters <= 0) {
    return;
  }
  edges.push({
    id: `${road.id}:${fromIndex}-${toIndex}:${forward ? "forward" : "backward"}`,
    osmWayId: road.osmWayId,
    name: road.name,
    highway: road.highway,
    fromNode,
    toNode,
    points: directedPoints,
    lengthMeters: measured.lengthMeters,
    cumulativeMeters: measured.cumulativeMeters,
  });
}

export function buildRoadNetwork(roads: RoadSegment[]): RoadNetwork {
  const junctions = junctionNodes(roads);
  const edges: RoadEdge[] = [];
  let unlinked = 0;
  for (const road of roads) {
    if (!road.nodeIds || road.nodeIds.length !== road.coordinates.length) {
      unlinked += 1;
      continue;
    }
    const splitAt = [0];
    for (let index = 1; index < road.nodeIds.length - 1; index += 1) {
      const nodeId = road.nodeIds[index];
      if (nodeId && junctions.has(nodeId)) {
        splitAt.push(index);
      }
    }
    splitAt.push(road.nodeIds.length - 1);
    for (let part = 1; part < splitAt.length; part += 1) {
      const fromIndex = splitAt[part - 1];
      const toIndex = splitAt[part];
      if (fromIndex === undefined || toIndex === undefined || toIndex <= fromIndex) {
        continue;
      }
      if (road.oneway !== "backward") {
        pushEdge(edges, road, road.nodeIds, road.coordinates, fromIndex, toIndex, true);
      }
      if (road.oneway !== "forward") {
        pushEdge(edges, road, road.nodeIds, road.coordinates, fromIndex, toIndex, false);
      }
    }
  }

  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const outgoing = new Map<string, RoadEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.fromNode) ?? [];
    list.push(edge);
    outgoing.set(edge.fromNode, list);
  }
  return { edges, edgesById, outgoing, unlinked };
}

function toLocal(origin: RoadPoint, point: RoadPoint): { x: number; y: number } {
  const latRad = (origin.lat * Math.PI) / 180;
  return {
    x: ((point.lng - origin.lng) * Math.PI) / 180 * 6371000 * Math.cos(latRad),
    y: ((point.lat - origin.lat) * Math.PI) / 180 * 6371000,
  };
}

function projectSegment(
  start: RoadPoint,
  end: RoadPoint,
  point: RoadPoint,
): { point: RoadPoint; t: number; gapMeters: number } {
  const delta = toLocal(start, end);
  const offset = toLocal(start, point);
  const lengthSquared = delta.x * delta.x + delta.y * delta.y;
  const t =
    lengthSquared <= 1e-6
      ? 0
      : Math.min(1, Math.max(0, (offset.x * delta.x + offset.y * delta.y) / lengthSquared));
  const projected = {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t,
  };
  return { point: projected, t, gapMeters: distanceMeters(point, projected) };
}

function prefers(candidate: RoadPlacement, current: RoadPlacement): boolean {
  if (candidate.gapMeters + 0.05 < current.gapMeters) {
    return true;
  }
  if (Math.abs(candidate.gapMeters - current.gapMeters) > 0.05) {
    return false;
  }
  const candidateForward = candidate.edge.id.endsWith(":forward");
  const currentForward = current.edge.id.endsWith(":forward");
  if (candidateForward !== currentForward) {
    return candidateForward;
  }
  return candidate.edge.id < current.edge.id;
}

export function nearestPlacement(
  network: RoadNetwork,
  point: RoadPoint,
  maxGapMeters = START_SNAP_METERS,
): RoadPlacement | null {
  let best: RoadPlacement | null = null;
  for (const edge of network.edges) {
    for (let index = 1; index < edge.points.length; index += 1) {
      const start = edge.points[index - 1];
      const end = edge.points[index];
      const startDistance = edge.cumulativeMeters[index - 1];
      const endDistance = edge.cumulativeMeters[index];
      if (!start || !end || startDistance === undefined || endDistance === undefined) {
        continue;
      }
      const projected = projectSegment(start, end, point);
      const placement = {
        edge,
        distanceMeters: startDistance + projected.t * (endDistance - startDistance),
        gapMeters: projected.gapMeters,
      };
      if (!best || prefers(placement, best)) {
        best = placement;
      }
    }
  }
  if (!best || best.gapMeters > maxGapMeters) {
    return null;
  }
  return best;
}

export function placementWithRunway(placement: RoadPlacement, runwayMeters = 25): RoadPlacement {
  const remaining = placement.edge.lengthMeters - placement.distanceMeters;
  if (remaining >= runwayMeters || placement.edge.lengthMeters <= runwayMeters) {
    return placement;
  }
  return {
    ...placement,
    distanceMeters: Math.max(0, placement.edge.lengthMeters - runwayMeters),
  };
}

export function explainRoads(
  roads: RoadSegment[],
  anchor: RoadPoint | null,
): { network: RoadNetwork; placement: RoadPlacement | null; message: string | null } {
  const network = buildRoadNetwork(roads);
  if (roads.length === 0) {
    return { network, placement: null, message: null };
  }
  if (network.edges.length === 0) {
    return {
      network,
      placement: null,
      message: "Vägdatan saknar noder, så vägarna kan inte kopplas ihop.",
    };
  }
  if (!anchor) {
    return {
      network,
      placement: null,
      message: "Kartans position saknas, så bilen kan inte placeras.",
    };
  }
  const placement = nearestPlacement(network, anchor, START_SNAP_METERS);
  if (!placement) {
    return {
      network,
      placement: null,
      message: `Ingen körbar väg inom ${START_SNAP_METERS} m från den här positionen. Klicka närmare en väglinje eller hämta vägar vid kameran.`,
    };
  }
  return {
    network,
    placement,
    message:
      network.unlinked > 0 ? "Några vägsträckor saknar noder och ingår inte i körningen." : null,
  };
}

export function bearingDegrees(from: RoadPoint, to: RoadPoint): number {
  if (distanceMeters(from, to) < 0.05) {
    return 0;
  }
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function pointAlong(edge: RoadEdge, distanceMetersAlong: number): RoadPoint {
  const first = edge.points[0];
  const last = edge.points[edge.points.length - 1];
  if (!first || !last) {
    return { lat: 0, lng: 0 };
  }
  if (distanceMetersAlong <= 0) {
    return first;
  }
  if (distanceMetersAlong >= edge.lengthMeters) {
    return last;
  }
  let index = 1;
  while (index < edge.cumulativeMeters.length && (edge.cumulativeMeters[index] ?? 0) < distanceMetersAlong) {
    index += 1;
  }
  const startDistance = edge.cumulativeMeters[index - 1] ?? 0;
  const endDistance = edge.cumulativeMeters[index] ?? startDistance;
  const span = endDistance - startDistance;
  const t = span <= 0 ? 0 : (distanceMetersAlong - startDistance) / span;
  const start = edge.points[index - 1] ?? first;
  const end = edge.points[index] ?? last;
  return {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t,
  };
}

function headingOfSegment(edge: RoadEdge, index: number): number | null {
  const start = edge.points[index - 1];
  const end = edge.points[index];
  if (!start || !end || distanceMeters(start, end) < 0.05) {
    return null;
  }
  return (bearingDegrees(start, end) + 360) % 360;
}

function segmentHeading(edge: RoadEdge, distance: number): number {
  const last = edge.points.length - 1;
  let index = 1;
  while (index < last && (edge.cumulativeMeters[index] ?? 0) <= distance) {
    index += 1;
  }
  for (let cursor = index; cursor <= last; cursor += 1) {
    const heading = headingOfSegment(edge, cursor);
    if (heading !== null) {
      return heading;
    }
  }
  for (let cursor = index - 1; cursor >= 1; cursor -= 1) {
    const heading = headingOfSegment(edge, cursor);
    if (heading !== null) {
      return heading;
    }
  }
  return 0;
}

export function sampleEdge(
  edge: RoadEdge,
  distanceMetersAlong: number,
): { position: RoadPoint; headingDegrees: number } {
  const distance = Math.min(edge.lengthMeters, Math.max(0, distanceMetersAlong));
  return {
    position: pointAlong(edge, distance),
    headingDegrees: segmentHeading(edge, distance),
  };
}
