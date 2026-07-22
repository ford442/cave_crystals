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


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            advance(page, 1000)

            page.click("#startBtn")
            advance(page, 1000)

            print("Injecting massive shockwave...")
            page.evaluate("""
                try {
                    window.game.createShockwave(640, 400, '#fff');
                    window.game.state.shockwaves[0].life = 1.0;
                    window.game.state.shockwaves[0].radius = 100;
                    console.log("Shockwave injected successfully");
                } catch (e) {
                    console.error("Error injecting shockwave:", e);
                }
            """)

            advance(page, 500)

            capture_deterministic_screenshot(
                page,
                "verification/verify_warp_grid.png",
                timestamp=1_000_400,
            )

            browser.close()


if __name__ == "__main__":
    run()
