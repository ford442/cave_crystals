from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173")

            # Wait for UI elements
            page.wait_for_selector("#uiLayer")
            page.wait_for_selector("#nextSporeContainer")

            # Get bounding box of nextSporeContainer
            next_spore = page.locator("#nextSporeContainer")
            box = next_spore.bounding_box()
            print(f"Next Spore Container position: x={box['x']}, y={box['y']}")

            # Get z-index
            ui_layer = page.locator("#uiLayer")
            z_index = ui_layer.evaluate("element => getComputedStyle(element).zIndex")
            print(f"UI Layer z-index: {z_index}")

            # Take screenshot
            page.screenshot(path="verification/ui_check.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_ui()
