
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

        # Wait for gameplay
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

        # Take screenshot of the explosion
        await page.screenshot(path="game_over_explosion.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
