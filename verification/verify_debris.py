
from playwright.sync_api import sync_playwright
import time
import subprocess
import sys

def run():
    # Start HTTP server
    port = 8082
    print(f"Starting HTTP server on port {port}...")
    # Serve the 'dist' directory where the build artifacts are
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
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            url = f"http://localhost:{port}/index.html"
            print(f"Navigating to {url}")

            page.goto(url)
            page.wait_for_selector("#gameCanvas")

            # Start game to initialize state
            print("Clicking Start Button")
            page.click("#startBtn")
            time.sleep(1.0)

            # Inject Debris
            print("Injecting Debris Particles...")
            page.evaluate("() => { window.game.createDebris(640, 400, '#00FF66', 20); }")

            # Step one frame to let them render?
            # The game loop runs on RAF, so we just wait a tiny bit.
            time.sleep(0.1)

            # Take screenshot
            output_path = "verification/debris_screenshot.png"
            page.screenshot(path=output_path)
            print(f"Screenshot saved to {output_path}")

            browser.close()
    finally:
        print("Stopping server...")
        server.kill()

if __name__ == "__main__":
    run()
