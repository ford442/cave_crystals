from playwright.sync_api import sync_playwright
import time
import os
import subprocess
import sys

def run():
    # Start server
    server_process = subprocess.Popen([sys.executable, "-m", "http.server", "8081", "--directory", "dist"])
    print("Server started on port 8081")
    time.sleep(2) # Wait for server

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            # Listen for console logs
            page.on("console", lambda msg: print(f"Console: {msg.text}"))

            url = "http://localhost:8081"
            print(f"Navigating to {url}")

            page.goto(url)
            page.wait_for_selector("#gameCanvas")

            # Wait for WASM to load (check console or just wait)
            time.sleep(1)

            page.click("#startBtn")
            time.sleep(1)

            # Check initial score
            initial_score = page.evaluate("window.game.state.score")
            print(f"Initial Score: {initial_score}")

            # Verify soulParticles array exists
            has_array = page.evaluate("Array.isArray(window.game.state.soulParticles)")
            print(f"Has soulParticles array: {has_array}")
            assert has_array == True

            # Attempt to spawn a soul particle via a hack or shot
            # Shoot multiple times to ensure we hit something
            page.mouse.click(64, 400) # Lane 0
            time.sleep(0.5)
            page.mouse.click(200, 400) # Lane 1
            time.sleep(0.5)
            page.mouse.click(350, 400) # Lane 2

            time.sleep(2)

            # Check if game is still active
            active = page.evaluate("window.game.state.active")
            print(f"Game Active: {active}")

            soul_len = page.evaluate("window.game.state.soulParticles.length")
            print(f"Soul Particles count (snapshot): {soul_len}")

            # Take screenshot
            page.screenshot(path="verification/verify_juice.png")
            print("Screenshot saved to verification/verify_juice.png")

            browser.close()
    finally:
        server_process.terminate()

if __name__ == "__main__":
    run()
