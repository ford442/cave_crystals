"""Refresh committed visual baselines after intentional art changes.

Usage (from repo root):
    npm run build
    python3 verification/update_baselines.py

Optional: pass script names to update only specific baselines, e.g.
    python3 verification/update_baselines.py verify_juice.py verify_settings.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from visual_manifest import BASELINES_DIR, CANONICAL_VISUALS, REPO_ROOT


def run_script(script_name: str) -> bool:
    script_path = Path(__file__).parent / script_name
    print(f"\n=== Capturing {script_name} ===")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=REPO_ROOT,
    )
    return result.returncode == 0


def update_baselines(only_scripts: set[str] | None = None) -> int:
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    updated = 0
    failures = 0

    for entry in CANONICAL_VISUALS:
        if only_scripts is not None and entry.script not in only_scripts:
            continue

        if not run_script(entry.script):
            print(f"[error] {entry.script} failed; skipping its baselines")
            failures += 1
            continue

        for spec in entry.screenshots:
            actual = spec.actual_path()
            baseline = spec.baseline_path()
            if not actual.is_file():
                print(f"[error] Screenshot missing: {actual}")
                failures += 1
                continue

            baseline.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(actual, baseline)
            print(f"[updated] {baseline.relative_to(REPO_ROOT)}")
            updated += 1

    print(f"\nUpdated {updated} baseline(s)")
    if failures:
        print(f"{failures} error(s) during baseline refresh")
        return 1
    return 0


def main() -> int:
    only_scripts = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    if only_scripts:
        known = {entry.script for entry in CANONICAL_VISUALS}
        unknown = only_scripts - known
        if unknown:
            print(f"[error] Unknown script(s): {', '.join(sorted(unknown))}")
            return 1
    return update_baselines(only_scripts)


if __name__ == "__main__":
    sys.exit(main())
