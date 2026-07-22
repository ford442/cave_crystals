"""Canonical visual regression scripts and baseline screenshot mappings."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

VERIFICATION_DIR = Path(__file__).parent
REPO_ROOT = VERIFICATION_DIR.parent
BASELINES_DIR = VERIFICATION_DIR / "baselines"
DIFFS_DIR = VERIFICATION_DIR / "diffs"


@dataclass(frozen=True)
class ScreenshotSpec:
    actual: str
    baseline: str
    max_diff_ratio: float
    pixel_threshold: int = 12

    def actual_path(self) -> Path:
        return REPO_ROOT / self.actual

    def baseline_path(self) -> Path:
        return REPO_ROOT / self.baseline

    def diff_path(self) -> Path:
        name = Path(self.baseline).name
        return DIFFS_DIR / name.replace(".png", "_diff.png")


@dataclass(frozen=True)
class ScriptSpec:
    script: str
    screenshots: tuple[ScreenshotSpec, ...]


# Six canonical scripts with canvas-only captures and calibrated thresholds.
# verify_critical_vignette.py, verify_settings.py, and the game_spore_http frame
# capture screenshots but are not gated yet (see AGENTS.md).
CANONICAL_VISUALS: tuple[ScriptSpec, ...] = (
    ScriptSpec(
        "verify_juice.py",
        (
            ScreenshotSpec(
                "verification/verify_juice.png",
                "verification/baselines/verify_juice.png",
                max_diff_ratio=0.18,
            ),
        ),
    ),
    ScriptSpec(
        "verify_vfx_effects.py",
        (
            ScreenshotSpec(
                "verification/vfx_effects_screenshot.png",
                "verification/baselines/vfx_effects_screenshot.png",
                max_diff_ratio=0.17,
            ),
        ),
    ),
    ScriptSpec(
        "verify_game_http.py",
        (
            ScreenshotSpec(
                "verification/game_start_http.png",
                "verification/baselines/game_start_http.png",
                max_diff_ratio=0.12,
            ),
        ),
    ),
    ScriptSpec(
        "verify_renderer_composition.py",
        (
            ScreenshotSpec(
                "verification/verify_renderer_composition.png",
                "verification/baselines/verify_renderer_composition.png",
                max_diff_ratio=0.14,
            ),
        ),
    ),
    ScriptSpec(
        "verify_warp_grid.py",
        (
            ScreenshotSpec(
                "verification/verify_warp_grid.png",
                "verification/baselines/verify_warp_grid.png",
                max_diff_ratio=0.14,
            ),
        ),
    ),
    ScriptSpec(
        "verify_breathing.py",
        (
            ScreenshotSpec(
                "verification/breathing_crystals.png",
                "verification/baselines/breathing_crystals.png",
                max_diff_ratio=0.14,
            ),
        ),
    ),
)


def iter_screenshot_specs():
    for entry in CANONICAL_VISUALS:
        for spec in entry.screenshots:
            yield entry.script, spec
