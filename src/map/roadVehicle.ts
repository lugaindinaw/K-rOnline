import type { Maps3dLibrary, Marker3DView, Model3DOptions, Model3DView } from "./maps3dTypes";
import { VEHICLE_ALTITUDE_MODE, vehicleAltitudeMeters } from "./vehicleContact";

export const CAR_MODEL_URL = "/car.glb";
export const CABIN_MODEL_URL = "/cabin.glb";
export const TRAFFIC_MODEL_URL = "/traffic.glb";
/**
 * Grab3D electric car, CC0. About 4.53 m long, four separate wheels whose
 * bottoms sit on local Y 0, glass roof, and a hollow cabin. The driver mesh
 * is the Grab3D modern interior, mirrored so the wheel is on the left.
 * Traffic uses the Grab3D compact car so the street is not one repeated body.
 * Scale 1 keeps the authored metres. Gaps are measured between road positions.
 */
export const CAR_MODEL_NAME = "Grab3D electric car";
export const CAR_LENGTH_METERS = 4.53;
export const CAR_WIDTH_METERS = 1.92;
export const CAR_HEIGHT_METERS = 1.45;
export const CAR_SCALE = 1;
export const TRAFFIC_SCALE = 1;
export const CAR_TILT_DEGREES = 270;
export const CAR_HEADING_OFFSET = 180;

export type VehiclePose = {
  lat: number;
  lng: number;
  headingDegrees: number;
  pitchDegrees?: number;
  rollDegrees?: number;
};

export type RoadVehicle = {
  kind: "model" | "marker";
  update: (pose: VehiclePose) => void;
  setVisible: (visible: boolean) => void;
  remove: () => void;
};

function mountModel(
  parent: { append: (child: HTMLElement) => void },
  Model: new (options?: Model3DOptions) => Model3DView,
  scale = CAR_SCALE,
  src = CAR_MODEL_URL,
): RoadVehicle {
  const model = new Model({
    src,
    scale,
    altitudeMode: VEHICLE_ALTITUDE_MODE,
    position: { lat: 59.3293, lng: 18.0686, altitude: 0 },
    orientation: { heading: 0, tilt: CAR_TILT_DEGREES, roll: 0 },
  });
  parent.append(model);
  const contactAltitude = vehicleAltitudeMeters();
  return {
    kind: "model",
    update(pose) {
      model.position = { lat: pose.lat, lng: pose.lng, altitude: contactAltitude };
      model.orientation = {
        heading: (pose.headingDegrees + CAR_HEADING_OFFSET) % 360,
        tilt: CAR_TILT_DEGREES + (pose.pitchDegrees ?? 0),
        roll: pose.rollDegrees ?? 0,
      };
    },
    setVisible(visible) {
      // Detach the mesh the driver should not see. The hidden flag is left
      // alone: setting it keeps the map from drawing the model at all.
      const size = visible ? scale : 0.00001;
      model.scale = { x: size, y: size, z: size };
      if (visible) {
        if (!model.isConnected) {
          parent.append(model);
        }
      } else if (model.isConnected) {
        model.remove();
      }
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
    position?: { lat: number; lng: number; altitude?: number };
  }) => Marker3DView,
  label = "Bil",
): RoadVehicle {
  const marker = new Marker({
    label,
    altitudeMode: "CLAMP_TO_GROUND",
    extruded: true,
    sizePreserved: true,
    position: { lat: 59.3293, lng: 18.0686, altitude: 0 },
  });
  parent.append(marker);
  return {
    kind: "marker",
    update(pose) {
      marker.position = { lat: pose.lat, lng: pose.lng, altitude: 0 };
    },
    setVisible(visible) {
      marker.hidden = !visible;
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
  src = CAR_MODEL_URL,
): RoadVehicle | null {
  const parts: RoadVehicle[] = [];
  if (typeof library.Model3DElement === "function") {
    try {
      parts.push(mountModel(parent, library.Model3DElement, scale, src));
    } catch {
      // A pin still shows the same road position when the model cannot be constructed.
    }
  }
  // The size-preserved pin stays screen-sized while the car scales with the
  // street, so it reads as a marker floating over the roadway. It is only the
  // fallback when the model itself cannot be mounted.
  if (parts.length === 0 && typeof library.Marker3DElement === "function") {
    try {
      parts.push(mountMarker(parent, library.Marker3DElement, label));
    } catch {
      // Nothing else can show this vehicle.
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
    setVisible(visible) {
      for (const part of parts) {
        part.setVisible(visible);
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
  return mountVehicle(parent, library, TRAFFIC_SCALE, "Trafik", TRAFFIC_MODEL_URL);
}

/** The driver's cabin. Shown only from the seat, on the same road pose as the body. */
export function mountCabin(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
): RoadVehicle | null {
  return mountVehicle(parent, library, CAR_SCALE, "Hytt", CABIN_MODEL_URL);
}

/** A labelled pin for a practice figure. It is not a second car model. */
export function mountPracticeMarker(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
  label: string,
): RoadVehicle | null {
  if (typeof library.Marker3DElement !== "function") {
    return null;
  }
  try {
    return mountMarker(parent, library.Marker3DElement, label);
  } catch {
    return null;
  }
}
