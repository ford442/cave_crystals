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

            await page.mouse.click(400, 400)

            await asyncio.sleep(0.5)

            screenshot_path = "verification/gameplay.png"
            await page.screenshot(path=screenshot_path)
            report_screenshot(screenshot_path)

            await browser.close()
    finally:
        server.stop()


if __name__ == "__main__":
    asyncio.run(run())
