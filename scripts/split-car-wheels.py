"""Split the painted Grab3D car into a body and one hub-centered wheel.

The map can only orient a whole glTF, and a scene node that is still a child
of another node is rejected. These files keep one root each, so the front
axle can steer and all four tires can roll. Geometry and textures stay CC0.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "car.glb"
BODY = ROOT / "public" / "car-body.glb"
WHEEL = ROOT / "public" / "wheel.glb"
WHEEL_NODE = 3
BODY_CHILDREN = [0, 1, 2, 7]


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    binary_start = 20 + json_length
    binary_length = struct.unpack_from("<I", data, binary_start)[0]
    return document, data[binary_start + 8 : binary_start + 8 + binary_length]


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    blob = binary + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(payload) + 8 + len(blob)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(payload), 0x4E4F534A) + payload
    out += struct.pack("<II", len(blob), 0x004E4942) + blob
    path.write_bytes(out)


def collect_accessors(document: dict, mesh_ids: set[int]) -> set[int]:
    accessors: set[int] = set()
    for mesh_id in mesh_ids:
        for primitive in document["meshes"][mesh_id]["primitives"]:
            accessors.update(primitive.get("attributes", {}).values())
            if "indices" in primitive:
                accessors.add(primitive["indices"])
    return accessors


def collect_materials(document: dict, mesh_ids: set[int]) -> set[int]:
    materials: set[int] = set()
    for mesh_id in mesh_ids:
        for primitive in document["meshes"][mesh_id]["primitives"]:
            if "material" in primitive:
                materials.add(primitive["material"])
    return materials


def collect_textures(document: dict, material_ids: set[int]) -> set[int]:
    textures: set[int] = set()
    for material_id in material_ids:
        material = document["materials"][material_id]
        for key in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            if key in material:
                textures.add(material[key]["index"])
        pbr = material.get("pbrMetallicRoughness", {})
        for key in ("baseColorTexture", "metallicRoughnessTexture"):
            if key in pbr:
                textures.add(pbr[key]["index"])
    return textures


def pack(document: dict, binary: bytes, nodes: list[dict], mesh_ids: list[int]) -> tuple[dict, bytes]:
    materials = sorted(collect_materials(document, set(mesh_ids)))
    textures = sorted(collect_textures(document, set(materials)))
    images = sorted({document["textures"][texture]["source"] for texture in textures})
    accessors = sorted(collect_accessors(document, set(mesh_ids)))
    buffer_views = sorted(
        {document["accessors"][accessor]["bufferView"] for accessor in accessors}
        | {document["images"][image]["bufferView"] for image in images}
    )
    mesh_map = {old: new for new, old in enumerate(mesh_ids)}
    material_map = {old: new for new, old in enumerate(materials)}
    texture_map = {old: new for new, old in enumerate(textures)}
    image_map = {old: new for new, old in enumerate(images)}
    accessor_map = {old: new for new, old in enumerate(accessors)}
    view_map = {old: new for new, old in enumerate(buffer_views)}

    packed = bytearray()
    view_offsets: dict[int, tuple[int, int]] = {}
    for view_id in buffer_views:
        view = document["bufferViews"][view_id]
        start = view["byteOffset"]
        length = view["byteLength"]
        while len(packed) % 4:
            packed.append(0)
        view_offsets[view_id] = (len(packed), length)
        packed.extend(binary[start : start + length])

    def remap_primitive(primitive: dict) -> dict:
        remapped = {
            "attributes": {name: accessor_map[index] for name, index in primitive["attributes"].items()},
            "mode": primitive.get("mode", 4),
        }
        if "indices" in primitive:
            remapped["indices"] = accessor_map[primitive["indices"]]
        if "material" in primitive:
            remapped["material"] = material_map[primitive["material"]]
        return remapped

    new_nodes = []
    for node in nodes:
        copied = {"name": node.get("name", "node")}
        if "mesh" in node:
            copied["mesh"] = mesh_map[node["mesh"]]
        if "translation" in node:
            copied["translation"] = node["translation"]
        if "children" in node:
            copied["children"] = list(range(1, len(nodes)))
        new_nodes.append(copied)

    new_document = {
        "asset": {"version": "2.0", "generator": "koronline-split-car-wheels"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": new_nodes,
        "meshes": [
            {
                "name": document["meshes"][mesh_id].get("name", "mesh"),
                "primitives": [remap_primitive(primitive) for primitive in document["meshes"][mesh_id]["primitives"]],
            }
            for mesh_id in mesh_ids
        ],
        "materials": [json.loads(json.dumps(document["materials"][material_id])) for material_id in materials],
        "textures": [
            {"sampler": 0, "source": image_map[document["textures"][texture]["source"]]} for texture in textures
        ],
        "images": [
            {
                "bufferView": view_map[document["images"][image]["bufferView"]],
                "mimeType": document["images"][image]["mimeType"],
                "name": document["images"][image].get("name", "image"),
            }
            for image in images
        ],
        "accessors": [],
        "bufferViews": [],
        "samplers": document["samplers"],
        "buffers": [{"byteLength": len(packed)}],
    }
    for material in new_document["materials"]:
        for key in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            if key in material:
                material[key] = {**material[key], "index": texture_map[material[key]["index"]]}
        pbr = material.get("pbrMetallicRoughness")
        if pbr:
            for key in ("baseColorTexture", "metallicRoughnessTexture"):
                if key in pbr:
                    pbr[key] = {**pbr[key], "index": texture_map[pbr[key]["index"]]}
    for accessor_id in accessors:
        accessor = dict(document["accessors"][accessor_id])
        accessor["bufferView"] = view_map[accessor["bufferView"]]
        new_document["accessors"].append(accessor)
    for view_id in buffer_views:
        offset, length = view_offsets[view_id]
        copied = {"buffer": 0, "byteOffset": offset, "byteLength": length}
        source = document["bufferViews"][view_id]
        if "target" in source:
            copied["target"] = source["target"]
        if "byteStride" in source:
            copied["byteStride"] = source["byteStride"]
        new_document["bufferViews"].append(copied)
    return new_document, bytes(packed)


def main() -> None:
    document, binary = read_glb(SOURCE)
    body_root = {"name": "electric-car", "children": BODY_CHILDREN}
    body_nodes = [body_root, *[document["nodes"][child] for child in BODY_CHILDREN]]
    body_meshes = [document["nodes"][child]["mesh"] for child in BODY_CHILDREN]
    body_document, body_binary = pack(document, binary, body_nodes, body_meshes)
    write_glb(BODY, body_document, body_binary)

    wheel = dict(document["nodes"][WHEEL_NODE])
    wheel.pop("translation", None)
    wheel.pop("children", None)
    wheel_document, wheel_binary = pack(document, binary, [wheel], [wheel["mesh"]])
    write_glb(WHEEL, wheel_document, wheel_binary)
    print(f"body {BODY.stat().st_size} wheel {WHEEL.stat().st_size}")


if __name__ == "__main__":
    main()
