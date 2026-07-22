"""WebGL post-FX stack: threshold bloom, chroma/vignette, grade/grain at high quality."""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import (
    advance,
    capture_deterministic_screenshot,
    new_deterministic_context,
)
from server import CHROMIUM_ARGS, DistServer

FORCE_WEBGL_INIT = "window.__FORCE_WEBGL_POSTFX__ = true;"

FORCE_HIGH_POSTFX_JS = """
() => {
    const g = window.game;
    g.setQualityMode('high');
    g.state.renderQuality = 'high';
}
"""

SETUP_SCENE_JS = """
() => {
    const g = window.game;
    g.state.criticalIntensity = 0.6;
    g.state.combo = 5;
    g.createShockwave(640, 400, '#4488FF');
    if (g.state.shockwaves[0]) {
        g.state.shockwaves[0].life = 1.0;
        g.state.shockwaves[0].radius = 120;
    }
}
"""

FORCE_CANVAS_INIT = """
window.__FORCE_CANVAS_POSTFX__ = true;
window.__FORCE_WEBGL_POSTFX__ = false;
"""

OUTPUT = os.path.join(os.path.dirname(__file__), "verify_webgl_postfx.png")


def _assert_webgl_backend(page) -> None:
    info = page.evaluate("""
        () => {
            const g = window.game;
            const canvas = document.getElementById('gameCanvas');
            const gl = canvas.getContext('webgl2');
            const profile = g.renderer.getQualityProfile('high');
            return {
                backend: g.renderer.postFxBackend,
                hasGl: !!gl,
                postFX: profile.postFX,
                bloom: profile.bloom,
            };
        }
    """)
    assert info["backend"] == "webgl2", f"expected webgl2 backend, got {info['backend']}"
    assert info["hasGl"], "gameCanvas should expose a WebGL2 context"
    assert info["postFX"] and info["bloom"], "high profile should enable postFX and bloom"


def _assert_canvas_fallback(page) -> None:
    backend = page.evaluate("() => window.game.renderer.postFxBackend")
    assert backend == "canvas2d", f"expected canvas2d fallback, got {backend}"


def run_fallback_assertion():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            context = new_deterministic_context(browser, viewport={"width": 1280, "height": 800})
            context.add_init_script(FORCE_CANVAS_INIT)
            page = context.new_page()
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            page.click("#startBtn")
            advance(page, 300)
            page.evaluate(FORCE_HIGH_POSTFX_JS)
            _assert_canvas_fallback(page)
            print("[pass] Canvas2D post-FX fallback OK")
            browser.close()


def run_webgl_capture():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            context = new_deterministic_context(browser, viewport={"width": 1280, "height": 800})
            context.add_init_script(FORCE_WEBGL_INIT)
            page = context.new_page()
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            page.click("#startBtn")
            advance(page, 500)
            page.evaluate(FORCE_HIGH_POSTFX_JS)
            page.evaluate(SETUP_SCENE_JS)

            if page.evaluate("() => !window.game.renderer.host.postFxGlReady"):
                print("[skip] WebGL2 not available in this environment; skipping WebGL capture")
                browser.close()
                return

            _assert_webgl_backend(page)
            capture_deterministic_screenshot(page, OUTPUT, timestamp=1_000_900)
            browser.close()


def run():
    run_fallback_assertion()
    run_webgl_capture()


if __name__ == "__main__":
    run()
