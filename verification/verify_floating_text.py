import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def verify_floating_text():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_page()

            print(f"Navigating to {server.url}...")
            page.goto(server.url)

            page.wait_for_selector("#gameCanvas")

            page.click("#startBtn")
            time.sleep(0.5)

            print("Injecting floating text...")
            page.evaluate("""
                window.game.createFloatingText(window.game.renderer.width / 2, window.game.renderer.height / 2, 'JUICY!', '#FF00FF', 3.0);
                window.game.createFloatingText(window.game.renderer.width / 2 + 100, window.game.renderer.height / 2 - 50, '+500', '#00FF00', 2.0);
            """)

            time.sleep(0.1)

            screenshot_path = "verification/floating_text.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    verify_floating_text()
