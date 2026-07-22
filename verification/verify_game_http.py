import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import (
    advance,
    capture_deterministic_screenshot,
    new_deterministic_page,
)
from server import CHROMIUM_ARGS, DistServer, report_failure


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            print(f"Navigating to {server.url}")

            try:
                page.goto(server.url)
                page.wait_for_selector("#gameCanvas")

                page.click("#startBtn")
                advance(page, 1000)

                capture_deterministic_screenshot(
                    page,
                    "verification/game_start_http.png",
                    timestamp=1_000_100,
                )

                page.mouse.click(640, 400)
                advance(page, 500)

                capture_deterministic_screenshot(
                    page,
                    "verification/game_spore_http.png",
                    timestamp=1_000_300,
                )

            except Exception as e:
                print(f"Error: {e}")
                failure_path = "verification/error_http.png"
                page.screenshot(path=failure_path)
                report_failure(failure_path)
                raise

            browser.close()


if __name__ == "__main__":
    run()
