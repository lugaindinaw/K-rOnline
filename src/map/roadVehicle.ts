import type { Maps3dLibrary, Marker3DView, Model3DView } from "./maps3dTypes";

export const CAR_MODEL_URL = "/car.glb";
export const CAR_SCALE = 4;
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
): RoadVehicle {
  const model = new Model({
    src: CAR_MODEL_URL,
    scale: CAR_SCALE,
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
): RoadVehicle {
  const marker = new Marker({
    label: "Bil",
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

export function mountRoadVehicle(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
): RoadVehicle | null {
  const parts: RoadVehicle[] = [];
  if (typeof library.Model3DElement === "function") {
    try {
      parts.push(mountModel(parent, library.Model3DElement));
    } catch {
      // A pin still shows the same road position when the model cannot be constructed.
    }
  }
  if (typeof library.Marker3DElement === "function") {
    try {
      parts.push(mountMarker(parent, library.Marker3DElement));
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
