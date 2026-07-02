#!/usr/bin/env python3
"""Clean Fitdog lobby service SVGs for consistent grid display."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "public/assets/fitdog"
OUT_DIR = ROOT / "public/assets/fitdog/services"

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

MAPPING = {
    "service-daycare.svg": "daycare.svg",
    "service-overnight.svg": "overnight.svg",
    "service-grooming.svg": "grooming.svg",
    "service-taxi.svg": "taxi.svg",
    "service-dog-hiking.svg": "dog-hiking.svg",
    "service-beach.svg": "beach-excursions.svg",
    "service-puppy-socialization.svg": "puppy-socialization.svg",
    "service-obedience.svg": "obedience-manners.svg",
    "service-fitness.svg": "canine-fitness.svg",
}

# Icon-only crop for single-path tiles that still contain baked labels.
ICON_VIEWBOX = {
    "daycare.svg": "0 0 823 655",
    "overnight.svg": "0 0 873 680",
    "grooming.svg": "0 0 820 655",
    "taxi.svg": "0 0 878 700",
    "dog-hiking.svg": "0 0 768 620",
}

TEAL_FILLS = {
    "#4296b3",
    "#4197b3",
    "#4197b4",
    "#4096b2",
    "#4b9cb8",
    "#3b94b2",
    "rgb(64,150,178)",
    "rgb(59,148,178)",
    "rgb(58,133,157)",
    "rgb(207,165,100)",
}

NUM_RE = re.compile(r"-?\d*\.?\d+")


def parse_numbers(value: str) -> list[float]:
    return [float(n) for n in NUM_RE.findall(value)]


def path_bbox(d: str) -> tuple[float, float, float, float] | None:
    nums = parse_numbers(d)
    if len(nums) < 2:
        return None
    xs = nums[0::2]
    ys = nums[1::2]
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def normalize_fill(fill: str | None) -> str:
    return (fill or "").strip().lower().replace(" ", "")


def is_background_fill(fill: str | None) -> bool:
    normalized = normalize_fill(fill)
    if not normalized or normalized in {"none", "transparent"}:
        return False
    if normalized in {"#fff", "#ffffff", "white"}:
        return False
    if normalized in {c.replace(" ", "") for c in TEAL_FILLS}:
        return True
    if normalized.startswith("rgb(") and "255,255,255" not in normalized:
        return True
    return normalized.startswith("#") and normalized not in {"#fff", "#ffffff"}


def is_white_fill(fill: str | None) -> bool:
    normalized = normalize_fill(fill)
    return normalized in {"#fff", "#ffffff", "white", "rgb(255,255,255)"}


def is_text_path(bbox: tuple[float, float, float, float], canvas_h: float) -> bool:
    _x0, y0, _x1, y1 = bbox
    height = y1 - y0
    center_y = (y0 + y1) / 2
    # Letterforms in these exports sit in the lower band of the artboard.
    return center_y > canvas_h * 0.72 and height < canvas_h * 0.22


def clean_tree(root: ET.Element, canvas_w: float, canvas_h: float) -> list[tuple[float, float, float, float]]:
    kept_bboxes: list[tuple[float, float, float, float]] = []

    for rect in list(root.findall(f"{{{SVG_NS}}}rect")):
        root.remove(rect)

    for path in list(root.findall(f"{{{SVG_NS}}}path")):
        fill = path.attrib.get("fill")
        d = path.attrib.get("d", "")
        bbox = path_bbox(d)

        if is_background_fill(fill):
            root.remove(path)
            continue

        if not is_white_fill(fill):
            root.remove(path)
            continue

        if bbox and is_text_path(bbox, canvas_h):
            root.remove(path)
            continue

        if bbox:
            kept_bboxes.append(bbox)

    for image in list(root.findall(f"{{{SVG_NS}}}image")):
        root.remove(image)

    return kept_bboxes


def union_bbox(bboxes: list[tuple[float, float, float, float]], pad: float = 24.0) -> str:
    if not bboxes:
        return "0 0 512 512"
    x0 = min(b[0] for b in bboxes)
    y0 = min(b[1] for b in bboxes)
    x1 = max(b[2] for b in bboxes)
    y1 = max(b[3] for b in bboxes)
    x0 = max(0.0, x0 - pad)
    y0 = max(0.0, y0 - pad)
    x1 += pad
    y1 += pad
    return f"{x0:.1f} {y0:.1f} {x1 - x0:.1f} {y1 - y0:.1f}"


def clean_file(src_name: str, out_name: str) -> dict[str, str | bool]:
    src = SRC_DIR / src_name
    raw = src.read_text(encoding="utf-8")
    flags = {
        "embedded_raster": bool(re.search(r"<image\b|data:image/(png|jpe?g)", raw, re.I)),
    }

    root = ET.fromstring(raw)
    width = float(root.attrib.get("width", "1024").replace("px", ""))
    height = float(root.attrib.get("height", "1024").replace("px", ""))
    kept = clean_tree(root, width, height)

    view_box = ICON_VIEWBOX.get(out_name) or union_bbox(kept, pad=28.0)
    root.attrib["viewBox"] = view_box
    root.attrib.pop("width", None)
    root.attrib.pop("height", None)
    root.attrib.pop("aria-label", None)
    root.attrib["role"] = "img"
    root.attrib["aria-hidden"] = "true"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / out_name
    ET.indent(root, space="  ")
    out_path.write_text(ET.tostring(root, encoding="unicode"), encoding="utf-8")
    flags["output"] = str(out_path.relative_to(ROOT))
    flags["viewBox"] = view_box
    flags["paths_kept"] = str(len(kept))
    return flags


def main() -> None:
    print("Cleaning service SVGs...\n")
    for src_name, out_name in MAPPING.items():
        result = clean_file(src_name, out_name)
        raster = "YES - embedded raster found" if result["embedded_raster"] else "no"
        print(f"{out_name}: viewBox={result['viewBox']} paths={result['paths_kept']} raster={raster}")


if __name__ == "__main__":
    main()
