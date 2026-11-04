/**
 * One passenger-car cabin in meters, sharing the car model's axes:
 * +Y up, +Z forward, +X to the right. The driver sits on the left.
 * The windshield is the empty space in front of the eyes, not a texture.
 */

export const CABIN_EYE_LOCAL: [number, number, number] = [-0.38, 1.25, 0.2];
export const WHEEL_CENTER_LOCAL: [number, number, number] = [-0.38, 0.98, 0.62];
export const GAUGE_CENTER_LOCAL: [number, number, number] = [-0.38, 1.02, 0.86];
export const WHEEL_DIAMETER_METERS = 0.37;

const BODY: [number, number, number] = [0.62, 0.16, 0.08];
const INTERIOR: [number, number, number] = [0.14, 0.12, 0.1];
const DASH: [number, number, number] = [0.24, 0.2, 0.16];
const TRIM: [number, number, number] = [0.08, 0.08, 0.09];
const GLASS: [number, number, number] = [0.16, 0.24, 0.3];
const METAL: [number, number, number] = [0.55, 0.56, 0.58];

export type CabinBox = {
  name: string;
  center: [number, number, number];
  size: [number, number, number];
  color: [number, number, number];
  rotation?: [number, number, number, number];
};

function box(
  name: string,
  center: [number, number, number],
  size: [number, number, number],
  color: [number, number, number],
  rotation?: [number, number, number, number],
): CabinBox {
  return { name, center, size, color, rotation };
}

function quatZ(degrees: number): [number, number, number, number] {
  const half = (degrees * Math.PI) / 360;
  return [0, 0, Math.sin(half), Math.cos(half)];
}

function wheelRim(): CabinBox[] {
  const [cx, cy, cz] = WHEEL_CENTER_LOCAL;
  const radius = WHEEL_DIAMETER_METERS / 2 - 0.012;
  const count = 24;
  const parts: CabinBox[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    parts.push(
      box(
        "wheel-rim",
        [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, cz],
        [0.02, 0.05, 0.028],
        TRIM,
        quatZ((angle * 180) / Math.PI),
      ),
    );
  }
  for (const spoke of [90, 210, 330]) {
    const angle = (spoke * Math.PI) / 180;
    parts.push(
      box(
        "wheel-spoke",
        [cx + Math.cos(angle) * 0.08, cy + Math.sin(angle) * 0.08, cz],
        [0.022, 0.14, 0.028],
        TRIM,
        quatZ(spoke),
      ),
    );
  }
  parts.push(box("wheel-hub", [cx, cy, cz + 0.01], [0.07, 0.07, 0.04], [0.2, 0.18, 0.14]));
  return parts;
}

export function shellBoxes(): CabinBox[] {
  return cabinBoxes().filter((part) => part.name !== "needle" && !part.name.startsWith("wheel"));
}

/** Wheel geometry with its origin at the steering-wheel center, so a roll spins it in place. */
export function wheelBoxesLocal(): CabinBox[] {
  const [cx, cy, cz] = WHEEL_CENTER_LOCAL;
  return wheelRim().map((part) => ({
    ...part,
    center: [part.center[0] - cx, part.center[1] - cy, part.center[2] - cz] as [number, number, number],
  }));
}

/** Needle with its origin at the gauge center. Roll turns it across the dial. */
export function needleBoxLocal(): CabinBox {
  return box("needle", [0, 0.028, 0.02], [0.008, 0.055, 0.008], [0.9, 0.22, 0.16]);
}

function translateBox(part: CabinBox, shift: [number, number, number]): CabinBox {
  return {
    ...part,
    center: [part.center[0] + shift[0], part.center[1] + shift[1], part.center[2] + shift[2]],
  };
}

