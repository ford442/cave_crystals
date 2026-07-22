import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import (
    advance,
    capture_deterministic_screenshot,
    new_deterministic_page,
)
from server import CHROMIUM_ARGS, DistServer


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            page.evaluate("""
                () => {
                    const reduced = document.querySelector('#startScreen [data-setting="reducedMotion"]');
                    const colorBlind = document.querySelector('#startScreen [data-setting="colorBlindMode"]');
                    const master = document.querySelector('#startScreen [data-audio="master"]');
                    for (const el of [reduced, colorBlind]) {
                        if (!el) continue;
                        el.checked = true;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (master) {
                        master.value = '42';
                        master.dispatchEvent(new Event('input', { bubbles: true }));
                        master.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            """)
            advance(page, 200)

            saved = page.evaluate("localStorage.getItem('cave-crystals-save')")
            assert saved is not None
            assert '"reducedMotion":true' in saved
            assert '"colorBlindMode":true' in saved

            page.reload()
            page.wait_for_selector("#gameCanvas")
            reduced_checked = page.locator("#startScreen [data-setting='reducedMotion']").is_checked()
            color_checked = page.locator("#startScreen [data-setting='colorBlindMode']").is_checked()
            assert reduced_checked is True
            assert color_checked is True

            page.click("#startBtn")
            advance(page, 800)

            initial_lane = page.evaluate("window.game.launcher.targetLane")
            page.keyboard.press("ArrowRight")
            advance(page, 100)
            page.keyboard.press("Space")
            advance(page, 500)

            after_lane = page.evaluate("window.game.launcher.targetLane")
            shots = page.evaluate("window.game.save.getStats().totalShots")
            motion_scale = page.evaluate("window.game.state.motionScale")

            assert after_lane >= initial_lane
            assert shots >= 1
            assert motion_scale == 0.2

            capture_deterministic_screenshot(
                page,
                "verification/verify_settings.png",
                timestamp=1_000_500,
            )

            browser.close()


if __name__ == "__main__":
    run()
