import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from fixed_step import (
    capture_fixed_step_screenshot,
    new_fixed_step_page,
    open_game,
    reload_game,
    step,
)
from server import CHROMIUM_ARGS, DistServer


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_fixed_step_page(browser, viewport={"width": 1280, "height": 800})

            open_game(page, server.url)

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
            step(page, 200)

            saved = page.evaluate("localStorage.getItem('cave-crystals-save')")
            assert saved is not None
            assert '"reducedMotion":true' in saved
            assert '"colorBlindMode":true' in saved

            reload_game(page)
            reduced_checked = page.locator("#startScreen [data-setting='reducedMotion']").is_checked()
            color_checked = page.locator("#startScreen [data-setting='colorBlindMode']").is_checked()
            assert reduced_checked is True
            assert color_checked is True

            page.click("#startBtn")
            step(page, 800)

            initial_lane = page.evaluate("window.game.launcher.targetLane")
            page.keyboard.press("ArrowRight")
            step(page, 100)
            page.keyboard.press("Space")
            step(page, 500)

            after_lane = page.evaluate("window.game.launcher.targetLane")
            shots = page.evaluate("window.game.save.getStats().totalShots")
            motion_scale = page.evaluate("window.game.state.motionScale")

            assert after_lane >= initial_lane
            assert shots >= 1
            assert motion_scale == 0.2

            capture_fixed_step_screenshot(page, "verification/verify_settings.png")

            browser.close()


if __name__ == "__main__":
    run()
