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
  /** Vertical field of view in degrees. The Maps default is 35. */
  fov?: number;
  cameraPosition?: { lat: number; lng: number; altitude?: number };
  stopCameraAnimation?: () => void;
  flyCameraTo?: (options: {
    endCamera: {
      center: { lat: number; lng: number; altitude: number };
      range: number;
      tilt: number;
      heading: number;
      cameraPosition?: { lat: number; lng: number; altitude: number };
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

export type Model3DOptions = {
  src?: string;
  position?: { lat: number; lng: number; altitude?: number };
  orientation?: { heading: number; tilt: number; roll: number };
  scale?: number | { x: number; y: number; z: number };
  altitudeMode?: "CLAMP_TO_GROUND" | "ABSOLUTE" | "RELATIVE_TO_GROUND" | "RELATIVE_TO_MESH";
};

export type Model3DView = HTMLElement & Model3DOptions;

export type Marker3DOptions = {
  position?: { lat: number; lng: number; altitude?: number };
  label?: string;
  altitudeMode?: "CLAMP_TO_GROUND" | "RELATIVE_TO_GROUND";
  extruded?: boolean;
  sizePreserved?: boolean;
};

export type Marker3DView = HTMLElement & Marker3DOptions;

export type Polygon3DOptions = {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  altitudeMode?: "CLAMP_TO_GROUND" | "ABSOLUTE" | "RELATIVE_TO_GROUND" | "RELATIVE_TO_MESH";
  drawsOccludedSegments?: boolean;
  geodesic?: boolean;
  zIndex?: number;
};

export type Polygon3DView = HTMLElement &
  Polygon3DOptions & {
    path?: Array<{ lat: number; lng: number; altitude?: number }>;
  };

export type Maps3dLibrary = {
  Map3DElement: new (options?: Map3DConstructorOptions) => Map3DViewElement;
  Polyline3DElement?: new (options?: Polyline3DOptions) => HTMLElement;
  Polygon3DElement?: new (options?: Polygon3DOptions) => Polygon3DView;
  Model3DElement?: new (options?: Model3DOptions) => Model3DView;
  Marker3DElement?: new (options?: Marker3DOptions) => Marker3DView;
};

export function isMaps3dLibrary(value: unknown): value is Maps3dLibrary {
  if (typeof value !== "object" || value === null || !("Map3DElement" in value)) {
    return false;
  }
  return typeof value.Map3DElement === "function";
}
