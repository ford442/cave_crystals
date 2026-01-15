
import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Adjust URL to your local server
        await page.goto("http://localhost:5173")

        # Wait for game to load
        await page.wait_for_selector("#gameCanvas")

        # Click start
        await page.click("#startBtn")

        # Wait a bit for gameplay
        await asyncio.sleep(1)

        # Simulate a click to shoot
        await page.mouse.click(400, 400)

        await asyncio.sleep(0.5)

        # Take screenshot
        await page.screenshot(path="gameplay.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
