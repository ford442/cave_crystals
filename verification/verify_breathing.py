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

            print("Waiting for crystals to spawn and stabilize...")
            step(page, 2000)

            print("Polling crystal scaleX...")
            scales = []
            for _i in range(10):
                scale = page.evaluate(
                    "() => { return window.game.state.crystals.length > 0 ? window.game.state.crystals[0].scaleX : null; }"
                )
                if scale is not None:
                    scales.append(scale)
                step(page, 100)

            print(f"Collected scales: {scales}")

            if not scales:
                print("Error: No crystals found!")
                sys.exit(1)

            min_scale = min(scales)
            max_scale = max(scales)

            print(f"Min Scale: {min_scale}, Max Scale: {max_scale}")

            diff = max_scale - min_scale
            if diff < 0.0001:
                print("FAILURE: Crystal scale is static!")
                sys.exit(1)

            if max_scale < 0.1:
                print("FAILURE: Crystal scale is stuck near 0!")
                sys.exit(1)

            print("SUCCESS: Crystal scale is varying (Breathing effect active).")

            capture_fixed_step_screenshot(page, "verification/breathing_crystals.png")

            browser.close()


if __name__ == "__main__":
    run()
