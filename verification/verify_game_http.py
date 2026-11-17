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
from server import CHROMIUM_ARGS, DistServer, report_failure


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_fixed_step_page(browser, viewport={"width": 1280, "height": 800})

            print(f"Navigating to {server.url}")

            try:
                open_game(page, server.url)

                page.click("#startBtn")
                step(page, 1000)

                capture_fixed_step_screenshot(page, "verification/game_start_http.png")

                page.mouse.click(640, 400)
                step(page, 500)

                capture_fixed_step_screenshot(page, "verification/game_spore_http.png")

            except Exception as e:
                print(f"Error: {e}")
                failure_path = "verification/error_http.png"
                page.screenshot(path=failure_path)
                report_failure(failure_path)
                raise

            browser.close()


if __name__ == "__main__":
    run()
