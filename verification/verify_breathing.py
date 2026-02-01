from playwright.sync_api import sync_playwright
import time
import subprocess
import sys

def run():
    # Start HTTP server
    port = 8085
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
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            url = f"http://localhost:{port}/index.html"
            print(f"Navigating to {url}")

            page.goto(url)
            page.wait_for_selector("#gameCanvas")

            print("Clicking Start Button")
            page.click("#startBtn")

            # Wait for game to initialize and crystals to spawn
            print("Waiting for crystals to spawn and stabilize...")
            time.sleep(2.0)

            print("Polling crystal scaleX...")
            scales = []
            for i in range(10):
                # Check scaleX of the first crystal
                scale = page.evaluate("() => { return window.game.state.crystals.length > 0 ? window.game.state.crystals[0].scaleX : null; }")
                if scale is not None:
                    scales.append(scale)
                time.sleep(0.1)

            print(f"Collected scales: {scales}")

            if not scales:
                print("Error: No crystals found!")
                sys.exit(1)

            # Check if scales are varying
            min_scale = min(scales)
            max_scale = max(scales)

            print(f"Min Scale: {min_scale}, Max Scale: {max_scale}")

            diff = max_scale - min_scale
            if diff < 0.0001:
                print("FAILURE: Crystal scale is static!")
                sys.exit(1)

            if max_scale < 0.1:
                print("FAILURE: Crystal scale is stuck near 0!")
                sys.exit(1)

            print("SUCCESS: Crystal scale is varying (Breathing effect active).")

            # Screenshot
            page.screenshot(path="verification/breathing_crystals.png")
            print("Screenshot saved to verification/breathing_crystals.png")

            browser.close()
    finally:
        print("Stopping server...")
        server.kill()

if __name__ == "__main__":
    run()
