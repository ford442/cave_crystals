
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a new context with a larger viewport
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        url = "http://localhost:8081"
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
            page.screenshot(path="verification/game_start_http.png")
            print("Screenshot saved to verification/game_start_http.png")

            # Simulate a click to shoot a spore
            # Center of the screen
            page.mouse.click(640, 400)

            # Wait for spore to grow
            time.sleep(0.5)

            # Take screenshot of spore
            page.screenshot(path="verification/game_spore_http.png")
            print("Screenshot saved to verification/game_spore_http.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_http.png")

        browser.close()

if __name__ == "__main__":
    run()
