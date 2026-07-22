import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import advance, new_deterministic_page
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def screenshot_tutorial(page, path: str) -> None:
    page.locator("#gameContainer").screenshot(path=path)
    report_screenshot(path)


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            page.evaluate("localStorage.removeItem('cave-crystals-save')")
            page.reload()
            page.wait_for_selector("#gameCanvas")

            page.click("#startBtn")
            advance(page, 600)

            assert page.evaluate("window.game.tutorial.isActive()") is True
            assert page.evaluate("window.game.tutorial.getStep()") == "aim"

            screenshot_tutorial(page, "verification/verify_tutorial_aim.png")

            lane_width = page.evaluate("window.game.renderer.laneWidth")
            page.mouse.move(lane_width * 0.5, 400)
            advance(page, 250)

            assert page.evaluate("window.game.tutorial.getStep()") == "match"

            page.evaluate(
                """
                () => {
                    const g = window.game;
                    const lane = g.launcher.targetLane;
                    const pair = g.state.laneMap.get(lane);
                    const color = 0;
                    g.state.nextSporeColorIdx = color;
                    if (pair?.top) {
                        pair.top.colorIdx = color;
                        pair.top.height = 360;
                        pair.top.hasSpawned = true;
                    }
                    if (pair?.bottom) {
                        pair.bottom.colorIdx = color;
                        pair.bottom.height = 360;
                        pair.bottom.hasSpawned = true;
                    }
                    g.updateUI();
                }
            """
            )
            page.keyboard.press("Space")
            advance(page, 1200)

            assert page.evaluate("window.game.tutorial.getStep()") == "mismatch"
            screenshot_tutorial(page, "verification/verify_tutorial_match.png")

            page.evaluate(
                """
                () => {
                    const g = window.game;
                    const lane = g.launcher.targetLane;
                    const pair = g.state.laneMap.get(lane);
                    const crystalColor = pair?.top?.colorIdx ?? 0;
                    g.state.nextSporeColorIdx = (crystalColor + 1) % 3;
                    if (pair?.top) pair.top.height = 360;
                    if (pair?.bottom) pair.bottom.height = 360;
                    g.updateUI();
                }
            """
            )
            page.keyboard.press("Space")
            advance(page, 1200)

            assert page.evaluate("window.game.tutorial.getStep()") == "hints"
            screenshot_tutorial(page, "verification/verify_tutorial_mismatch.png")

            page.check("#tutorialDismissForever")
            page.click("#tutorialSkipBtn")
            advance(page, 200)

            assert page.evaluate("window.game.tutorial.isActive()") is False

            saved = page.evaluate("localStorage.getItem('cave-crystals-save')")
            assert saved is not None
            assert '"tutorialCompleted":true' in saved
            assert '"showTutorial":false' in saved

            page.reload()
            page.wait_for_selector("#gameCanvas")
            page.click("#startBtn")
            advance(page, 600)
            assert page.evaluate("window.game.tutorial.isActive()") is False

            page.evaluate(
                """
                () => {
                    const cb = document.querySelector('#startScreen [data-setting="showTutorial"]');
                    if (!cb) return;
                    cb.checked = true;
                    cb.dispatchEvent(new Event('input', { bubbles: true }));
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            """
            )
            page.reload()
            page.wait_for_selector("#gameCanvas")
            page.click("#startBtn")
            advance(page, 600)
            assert page.evaluate("window.game.tutorial.isActive()") is True

            browser.close()


if __name__ == "__main__":
    run()
