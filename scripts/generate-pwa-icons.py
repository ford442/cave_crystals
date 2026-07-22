#!/usr/bin/env python3
"""Generate PWA install icons (192, 512, apple-touch) for Crystal Cave Spore Hunter."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BG = (8, 12, 28)
CRYSTAL = [(255, 0, 204), (51, 51, 255), (0, 204, 255)]


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)
    margin = size * 0.12
    cx, cy = size / 2, size / 2
    points = [
        (cx, margin),
        (size - margin, cy),
        (cx, size - margin),
        (margin, cy),
    ]
    for i, color in enumerate(CRYSTAL):
        offset = i * 0.04 * size
        shifted = [(x + (offset if j % 2 else -offset * 0.5), y) for j, (x, y) in enumerate(points)]
        draw.polygon(shifted, fill=color + (220,))
    glow_r = size * 0.08
    draw.ellipse(
        (cx - glow_r, cy - glow_r, cx + glow_r, cy + glow_r),
        fill=(255, 255, 255, 180),
    )
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        draw_icon(size).save(OUT / name, "PNG")
        print(f"Wrote {OUT / name}")


if __name__ == "__main__":
    main()
