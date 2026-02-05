from playwright.sync_api import sync_playwright
import time
import subprocess
import sys

def run():
    # Start HTTP server
    port = 8086 # Increment port again
    print(f"Starting HTTP server on port {port}...")
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--directory", "dist"],
                              stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL)

    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})

            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
            page.on("pageerror", lambda msg: print(f"Browser error: {msg}"))

            url = f"http://localhost:{port}/index.html"
            print(f"Navigating to {url}")
            page.goto(url)
            page.wait_for_selector("#gameCanvas")

            page.click("#startBtn")
            time.sleep(1.0)

            # Debug: Inspect game object
            print("Inspecting window.game...")
            proto_props = page.evaluate("() => Object.getOwnPropertyNames(Object.getPrototypeOf(window.game))")
            print(f"Game prototype properties: {proto_props}")

            # Setup State
            print("Setting up game state...")
            page.evaluate("""() => {
                if (window.game.state.crystals.length > 2) {
                     window.game.state.crystals = window.game.state.crystals.slice(0, 2);
                }
                const c1 = window.game.state.crystals[0];
                const c2 = window.game.state.crystals[1];
                c1.colorIdx = 0;
                c2.colorIdx = 0;
                c1.velScaleY = 0;
                c2.velScaleY = 0;
                c1.flash = 0;
                c2.flash = 0;
            }""")

            time.sleep(0.5)

            initial_vel = page.evaluate("() => window.game.state.crystals[1].velScaleY")
            print(f"Initial velScaleY: {initial_vel}")

            print("Triggering Resonance...")
            # Try to find the method name if mangled, or assume it's there
            try:
                page.evaluate("() => window.game.triggerResonance('#FF0055')")
            except Exception as e:
                print(f"Call failed: {e}")
                # Try iterating prototype to find it? No, that's guessing.
                # If it failed, we can't test it this way.
                # We will assert failure but maybe we can check if it worked anyway (if the call actually happened but threw?? No)

            new_vel = page.evaluate("() => window.game.state.crystals[1].velScaleY")
            print(f"Post-Resonance velScaleY: {new_vel}")

            if new_vel > 0.1:
                print("SUCCESS: Resonance triggered jump!")
            else:
                print("FAILURE: Resonance did not trigger significant jump.")
                sys.exit(1)

            # Take visual proof screenshot
            page.screenshot(path="verification/resonance_screenshot.png")
            print("Screenshot saved to verification/resonance_screenshot.png")

            browser.close()
    finally:
        server.kill()

if __name__ == "__main__":
    run()
