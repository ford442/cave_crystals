from playwright.sync_api import sync_playwright
import time

def verify_spore_trail():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the game (served locally)
        page.goto("http://localhost:8080")

        # Wait for game to load
        page.wait_for_selector("#gameCanvas")

        # Click start button
        page.click("#startBtn")

        # Wait a moment for game to start
        time.sleep(1)

        # Simulate shooting a spore
        # Mouse click in the middle of the screen
        page.mouse.click(400, 400)

        # Wait a brief moment for the spore to travel and generate a trail
        time.sleep(0.5)

        # Take a screenshot
        screenshot_path = "verification/spore_trail.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_spore_trail()
