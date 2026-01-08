from playwright.sync_api import sync_playwright

def verify_game_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the game
        page.goto("http://localhost:8080")

        # Wait for the canvas to be visible
        page.wait_for_selector("#gameCanvas")

        # Click Start Button
        page.click("#startBtn")

        # Wait a bit for game to start
        page.wait_for_timeout(1000)

        # Simulate Mouse Move to center
        page.mouse.move(400, 300)
        page.wait_for_timeout(100)

        # Simulate Click (shoot)
        page.mouse.click(400, 300)

        # Wait a bit for recoil/particles
        page.wait_for_timeout(100)

        # Take screenshot
        page.screenshot(path="verification/game_shot.png")

        browser.close()

if __name__ == "__main__":
    verify_game_ui()