/** Shell, a steered wheel and a speed needle, in one cabin-space list. */
export function visibleCabinParts(wheelDegrees: number, needleDegreesValue: number): CabinBox[] {
  const wheel = wheelBoxesLocal().map((part) =>
    translateBox(
      wheelDegrees === 0 ? part : rotateAround(part, [0, 0, 0], quatZ(wheelDegrees)),
      WHEEL_CENTER_LOCAL,
    ),
  );
  const needle = translateBox(
    needleDegreesValue === 0 ? needleBoxLocal() : rotateAround(needleBoxLocal(), [0, 0, 0], quatZ(needleDegreesValue)),
    GAUGE_CENTER_LOCAL,
  );
  return [...shellBoxes(), ...wheel, needle];
}

/** Shell, controls and a neutral wheel. The wheel spins by rebuilding this pose. */
export function cabinBoxes(wheelDegrees = 0): CabinBox[] {
  const wheel = wheelRim().map((part) =>
    wheelDegrees === 0 ? part : rotateAround(part, WHEEL_CENTER_LOCAL, quatZ(wheelDegrees)),
  );
  return [
    box("roof", [0, 1.46, -0.45], [1.62, 0.06, 0.9], INTERIOR),
    box("header", [0, 1.48, 0.95], [1.5, 0.028, 0.04], INTERIOR),
    box("pillar-left", [-0.78, 1.22, 0.95], [0.055, 0.5, 0.06], INTERIOR),
    box("pillar-right", [0.78, 1.22, 0.95], [0.055, 0.5, 0.06], INTERIOR),
    box("door-left", [-0.9, 0.78, 0.65], [0.08, 0.72, 0.8], BODY),
    box("door-right", [0.9, 0.78, 0.65], [0.08, 0.72, 0.8], BODY),
    box("sill-left", [-0.86, 1.02, 0.7], [0.06, 0.05, 0.6], DASH),
    box("sill-right", [0.86, 1.02, 0.7], [0.06, 0.05, 0.6], DASH),
    box("dash", [0, 0.92, 0.82], [1.5, 0.28, 0.28], DASH),
    box("binnacle", [-0.38, 1.0, 0.84], [0.36, 0.1, 0.12], INTERIOR),
    box("gauge", GAUGE_CENTER_LOCAL, [0.16, 0.16, 0.02], [0.05, 0.12, 0.09]),
    box("console", [0.06, 0.52, 0.42], [0.22, 0.28, 0.55], INTERIOR),
    box("shifter", [0.06, 0.74, 0.38], [0.04, 0.16, 0.04], TRIM),
    box("shifter-knob", [0.06, 0.84, 0.38], [0.06, 0.05, 0.07], [0.2, 0.14, 0.1]),
    box("hood", [0, 1.02, 1.45], [1.42, 0.07, 1.05], BODY),
    box("cowl", [0, 1.06, 0.98], [1.46, 0.04, 0.16], BODY),
    box("mirror-rear", [-0.38, 1.4, 0.78], [0.22, 0.07, 0.04], TRIM),
    box("mirror-glass-rear", [-0.38, 1.39, 0.8], [0.16, 0.045, 0.01], GLASS),
    box("mirror-left", [-0.98, 1.0, 0.42], [0.12, 0.08, 0.18], BODY),
    box("mirror-right", [0.98, 1.0, 0.42], [0.12, 0.08, 0.18], BODY),
    box("wiper-left", [-0.28, 0.94, 1.0], [0.4, 0.02, 0.025], TRIM, quatZ(18)),
    box("wiper-right", [0.22, 0.94, 1.02], [0.38, 0.02, 0.025], TRIM, quatZ(-14)),
    box("pedal-clutch", [-0.52, 0.22, 0.72], [0.07, 0.14, 0.12], TRIM),
    box("pedal-brake", [-0.4, 0.22, 0.74], [0.07, 0.14, 0.12], TRIM),
    box("pedal-gas", [-0.28, 0.2, 0.7], [0.06, 0.1, 0.16], METAL),
    box("seat", [-0.38, 0.48, -0.35], [0.48, 0.28, 0.48], [0.18, 0.16, 0.14]),
    box("seat-back", [-0.38, 0.86, -0.62], [0.48, 0.55, 0.1], [0.18, 0.16, 0.14]),
    ...wheel,
    needleBox(0),
  ];
}

