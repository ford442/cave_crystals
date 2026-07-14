import asyncio
import os
import sys

from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_screenshot


async def run():
    server = DistServer().start()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = await browser.new_page()

            await page.goto(server.url)

            await page.wait_for_selector("#gameCanvas")

            await page.click("#startBtn")

            await asyncio.sleep(1)

            # Force Game Over and Trigger Explosion
            await page.evaluate("""
                if (window.game) {
                     // Force a crystal to collide with opposite
                     window.game.state.crystals[0].height = window.game.renderer.height;
                     window.game.state.crystals[1].height = window.game.renderer.height;
                }
            """)

            # Wait a split second for the loop to catch it and trigger explosion
            await asyncio.sleep(0.2)

            screenshot_path = "verification/game_over_explosion.png"
            await page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            await browser.close()
    finally:
        server.stop()


if __name__ == "__main__":
    asyncio.run(run())
