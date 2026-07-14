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
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            time.sleep(1)

            page.click("#startBtn")
            time.sleep(1)

            print("Injecting massive shockwave...")
            page.evaluate("""
                try {
                    window.game.createShockwave(640, 400, '#fff');
                    window.game.state.shockwaves[0].life = 1.0;
                    window.game.state.shockwaves[0].radius = 100;
                    console.log("Shockwave injected successfully");
                } catch (e) {
                    console.error("Error injecting shockwave:", e);
                }
            """)

            time.sleep(0.5)

            screenshot_path = "verification/verify_warp_grid.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    run()
