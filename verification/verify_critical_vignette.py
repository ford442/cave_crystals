import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from fixed_step import (
    capture_fixed_step_screenshot,
    new_fixed_step_page,
    open_game,
    step,
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
            page = new_fixed_step_page(browser, viewport={"width": 1280, "height": 800})

            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            print(f"Navigating to {server.url}")
            open_game(page, server.url)

            print("Clicking Start Button")
            page.click("#startBtn")
            step(page, 500)

            print("Injecting Critical State...")
            page.evaluate(NORMALIZE_CRITICAL_JS)

            # Draw the injected state as-is; a stepped frame would decay it first.
            capture_fixed_step_screenshot(
                page, "verification/verify_critical_vignette.png", redraw=True
            )

            browser.close()


if __name__ == "__main__":
    run()
