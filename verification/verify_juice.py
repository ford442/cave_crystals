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
            page_errors = []

            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.on("console", lambda msg: print(f"Console: {msg.text}"))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            advance(page, 1000)

            page.click("#startBtn")
            advance(page, 1000)

            audio_ready = page.evaluate("""
                () => window.SoundManager
                    && window.SoundManager.ctx
                    && window.SoundManager.ctx.state !== 'closed'
            """)
            print(f"Audio context ready: {audio_ready}")
            assert audio_ready is True

            page.evaluate("""
                () => {
                    const checkbox = document.querySelector('[data-setting="reducedMotion"]');
                    if (checkbox) checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            """)
            page.reload()
            page.wait_for_selector("#gameCanvas")
            advance(page, 500)

            reduced_motion = page.evaluate("window.game.state.reducedMotion === true")
            print(f"Reduced motion persisted: {reduced_motion}")
            assert reduced_motion is True

            has_save = page.evaluate("""
                () => localStorage.getItem('cave-crystals-save') !== null
            """)
            print(f"Unified save blob present: {has_save}")
            assert has_save is True

            page.click("#startBtn")
            advance(page, 500)

            spores_before = page.evaluate("window.game.state.spores.length")
            page.keyboard.press("ArrowRight")
            page.keyboard.press("Space")
            advance(page, 500)
            spores_after = page.evaluate("window.game.state.spores.length")
            print(f"Keyboard spores: {spores_before} -> {spores_after}")
            assert spores_after > spores_before

            initial_score = page.evaluate("window.game.state.score")
            print(f"Initial Score: {initial_score}")

            has_array = page.evaluate("Array.isArray(window.game.state.soulParticles)")
            print(f"Has soulParticles array: {has_array}")
            assert has_array == True

            page.mouse.click(64, 400)  # Lane 0
            advance(page, 500)
            page.mouse.click(200, 400)  # Lane 1
            advance(page, 500)
            page.mouse.click(350, 400)  # Lane 2

            advance(page, 8000)

            active = page.evaluate("window.game.state.active")
            print(f"Game Active: {active}")
            assert active is True

            crystals_ok = page.evaluate("""
                () => window.game.state.crystals.length > 0
                    && window.game.state.crystals.every((c) => c.height > 0)
            """)
            print(f"Crystals still rendering: {crystals_ok}")
            assert crystals_ok is True

            print(f"Page errors after start: {page_errors}")
            assert page_errors == []

            soul_len = page.evaluate("window.game.state.soulParticles.length")
            print(f"Soul Particles count (snapshot): {soul_len}")

            capture_deterministic_screenshot(page, "verification/verify_juice.png")

            browser.close()


if __name__ == "__main__":
    run()
