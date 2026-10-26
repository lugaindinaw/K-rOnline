import type { Maps3dLibrary, Marker3DView, Model3DView } from "./maps3dTypes";

export const CAR_MODEL_URL = "/car.glb";
/**
 * The glTF is already a passenger car: about 4.2 m long, 2.0 m wide and 1.7 m tall.
 * Scale 1 keeps that size in the map's meters. Traffic gaps are measured between
 * road positions, not between mesh bounds, so the scale must stay 1 for the cars
 * to match those distances.
 */
export const CAR_LENGTH_METERS = 4.17;
export const CAR_WIDTH_METERS = 1.96;
export const CAR_HEIGHT_METERS = 1.68;
export const CAR_SCALE = 1;
export const TRAFFIC_SCALE = 1;
export const CAR_TILT_DEGREES = 270;
export const CAR_HEADING_OFFSET = 180;

export type VehiclePose = {
  lat: number;
  lng: number;
  headingDegrees: number;
};

export type RoadVehicle = {
  kind: "model" | "marker";
  update: (pose: VehiclePose) => void;
  remove: () => void;
};

function mountModel(
  parent: { append: (child: HTMLElement) => void },
  Model: new (options?: { src?: string; scale?: number; altitudeMode?: "CLAMP_TO_GROUND" }) => Model3DView,
  scale = CAR_SCALE,
): RoadVehicle {
  const model = new Model({
    src: CAR_MODEL_URL,
    scale,
    altitudeMode: "CLAMP_TO_GROUND",
  });
  parent.append(model);
  return {
    kind: "model",
    update(pose) {
      model.position = { lat: pose.lat, lng: pose.lng, altitude: 0 };
      model.orientation = {
        heading: (pose.headingDegrees + CAR_HEADING_OFFSET) % 360,
        tilt: CAR_TILT_DEGREES,
        roll: 0,
      };
    },
    remove() {
      model.remove();
    },
  };
}

function mountMarker(
  parent: { append: (child: HTMLElement) => void },
  Marker: new (options?: {
    label?: string;
    altitudeMode?: "CLAMP_TO_GROUND";
    extruded?: boolean;
    sizePreserved?: boolean;
  }) => Marker3DView,
  label = "Bil",
): RoadVehicle {
  const marker = new Marker({
    label,
    altitudeMode: "CLAMP_TO_GROUND",
    extruded: true,
    sizePreserved: true,
  });
  parent.append(marker);
  return {
    kind: "marker",
    update(pose) {
      marker.position = { lat: pose.lat, lng: pose.lng, altitude: 0 };
    },
    remove() {
      marker.remove();
    },
  };
}

function mountVehicle(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
  scale: number,
  label: string,
): RoadVehicle | null {
  const parts: RoadVehicle[] = [];
  if (typeof library.Model3DElement === "function") {
    try {
      parts.push(mountModel(parent, library.Model3DElement, scale));
    } catch {
      // A pin still shows the same road position when the model cannot be constructed.
    }
  }
  if (typeof library.Marker3DElement === "function") {
    try {
      parts.push(mountMarker(parent, library.Marker3DElement, label));
    } catch {
      // The model remains if the pin cannot be constructed.
    }
  }
  const first = parts[0];
  if (!first) {
    return null;
  }
  return {
    kind: first.kind,
    update(pose) {
      for (const part of parts) {
        part.update(pose);
      }
    },
    remove() {
      for (const part of parts) {
        part.remove();
      }
    },
  };
}

export function mountRoadVehicle(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
): RoadVehicle | null {
  return mountVehicle(parent, library, CAR_SCALE, "Bil");
}

export function mountTrafficVehicle(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
): RoadVehicle | null {
  return mountVehicle(parent, library, TRAFFIC_SCALE, "Trafik");
}
