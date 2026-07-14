import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, report_failure, report_screenshot

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        # Create a new context with a larger viewport
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Navigate to the file directly (no server needed for this test)
        cwd = os.getcwd()
        url = f"file://{cwd}/dist/index.html"
        print(f"Navigating to {url}")

        try:
            page.goto(url)
            # Wait for canvas to be present
            page.wait_for_selector("#gameCanvas")

            # Click start button
            page.click("#startBtn")

            # Wait a bit for game to start
            time.sleep(1)

            # Take screenshot of initial state
            screenshot_path = "verification/game_start.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            # Simulate a click to shoot a spore
            # Center of the screen
            page.mouse.click(640, 400)

            # Wait for spore to grow
            time.sleep(0.5)

            # Take screenshot of spore
            screenshot_path = "verification/game_spore.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

        except Exception as e:
            print(f"Error: {e}")
            failure_path = "verification/error.png"
            page.screenshot(path=failure_path)
            report_failure(failure_path)

        browser.close()

if __name__ == "__main__":
    run()
