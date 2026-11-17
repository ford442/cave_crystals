"""Run-to-run stability checks for canonical visual scripts.

Fixed-step scripts (see ``fixed_step.py``) must produce identical canvases when
run repeatedly against the same ``dist/``. These helpers capture a script
several times and compare every run against the first with zero tolerance.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from visual_diff import compare_images
from visual_manifest import REPO_ROOT, ScriptSpec

VERIFICATION_DIR = Path(__file__).parent


def run_script(script_name: str, *, label: str = "Running") -> bool:
    script_path = VERIFICATION_DIR / script_name
    print(f"\n=== {label} {script_name} ===", flush=True)
    result = subprocess.run([sys.executable, str(script_path)], cwd=REPO_ROOT)
    return result.returncode == 0


def capture_runs(entry: ScriptSpec, runs: int, workdir: Path) -> list[list[Path]] | None:
    """Run ``entry.script`` ``runs`` times, copying each run's screenshots aside.

    Returns ``captures[run][screenshot_index]`` or ``None`` if any run failed or
    a screenshot was missing. The last run's screenshots stay in place for the
    baseline comparison that follows.
    """
    captures: list[list[Path]] = []
    for run in range(runs):
        label = "Running" if runs == 1 else f"Running ({run + 1}/{runs})"
        for spec in entry.screenshots:
            spec.actual_path().unlink(missing_ok=True)
        if not run_script(entry.script, label=label):
            return None
        this_run: list[Path] = []
        for index, spec in enumerate(entry.screenshots):
            actual = spec.actual_path()
            if not actual.is_file():
                print(f"[error] Screenshot missing after run {run + 1}: {actual}")
                return None
            kept = workdir / f"run{run}_{index}_{actual.name}"
            shutil.copy2(actual, kept)
            this_run.append(kept)
        captures.append(this_run)
    return captures


def unstable_screenshots(entry: ScriptSpec, captures: list[list[Path]]) -> list[str]:
    """Describe every screenshot whose later runs differ from run 1 at all."""
    problems: list[str] = []
    first = captures[0]
    for run_index, other in enumerate(captures[1:], start=2):
        for spec, a, b in zip(entry.screenshots, first, other):
            diff = compare_images(a, b, pixel_threshold=0)
            if diff.diff_ratio > 0:
                problems.append(
                    f"{Path(spec.actual).name}: run {run_index} differs from run 1 in "
                    f"{diff.diff_ratio * 100:.3f}% of pixels"
                )
    return problems


def check_stability(entry: ScriptSpec, runs: int) -> tuple[bool, list[str]]:
    """Capture ``runs`` times; ``(scripts_ok, instability messages)``."""
    with tempfile.TemporaryDirectory(prefix="visual-stability-") as tmp:
        captures = capture_runs(entry, runs, Path(tmp))
        if captures is None:
            return False, []
        if runs < 2:
            return True, []
        return True, unstable_screenshots(entry, captures)
