import type { Model3DView, Marker3DView, Maps3dLibrary } from "./maps3dTypes";
import type { SignalHead } from "./signalPosts";
import type { RoadSign } from "../roads/roadSigns";

export type LampColor = "red" | "yellow" | "green";

type Parent = { append: (child: HTMLElement) => void };

export type SignalLamp = {
  id: string;
  facingDegrees: number;
  kind: SignalHead["kind"];
  setColor: (color: LampColor) => void;
  remove: () => void;
};

export type SignBoard = {
  id: string;
  remove: () => void;
};

const LAMP_COLORS: Record<LampColor, [number, number, number]> = {
  red: [0.95, 0.08, 0.05],
  yellow: [0.98, 0.75, 0.08],
  green: [0.12, 0.82, 0.25],
};

const modelUrls = new Map<LampColor, string>();

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

function lightModelUrl(color: LampColor): string {
  const cached = modelUrls.get(color);
  if (cached) {
    return cached;
  }
  const buffer = cubeBuffer();
  const lit = LAMP_COLORS[color];
  const dark: [number, number, number] = [0.1, 0.1, 0.1];
  const lamps: Array<[number, number, number]> = [
    color === "green" ? lit : dark,
    color === "yellow" ? lit : dark,
    color === "red" ? lit : dark,
  ];
  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2, 3, 4] }],
    nodes: [
      { mesh: 0, translation: [0, 1.55, 0], scale: [0.12, 3.1, 0.12] },
      { mesh: 1, translation: [0.16, 3.38, 0], scale: [0.28, 0.86, 0.22] },
      ...lamps.map((_, index) => ({
        mesh: 2 + index,
        translation: [0.22, 3.12 + index * 0.26, 0],
        scale: [0.1, 0.16, 0.1],
      })),
    ],
    meshes: [0, 1, 2, 3, 4].map((material) => ({
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material, mode: 4 }],
    })),
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.22, 1], metallicFactor: 0.05, roughnessFactor: 0.7 },
      },
      {
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.06, 0.06, 0.07, 1], metallicFactor: 0, roughnessFactor: 0.8 },
      },
      ...lamps.map((lamp) => ({
        doubleSided: true,
        emissiveFactor: lamp,
        pbrMetallicRoughness: { baseColorFactor: [...lamp, 1], metallicFactor: 0, roughnessFactor: 0.35 },
      })),
    ],
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
  const url = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: "model/gltf+json" }));
  modelUrls.set(color, url);
  return url;
}

function mountLampModel(
  parent: Parent,
  Model: new (options?: { src?: string; scale?: number; altitudeMode?: "CLAMP_TO_GROUND" }) => Model3DView,
  head: SignalHead,
  color: LampColor,
): Model3DView | null {
  try {
    const model = new Model({ src: lightModelUrl(color), scale: 1, altitudeMode: "CLAMP_TO_GROUND" });
    model.position = { lat: head.position.lat, lng: head.position.lng, altitude: 0 };
    model.orientation = { heading: (head.facingDegrees + 180) % 360, tilt: 270, roll: 0 };
    model.hidden = true;
    parent.append(model);
    return model;
  } catch {
    return null;
  }
}

export function mountSignalLamp(parent: Parent, library: Maps3dLibrary, head: SignalHead): SignalLamp | null {
  const models = new Map<LampColor, Model3DView>();
  if (typeof library.Model3DElement === "function") {
    for (const color of ["red", "yellow", "green"] as const) {
      const model = mountLampModel(parent, library.Model3DElement, head, color);
      if (model) {
        models.set(color, model);
      }
    }
  }
  let marker: Marker3DView | null = null;
  if (models.size === 0 && typeof library.Marker3DElement === "function") {
    try {
      marker = new library.Marker3DElement({
        label: "SIGNAL",
      altitudeMode: "RELATIVE_TO_GROUND",
      extruded: false,
      sizePreserved: false,
    });
    marker.position = { lat: head.position.lat, lng: head.position.lng, altitude: 4.2 };
      parent.append(marker);
    } catch {
      marker = null;
    }
  }
  if (models.size === 0 && !marker) {
    return null;
  }
  return {
    id: head.id,
    facingDegrees: head.facingDegrees,
    kind: head.kind,
    setColor(color) {
      for (const [name, model] of models) {
        model.hidden = name !== color;
      }
      if (marker) {
        marker.label = color === "red" ? "RÖD" : color === "yellow" ? "GUL" : "GRÖN";
      }
    },
    remove() {
      for (const model of models.values()) {
        model.remove();
      }
      marker?.remove();
    },
  };
}

export function mountSignBoard(parent: Parent, library: Maps3dLibrary, sign: RoadSign): SignBoard | null {
  if (typeof library.Marker3DElement !== "function") {
    return null;
  }
  try {
    const marker = new library.Marker3DElement({
      label: sign.label,
      altitudeMode: "RELATIVE_TO_GROUND",
      extruded: false,
      sizePreserved: false,
    });
    marker.position = { lat: sign.position.lat, lng: sign.position.lng, altitude: 2.4 };
    parent.append(marker);
    return {
      id: sign.id,
      remove() {
        marker.remove();
      },
    };
  } catch {
    return null;
  }
}

/** Keep an existing post where it was first drawn. New ids appear, missing ids leave. */
export function syncById<T extends { id: string }>(
  current: Map<string, { remove: () => void }>,
  next: readonly T[],
  create: (item: T) => { remove: () => void } | null,
): void {
  const ids = new Set(next.map((item) => item.id));
  for (const [id, view] of current) {
    if (!ids.has(id)) {
      view.remove();
      current.delete(id);
    }
  }
  for (const item of next) {
    if (current.has(item.id)) {
      continue;
    }
    const view = create(item);
    if (view) {
      current.set(item.id, view);
    }
  }
}
