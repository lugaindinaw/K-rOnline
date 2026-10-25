export type Map3DConstructorOptions = {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
  mode: "HYBRID" | "SATELLITE";
};

export type Map3DViewElement = HTMLElement & {
  center?: { lat: number; lng: number; altitude?: number };
  range?: number;
  tilt?: number;
  heading?: number;
  flyCameraTo?: (options: {
    endCamera: {
      center: { lat: number; lng: number; altitude: number };
      range: number;
      tilt: number;
      heading: number;
    };
    durationMillis?: number;
  }) => void;
};

export type Polyline3DOptions = {
  path: Array<{ lat: number; lng: number }>;
  strokeColor: string;
  strokeWidth: number;
  outerColor: string;
  outerWidth: number;
  altitudeMode: "CLAMP_TO_GROUND";
  drawsOccludedSegments: boolean;
  geodesic: boolean;
};

export type Maps3dLibrary = {
  Map3DElement: new (options?: Map3DConstructorOptions) => Map3DViewElement;
  Polyline3DElement?: new (options?: Polyline3DOptions) => HTMLElement;
};

export function isMaps3dLibrary(value: unknown): value is Maps3dLibrary {
  if (typeof value !== "object" || value === null || !("Map3DElement" in value)) {
    return false;
  }
  return typeof value.Map3DElement === "function";
}
