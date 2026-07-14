import os
import re
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

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            print("Clicking Start Button")
            page.click("#startBtn")
            time.sleep(1.0)

            print("Shooting spore...")
            page.mouse.click(640, 400)

            max_y = 0
            max_y_frame = 0
            screenshot_path = "verification/recoil_screenshot.png"

            for i in range(20):
                transform = page.evaluate(
                    "() => { const img = document.getElementById('backgroundImage'); return img ? img.style.transform : 'none'; }"
                )

                match = re.search(r"translate\(([^,]+)px,\s*([^,]+)px\)", transform)
                if match:
                    y_val = float(match.group(2))
                    if abs(y_val) > max_y:
                        max_y = abs(y_val)
                        max_y_frame = i
                        # Capture screenshot at peak shake (or as close as we can get)
                        page.screenshot(path=screenshot_path)

                time.sleep(0.01)

            report_screenshot(screenshot_path)
            print(f"Max Y translation detected: {max_y}")

            if max_y > 5:
                print("SUCCESS: Recoil shake detected!")
            else:
                print("FAIL: No significant recoil shake detected.")

            browser.close()


if __name__ == "__main__":
    run()
