
from playwright.sync_api import sync_playwright
import time
import os
import re
import subprocess
import sys
import threading

def run():
    # Start HTTP server
    port = 8081
    print(f"Starting HTTP server on port {port}...")
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--directory", "dist"],
                              stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL)

    # Give it a moment to start
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})

            # Capture logs
            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

            url = f"http://localhost:{port}/index.html"
            print(f"Navigating to {url}")

            page.goto(url)
            page.wait_for_selector("#gameCanvas")

            # Start game
            print("Clicking Start Button")
            page.click("#startBtn")
            time.sleep(1.0)

            # Shoot!
            print("Shooting spore...")
            page.mouse.click(640, 400)

            # Check transform immediately
            max_y = 0
            max_y_frame = 0

            for i in range(20):
                transform = page.evaluate("() => { const img = document.getElementById('backgroundImage'); return img ? img.style.transform : 'none'; }")

                match = re.search(r"translate\(([^,]+)px,\s*([^,]+)px\)", transform)
                if match:
                    y_val = float(match.group(2))
                    if abs(y_val) > max_y:
                        max_y = abs(y_val)
                        max_y_frame = i
                        # Capture screenshot at peak shake (or as close as we can get)
                        page.screenshot(path="verification/recoil_screenshot.png")

                time.sleep(0.01)

            print(f"Max Y translation detected: {max_y}")

            if max_y > 5:
                print("SUCCESS: Recoil shake detected!")
            else:
                print("FAIL: No significant recoil shake detected.")

            browser.close()
    finally:
        print("Stopping server...")
        server.kill()

if __name__ == "__main__":
    run()
