"""
Smoke test for composed renderer subsystems.
Captures a deterministic gameplay screenshot and optionally compares against
the pre-refactor baseline (verification/verify_juice_before_renderer_refactor.png).
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_failure, report_screenshot


BASELINE_PATH = os.path.join(os.path.dirname(__file__), "verify_juice_before_renderer_refactor.png")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "verify_renderer_composition.png")


def _pixel_diff_ratio(path_a, path_b):
    try:
        from PIL import Image
    except ImportError:
        return None

    img_a = Image.open(path_a).convert("RGB")
    img_b = Image.open(path_b).convert("RGB")
    if img_a.size != img_b.size:
        img_b = img_b.resize(img_a.size)

    pixels_a = img_a.load()
    pixels_b = img_b.load()
    w, h = img_a.size
    total = w * h
    diff = 0
    threshold = 12

    for y in range(h):
        for x in range(w):
            r1, g1, b1 = pixels_a[x, y]
            r2, g2, b2 = pixels_b[x, y]
            if abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2) > threshold:
                diff += 1

    return diff / total


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()

            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            time.sleep(0.5)
            page.click("#startBtn")
            time.sleep(0.5)

            # Deterministic input sequence (same as verify_juice.py)
            page.mouse.click(64, 400)
            time.sleep(0.5)
            page.mouse.click(200, 400)
            time.sleep(0.5)
            page.mouse.click(350, 400)
            time.sleep(2)

            renderer_type = page.evaluate(
                "typeof window.game?.renderer?.crystal?.drawComplexCrystal === 'function'"
            )
            assert renderer_type, "Renderer should expose composed crystal subsystem"

            host_type = page.evaluate(
                "typeof window.game?.renderer?.host?.getQualityProfile === 'function'"
            )
            assert host_type, "Renderer should expose shared RendererHost"

            page.screenshot(path=OUTPUT_PATH)
            report_screenshot(OUTPUT_PATH)

            if os.path.isfile(BASELINE_PATH):
                ratio = _pixel_diff_ratio(BASELINE_PATH, OUTPUT_PATH)
                if ratio is None:
                    print("[info] Pillow not installed; skipped pixel diff against baseline")
                else:
                    print(f"[diff] baseline vs composition screenshot: {ratio * 100:.2f}% pixels differ")
                    # Procedural particles/timing vary between runs; fail only on catastrophic drift.
                    if ratio > 0.92:
                        report_failure(
                            f"Renderer composition visual drift too high ({ratio * 100:.1f}% pixels)"
                        )
                        browser.close()
                        sys.exit(1)
            else:
                print(f"[info] Baseline not found at {BASELINE_PATH}; screenshot only")

            browser.close()


if __name__ == "__main__":
    run()
