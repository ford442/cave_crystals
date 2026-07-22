"""
Verify explicit Canvas 2D context attributes and sample frame pacing at high quality.

Run from repo root: python3 verification/verify_canvas_context.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer


def run():
    print("verify_canvas_context: starting")
    with DistServer() as server:
        print(f"verify_canvas_context: server at {server.url}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
            page.set_default_timeout(15000)

            print(f"Navigating to {server.url}")
            page.goto(server.url, wait_until="domcontentloaded")
            page.wait_for_selector("#gameCanvas", timeout=10000)
            page.click("#startBtn")
            page.evaluate("window.game.setQualityMode('high')")

            attrs = page.evaluate("""
                () => {
                    const host = window.game.renderer.host;
                    const main = host.ctx.getContextAttributes();
                    const bloom = host._bloomCtx.getContextAttributes();
                    const grain = host._grainCtx.getContextAttributes();
                    return {
                        main,
                        bloom,
                        grain,
                        desyncActive: host._desynchronizedActive,
                    };
                }
            """)

            print(f"Main context attributes: {attrs['main']}")
            print(f"Bloom context attributes: {attrs['bloom']}")
            print(f"Grain context attributes: {attrs['grain']}")
            print(f"RendererHost._desynchronizedActive: {attrs['desyncActive']}")

            assert attrs["main"]["alpha"] is False, "main canvas should use alpha: false"
            assert attrs["main"]["willReadFrequently"] is False, "main canvas should not read back frequently"
            assert isinstance(attrs["main"]["desynchronized"], bool), "desynchronized should be a boolean"
            assert attrs["bloom"]["alpha"] is True, "bloom buffer should use alpha: true"
            assert attrs["bloom"]["willReadFrequently"] is False, "bloom buffer should be draw-only"
            assert attrs["grain"]["alpha"] is True, "grain buffer should use alpha: true"
            assert attrs["grain"]["willReadFrequently"] is True, "grain buffer should use CPU-backed bitmap"

            # Sample frame pacing while the active game loop runs.
            page.wait_for_timeout(2000)
            frame_ms = page.evaluate("window.game.state.perfMetrics.smoothedFrameMs")
            print(f"Sampled smoothedFrameMs after gameplay: {frame_ms:.2f}ms")

            assert frame_ms == frame_ms and frame_ms > 0, "smoothedFrameMs should be a positive finite number"
            assert frame_ms < 200, f"smoothedFrameMs sanity check failed: {frame_ms}ms"

            browser.close()
            print("verify_canvas_context: PASS")


if __name__ == "__main__":
    run()
