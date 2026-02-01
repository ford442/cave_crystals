from playwright.sync_api import sync_playwright
import time
import subprocess
import sys

def run():
    # Start HTTP server
    port = 8084 # Use a different port
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

            # Start game to initialize state
            print("Clicking Start Button")
            page.click("#startBtn")
            time.sleep(1.0)

            # Inject Critical State
            print("Injecting Critical State...")
            page.evaluate("() => { window.game.state.criticalIntensity = 1.0; }")

            # Wait for render (and pulse to be high)
            # Pulse is sin(time/200), so period is ~1200ms
            # We want pulse > 0.8
            # Just take a few screenshots
            time.sleep(0.5)

            # Take screenshot
            output_path = "verification/verify_critical_vignette.png"
            page.screenshot(path=output_path)
            print(f"Screenshot saved to {output_path}")

            browser.close()
    finally:
        print("Stopping server...")
        server.kill()

if __name__ == "__main__":
    run()
