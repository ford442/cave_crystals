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

            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            page.click("#startBtn")
            time.sleep(1.0)

            print("Inspecting window.game...")
            proto_props = page.evaluate("() => Object.getOwnPropertyNames(Object.getPrototypeOf(window.game))")
            print(f"Game prototype properties: {proto_props}")

            print("Setting up game state...")
            page.evaluate("""() => {
                if (window.game.state.crystals.length > 2) {
                     window.game.state.crystals = window.game.state.crystals.slice(0, 2);
                }
                const c1 = window.game.state.crystals[0];
                const c2 = window.game.state.crystals[1];
                c1.colorIdx = 0;
                c2.colorIdx = 0;
                c1.velScaleY = 0;
                c2.velScaleY = 0;
                c1.flash = 0;
                c2.flash = 0;
            }""")

            time.sleep(0.5)

            initial_vel = page.evaluate("() => window.game.state.crystals[1].velScaleY")
            print(f"Initial velScaleY: {initial_vel}")

            print("Triggering Resonance...")
            try:
                page.evaluate("() => window.game.triggerResonance('#FF0055')")
            except Exception as e:
                print(f"Call failed: {e}")

            new_vel = page.evaluate("() => window.game.state.crystals[1].velScaleY")
            print(f"Post-Resonance velScaleY: {new_vel}")

            if new_vel > 0.1:
                print("SUCCESS: Resonance triggered jump!")
            else:
                print("FAILURE: Resonance did not trigger significant jump.")
                sys.exit(1)

            screenshot_path = "verification/resonance_screenshot.png"
            page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            browser.close()


if __name__ == "__main__":
    run()
