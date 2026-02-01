
from playwright.sync_api import sync_playwright
import time
import subprocess
import sys
import os

def run():
    # Start HTTP server
    port = 8082 # Use a different port to avoid conflicts
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

            url = f"http://localhost:{port}/index.html"
            print(f"Navigating to {url}")

            page.goto(url)
            page.wait_for_selector("#gameCanvas")

            # Start game
            print("Clicking Start Button")
            page.click("#startBtn")
            time.sleep(1.0)

            # Move mouse to different lanes to trigger targeting
            print("Aiming at lane 1...")
            # Lane width is roughly 1280 / 7 ~= 182
            # Lane 1 center ~= 270
            page.mouse.move(270, 400)
            time.sleep(0.5)
            page.screenshot(path="verification/targeting_lane_1.png")
            print("Captured verification/targeting_lane_1.png")

            print("Aiming at lane 3 (Middle)...")
            page.mouse.move(640, 400)
            time.sleep(0.5)
            page.screenshot(path="verification/targeting_lane_3.png")
            print("Captured verification/targeting_lane_3.png")

            browser.close()
    finally:
        print("Stopping server...")
        server.kill()

if __name__ == "__main__":
    run()
