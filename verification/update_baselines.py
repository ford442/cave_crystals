"""Refresh committed visual baselines after intentional art changes.

Usage (from repo root):
    npm run build
    python3 verification/update_baselines.py

Optional: pass script names to update only specific baselines, e.g.
    python3 verification/update_baselines.py verify_juice.py verify_settings.py

Each script is captured twice and a baseline is only written when both runs are
pixel-identical, so a nondeterministic scene can never be committed as the
reference. ``--runs N`` raises the number of runs (minimum 2).
"""
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from visual_manifest import BASELINES_DIR, CANONICAL_VISUALS, REPO_ROOT
from visual_stability import capture_runs, unstable_screenshots


def update_baselines(only_scripts: set[str] | None = None, runs: int = 2) -> int:
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    updated = 0
    failures = 0

    for entry in CANONICAL_VISUALS:
        if only_scripts is not None and entry.script not in only_scripts:
            continue

        with tempfile.TemporaryDirectory(prefix="baseline-capture-") as tmp:
            captures = capture_runs(entry, runs, Path(tmp))
            if captures is None:
                print(f"[error] {entry.script} failed; skipping its baselines")
                failures += 1
                continue
            problems = unstable_screenshots(entry, captures)
            if problems:
                print(f"[error] {entry.script} is not run-to-run stable; baselines NOT updated:")
                for msg in problems:
                    print(f"  - {msg}")
                failures += 1
                continue

        for spec in entry.screenshots:
            actual = spec.actual_path()
            baseline = spec.baseline_path()
            baseline.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(actual, baseline)
            print(f"[updated] {baseline.relative_to(REPO_ROOT)}")
            updated += 1

    print(f"\nUpdated {updated} baseline(s)")
    if failures:
        print(f"{failures} error(s) during baseline refresh")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("scripts", nargs="*", help="canonical script names to refresh")
    parser.add_argument(
        "--runs",
        type=int,
        default=2,
        metavar="N",
        help="captures per script that must match before writing (default 2)",
    )
    args = parser.parse_args(argv)
    if args.runs < 2:
        parser.error("--runs must be >= 2")
    only_scripts = set(args.scripts) if args.scripts else None
    if only_scripts:
        known = {entry.script for entry in CANONICAL_VISUALS}
        unknown = only_scripts - known
        if unknown:
            print(f"[error] Unknown script(s): {', '.join(sorted(unknown))}")
            return 1
    return update_baselines(only_scripts, args.runs)


if __name__ == "__main__":
    sys.exit(main())
