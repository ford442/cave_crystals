import os
import time
from playwright.sync_api import sync_playwright

def verify_floating_text():
    # Get absolute path to index.html (assuming we are in verification/..)
    # We need to serve the dist folder or just index.html if it works with modules
    # Since this is a module based game, we might need a server, but let's try opening the file first
    # If file:// doesn't work due to CORS/Modules, we use the already running dev server if available
    # The previous instruction mentioned "Confirm dev server runs on port 5173"

    url = "http://localhost:5173"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        print(f"Navigating to {url}...")
        try:
            page.goto(url)
        except Exception as e:
            print(f"Error connecting to {url}: {e}")
            print("Please ensure the dev server is running.")
            return

        # Wait for game to load
        page.wait_for_selector("#gameCanvas")

        # Click start
        page.click("#startBtn")
        time.sleep(0.5)

        # Inject a floating text manually via console
        print("Injecting floating text...")
        page.evaluate("""
            window.game.createFloatingText(window.game.renderer.width / 2, window.game.renderer.height / 2, 'JUICY!', '#FF00FF', 3.0);
            window.game.createFloatingText(window.game.renderer.width / 2 + 100, window.game.renderer.height / 2 - 50, '+500', '#00FF00', 2.0);
        """)

        # Wait a few frames for it to render
        time.sleep(0.1)

        # Take screenshot
        screenshot_path = "verification/floating_text.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_floating_text()
