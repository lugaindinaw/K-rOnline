import { highwayClass, type RoadSegment } from "../roads/drivingRoads";

export type RoadLine = {
  remove: () => void;
};

export type PolylineDrawOptions = {
  path: Array<{ lat: number; lng: number }>;
  strokeColor: string;
  strokeWidth: number;
  outerColor: string;
  outerWidth: number;
  altitudeMode: "CLAMP_TO_GROUND";
  drawsOccludedSegments: boolean;
  geodesic: boolean;
};

export function styleForHighway(highway: string): { strokeColor: string; strokeWidth: number } {
  const roadClass = highwayClass(highway);
  if (roadClass === "motorway" || roadClass === "trunk") {
    return { strokeColor: "#c45c26", strokeWidth: 10 };
  }
  if (roadClass === "primary" || roadClass === "secondary") {
    return { strokeColor: "#1f4d3a", strokeWidth: 8 };
  }
  if (roadClass === "tertiary") {
    return { strokeColor: "#2f6fad", strokeWidth: 7 };
  }
  return { strokeColor: "#6d6458", strokeWidth: 5 };
}

export function createRoadOverlays<T extends RoadLine>(
  parent: { append: (child: T) => void },
  Polyline: new (options: PolylineDrawOptions) => T,
  roads: RoadSegment[],
): T[] {
  const lines: T[] = [];
  for (const road of roads) {
    if (road.coordinates.length < 2) {
      continue;
    }
    const style = styleForHighway(road.highway);
    const line = new Polyline({
      path: road.coordinates.map((point) => ({ lat: point.lat, lng: point.lng })),
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
      outerColor: "#fffdf8",
      outerWidth: 0.35,
      altitudeMode: "CLAMP_TO_GROUND",
      drawsOccludedSegments: true,
      geodesic: true,
    });
    parent.append(line);
    lines.push(line);
  }
  return lines;
}
