"""Shared pixel-diff utilities for visual regression baselines."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - exercised via compare_images guard
    Image = None
    ImageChops = None

DEFAULT_PIXEL_THRESHOLD = 12


@dataclass(frozen=True)
class DiffResult:
    baseline_path: Path
    actual_path: Path
    diff_ratio: float
    width: int
    height: int
    diff_image_path: Path | None = None


def require_pillow() -> None:
    if Image is None:
        raise RuntimeError(
            "Pillow is required for visual regression. Install with: pip install Pillow"
        )


def compare_images(
    baseline_path: Path | str,
    actual_path: Path | str,
    *,
    pixel_threshold: int = DEFAULT_PIXEL_THRESHOLD,
    diff_output_path: Path | str | None = None,
) -> DiffResult:
    """Return the fraction of pixels that differ beyond the per-channel threshold."""
    require_pillow()

    baseline = Path(baseline_path)
    actual = Path(actual_path)
    if not baseline.is_file():
        raise FileNotFoundError(f"Baseline not found: {baseline}")
    if not actual.is_file():
        raise FileNotFoundError(f"Actual screenshot not found: {actual}")

    img_a = Image.open(baseline).convert("RGB")
    img_b = Image.open(actual).convert("RGB")
    if img_a.size != img_b.size:
        img_b = img_b.resize(img_a.size, Image.Resampling.BILINEAR)

    pixels_a = img_a.load()
    pixels_b = img_b.load()
    width, height = img_a.size
    diff_count = 0

    for y in range(height):
        for x in range(width):
            r1, g1, b1 = pixels_a[x, y]
            r2, g2, b2 = pixels_b[x, y]
            if abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2) > pixel_threshold:
                diff_count += 1

    diff_ratio = diff_count / (width * height)
    diff_image_path = None

    if diff_output_path is not None and diff_count > 0:
        diff_image_path = Path(diff_output_path)
        diff_image_path.parent.mkdir(parents=True, exist_ok=True)
        diff = ImageChops.difference(img_a, img_b)
        diff.save(diff_image_path)

    return DiffResult(
        baseline_path=baseline,
        actual_path=actual,
        diff_ratio=diff_ratio,
        width=width,
        height=height,
        diff_image_path=diff_image_path,
    )


def check_within_threshold(
    result: DiffResult,
    max_diff_ratio: float,
    *,
    diff_output_path: Path | str | None = None,
) -> tuple[bool, str]:
    """Compare images and optionally write a diff artifact when they diverge."""
    if diff_output_path is not None and result.diff_ratio > max_diff_ratio:
        compare_images(
            result.baseline_path,
            result.actual_path,
            diff_output_path=diff_output_path,
        )

    pct = result.diff_ratio * 100
    limit_pct = max_diff_ratio * 100
    if result.diff_ratio <= max_diff_ratio:
        return True, f"{pct:.2f}% pixels differ (limit {limit_pct:.2f}%)"

    return (
        False,
        f"{pct:.2f}% pixels differ, exceeds limit {limit_pct:.2f}%",
    )
