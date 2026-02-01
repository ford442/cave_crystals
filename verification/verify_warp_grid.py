from playwright.sync_api import sync_playwright
import time
import subprocess
import sys

def run():
    # Start server
    server_process = subprocess.Popen([sys.executable, "-m", "http.server", "8082", "--directory", "dist"])
    print("Server started on port 8082")
    time.sleep(2) # Wait for server

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            # Listen for console logs and errors
            page.on("console", lambda msg: print(f"Console: {msg.text}"))
            page.on("pageerror", lambda err: print(f"Page Error: {err}"))

            url = "http://localhost:8082"
            print(f"Navigating to {url}")
            page.goto(url)
            page.wait_for_selector("#gameCanvas")
            time.sleep(1)

            # Start Game
            page.click("#startBtn")
            time.sleep(1)

            # Inject Shockwave
            print("Injecting massive shockwave...")
            page.evaluate("""
                try {
                    window.game.createShockwave(640, 400, '#fff');
                    window.game.state.shockwaves[0].life = 1.0;
                    window.game.state.shockwaves[0].radius = 100;
                    console.log("Shockwave injected successfully");
                } catch (e) {
                    console.error("Error injecting shockwave:", e);
                }
            """)

            # Wait a brief moment for render
            time.sleep(0.5)

            # Check for errors by evaluating a simple math expression that relies on the loop running
            # If the loop crashed, window.game.state.active might still be true, but the frame count wouldn't increase?
            # Easier check: just ensure no Page Error was printed.

            # Take screenshot
            path = "verification/verify_warp_grid.png"
            page.screenshot(path=path)
            print(f"Screenshot saved to {path}")

            browser.close()
    finally:
        server_process.terminate()

if __name__ == "__main__":
    run()
