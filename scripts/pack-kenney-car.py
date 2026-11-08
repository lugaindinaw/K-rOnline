"""Bake Kenney's CC0 sedan-sports into one self-contained car.glb.

The source GLB points at Textures/colormap.png and keeps each wheel in its
own node. This writes public/car.glb with the texture embedded, node
translations baked into the vertices, and a uniform scale so the car is a
real passenger-car length. Tire bottoms stay at local Y = 0.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "third_party" / "kenney-car-kit" / "sedan-sports.glb"
TEXTURE = ROOT / "third_party" / "kenney-car-kit" / "colormap.png"
OUTPUT = ROOT / "public" / "car.glb"
# Source length is 2.55 m. 1.65 makes it about 4.2 m, a compact sports sedan.
SCALE = 1.65


def read_glb(path: Path) -> tuple[dict, bytes]:
    blob = path.read_bytes()
    if blob[:4] != b"glTF":
        raise SystemExit(f"{path} is not a glB")
    json_length = struct.unpack_from("<I", blob, 12)[0]
    document = json.loads(blob[20 : 20 + json_length])
    bin_header = 20 + json_length
    bin_length, _chunk_type = struct.unpack_from("<II", blob, bin_header)
    binary = blob[bin_header + 8 : bin_header + 8 + bin_length]
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    document["buffers"] = [{"byteLength": len(binary)}]
    json_bytes = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_bytes) + 8 + len(binary))
    path.write_bytes(
        header
        + struct.pack("<I4s", len(json_bytes), b"JSON")
        + json_bytes
        + struct.pack("<I4s", len(binary), b"BIN\x00")
        + binary
    )


def main() -> None:
    document, binary = read_glb(SOURCE)
    data = bytearray(binary)

    def read_vec3(accessor_index: int) -> tuple[list[tuple[float, float, float]], int, int]:
        accessor = document["accessors"][accessor_index]
        view = document["bufferViews"][accessor["bufferView"]]
        start = (view.get("byteOffset") or 0) + (accessor.get("byteOffset") or 0)
        stride = view.get("byteStride") or 12
        count = accessor["count"]
        values = []
        for index in range(count):
            offset = start + index * stride
            values.append(struct.unpack_from("<fff", data, offset))
        return values, start, stride

    def write_vec3(values: list[tuple[float, float, float]], start: int, stride: int) -> tuple[list[float], list[float]]:
        minimum = [float("inf")] * 3
        maximum = [float("-inf")] * 3
        for index, vertex in enumerate(values):
            struct.pack_into("<fff", data, start + index * stride, *vertex)
            for axis, value in enumerate(vertex):
                minimum[axis] = min(minimum[axis], value)
                maximum[axis] = max(maximum[axis], value)
        return minimum, maximum

    for node in document["nodes"]:
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        translation = node.get("translation") or [0, 0, 0]
        for primitive in document["meshes"][mesh_index]["primitives"]:
            values, start, stride = read_vec3(primitive["attributes"]["POSITION"])
            scaled = [
                (
                    (x + translation[0]) * SCALE,
                    (y + translation[1]) * SCALE,
                    (z + translation[2]) * SCALE,
                )
                for x, y, z in values
            ]
            minimum, maximum = write_vec3(scaled, start, stride)
            accessor = document["accessors"][primitive["attributes"]["POSITION"]]
            accessor["min"] = minimum
            accessor["max"] = maximum
        node["translation"] = [0, 0, 0]

    png = TEXTURE.read_bytes()
    view_index = len(document["bufferViews"])
    document["bufferViews"].append(
        {"buffer": 0, "byteOffset": len(data), "byteLength": len(png)}
    )
    data.extend(png)
    document["images"] = [{"bufferView": view_index, "mimeType": "image/png", "name": "colormap"}]
    material = document["materials"][0]
    pbr = material.setdefault("pbrMetallicRoughness", {})
    pbr["metallicFactor"] = 0.22
    pbr["roughnessFactor"] = 0.38
    document["asset"]["copyright"] = "Kenney Car Kit, sedan-sports, CC0 1.0"
    document["asset"]["generator"] = "KorOnline pack-kenney-car.py"
    write_glb(OUTPUT, document, bytes(data))
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
