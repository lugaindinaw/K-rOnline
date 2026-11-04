import { CAR_HEADING_OFFSET, CAR_TILT_DEGREES } from "./roadVehicle";
import type { Maps3dLibrary, Model3DView } from "./maps3dTypes";
import {
  CABIN_EYE_LOCAL,
  GAUGE_CENTER_LOCAL,
  WHEEL_CENTER_LOCAL,
  cabinGlbDocument,
  needleBoxLocal,
  shellBoxes,
  wheelBoxesLocal,
} from "./cabinMesh";

const METERS_PER_DEGREE = 111320;

export type CabinPose = {
  lat: number;
  lng: number;
  altitude: number;
  /** Geographic heading the nose points along. 0 is north. */
  headingDegrees: number;
};

export type LookCamera = {
  lat: number;
  lng: number;
  altitude: number;
  headingDegrees: number;
  rangeMeters: number;
  tiltDegrees: number;
};

function offset(point: { lat: number; lng: number }, headingDegrees: number, meters: number): { lat: number; lng: number } {
  if (!Number.isFinite(meters) || meters === 0) {
    return { lat: point.lat, lng: point.lng };
  }
  const heading = (headingDegrees * Math.PI) / 180;
  const cosine = Math.cos((point.lat * Math.PI) / 180);
  return {
    lat: point.lat + (meters * Math.cos(heading)) / METERS_PER_DEGREE,
    lng: point.lng + (meters * Math.sin(heading)) / (METERS_PER_DEGREE * Math.max(0.2, cosine)),
  };
}

/**
 * The map camera looks at `camera` from `range` at `tilt` (0 is straight down).
 * The cabin origin sits on the ground so the driver's eye lands on that camera.
 */
export function cabinPoseFromCamera(camera: LookCamera): CabinPose {
  const tilt = (camera.tiltDegrees * Math.PI) / 180;
  const back = camera.rangeMeters * Math.sin(tilt);
  const eyeAltitude = camera.altitude + camera.rangeMeters * Math.cos(tilt);
  const eye = offset(camera, camera.headingDegrees + 180, back);
  const [eyeX, eyeY, eyeZ] = CABIN_EYE_LOCAL;
  const behindEye = offset(eye, camera.headingDegrees + 180, eyeZ);
  const origin = offset(behindEye, camera.headingDegrees + 90, -eyeX);
  return {
    lat: origin.lat,
    lng: origin.lng,
    altitude: eyeAltitude - eyeY,
    headingDegrees: camera.headingDegrees,
  };
}

export function localOnCabin(
  pose: CabinPose,
  local: [number, number, number],
): { lat: number; lng: number; altitude: number } {
  const [x, y, z] = local;
  const forward = offset(pose, pose.headingDegrees, z);
  const shifted = offset(forward, pose.headingDegrees + 90, x);
  return { lat: shifted.lat, lng: shifted.lng, altitude: pose.altitude + y };
}

export type CabinView = {
  update: (pose: CabinPose, wheelDegrees: number, needleDegreesValue: number) => void;
  setVisible: (visible: boolean) => void;
  remove: () => void;
};

type ModelCtor = new (options?: {
  src?: string;
  scale?: number;
  altitudeMode?: "ABSOLUTE";
}) => Model3DView;

let shellUrl: string | null = null;
let wheelUrl: string | null = null;
let needleUrl: string | null = null;

function modelUrl(parts: Parameters<typeof cabinGlbDocument>[0], cache: string | null): string {
  if (cache) {
    return cache;
  }
  const { json } = cabinGlbDocument(parts);
  return URL.createObjectURL(new Blob([json], { type: "model/gltf+json" }));
}

function orient(model: Model3DView, pose: CabinPose, roll: number, local: [number, number, number]): void {
  const position = localOnCabin(pose, local);
  model.position = position;
  model.orientation = {
    heading: (pose.headingDegrees + CAR_HEADING_OFFSET) % 360,
    tilt: CAR_TILT_DEGREES,
    roll,
  };
}

/**
 * Places the cabin as a map model. The driver view does not use this:
 * geometry at cabin scale is hidden by the photogrammetry, so the visible
 * cabin is the overlay in `cabinOverlay.ts`, drawn with the map field of view.
 */
export function mountCabin(
  parent: { append: (child: HTMLElement) => void },
  library: Maps3dLibrary,
): CabinView | null {
  if (typeof library.Model3DElement !== "function") {
    return null;
  }
  const Model = library.Model3DElement as ModelCtor;
  shellUrl = modelUrl(shellBoxes(), shellUrl);
  wheelUrl = modelUrl(wheelBoxesLocal(), wheelUrl);
  needleUrl = modelUrl([needleBoxLocal()], needleUrl);
  let shell: Model3DView;
  let wheel: Model3DView;
  let needle: Model3DView;
  try {
    shell = new Model({ src: shellUrl, scale: 1, altitudeMode: "ABSOLUTE" });
    wheel = new Model({ src: wheelUrl, scale: 1, altitudeMode: "ABSOLUTE" });
    needle = new Model({ src: needleUrl, scale: 1, altitudeMode: "ABSOLUTE" });
  } catch {
    return null;
  }
  shell.hidden = true;
  wheel.hidden = true;
  needle.hidden = true;
  parent.append(shell);
  parent.append(wheel);
  parent.append(needle);
  const models = [shell, wheel, needle];
  return {
    update(pose, wheelDegrees, needleDegreesValue) {
      orient(shell, pose, 0, [0, 0, 0]);
      orient(wheel, pose, wheelDegrees, WHEEL_CENTER_LOCAL);
      orient(needle, pose, needleDegreesValue, GAUGE_CENTER_LOCAL);
    },
    setVisible(visible) {
      for (const model of models) {
        model.hidden = !visible;
      }
    },
    remove() {
      for (const model of models) {
        model.remove();
      }
    },
  };
}
