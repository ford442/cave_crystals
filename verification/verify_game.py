
from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a new context with a larger viewport
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Navigate to the file directly
        # Ensure we use absolute path
        cwd = os.getcwd()
        url = f"file://{cwd}/dist/index.html"
        print(f"Navigating to {url}")

        try:
            page.goto(url)
            # Wait for canvas to be present
            page.wait_for_selector("#gameCanvas")

            # Click start button
            page.click("#startBtn")

            # Wait a bit for game to start
            time.sleep(1)

            # Take screenshot of initial state
            page.screenshot(path="verification/game_start.png")
            print("Screenshot saved to verification/game_start.png")

            # Simulate a click to shoot a spore
            # Center of the screen
            page.mouse.click(640, 400)

            # Wait for spore to grow
            time.sleep(0.5)

            # Take screenshot of spore
            page.screenshot(path="verification/game_spore.png")
            print("Screenshot saved to verification/game_spore.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    run()
