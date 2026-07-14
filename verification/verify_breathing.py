import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_page(viewport={"width": 1280, "height": 800})

            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            print("Clicking Start Button")
            page.click("#startBtn")

            print("Waiting for crystals to spawn and stabilize...")
            time.sleep(2.0)

            print("Polling crystal scaleX...")
            scales = []
            for i in range(10):
                scale = page.evaluate(
                    "() => { return window.game.state.crystals.length > 0 ? window.game.state.crystals[0].scaleX : null; }"
                )
                if scale is not None:
                    scales.append(scale)
                time.sleep(0.1)

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

            screenshot_path = "verification/breathing_crystals.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    run()
