"""
Verify centralized render-backend policy: WebGL2 actually engages at high quality, adaptive
quality changes swap the display canvas cleanly, and a forced WebGL2 context loss/restore
cycle falls back to Canvas2D and recovers automatically. Assertions only, no screenshots.

The loss/restore/quality-switch sequence below runs inside a *single* page.evaluate() call.
That's deliberate, not just tidy: driving it as separate Playwright round-trips (evaluate,
wait_for_timeout, evaluate, ...) while the game's own rAF loop keeps rendering concurrently
was observed to destabilize this sandbox's software WebGL implementation (multi-second stalls,
occasional renderer crashes) even though the underlying game logic behaved correctly. Doing the
whole sequence as one in-page async function sidesteps that CDP/render-loop interaction.

Run from repo root: python3 verification/verify_backend_recovery.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer

GET_DIAGNOSTICS_JS = """
() => {
    const canvas = document.getElementById('gameCanvas');
    return {
        backend: window.game.renderer.postFxBackend,
        diagnostics: window.game.renderer.getBackendDiagnostics(),
        canvasId: canvas.id,
        canvasIsRendererCanvas: canvas === window.game.canvas,
    };
}
"""

SET_HIGH_QUALITY_JS = "() => { window.game.setQualityMode('high'); window.game.state.renderQuality = 'high'; }"

RECOVERY_SEQUENCE_JS = """
async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const snapshot = () => {
        const canvas = document.getElementById('gameCanvas');
        return {
            backend: window.game.renderer.postFxBackend,
            diagnostics: window.game.renderer.getBackendDiagnostics(),
            canvasId: canvas.id,
            canvasIsRendererCanvas: canvas === window.game.canvas,
        };
    };

    const gl = window.game.renderer.host.postFxGl;
    const ext = gl ? gl.getExtension('WEBGL_lose_context') : null;
    if (!ext) {
        return { lossSupported: false };
    }

    ext.loseContext();
    await wait(300);
    const afterLoss = snapshot();

    ext.restoreContext();
    await wait(300);
    const afterRestore = snapshot();

    window.game.setQualityMode('medium');
    window.game.state.renderQuality = 'medium';
    await wait(300);
    const afterMedium = snapshot();

    window.game.setQualityMode('high');
    window.game.state.renderQuality = 'high';
    await wait(300);
    const afterHighAgain = snapshot();

    return { lossSupported: true, afterLoss, afterRestore, afterMedium, afterHighAgain };
}
"""


def run():
    print("verify_backend_recovery: starting")
    page_errors = []
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
            page.set_default_timeout(15000)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            page.goto(server.url, wait_until="domcontentloaded")
            page.wait_for_selector("#gameCanvas")
            page.click("#startBtn")

            initial = page.evaluate(GET_DIAGNOSTICS_JS)
            print(f"Initial diagnostics: {initial['diagnostics']}")
            assert isinstance(initial["diagnostics"]["webgpuSupported"], bool), (
                "webgpuSupported diagnostic should always be a boolean"
            )
            assert initial["canvasId"] == "gameCanvas", "display canvas id must be stable"
            assert initial["canvasIsRendererCanvas"], "game.canvas must track the live renderer canvas"

            page.evaluate(SET_HIGH_QUALITY_JS)
            page.wait_for_timeout(300)
            high = page.evaluate(GET_DIAGNOSTICS_JS)
            print(f"High-quality diagnostics: {high['diagnostics']}")

            if not high["diagnostics"]["webgl2Supported"]:
                print("[skip] WebGL2 not available in this environment; skipping backend-engagement assertions")
                browser.close()
                return

            assert high["backend"] == "webgl2", f"expected webgl2 backend at high quality, got {high['backend']}"
            assert high["diagnostics"]["display"] == "webgl2"
            assert not high["diagnostics"]["webgl2ContextLost"]
            assert high["canvasId"] == "gameCanvas", "swapping backends must preserve the canvas id"
            assert high["canvasIsRendererCanvas"], "game.canvas must track the post-swap canvas element"
            direct_gl = page.evaluate("() => !!document.getElementById('gameCanvas').getContext('webgl2')")
            assert direct_gl, "gameCanvas should expose a live WebGL2 context once bound"
            print("[pass] WebGL2 backend actually engages on the display canvas")

            # Forced context loss/restore, then a quality-driven Canvas2D<->WebGL2 round trip —
            # see the module docstring for why this runs as one consolidated evaluate() call.
            result = page.evaluate(RECOVERY_SEQUENCE_JS)

            if not result["lossSupported"]:
                print("[skip] WEBGL_lose_context unavailable; skipping loss/restore assertions")
                browser.close()
                return

            after_loss = result["afterLoss"]
            print(f"Post-loss diagnostics: {after_loss['diagnostics']}")
            assert after_loss["diagnostics"]["webgl2ContextLost"], "loss should be reflected in diagnostics"
            assert after_loss["backend"] == "canvas2d", "frame backend should fall back while GL is lost"
            assert after_loss["canvasId"] == "gameCanvas", "a transient loss must not swap the canvas"

            after_restore = result["afterRestore"]
            print(f"Post-restore diagnostics: {after_restore['diagnostics']}")
            assert not after_restore["diagnostics"]["webgl2ContextLost"], "restore should clear the lost flag"
            assert after_restore["backend"] == "webgl2", "backend should resume WebGL2 after restore"
            print("[pass] WebGL2 context loss falls back and restore recovers automatically")

            after_medium = result["afterMedium"]
            print(f"Medium-quality diagnostics: {after_medium['diagnostics']}")
            assert after_medium["backend"] == "canvas2d", "medium quality should not use the WebGL2 backend"
            assert after_medium["canvasId"] == "gameCanvas"
            assert after_medium["canvasIsRendererCanvas"]

            after_high_again = result["afterHighAgain"]
            assert after_high_again["backend"] == "webgl2", "raising quality again should rebind WebGL2 cleanly"
            print("[pass] Canvas2D <-> WebGL2 quality-driven switching round-trips cleanly, even after a real loss/restore cycle")

            assert not page_errors, f"unexpected page errors during backend switching: {page_errors}"

            browser.close()
            print("verify_backend_recovery: PASS")


if __name__ == "__main__":
    run()
