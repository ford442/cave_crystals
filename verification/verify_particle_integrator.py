"""Programmatic assertions for particle integrator fallback ladder."""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import advance, new_deterministic_context
from server import CHROMIUM_ARGS, DistServer

FORCE_MAIN_INIT = """
window.__PARTICLE_WEBGPU__ = false;
window.__PARTICLE_WORKER__ = false;
"""

FORCE_WORKER_INIT = """
window.__PARTICLE_WEBGPU__ = false;
window.__PARTICLE_WORKER__ = true;
"""

FORCE_WEBGPU_INIT = """
window.__PARTICLE_WEBGPU__ = true;
window.__PARTICLE_WORKER__ = false;
"""

SETUP_SCENE_JS = """
() => {
    const g = window.game;
    g.setQualityMode('high');
    g.state.renderQuality = 'high';
    g.state.devPerfOverlay = true;
    for (let i = 0; i < 260; i++) {
        const lane = i % 5;
        g.createTrailParticle(
            lane * g.renderer.laneWidth + g.renderer.laneWidth * 0.5,
            g.renderer.height * 0.5,
            '#44AAFF'
        );
    }
}
"""


def _run_with_flags(init_script: str):
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            context = new_deterministic_context(browser, viewport={"width": 1280, "height": 800})
            context.add_init_script(init_script)
            page = context.new_page()
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            page.click("#startBtn")
            page.evaluate(SETUP_SCENE_JS)
            advance(page, 450)
            state = page.evaluate("""
                () => ({
                    path: window.game.state.perfMetrics.particleIntegratorPath,
                    hasWebGpu: !!navigator.gpu,
                })
            """)
            browser.close()
            return state


def run():
    main_state = _run_with_flags(FORCE_MAIN_INIT)
    assert main_state["path"] == "main", f"expected main path, got {main_state['path']}"
    print("[pass] forced main-thread fallback")

    worker_state = _run_with_flags(FORCE_WORKER_INIT)
    assert worker_state["path"] in ("worker", "main"), (
        f"expected worker/main path with WebGPU disabled, got {worker_state['path']}"
    )
    print(f"[pass] worker ladder path: {worker_state['path']}")

    webgpu_state = _run_with_flags(FORCE_WEBGPU_INIT)
    if webgpu_state["hasWebGpu"]:
        assert webgpu_state["path"] in ("webgpu", "main"), (
            f"expected webgpu/main path with worker disabled, got {webgpu_state['path']}"
        )
        print(f"[pass] WebGPU ladder path: {webgpu_state['path']}")
    else:
        assert webgpu_state["path"] == "main", (
            f"without WebGPU support fallback should be main, got {webgpu_state['path']}"
        )
        print("[skip] WebGPU unavailable; main-thread fallback confirmed")


if __name__ == "__main__":
    run()
