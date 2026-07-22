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

NORMALIZE_CRITICAL_JS = """
() => {
    const g = window.game;
    if (!g) return;
    g.state.criticalIntensity = 1.0;
    for (const c of g.state.crystals) {
        c.height = 45;
        c.scaleX = 1.0;
        c.scaleY = 1.0;
        c.isCritical = true;
    }
}
"""


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            print("Clicking Start Button")
            page.click("#startBtn")
            advance(page, 500)

            print("Injecting Critical State...")
            page.evaluate(NORMALIZE_CRITICAL_JS)

            capture_deterministic_screenshot(
                page,
                "verification/verify_critical_vignette.png",
                timestamp=1_000_200,
            )

            browser.close()


if __name__ == "__main__":
    run()
