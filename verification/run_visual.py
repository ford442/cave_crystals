"""Run canonical visual verification scripts and compare screenshots to baselines.

Usage (from repo root):
    npm run build
    python3 verification/run_visual.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from visual_diff import compare_images, require_pillow
from visual_manifest import BASELINES_DIR, CANONICAL_VISUALS, DIFFS_DIR, REPO_ROOT


def run_script(script_name: str) -> bool:
    script_path = Path(__file__).parent / script_name
    print(f"\n=== Running {script_name} ===")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=REPO_ROOT,
    )
    return result.returncode == 0


def compare_screenshots() -> list[tuple[str, str, bool, str]]:
    require_pillow()
    DIFFS_DIR.mkdir(parents=True, exist_ok=True)
    results: list[tuple[str, str, bool, str]] = []

    for script_name, spec in (
        (entry.script, screenshot)
        for entry in CANONICAL_VISUALS
        for screenshot in entry.screenshots
    ):
        label = f"{script_name} -> {Path(spec.baseline).name}"
        try:
            diff = compare_images(
                spec.baseline_path(),
                spec.actual_path(),
                pixel_threshold=spec.pixel_threshold,
            )
            passed, message = _check(diff, spec.max_diff_ratio)
            if not passed:
                compare_images(
                    spec.baseline_path(),
                    spec.actual_path(),
                    pixel_threshold=spec.pixel_threshold,
                    diff_output_path=spec.diff_path(),
                )
                print(f"[FAIL] {label}: {message} (diff: {spec.diff_path()})")
            else:
                print(f"[PASS] {label}: {message}")
            results.append((script_name, label, passed, message))
        except FileNotFoundError as exc:
            print(f"[FAIL] {label}: {exc}")
            results.append((script_name, label, False, str(exc)))

    return results


def _check(diff, max_diff_ratio: float) -> tuple[bool, str]:
    pct = diff.diff_ratio * 100
    limit_pct = max_diff_ratio * 100
    if diff.diff_ratio <= max_diff_ratio:
        return True, f"{pct:.2f}% pixels differ (limit {limit_pct:.2f}%)"
    return False, f"{pct:.2f}% pixels differ, exceeds limit {limit_pct:.2f}%"


def run() -> int:
    if not BASELINES_DIR.is_dir():
        print(f"[error] Baselines directory not found: {BASELINES_DIR}")
        print("Run: python3 verification/update_baselines.py")
        return 1

    script_failures: list[str] = []
    for entry in CANONICAL_VISUALS:
        if not run_script(entry.script):
            script_failures.append(entry.script)

    print("\n=== Visual Baseline Comparison ===")
    comparison_results = compare_screenshots()

    print("\n=== Visual Regression Summary ===")
    visual_failures = 0
    for _script, label, passed, message in comparison_results:
        status = "PASS" if passed else "FAIL"
        if not passed:
            visual_failures += 1
        print(f"[{status}] {label}: {message}")

    if script_failures:
        print("\nScript failures:")
        for name in script_failures:
            print(f"  - {name}")

    total_checks = len(comparison_results)
    passed_checks = total_checks - visual_failures
    print(
        f"\n{passed_checks}/{total_checks} baselines matched; "
        f"{len(script_failures)} script(s) failed"
    )

    if script_failures or visual_failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run())
