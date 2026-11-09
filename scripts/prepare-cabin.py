"""Mirror the Grab3D interior for a Swedish left-hand-drive seat and drop the windshield.

Maps draws the street through the cabin opening. The authored glass is a blend
material that can become a solid wall, so the windshield mesh is left out of
the scene. KHR_materials_emissive_strength is removed because Model3DElement
rejects that extension and then draws nothing.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "third_party" / "grab3d" / "modern-car-interior.glb"
TARGET = ROOT / "public" / "cabin.glb"


def load(path: Path) -> tuple[dict, bytearray]:
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    binary_length = struct.unpack_from("<I", data, 20 + json_length)[0]
    binary_start = 20 + json_length + 8
    return document, bytearray(data[binary_start : binary_start + binary_length])


def save(path: Path, document: dict, binary: bytes) -> None:
    raw = json.dumps(document, separators=(",", ":")).encode()
    raw += b" " * ((4 - len(raw) % 4) % 4)
    out = bytearray(b"glTF")
    out += struct.pack("<II", 2, 12 + 8 + len(raw) + 8 + len(binary))
    out += struct.pack("<I", len(raw))
    out += b"JSON"
    out += raw
    out += struct.pack("<I", len(binary))
    out += b"BIN\x00"
    out += binary
    path.write_bytes(out)


def component_size(component_type: int) -> int:
    return {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[component_type]


def negate_x(document: dict, binary: bytearray, accessor_index: int) -> None:
    accessor = document["accessors"][accessor_index]
    if accessor.get("type") != "VEC3":
        return
    view = document["bufferViews"][accessor["bufferView"]]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    count = accessor["count"]
    stride = view.get("byteStride", component_size(accessor["componentType"]) * 3)
    for index in range(count):
        offset = start + index * stride
        value = struct.unpack_from("<f", binary, offset)[0]
        struct.pack_into("<f", binary, offset, -value)
    if "min" in accessor and "max" in accessor:
        accessor["min"][0], accessor["max"][0] = -accessor["max"][0], -accessor["min"][0]


def flip_winding(document: dict, binary: bytearray, accessor_index: int, flipped: set[int]) -> None:
    accessor = document["accessors"][accessor_index]
    view_index = accessor["bufferView"]
    if view_index in flipped:
        return
    flipped.add(view_index)
    view = document["bufferViews"][view_index]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    size = component_size(accessor["componentType"])
    count = accessor["count"] - accessor["count"] % 3
    for index in range(0, count, 3):
        left = start + index * size
        right = start + (index + 2) * size
        binary[left : left + size], binary[right : right + size] = (
            binary[right : right + size],
            binary[left : left + size],
        )


def main() -> None:
    document, binary = load(SOURCE)
    document.pop("extensionsUsed", None)
    document.pop("extensionsRequired", None)
    for material in document.get("materials", []):
        material.pop("extensions", None)
    flipped: set[int] = set()
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if "POSITION" in attributes:
                negate_x(document, binary, attributes["POSITION"])
            if "NORMAL" in attributes:
                negate_x(document, binary, attributes["NORMAL"])
            if "indices" in primitive:
                flip_winding(document, binary, primitive["indices"], flipped)
    windshields = {
        index
        for index, node in enumerate(document.get("nodes", []))
        if "windshield" in (node.get("name") or "")
    }
    for node in document.get("nodes", []):
        translation = node.get("translation")
        if translation:
            translation[0] = -translation[0]
        if node.get("children"):
            node["children"] = [child for child in node["children"] if child not in windshields]
    document["asset"]["copyright"] = (
        "Grab3D modern-car-interior, CC0 1.0. Mirrored so the wheel sits on the left. Windshield mesh omitted."
    )
    save(TARGET, document, binary)
    wheel = next(node for node in document["nodes"] if "steering_wheel" in (node.get("name") or ""))
    print(TARGET, "wheel", [round(value, 3) for value in wheel["translation"]])


if __name__ == "__main__":
    main()