function needleBox(degrees: number): CabinBox {
  const [cx, cy, cz] = GAUGE_CENTER_LOCAL;
  const length = 0.055;
  const angle = (degrees * Math.PI) / 180;
  return box(
    "needle",
    [cx + Math.sin(angle) * length * 0.5, cy + Math.cos(angle) * length * 0.5, cz + 0.02],
    [0.008, length, 0.008],
    [0.9, 0.22, 0.16],
    quatZ(-degrees),
  );
}

/** Neutral needle points up the gauge. `degrees` follows the speedometer sweep. */
export function cabinBoxesForPose(wheelDegrees: number, needleDegrees: number): CabinBox[] {
  return cabinBoxes(wheelDegrees).map((part) => (part.name === "needle" ? needleBox(needleDegrees) : part));
}

function rotateAround(part: CabinBox, pivot: [number, number, number], rotation: [number, number, number, number]): CabinBox {
  const shifted: [number, number, number] = [
    part.center[0] - pivot[0],
    part.center[1] - pivot[1],
    part.center[2] - pivot[2],
  ];
  const turned = rotateVector(shifted, rotation);
  const combined = multiplyQuat(rotation, part.rotation ?? [0, 0, 0, 1]);
  return {
    ...part,
    center: [turned[0] + pivot[0], turned[1] + pivot[1], turned[2] + pivot[2]],
    rotation: combined,
  };
}

function rotateVector(vector: [number, number, number], quat: [number, number, number, number]): [number, number, number] {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quat;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function multiplyQuat(
  left: [number, number, number, number],
  right: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function pointInsideBox(point: [number, number, number], part: CabinBox): boolean {
  const [x, y, z] = point;
  const [cx, cy, cz] = part.center;
  const [sx, sy, sz] = part.size;
  return Math.abs(x - cx) <= sx / 2 && Math.abs(y - cy) <= sy / 2 && Math.abs(z - cz) <= sz / 2;
}

/** True when a point in the upper windshield is not inside an axis-aligned cabin part. */
export function windshieldOpen(point: [number, number, number], parts = cabinBoxes()): boolean {
  return parts.every((part) => part.rotation != null || !pointInsideBox(point, part));
}

type GltfMaterial = {
  doubleSided: true;
  pbrMetallicRoughness: {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
  };
};

export function cabinGlbDocument(parts: CabinBox[]): {
  json: string;
  boxCount: number;
} {
  const buffer = cubeBuffer();
  const materials: GltfMaterial[] = [];
  const indexByColor = new Map<string, number>();
  const nodes = parts.map((part) => {
    const key = part.color.join(",");
    let material = indexByColor.get(key);
    if (material == null) {
      material = materials.length;
      indexByColor.set(key, material);
      materials.push({
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [...part.color, 1],
          metallicFactor: 0.04,
          roughnessFactor: 0.72,
        },
      });
    }
    return {
      mesh: material,
      translation: part.center,
      scale: part.size,
      ...(part.rotation ? { rotation: part.rotation } : {}),
    };
  });
  const document = {
    asset: { version: "2.0", generator: "koronline-cabin" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes: materials.map((_, material) => ({
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material, mode: 4 }],
    })),
    materials,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: 96, byteLength: 72, target: 34963 },
    ],
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.base64}`, byteLength: buffer.byteLength }],
  };
  return { json: JSON.stringify(document), boxCount: parts.length };
}

function cubeBuffer(): { base64: string; byteLength: number } {
  const positions = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
    0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]);
  const indices = new Uint16Array([
    4, 5, 6, 4, 6, 7, 0, 3, 2, 0, 2, 1, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3, 7, 6, 3, 6, 2, 0, 1, 5, 0,
    5, 4,
  ]);
  const bytes = new Uint8Array(positions.byteLength + indices.byteLength);
  bytes.set(new Uint8Array(positions.buffer), 0);
  bytes.set(new Uint8Array(indices.buffer), positions.byteLength);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return { base64: btoa(binary), byteLength: bytes.byteLength };
}
