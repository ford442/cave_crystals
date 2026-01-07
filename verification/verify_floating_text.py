from playwright.sync_api import sync_playwright
import time
import os

def test_floating_text():
    # Use the served URL from a previous tool call or assume localhost if running locally
    # Since I cannot run a server in the background and keep it running easily across steps,
    # I will rely on 'npm run dev' if I could, but I'll use the build output and open file directly if possible.
    # However, file:// doesn't support modules well.
    # I'll try to use a simple http server in python.

    # Start a simple HTTP server in background
    import subprocess
    import sys

    # Kill any existing server on 8080
    os.system("fuser -k 8080/tcp || true")

    server_process = subprocess.Popen([sys.executable, "-m", "http.server", "8080", "--directory", "dist"])
    time.sleep(2) # Wait for server to start

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            print("Navigating to game...")
            page.goto("http://localhost:8080")

            # Wait for start button and click
            page.wait_for_selector("#startBtn")
            page.click("#startBtn")

            # Wait a bit for game to start
            time.sleep(1)

            # Simulate clicks to shoot spores
            # We want to match, but it's random. So let's just spam a few shots.
            # Center of screen (approx lane 3)
            cw = 800 # default width
            ch = 600

            # Click in the middle
            page.mouse.click(400, 300)
            time.sleep(0.5)
            page.mouse.click(400, 300)
            time.sleep(0.5)
            page.mouse.click(400, 300)
            time.sleep(1.0) # Wait for impact

            # Take screenshot
            screenshot_path = os.path.abspath("verification/floating_text.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

    finally:
        server_process.terminate()

if __name__ == "__main__":
    test_floating_text()
