import { CABIN_EYE_LOCAL } from "./cabinMesh";
import { DRIVER_VERTICAL_FOV_DEGREES } from "./followCamera";

export type CabinLean = {
  pitchDegrees?: number;
  rollDegrees?: number;
};

export type CabinProjection = {
  /** 0 is the left edge, 1 is the right edge. */
  x: number;
  /** 0 is the top edge, 1 is the bottom edge. */
  y: number;
  /** Meters in front of the eye along the view axis. */
  depth: number;
};

/**
 * Project a cabin-space point with the same vertical field of view as the driver map.
 * `tiltDegrees` uses the map convention: 90 looks at the horizon, 0 looks straight down.
 */
export function projectCabinPoint(
  local: readonly [number, number, number],
  tiltDegrees: number,
  aspect: number,
  lean: CabinLean = {},
  fovDegrees = DRIVER_VERTICAL_FOV_DEGREES,
): CabinProjection | null {
  const eye = CABIN_EYE_LOCAL;
  let x = local[0] - eye[0];
  let y = local[1] - eye[1];
  let z = local[2] - eye[2];
  const roll = ((lean.rollDegrees ?? 0) * Math.PI) / 180;
  if (roll !== 0) {
    const cosine = Math.cos(roll);
    const sine = Math.sin(roll);
    const nextX = x * cosine - y * sine;
    const nextY = x * sine + y * cosine;
    x = nextX;
    y = nextY;
  }
  const bodyPitch = ((lean.pitchDegrees ?? 0) * Math.PI) / 180;
  if (bodyPitch !== 0) {
    const cosine = Math.cos(bodyPitch);
    const sine = Math.sin(bodyPitch);
    const nextY = y * cosine + z * sine;
    const nextZ = -y * sine + z * cosine;
    y = nextY;
    z = nextZ;
  }
  const lookDown = ((90 - tiltDegrees) * Math.PI) / 180;
  const cosine = Math.cos(lookDown);
  const sine = Math.sin(lookDown);
  const yCamera = y * cosine + z * sine;
  const zCamera = -y * sine + z * cosine;
  if (!(zCamera > 0.05)) {
    return null;
  }
  const safeAspect = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  const fov = ((Number.isFinite(fovDegrees) ? fovDegrees : DRIVER_VERTICAL_FOV_DEGREES) * Math.PI) / 180;
  const focal = 1 / Math.tan(fov / 2);
  const ndcX = (x / zCamera) * (focal / safeAspect);
  const ndcY = (yCamera / zCamera) * focal;
  return {
    x: (ndcX + 1) / 2,
    y: (1 - ndcY) / 2,
    depth: zCamera,
  };
}

/** Pixel size of a cabin-space length that faces the camera. */
export function projectCabinSize(
  meters: number,
  depth: number,
  viewport: number,
  axis: "x" | "y",
  aspect: number,
  fovDegrees = DRIVER_VERTICAL_FOV_DEGREES,
): number {
  if (!(depth > 0.05) || !(viewport > 0) || !(meters > 0)) {
    return 0;
  }
  const safeAspect = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  const fov = ((fovDegrees * Math.PI) / 180);
  const focal = 1 / Math.tan(fov / 2);
  const ndc = (meters / depth) * (axis === "x" ? focal / safeAspect : focal);
  return (ndc / 2) * viewport;
}
