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

            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            try:
                page.goto(server.url)
                page.wait_for_selector("#gameCanvas")

                page.wait_for_function("() => window.game !== undefined")

                page.click("#startBtn")
                time.sleep(1)

                initial_scale = page.evaluate("window.game.state.timeScale")
                print(f"Initial Time Scale: {initial_scale}")
                if abs(initial_scale - 1.0) > 0.01:
                    raise Exception(f"Expected initial timeScale 1.0, got {initial_scale}")

                print("Triggering Level Up...")
                page.evaluate("window.game.triggerLevelUp()")

                time.sleep(1.0)

                slow_scale = page.evaluate("window.game.state.timeScale")
                print(f"Slow Motion Scale: {slow_scale}")

                screenshot_path = "verification/slow_mo.png"
                page.screenshot(path=screenshot_path)
                report_screenshot(screenshot_path)

                if slow_scale > 0.5:
                    raise Exception(f"Expected slow motion timeScale < 0.5, got {slow_scale}")

                print("Time Dilation verified successfully!")

                print("Waiting for recovery...")
                time.sleep(2.5)  # Timer is 2.0s

                recovered_scale = page.evaluate("window.game.state.timeScale")
                print(f"Recovered Scale: {recovered_scale}")

                if abs(recovered_scale - 1.0) > 0.1:
                    raise Exception(f"Expected recovered timeScale ~1.0, got {recovered_scale}")

                print("Recovery verified!")

            except Exception as e:
                print(f"Error: {e}")
                failure_path = "verification/error_time_dilation.png"
                page.screenshot(path=failure_path)
                report_failure(failure_path)
                raise e

            browser.close()


if __name__ == "__main__":
    run()
