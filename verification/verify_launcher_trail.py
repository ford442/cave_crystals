from playwright.sync_api import sync_playwright
import time

def verify_launcher_trail():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Open the game (using the verified port 5173)
        try:
            page.goto("http://localhost:5173")
        except Exception as e:
            print(f"Error connecting to game: {e}")
            return

        # Click Start
        page.click("#startBtn")
        time.sleep(1) # Wait for init

        # Force rapid movement to generate trail
        page.evaluate("""
            () => {
                // Teleport to lane 0 first
                window.game.launcher.setTargetLane(0);
                window.game.launcher.x = (0 * window.game.renderer.laneWidth) + (window.game.renderer.laneWidth / 2);

                // Now command move to lane 6
                window.game.launcher.setTargetLane(6);
            }
        """)

        # Wait a brief moment for the launcher to accelerate and spawn particles
        # Launcher lerp factor is 0.2, so it takes a few frames to pick up speed.
        time.sleep(0.15)

        # Take screenshot
        page.screenshot(path="verification/launcher_trail.png")
        print("Screenshot saved to verification/launcher_trail.png")

        browser.close()

if __name__ == "__main__":
    verify_launcher_trail()
