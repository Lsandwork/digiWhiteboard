#!/usr/bin/env python3
"""Remove baked-in dark tile backgrounds from crossover dashboard PNG icons."""

from __future__ import annotations

import colorsys
import sys
from collections import deque
from pathlib import Path

from PIL import Image


def pixel_brightness(r: int, g: int, b: int) -> int:
    return max(r, g, b)


def is_border_background(r: int, g: int, b: int, a: int) -> bool:
    if a < 16:
        return True
    if pixel_brightness(r, g, b) < 72:
        return True
    # Neutral checkerboard / gray backdrop from exports.
    if abs(r - g) < 18 and abs(g - b) < 18 and pixel_brightness(r, g, b) < 210:
        return True
    return False


def flood_remove_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    seen = [[False] * width for _ in range(height)]

    def neighbors(x: int, y: int):
        if x > 0:
            yield x - 1, y
        if x + 1 < width:
            yield x + 1, y
        if y > 0:
            yield x, y - 1
        if y + 1 < height:
            yield x, y + 1

    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if seen[y][x]:
            continue
        seen[y][x] = True
        r, g, b, a = pixels[x, y]
        if not is_border_background(r, g, b, a):
            continue
        pixels[x, y] = (0, 0, 0, 0)
        for nx, ny in neighbors(x, y):
            if not seen[ny][nx]:
                queue.append((nx, ny))

    return img


def remove_dark_islands(img: Image.Image) -> Image.Image:
    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            # Keep only visible amber glow strokes — drop tile fill and dark halos.
            if v < 0.44 or r < 108 or s < 0.18 or g < 45:
                pixels[x, y] = (0, 0, 0, 0)

    return img


def refine_glow_alpha(img: Image.Image) -> Image.Image:
    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            glow = min(1.0, (v - 0.35) * 1.35 + s * 0.25)
            alpha = int(max(0, min(255, 255 * glow)))
            if alpha < 24:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, alpha)

    return img


def trim_transparent(img: Image.Image, pad: int = 6) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(img.width, bbox[2] + pad)
    bottom = min(img.height, bbox[3] + pad)
    return img.crop((left, top, right, bottom))


def remove_background(input_path: Path, output_path: Path) -> None:
    img = Image.open(input_path)
    img = flood_remove_background(img)
    img = remove_dark_islands(img)
    img = refine_glow_alpha(img)
    img = trim_transparent(img)
    img.save(output_path, optimize=True)


def main() -> int:
    asset_dir = Path(__file__).resolve().parents[1] / "public" / "assets" / "crossover-dashboard"
    if not asset_dir.exists():
        print(f"Missing asset directory: {asset_dir}", file=sys.stderr)
        return 1

    icons = sorted(asset_dir.glob("icon-*.png"))
    if not icons:
        print("No icon PNG files found.", file=sys.stderr)
        return 1

    for icon in icons:
        temp = icon.with_suffix(".tmp.png")
        remove_background(icon, temp)
        temp.replace(icon)
        print(f"Processed {icon.name} ({icon.stat().st_size // 1024} KB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
