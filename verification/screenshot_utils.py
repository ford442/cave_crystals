"""Helpers for deterministic Playwright screenshots in visual regression tests."""
from __future__ import annotations

import time
from pathlib import Path

from server import report_screenshot

# Fixed timestamp keeps sin/cos-driven VFX (vignette pulse, crystal breathe) stable.
DEFAULT_SNAPSHOT_TIMESTAMP = 1_000_000

DETERMINISTIC_RNG_INIT = """
(() => {
    let seed = 0xC0FFEE42;
    Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
})();
"""

FREEZE_PATCH_JS = """
() => {
    const g = window.game;
    if (!g || g.__visualSnapshotReady) return;
    const runtimeLoop = g.loop.bind(g);
    g.loop = function loop(timestamp) {
        if (g.__snapshotTs != null) {
            g.state.shake = 0;
            g.state.kickY = 0;
            g.state.shakeOffset = { x: 0, y: 0 };
            g.renderer.draw(g.state, g.launcher, g.__snapshotTs);
            requestAnimationFrame(g._boundLoop);
            return;
        }
        return runtimeLoop(timestamp);
    };
    g.__visualSnapshotReady = true;
}
"""

SET_SNAPSHOT_JS = """
(ts) => {
    const g = window.game;
    if (!g) return;
    for (const key of [
        'particles', 'soulParticles', 'energyRings', 'floatingTexts',
        'shockwaves', 'envParticles', 'dustParticles', 'trailParticles'
    ]) {
        if (Array.isArray(g.state[key])) g.state[key].length = 0;
    }
    g.__snapshotTs = ts;
    g.state.paused = true;
    g.state.timeScale = 0;
    g.state.targetTimeScale = 0;
    g.state.sleepTimer = 0;
}
"""

CLEAR_SNAPSHOT_JS = """
() => {
    const g = window.game;
    if (!g) return;
    g.__snapshotTs = null;
    g.state.paused = false;
}
"""


def new_deterministic_context(browser, viewport=None):
    """Browser context with a seeded Math.random for reproducible captures."""
    kwargs = {"device_scale_factor": 1}
    if viewport is not None:
        kwargs["viewport"] = viewport
    context = browser.new_context(**kwargs)
    context.add_init_script(DETERMINISTIC_RNG_INIT)
    return context


def new_deterministic_page(browser, viewport=None):
    """Page with seeded RNG for reproducible captures."""
    return new_deterministic_context(browser, viewport).new_page()


def advance(page, milliseconds: int) -> None:
    """Advance wall-clock time while the game loop runs."""
    if milliseconds <= 0:
        return
    time.sleep(milliseconds / 1000)


def freeze_visual_loop(page) -> None:
    page.evaluate(FREEZE_PATCH_JS)


def capture_deterministic_screenshot(
    page,
    path: str | Path,
    *,
    timestamp: int = DEFAULT_SNAPSHOT_TIMESTAMP,
    settle_ms: int = 150,
) -> None:
    """Freeze animation at a fixed timestamp, then capture the game canvas."""
    freeze_visual_loop(page)
    page.evaluate(SET_SNAPSHOT_JS, timestamp)
    page.wait_for_timeout(settle_ms)
    page.evaluate(
        "(ts) => { const g = window.game; if (g) g.renderer.draw(g.state, g.launcher, ts); }",
        timestamp,
    )
    page.wait_for_timeout(50)
    page.locator("#gameCanvas").screenshot(path=str(path))
    report_screenshot(str(path))
    page.evaluate(CLEAR_SNAPSHOT_JS)
