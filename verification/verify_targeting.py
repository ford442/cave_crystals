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

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            print("Clicking Start Button")
            page.click("#startBtn")
            time.sleep(1.0)

            print("Aiming at lane 1...")
            # Lane width is roughly 1280 / 7 ~= 182, lane 1 center ~= 270
            page.mouse.move(270, 400)
            time.sleep(0.5)
            screenshot_path = "verification/targeting_lane_1.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            print("Aiming at lane 3 (Middle)...")
            page.mouse.move(640, 400)
            time.sleep(0.5)
            screenshot_path = "verification/targeting_lane_3.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    run()
