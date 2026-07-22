"""
Smoke test for composed renderer subsystems.
Captures a deterministic gameplay screenshot; baseline comparison is handled by
run_visual.py against verification/baselines/verify_renderer_composition.png.
"""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import (
    advance,
    capture_deterministic_screenshot,
    new_deterministic_page,
)
from server import CHROMIUM_ARGS, DistServer

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "verify_renderer_composition.png")


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            advance(page, 500)
            page.click("#startBtn")
            advance(page, 500)

            # Deterministic input sequence (same as verify_juice.py)
            page.mouse.click(64, 400)
            advance(page, 500)
            page.mouse.click(200, 400)
            advance(page, 500)
            page.mouse.click(350, 400)
            advance(page, 2000)

            renderer_type = page.evaluate(
                "typeof window.game?.renderer?.crystal?.drawComplexCrystal === 'function'"
            )
            assert renderer_type, "Renderer should expose composed crystal subsystem"

            host_type = page.evaluate(
                "typeof window.game?.renderer?.host?.getQualityProfile === 'function'"
            )
            assert host_type, "Renderer should expose shared RendererHost"

            capture_deterministic_screenshot(page, OUTPUT_PATH)

            browser.close()


if __name__ == "__main__":
    run()
