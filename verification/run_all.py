"""Runs every self-contained verification script against a production build.

Each script starts (and stops) its own static server via server.DistServer, so
this can run end-to-end with no server pre-started. Requires `npm run build`
to have produced `dist/` first.

Usage: python3 verification/run_all.py
"""
import subprocess
import sys
from pathlib import Path

VERIFICATION_DIR = Path(__file__).parent
EXCLUDE = {"server.py", "run_all.py"}


def discover_scripts():
    return sorted(
        p for p in VERIFICATION_DIR.glob("verify_*.py") if p.name not in EXCLUDE
    )


def run():
    scripts = discover_scripts()
    if not scripts:
        print("No verification scripts found.")
        return 1

    results = []
    for script in scripts:
        print(f"\n=== Running {script.name} ===")
        result = subprocess.run([sys.executable, str(script)], cwd=VERIFICATION_DIR.parent)
        results.append((script.name, result.returncode == 0))

    print("\n=== Verification Summary ===")
    failures = 0
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        if not passed:
            failures += 1
        print(f"[{status}] {name}")

    print(f"\n{len(results) - failures}/{len(results)} scripts passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
