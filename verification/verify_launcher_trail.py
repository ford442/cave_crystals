import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def verify_launcher_trail():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_page()

            page.goto(server.url)

            page.click("#startBtn")
            time.sleep(1)  # Wait for init

            # Force rapid movement to generate trail
            page.evaluate("""
                () => {
                    // Teleport to lane 0 first
                    window.game.launcher.setTargetLane(0);
                    window.game.launcher.x = (0 * window.game.renderer.laneWidth) + (window.game.renderer.laneWidth / 2);

                    // Now command move to lane 6
                    window.game.launcher.setTargetLane(6);
                }
            """)

            # Launcher lerp factor is 0.2, so it takes a few frames to pick up speed.
            time.sleep(0.15)

            screenshot_path = "verification/launcher_trail.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    verify_launcher_trail()
