export type Map3DConstructorOptions = {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
  mode: "HYBRID" | "SATELLITE";
};

export type Map3DViewElement = HTMLElement;

export type Maps3dLibrary = {
  Map3DElement: new (options?: Map3DConstructorOptions) => Map3DViewElement;
};

export function isMaps3dLibrary(value: unknown): value is Maps3dLibrary {
  if (typeof value !== "object" || value === null || !("Map3DElement" in value)) {
    return false;
  }
  return typeof value.Map3DElement === "function";
}
