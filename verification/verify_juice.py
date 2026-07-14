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

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            time.sleep(1)

            page.click("#startBtn")
            time.sleep(1)

            initial_score = page.evaluate("window.game.state.score")
            print(f"Initial Score: {initial_score}")

            has_array = page.evaluate("Array.isArray(window.game.state.soulParticles)")
            print(f"Has soulParticles array: {has_array}")
            assert has_array == True

            page.mouse.click(64, 400)  # Lane 0
            time.sleep(0.5)
            page.mouse.click(200, 400)  # Lane 1
            time.sleep(0.5)
            page.mouse.click(350, 400)  # Lane 2

            time.sleep(2)

            active = page.evaluate("window.game.state.active")
            print(f"Game Active: {active}")

            soul_len = page.evaluate("window.game.state.soulParticles.length")
            print(f"Soul Particles count (snapshot): {soul_len}")

            screenshot_path = "verification/verify_juice.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    run()
