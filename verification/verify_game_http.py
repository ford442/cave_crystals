import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_failure, report_screenshot


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            print(f"Navigating to {server.url}")

            try:
                page.goto(server.url)
                page.wait_for_selector("#gameCanvas")

                page.click("#startBtn")
                time.sleep(1)

                screenshot_path = "verification/game_start_http.png"
                page.screenshot(path=screenshot_path)
                report_screenshot(screenshot_path)

                page.mouse.click(640, 400)
                time.sleep(0.5)

                screenshot_path = "verification/game_spore_http.png"
                page.screenshot(path=screenshot_path)
                report_screenshot(screenshot_path)

            except Exception as e:
                print(f"Error: {e}")
                failure_path = "verification/error_http.png"
                page.screenshot(path=failure_path)
                report_failure(failure_path)

            browser.close()


if __name__ == "__main__":
    run()
