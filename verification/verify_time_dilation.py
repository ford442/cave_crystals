from playwright.sync_api import sync_playwright
import time
import os
import subprocess
import sys

def run():
    # Start local server
    port = 8082
    server_process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", "dist"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    print(f"Started HTTP server on port {port}")
    time.sleep(2) # Give it a moment to start

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            url = f"http://localhost:{port}/index.html"
            print(f"Navigating to {url}")

            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            try:
                page.goto(url)
                page.wait_for_selector("#gameCanvas")

                # Wait for game instance to be attached to window
                page.wait_for_function("() => window.game !== undefined")

                page.click("#startBtn")
                time.sleep(1)

                # Initial state check
                initial_scale = page.evaluate("window.game.state.timeScale")
                print(f"Initial Time Scale: {initial_scale}")
                if abs(initial_scale - 1.0) > 0.01:
                    raise Exception(f"Expected initial timeScale 1.0, got {initial_scale}")

                # Trigger Level Up (Should set scale to 0.05)
                print("Triggering Level Up...")
                page.evaluate("window.game.triggerLevelUp()")

                # Wait a frame or two for update loop to run lerp
                time.sleep(1.0)

                slow_scale = page.evaluate("window.game.state.timeScale")
                print(f"Slow Motion Scale: {slow_scale}")

                page.screenshot(path="verification/slow_mo.png")
                print("Screenshot saved to verification/slow_mo.png")

                # Should be significantly reduced. Target is 0.05.
                if slow_scale > 0.5:
                    raise Exception(f"Expected slow motion timeScale < 0.5, got {slow_scale}")

                print("Time Dilation verified successfully!")

                # Wait for recovery
                print("Waiting for recovery...")
                time.sleep(2.5) # Timer is 2.0s

                recovered_scale = page.evaluate("window.game.state.timeScale")
                print(f"Recovered Scale: {recovered_scale}")

                if abs(recovered_scale - 1.0) > 0.1:
                    raise Exception(f"Expected recovered timeScale ~1.0, got {recovered_scale}")

                print("Recovery verified!")

            except Exception as e:
                print(f"Error: {e}")
                page.screenshot(path="verification/error_time_dilation.png")
                raise e

            browser.close()
    finally:
        server_process.terminate()
        print("Server stopped")

if __name__ == "__main__":
    run()
