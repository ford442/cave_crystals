import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def verify_spore_trail():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_page()

            page.goto(server.url)

            page.wait_for_selector("#gameCanvas")

            page.click("#startBtn")

            time.sleep(1)

            # Simulate shooting a spore in the middle of the screen
            page.mouse.click(400, 400)

            # Wait a brief moment for the spore to travel and generate a trail
            time.sleep(0.5)

            screenshot_path = "verification/spore_trail.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    verify_spore_trail()
