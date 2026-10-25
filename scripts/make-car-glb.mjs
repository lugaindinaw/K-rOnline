import { mkdirSync, writeFileSync } from "node:fs";

function box(min, max) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces = [
    { normal: [0, 0, 1], vertices: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, 0, -1], vertices: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { normal: [1, 0, 0], vertices: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { normal: [-1, 0, 0], vertices: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { normal: [0, 1, 0], vertices: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { normal: [0, -1, 0], vertices: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const face of faces) {
    const start = positions.length / 3;
    for (const vertex of face.vertices) {
      positions.push(...vertex);
      normals.push(...face.normal);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint16Array.from(indices),
  };
}

const parts = [
  { mesh: box([-0.9, 0.32, -2.05], [0.9, 1.12, 1.85]), color: [0.8, 0.2, 0.1, 1] },
  { mesh: box([-0.78, 1.08, -0.45], [0.78, 1.68, 1.05]), color: [0.16, 0.2, 0.24, 1] },
  { mesh: box([-0.62, 0.55, 1.85], [0.62, 0.9, 2.12]), color: [0.96, 0.94, 0.88, 1] },
  { mesh: box([-0.98, 0, 1.05], [-0.72, 0.38, 1.62]), color: [0.12, 0.12, 0.12, 1] },
  { mesh: box([0.72, 0, 1.05], [0.98, 0.38, 1.62]), color: [0.12, 0.12, 0.12, 1] },
  { mesh: box([-0.98, 0, -1.55], [-0.72, 0.38, -0.98]), color: [0.12, 0.12, 0.12, 1] },
  { mesh: box([0.72, 0, -1.55], [0.98, 0.38, -0.98]), color: [0.12, 0.12, 0.12, 1] },
];

const chunks = [];
let byteLength = 0;
function align(length) {
  return (length + 3) & ~3;
}
for (const part of parts) {
  const positionBytes = part.mesh.positions.byteLength;
  const normalBytes = part.mesh.normals.byteLength;
  const indexBytes = part.mesh.indices.byteLength;
  const positionOffset = byteLength;
  byteLength = align(byteLength + positionBytes);
  const normalOffset = byteLength;
  byteLength = align(byteLength + normalBytes);
  const indexOffset = byteLength;
  byteLength = align(byteLength + indexBytes);
  chunks.push({ part, positionBytes, normalBytes, indexBytes, positionOffset, normalOffset, indexOffset });
}

const bin = Buffer.alloc(byteLength);
const accessors = [];
const bufferViews = [];
const primitives = [];
for (const chunk of chunks) {
  const { part } = chunk;
  Buffer.from(part.mesh.positions.buffer).copy(bin, chunk.positionOffset);
  Buffer.from(part.mesh.normals.buffer).copy(bin, chunk.normalOffset);
  Buffer.from(part.mesh.indices.buffer).copy(bin, chunk.indexOffset);
  const positionView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: chunk.positionOffset, byteLength: chunk.positionBytes, target: 34962 });
  const normalView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: chunk.normalOffset, byteLength: chunk.normalBytes, target: 34962 });
  const indexView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: chunk.indexOffset, byteLength: chunk.indexBytes, target: 34963 });
  const positionAccessor = accessors.length;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < part.mesh.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = part.mesh.positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  accessors.push({
    bufferView: positionView,
    componentType: 5126,
    count: part.mesh.positions.length / 3,
    type: "VEC3",
    min,
    max,
  });
  const normalAccessor = accessors.length;
  accessors.push({
    bufferView: normalView,
    componentType: 5126,
    count: part.mesh.normals.length / 3,
    type: "VEC3",
  });
  const indexAccessor = accessors.length;
  accessors.push({
    bufferView: indexView,
    componentType: 5123,
    count: part.mesh.indices.length,
    type: "SCALAR",
  });
  primitives.push({
    attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
    indices: indexAccessor,
    material: primitives.length,
  });
}

const gltf = {
  asset: { version: "2.0", generator: "koronline-car" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives }],
  materials: parts.map((part) => ({
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: part.color,
      metallicFactor: 0.05,
      roughnessFactor: 0.6,
    },
  })),
  accessors,
  bufferViews,
  buffers: [{ byteLength }],
};

let json = JSON.stringify(gltf);
while (json.length % 4 !== 0) {
  json += " ";
}
const jsonChunk = Buffer.from(json);
const header = Buffer.alloc(12);
header.write("glTF", 0);
header.writeUInt32LE(2, 4);
const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
header.writeUInt32LE(total, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.write("JSON", 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length, 0);
binHeader.write("BIN\0", 4);
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/car.glb", import.meta.url), Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]));
