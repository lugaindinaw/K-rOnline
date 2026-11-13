"""Recolor the CC0 Grab3D cars. Geometry stays; only the body paint changes.

Source models stay in third_party/grab3d. This writes the files the map serves.
"""

from __future__ import annotations

import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CAR_SOURCE = ROOT / "third_party" / "grab3d" / "electric-car.glb"
TRAFFIC_SOURCE = ROOT / "third_party" / "grab3d" / "compact-car.glb"
PUBLIC = ROOT / "public"


def read_glb(path: Path) -> tuple[dict, bytearray]:
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    binary_start = 20 + json_length
    binary_length = struct.unpack_from("<I", data, binary_start)[0]
    binary = bytearray(data[binary_start + 8 : binary_start + 8 + binary_length])
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    blob = bytes(binary)
    blob += b"\x00" * ((4 - len(blob) % 4) % 4)
    total = 12 + 8 + len(payload) + 8 + len(blob)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(payload), 0x4E4F534A) + payload
    out += struct.pack("<II", len(blob), 0x004E4942) + blob
    path.write_bytes(out)


def jpeg_of(binary: bytearray, document: dict, name: str) -> tuple[int, bytes]:
    for image in document["images"]:
        if image.get("name") == name:
            view = document["bufferViews"][image["bufferView"]]
            start = view.get("byteOffset", 0)
            return image["bufferView"], bytes(binary[start : start + view["byteLength"]])
    raise KeyError(name)


def tint(blob: bytes, base: tuple[float, float, float], contrast: float) -> bytes:
    image = Image.open(io.BytesIO(blob)).convert("RGB")
    pixels = np.asarray(image).astype(np.float32)
    shade = pixels.mean(axis=2, keepdims=True)
    paint = np.array(base, dtype=np.float32) + (shade - shade.mean()) * contrast
    colored = np.clip(paint, 0, 255).astype(np.uint8)
    quality = 90
    encoded = b""
    while quality >= 40:
        buffer = io.BytesIO()
        Image.fromarray(colored).save(buffer, format="JPEG", quality=quality)
        encoded = buffer.getvalue()
        if len(encoded) <= len(blob):
            return encoded
        quality -= 5
    raise RuntimeError(f"recolored jpeg is larger than the source ({len(encoded)} > {len(blob)})")


def replace_jpeg(binary: bytearray, document: dict, name: str, encoded: bytes) -> None:
    index, original = jpeg_of(binary, document, name)
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    if len(encoded) > len(original):
        raise RuntimeError(name)
    binary[start : start + len(encoded)] = encoded


def paint_factor(document: dict, name_part: str, color: list[float], metal: float, rough: float) -> None:
    for material in document["materials"]:
        if name_part not in material.get("name", ""):
            continue
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = color
        pbr["metallicFactor"] = metal
        pbr["roughnessFactor"] = rough


def main() -> None:
    car, car_bin = read_glb(CAR_SOURCE)
    replace_jpeg(car_bin, car, "electric-car_body_basecolor", tint(jpeg_of(car_bin, car, "electric-car_body_basecolor")[1], (132, 138, 146), 0.72))
    paint_factor(car, "charge_flap", [0.12, 0.125, 0.135, 1], 0.62, 0.28)
    paint_factor(car, "window_glass", [0.16, 0.2, 0.24, 0.5], 0.15, 0.04)
    paint_factor(car, "rim_x", [0.72, 0.74, 0.76, 1], 0.82, 0.22)
    write_glb(PUBLIC / "car.glb", car, car_bin)

    traffic, traffic_bin = read_glb(TRAFFIC_SOURCE)
    write_glb(PUBLIC / "traffic.glb", traffic, traffic_bin)
    silver, silver_bin = read_glb(TRAFFIC_SOURCE)
    replace_jpeg(
        silver_bin,
        silver,
        "compact-car_body_basecolor",
        tint(jpeg_of(silver_bin, silver, "compact-car_body_basecolor")[1], (206, 210, 214), 0.55),
    )
    write_glb(PUBLIC / "traffic-silver.glb", silver, silver_bin)
    dark, dark_bin = read_glb(TRAFFIC_SOURCE)
    replace_jpeg(
        dark_bin,
        dark,
        "compact-car_body_basecolor",
        tint(jpeg_of(dark_bin, dark, "compact-car_body_basecolor")[1], (52, 74, 108), 0.7),
    )
    write_glb(PUBLIC / "traffic-dark.glb", dark, dark_bin)


if __name__ == "__main__":
    main()
