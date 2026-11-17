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


# Run-to-run, fixed-step captures are byte-identical (`run_visual.py --repeat`
# proves it), so these ratios no longer absorb gameplay timing. They only leave
# headroom for rasteriser/font differences between the machine that recorded the
# baselines and the CI runner (anti-aliased edges, canvas glyphs). Keep the limit
# tight: raising the warp-grid line alpha from 0.05 to 0.08 changes only 0.52% of
# pixels, which a 1% limit would miss. Before the fixed-step harness the limits
# were 12-18% and runs still flaked. If CI's environment drifts beyond this,
# commit baselines captured on CI (see AGENTS.md) rather than loosening it.
CROSS_ENV_MAX_DIFF_RATIO = 0.002


def _single(script: str, actual_name: str) -> ScriptSpec:
    return ScriptSpec(script, (_shot(actual_name),))


def _shot(actual_name: str) -> ScreenshotSpec:
    return ScreenshotSpec(
        f"verification/{actual_name}",
        f"verification/baselines/{actual_name}",
        max_diff_ratio=CROSS_ENV_MAX_DIFF_RATIO,
    )


# Canonical scripts drive the game with fixed_step.py (enforced by
# test/scripts/ci-gate.test.mjs) and capture #gameCanvas only.
CANONICAL_VISUALS: tuple[ScriptSpec, ...] = (
    _single("verify_juice.py", "verify_juice.png"),
    _single("verify_vfx_effects.py", "vfx_effects_screenshot.png"),
    ScriptSpec(
        "verify_game_http.py",
        (_shot("game_start_http.png"), _shot("game_spore_http.png")),
    ),
    _single("verify_renderer_composition.py", "verify_renderer_composition.png"),
    _single("verify_warp_grid.py", "verify_warp_grid.png"),
    _single("verify_breathing.py", "breathing_crystals.png"),
    _single("verify_critical_vignette.py", "verify_critical_vignette.png"),
    _single("verify_settings.py", "verify_settings.png"),
)


def iter_screenshot_specs():
    for entry in CANONICAL_VISUALS:
        for spec in entry.screenshots:
            yield entry.script, spec
